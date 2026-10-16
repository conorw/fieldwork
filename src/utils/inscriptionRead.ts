import { extractInscriptionDates, normalizeDateToIso } from "./inscriptionDates";

export interface InscriptionPerson {
  full_name: string;
  birth: string;
  death: string;
  relationships: string[];
  role: "primary" | "spouse";
  position: "upper" | "lower";
}

export interface InscriptionReading {
  people: InscriptionPerson[];
  epitaph: string;
  transcription: string;
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jul",
  "aug",
  "sept",
  "sep",
  "oct",
  "nov",
  "dec",
];

const FUZZY_WORDS = [
  "together",
  "remember",
  "forgotten",
  "missed",
  "always",
  "never",
  "husband",
  "mother",
  "father",
  "daughter",
  "beloved",
  "october",
  "november",
  "february",
  "january",
  "august",
  "september",
  "december",
  "with",
  "love",
  "dear",
  "wife",
  "june",
];

const STOP = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "with",
  "we",
  "our",
  "always",
  "love",
  "remember",
  "missed",
  "never",
  "forgotten",
  "together",
  "dear",
  "beloved",
  "husband",
  "wife",
  "mother",
  "father",
  "son",
  "daughter",
  "her",
  "his",
  "their",
]);

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, prev + cost);
      prev = next;
    }
  }
  return row[b.length] ?? a.length;
}

function fuzzyWord(token: string): string {
  const punct = token.match(/[.,]+$/)?.[0] || "";
  const core = token.replace(/[.,]+$/g, "");
  if (!core) return token;
  if (core === core.toUpperCase() && /[A-Z]/.test(core)) return token;
  const word = core.toLowerCase();
  let best = core;
  let bestD = 99;
  for (const known of FUZZY_WORDS) {
    const limit = known.length >= 7 ? 2 : 1;
    if (Math.abs(known.length - word.length) > limit) continue;
    const distance = editDistance(word, known);
    if (distance <= limit && distance < bestD) {
      best = known;
      bestD = distance;
      if (distance === 0) break;
    }
  }
  const replaced = best.toLowerCase() === word ? core : best;
  return replaced + punct;
}

function softenDateGlyphs(line: string): string {
  return line
    .replace(/(\d{1,2})\.\d+/g, "$1")
    .replace(/(\d)\s*[%*|]+/g, "$1")
    .replace(/\bI+(?=\s*[A-Za-z])/g, "1")
    .replace(/(\d)\s+(st|nd|rd|th)\b/gi, "$1$2");
}

function closestMonth(word: string): string | null {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return null;
  if (clean === "may") return "may";
  let best: string | null = null;
  let bestD = 99;
  for (const month of MONTH_NAMES) {
    if (month.length < 4) continue;
    if (Math.abs(month.length - clean.length) > 1) continue;
    const distance = editDistance(clean, month);
    if (distance <= 1 && distance < bestD) {
      best = month;
      bestD = distance;
    }
  }
  return best;
}

function datesInLine(line: string): string[] {
  const soft = softenDateGlyphs(line);
  const direct = extractInscriptionDates(soft);
  if (direct.length > 0) return direct;
  const year = soft.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  const day = soft.match(/\b(\d{1,2})\b/);
  if (!year || !day) return [];
  const month = soft
    .split(/[^A-Za-z]+/)
    .map((word) => closestMonth(word))
    .find((word): word is string => !!word);
  if (!month) return [];
  const iso = normalizeDateToIso(`${day[1]} ${month} ${year[1]}`);
  return iso ? [iso] : [];
}

function polishLine(line: string): string {
  return line
    .replace(/[|]/g, " ")
    .replace(/[^A-Za-z0-9'’.,\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => fuzzyWord(token))
    .join(" ");
}

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => polishLine(line))
    .filter((line) => /[A-Za-z]{3,}/.test(line) || datesInLine(line).length > 0);
}

export function mergeHeaderText(body: string, header: string): string {
  const bodyLines = linesOf(body);
  const folded = bodyLines.map((line) => line.toLowerCase().replace(/[^a-z]/g, ""));
  const extra = linesOf(header).filter((line) => {
    const fold = line.toLowerCase().replace(/[^a-z]/g, "");
    if (!fold) return false;
    return !folded.some(
      (have) => have.includes(fold) || fold.includes(have),
    );
  });
  return [...extra, ...bodyLines].join("\n");
}

