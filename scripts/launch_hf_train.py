#!/usr/bin/env python3
"""
Launch a FastVLM-0.5B LoRA training job on Hugging Face Jobs using the
locally labeled sample set (training/samples/{curated,synthetic}).

Why not `git clone` in the job? The local training/ package is ahead of
origin, and we avoid pushing. Instead this script:
  1. Uploads sample images to Cloudflare R2 (public /files URLs for the job)
  2. Builds TRAIN_PAYLOAD_JSON and uploads payload.json to Blob
  3. Tars the local training/ package and uploads it to Blob
  4. Creates an HF Job that downloads code + payload and runs training.run_job

Usage:
  python scripts/launch_hf_train.py            # launch
  python scripts/launch_hf_train.py --dry-run  # build + upload, print job body, don't launch
  python scripts/launch_hf_train.py --status JOB_ID
  python scripts/launch_hf_train.py --logs JOB_ID

Secrets are read from .env and never printed.
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import sys
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "training" / "samples"

LOCATION_ID = "global-bootstrap"
WEBHOOK_URL = "https://fieldwork.conorw.workers.dev/api/train-headstone-webhook"
DOCKER_IMAGE = "huggingface/transformers-pytorch-gpu:latest"
DEFAULT_FLAVOR = "l4x1"
TIMEOUT_SECONDS = 5400


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_path = ROOT / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def put_blob(pathname: str, data: bytes, content_type: str, token: str, upload_base: str) -> str:
    req = urllib.request.Request(
        f"{upload_base.rstrip('/')}/{pathname}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "User-Agent": "fieldwork-train/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        payload = json.loads(resp.read().decode())
        url = payload.get("url")
        if not url:
            raise RuntimeError(f"Storage upload returned no url for {pathname}")
        return url


def build_examples(token: str, version: str, upload_base: str) -> list[dict]:
    examples: list[dict] = []
    for sub in ("curated", "synthetic"):
        man = SAMPLES / sub / "manifest.json"
        if not man.exists():
            continue
        for entry in json.loads(man.read_text(encoding="utf-8")):
            img = ROOT / entry["path"]
            if not img.exists():
                print(f"[launch] skip missing image {entry['path']}")
                continue
            ct = mimetypes.guess_type(img.name)[0] or "image/jpeg"
            blob_path = f"training-data/{LOCATION_ID}/{version}/{sub}/{img.name}"
            url = put_blob(blob_path, img.read_bytes(), ct, token, upload_base)
            examples.append(
                {
                    "imageUrl": url,
                    "stoneType": entry.get("stone_type", "unknown"),
                    "target": entry["target"],
                }
            )
            print(f"[launch] image {sub}/{img.name} uploaded")
    return examples


def build_code_tarball() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        train_dir = ROOT / "training"
        for path in sorted(train_dir.glob("*.py")):
            tar.add(path, arcname=f"training/{path.name}")
        tar.add(train_dir / "requirements.txt", arcname="training/requirements.txt")
    return buf.getvalue()


def hf_request(url: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method="POST" if body is not None else "GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"HF API {e.code} for {url}: {detail[:1000]}") from e


def hf_logs(namespace: str, job_id: str, token: str) -> str:
    req = urllib.request.Request(
        f"https://huggingface.co/api/jobs/{namespace}/{job_id}/logs",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return f"(logs unavailable: {e.code} {e.read().decode(errors='replace')[:300]})"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--status", type=str, help="Job id to check")
    parser.add_argument("--logs", type=str, help="Job id to fetch logs for")
    parser.add_argument("--flavor", type=str, default=None)
    args = parser.parse_args()

    env = load_env()
    hf_token = env.get("HF_TOKEN", "")
    namespace = env.get("HF_NAMESPACE", "")
    blob_token = env.get("STORAGE_SECRET") or env.get("TRAIN_WEBHOOK_SECRET") or ""
    upload_base = env.get("STORAGE_UPLOAD_URL", "")
    public_base = env.get("STORAGE_PUBLIC_BASE", "")
    if not hf_token or not namespace:
        print("HF_TOKEN and HF_NAMESPACE required in .env", file=sys.stderr)
        return 2
    if not blob_token or not upload_base:
        print("STORAGE_SECRET and STORAGE_UPLOAD_URL required in .env", file=sys.stderr)
        return 2

    if args.status:
        status = hf_request(
            f"https://huggingface.co/api/jobs/{namespace}/{args.status}", hf_token
        )
        redacted = {
            k: v
            for k, v in status.items()
            if k not in ("environment", "secrets", "command", "arguments")
        }
        print(json.dumps(redacted, indent=2, default=str))
        return 0

    if args.logs:
        print(hf_logs(namespace, args.logs, hf_token))
        return 0

    version = time.strftime("%Y-%m-%dT%H-%M-%SZ", time.gmtime())
    print(f"[launch] version {version}")

    examples = build_examples(blob_token, version, upload_base)
    if len(examples) < 15:
        print(f"Need >=15 examples, got {len(examples)}", file=sys.stderr)
        return 1
    print(f"[launch] {len(examples)} examples ready")

    payload = {
        "locationId": LOCATION_ID,
        "version": version,
        "examples": examples,
        "webhookUrl": WEBHOOK_URL,
    }
    payload_url = put_blob(
        f"training-data/{LOCATION_ID}/{version}/payload.json",
        json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        "application/json",
        blob_token,
        upload_base,
    )
    print("[launch] payload uploaded")

    code_url = put_blob(
        f"training-data/{LOCATION_ID}/{version}/code.tar.gz",
        build_code_tarball(),
        "application/gzip",
        blob_token,
        upload_base,
    )
    print("[launch] training code tarball uploaded")

    # transformers-pytorch-gpu image has python3 only, and no curl.
    fetch = (
        "python3 -c \"import urllib.request,os,sys;"
        "req=urllib.request.Request(os.environ[sys.argv[1]],"
        "headers={'User-Agent':'fieldwork-train/1.0'});"
        "data=urllib.request.urlopen(req, timeout=300).read();"
        "open(sys.argv[2],'wb').write(data)\""
    )
    bootstrap = " && ".join(
        [
            "set -e",
            "mkdir -p /tmp/fw",
            "cd /tmp/fw",
            f"{fetch} TRAIN_CODE_URL code.tar.gz",
            "tar -xzf code.tar.gz",
            "python3 -m pip install -q -r training/requirements.txt",
            f"{fetch} TRAIN_PAYLOAD_URL payload.json",
            "python3 -m training.run_job --payload payload.json",
        ]
    )

    job_body = {
        "dockerImage": DOCKER_IMAGE,
        "command": ["bash", "-c", bootstrap],
        "flavor": args.flavor or env.get("HF_JOB_FLAVOR") or DEFAULT_FLAVOR,
        "timeoutSeconds": TIMEOUT_SECONDS,
        "environment": {
            "TRAIN_CODE_URL": code_url,
            "TRAIN_PAYLOAD_URL": payload_url,
            "TRAIN_REQUIRE_ONNX": "0",
            # Worker request bodies cannot carry the merged checkpoint.
            "TRAIN_MAX_UPLOAD_BYTES": "90000000",
            "HF_HOME": "/tmp/hf",
            "STORAGE_UPLOAD_URL": upload_base,
            "STORAGE_PUBLIC_BASE": public_base,
        },
        "secrets": {
            "STORAGE_SECRET": blob_token,
            "TRAIN_WEBHOOK_SECRET": env.get("TRAIN_WEBHOOK_SECRET", ""),
        },
        "labels": {"name": f"fieldwork-train-{LOCATION_ID}"},
    }

    if args.dry_run:
        safe = dict(job_body)
        safe["secrets"] = {k: "***" for k in job_body["secrets"]}
        print(json.dumps(safe, indent=2))
        return 0

    result = hf_request(
        f"https://huggingface.co/api/jobs/{namespace}", hf_token, job_body
    )
    job_id = result.get("id") or (result.get("job") or {}).get("id")
    if not job_id:
        print(f"HF response missing id: {json.dumps(result)[:800]}", file=sys.stderr)
        return 1
    print(f"[launch] job created: {job_id}")
    print(f"[launch] monitor: https://huggingface.co/jobs/{namespace}/{job_id}")
    print(f"[launch] status:  python scripts/launch_hf_train.py --status {job_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
