#!/usr/bin/env python3
"""
Generate clear synthetic headstone images with known gold REASONING labels
(names, dates, roles, relationships, occupations).

Includes multilingual inscriptions (fr, de, es, it, la, sv, ga, cy, pl, nl).
"""

from __future__ import annotations

import json
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as e:
    raise SystemExit("Pillow required: pip install Pillow") from e


def person(
    full_name: str,
    *,
    role: str = "primary",
    position: str = "center",
    birth: str = "",
    death: str = "",
    aged=None,
    relationships: list | None = None,
    occupation: str = "",
    veteran: bool = False,
    title: str = "",
    maiden_name: str = "",
    evidence: str = "inscription",
) -> dict:
    parts = full_name.split()
    return {
        "full_name": full_name,
        "title": title,
        "forename": " ".join(parts[:-1]) if len(parts) > 1 else "",
        "surname": parts[-1] if parts else "",
        "maiden_name": maiden_name,
        "role_on_stone": role,
        "position": position,
        "dates": {"birth": birth, "death": death, "aged": aged},
        "relationships": relationships or [],
        "occupation": occupation,
        "veteran": veteran,
        "evidence": evidence,
    }


SAMPLES = [
    {
        "id": "syn-001",
        "language": "en",
        "stone_type": "single",
        "lines": ["IN LOVING MEMORY OF", "JOHN SMITH", "1920 — 1998", "AGED 78 YEARS"],
        "target": {
            "people": [
                person("John Smith", birth="1920", death="1998", aged=78, evidence="center inscription")
            ],
            "shared": {"surname": "Smith", "epitaph": "IN LOVING MEMORY OF"},
            "notes": "IN LOVING MEMORY OF\nJOHN SMITH\n1920 — 1998\nAGED 78 YEARS",
        },
    },
    {
        "id": "syn-002",
        "language": "en",
        "stone_type": "couple",
        "lines": [
            "SACRED TO THE MEMORY OF",
            "MARY JONES",
            "1915 — 1989",
            "AND HER HUSBAND",
            "WILLIAM JONES",
            "1912 — 1991",
        ],
        "target": {
            "people": [
                person(
                    "Mary Jones",
                    birth="1915",
                    death="1989",
                    position="upper",
                    relationships=["wife of William Jones"],
                    evidence="upper name block",
                ),
                person(
                    "William Jones",
                    role="spouse",
                    position="lower",
                    birth="1912",
                    death="1991",
                    relationships=["husband of Mary Jones"],
                    evidence="lower name block",
                ),
            ],
            "shared": {"surname": "Jones", "epitaph": "SACRED TO THE MEMORY OF"},
            "notes": "\n".join(
                [
                    "SACRED TO THE MEMORY OF",
                    "MARY JONES",
                    "1915 — 1989",
                    "AND HER HUSBAND",
                    "WILLIAM JONES",
                    "1912 — 1991",
                ]
            ),
        },
    },
    {
        "id": "syn-003",
        "language": "en",
        "stone_type": "single",
        "lines": ["HERE LIES", "ANNE BROWN", "BORN 3 MARCH 1870", "DIED 12 JULY 1945"],
        "target": {
            "people": [
                person(
                    "Anne Brown",
                    birth="1870-03-03",
                    death="1945-07-12",
                    evidence="center panel",
                )
            ],
            "shared": {"surname": "Brown", "epitaph": "HERE LIES"},
            "notes": "HERE LIES\nANNE BROWN\nBORN 3 MARCH 1870\nDIED 12 JULY 1945",
        },
    },
    {
        "id": "syn-004",
        "language": "en",
        "stone_type": "family",
        "lines": [
            "THE WILSON FAMILY",
            "ROBERT WILSON 1888-1960",
            "ELIZABETH WILSON 1890-1965",
            "THOMAS WILSON 1915-1944",
        ],
        "target": {
            "people": [
                person("Robert Wilson", birth="1888", death="1960", position="upper", evidence="first name line"),
                person(
                    "Elizabeth Wilson",
                    role="spouse",
                    position="center",
                    birth="1890",
                    death="1965",
                    evidence="second name line",
                ),
                person(
                    "Thomas Wilson",
                    role="child",
                    position="lower",
                    birth="1915",
                    death="1944",
                    evidence="third name line",
                ),
            ],
            "shared": {"surname": "Wilson", "epitaph": "THE WILSON FAMILY"},
            "notes": "\n".join(
                [
                    "THE WILSON FAMILY",
                    "ROBERT WILSON 1888-1960",
                    "ELIZABETH WILSON 1890-1965",
                    "THOMAS WILSON 1915-1944",
                ]
            ),
        },
    },
    {
        "id": "syn-005",
        "language": "en",
        "stone_type": "war",
        "lines": [
            "PRIVATE",
            "JAMES O'CONNOR",
            "ROYAL IRISH RIFLES",
            "DIED 11 NOV 1918",
            "AGED 24",
        ],
        "target": {
            "people": [
                person(
                    "James O'Connor",
                    title="Private",
                    death="1918-11-11",
                    aged=24,
                    occupation="Royal Irish Rifles",
                    veteran=True,
                    evidence="war memorial style",
                )
            ],
            "shared": {"surname": "O'Connor", "epitaph": "ROYAL IRISH RIFLES"},
            "notes": "PRIVATE\nJAMES O'CONNOR\nROYAL IRISH RIFLES\nDIED 11 NOV 1918\nAGED 24",
        },
    },
    {
        "id": "syn-006",
        "language": "en",
        "stone_type": "single",
        "lines": ["REMEMBER", "SARAH THOMPSON", "NEE CLARK", "1832 — 1901"],
        "target": {
            "people": [
                person(
                    "Sarah Thompson",
                    birth="1832",
                    death="1901",
                    maiden_name="Clark",
                    relationships=["née Clark"],
                    evidence="center",
                )
            ],
            "shared": {"surname": "Thompson", "epitaph": "REMEMBER"},
            "notes": "REMEMBER\nSARAH THOMPSON\nNEE CLARK\n1832 — 1901",
        },
    },
    {
        "id": "syn-007",
        "language": "en",
        "stone_type": "couple",
        "lines": ["HENRY CLARK 1850-1920", "ALICE CLARK 1855-1931"],
        "target": {
            "people": [
                person(
                    "Henry Clark",
                    birth="1850",
                    death="1920",
                    position="upper",
                    relationships=["spouse of Alice Clark"],
                    evidence="first line",
                ),
                person(
                    "Alice Clark",
                    role="spouse",
                    position="lower",
                    birth="1855",
                    death="1931",
                    relationships=["spouse of Henry Clark"],
                    evidence="second line",
                ),
            ],
            "shared": {"surname": "Clark", "epitaph": ""},
            "notes": "HENRY CLARK 1850-1920\nALICE CLARK 1855-1931",
        },
    },
    {
        "id": "syn-008",
        "language": "en",
        "stone_type": "single",
        "lines": [
            "IN MEMORY OF",
            "PETER MURPHY",
            "BLACKSMITH",
            "DIED 22 JAN 1960",
            "AGED 67 YEARS",
        ],
        "target": {
            "people": [
                person(
                    "Peter Murphy",
                    death="1960-01-22",
                    aged=67,
                    occupation="Blacksmith",
                    evidence="center",
                )
            ],
            "shared": {"surname": "Murphy", "epitaph": "IN MEMORY OF"},
            "notes": "IN MEMORY OF\nPETER MURPHY\nBLACKSMITH\nDIED 22 JAN 1960\nAGED 67 YEARS",
        },
    },
    {
        "id": "syn-009",
        "language": "en",
        "stone_type": "child",
        "lines": ["BELOVED DAUGHTER", "EMILY ROSE PARKER", "2001 — 2005"],
        "target": {
            "people": [
                person(
                    "Emily Rose Parker",
                    role="child",
                    birth="2001",
                    death="2005",
                    evidence="child stone",
                )
            ],
            "shared": {"surname": "Parker", "epitaph": "BELOVED DAUGHTER"},
            "notes": "BELOVED DAUGHTER\nEMILY ROSE PARKER\n2001 — 2005",
        },
    },
    {
        "id": "syn-010",
        "language": "en",
        "stone_type": "couple",
        "lines": [
            "TOGETHER FOREVER",
            "DAVID GREEN",
            "1940 — 2010",
            "AND",
            "LINDA GREEN",
            "1942 — 2018",
        ],
        "target": {
            "people": [
                person(
                    "David Green",
                    birth="1940",
                    death="2010",
                    position="upper",
                    relationships=["spouse of Linda Green"],
                    evidence="upper",
                ),
                person(
                    "Linda Green",
                    role="spouse",
                    position="lower",
                    birth="1942",
                    death="2018",
                    relationships=["spouse of David Green"],
                    evidence="lower",
                ),
            ],
            "shared": {"surname": "Green", "epitaph": "TOGETHER FOREVER"},
            "notes": "TOGETHER FOREVER\nDAVID GREEN\n1940 — 2010\nAND\nLINDA GREEN\n1942 — 2018",
        },
    },
    {
        "id": "syn-011",
        "language": "en",
        "stone_type": "couple",
        "lines": [
            "IN LOVING MEMORY OF",
            "MARGARET HUGHES",
            "WIFE OF JOHN HUGHES",
            "1901 — 1978",
            "AND HER HUSBAND",
            "JOHN HUGHES",
            "TEACHER",
            "1898 — 1982",
        ],
        "target": {
            "people": [
                person(
                    "Margaret Hughes",
                    birth="1901",
                    death="1978",
                    position="upper",
                    relationships=["wife of John Hughes"],
                    evidence="upper",
                ),
                person(
                    "John Hughes",
                    role="spouse",
                    position="lower",
                    birth="1898",
                    death="1982",
                    relationships=["husband of Margaret Hughes"],
                    occupation="Teacher",
                    evidence="lower",
                ),
            ],
            "shared": {"surname": "Hughes", "epitaph": "IN LOVING MEMORY OF"},
            "notes": "\n".join(
                [
                    "IN LOVING MEMORY OF",
                    "MARGARET HUGHES",
                    "WIFE OF JOHN HUGHES",
                    "1901 — 1978",
                    "AND HER HUSBAND",
                    "JOHN HUGHES",
                    "TEACHER",
                    "1898 — 1982",
                ]
            ),
        },
    },
    {
        "id": "syn-012",
        "language": "en",
        "stone_type": "single",
        "lines": [
            "SACRED TO THE MEMORY OF",
            "CAPT THOMAS REID",
            "MERCHANT NAVY",
            "1880 — 1943",
        ],
        "target": {
            "people": [
                person(
                    "Thomas Reid",
                    title="Captain",
                    birth="1880",
                    death="1943",
                    occupation="Merchant Navy",
                    veteran=True,
                    evidence="center",
                )
            ],
            "shared": {"surname": "Reid", "epitaph": "SACRED TO THE MEMORY OF"},
            "notes": "SACRED TO THE MEMORY OF\nCAPT THOMAS REID\nMERCHANT NAVY\n1880 — 1943",
        },
    },
    # --- Multilingual ---
    {
        "id": "syn-fr-001",
        "language": "fr",
        "stone_type": "single",
        "lines": ["ICI REPOSE", "JEAN DUPONT", "1920 — 1998", "AGE DE 78 ANS"],
        "target": {
            "people": [person("Jean Dupont", birth="1920", death="1998", aged=78, evidence="fr")],
            "shared": {"surname": "Dupont", "epitaph": "ICI REPOSE"},
            "notes": "ICI REPOSE\nJEAN DUPONT\n1920 — 1998\nAGE DE 78 ANS",
        },
    },
    {
        "id": "syn-fr-002",
        "language": "fr",
        "stone_type": "couple",
        "lines": [
            "A LA MEMOIRE DE",
            "MARIE MARTIN",
            "EPOUSE DE PIERRE MARTIN",
            "1915 — 1989",
            "ET SON EPOUX",
            "PIERRE MARTIN",
            "1912 — 1991",
        ],
        "target": {
            "people": [
                person(
                    "Marie Martin",
                    birth="1915",
                    death="1989",
                    position="upper",
                    relationships=["wife of Pierre Martin"],
                    evidence="fr couple",
                ),
                person(
                    "Pierre Martin",
                    role="spouse",
                    position="lower",
                    birth="1912",
                    death="1991",
                    relationships=["husband of Marie Martin"],
                    evidence="fr couple",
                ),
            ],
            "shared": {"surname": "Martin", "epitaph": "A LA MEMOIRE DE"},
            "notes": "\n".join(
                [
                    "A LA MEMOIRE DE",
                    "MARIE MARTIN",
                    "EPOUSE DE PIERRE MARTIN",
                    "1915 — 1989",
                    "ET SON EPOUX",
                    "PIERRE MARTIN",
                    "1912 — 1991",
                ]
            ),
        },
    },
    {
        "id": "syn-fr-003",
        "language": "fr",
        "stone_type": "single",
        "lines": [
            "ICI REPOSE",
            "FRANCOIS BERNARD",
            "INSTITUTEUR",
            "NE LE 3 MARS 1870",
            "DECEDE LE 12 JUILLET 1945",
        ],
        "target": {
            "people": [
                person(
                    "Francois Bernard",
                    birth="1870-03-03",
                    death="1945-07-12",
                    occupation="Instituteur",
                    evidence="fr occupation",
                )
            ],
            "shared": {"surname": "Bernard", "epitaph": "ICI REPOSE"},
            "notes": "ICI REPOSE\nFRANCOIS BERNARD\nINSTITUTEUR\nNE LE 3 MARS 1870\nDECEDE LE 12 JUILLET 1945",
        },
    },
    {
        "id": "syn-de-001",
        "language": "de",
        "stone_type": "single",
        "lines": ["HIER RUHET", "HANS MUELLER", "* 1888", "† 1960"],
        "target": {
            "people": [person("Hans Mueller", birth="1888", death="1960", evidence="de")],
            "shared": {"surname": "Mueller", "epitaph": "HIER RUHET"},
            "notes": "HIER RUHET\nHANS MUELLER\n* 1888\n† 1960",
        },
    },
    {
        "id": "syn-de-002",
        "language": "de",
        "stone_type": "couple",
        "lines": [
            "ZUM GEDENKEN AN",
            "ANNA SCHMIDT",
            "GATTIN VON KARL SCHMIDT",
            "1890 — 1965",
            "UND IHR EHEMANN",
            "KARL SCHMIDT",
            "1888 — 1960",
        ],
        "target": {
            "people": [
                person(
                    "Anna Schmidt",
                    birth="1890",
                    death="1965",
                    position="upper",
                    relationships=["wife of Karl Schmidt"],
                    evidence="de couple",
                ),
                person(
                    "Karl Schmidt",
                    role="spouse",
                    position="lower",
                    birth="1888",
                    death="1960",
                    relationships=["husband of Anna Schmidt"],
                    evidence="de couple",
                ),
            ],
            "shared": {"surname": "Schmidt", "epitaph": "ZUM GEDENKEN AN"},
            "notes": "\n".join(
                [
                    "ZUM GEDENKEN AN",
                    "ANNA SCHMIDT",
                    "GATTIN VON KARL SCHMIDT",
                    "1890 — 1965",
                    "UND IHR EHEMANN",
                    "KARL SCHMIDT",
                    "1888 — 1960",
                ]
            ),
        },
    },
    {
        "id": "syn-de-003",
        "language": "de",
        "stone_type": "war",
        "lines": ["SOLDAT", "FRIEDRICH WEBER", "INFANTERIE", "GEFALLEN 11 NOV 1918"],
        "target": {
            "people": [
                person(
                    "Friedrich Weber",
                    title="Soldat",
                    death="1918-11-11",
                    occupation="Infanterie",
                    veteran=True,
                    evidence="de war",
                )
            ],
            "shared": {"surname": "Weber", "epitaph": "INFANTERIE"},
            "notes": "SOLDAT\nFRIEDRICH WEBER\nINFANTERIE\nGEFALLEN 11 NOV 1918",
        },
    },
    {
        "id": "syn-es-001",
        "language": "es",
        "stone_type": "single",
        "lines": ["AQUI DESCANSA", "MARIA LOPEZ", "1920 — 1998", "A LA EDAD DE 78 ANOS"],
        "target": {
            "people": [person("Maria Lopez", birth="1920", death="1998", aged=78, evidence="es")],
            "shared": {"surname": "Lopez", "epitaph": "AQUI DESCANSA"},
            "notes": "AQUI DESCANSA\nMARIA LOPEZ\n1920 — 1998\nA LA EDAD DE 78 ANOS",
        },
    },
    {
        "id": "syn-es-002",
        "language": "es",
        "stone_type": "couple",
        "lines": [
            "EN MEMORIA DE",
            "CARMEN RUIZ",
            "ESPOSA DE JOSE RUIZ",
            "1915 — 1989",
            "Y SU ESPOSO",
            "JOSE RUIZ",
            "1912 — 1991",
        ],
        "target": {
            "people": [
                person(
                    "Carmen Ruiz",
                    birth="1915",
                    death="1989",
                    position="upper",
                    relationships=["wife of Jose Ruiz"],
                    evidence="es couple",
                ),
                person(
                    "Jose Ruiz",
                    role="spouse",
                    position="lower",
                    birth="1912",
                    death="1991",
                    relationships=["husband of Carmen Ruiz"],
                    evidence="es couple",
                ),
            ],
            "shared": {"surname": "Ruiz", "epitaph": "EN MEMORIA DE"},
            "notes": "\n".join(
                [
                    "EN MEMORIA DE",
                    "CARMEN RUIZ",
                    "ESPOSA DE JOSE RUIZ",
                    "1915 — 1989",
                    "Y SU ESPOSO",
                    "JOSE RUIZ",
                    "1912 — 1991",
                ]
            ),
        },
    },
    {
        "id": "syn-it-001",
        "language": "it",
        "stone_type": "single",
        "lines": ["QUI GIACE", "GIUSEPPE ROSSI", "NATO 3 MARZO 1870", "MORTO 12 LUGLIO 1945"],
        "target": {
            "people": [
                person(
                    "Giuseppe Rossi",
                    birth="1870-03-03",
                    death="1945-07-12",
                    evidence="it",
                )
            ],
            "shared": {"surname": "Rossi", "epitaph": "QUI GIACE"},
            "notes": "QUI GIACE\nGIUSEPPE ROSSI\nNATO 3 MARZO 1870\nMORTO 12 LUGLIO 1945",
        },
    },
    {
        "id": "syn-la-001",
        "language": "la",
        "stone_type": "single",
        "lines": ["HIC IACET", "MARCUS AURELIUS", "NATUS 120", "OBIIT 180"],
        "target": {
            "people": [person("Marcus Aurelius", birth="120", death="180", evidence="la")],
            "shared": {"surname": "Aurelius", "epitaph": "HIC IACET"},
            "notes": "HIC IACET\nMARCUS AURELIUS\nNATUS 120\nOBIIT 180",
        },
    },
    {
        "id": "syn-sv-001",
        "language": "sv",
        "stone_type": "single",
        "lines": ["HAR HVILAR", "ERIK ANDERSSON", "FODD 12 FEB 1825", "DOD 10 OKT 1910"],
        "target": {
            "people": [
                person(
                    "Erik Andersson",
                    birth="1825-02-12",
                    death="1910-10-10",
                    evidence="sv",
                )
            ],
            "shared": {"surname": "Andersson", "epitaph": "HAR HVILAR"},
            "notes": "HAR HVILAR\nERIK ANDERSSON\nFODD 12 FEB 1825\nDOD 10 OKT 1910",
        },
    },
    {
        "id": "syn-ga-001",
        "language": "ga",
        "stone_type": "single",
        "lines": ["I gCUIMHNE", "SEAN O BRIAN", "1920 — 1998"],
        "target": {
            "people": [person("Sean O Brian", birth="1920", death="1998", evidence="ga")],
            "shared": {"surname": "Brian", "epitaph": "I gCUIMHNE"},
            "notes": "I gCUIMHNE\nSEAN O BRIAN\n1920 — 1998",
        },
    },
    {
        "id": "syn-cy-001",
        "language": "cy",
        "stone_type": "single",
        "lines": ["ER COF AM", "DAFYDD JONES", "1850 — 1920", "YN 70 MLWYDD OED"],
        "target": {
            "people": [person("Dafydd Jones", birth="1850", death="1920", aged=70, evidence="cy")],
            "shared": {"surname": "Jones", "epitaph": "ER COF AM"},
            "notes": "ER COF AM\nDAFYDD JONES\n1850 — 1920\nYN 70 MLWYDD OED",
        },
    },
    {
        "id": "syn-pl-001",
        "language": "pl",
        "stone_type": "single",
        "lines": ["TU SPOCZYWA", "JAN KOWALSKI", "1920 — 1998", "ZYL 78 LAT"],
        "target": {
            "people": [person("Jan Kowalski", birth="1920", death="1998", aged=78, evidence="pl")],
            "shared": {"surname": "Kowalski", "epitaph": "TU SPOCZYWA"},
            "notes": "TU SPOCZYWA\nJAN KOWALSKI\n1920 — 1998\nZYL 78 LAT",
        },
    },
    {
        "id": "syn-nl-001",
        "language": "nl",
        "stone_type": "single",
        "lines": ["HIER RUST", "PIETER DE VRIES", "1920 — 1998", "OP DE LEEFTIJD VAN 78 JAAR"],
        "target": {
            "people": [person("Pieter De Vries", birth="1920", death="1998", aged=78, evidence="nl")],
            "shared": {"surname": "Vries", "epitaph": "HIER RUST"},
            "notes": "HIER RUST\nPIETER DE VRIES\n1920 — 1998\nOP DE LEEFTIJD VAN 78 JAAR",
        },
    },
    {
        "id": "syn-it-002",
        "language": "it",
        "stone_type": "couple",
        "lines": [
            "IN MEMORIA DI",
            "ANNA BIANCHI",
            "MOGLIE DI LUIGI BIANCHI",
            "1915 — 1989",
            "E SUO MARITO",
            "LUIGI BIANCHI",
            "FALEGNAME",
            "1912 — 1991",
        ],
        "target": {
            "people": [
                person(
                    "Anna Bianchi",
                    birth="1915",
                    death="1989",
                    position="upper",
                    relationships=["wife of Luigi Bianchi"],
                    evidence="it couple",
                ),
                person(
                    "Luigi Bianchi",
                    role="spouse",
                    position="lower",
                    birth="1912",
                    death="1991",
                    relationships=["husband of Anna Bianchi"],
                    occupation="Falegname",
                    evidence="it couple",
                ),
            ],
            "shared": {"surname": "Bianchi", "epitaph": "IN MEMORIA DI"},
            "notes": "\n".join(
                [
                    "IN MEMORIA DI",
                    "ANNA BIANCHI",
                    "MOGLIE DI LUIGI BIANCHI",
                    "1915 — 1989",
                    "E SUO MARITO",
                    "LUIGI BIANCHI",
                    "FALEGNAME",
                    "1912 — 1991",
                ]
            ),
        },
    },
    {
        "id": "syn-013",
        "language": "en",
        "stone_type": "couple",
        "lines": [
            "IN LOVING MEMORY OF",
            "DENNIS WILLIAM FONE",
            "25TH JUNE 1933",
            "1ST OCTOBER 2020",
            "AND HIS WIFE",
            "BERYL JEAN FONE",
            "2ND FEBRUARY 1948",
            "1ST NOVEMBER 2021",
        ],
        "target": {
            "people": [
                person(
                    "Dennis William Fone",
                    birth="1933-06-25",
                    death="2020-10-01",
                    position="upper",
                    relationships=["husband of Beryl Jean Fone"],
                    evidence="consecutive UK ordinal dates",
                ),
                person(
                    "Beryl Jean Fone",
                    role="spouse",
                    position="lower",
                    birth="1948-02-02",
                    death="2021-11-01",
                    relationships=["wife of Dennis William Fone"],
                    evidence="consecutive UK ordinal dates",
                ),
            ],
            "shared": {"surname": "Fone", "epitaph": "IN LOVING MEMORY OF"},
            "notes": "\n".join(
                [
                    "IN LOVING MEMORY OF",
                    "DENNIS WILLIAM FONE",
                    "25TH JUNE 1933",
                    "1ST OCTOBER 2020",
                    "AND HIS WIFE",
                    "BERYL JEAN FONE",
                    "2ND FEBRUARY 1948",
                    "1ST NOVEMBER 2021",
                ]
            ),
        },
    },
    {
        "id": "syn-014",
        "language": "en",
        "stone_type": "single",
        "lines": [
            "AUGUSTUS ABNER MCGUIRE",
            "DIVER",
            "BORN APRIL 24, 1856",
            "DIED SEPTEMBER 23, 1913",
        ],
        "target": {
            "people": [
                person(
                    "Augustus Abner McGuire",
                    birth="1856-04-24",
                    death="1913-09-23",
                    occupation="Diver",
                    evidence="US month-first dates",
                )
            ],
            "shared": {"surname": "McGuire", "epitaph": ""},
            "notes": "AUGUSTUS ABNER MCGUIRE\nDIVER\nBORN APRIL 24, 1856\nDIED SEPTEMBER 23, 1913",
        },
    },
    {
        "id": "syn-015",
        "language": "en",
        "stone_type": "single",
        "lines": [
            "JANET DODS",
            "SPOWS TO WALTER SCOT",
            "DIED MAY THE FIRST 1706",
            "HER AGE 70",
        ],
        "target": {
            "people": [
                person(
                    "Janet Dods",
                    death="1706-05-01",
                    aged=70,
                    relationships=["wife of Walter Scot"],
                    evidence="colonial word-ordinal date",
                )
            ],
            "shared": {"surname": "Dods", "epitaph": ""},
            "notes": "JANET DODS\nSPOWS TO WALTER SCOT\nDIED MAY THE FIRST 1706\nHER AGE 70",
        },
    },
    {
        "id": "syn-016",
        "language": "en",
        "stone_type": "war",
        "lines": [
            "ARNOLD JASON ARONSON",
            "US MERCHANT MARINE",
            "FEB 14 1926 JAN 23 2009",
        ],
        "target": {
            "people": [
                person(
                    "Arnold Jason Aronson",
                    birth="1926-02-14",
                    death="2009-01-23",
                    occupation="US Merchant Marine",
                    veteran=True,
                    evidence="two US dates on one line",
                )
            ],
            "shared": {"surname": "Aronson", "epitaph": ""},
            "notes": "ARNOLD JASON ARONSON\nUS MERCHANT MARINE\nFEB 14 1926 JAN 23 2009",
        },
    },
]


