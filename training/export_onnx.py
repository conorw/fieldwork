"""
Merge LoRA into FastVLM and export artifacts for the PWA.

Export policy (from plan):
1. Always save PEFT adapter (small).
2. Merge LoRA into base and save Hugging Face weights.
3. Attempt Transformers.js-oriented ONNX export (fp16 / q4).
   If ONNX export fails, still upload merged HF + adapter and report
   export_mode in the webhook so the client knows which path to use.

Transformers.js today loads ONNX (onnx-community/FastVLM-0.5B-ONNX),
not PEFT adapters — so merged ONNX is the production artifact when export works.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from peft import PeftModel
from transformers import AutoProcessor

from .schema import BASE_MODEL_ID


def _load_base_model(base_model: str):
    import torch
    from transformers import AutoModelForCausalLM

    try:
        from transformers import AutoModelForImageTextToText
    except ImportError:
        AutoModelForImageTextToText = None  # type: ignore

    kwargs = dict(
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    if AutoModelForImageTextToText is not None:
        try:
            return AutoModelForImageTextToText.from_pretrained(base_model, **kwargs)
        except Exception as e:
            print(f"[export] AutoModelForImageTextToText failed ({e}); trying CausalLM")
    return AutoModelForCausalLM.from_pretrained(base_model, **kwargs)


def merge_lora(
    adapter_dir: Path,
    output_dir: Path,
    *,
    base_model: str = BASE_MODEL_ID,
) -> Path:
    print(f"[export] merging LoRA from {adapter_dir}")
    processor = AutoProcessor.from_pretrained(adapter_dir, trust_remote_code=True)
    base = _load_base_model(base_model)
    model = PeftModel.from_pretrained(base, str(adapter_dir))
    merged = model.merge_and_unload()

    merged_dir = output_dir / "merged"
    merged_dir.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(merged_dir))
    processor.save_pretrained(str(merged_dir))
    print(f"[export] merged model at {merged_dir}")
    return merged_dir


def export_onnx(
    merged_dir: Path,
    output_dir: Path,
) -> Path | None:
    """
    Best-effort ONNX export for Transformers.js.
    FastVLM export paths evolve; failures are non-fatal for the job.
    """
    onnx_dir = output_dir / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Prefer optimum if available
        from optimum.exporters.onnx import main_export

        print("[export] exporting ONNX via optimum...")
        main_export(
            model_name_or_path=str(merged_dir),
            output=str(onnx_dir),
            task="image-text-to-text",
            trust_remote_code=True,
            opset=17,
        )
        # Write dtype hint for the PWA worker (matches llmWorker.ts)
        (onnx_dir / "fieldwork_dtypes.json").write_text(
            json.dumps(
                {
                    "embed_tokens": "fp16",
                    "vision_encoder": "q4",
                    "decoder_model_merged": "q4",
                    "note": "Quantize further with onnxruntime / transformers.js tooling if needed",
                },
                indent=2,
            )
        )
        print(f"[export] ONNX written to {onnx_dir}")
        return onnx_dir
    except Exception as e:
        print(f"[export] ONNX export failed (will upload merged HF instead): {e}")
        # Leave a marker so upload knows
        (onnx_dir / "EXPORT_FAILED.txt").write_text(str(e))
        return None


def prepare_upload_bundle(
    output_dir: Path,
    adapter_dir: Path,
    merged_dir: Path,
    onnx_dir: Path | None,
) -> dict[str, Any]:
    """
    Assemble bundle/ with:
      - adapter/ (always)
      - merged/ (always)
      - onnx/ (if export succeeded)
      - manifest.json
    """
    bundle = output_dir / "bundle"
    if bundle.exists():
        shutil.rmtree(bundle)
    bundle.mkdir(parents=True)

    shutil.copytree(adapter_dir, bundle / "adapter")
    shutil.copytree(merged_dir, bundle / "merged")

    export_mode = "merged_hf"
    if onnx_dir and any(onnx_dir.glob("*.onnx")):
        shutil.copytree(onnx_dir, bundle / "onnx")
        export_mode = "onnx"

    manifest = {
        "base_model": BASE_MODEL_ID,
        "export_mode": export_mode,
        "worker_model_hint": "onnx-community/FastVLM-0.5B-ONNX",
        "dtypes": {
            "embed_tokens": "fp16",
            "vision_encoder": "q4",
            "decoder_model_merged": "q4",
        },
    }
    (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return {"bundle_dir": bundle, "export_mode": export_mode, "manifest": manifest}
