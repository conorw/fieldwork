"""Schema + pipeline smoke tests.

Heavy GPU deps (torch/peft) are optional — those cases skip when missing.
Run from repo root:
  python -m unittest training.tests.test_schema_and_pipeline -v
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.schema import (  # noqa: E402
    MIN_TRAINING_EXAMPLES,
    REASONING_PROMPT,
    DatesTarget,
    PersonTarget,
    ReasoningTarget,
    SharedTarget,
    parse_payload,
    target_to_json,
)
from training.webhook import notify_failure, notify_success  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample_payload.json"

try:
    import torch  # noqa: F401

    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

try:
    from PIL import Image  # noqa: F401

    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class SchemaTests(unittest.TestCase):
    def test_min_examples_matches_product_gate(self):
        self.assertEqual(MIN_TRAINING_EXAMPLES, 15)

    def test_parse_fixture_payload(self):
        payload = parse_payload(FIXTURE.read_text(encoding="utf-8"))
        self.assertTrue(payload.locationId)
        self.assertIn("/api/train-headstone-webhook", payload.webhookUrl)
        self.assertGreaterEqual(len(payload.examples), 1)
        ex = payload.examples[0]
        self.assertIn("imageUrl", ex)
        self.assertIn("people", ex["target"])
        self.assertIn("position", ex["target"]["people"][0])
        self.assertIn("evidence", ex["target"]["people"][0])

    def test_reasoning_target_json_roundtrip(self):
        target = ReasoningTarget(
            people=[
                PersonTarget(
                    full_name="Jane Example",
                    role_on_stone="primary",
                    position="left",
                    evidence="left column",
                    dates=DatesTarget(birth="1920", death="1998", aged=78),
                    relationships=["wife of John"],
                )
            ],
            shared=SharedTarget(surname="Example", epitaph="RIP"),
        )
        data = json.loads(target_to_json(target))
        self.assertEqual(data["people"][0]["position"], "left")
        self.assertEqual(data["shared"]["surname"], "Example")

    def test_reasoning_prompt_asks_for_layout(self):
        self.assertIn("layout", REASONING_PROMPT.lower())
        self.assertIn("json", REASONING_PROMPT.lower())

    def test_ts_and_py_min_gate_aligned(self):
        """Mirror of src/types/headstoneTraining.ts MIN_TRAINING_EXAMPLES."""
        ts_types = ROOT / "src" / "types" / "headstoneTraining.ts"
        text = ts_types.read_text(encoding="utf-8")
        self.assertIn("MIN_TRAINING_EXAMPLES = 15", text)
        self.assertEqual(MIN_TRAINING_EXAMPLES, 15)


class WebhookContractTests(unittest.TestCase):
    def test_notify_success_posts_expected_body(self):
        class FakeResp:
            status = 200

            def read(self):
                return b'{"ok":true}'

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        captured: dict = {}

        def fake_urlopen(req, timeout=60):
            captured["body"] = json.loads(req.data.decode())
            captured["url"] = req.full_url
            return FakeResp()

        with patch("urllib.request.urlopen", fake_urlopen):
            notify_success(
                "https://app.example.com/api/train-headstone-webhook",
                location_id="loc-1",
                adapter_url="https://blob/adapters/loc-1/v1/",
                adapter_version="v1",
                export_mode="onnx",
                job_id="job-1",
            )
        self.assertEqual(captured["body"]["status"], "success")
        self.assertEqual(captured["body"]["locationId"], "loc-1")
        self.assertEqual(captured["body"]["exportMode"], "onnx")

    def test_notify_failure_posts_error(self):
        class FakeResp:
            status = 200

            def read(self):
                return b'{"ok":true}'

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        captured: dict = {}

        def fake_urlopen(req, timeout=60):
            captured["body"] = json.loads(req.data.decode())
            return FakeResp()

        with patch("urllib.request.urlopen", fake_urlopen):
            notify_failure(
                "https://app.example.com/api/train-headstone-webhook",
                location_id="loc-1",
                error="boom",
                job_id="job-1",
            )
        self.assertEqual(captured["body"]["status"], "failure")
        self.assertEqual(captured["body"]["error"], "boom")


@unittest.skipUnless(HAS_PIL, "Pillow not installed")
class DatasetSmokeTests(unittest.TestCase):
    def test_build_dataset_jsonl(self):
        from PIL import Image
        from training.dataset import build_dataset_dir, load_jsonl

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            img = tmp_path / "stone.png"
            Image.new("RGB", (64, 64), color=(120, 120, 120)).save(img)

            def fake_download(url: str, dest: Path, timeout: int = 60) -> Path:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(img, dest)
                return dest

            examples = [
                {
                    "imageUrl": "https://example.com/stone.png",
                    "stoneType": "single",
                    "target": {
                        "people": [
                            {
                                "full_name": "A",
                                "role_on_stone": "primary",
                                "position": "center",
                                "dates": {},
                                "relationships": [],
                                "evidence": "center",
                            }
                        ],
                        "shared": {},
                    },
                }
            ]
            with patch("training.dataset.download_image", fake_download):
                out = build_dataset_dir("loc-1", examples, tmp_path / "data")
            rows = load_jsonl(out / "train.jsonl")
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["stone_type"], "single")
            self.assertTrue(Path(rows[0]["image"]).exists())
            self.assertIn("people", json.loads(rows[0]["response"]))


@unittest.skipUnless(HAS_TORCH, "torch not installed")
class BundleAndRunJobTests(unittest.TestCase):
    def test_prepare_upload_bundle_manifest(self):
        from training.export_onnx import prepare_upload_bundle

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter = root / "adapter"
            merged = root / "merged"
            adapter.mkdir()
            merged.mkdir()
            (adapter / "adapter_config.json").write_text("{}")
            (merged / "config.json").write_text("{}")

            result = prepare_upload_bundle(root, adapter, merged, None)
            self.assertEqual(result["export_mode"], "merged_hf")
            manifest = json.loads(
                (result["bundle_dir"] / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["dtypes"]["vision_encoder"], "q4")

    def test_run_job_dry_run_with_mocks(self):
        from training.run_job import main

        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            payload_path = Path(tmp) / "payload.json"
            payload_path.write_text(json.dumps(payload), encoding="utf-8")
            bundle = Path(tmp) / "bundle"
            bundle.mkdir()

            with patch("training.run_job.build_dataset_dir") as build, patch(
                "training.run_job.train_lora"
            ) as train, patch("training.run_job.merge_lora") as merge, patch(
                "training.run_job.export_onnx"
            ) as export, patch(
                "training.run_job.prepare_upload_bundle"
            ) as prep:
                build.return_value = Path(tmp) / "data"
                train.return_value = Path(tmp) / "adapter"
                merge.return_value = Path(tmp) / "merged"
                export.return_value = None
                prep.return_value = {
                    "bundle_dir": bundle,
                    "export_mode": "merged_hf",
                    "manifest": {},
                }

                code = main(
                    [
                        "--payload",
                        str(payload_path),
                        "--skip-upload",
                        "--skip-onnx",
                        "--work-dir",
                        tmp,
                    ]
                )
                self.assertEqual(code, 0)
                train.assert_called_once()


if __name__ == "__main__":
    unittest.main()