def render(sample: dict, dest: Path) -> None:
    w, h = 768, 1100
    img = Image.new("RGB", (w, h), (90, 95, 88))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((80, 60, w - 80, h - 60), radius=24, fill=(160, 160, 155))
    draw.rounded_rectangle((100, 80, w - 100, h - 80), radius=16, fill=(175, 175, 168))

    try:
        font = ImageFont.truetype("arial.ttf", 34)
        font_sm = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        font = ImageFont.load_default()
        font_sm = font

    y = 140
    for i, line in enumerate(sample["lines"]):
        f = font if i <= 2 else font_sm
        bbox = draw.textbbox((0, 0), line, font=f)
        tw = bbox[2] - bbox[0]
        draw.text(((w - tw) / 2, y), line, fill=(30, 30, 30), font=f)
        y += 58 if i <= 2 else 48

    img.save(dest, quality=95)


def main() -> int:
    out = Path("training/samples/synthetic")
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for s in SAMPLES:
        path = out / f"{s['id']}.jpg"
        render(s, path)
        manifest.append(
            {
                "id": s["id"],
                "path": str(path.as_posix()),
                "source": "synthetic",
                "language": s.get("language", "en"),
                "stone_type": s["stone_type"],
                "license": "generated",
                "target": s["target"],
            }
        )
        print(f"[synthetic] {path} ({s.get('language', 'en')})")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    langs = sorted({m["language"] for m in manifest})
    print(f"[synthetic] {len(manifest)} samples across languages: {', '.join(langs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
