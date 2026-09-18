"""Download adapter bundles (LoRA weights) from Blob / HTTPS for continue-train + global merge."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

# Files we need for PEFT continue / LoRA averaging
ADAPTER_FILES = (
    "adapter_config.json",
    "adapter_model.safetensors",
    "adapter_model.bin",
    "manifest.json",
    "global_meta.json",
    "train_meta.json",
    "README.md",
)


def _get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "FieldworkTrainer/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _join(base: str, name: str) -> str:
    return f"{base.rstrip('/')}/{name.lstrip('/')}"


def download_adapter_bundle(base_url: str, dest_dir: Path) -> Path | None:
    """
    Download a global/cemetery adapter directory into dest_dir.
    Returns dest_dir on success, None if nothing useful was fetched.
    """
    if not base_url or not base_url.startswith("http"):
        print(f"[download] skip non-http adapter url: {base_url!r}")
        return None

    dest_dir.mkdir(parents=True, exist_ok=True)
    got: list[str] = []

    # Prefer manifest file list when present
    names: Iterable[str] = ADAPTER_FILES
    try:
        manifest_raw = _get(_join(base_url, "manifest.json"))
        (dest_dir / "manifest.json").write_bytes(manifest_raw)
        got.append("manifest.json")
        try:
            manifest = json.loads(manifest_raw.decode("utf-8"))
            files = manifest.get("files")
            if isinstance(files, list) and files:
                names = [str(f) for f in files] + list(ADAPTER_FILES)
        except Exception:
            pass
    except Exception as e:
        print(f"[download] no manifest at {base_url} ({e})")

    for name in dict.fromkeys(names):  # unique, preserve order
        if name == "manifest.json" and (dest_dir / name).exists():
            continue
        try:
            data = _get(_join(base_url, name))
            out = dest_dir / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
            got.append(name)
            print(f"[download] {name} ({len(data)} bytes)")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            print(f"[download] {name} failed: {e}")
        except Exception as e:
            print(f"[download] {name} failed: {e}")

    has_weights = (dest_dir / "adapter_model.safetensors").exists() or (
        dest_dir / "adapter_model.bin"
    ).exists()
    has_config = (dest_dir / "adapter_config.json").exists()
    if has_weights and has_config:
        print(f"[download] adapter ready at {dest_dir} ({len(got)} files)")
        return dest_dir

    print(f"[download] incomplete adapter from {base_url} (got={got})")
    return None


def resolve_prior_global_url(payload_base: str | None) -> str | None:
    """
    Prefer explicit payload URL; else env VITE-style / GLOBAL_ADAPTER_URL;
    else Blob path adapters/global/latest/ if GLOBAL_ADAPTER_LATEST_URL set.
    """
    import os

    if payload_base and payload_base.strip():
        return payload_base.strip().rstrip("/") + "/"
    for key in (
        "GLOBAL_ADAPTER_URL",
        "VITE_GLOBAL_ADAPTER_URL",
        "GLOBAL_ADAPTER_LATEST_URL",
    ):
        val = os.environ.get(key)
        if val and val.strip():
            return val.strip().rstrip("/") + "/"
    return None
