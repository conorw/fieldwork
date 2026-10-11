#!/usr/bin/env python3
"""
Collect CC/PD headstone images from Wikimedia Commons (official MediaWiki API).
Does NOT scrape private cemetery sites — only Commons category members / search
hits with permissive licenses.

Usage:
  python scripts/collect_headstone_samples.py --limit 16 --search "gravestone inscription"
  python scripts/collect_headstone_samples.py --titles "File:Emily Dickinson gravestone.jpg"
"""

from __future__ import annotations

import argparse
import json
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = "FieldworkHeadstoneTrainer/1.1 (local training sample collector; contact: fieldwork-dev)"

CATEGORIES = [
    "Category:English-language_gravestones",
    "Category:Gravestones_in_England",
    "Category:Gravestones_in_the_United_States",
]

BULK_CATEGORIES = [
    "Category:English-language_gravestones",
    "Category:Gravestones_in_England",
    "Category:Gravestones_in_Scotland",
    "Category:Gravestones_in_Wales",
    "Category:Gravestones_in_Ireland",
    "Category:Gravestones_in_the_United_States",
    "Category:Gravestones_in_Canada",
    "Category:Gravestones_in_Australia",
]

DEFAULT_SEARCHES = [
    "gravestone inscription born died",
    "headstone in loving memory",
    "english language gravestone",
]

BULK_SEARCHES = [
    'incategory:"English-language_gravestones" filetype:bitmap',
    'incategory:"Gravestones_in_England" filetype:bitmap',
    'incategory:"Gravestones_in_Scotland" filetype:bitmap',
    'incategory:"Gravestones_in_Wales" filetype:bitmap',
    'incategory:"Gravestones_in_Ireland" filetype:bitmap',
    "gravestone inscription filetype:bitmap",
    'headstone "in loving memory" filetype:bitmap',
    "cemetery headstone born died filetype:bitmap",
]

# Well-known readable monuments (license still checked via API).
KNOWN_TITLES = [
    'File:"Old Diver\'s" Headstone.jpg',
    "File:Emily Dickinson gravestone.jpg",
    "File:Henry David Thoreau grave.jpg",
    "File:Louisa May Alcott grave.jpg",
    "File:Mark Twain grave.jpg",
    "File:Calamity Jane grave.jpg",
    "File:Wild Bill Hickok grave.jpg",
    "File:Jack London grave.jpg",
    "File:Robert Frost gravestone.jpg",
    "File:Edgar Allan Poe grave.jpg",
    "File:Benjamin Franklin grave.jpg",
    "File:Susan B. Anthony grave.jpg",
    "File:Frederick Douglass grave.jpg",
    "File:Harriet Tubman grave.jpg",
    "File:Sojourner Truth grave.jpg",
    "File:John Muir grave.jpg",
    "File:Kit Carson grave.jpg",
    "File:Buffalo Bill grave.jpg",
    "File:Wyatt Earp grave.jpg",
    "File:Doc Holliday grave.jpg",
    "File:Jesse James grave.jpg",
    "File:Abraham Lincoln tomb.jpg",
    "File:Ulysses S. Grant tomb.jpg",
    "File:George Washington grave.jpg",
    "File:Thomas Jefferson grave.jpg",
    "File:Nathaniel Hawthorne grave.jpg",
    "File:Ralph Waldo Emerson grave.jpg",
    "File:Walt Whitman grave.jpg",
    "File:Herman Melville grave.jpg",
    "File:F. Scott Fitzgerald grave.jpg",
    "File:A symbolic stone at Longnewton burial ground - geograph.org.uk - 951350.jpg",
    "File:A misprint on a gravestone - geograph.org.uk - 2594866.jpg",
]

ALLOWED_LICENSE_HINTS = (
    "public domain",
    "cc0",
    "cc-by",
    "cc by",
    "creative commons attribution",
    "pd-",
)


def license_ok(name: str) -> bool:
    """PD, CC0, CC BY, and CC BY-SA only. No non-commercial or no-derivatives."""
    n = (name or "").lower()
    if not n:
        return False
    if any(
        bad in n
        for bad in (
            "noncommercial",
            "non-commercial",
            "-nc",
            " nc",
            "noderiv",
            "no derivatives",
            "-nd",
        )
    ):
        return False
    return any(hint in n for hint in ALLOWED_LICENSE_HINTS)


