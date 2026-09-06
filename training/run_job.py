"""
HF Jobs / local entrypoint:
  TRAIN_PAYLOAD_JSON='{...}' python -m training.run_job

Or:
  python -m training.run_job --payload path/to/payload.json
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
import traceback
from pathlib import Path

from .dataset import build_dataset_dir
from .export_onnx import export_onnx, merge_lora, prepare_upload_bundle
from .schema import MIN_TRAINING_EXAMPLES, parse_payload
from .train_lora import train_lora
from .upload import upload_bundle
from .webhook import notify_failure, notify_success


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fieldwork cemetery VLM trainer")
    parser.add_argument("--payload", type=str, help="Path to job payload JSON")
    parser.add_argument(
        "--work-dir",
        type=str,
        default=None,
        help="Working directory (default: temp)",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Train/export only (local dry-run)",
    )
    parser.add_argument(
        "--skip-onnx",
        action="store_true",
        help="Skip ONNX export attempt",
    )
    parser.add_argument(
        "--min-examples",
        type=int,
        default=None,
        help="Override minimum example gate (default 15; dry-run uses 1 with --skip-upload)",
    )
    args = parser.parse_args(argv)

    raw = None
    if args.payload:
        raw = Path(args.payload).read_text(encoding="utf-8")
    elif os.environ.get("TRAIN_PAYLOAD_JSON"):
        raw = os.environ["TRAIN_PAYLOAD_JSON"]
    else:
        print("Provide --payload or TRAIN_PAYLOAD_JSON", file=sys.stderr)
        return 2

    payload = parse_payload(raw)
    job_id = os.environ.get("HF_JOB_ID") or os.environ.get("JOB_ID")
    work = Path(args.work_dir) if args.work_dir else Path(tempfile.mkdtemp(prefix="fw-train-"))
    work.mkdir(parents=True, exist_ok=True)

    print(f"[run_job] location={payload.locationId} version={payload.version}")
    print(f"[run_job] examples={len(payload.examples)} work={work}")

    min_examples = args.min_examples
    if min_examples is None:
        min_examples = 1 if args.skip_upload else MIN_TRAINING_EXAMPLES

    if len(payload.examples) < min_examples:
        err = (
            f"Need at least {min_examples} examples, "
            f"got {len(payload.examples)}"
        )
        if not args.skip_upload:
            notify_failure(
                payload.webhookUrl,
                location_id=payload.locationId,
                error=err,
                job_id=job_id,
            )
        print(err, file=sys.stderr)
        return 1

    try:
        data_dir = build_dataset_dir(payload.locationId, payload.examples, work / "data")
        adapter_dir = train_lora(data_dir, work / "out")
        merged_dir = merge_lora(adapter_dir, work / "out")
        onnx_dir = None if args.skip_onnx else export_onnx(merged_dir, work / "out")
        prepared = prepare_upload_bundle(
            work / "out", adapter_dir, merged_dir, onnx_dir
        )

        if args.skip_upload:
            print(f"[run_job] skip upload; bundle at {prepared['bundle_dir']}")
            return 0

        uploaded = upload_bundle(
            prepared["bundle_dir"],
            payload.locationId,
            payload.version,
        )
        notify_success(
            payload.webhookUrl,
            location_id=payload.locationId,
            adapter_url=uploaded["adapterUrl"],
            adapter_version=payload.version,
            export_mode=prepared["export_mode"],
            job_id=job_id,
        )
        print("[run_job] done")
        return 0
    except Exception as e:
        traceback.print_exc()
        if not args.skip_upload:
            try:
                notify_failure(
                    payload.webhookUrl,
                    location_id=payload.locationId,
                    error=str(e),
                    job_id=job_id,
                )
            except Exception as hook_err:
                print(f"[run_job] webhook also failed: {hook_err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
