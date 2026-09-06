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
) -> dict[str, Any]:
    token = token or os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is required")

    # Sanitize version for path
    safe_version = version.replace(":", "-").replace("/", "-")
    prefix = f"adapters/{location_id}/{safe_version}"
    uploaded: dict[str, str] = {}

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
    adapter_url = uploaded.get("manifest.json") or next(iter(uploaded.values()))
    # Prefer a clean prefix URL if blob returns file URLs
    if "manifest.json" in adapter_url:
        adapter_url = adapter_url.rsplit("/manifest.json", 1)[0] + "/"

    return {
        "adapterUrl": adapter_url,
        "prefix": prefix,
        "files": uploaded,
    }
