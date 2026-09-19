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
        "match": "A_headstone_for_two_victims",
        "id": "commons-penfold",
        "stone_type": "family",
        "ocr": (
            "IN EVER LOVING MEMORY OF\n"
            "AUSTEN ARTHUR PENFOLD\nAN ONLY SON AGED 18 YEARS\n"
            "KILLED AT MAIDSTONE BY TYPHOID FEVER 13 SEPTEMBER 1897\n"
            "ALSO OF FRANCES ROSINA PENFOLD\nAN ONLY DAUGHTER AGED 22 YEARS\n"
            "KILLED AT MAIDSTONE BY TYPHOID FEVER 7 SEPTEMBER 1897\n"
            "ALSO OF FRANCES PENFOLD\nMOTHER OF THE ABOVE\n"
            "WHO WAS SUDDENLY CALLED TO REST 14 FEBRUARY 1909 AGED 59 YEARS\n"
            "ALSO OF MORRIS EDWIN PENFOLD\nWHO DIED 20 JANUARY 1917 AGED 65 YEARS"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Austen Arthur Penfold",
                    "forename": "Austen Arthur",
                    "surname": "Penfold",
                    "role_on_stone": "child",
                    "position": "upper",
                    "dates": {"birth": "", "death": "1897-09-13", "aged": 18},
                    "relationships": ["only son of Frances and Morris Edwin Penfold"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "typhoid, Maidstone",
                },
                {
                    "full_name": "Frances Rosina Penfold",
                    "forename": "Frances Rosina",
                    "surname": "Penfold",
                    "role_on_stone": "child",
                    "position": "upper",
                    "dates": {"birth": "", "death": "1897-09-07", "aged": 22},
                    "relationships": ["only daughter of Frances and Morris Edwin Penfold"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "typhoid, Maidstone",
                },
                {
                    "full_name": "Frances Penfold",
                    "forename": "Frances",
                    "surname": "Penfold",
                    "role_on_stone": "parent",
                    "position": "lower",
                    "dates": {"birth": "", "death": "1909-02-14", "aged": 59},
                    "relationships": ["mother of the above"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "mother of Austen and Frances Rosina",
                },
                {
                    "full_name": "Morris Edwin Penfold",
                    "forename": "Morris Edwin",
                    "surname": "Penfold",
                    "role_on_stone": "parent",
                    "position": "lower",
                    "dates": {"birth": "", "death": "1917-01-20", "aged": 65},
                    "relationships": ["husband of Frances Penfold"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "listed last on family stone",
                },
            ],
            "shared": {"surname": "Penfold", "epitaph": "LOVING STRAIGHT TRUE"},
            "physical": {
                "material": "limestone",
                "form": "arched",
                "condition": "weathered",
                "detail": "lichen, rural churchyard",
            },
            "notes": "Penfold family; two children died of typhoid 1897",
        },
    },
    {
        "match": "Mary_Ann_Bower",
        "id": "commons-bower",
        "stone_type": "couple",
        "ocr": (
            "IN LOVING MEMORY OF\nMARY ANN BOWER\nWHO FELL ASLEEP AUGUST 10TH 1931 "
            "AGED 81 YEARS\nALSO FRANCIS BOWER\nHUSBAND OF THE ABOVE\n"
            "WHO DIED AUGUST 10TH 1933 AGED 74 YEARS\nAT REST"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Mary Ann Bower",
                    "forename": "Mary Ann",
                    "surname": "Bower",
                    "role_on_stone": "primary",
                    "position": "upper",
                    "dates": {"birth": "", "death": "1931-08-10", "aged": 81},
                    "relationships": ["wife of Francis Bower"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "City of London Cemetery granite monument",
                },
                {
                    "full_name": "Francis Bower",
                    "forename": "Francis",
                    "surname": "Bower",
                    "role_on_stone": "spouse",
                    "position": "lower",
                    "dates": {"birth": "", "death": "1933-08-10", "aged": 74},
                    "relationships": ["husband of the above"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "named below Mary Ann",
                },
            ],
            "shared": {"surname": "Bower", "epitaph": "AT REST"},
            "physical": {
                "material": "granite",
                "form": "upright",
                "condition": "good",
                "detail": "polished pink granite with pediment B",
            },
            "notes": "MARY ANN BOWER 1931 / FRANCIS BOWER 1933",
        },
    },
    {
        "match": "Arnold_Jason_Aronson",
        "id": "commons-aronson",
        "stone_type": "war",
        "ocr": (
            "ARNOLD JASON ARONSON\nUS MERCHANT MARINE\n"
            "FEB 14 1926 JAN 23 2009\nBELOVED FATHER AND GRANDFATHER"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Arnold Jason Aronson",
                    "forename": "Arnold Jason",
                    "surname": "Aronson",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {
                        "birth": "1926-02-14",
                        "death": "2009-01-23",
                        "aged": None,
                    },
                    "relationships": ["beloved father and grandfather"],
                    "occupation": "US Merchant Marine",
                    "veteran": True,
                    "evidence": "bronze plaque, Star of David",
                }
            ],
            "shared": {"surname": "Aronson", "epitaph": "BELOVED FATHER AND GRANDFATHER"},
            "physical": {
                "material": "bronze",
                "form": "plaque",
                "condition": "excellent",
                "detail": "flush bronze marker",
            },
            "notes": "ARNOLD JASON ARONSON\nUS MERCHANT MARINE\n14 FEB 1926 — 23 JAN 2009",
        },
    },
    {
        "match": "Adlington",
        "id": "commons-adlington",
        "stone_type": "family",
        "ocr": (
            "IN LOVING MEMORY OF FLORENCE GEORGINA THE BELOVED WIFE OF "
            "ARTHUR F. ADLINGTON WHO PASSED AWAY 14TH MARCH 1934 AGED 63 YEARS\n"
            "AND HER SON CAPT. L. R. ADLINGTON WHO WAS KILLED IN BURMA 8TH MAY 1944 "
            "AGED 34 YEARS\nARTHUR FREDERICK ADLINGTON WHO FELL ASLEEP 1ST JAN 1949 "
            "AGED 79 YEARS\nLILIAN A. ADLINGTON LILIAN ANNIE ADLINGTON 1971"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Florence Georgina Adlington",
                    "forename": "Florence Georgina",
                    "surname": "Adlington",
                    "role_on_stone": "spouse",
                    "position": "upper",
                    "dates": {"birth": "", "death": "1934-03-14", "aged": 63},
                    "relationships": ["beloved wife of Arthur F. Adlington"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "City of London Cemetery Art Deco granite",
                },
                {
                    "full_name": "L. R. Adlington",
                    "forename": "L. R.",
                    "surname": "Adlington",
                    "role_on_stone": "child",
                    "position": "upper",
                    "dates": {"birth": "", "death": "1944-05-08", "aged": 34},
                    "relationships": ["son of Florence Georgina and Arthur Frederick"],
                    "occupation": "Captain",
                    "veteran": True,
                    "evidence": "killed in Burma",
                },
                {
                    "full_name": "Arthur Frederick Adlington",
                    "forename": "Arthur Frederick",
                    "surname": "Adlington",
                    "role_on_stone": "primary",
                    "position": "lower",
                    "dates": {"birth": "", "death": "1949-01-01", "aged": 79},
                    "relationships": ["husband of Florence Georgina"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "named on same monument",
                },
                {
                    "full_name": "Lilian Annie Adlington",
                    "forename": "Lilian Annie",
                    "surname": "Adlington",
                    "role_on_stone": "other",
                    "position": "lower",
                    "dates": {"birth": "", "death": "1971-01-01", "aged": None},
                    "relationships": [],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "later inscription 1971",
                },
            ],
            "shared": {"surname": "Adlington", "epitaph": ""},
            "physical": {
                "material": "granite",
                "form": "upright",
                "condition": "good",
                "detail": "dark polished granite Art Deco monument",
            },
            "notes": "Adlington family monument, City of London Cemetery",
        },
    },
    {
        "match": "10893486",
        "id": "commons-gordon",
        "stone_type": "war",
        "ocr": (
            "LIEUTENANT W. H. E. GORDON\nGORDON HIGHLANDERS\n"
            "30TH SEPTEMBER 1915\nOF SUCH IS THE KINGDOM OF HEAVEN"
        ),
        "target": {
            "people": [
                {
                    "full_name": "W. H. E. Gordon",
                    "title": "Lieutenant",
                    "forename": "W. H. E.",
                    "surname": "Gordon",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "", "death": "1915-09-30", "aged": None},
                    "relationships": [],
                    "occupation": "Gordon Highlanders",
                    "veteran": True,
                    "evidence": "CWGC-style Portland stone, stag BYDAND",
                }
            ],
            "shared": {
                "surname": "Gordon",
                "epitaph": "OF SUCH IS THE KINGDOM OF HEAVEN",
            },
            "physical": {
                "material": "limestone",
                "form": "upright",
                "condition": "good",
                "detail": "military pattern headstone",
            },
            "notes": "LIEUTENANT W. H. E. GORDON, GORDON HIGHLANDERS, 30 SEPTEMBER 1915",
        },
    },
    {
        "match": "1708_Gravestone",
        "id": "commons-wigglesworth",
        "stone_type": "single",
        "ocr": (
            "HERE LYES BURIED THE BODY OF MRS SIBYLL WIGGLESWORTH "
            "LAST WIFE TO THE REVEREND MR MICHAEL WIGGLESWORTH "
            "LATE OF MALDON WHO DEPARTED THIS LIFE ON THE SIXTH DAY OF AUGUST 1708 "
            "IN THE 53RD YEAR OF HER AGE"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Sibyll Wigglesworth",
                    "title": "Mrs",
                    "forename": "Sibyll",
                    "surname": "Wigglesworth",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "", "death": "1708-08-06", "aged": 53},
                    "relationships": [
                        "last wife to the Reverend Mr Michael Wigglesworth"
                    ],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "Maldon, 1708 slate death's-head stone",
                }
            ],
            "shared": {
                "surname": "Wigglesworth",
                "epitaph": "MEMENTO MORI / FUGIT HORA",
            },
            "physical": {
                "material": "slate",
                "form": "arched",
                "condition": "weathered",
                "detail": "colonial death's head, winged skull",
            },
            "notes": "Sibyll Wigglesworth, died 6 August 1708, aged 53",
        },
    },
    {
        "match": "Old_Diver",
        "id": "commons-mcguire",
        "stone_type": "single",
        "ocr": (
            "AUGUSTUS ABNER MCGUIRE\n"
            "DIVER\n"
            "BORN APRIL 24, 1856\n"
            "DIED SEPTEMBER 23, 1913"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Augustus Abner McGuire",
                    "forename": "Augustus Abner",
                    "surname": "McGuire",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {
                        "birth": "1856-04-24",
                        "death": "1913-09-23",
                        "aged": None,
                    },
                    "relationships": [],
                    "occupation": "Diver",
                    "veteran": False,
                    "evidence": "Ocracoke Island memorial, Old Diver",
                }
            ],
            "shared": {"surname": "McGuire", "epitaph": ""},
            "physical": {
                "material": "marble",
                "form": "arched",
                "condition": "good",
                "detail": "white upright, painted inscription",
            },
            "notes": "Augustus Abner McGuire (Old Diver), 24 April 1856 – 23 September 1913",
        },
    },
    {
        "match": "misprint_on_a_gravestone",
        "id": "commons-walker",
        "stone_type": "single",
        "ocr": "SACRED TO THE MEMORY OF\nJOSEPH WALKER",
        "target": {
            "people": [
                {
                    "full_name": "Joseph Walker",
                    "forename": "Joseph",
                    "surname": "Walker",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "", "death": "", "aged": None},
                    "relationships": [],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "weathered sandstone, City of London area churchyard",
                }
            ],
            "shared": {"surname": "Walker", "epitaph": "SACRED TO THE MEMORY OF"},
            "physical": {
                "material": "sandstone",
                "form": "arched",
                "condition": "weathered",
                "detail": "dates illegible; SAARED/SACRED miscut",
            },
            "notes": "JOSEPH WALKER; dates worn away",
        },
    },
    {
        "match": "Longnewton",
        "id": "commons-dods",
        "stone_type": "single",
        "ocr": (
            "JANET DODS\n"
            "SPOWS TO WALTER SCOT\n"
            "DIED MAY THE FIRST 1706\n"
            "HER AGE 70"
        ),
        "target": {
            "people": [
                {
                    "full_name": "Janet Dods",
                    "forename": "Janet",
                    "surname": "Dods",
                    "role_on_stone": "primary",
                    "position": "center",
                    "dates": {"birth": "", "death": "1706-05-01", "aged": 70},
                    "relationships": ["wife of Walter Scot"],
                    "occupation": "",
                    "veteran": False,
                    "evidence": "Longnewton memento mori, inscription on reverse",
                }
            ],
            "shared": {
                "surname": "Dods",
                "epitaph": "MEMENTO MORI",
            },
            "physical": {
                "material": "sandstone",
                "form": "arched",
                "condition": "weathered",
                "detail": "skull, hourglass, crossed bones",
            },
            "notes": "Janet Dods, spouse of Walter Scot, died 1 May 1706 aged 70",
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
