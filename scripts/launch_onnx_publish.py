"""Start the GPU job that publishes the shared FastVLM ONNX repo."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "fieldwork-train/1.0"


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
    with urllib.request.urlopen(req, timeout=120) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"upload {resp.status}")


def hf_request(url: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method="POST" if body is not None else "GET",
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


def main() -> int:
    env = load_env()
    hf_token = env.get("HF_TOKEN", "")
    namespace = env.get("HF_NAMESPACE", "")
    storage = env.get("STORAGE_SECRET") or env.get("TRAIN_WEBHOOK_SECRET") or ""
    upload = env.get("STORAGE_UPLOAD_URL", "").rstrip("/")
    if not hf_token or not namespace or not storage or not upload:
        print("HF_TOKEN, HF_NAMESPACE, STORAGE_SECRET, STORAGE_UPLOAD_URL required", file=sys.stderr)
        return 2

    version = "onnx-" + time.strftime("%Y-%m-%dT%H-%M-%SZ", time.gmtime())
    script = (ROOT / "scripts" / "export_browser_onnx.py").read_bytes()
    script_path = f"training-data/global-bootstrap/{version}/export_browser_onnx.py"
    put_blob(f"{upload}/{script_path}", script, "text/x-python", storage)
    script_url = env.get("STORAGE_PUBLIC_BASE", "").rstrip("/") + "/files/" + script_path
    print("[launch] script uploaded")

    fetch = (
        "python3 -c \"import urllib.request,os,sys;"
        "req=urllib.request.Request(os.environ[sys.argv[1]],"
        "headers={'User-Agent':'fieldwork-train/1.0'});"
        "open(sys.argv[2],'wb').write(urllib.request.urlopen(req, timeout=300).read())\""
    )
    command = " && ".join(
        [
            "set -e",
            "mkdir -p /tmp/fw && cd /tmp/fw",
            f"{fetch} EXPORT_SCRIPT_URL export_browser_onnx.py",
            "python3 -m pip uninstall -y onnxruntime-gpu || true",
            "python3 -m pip install -q 'peft==0.21.2' 'transformers==4.48.3' "
            "optimum onnx 'onnxruntime==1.21.0' onnxscript safetensors huggingface_hub timm "
            "onnx-graphsurgeon tqdm 'onnxconverter-common>=1.14.0'",
            "python3 -c \"import onnxruntime; print('[export] onnxruntime', onnxruntime.__version__)\"",
            "python3 export_browser_onnx.py",
        ]
    )
    job = {
        "dockerImage": "huggingface/transformers-pytorch-gpu:latest",
        "command": ["bash", "-c", command],
        "flavor": env.get("HF_JOB_FLAVOR") or "l4x1",
        "timeoutSeconds": 5400,
        "environment": {
            "EXPORT_SCRIPT_URL": script_url,
            "ONNX_REPO_ID": f"{namespace}/fieldwork-fastvlm-0.5b-onnx",
            "ONNX_VERSION": version,
            "ADAPTER_BASE_URL": env.get("STORAGE_PUBLIC_BASE", "").rstrip("/")
            + "/files/adapters/global/latest/",
            "STORAGE_UPLOAD_URL": upload,
            "STORAGE_PUBLIC_BASE": env.get("STORAGE_PUBLIC_BASE", ""),
            "HF_HOME": "/tmp/hf",
        },
        "secrets": {
            "HF_TOKEN": hf_token,
            "STORAGE_SECRET": storage,
        },
        "labels": {"name": "fieldwork-onnx-publish"},
    }
    result = hf_request(f"https://huggingface.co/api/jobs/{namespace}", hf_token, job)
    job_id = result.get("id") or (result.get("job") or {}).get("id")
    if not job_id:
        print(f"missing job id: {json.dumps(result)[:500]}", file=sys.stderr)
        return 1
    print(f"[launch] job {job_id}")
    print(f"[launch] https://huggingface.co/jobs/{namespace}/{job_id}")
    print(version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