def api_get(params: dict, retries: int = 10, sleep: float = 1.5) -> dict:
    q = urllib.parse.urlencode({**params, "format": "json", "maxlag": "5"})
    delay = max(sleep, 5)
    last_err: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(
            f"{API}?{q}",
            headers={"User-Agent": UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            err = body.get("error") or {}
            if err.get("code") in ("maxlag", "ratelimited"):
                raise urllib.error.HTTPError(req.full_url, 429, err.get("code", "retry"), hdrs=None, fp=None)
            if err:
                raise RuntimeError(err.get("info") or str(err))
            return body
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
            retry_after = 0.0
            if e.headers:
                raw = e.headers.get("Retry-After") or ""
                if raw.isdigit():
                    retry_after = float(raw)
            wait = max(delay, retry_after, 8) + random.uniform(0, 1.5)
            print(
                f"[collect] HTTP {e.code}, retry {attempt + 1}/{retries} in {wait:.1f}s",
                flush=True,
            )
            time.sleep(wait)
            delay = min(delay * 1.6, 120)
        except urllib.error.URLError as e:
            last_err = e
            time.sleep(delay)
            delay = min(delay * 1.6, 120)
    raise last_err or RuntimeError("api_get failed")


def list_category_files(category: str, limit: int, sleep: float) -> list[str]:
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
        data = api_get(params, sleep=sleep)
        for m in data.get("query", {}).get("categorymembers", []):
            title = m.get("title")
            if title and title.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                titles.append(title)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(sleep)
    return titles[:limit]


def search_files(query: str, limit: int, sleep: float) -> list[str]:
    titles: list[str] = []
    offset = 0
    while len(titles) < limit:
        data = api_get(
            {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srnamespace": 6,
                "srlimit": min(50, limit - len(titles)),
                "sroffset": offset,
            },
            sleep=sleep,
        )
        hits = data.get("query", {}).get("search", [])
        if not hits:
            break
        for s in hits:
            title = s.get("title") or ""
            if title.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                titles.append(title)
        if "continue" not in data:
            break
        offset = data["continue"].get("sroffset", offset + len(hits))
        time.sleep(sleep)
    return titles[:limit]


def info_from_page(page: dict) -> dict | None:
    if "imageinfo" not in page:
        return None
    info = page["imageinfo"][0]
    title = page.get("title") or ""
    mime = (info.get("mime") or "").lower()
    if mime and not mime.startswith("image/"):
        return None
    if not title.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff")):
        return None
    meta = info.get("extmetadata", {})
    license_name = (
        meta.get("LicenseShortName", {}).get("value")
        or meta.get("License", {}).get("value")
        or ""
    ).lower()
    if not license_ok(license_name):
        return None
    thumb = info.get("thumburl") or info.get("url")
    full = info.get("url")
    if not thumb or not full:
        return None
    desc = meta.get("ImageDescription", {}).get("value") or ""
    desc = re.sub(r"<[^>]+>", " ", desc)
    desc = re.sub(r"\s+", " ", desc).strip()
    return {
        "title": title,
        "url": thumb,
        "full_url": full,
        "license": license_name,
        "description": desc[:500],
        "width": info.get("thumbwidth") or info.get("width"),
        "height": info.get("thumbheight") or info.get("height"),
    }


def file_info(titles: list[str], sleep: float) -> list[dict]:
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
            },
            sleep=sleep,
        )
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            row = info_from_page(page)
            if row:
                out.append(row)
        time.sleep(sleep)
    return out


def licensed_from_categories(
    categories: list[str], limit: int, sleep: float, seen: set[str]
) -> list[dict]:
    """Page category members with license metadata until `limit` photos qualify."""
    out: list[dict] = []
    for category in categories:
        if len(out) >= limit:
            break
        print(f"[collect] listing {category}", flush=True)
        cont = None
        while len(out) < limit:
            params = {
                "action": "query",
                "generator": "categorymembers",
                "gcmtitle": category,
                "gcmtype": "file",
                "gcmlimit": "50",
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata|mime",
                "iiurlwidth": "1024",
            }
            if cont:
                params["gcmcontinue"] = cont
            data = api_get(params, sleep=sleep)
            pages = data.get("query", {}).get("pages", {})
            for page in pages.values():
                row = info_from_page(page)
                if not row:
                    continue
                key = (row.get("title") or "").lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(row)
                if len(out) % 50 == 0:
                    print(f"[collect] {len(out)} licensed photos", flush=True)
                if len(out) >= limit:
                    break
            cont = (data.get("continue") or {}).get("gcmcontinue")
            if not cont:
                break
            time.sleep(max(sleep, 1.2))
        time.sleep(max(sleep, 1.2))
    return out


