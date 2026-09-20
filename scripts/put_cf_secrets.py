#!/usr/bin/env python3
"""Upload Worker secrets from .env without printing values."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYS = [
    "OPENAI_API_KEY",
    "HF_TOKEN",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "TRAIN_WEBHOOK_SECRET",
    "STORAGE_SECRET",
    "BLOB_READ_WRITE_TOKEN",
]


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
    env = load_env()
    env.setdefault("SUPABASE_ANON_KEY", env.get("VITE_SUPABASE_ANON_KEY", ""))
    for key in KEYS:
        value = env.get(key, "")
        if not value:
            print(f"[skip] {key} empty", file=sys.stderr)
            continue
        print(f"[put] {key}")
        proc = subprocess.run(
            ["npx", "wrangler", "secret", "put", key],
            input=value + "\n",
            text=True,
            cwd=ROOT,
            shell=True,
        )
        if proc.returncode != 0:
            return proc.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
