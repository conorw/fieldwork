#!/usr/bin/env python3
"""Publish a shared on-device model trained on the Commons label file."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "fieldwork-train/1.0"

FINISH_WEBHOOK = r"""import json, os, sys, urllib.request
fail = len(sys.argv) > 1 and sys.argv[1] == "fail"
secret = os.environ.get("TRAIN_WEBHOOK_SECRET", "")
url = os.environ["TRAIN_WEBHOOK_URL"]
version = os.environ.get("ONNX_VERSION", "onnx")
adapter = os.environ.get("GLOBAL_ADAPTER_PUBLIC_URL", "").rstrip("/") + "/"
job_id = os.environ.get("HF_JOB_ID") or os.environ.get("JOB_ID")
if fail:
    body = {
        "status": "failure",
        "locationId": os.environ["TEACHER_LOCATION_ID"],
        "error": "On-device model publish failed",
        "jobId": job_id,
    }
else:
    body = {
        "status": "success",
        "locationId": os.environ["TEACHER_LOCATION_ID"],
        "adapterUrl": adapter,
        "adapterVersion": version,
        "exportMode": "onnx",
        "jobId": job_id,
        "globalAdapterUrl": adapter,
        "globalAdapterVersion": version,
    }
data = json.dumps(body).encode()
req = urllib.request.Request(
    url,
    data=data,
    method="POST",
    headers={
        "Content-Type": "application/json",
        "User-Agent": "fieldwork-train/1.0",
        "x-train-webhook-secret": secret,
        "Authorization": "Bearer " + secret,
    },
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print("[teacher] webhook", resp.status, resp.read()[:300])
except Exception as exc:
    print("[teacher] webhook failed", exc)
"""

COMMAND = r"""set -e
git clone --depth 1 --branch "$TRAIN_REPO_REF" "$TRAIN_REPO_URL" /tmp/fieldwork || git clone --depth 1 "$TRAIN_REPO_URL" /tmp/fieldwork
cd /tmp/fieldwork
mkdir -p /tmp/fw
python3 << 'PY'
import os, urllib.request
from pathlib import Path
base = os.environ["OVERLAY_BASE_URL"].rstrip("/") + "/"
root = Path("/tmp/fieldwork")
for rel in os.environ["OVERLAY_FILES"].split(","):
    rel = rel.strip()
    if not rel:
        continue
    dest = root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(base + rel, headers={"User-Agent": "fieldwork-train/1.0"})
    dest.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    print("[overlay]", rel, dest.stat().st_size)
PY
pip install -q -r training/requirements.txt
python3 -c "import os,urllib.request; req=urllib.request.Request(os.environ['TRAIN_PAYLOAD_URL'], headers={'User-Agent':'fieldwork-train/1.0'}); open('/tmp/fw/payload.json','wb').write(urllib.request.urlopen(req, timeout=300).read())"
export BROWSER_ONNX_AFTER=1
export TRAIN_REQUIRE_ONNX=0
python3 -m training.run_job --payload /tmp/fw/payload.json --min-examples "$MIN_EXAMPLES"
cp scripts/export_browser_onnx.py /tmp/fw/export_browser_onnx.py
cp scripts/finish_onnx_webhook.py /tmp/fw/finish_onnx_webhook.py
export ADAPTER_BASE_URL="$(python3 -c 'print(open("/tmp/fw/adapter_base_url.txt", encoding="utf-8").read().strip())')"
(python3 -m pip uninstall -y onnxruntime-gpu || true)
python3 -m pip install -q 'peft==0.21.2' 'transformers==4.48.3' optimum onnx 'onnxruntime==1.21.0' onnxscript safetensors huggingface_hub timm onnx-graphsurgeon tqdm 'onnxconverter-common>=1.14.0'
python3 /tmp/fw/export_browser_onnx.py || { python3 /tmp/fw/finish_onnx_webhook.py fail; exit 1; }
python3 /tmp/fw/finish_onnx_webhook.py
"""


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"')
    return env


def put_blob(url: str, data: bytes, content_type: str, token: str) -> None:
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "User-Agent": UA,
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"upload {resp.status}")


def hf_request(url: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"HF API {exc.code}: {detail[:800]}") from exc


def examples_from_labels(path: Path, limit: int) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if not row.get("imageUrl") or not row.get("target"):
            continue
        target = json.loads(json.dumps(row["target"]))
        for person in target.get("people") or []:
            dates = person.get("dates") or {}
            aged = dates.get("aged")
            if not isinstance(aged, (int, float)) or aged <= 0:
                dates["aged"] = None
            person["dates"] = dates
        rows.append(
            {
                "imageUrl": row["imageUrl"],
                "stoneType": row.get("stoneType") or "unknown",
                "target": target,
            }
        )
        if len(rows) >= limit:
            break
    return rows


def overlay_files() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for path in sorted((ROOT / "training").glob("*.py")):
        files[f"training/{path.name}"] = path.read_bytes()
    requirements = ROOT / "training" / "requirements.txt"
    files["training/requirements.txt"] = requirements.read_bytes()
    files["scripts/export_browser_onnx.py"] = (
        ROOT / "scripts" / "export_browser_onnx.py"
    ).read_bytes()
    files["scripts/finish_onnx_webhook.py"] = FINISH_WEBHOOK.encode()
    return files


def launch(labels_path: Path, min_examples: int = 50) -> str:
    env = load_env()
    token = env.get("HF_TOKEN", "")
    namespace = env.get("HF_NAMESPACE", "")
    storage = env.get("STORAGE_SECRET") or env.get("TRAIN_WEBHOOK_SECRET") or ""
    upload = env.get("STORAGE_UPLOAD_URL", "").rstrip("/")
    public = env.get("STORAGE_PUBLIC_BASE", "").rstrip("/")
    if not token or not namespace or not storage or not upload or not public:
        raise RuntimeError("HF and storage credentials are required")

    examples = examples_from_labels(labels_path, min_examples)
    if len(examples) < 50:
        raise RuntimeError(f"only {len(examples)} labeled images")

    stamp = time.strftime("%Y-%m-%dT%H-%M-%SZ", time.gmtime())
    version = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    prefix = f"training-data/commons-1k/{stamp}"
    payload = {
        "locationId": "global-commons",
        "version": version,
        "examples": examples,
        "webhookUrl": f"{public}/api/train-headstone-webhook",
        "baseAdapterUrl": f"{public}/files/adapters/global/latest/",
    }
    payload_key = f"{prefix}/payload.json"
    put_blob(
        f"{upload}/{payload_key}",
        json.dumps(payload).encode(),
        "application/json",
        storage,
    )
    files = overlay_files()
    for rel, data in files.items():
        kind = "text/x-python" if rel.endswith(".py") else "text/plain"
        put_blob(f"{upload}/{prefix}/{rel}", data, kind, storage)
    print(f"[train] staged {len(examples)} examples and {len(files)} source files")

    repo = f"{namespace}/fieldwork-fastvlm-0.5b-onnx"
    job = {
        "dockerImage": "huggingface/transformers-pytorch-gpu:latest",
        "command": ["bash", "-c", COMMAND],
        "flavor": env.get("HF_JOB_FLAVOR") or "l4x1",
        "timeoutSeconds": 14400,
        "environment": {
            "TRAIN_REPO_URL": env.get("TRAIN_REPO_URL")
            or "https://github.com/conorw/fieldwork.git",
            "TRAIN_REPO_REF": env.get("TRAIN_REPO_REF")
            or "feature/cemetery-train-orchestrator",
            "TRAIN_PAYLOAD_URL": f"{public}/files/{payload_key}",
            "OVERLAY_BASE_URL": f"{public}/files/{prefix}/",
            "OVERLAY_FILES": ",".join(files),
            "MIN_EXAMPLES": str(len(examples)),
            "TRAIN_NUM_EPOCHS": "1",
            "BROWSER_ONNX_AFTER": "1",
            "TRAIN_REQUIRE_ONNX": "0",
            "ONNX_VERSION": f"onnx-commons-{stamp}",
            "ONNX_REPO_ID": repo,
            "GLOBAL_ADAPTER_PUBLIC_URL": f"{public}/files/adapters/global/latest/",
            "TRAIN_WEBHOOK_URL": f"{public}/api/train-headstone-webhook",
            "TEACHER_LOCATION_ID": "global-commons",
            "STORAGE_UPLOAD_URL": upload,
            "STORAGE_PUBLIC_BASE": public,
            "HF_HOME": "/tmp/hf",
            "ADAPTER_BASE_URL": f"{public}/files/adapters/global/latest/",
        },
        "secrets": {
            "HF_TOKEN": token,
            "STORAGE_SECRET": storage,
            "TRAIN_WEBHOOK_SECRET": env.get("TRAIN_WEBHOOK_SECRET") or storage,
        },
        "labels": {"name": "fieldwork-commons-1k"},
    }
    result = hf_request(f"https://huggingface.co/api/jobs/{namespace}", token, job)
    job_id = result.get("id") or (result.get("job") or {}).get("id")
    print(f"[train] job {job_id} examples={len(examples)}")
    return str(job_id or "")


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "training/samples/commons-1k/labels.jsonl"
    if not path.is_absolute():
        path = ROOT / path
    launch(path, min_examples=1000)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
