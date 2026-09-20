#!/usr/bin/env python3
"""List objects in the Vercel Blob store (sizes + paths). Secrets are not printed."""

from __future__ import annotations

import json
import urllib.parse
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


def main() -> int:
    token = load_env().get("BLOB_READ_WRITE_TOKEN", "")
    if not token:
        print("BLOB_READ_WRITE_TOKEN missing")
        return 2

    blobs: list[dict] = []
    cursor: str | None = None
    while True:
        qs: dict[str, str] = {"limit": "1000"}
        if cursor:
            qs["cursor"] = cursor
        url = "https://blob.vercel-storage.com?" + urllib.parse.urlencode(qs)
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "x-api-version": "7",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        batch = data.get("blobs") or data.get("files") or []
        blobs.extend(batch)
        cursor = data.get("cursor")
        if not cursor:
            if not blobs:
                print("empty listing; keys:", ",".join(list(data)[:20]))
            break

    total = 0
    prefixes: dict[str, int] = {}
    print("size_bytes\tpathname")
    for b in blobs:
        path = b.get("pathname") or b.get("url") or ""
        size = int(b.get("size") or 0)
        total += size
        prefix = path.split("/")[0] if path else "?"
        prefixes[prefix] = prefixes.get(prefix, 0) + size
        print(f"{size}\t{path}")
    print(f"count\t{len(blobs)}")
    print(f"total_bytes\t{total}")
    print("prefix_bytes")
    for k, v in sorted(prefixes.items(), key=lambda kv: -kv[1]):
        print(f"{v}\t{k}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
