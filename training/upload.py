"""Upload adapter bundle to Cloudflare R2 under adapters/{locationId}/{version}/."""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


def _public_file_url(pathname: str) -> str:
    base = os.environ.get("STORAGE_PUBLIC_BASE", "").rstrip("/")
    return f"{base}/files/{pathname}" if base else f"/files/{pathname}"


def _put_blob(pathname: str, data: bytes, content_type: str, token: str) -> str:
    """PUT an object to the Cloudflare Worker storage route (R2)."""
    import json

    upload_base = os.environ.get("STORAGE_UPLOAD_URL", "").rstrip("/")
    if not upload_base:
        raise RuntimeError("STORAGE_UPLOAD_URL is required (Cloudflare Worker /api/storage)")

    req = Request(
        f"{upload_base}/{pathname}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        },
    )
    with urlopen(req, timeout=300) as resp:
        payload = json.loads(resp.read().decode())
        return payload.get("url") or _public_file_url(pathname)


def upload_bundle(
    bundle_dir: Path,
    location_id: str,
    version: str,
    *,
    token: str | None = None,
    path_prefix: str | None = None,
) -> dict[str, Any]:
    token = (
        token
        or os.environ.get("STORAGE_SECRET")
        or os.environ.get("TRAIN_WEBHOOK_SECRET")
    )
    if not token:
        raise RuntimeError("STORAGE_SECRET is required")

    # Sanitize version for path
    safe_version = version.replace(":", "-").replace("/", "-")
    if path_prefix:
        prefix = f"{path_prefix.rstrip('/')}/{safe_version}"
    else:
        prefix = f"adapters/{location_id}/{safe_version}"
    uploaded: dict[str, str] = {}

    if not bundle_dir.exists():
        raise RuntimeError(f"bundle_dir missing: {bundle_dir}")

    files = [p for p in bundle_dir.rglob("*") if p.is_file()]
    print(f"[upload] uploading {len(files)} files to {prefix}/")

    for path in files:
        rel = path.relative_to(bundle_dir).as_posix()
        pathname = f"{prefix}/{rel}"
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        url = _put_blob(pathname, path.read_bytes(), content_type, token)
        uploaded[rel] = url
        print(f"[upload] {rel} -> {url}")

    # Canonical adapter URL is the directory prefix / manifest
    adapter_url = uploaded.get("manifest.json") or (
        next(iter(uploaded.values())) if uploaded else f"{prefix}/"
    )
    # Prefer a clean prefix URL if blob returns file URLs
    if isinstance(adapter_url, str) and "manifest.json" in adapter_url:
        adapter_url = adapter_url.rsplit("/manifest.json", 1)[0] + "/"
    elif not uploaded:
        adapter_url = _public_file_url(f"{prefix}/")

    return {
        "adapterUrl": adapter_url,
        "prefix": prefix,
        "files": uploaded,
    }


def upload_latest_pointer(
    bundle_dir: Path,
    *,
    version: str,
    versioned_url: str | None = None,
    token: str | None = None,
) -> dict[str, Any]:
    """
    Publish adapters/global/latest/ so every client can poll one stable URL.
    Copies the global adapter bundle and writes a pointer manifest.
    """
    import json

    result = upload_bundle(
        bundle_dir,
        "global",
        "latest",
        token=token,
        path_prefix="adapters/global",
    )
    # Overwrite manifest with explicit latest pointer metadata
    token = (
        token
        or os.environ.get("STORAGE_SECRET")
        or os.environ.get("TRAIN_WEBHOOK_SECRET")
    )
    if token:
        pointer = {
            "kind": "global_lora",
            "version": version,
            "latest": True,
            "versionedUrl": versioned_url,
            "export_mode": "lora",
            "note": "Stable pointer — auto-downloaded by all Fieldwork clients",
        }
        # Prefer existing manifest fields if present
        man = bundle_dir / "manifest.json"
        if man.exists():
            try:
                pointer = {**json.loads(man.read_text(encoding="utf-8")), **pointer}
            except Exception:
                pass
        data = json.dumps(pointer, indent=2).encode("utf-8")
        url = _put_blob(
            "adapters/global/latest/manifest.json",
            data,
            "application/json",
            token,
        )
        result["adapterUrl"] = url.rsplit("/manifest.json", 1)[0] + "/"
        result["manifestUrl"] = url
        print(f"[upload] global latest pointer → {result['adapterUrl']}")
    return result
