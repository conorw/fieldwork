#!/usr/bin/env python3
"""Upload local training samples to Cloudflare R2 via the Worker /api/storage route."""

from __future__ import annotations

import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def put(url: str, token: str, data: bytes, content_type: str) -> str:
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "User-Agent": "Mozilla/5.0 FieldworkMigrate",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read().decode()


def main() -> int:
    env = load_env()
    base = env.get("STORAGE_UPLOAD_URL", "").rstrip("/")
    token = env.get("STORAGE_SECRET") or env.get("TRAIN_WEBHOOK_SECRET") or ""
    if not base or not token:
        print("STORAGE_UPLOAD_URL and STORAGE_SECRET required", file=sys.stderr)
        return 2

    roots = [
        ROOT / "training" / "samples" / "curated",
        ROOT / "training" / "samples" / "synthetic",
    ]
    uploaded = 0
    failed = 0
    for folder in roots:
        if not folder.exists():
            continue
        for path in sorted(folder.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT / "training" / "samples").as_posix()
            key = f"training-data/local/{rel}"
            ct = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            try:
                put(f"{base}/{key}", token, path.read_bytes(), ct)
                uploaded += 1
                print(f"[ok] {key}")
            except urllib.error.HTTPError as e:
                failed += 1
                print(f"[fail] {key} {e.code} {e.read()[:200]!r}", file=sys.stderr)
    print(f"uploaded={uploaded} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
