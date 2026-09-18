"""POST training result to /api/train-headstone-webhook."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def post_webhook(
    webhook_url: str,
    body: dict[str, Any],
    *,
    secret: str | None = None,
) -> None:
    secret = secret or os.environ.get("TRAIN_WEBHOOK_SECRET", "")
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-train-webhook-secret": secret,
            "Authorization": f"Bearer {secret}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"[webhook] {resp.status}: {resp.read().decode()[:500]}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"Webhook failed ({e.code}): {detail}") from e


def notify_success(
    webhook_url: str,
    *,
    location_id: str,
    adapter_url: str,
    adapter_version: str,
    export_mode: str,
    job_id: str | None = None,
    global_adapter_url: str | None = None,
    global_adapter_version: str | None = None,
) -> None:
    body: dict[str, Any] = {
        "status": "success",
        "locationId": location_id,
        "adapterUrl": adapter_url,
        "adapterVersion": adapter_version,
        "exportMode": export_mode,
        "jobId": job_id,
    }
    if global_adapter_url:
        body["globalAdapterUrl"] = global_adapter_url
    if global_adapter_version:
        body["globalAdapterVersion"] = global_adapter_version
    post_webhook(webhook_url, body)


def notify_failure(
    webhook_url: str,
    *,
    location_id: str,
    error: str,
    job_id: str | None = None,
) -> None:
    post_webhook(
        webhook_url,
        {
            "status": "failure",
            "locationId": location_id,
            "error": error[:2000],
            "jobId": job_id,
        },
    )