function kindOf(line: string): "date" | "relationship" | "verse" | "name" | "skip" {
  if (datesInLine(line).length > 0) return "date";
  const fold = line.toLowerCase();
  if (/\b(husband|wife|mother|father|son|daughter|widow|widower)\b/.test(fold)) {
    return "relationship";
  }
  if (/\b(love|remember|missed|forgotten|together)\b/.test(fold)) return "verse";
  const tokens = line.split(/\s+/).filter((token) => /[A-Za-z]{3,}/.test(token));
  if (
    tokens.length > 0 &&
    tokens.length <= 4 &&
    tokens.every((token) => !STOP.has(token.toLowerCase()))
  ) {
    return "name";
  }
  return "skip";
}

function titleName(raw: string): string {
  return raw
    .split(/\s+/)
    .map((token) => token.replace(/[0-9]/g, (digit) => ({ "0": "O", "1": "I", "5": "S" })[digit] || digit))
    .filter((token) => /^[A-Za-z'’-]{3,}$/.test(token))
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function cleanRelationship(line: string): string {
  return line
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:a|an|the)\s+/i, "")
    .toLowerCase();
}

function ordinal(day: number): string {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

const MONTH_LABEL = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function displayDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const month = MONTH_LABEL[Number(match[2])] || "";
  return `${ordinal(Number(match[3]))} ${month} ${match[1]}`;
}

function orderDates(dates: string[]): { birth: string; death: string } {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return { birth: "", death: "" };
  if (unique.length === 1) return { birth: unique[0] || "", death: "" };
  return { birth: unique[0] || "", death: unique[unique.length - 1] || "" };
}

function isBridge(line: string): boolean {
  return /\btogether with\b/i.test(line);
}

/** Turn carved lines into people, dates, and the shared epitaph. */
export function parseInscription(text: string): InscriptionReading {
  const lines = linesOf(text);
  const people: InscriptionPerson[] = [];
  const epitaphParts: string[] = [];
  const transcript: string[] = [];
  let nameBuf: string[] = [];
  let pendingRel = "";
  let dates: string[] = [];
  let verseBuf: string[] = [];

  const flushVerse = () => {
    if (verseBuf.length === 0) return;
    const clause = verseBuf.join(" ").replace(/\s+/g, " ").trim();
    verseBuf = [];
    if (!clause) return;
    if (isBridge(clause)) {
      transcript.push(clause.charAt(0).toLowerCase() + clause.slice(1));
      return;
    }
    const sentence = clause.charAt(0).toUpperCase() + clause.slice(1);
    epitaphParts.push(sentence);
    transcript.push(sentence);
  };

  const flushPerson = () => {
    flushVerse();
    const full = titleName(nameBuf.join(" "));
    const dated = orderDates(dates);
    nameBuf = [];
    dates = [];
    if (!full) {
      pendingRel = "";
      return;
    }
    const relationships = pendingRel ? [pendingRel] : [];
    pendingRel = "";
    people.push({
      full_name: full,
      birth: dated.birth,
      death: dated.death,
      relationships,
      role: people.length === 0 ? "primary" : "spouse",
      position: people.length === 0 ? "upper" : "lower",
    });
    transcript.push(full);
    if (dated.birth) transcript.push(displayDate(dated.birth));
    if (dated.death) transcript.push(displayDate(dated.death));
  };

  for (const line of lines) {
    const kind = kindOf(line);
    if (kind === "date") {
      flushVerse();
      dates.push(...datesInLine(line));
      continue;
    }
    if (dates.length > 0 || (kind !== "name" && nameBuf.length > 0 && kind !== "skip")) {
      flushPerson();
    }
    if (kind === "relationship") {
      flushVerse();
      pendingRel = cleanRelationship(line);
      transcript.push(
        line.charAt(0).toUpperCase() + line.slice(1).toLowerCase(),
      );
      continue;
    }
    if (kind === "verse") {
      verseBuf.push(line);
      if (verseBuf.length >= 2 || line.split(/\s+/).length > 3) flushVerse();
      continue;
    }
    if (kind === "name") {
      flushVerse();
      nameBuf.push(line);
    }
  }
  if (nameBuf.length > 0 || dates.length > 0) flushPerson();
  else flushVerse();

  if (people.length >= 2) {
    const [first, second] = people;
    if (first && second) {
      const firstRel = first.relationships.join(" ");
      const secondRel = second.relationships.join(" ");
      if (/husband|wife/.test(firstRel) && !first.relationships.some((rel) => rel.startsWith("spouse of"))) {
        first.relationships.push(`spouse of ${second.full_name}`);
      }
      if (/husband|wife/.test(secondRel) && !second.relationships.some((rel) => rel.startsWith("spouse of"))) {
        second.relationships.push(`spouse of ${first.full_name}`);
      }
    }
  }

  return {
    people: people.filter((person) => person.full_name.includes(" ")),
    epitaph: epitaphParts.join(" · "),
    transcription: transcript.join("\n"),
  };
}