def download(url: str, dest: Path, retries: int = 5, sleep: float = 1.5) -> None:
    delay = sleep
    last_err: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                dest.write_bytes(resp.read())
                return
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
            wait = delay + random.uniform(0, 0.8)
            print(f"[collect] download HTTP {e.code}, retry {attempt + 1}/{retries} in {wait:.1f}s")
            time.sleep(wait)
            delay = min(delay * 2, 90)
    raise last_err or RuntimeError("download failed")


def existing_titles(manifest: list[dict]) -> set[str]:
    return {(e.get("title") or "").lower() for e in manifest}


def next_index(manifest: list[dict]) -> int:
    nums = []
    for e in manifest:
        m = re.search(r"commons-(\d+)", e.get("id") or "")
        if m:
            nums.append(int(m.group(1)))
    return (max(nums) + 1) if nums else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=16)
    parser.add_argument("--out", type=str, default="training/samples/commons")
    parser.add_argument("--append", action="store_true", help="Keep existing manifest entries")
    parser.add_argument("--sleep", type=float, default=1.6, help="Seconds between API calls")
    parser.add_argument("--search", action="append", default=[], help="Commons search query (repeatable)")
    parser.add_argument("--titles", action="append", default=[], help="Exact File: title (repeatable)")
    parser.add_argument(
        "--categories",
        action="store_true",
        help="Also list category members (more API traffic)",
    )
    parser.add_argument(
        "--known",
        action="store_true",
        default=True,
        help="Include well-known monument titles (default on)",
    )
    parser.add_argument("--no-known", action="store_false", dest="known")
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="Write licensed image URLs without downloading files",
    )
    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    man_path = out_dir / "manifest.json"
    manifest: list[dict] = []
    if args.append and man_path.exists():
        manifest = json.loads(man_path.read_text(encoding="utf-8"))

    seen_titles = existing_titles(manifest)
    use_categories = args.metadata_only and not args.search and not args.titles
    if use_categories:
        infos = licensed_from_categories(
            BULK_CATEGORIES, args.limit, args.sleep, seen_titles
        )
    else:
        titles: list[str] = []
        titles.extend(args.titles)
        if args.known:
            titles.extend(KNOWN_TITLES)
        searches = list(args.search)
        if not searches and not args.titles and not args.known:
            searches = DEFAULT_SEARCHES
        for q in searches:
            print(f"[collect] search {q}", flush=True)
            titles.extend(search_files(q, max(12, args.limit), args.sleep))
            time.sleep(args.sleep)
        if args.categories:
            per_cat = max(8, args.limit // max(1, len(CATEGORIES)))
            for cat in CATEGORIES:
                print(f"[collect] listing {cat}", flush=True)
                titles.extend(list_category_files(cat, per_cat, args.sleep))
                time.sleep(args.sleep)

        titles = [t for t in dict.fromkeys(titles) if t.lower() not in seen_titles]
        titles = titles[: max(args.limit * 4, args.limit)]
        print(f"[collect] {len(titles)} new candidate files, fetching metadata…", flush=True)
        infos = file_info(titles, args.sleep)
        infos = [i for i in infos if (i.get("title") or "").lower() not in seen_titles]
    print(f"[collect] {len(infos)} with allowed licenses", flush=True)

    idx = next_index(manifest)
    added = 0
    for info in infos:
        if added >= args.limit:
            break
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", (info["title"] or f"img{idx}"))[:80]
        ext = ".jpg"
        url = info.get("url") or ""
        if url.lower().endswith(".png"):
            ext = ".png"
        dest = out_dir / f"{idx:04d}_{safe}{ext}"
        try:
            record = {
                "id": f"commons-{idx:04d}",
                "source": "wikimedia_commons",
                "title": info["title"],
                "license": info["license"],
                "description": info["description"],
                "source_url": info["full_url"],
                "thumb_url": info.get("url") or info["full_url"],
            }
            if args.metadata_only:
                record["path"] = ""
            else:
                print(f"[collect] download {info['title']}", flush=True)
                download(url, dest, sleep=args.sleep)
                record["path"] = str(dest.as_posix())
            manifest.append(record)
            added += 1
            idx += 1
            if added % 100 == 0:
                man_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
                print(f"[collect] saved {added}", flush=True)
        except Exception as e:
            print(f"[collect] skip {info['title']}: {e}", flush=True)
            if dest.exists():
                dest.unlink()
        if not args.metadata_only:
            time.sleep(args.sleep)

    man_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[collect] wrote {len(manifest)} images ({added} new) -> {man_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
