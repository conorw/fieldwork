"""Download cemetery training images and build a Hugging Face Dataset."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from PIL import Image

from .schema import REASONING_PROMPT, target_to_json


def download_image(url: str, dest: Path, timeout: int = 60) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": "fieldwork-trainer/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        dest.write_bytes(resp.read())
    # Validate image
    with Image.open(dest) as im:
        im.verify()
    return dest


def build_dataset_dir(
    location_id: str,
    examples: list[dict[str, Any]],
    root: Path,
) -> Path:
    """
    Write:
      root/images/*.jpg
      root/train.jsonl
    Each JSONL line: {image_path, prompt, response, stone_type}
    """
    images_dir = root / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = root / "train.jsonl"

    rows: list[dict[str, Any]] = []
    for i, ex in enumerate(examples):
        url = ex["imageUrl"]
        ext = ".jpg"
        if ".png" in url.lower():
            ext = ".png"
        local = images_dir / f"{i:04d}{ext}"
        print(f"[dataset] downloading {i + 1}/{len(examples)}: {url[:80]}...")
        download_image(url, local)

        response = target_to_json(ex["target"])
        rows.append(
            {
                "location_id": location_id,
                "image": str(local),
                "prompt": REASONING_PROMPT,
                "response": response,
                "stone_type": ex.get("stoneType", "unknown"),
            }
        )

    with jsonl_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"[dataset] wrote {len(rows)} rows to {jsonl_path}")
    return root


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def to_hf_dataset(dataset_dir: Path):
    """Build datasets.Dataset with PIL images for VLM SFT."""
    from datasets import Dataset

    rows = load_jsonl(dataset_dir / "train.jsonl")

    def gen():
        for row in rows:
            img = Image.open(row["image"]).convert("RGB")
            yield {
                "image": img,
                "prompt": row["prompt"],
                "response": row["response"],
                "stone_type": row["stone_type"],
            }

    return Dataset.from_generator(gen)
