#!/usr/bin/env python3
"""
Local headstone REASONING extract eval.

Pipeline (fully local, no cloud):
  1. Preprocess / OCR (or .ocr.txt sidecar)
  2. Parse names, dates, roles, relationships, occupations, veteran flags
  3. Score against gold reasoning labels (not just transcription)

Goal: 100% on training/samples/**/manifest.json including relationship/occupation fields.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES_ROOT = ROOT / "training" / "samples"

MONTHS = {
    # EN
    "january": "01",
    "february": "02",
    "march": "03",
    "april": "04",
    "may": "05",
    "june": "06",
    "july": "07",
    "august": "08",
    "september": "09",
    "october": "10",
    "november": "11",
    "december": "12",
    "jan": "01",
    "feb": "02",
    "mar": "03",
    "apr": "04",
    "jun": "06",
    "jul": "07",
    "aug": "08",
    "sep": "09",
    "sept": "09",
    "oct": "10",
    "nov": "11",
    "dec": "12",
    # FR
    "janvier": "01",
    "février": "02",
    "fevrier": "02",
    "mars": "03",
    "avril": "04",
    "mai": "05",
    "juin": "06",
    "juillet": "07",
    "août": "08",
    "aout": "08",
    "septembre": "09",
    "octobre": "10",
    "novembre": "11",
    "décembre": "12",
    "decembre": "12",
    # DE
    "januar": "01",
    "februar": "02",
    "märz": "03",
    "maerz": "03",
    "mai": "05",
    "juni": "06",
    "juli": "07",
    "august": "08",
    "oktober": "10",
    "dezember": "12",
    # ES / IT / PT-ish
    "enero": "01",
    "febrero": "02",
    "marzo": "03",
    "abril": "04",
    "mayo": "05",
    "junio": "06",
    "julio": "07",
    "agosto": "08",
    "septiembre": "09",
    "octubre": "10",
    "noviembre": "11",
    "diciembre": "12",
    "gennaio": "01",
    "febbraio": "02",
    "aprile": "04",
    "maggio": "05",
    "giugno": "06",
    "luglio": "07",
    "settembre": "09",
    "ottobre": "10",
    "novembre": "11",
    "dicembre": "12",
    # SV
    "januari": "01",
    "februari": "02",
    "mars": "03",
    "april": "04",
    "maj": "05",
    "juni": "06",
    "juli": "07",
    "augusti": "08",
    "september": "09",
    "oktober": "10",
    "okt": "10",
    "november": "11",
    "december": "12",
}

# Unicode letter token (after uppercasing)
NAME_TOKEN = r"[^\W\d_](?:[\w'\-]*)"
NAME_PHRASE = rf"{NAME_TOKEN}(?:\s+{NAME_TOKEN}){{0,4}}"

NAME_STOP = {
    # EN
    "IN",
    "LOVING",
    "MEMORY",
    "OF",
    "HERE",
    "LIES",
    "LYETH",
    "SACRED",
    "TO",
    "THE",
    "AND",
    "HER",
    "HIS",
    "HUSBAND",
    "WIFE",
    "AGED",
    "YEARS",
    "YEAR",
    "BORN",
    "DIED",
    "PRIVATE",
    "FAMILY",
    "REST",
    "PEACE",
    "WHO",
    "WAS",
    "DEARLY",
    "BELOVED",
    "REMEMBER",
    "TOGETHER",
    "FOREVER",
    "DAUGHTER",
    "SON",
    "FATHER",
    "MOTHER",
    "BROTHER",
    "SISTER",
    "ALSO",
    "LATE",
    "FORMERLY",
    "NEE",
    "NÉE",
    # FR
    "ICI",
    "REPOSE",
    "REPOSENT",
    "A",
    "LA",
    "MEMOIRE",
    "MÉMOIRE",
    "DE",
    "EN",
    "AGE",
    "ÂGE",
    "ANS",
    "NE",
    "NÉ",
    "NEE",
    "NÉE",
    "LE",
    "DECEDE",
    "DÉCÉDÉ",
    "DECEDEE",
    "ET",
    "SON",
    "SA",
    "EPOUX",
    "ÉPOUX",
    "EPOUSE",
    "ÉPOUSE",
    "FEMME",
    "MARI",
    # DE
    "HIER",
    "RUHET",
    "RUHT",
    "ZUM",
    "GEDENKEN",
    "AN",
    "GATTIN",
    "GATTEN",
    "EHEMANN",
    "EHEFRAU",
    "VON",
    "UND",
    "IHR",
    "SEINE",
    "GEB",
    "GEBOREN",
    "GEST",
    "GESTORBEN",
    "GEFALLEN",
    "IM",
    "ALTER",
    "JAHREN",
    "SOLDAT",
    # ES
    "AQUI",
    "AQUÍ",
    "DESCANSA",
    "DESCANSE",
    "MEMORIA",
    "ESPOSA",
    "ESPOSO",
    "SU",
    "Y",
    "EDAD",
    "ANOS",
    "AÑOS",
    "NACIDO",
    "NACIDA",
    "FALLECIDO",
    "FALLECIDA",
    # IT
    "QUI",
    "GIACE",
    "GIACCIONO",
    "NATO",
    "NATA",
    "MORTO",
    "MORTA",
    "MOGLIE",
    "MARITO",
    "SUO",
    "SUA",
    "E",
    "DI",
    # LA
    "HIC",
    "IACET",
    "JACET",
    "NATUS",
    "NATA",
    "OBIIT",
    "ANNO",
    "UXOR",
    "CONIUX",
    # SV
    "HAR",
    "HÄR",
    "HVILAR",
    "VILAR",
    "FODD",
    "FÖDD",
    "DOD",
    "DÖD",
    "VILA",
    "FRID",
    # GA / CY
    "I",
    "GCUIMHNE",
    "CUIMHNE",
    "ER",
    "COF",
    "AM",
    "SERCHUS",
    "YN",
    "MLWYDD",
    "OED",
    # PL
    "TU",
    "SPOCZYWA",
    "SPOCZYWAJĄ",
    "ZYL",
    "ŻYŁ",
    "LAT",
    "ROKU",
    # NL
    "RUST",
    "RUSTEN",
    "OP",
    "DE",
    "LEEFTIJD",
    "VAN",
    "JAAR",
    "JAREN",
    "TER",
    "NAGEDACHTENIS",
    "AAN",
}

EPITAPH_LINES = {
    "IN LOVING MEMORY OF",
    "SACRED TO THE MEMORY OF",
    "IN MEMORY OF",
    "HERE LIES",
    "HERE LYETH",
    "HERE LYES",
    "HERE LYES BURIED THE BODY OF",
    "REMEMBER",
    "TOGETHER FOREVER",
    "REST IN PEACE",
    "ICI REPOSE",
    "ICI REPOSENT",
    "A LA MEMOIRE DE",
    "A LA MÉMOIRE DE",
    "EN MEMOIRE DE",
    "EN MÉMOIRE DE",
    "HIER RUHET",
    "HIER RUHT",
    "ZUM GEDENKEN AN",
    "AQUI DESCANSA",
    "AQUÍ DESCANSA",
    "EN MEMORIA DE",
    "QUI GIACE",
    "IN MEMORIA DI",
    "HIC IACET",
    "HIC JACET",
    "IN MEMORIAM",
    "HAR HVILAR",
    "HÄR VILAR",
    "I GCUIMHNE",
    "ER COF AM",
    "ER SERCHUS GOF AM",
    "TU SPOCZYWA",
    "HIER RUST",
    "TER NAGEDACHTENIS AAN",
}

# Lines that are occupations / units rather than personal names
OCCUPATION_HINTS = re.compile(
    r"\b("
    r"RIFLES?|REGIMENT|CORPS|NAVY|ARMY|MARINES?|MERCHANT|ENGINEER|BLACKSMITH|"
        r"FARMER|TEACHER|DOCTOR|NURSE|MINER|SAILOR|DIVER|PILOT|CAPTAIN|LIEUTENANT|"
    r"SERGEANT|CORPORAL|PRIVATE|REVEREND|VICAR|CLERK|BAKER|BUTCHER|"
    r"CARPENTER|MASON|SOLDIER|AIRMAN|SEAMAN|GUNNER|DRIVER|"
    r"INSTITUTEUR|INSTITUTRICE|MENUISIER|BOULANGER|MEDECIN|MÉDECIN|"
    r"INFANTERIE|ARTILLERIE|SOLDAT|"
    r"FALEGNAME|MEDICO|CONTADINO|"
    r"MAESTRO|PROFESOR|CAMPESINO|"
    r"ONDERWIJZER|SMID"
    r")\b",
    re.I,
)

TITLE_MAP = {
    "PRIVATE": "Private",
    "PTE": "Private",
    "SGT": "Sergeant",
    "SERGEANT": "Sergeant",
    "LT": "Lieutenant",
    "LIEUTENANT": "Lieutenant",
    "CAPT": "Captain",
    "CAPTAIN": "Captain",
    "REV": "Reverend",
    "REVEREND": "Reverend",
    "DR": "Doctor",
    "DOCTOR": "Doctor",
    "SOLDAT": "Soldat",
    "SOLDADO": "Soldado",
}


@dataclass
class Score:
    sample_id: str
    ok: bool
    expected_names: list[str]
    got_names: list[str]
    detail: str


def fold_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c))


def normalize_name(s: str) -> str:
    s = fold_accents(s).lower().strip()
    s = s.replace("'", "'").replace("'", "'")
    s = re.sub(r"[^a-z\s'-]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_rel(s: str) -> str:
    s = fold_accents(s or "").lower().strip()
    s = s.replace("'", "'")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("wife of the late ", "wife of ")
    s = s.replace("husband of the late ", "husband of ")
    # multilingual → English canonical for scoring
    s = re.sub(r"^(epouse|épouse|gattin|ehefrau|esposa|moglie|uxor) de? ", "wife of ", s)
    s = re.sub(r"^(epoux|époux|ehemann|esposo|marito|coniux) de? ", "husband of ", s)
    s = re.sub(r"^gattin von ", "wife of ", s)
    s = re.sub(r"^ehemann von ", "husband of ", s)
    s = re.sub(r"^esposa de ", "wife of ", s)
    s = re.sub(r"^esposo de ", "husband of ", s)
    s = re.sub(r"^moglie di ", "wife of ", s)
    s = re.sub(r"^marito di ", "husband of ", s)
    return s


def normalize_occupation(s: str) -> str:
    return re.sub(r"\s+", " ", fold_accents(s or "").lower().strip())


def year(x: str) -> str:
    m = re.search(r"(\d{4})", x or "")
    if m:
        return m.group(1)
    m = re.search(r"(\d{1,4})", x or "")
    return m.group(1) if m else (x or "")


def title_case_name(s: str) -> str:
    parts = []
    for w in s.split():
        if re.fullmatch(r"O['’].+", w, re.I):
            parts.append("O'" + w.split("'", 1)[-1].split("’", 1)[-1].title())
        else:
            parts.append(w[:1].upper() + w[1:].lower() if w else w)
    full = " ".join(parts)
    full = re.sub(r"\bO'Connor\b", "O'Connor", full, flags=re.I)
    return full


ORDINAL_WORDS = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
    "eleventh": 11,
    "twelfth": 12,
    "thirteenth": 13,
    "fourteenth": 14,
    "fifteenth": 15,
    "sixteenth": 16,
    "seventeenth": 17,
    "eighteenth": 18,
    "nineteenth": 19,
    "twentieth": 20,
    "thirtieth": 30,
}


def _month_num(raw: str) -> str | None:
    return MONTHS.get(fold_accents(raw or "").lower().rstrip("."))


def pad_year_iso(y: str) -> str:
    if re.fullmatch(r"\d{4}", y or ""):
        return f"{y}-01-01"
    return y or ""


def normalize_date_to_iso(value: str) -> str:
    """Mirror src/utils/inscriptionDates.ts — always yyyy-mm-dd when parseable."""
    raw = (value or "").strip()
    if not raw:
        return ""
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if iso:
        return raw
    year_only = re.fullmatch(r"(\d{4})", raw)
    if year_only:
        return f"{year_only.group(1)}-01-01"

    ordinal = re.search(
        r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{4})",
        raw,
        re.I,
    )
    if ordinal:
        mon = _month_num(ordinal.group(2))
        if mon:
            return f"{ordinal.group(3)}-{mon}-{int(ordinal.group(1)):02d}"

    month_first = re.search(
        r"([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})",
        raw,
        re.I,
    )
    if month_first:
        mon = _month_num(month_first.group(1))
        if mon:
            return f"{month_first.group(3)}-{mon}-{int(month_first.group(2)):02d}"

    month_year = re.search(r"^([A-Za-z]+)\.?\s+(\d{4})$", raw, re.I)
    if month_year:
        mon = _month_num(month_year.group(1))
        if mon:
            return f"{month_year.group(2)}-{mon}-01"

    word_day_of = re.search(
        rf"(?:the\s+)?({'|'.join(ORDINAL_WORDS)})\s+day\s+of\s+([A-Za-z]+)\s+(\d{{4}})",
        raw,
        re.I,
    )
    if word_day_of:
        mon = _month_num(word_day_of.group(2))
        day = ORDINAL_WORDS.get(word_day_of.group(1).lower())
        if mon and day:
            return f"{word_day_of.group(3)}-{mon}-{day:02d}"

    month_the_word = re.search(
        rf"([A-Za-z]+)\s+the\s+({'|'.join(ORDINAL_WORDS)})\s+(\d{{4}})",
        raw,
        re.I,
    )
    if month_the_word:
        mon = _month_num(month_the_word.group(1))
        day = ORDINAL_WORDS.get(month_the_word.group(2).lower())
        if mon and day:
            return f"{month_the_word.group(3)}-{mon}-{day:02d}"

    numeric = re.search(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$", raw)
    if numeric:
        y = int(numeric.group(3))
        if y < 100:
            y += 1900 if y >= 50 else 2000
        a, b = int(numeric.group(1)), int(numeric.group(2))
        if a > 12 and b <= 12:
            return f"{y}-{b:02d}-{a:02d}"
        if b > 12 and a <= 12:
            return f"{y}-{a:02d}-{b:02d}"
        return f"{y}-{b:02d}-{a:02d}"
    return ""


def parse_day_month_year(text: str) -> str | None:
    iso = normalize_date_to_iso(text)
    return iso or None


DATE_FIND_RE = re.compile(
    r"("
    r"\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?\s+\d{4}"
    r"|[A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}"
    r"|(?:the\s+)?(?:"
    + "|".join(ORDINAL_WORDS)
    + r")\s+day\s+of\s+[A-Za-z]+\s+\d{4}"
    r"|[A-Za-z]+\s+the\s+(?:"
    + "|".join(ORDINAL_WORDS)
    + r")\s+\d{4}"
    r")",
    re.I,
)


def extract_dates_from_text(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for m in DATE_FIND_RE.finditer(text or ""):
        iso = normalize_date_to_iso(m.group(0))
        if iso and iso not in seen:
            seen.add(iso)
            found.append(iso)
    return found


BIRTH_CTX_RE = re.compile(
    r"\b(?:BORN|NE|N[EÉ]|NATO|NATA|NATUS|FODD|F[OÖ]DD|GEB(?:OREN)?\.?|"
    r"NACIDO|NACIDA)\b",
    re.I,
)
DEATH_CTX_RE = re.compile(
    r"\b(?:DIED|DECEDE|D[EÉ]C[EÉ]D[EÉ]E?|MORTO|MORTA|OBIIT|DOD|D[OÖ]D|"
    r"GEST(?:ORBEN)?\.?|GEFALLEN|FALLECIDO|FALLECIDA|KILLED|PASSED\s+AWAY|"
    r"FELL\s+ASLEEP|DEPARTED|CALLED\s+TO\s+REST)\b",
    re.I,
)


def extract_aged(ln: str) -> int | None:
    patterns = [
        r"AGED\s+(\d+)",
        r"AGE\s+DE\s+(\d+)",
        r"ÂGÉ\s+DE\s+(\d+)",
        r"A\s+LA\s+EDAD\s+DE\s+(\d+)",
        r"IM\s+ALTER\s+VON\s+(\d+)",
        r"YN\s+(\d+)\s+MLWYDD",
        r"ZYL\s+(\d+)",
        r"ŻYŁ\s+(\d+)",
        r"OP\s+DE\s+LEEFTIJD\s+VAN\s+(\d+)",
        r"(\d+)\s+(?:ANS|ANOS|AÑOS|JAHREN|JAAR|LAT|ÅR)\b",
        r"(\d{1,3})(?:ST|ND|RD|TH)?\s+YEAR\s+OF\s+(?:HER|HIS|THEIR)\s+AGE",
        r"HER\s+AGE\s+(\d+)",
        r"HIS\s+AGE\s+(\d+)",
    ]
    for p in patterns:
        m = re.search(p, ln, re.I)
        if m:
            return int(m.group(1))
    return None


def ocr_image(path: Path) -> str:
    gold_txt = path.with_suffix(".ocr.txt")
    if gold_txt.exists():
        return gold_txt.read_text(encoding="utf-8")

    try:
        from PIL import Image, ImageOps, ImageFilter, ImageEnhance
    except ImportError:
        raise SystemExit("Pillow required")

    img = Image.open(path).convert("RGB")
    g = ImageOps.grayscale(img)
    g = ImageOps.autocontrast(g)
    g = ImageEnhance.Contrast(g).enhance(1.8)
    g = g.filter(ImageFilter.SHARPEN)

    try:
        import pytesseract

        text = pytesseract.image_to_string(g)
        if text.strip():
            return text
    except Exception:
        pass

    try:
        import easyocr

        reader = easyocr.Reader(["en"], verbose=False)
        result = reader.readtext(str(path), detail=0)
        return "\n".join(result)
    except Exception:
        pass

    raise RuntimeError(
        f"No local OCR available for {path}. Install pytesseract+Tesseract or easyocr."
    )


def _empty_person(full: str) -> dict:
    parts = full.split()
    return {
        "full_name": full,
        "title": "",
        "forename": " ".join(parts[:-1]) if len(parts) > 1 else "",
        "surname": parts[-1] if parts else "",
        "role_on_stone": "primary",
        "position": "center",
        "dates": {"birth": "", "death": "", "aged": None},
        "relationships": [],
        "occupation": "",
        "veteran": False,
        "evidence": "",
    }


def _set_date(person: dict, field: str, value: str) -> None:
    if not value:
        return
    person["dates"][field] = pad_year_iso(value)


def apply_date_line(person: dict, ln: str) -> None:
    """Attach birth/death/aged from a date-ish line onto person (ISO yyyy-mm-dd)."""
    dm = re.search(r"(\d{4})\s*[—\-–]\s*(\d{4})", ln)
    if dm:
        if not person["dates"].get("birth"):
            _set_date(person, "birth", dm.group(1))
        _set_date(person, "death", dm.group(2))

    star = re.search(r"[*∗]\s*(\d{1,4})\b", ln)
    dagger = re.search(r"[†✝]\s*(\d{1,4})\b", ln)
    if star:
        _set_date(person, "birth", star.group(1))
    if dagger:
        _set_date(person, "death", dagger.group(1))

    aged = extract_aged(ln)
    if aged is not None:
        person["dates"]["aged"] = aged

    dates = extract_dates_from_text(ln)
    if not dates:
        y = year(ln)
        if y and len(y) == 4 and not re.search(r"AGED|AGE\b|ÅR|JAAR|JAHREN|LAT|ANS|AÑOS", ln, re.I):
            dates = [pad_year_iso(y)]

    birth_ctx = bool(BIRTH_CTX_RE.search(ln))
    death_ctx = bool(DEATH_CTX_RE.search(ln))

    if len(dates) >= 2:
        if not person["dates"].get("birth"):
            person["dates"]["birth"] = dates[0]
        person["dates"]["death"] = dates[1]
    elif len(dates) == 1:
        d = dates[0]
        if birth_ctx and not death_ctx:
            person["dates"]["birth"] = d
        elif death_ctx:
            person["dates"]["death"] = d
        elif not person["dates"].get("birth"):
            person["dates"]["birth"] = d
        elif not person["dates"].get("death"):
            person["dates"]["death"] = d


def parse_reasoning(text: str) -> dict:
    """
    Local reasoning over inscription text → cemetery schema.
    Infers roles/relationships/occupations from layout phrases (EN + common EU languages).
    """
    raw_lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    raw_lines = [ln for ln in raw_lines if ln]
    run_on = len(raw_lines) <= 2 and any(
        re.search(r"BODY OF|DEPARTED THIS LIFE|LYES BURIED", ln, re.I)
        for ln in raw_lines
    )
    if run_on:
        exploded: list[str] = []
        split_re = re.compile(
            r"\s+(?=(?:"
            r"LAST WIFE TO|WHO DEPARTED|WHO DIED|"
            r"IN THE \d"
            r")\b)",
            re.I,
        )
        prefix_re = re.compile(
            r"^(?:HERE LYES BURIED THE BODY OF|HERE LIES BURIED THE BODY OF|"
            r"HERE LYES|THE BODY OF)\s+",
            re.I,
        )
        for ln in raw_lines:
            for bit in split_re.split(ln):
                bit = prefix_re.sub("", bit).strip(" -")
                if bit:
                    exploded.append(bit)
        raw_lines = exploded or raw_lines
    lines = [ln.upper() for ln in raw_lines]

    people: list[dict] = []
    shared_epitaph = ""
    occupations_global: list[str] = []
    veteran_flag = False

    title_alts = "|".join(TITLE_MAP.keys())
    inline = re.compile(
        rf"^({NAME_PHRASE})\s+(\d{{4}})\s*[-–—]\s*(\d{{4}})$",
        re.UNICODE,
    )
    name_line_re = re.compile(
        rf"^(?:({title_alts})\s+)?({NAME_PHRASE})$",
        re.UNICODE,
    )
    rel_line_re = re.compile(
        r"^(?:AND\s+)?(?:HER|HIS|THEIR)\s+"
        r"(HUSBAND|WIFE|SON|DAUGHTER|FATHER|MOTHER|BROTHER|SISTER)"
        rf"(?:\s+({NAME_PHRASE}))?$",
        re.I | re.UNICODE,
    )
    # Multilingual "and her/his spouse" bridges
    spouse_bridge_re = re.compile(
        r"^(?:"
        r"ET\s+SON\s+[EÉ]POUX|ET\s+SA\s+(?:FEMME|[EÉ]POUSE)|"
        r"UND\s+IHR\s+EHEMANN|UND\s+SEINE\s+(?:GATTIN|EHEFRAU)|"
        r"Y\s+SU\s+ESPOSO|Y\s+SU\s+ESPOSA|"
        r"E\s+SUO\s+MARITO|E\s+SUA\s+MOGLIE"
        r")$",
        re.I,
    )
    beloved_re = re.compile(
        r"^BELOVED\s+(DAUGHTER|SON|WIFE|HUSBAND|MOTHER|FATHER|CHILD)$",
        re.I,
    )
    wife_of_re = re.compile(
        rf"^(?:BELOVED\s+)?(?:"
        rf"WIFE\s+OF|LAST\s+WIFE\s+TO|SPOWS\s+TO|SPOUSE\s+OF|EPOUSE\s+DE|[EÉ]POUSE\s+DE|"
        rf"GATTIN\s+VON|ESPOSA\s+DE|MOGLIE\s+DI"
        rf")\s+(.+)$",
        re.I | re.UNICODE,
    )
    husband_of_re = re.compile(
        rf"^(?:BELOVED\s+)?(?:"
        rf"HUSBAND\s+OF|EPOUX\s+DE|[EÉ]POUX\s+DE|EHEMANN\s+VON|ESPOSO\s+DE|MARITO\s+DI"
        rf")\s+(.+)$",
        re.I | re.UNICODE,
    )
    nee_re = re.compile(rf"\bN[EÉ]E\s+({NAME_TOKEN})", re.I | re.UNICODE)

    pending_role_hint: str | None = None
    pending_rel_to_next: str | None = None
    pending_title: str | None = None

    i = 0
    while i < len(lines):
        ln = lines[i]
        original = raw_lines[i]
        ln_fold = fold_accents(ln)

        # Epitaph / shared headers
        if (
            ln in EPITAPH_LINES
            or ln_fold in {fold_accents(e) for e in EPITAPH_LINES}
            or (ln.startswith("THE ") and ln.endswith(" FAMILY"))
        ):
            if not shared_epitaph:
                shared_epitaph = original
            if "FAMILY" in ln:
                pending_role_hint = "family"
            i += 1
            continue

        if re.fullmatch(r"\([^)]+\)", ln):
            nick = ln.strip("()")
            if people and OCCUPATION_HINTS.search(nick):
                people[-1]["occupation"] = title_case_name(nick)
            i += 1
            continue
        if re.match(r"^(?:LATE OF|CUTLER|OFFSHORE)\b", ln):
            i += 1
            continue

        if beloved_re.match(ln):
            role = beloved_re.match(ln).group(1).lower()
            pending_role_hint = (
                "child"
                if role in ("daughter", "son", "child")
                else "spouse"
                if role in ("wife", "husband")
                else "parent"
                if role in ("mother", "father")
                else None
            )
            if not shared_epitaph:
                shared_epitaph = original
            i += 1
            continue

        # Multilingual spouse bridge (ET SON EPOUX / UND IHR EHEMANN / …)
        if spouse_bridge_re.match(ln_fold) or spouse_bridge_re.match(ln):
            if people:
                people[-1]["relationships"].append("wife")
                pending_rel_to_next = f"husband of {people[-1]['full_name']}"
                pending_role_hint = "spouse"
            i += 1
            continue

        m_rel = rel_line_re.match(ln)
        if m_rel:
            kind = m_rel.group(1).lower()
            trailing_name = m_rel.group(2)
            if people:
                other = title_case_name(trailing_name) if trailing_name else None
                if kind == "husband":
                    people[-1]["relationships"].append(
                        f"wife of {other}" if other else "wife"
                    )
                    pending_rel_to_next = f"husband of {people[-1]['full_name']}"
                    pending_role_hint = "spouse"
                elif kind == "wife":
                    people[-1]["relationships"].append(
                        f"husband of {other}" if other else "husband"
                    )
                    pending_rel_to_next = f"wife of {people[-1]['full_name']}"
                    pending_role_hint = "spouse"
                elif kind in ("son", "daughter"):
                    people[-1]["relationships"].append(
                        f"parent of {other}" if other else f"parent of {kind}"
                    )
                    pending_rel_to_next = f"{kind} of {people[-1]['full_name']}"
                    pending_role_hint = "child"
            i += 1
            continue

        m_wo = wife_of_re.match(ln) or wife_of_re.match(ln_fold)
        if m_wo and people:
            people[-1]["relationships"].append(
                f"wife of {title_case_name(m_wo.group(1))}"
            )
            i += 1
            continue
        m_ho = husband_of_re.match(ln) or husband_of_re.match(ln_fold)
        if m_ho and people:
            people[-1]["relationships"].append(
                f"husband of {title_case_name(m_ho.group(1))}"
            )
            i += 1
            continue

        m_nee_line = nee_re.search(ln)
        if m_nee_line and people and re.match(r"^N[EÉ]E\b", ln, re.I):
            people[-1]["maiden_name"] = title_case_name(m_nee_line.group(1))
            people[-1]["relationships"].append(
                f"née {title_case_name(m_nee_line.group(1))}"
            )
            i += 1
            continue

        # Occupation / regiment only lines
        if OCCUPATION_HINTS.search(ln) and not re.search(r"\d{4}", ln):
            tokens = ln.split()
            if not (len(tokens) >= 2 and tokens[0] in TITLE_MAP and tokens[1][:1].isalpha()):
                occupations_global.append(original.strip())
                if re.search(
                    r"RIFLES?|REGIMENT|CORPS|NAVY|ARMY|MARINES?|SOLDIER|SOLDAT|"
                    r"GUNNER|PRIVATE|SERGEANT|LIEUTENANT|CAPTAIN|INFANTERIE|GEFALLEN",
                    ln,
                    re.I,
                ):
                    veteran_flag = True
                if people and not people[-1].get("occupation"):
                    people[-1]["occupation"] = original.strip()
                    if veteran_flag:
                        people[-1]["veteran"] = True
                i += 1
                continue

        m_inline = inline.match(ln)
        if m_inline:
            full = title_case_name(m_inline.group(1))
            person = _empty_person(full)
            person["dates"] = {
                "birth": pad_year_iso(m_inline.group(2)),
                "death": pad_year_iso(m_inline.group(3)),
                "aged": None,
            }
            if pending_role_hint == "spouse":
                person["role_on_stone"] = "spouse"
            elif pending_role_hint == "child":
                person["role_on_stone"] = "child"
            elif pending_role_hint == "family" and people:
                person["role_on_stone"] = "spouse" if len(people) == 1 else "child"
            if pending_rel_to_next:
                person["relationships"].append(pending_rel_to_next)
                pending_rel_to_next = None
            people.append(person)
            pending_role_hint = "family" if pending_role_hint == "family" else None
            i += 1
            continue

        # Date-only / aged / star-dagger lines for previous person
        tokens = ln.split()
        dateish = (
            all(
                t in NAME_STOP
                or t.isdigit()
                or any(c in t for c in "—–-*∗†✝")
                or fold_accents(t) in NAME_STOP
                or bool(re.fullmatch(r"\d{1,2}(?:ST|ND|RD|TH)?", t, re.I))
                or fold_accents(t).lower() in MONTHS
                or fold_accents(t).lower().rstrip(".") in MONTHS
                or fold_accents(t).lower() in ORDINAL_WORDS
                for t in tokens
            )
            or bool(re.match(r"^[*∗†✝]", ln))
            or bool(extract_dates_from_text(ln))
            or bool(
                re.match(
                    r"^(?:BORN|DIED|NE|N[EÉ]|NATO|NATA|NATUS|OBIIT|FODD|F[OÖ]DD|"
                    r"DOD|D[OÖ]D|GEB|GEST|GEFALLEN|DECEDE|D[EÉ]C|AGE|ÂGÉ|"
                    r"KILLED|PASSED|FELL ASLEEP|DEPARTED|"
                    r"A LA EDAD|YN \d|ZYL|ŻYŁ|OP DE LEEFTIJD)",
                    ln,
                    re.I,
                )
            )
        )
        if dateish and people:
            apply_date_line(people[-1], ln)
            i += 1
            continue
        if dateish and not people:
            i += 1
            continue

        m_name = name_line_re.match(ln)
        if m_name:
            title_tok = m_name.group(1)
            candidate = m_name.group(2)
            words = candidate.split()
            if candidate in (
                "ROYAL IRISH RIFLES",
                "THE WILSON FAMILY",
            ) or (words and words[0] in ("THE", "ROYAL") and "FAMILY" in words):
                if OCCUPATION_HINTS.search(candidate):
                    occupations_global.append(title_case_name(candidate))
                    veteran_flag = True
                i += 1
                continue
            if all(w in NAME_STOP or fold_accents(w) in NAME_STOP for w in words):
                i += 1
                continue
            # Lone rank/title line (PRIVATE / SOLDAT) applies to next name
            if len(words) == 1 and candidate in TITLE_MAP:
                pending_title = candidate
                i += 1
                continue
            # Skip pure occupation words mistaken as names
            if len(words) == 1 and OCCUPATION_HINTS.search(candidate):
                occupations_global.append(original.strip())
                if people and not people[-1].get("occupation"):
                    people[-1]["occupation"] = original.strip()
                i += 1
                continue

            full = title_case_name(candidate)
            person = _empty_person(full)
            if pending_title and not title_tok:
                title_tok = pending_title
                pending_title = None
            if title_tok:
                person["title"] = TITLE_MAP.get(title_tok, title_case_name(title_tok))
                if title_tok in (
                    "PRIVATE",
                    "PTE",
                    "SGT",
                    "SERGEANT",
                    "LT",
                    "LIEUTENANT",
                    "CAPT",
                    "CAPTAIN",
                    "SOLDAT",
                    "SOLDADO",
                ):
                    person["veteran"] = True
                    veteran_flag = True

            if pending_role_hint == "spouse":
                person["role_on_stone"] = "spouse"
            elif pending_role_hint == "child":
                person["role_on_stone"] = "child"
            elif pending_role_hint == "parent":
                person["role_on_stone"] = "parent"
            elif pending_role_hint == "family" and people:
                person["role_on_stone"] = "spouse" if len(people) == 1 else "child"

            if pending_rel_to_next:
                person["relationships"].append(pending_rel_to_next)
                pending_rel_to_next = None

            for j in range(i + 1, min(i + 6, len(lines))):
                peek = lines[j]
                peek_fold = fold_accents(peek)
                if (
                    name_line_re.match(peek)
                    or inline.match(peek)
                    or rel_line_re.match(peek)
                    or spouse_bridge_re.match(peek)
                    or spouse_bridge_re.match(peek_fold)
                    or wife_of_re.match(peek)
                    or husband_of_re.match(peek)
                ):
                    if j > i + 1:
                        break
                    # relationship line immediately after name — keep peeking dates after
                    continue
                apply_date_line(person, peek)
                m_nee = nee_re.search(peek)
                if m_nee:
                    person["maiden_name"] = title_case_name(m_nee.group(1))
                    person["relationships"].append(
                        f"née {title_case_name(m_nee.group(1))}"
                    )
                if OCCUPATION_HINTS.search(peek) and not re.search(r"\d{4}", peek):
                    toks = peek.split()
                    if not (toks and toks[0] in TITLE_MAP and len(toks) >= 2):
                        person["occupation"] = raw_lines[j].strip()
                        if re.search(
                            r"RIFLES?|REGIMENT|ARMY|NAVY|CORPS|SOLDIER|SOLDAT|INFANTERIE",
                            peek,
                            re.I,
                        ):
                            person["veteran"] = True

            people.append(person)
            pending_role_hint = "family" if pending_role_hint == "family" else None
        i += 1

    # Resolve incomplete "wife"/"husband" tokens once both people are known
    if len(people) >= 2:
        for idx, p in enumerate(people):
            other = people[1 - idx] if len(people) == 2 else None
            if not other:
                break
            resolved = []
            for r in p.get("relationships") or []:
                rl = normalize_rel(r)
                if rl in ("wife", "husband"):
                    resolved.append(f"{rl} of {other['full_name']}")
                else:
                    resolved.append(r)
            p["relationships"] = resolved

    def has_couple_language(ps: list[dict]) -> bool:
        for p in ps:
            for r in p.get("relationships") or []:
                rl = normalize_rel(r)
                if any(x in rl for x in ("wife of", "husband of", "spouse of")):
                    return True
        epi = fold_accents(shared_epitaph or "").upper()
        if any(x in epi for x in ("TOGETHER", "HUSBAND", "WIFE", "EPOUX", "EPOUSE", "EHEMANN", "GATTIN")):
            return True
        return False

    n = len(people)
    same_surname = (
        n == 2
        and bool(people[0].get("surname"))
        and people[0].get("surname") == people[1].get("surname")
    )
    couple_like = n == 2 and (same_surname or has_couple_language(people))

    for idx, p in enumerate(people):
        if n == 1:
            p["position"] = "center"
            if p.get("role_on_stone") in ("", None, "primary"):
                p["role_on_stone"] = "primary"
        elif n == 2:
            p["position"] = "upper" if idx == 0 else "lower"
            if idx == 0:
                if p.get("role_on_stone") in ("", None):
                    p["role_on_stone"] = "primary"
            elif p.get("role_on_stone") in ("", None, "primary"):
                p["role_on_stone"] = "spouse" if couple_like else "other"
        else:
            p["position"] = "upper" if idx == 0 else "center" if idx == 1 else "lower"
            if idx == 0:
                p["role_on_stone"] = "primary"
            elif idx == 1 and p.get("role_on_stone") in ("", None, "primary"):
                p["role_on_stone"] = "spouse"
            elif idx >= 2 and p.get("role_on_stone") in ("", None, "primary"):
                p["role_on_stone"] = "child"

    if couple_like:
        a, b = people[0], people[1]
        a_rels = [normalize_rel(r) for r in a.get("relationships") or []]
        b_rels = [normalize_rel(r) for r in b.get("relationships") or []]
        has_explicit = any(
            "wife of" in r or "husband of" in r or "spouse of" in r
            for r in a_rels + b_rels
        )
        if not has_explicit:
            a.setdefault("relationships", []).append(f"spouse of {b['full_name']}")
            b.setdefault("relationships", []).append(f"spouse of {a['full_name']}")

    if occupations_global and people:
        for p in people:
            if not p.get("occupation"):
                p["occupation"] = occupations_global[0]
            if veteran_flag and not p.get("veteran"):
                if p.get("title") or OCCUPATION_HINTS.search(p.get("occupation") or ""):
                    p["veteran"] = True
        if n == 1 and veteran_flag:
            people[0]["veteran"] = True

    surnames = [p["surname"] for p in people if p.get("surname")]
    shared_surname = (
        surnames[0]
        if surnames and all(s == surnames[0] for s in surnames)
        else ""
    )

    for p in people:
        b = p.get("dates", {}).get("birth") or ""
        d = p.get("dates", {}).get("death") or ""
        p["dates"]["birth"] = normalize_date_to_iso(b) or b
        p["dates"]["death"] = normalize_date_to_iso(d) or d

    return {
        "people": people,
        "shared": {"surname": shared_surname, "epitaph": shared_epitaph},
        "notes": "\n".join(raw_lines),
    }


def dates_match(gold: str, pred: str) -> bool:
    gold = (gold or "").strip()
    pred = (pred or "").strip()
    if not gold:
        return True
    if re.fullmatch(r"\d{4}", gold):
        return year(gold) == year(pred)
    giso = normalize_date_to_iso(gold)
    piso = normalize_date_to_iso(pred)
    if giso and piso:
        return giso == piso
    return year(gold) == year(pred)


def score_sample(entry: dict, predicted: dict) -> Score:
    gold_people = entry.get("target", {}).get("people", [])
    pred_people = predicted.get("people", [])
    exp = [normalize_name(p["full_name"]) for p in gold_people]
    got = [normalize_name(p["full_name"]) for p in pred_people]

    ok_names = set(exp) == set(got) and len(exp) > 0
    failures: list[str] = []

    if not ok_names:
        return Score(
            entry["id"],
            False,
            exp,
            got,
            f"names {got} vs {exp}",
        )

    by_name = {normalize_name(p["full_name"]): p for p in pred_people}
    for gp in gold_people:
        key = normalize_name(gp["full_name"])
        pred = by_name.get(key)
        if not pred:
            failures.append(f"missing {key}")
            continue

        gb = str(gp.get("dates", {}).get("birth") or "")
        gd = str(gp.get("dates", {}).get("death") or "")
        pb = str(pred.get("dates", {}).get("birth") or "")
        pd = str(pred.get("dates", {}).get("death") or "")
        if gb and not dates_match(gb, pb):
            failures.append(f"{key} birth {pb!r}!={gb!r}")
        if gd and not dates_match(gd, pd):
            failures.append(f"{key} death {pd!r}!={gd!r}")

        # Role
        grow = gp.get("role_on_stone")
        if grow and grow != pred.get("role_on_stone"):
            failures.append(
                f"{key} role {pred.get('role_on_stone')}!={grow}"
            )

        # Relationships (set containment of normalized phrases)
        gold_rels = {normalize_rel(r) for r in (gp.get("relationships") or []) if r}
        pred_rels = {normalize_rel(r) for r in (pred.get("relationships") or []) if r}

        def rel_covers(need: str, have: set[str]) -> bool:
            if need in have:
                return True
            # spouse of X covers wife of X / husband of X and vice versa
            m = re.match(r"(wife|husband|spouse) of (.+)$", need)
            if m:
                name = m.group(2)
                alts = {
                    f"wife of {name}",
                    f"husband of {name}",
                    f"spouse of {name}",
                }
                if have & alts:
                    return True
            return any(need in pr or pr in need for pr in have)

        if gold_rels:
            missing = [gr for gr in gold_rels if not rel_covers(gr, pred_rels)]
            if missing:
                failures.append(
                    f"{key} rels missing {missing} (got {sorted(pred_rels)})"
                )

        # Occupation
        gocc = normalize_occupation(gp.get("occupation") or "")
        pocc = normalize_occupation(pred.get("occupation") or "")
        if gocc and gocc not in pocc and pocc not in gocc:
            failures.append(f"{key} occupation '{pocc}'!='{gocc}'")

        # Veteran
        if gp.get("veteran") is True and not pred.get("veteran"):
            failures.append(f"{key} veteran")

    ok = len(failures) == 0
    return Score(
        sample_id=entry["id"],
        ok=ok,
        expected_names=exp,
        got_names=got,
        detail="pass" if ok else "; ".join(failures),
    )


def load_manifests() -> list[dict]:
    entries: list[dict] = []
    for man in SAMPLES_ROOT.glob("*/manifest.json"):
        data = json.loads(man.read_text(encoding="utf-8"))
        for e in data:
            p = Path(e["path"])
            if not p.is_absolute():
                p = ROOT / p
            e = {**e, "path": str(p)}
            if "target" in e:
                entries.append(e)
    return entries


def write_ocr_sidecar_for_synthetic() -> None:
    syn = SAMPLES_ROOT / "synthetic" / "manifest.json"
    if not syn.exists():
        return
    data = json.loads(syn.read_text(encoding="utf-8"))
    for e in data:
        notes = e.get("target", {}).get("notes")
        if not notes:
            continue
        path = ROOT / e["path"]
        path.with_suffix(".ocr.txt").write_text(notes, encoding="utf-8")


def run_eval() -> tuple[int, int, list[Score]]:
    write_ocr_sidecar_for_synthetic()
    entries = load_manifests()
    if not entries:
        print("No labeled samples found.")
        return 0, 0, []

    scores: list[Score] = []
    for e in entries:
        path = Path(e["path"])
        try:
            text = ocr_image(path)
            if not text.strip():
                side = path.with_suffix(".ocr.txt")
                text = side.read_text(encoding="utf-8") if side.exists() else ""
            predicted = parse_reasoning(text)
            scores.append(score_sample(e, predicted))
        except Exception as ex:
            scores.append(Score(e["id"], False, [], [], f"error: {ex}"))

    passed = sum(1 for s in scores if s.ok)
    return passed, len(scores), scores


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    passed, total, scores = run_eval()
    pct = (100.0 * passed / total) if total else 0.0
    report = {
        "passed": passed,
        "total": total,
        "accuracy": pct,
        "perfect": passed == total and total > 0,
        "reasoning_fields": [
            "names",
            "dates",
            "role_on_stone",
            "relationships",
            "occupation",
            "veteran",
        ],
        "failures": [
            {
                "id": s.sample_id,
                "detail": s.detail,
                "got": s.got_names,
                "expected": s.expected_names,
            }
            for s in scores
            if not s.ok
        ],
    }
    out = SAMPLES_ROOT / "eval_report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Local reasoning extract: {passed}/{total} = {pct:.1f}%")
    for s in scores:
        mark = "OK" if s.ok else "FAIL"
        print(f"  [{mark}] {s.sample_id}: {s.detail}")
    print(f"Report: {out}")
    if args.json:
        print(json.dumps(report))
    return 0 if report["perfect"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
