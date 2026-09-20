#!/usr/bin/env python3
"""
Copy Vercel Blob objects (pmtiles, training adapters/data, plot images)
into Cloudflare R2 by streaming through the deployed Worker.

Requires:
  STORAGE_PUBLIC_BASE  e.g. https://fieldwork.<account>.workers.dev
  STORAGE_SECRET       Worker secret (same as wrangler secret STORAGE_SECRET)
  BLOB_READ_WRITE_TOKEN  only used to list Vercel Blob

The 1.2GB merged HF weights are skipped by default (--include-merged to copy).

If Vercel responds with "Your store is blocked" (over-quota), downloads will fail
until the store is unblocked or files are uploaded from a local copy:
  npx wrangler r2 object put fieldwork-storage/pmtiles/OUTPUT.pmtiles --file OUTPUT.pmtiles --remote
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_BLOB = "https://6ftgthlf9zt2ofxl.public.blob.vercel-storage.com"
SKIP_SUFFIXES = ("/merged/model.safetensors",)


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def list_blobs(token: str) -> list[dict]:
    blobs: list[dict] = []
    cursor: str | None = None
    while True:
        qs: dict[str, str] = {"limit": "1000"}
        if cursor:
            qs["cursor"] = cursor
        url = "https://blob.vercel-storage.com?" + urllib.parse.urlencode(qs)
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}", "x-api-version": "7"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        blobs.extend(data.get("blobs") or data.get("files") or [])
        cursor = data.get("cursor")
        if not cursor:
            break
    return blobs


def source_url(blob: dict) -> str:
    path = blob.get("pathname") or ""
    return f"https://blob.vercel-storage.com/{path}"


def import_one(
    worker: str, secret: str, pathname: str, url: str, dry_run: bool
) -> None:
    endpoint = f"{worker.rstrip('/')}/api/admin/import-blob"
    body = json.dumps({"pathname": pathname, "sourceUrl": url}).encode("utf-8")
    if dry_run:
        print(f"[dry-run] {pathname}")
        return
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            payload = json.loads(resp.read().decode())
            print(f"[ok] {pathname} -> {payload.get('url', '')}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        raise RuntimeError(f"{pathname}: HTTP {e.code} {detail}") from e


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--include-merged", action="store_true")
    parser.add_argument(
        "--only-prefix",
        action="append",
        default=[],
        help="Repeatable. e.g. --only-prefix pmtiles --only-prefix adapters",
    )
    args = parser.parse_args()

    env = load_env()
    token = env.get("BLOB_READ_WRITE_TOKEN", "")
    secret = env.get("STORAGE_SECRET") or env.get("TRAIN_WEBHOOK_SECRET") or ""
    worker = env.get("STORAGE_PUBLIC_BASE", "")
    if not token:
        print("BLOB_READ_WRITE_TOKEN required to list Vercel Blob", file=sys.stderr)
        return 2
    if not args.dry_run and (not secret or not worker or "127.0.0.1" in worker):
        print(
            "Set STORAGE_PUBLIC_BASE to the deployed workers.dev origin and STORAGE_SECRET before copying.",
            file=sys.stderr,
        )
        return 2

    blobs = list_blobs(token)
    prefixes = args.only_prefix or ["pmtiles", "adapters", "training-data", "plot-images"]
    selected: list[dict] = []
    skipped = 0
    for blob in blobs:
        path = blob.get("pathname") or ""
        if not path or path.endswith("/"):
            skipped += 1
            continue
        if not any(path == p or path.startswith(p + "/") for p in prefixes):
            continue
        if not args.include_merged and any(path.endswith(s) for s in SKIP_SUFFIXES):
            print(f"[skip merged] {path}")
            skipped += 1
            continue
        selected.append(blob)

    print(f"copying {len(selected)} objects (skipped {skipped})")
    failures = 0
    for blob in selected:
        path = blob["pathname"]
        try:
            import_one(worker, secret, path, source_url(blob), args.dry_run)
        except Exception as e:
            failures += 1
            print(f"[fail] {path}: {e}", file=sys.stderr)
            time.sleep(1)
    print(f"done failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
