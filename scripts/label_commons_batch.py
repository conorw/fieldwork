#!/usr/bin/env python3
"""Label Commons headstone photos with the local ChatGPT reader and train.

Reads training/samples/commons-1k/manifest.json (thumb URLs, CC/PD only).
Writes labels.jsonl and, once enough inscriptions are readable, starts the
shared-model publish job.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "FieldworkHeadstoneTrainer/1.1 (local training sample collector; contact: fieldwork-dev)"
ANALYZE = "http://127.0.0.1:8787/api/analyze-headstone"
_download_lock = threading.Lock()
_next_download = 0.0


_STANDARD_WIDTHS = {20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840}


def as_thumb(url: str) -> str:
    """Hotlinked Commons images must use a standard thumbnail width."""
    clean = url.split("?")[0]
    sized = re.search(r"/(\d+)px-", clean)
    if "/thumb/" in clean and sized and int(sized.group(1)) in _STANDARD_WIDTHS:
        return clean
    if "/thumb/" in clean and sized:
        return re.sub(r"/\d+px-", "/960px-", clean, count=1)
    path = re.search(
        r"(https://upload\.wikimedia\.org/wikipedia/commons/)([0-9a-f]/[0-9a-f]{2}/)([^/?#]+)",
        clean,
    )
    if not path:
        return clean
    name = urllib.parse.unquote(path.group(3))
    return (
        f"{path.group(1)}thumb/{path.group(2)}{path.group(3)}/"
        f"960px-{urllib.parse.quote(name)}"
    )


def download(url: str) -> tuple[bytes, str]:
    global _next_download
    url = as_thumb(url)
    delay = 8.0
    last: Exception | None = None
    for _ in range(6):
        with _download_lock:
            wait = _next_download - time.time()
            if wait > 0:
                time.sleep(wait)
            _next_download = time.time() + 3.5
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
                mime = resp.headers.get_content_type()
            break
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code != 429:
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            header_wait = float(retry_after) if retry_after and str(retry_after).isdigit() else 0
            pause = max(header_wait, delay, 20)
            print(f"[label] commons busy, waiting {pause:.0f}s", flush=True)
            with _download_lock:
                _next_download = max(_next_download, time.time() + pause)
            time.sleep(pause)
            delay = min(delay * 1.5, 120)
        except urllib.error.URLError as exc:
            last = exc
            time.sleep(delay)
            delay = min(delay * 1.5, 90)
    else:
        raise last or RuntimeError("download failed")
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        mime = "image/jpeg"
        if url.lower().endswith(".png"):
            mime = "image/png"
        elif url.lower().endswith(".webp"):
            mime = "image/webp"
    return data, mime


def analyze(image: bytes, mime: str) -> dict:
    body = json.dumps(
        {"imageData": base64.b64encode(image).decode("ascii"), "mimeType": mime}
    ).encode()
    req = urllib.request.Request(
        ANALYZE,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA},
    )
    delay = 2.0
    last: Exception | None = None
    for _ in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 500, 502, 503, 504):
                detail = exc.read().decode(errors="replace")[:300]
                raise RuntimeError(f"analyze {exc.code}: {detail}") from exc
            time.sleep(delay)
            delay = min(delay * 2, 60)
        except urllib.error.URLError as exc:
            last = exc
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise last or RuntimeError("analyze failed")


def to_example(record: dict, analysis: dict) -> dict | None:
    if not analysis.get("success", True) and analysis.get("error"):
        return None
    persons = analysis.get("persons") or []
    notes = (analysis.get("full_text_transcription") or "").strip()
    named = [p for p in persons if (p.get("full_name") or "").strip()]
    if not named and len(notes) < 20:
        return None
    count = len(named) or len(persons)
    stone = "family" if count >= 3 else "couple" if count == 2 else "single"
    people = []
    for index, person in enumerate(persons):
        people.append(
            {
                "full_name": (person.get("full_name") or "").strip(),
                "role_on_stone": "primary" if index == 0 else "spouse",
                "position": "upper" if count == 2 and index == 0 else "lower" if count == 2 else "center",
                "dates": {
                    "birth": person.get("date_of_birth") or "",
                    "death": person.get("date_of_death") or "",
                    "aged": person.get("age_at_death"),
                },
                "relationships": person.get("relationships") or [],
                "occupation": person.get("occupation") or "",
                "veteran": bool(person.get("veteran")),
                "evidence": "ChatGPT reading of a Commons photograph",
            }
        )
    physical = analysis.get("physical") if isinstance(analysis.get("physical"), dict) else {}
    return {
        "imageUrl": record.get("thumb_url") or record.get("source_url"),
        "stoneType": stone,
        "target": {
            "people": people,
            "shared": {"epitaph": analysis.get("shared_epitaph") or ""},
            "physical": {
                "material": physical.get("material") or "unknown",
                "form": physical.get("form") or "unknown",
                "condition": physical.get("condition") or "unknown",
                "detail": physical.get("detail") or "",
            },
            "notes": notes,
        },
        "license": record.get("license") or "",
        "source_url": record.get("source_url") or "",
        "title": record.get("title") or "",
    }


def load_done(path: Path) -> set[str]:
    done: set[str] = set()
    if not path.exists():
        return done
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("source_url"):
            done.add(row["source_url"])
    return done


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        default="training/samples/commons-1k/manifest.json",
    )
    parser.add_argument(
        "--out",
        default="training/samples/commons-1k/labels.jsonl",
    )
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--train", action="store_true", default=True)
    parser.add_argument("--no-train", action="store_false", dest="train")
    args = parser.parse_args()

    manifest_path = ROOT / args.manifest
    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    records = json.loads(manifest_path.read_text(encoding="utf-8"))
    done = load_done(out_path)
    pending = [r for r in records if r.get("source_url") not in done]
    print(
        f"[label] {len(done)} already labeled, {len(pending)} candidates, target {args.limit}",
        flush=True,
    )

    lock = threading.Lock()
    kept = len(done)

    def one(record: dict) -> str:
        url = record.get("thumb_url") or record.get("source_url")
        image, mime = download(url)
        example = to_example(record, analyze(image, mime))
        if not example:
            return "skip"
        line = json.dumps(example, ensure_ascii=False)
        with lock:
            with out_path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        return "keep"

    index = 0
    while kept < args.limit and index < len(pending):
        wave = pending[index : index + args.workers * 4]
        index += len(wave)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(one, record) for record in wave]
            for future in as_completed(futures):
                try:
                    status = future.result()
                except Exception as exc:
                    print(f"[label] error: {exc}", flush=True)
                    continue
                if status != "keep":
                    continue
                with lock:
                    kept += 1
                    current = kept
                if current % 10 == 0 or current >= args.limit:
                    print(f"[label] {current} readable inscriptions", flush=True)

    print(f"[label] complete {kept} labels -> {out_path}", flush=True)
    if args.train and kept >= 50:
        import sys

        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from launch_commons_train import launch

        launch(out_path, min_examples=min(kept, args.limit))
    elif args.train:
        print("[label] not enough readable stones to train")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
