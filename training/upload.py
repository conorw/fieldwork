"""Upload adapter bundle to Vercel Blob under adapters/{locationId}/{version}/."""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


def _put_blob(pathname: str, data: bytes, content_type: str, token: str) -> str:
    """
    Vercel Blob put via REST.
    https://vercel.com/docs/storage/vercel-blob/using-blob-sdk
    """
    import json

    req = Request(
        f"https://blob.vercel-storage.com/{pathname}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": "7",
            "x-content-type": content_type,
            "x-add-random-suffix": "false",
        },
    )
    try:
        with urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode())
            return payload.get("url") or payload.get("downloadUrl") or pathname
    except Exception:
        boundary = "----FieldworkBoundary"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{Path(pathname).name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
        create = Request(
            "https://blob.vercel-storage.com",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "x-api-version": "7",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "x-pathname": pathname,
                "x-add-random-suffix": "false",
            },
        )
        with urlopen(create, timeout=300) as resp:
            payload = json.loads(resp.read().decode())
            return payload.get("url") or payload.get("downloadUrl") or pathname


def upload_bundle(
    bundle_dir: Path,
    location_id: str,
    version: str,
    *,
    token: str | None = None,
    path_prefix: str | None = None,
) -> dict[str, Any]:
    token = token or os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is required")

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
        adapter_url = f"https://blob.vercel-storage.com/{prefix}/"

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
    token = token or os.environ.get("BLOB_READ_WRITE_TOKEN")
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
