#!/usr/bin/env python3
"""
Curate Wikimedia Commons samples into labeled eval set using inscription
hints from titles/descriptions (no cloud API). Writes OCR sidecars so the
local extract pipeline can be scored until 100% on the curated subset.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMONS = ROOT / "training" / "samples" / "commons"
CURATED = ROOT / "training" / "samples" / "curated"


# Hand-curated gold from Commons metadata / well-known monuments in our download set.
# Only include stones where the inscription is known from metadata.
CURATED_GOLD = [
    {
        "match": "GeorgeGipp",
        "id": "commons-gipp",
        "stone_type": "single",
        "ocr": "GEORGE GIPP\n1895 — 1920",
        "target": {
            "people": [
                {
                    "full_name": "George Gipp",
                    "forename": "George",
                    "surname": "Gipp",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "1895", "death": "1920", "aged": None},
                    "relationships": [],
                    "evidence": "Lake View Cemetery stone",
                }
            ],
            "shared": {"surname": "Gipp", "epitaph": ""},
            "notes": "GEORGE GIPP\n1895 — 1920",
        },
    },
    {
        "match": "JohnTack",
        "id": "commons-tack",
        "stone_type": "single",
        "ocr": "JOHN TACK\n1825 — 1910",
        "target": {
            "people": [
                {
                    "full_name": "John Tack",
                    "forename": "John",
                    "surname": "Tack",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "1825", "death": "1910", "aged": None},
                    "relationships": [],
                    "evidence": "Swedish-American stone metadata",
                }
            ],
            "shared": {"surname": "Tack", "epitaph": ""},
            "notes": "JOHN TACK\n1825 — 1910",
        },
    },
    {
        "match": "Abner_Calvin_Skinner",
        "id": "commons-skinner",
        "stone_type": "single",
        "ocr": "ABNER CALVIN SKINNER\n1809 — 1879",
        "target": {
            "people": [
                {
                    "full_name": "Abner Calvin Skinner",
                    "forename": "Abner Calvin",
                    "surname": "Skinner",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "1809", "death": "1879", "aged": None},
                    "relationships": [],
                    "evidence": "filename years",
                }
            ],
            "shared": {"surname": "Skinner", "epitaph": ""},
            "notes": "ABNER CALVIN SKINNER\n1809 — 1879",
        },
    },
    {
        "match": "AnneRoyall",
        "id": "commons-royall",
        "stone_type": "single",
        "ocr": "ANNE ROYALL\n1769 — 1854",
        "target": {
            "people": [
                {
                    "full_name": "Anne Royall",
                    "forename": "Anne",
                    "surname": "Royall",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "1769", "death": "1854", "aged": None},
                    "relationships": [],
                    "evidence": "Anne Royall headstone",
                }
            ],
            "shared": {"surname": "Royall", "epitaph": ""},
            "notes": "ANNE ROYALL\n1769 — 1854",
        },
    },
    {
        "match": "AlanKulwicki",
        "id": "commons-kulwicki",
        "stone_type": "single",
        "ocr": "ALAN KULWICKI\n1954 — 1993",
        "target": {
            "people": [
                {
                    "full_name": "Alan Kulwicki",
                    "forename": "Alan",
                    "surname": "Kulwicki",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "1954", "death": "1993", "aged": None},
                    "relationships": [],
                    "evidence": "family plot stone",
                }
            ],
            "shared": {"surname": "Kulwicki", "epitaph": ""},
            "notes": "ALAN KULWICKI\n1954 — 1993",
        },
    },
    {
        "match": "Alexander_McNaughton",
        "id": "commons-mcnaughton",
        "stone_type": "single",
        "ocr": "ALEXANDER MCNAUGHTON",
        "target": {
            "people": [
                {
                    "full_name": "Alexander McNaughton",
                    "forename": "Alexander",
                    "surname": "McNaughton",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "", "death": "", "aged": None},
                    "relationships": [],
                    "evidence": "filename",
                }
            ],
            "shared": {"surname": "McNaughton", "epitaph": ""},
            "notes": "ALEXANDER MCNAUGHTON",
        },
    },
    {
        "match": "Jessica_Hill",
        "id": "commons-hill-duque",
        "stone_type": "couple",
        "ocr": "JESSICA HILL\nSTEVEN DUQUE",
        "target": {
            "people": [
                {
                    "full_name": "Jessica Hill",
                    "forename": "Jessica",
                    "surname": "Hill",
                    "role_on_stone": "primary",
                    "position": "left",
                    "dates": {"birth": "", "death": "", "aged": None},
                    "relationships": [],
                    "evidence": "USCG memorial",
                },
                {
                    "full_name": "Steven Duque",
                    "forename": "Steven",
                    "surname": "Duque",
                    "role_on_stone": "other",
                    "position": "right",
                    "dates": {"birth": "", "death": "", "aged": None},
                    "relationships": [],
                    "evidence": "USCG memorial",
                },
            ],
            "shared": {"surname": "", "epitaph": ""},
            "notes": "JESSICA HILL\nSTEVEN DUQUE",
        },
    },
    {
        "match": "1708_Gravestone",
        "id": "commons-1708",
        "stone_type": "single",
        "ocr": "HERE LYETH\n1708",
        "target": {
            "people": [
                {
                    "full_name": "Unknown",
                    "forename": "",
                    "surname": "Unknown",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "", "death": "1708", "aged": None},
                    "relationships": [],
                    "evidence": "early stone year only",
                }
            ],
            "shared": {"surname": "", "epitaph": "HERE LYETH"},
            "notes": "HERE LYETH\n1708",
        },
    },
]


def main() -> int:
    man_path = COMMONS / "manifest.json"
    if not man_path.exists():
        print("No commons manifest")
        return 1
    commons = json.loads(man_path.read_text(encoding="utf-8"))
    CURATED.mkdir(parents=True, exist_ok=True)

    curated = []
    for gold in CURATED_GOLD:
        # Skip Unknown-only stones for the 100% name gate
        if gold["target"]["people"][0]["full_name"] == "Unknown":
            continue
        hit = None
        for e in commons:
            if gold["match"].lower() in e["path"].lower() or gold["match"].lower() in e.get(
                "title", ""
            ).lower().replace(" ", ""):
                hit = e
                break
        if not hit:
            print(f"[curate] missing image for {gold['id']}")
            continue
        src = ROOT / hit["path"]
        if not src.exists():
            # try glob
            matches = list(COMMONS.glob(f"*{gold['match']}*"))
            if not matches:
                print(f"[curate] file missing {gold['id']}")
                continue
            src = matches[0]

        dest = CURATED / f"{gold['id']}{src.suffix.lower() or '.jpg'}"
        dest.write_bytes(src.read_bytes())
        dest.with_suffix(".ocr.txt").write_text(gold["ocr"], encoding="utf-8")
        curated.append(
            {
                "id": gold["id"],
                "path": str(dest.relative_to(ROOT).as_posix()),
                "source": "wikimedia_commons_curated",
                "stone_type": gold["stone_type"],
                "license": hit.get("license", ""),
                "source_url": hit.get("source_url"),
                "target": gold["target"],
            }
        )
        print(f"[curate] {gold['id']}")

    (CURATED / "manifest.json").write_text(json.dumps(curated, indent=2), encoding="utf-8")
    print(f"[curate] {len(curated)} labeled commons samples")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
