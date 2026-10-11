/**
 * Normalize headstone dates to ISO yyyy-mm-dd.
 * Inscriptions are usually UK-style (25th June 1933, 1st Oct 2020).
 * Year-only becomes yyyy-01-01; month+year becomes yyyy-mm-01.
 */

const MONTHS: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sept: "09",
  sep: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const max = new Date(year, month, 0).getDate();
  return day >= 1 && day <= max;
}

function toIso(year: number, month: number, day: number): string | null {
  if (!isValidYmd(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseMonth(raw: string): number | null {
  const key = raw.replace(/\./g, "").toLowerCase();
  const mm = MONTHS[key];
  return mm ? Number(mm) : null;
}

/** Convert a carved/model date string to yyyy-mm-dd, or "" if unparseable. */
export function normalizeDateToIso(value: unknown): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return (
      toIso(Number(iso[1]), Number(iso[2]), Number(iso[3])) || ""
    );
  }

  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) {
    return `${yearOnly[1]}-01-01`;
  }

  const ordinal = raw.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{4})$/i,
  );
  if (ordinal) {
    const month = parseMonth(ordinal[2]);
    if (month) {
      return toIso(Number(ordinal[3]), month, Number(ordinal[1])) || "";
    }
  }

  const monthFirst = raw.match(
    /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/i,
  );
  if (monthFirst) {
    const month = parseMonth(monthFirst[1]);
    if (month) {
      return toIso(Number(monthFirst[3]), month, Number(monthFirst[2])) || "";
    }
  }

  const monthYear = raw.match(/^([A-Za-z]+)\.?\s+(\d{4})$/i);
  if (monthYear) {
    const month = parseMonth(monthYear[1]);
    if (month) return `${monthYear[2]}-${pad2(month)}-01`;
  }

  const ORDINAL_WORDS: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
    thirteenth: 13,
    fourteenth: 14,
    fifteenth: 15,
    sixteenth: 16,
    seventeenth: 17,
    eighteenth: 18,
    nineteenth: 19,
    twentieth: 20,
    thirtieth: 30,
  };

  const dayOf = raw.match(
    /(?:the\s+)?([A-Za-z]+)\s+day\s+of\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  if (dayOf) {
    const day = ORDINAL_WORDS[dayOf[1].toLowerCase()];
    const month = parseMonth(dayOf[2]);
    if (day && month) return toIso(Number(dayOf[3]), month, day) || "";
  }

  const monthThe = raw.match(
    /^([A-Za-z]+)\s+the\s+([A-Za-z]+)\s+(\d{4})$/i,
  );
  if (monthThe) {
    const month = parseMonth(monthThe[1]);
    const day = ORDINAL_WORDS[monthThe[2].toLowerCase()];
    if (month && day) return toIso(Number(monthThe[3]), month, day) || "";
  }

  const numeric = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    // Cemetery app is UK-first: dd/mm/yyyy unless the first part cannot be a day.
    if (a > 12 && b <= 12) {
      return toIso(year, b, a) || "";
    }
    if (b > 12 && a <= 12) {
      return toIso(year, a, b) || "";
    }
    return toIso(year, b, a) || "";
  }

  return "";
}

export const INSCRIPTION_DATE_PATTERN =
  /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi;

/** Model JSON often puts the inscription in a list or a nested object. */
export function asInscriptionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value == null ? "" : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => asInscriptionText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "transcription", "notes", "content", "inscription"]) {
      if (key in record) return asInscriptionText(record[key]);
    }
    return Object.values(record)
      .map((item) => asInscriptionText(item))
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
}

export function extractInscriptionDates(text: unknown): string[] {
  const source = asInscriptionText(text);
  if (!source) return [];
  const seen = new Set<string>();
  const dates: string[] = [];
  const matches =
    typeof source.matchAll === "function"
      ? source.matchAll(INSCRIPTION_DATE_PATTERN)
      : (source.match(new RegExp(INSCRIPTION_DATE_PATTERN.source, "gi")) ?? []).map(
          (item) => [item],
        );
  for (const match of matches) {
    const iso = normalizeDateToIso(match[0]);
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    dates.push(iso);
  }
  return dates;
}
