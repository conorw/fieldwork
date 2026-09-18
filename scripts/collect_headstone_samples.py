#!/usr/bin/env python3
"""
Collect CC/PD headstone images from Wikimedia Commons (official MediaWiki API).
Does NOT scrape private cemetery sites — only Commons category members with
permissive licenses.

Usage:
  python scripts/collect_headstone_samples.py --limit 40
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = "FieldworkHeadstoneTrainer/1.0 (local training sample collector; contact: fieldwork-dev)"

# Prefer English-inscribed stones that are often clearer for OCR bootstrap
CATEGORIES = [
    "Category:English-language_gravestones",
    "Category:French-language_gravestones",
    "Category:German-language_gravestones",
    "Category:Spanish-language_gravestones",
    "Category:Italian-language_gravestones",
    "Category:Latin-language_gravestones",
    "Category:Swedish-language_gravestones",
    "Category:Irish-language_gravestones",
    "Category:Welsh-language_gravestones",
    "Category:Polish-language_gravestones",
    "Category:Dutch-language_gravestones",
    "Category:Gravestones_in_France",
    "Category:Gravestones_in_Germany",
    "Category:Gravestones_in_Spain",
    "Category:Gravestones_in_Italy",
    "Category:Gravestones_in_Ireland",
    "Category:Gravestones_in_Wales",
    "Category:Gravestones_in_the_United_States",
    "Category:Gravestones_in_England",
]

ALLOWED_LICENSE_HINTS = (
    "public domain",
    "cc0",
    "cc-by",
    "cc by",
    "creative commons attribution",
    "pd-",
)


def api_get(params: dict) -> dict:
    q = urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(
        f"{API}?{q}",
        headers={"User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def list_category_files(category: str, limit: int) -> list[str]:
    titles: list[str] = []
    cont = None
    while len(titles) < limit:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmtype": "file",
            "cmlimit": min(50, limit - len(titles)),
        }
        if cont:
            params["cmcontinue"] = cont
        data = api_get(params)
        for m in data.get("query", {}).get("categorymembers", []):
            title = m.get("title")
            if title and title.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                titles.append(title)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(0.2)
    return titles[:limit]


def file_info(titles: list[str]) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(titles), 20):
        batch = titles[i : i + 20]
        data = api_get(
            {
                "action": "query",
                "titles": "|".join(batch),
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata|mime",
                "iiurlwidth": 1024,
            }
        )
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            if "imageinfo" not in page:
                continue
            info = page["imageinfo"][0]
            meta = info.get("extmetadata", {})
            license_name = (
                meta.get("LicenseShortName", {}).get("value")
                or meta.get("License", {}).get("value")
                or ""
            ).lower()
            if not any(h in license_name for h in ALLOWED_LICENSE_HINTS):
                # Also accept missing license if Attribution required fields suggest Commons reuse
                if "public domain" not in license_name and "cc" not in license_name:
                    continue
            desc = meta.get("ImageDescription", {}).get("value") or ""
            desc = re.sub(r"<[^>]+>", " ", desc)
            desc = re.sub(r"\s+", " ", desc).strip()
            out.append(
                {
                    "title": page.get("title"),
                    "url": info.get("thumburl") or info.get("url"),
                    "full_url": info.get("url"),
                    "license": license_name,
                    "description": desc[:500],
                    "width": info.get("thumbwidth") or info.get("width"),
                    "height": info.get("thumbheight") or info.get("height"),
                }
            )
        time.sleep(0.25)
    return out


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument(
        "--out",
        type=str,
        default="training/samples/commons",
    )
    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    titles: list[str] = []
    per_cat = max(10, args.limit // len(CATEGORIES) + 5)
    for cat in CATEGORIES:
        print(f"[collect] listing {cat}")
        titles.extend(list_category_files(cat, per_cat))
    # de-dupe
    titles = list(dict.fromkeys(titles))[: args.limit * 2]
    print(f"[collect] {len(titles)} candidate files, fetching metadata…")
    infos = file_info(titles)
    print(f"[collect] {len(infos)} with allowed licenses")

    manifest = []
    for idx, info in enumerate(infos[: args.limit]):
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", (info["title"] or f"img{idx}"))[:80]
        ext = ".jpg"
        if info.get("url", "").lower().endswith(".png"):
            ext = ".png"
        dest = out_dir / f"{idx:03d}_{safe}{ext}"
        try:
            print(f"[collect] download {info['title']}")
            download(info["url"], dest)
            entry = {
                "id": f"commons-{idx:03d}",
                "path": str(dest.as_posix()),
                "source": "wikimedia_commons",
                "title": info["title"],
                "license": info["license"],
                "description": info["description"],
                "source_url": info["full_url"],
            }
            manifest.append(entry)
        except Exception as e:
            print(f"[collect] skip {info['title']}: {e}")
        time.sleep(0.15)

    man_path = out_dir / "manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[collect] wrote {len(manifest)} images -> {man_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
