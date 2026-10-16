/**
 * Maps between PersonData (app forms), HeadstoneReasoningTarget (train/local),
 * and staff-facing confirm payloads. Keep schemas aligned with training/schema.py.
 */
import type { PersonData } from "../stores/persons";
import type {
  HeadstonePersonTarget,
  HeadstonePhysicalAttrs,
  HeadstoneReasoningTarget,
  PersonPosition,
  PersonRoleOnStone,
  StaffStoneKind,
  StoneType,
} from "../types/headstoneTraining";
import {
  normalizePhysicalAttrs,
  STAFF_STONE_KIND_TO_TYPE,
} from "../types/headstoneTraining";
import {
  asInscriptionText,
  extractInscriptionDates,
  normalizeDateToIso,
} from "./inscriptionDates";

export interface ConfirmPersonInput {
  full_name: string;
  title?: string;
  forename?: string;
  middle_name?: string;
  surname?: string;
  maiden_name?: string;
  known_as?: string;
  date_of_birth?: string;
  date_of_death?: string;
  age_at_death?: number | null;
  veteran?: boolean;
  notes?: string;
  relationships?: string[];
  occupation?: string;
  role_on_stone?: PersonRoleOnStone;
  position?: PersonPosition;
}

function splitName(full: string): { forename: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { forename: "", surname: "" };
  if (parts.length === 1) return { forename: parts[0], surname: "" };
  return {
    forename: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1],
  };
}

function defaultRole(index: number, kind: StaffStoneKind): PersonRoleOnStone {
  if (index === 0) return "primary";
  if (kind === "couple") return "spouse";
  if (kind === "family") return index === 1 ? "spouse" : "child";
  return "other";
}

function defaultPosition(index: number, total: number): PersonPosition {
  if (total === 1) return "center";
  if (total === 2) return index === 0 ? "left" : "right";
  if (index === 0) return "upper";
  if (index === 1) return "lower";
  return "unknown";
}

/** Build gold training target from staff-confirmed people */
export function personsToReasoningTarget(
  people: ConfirmPersonInput[],
  options: {
    stoneKind: StaffStoneKind;
    epitaph?: string;
    notes?: string;
    evidenceFallback?: string;
    physical?: HeadstonePhysicalAttrs;
  },
): HeadstoneReasoningTarget {
  const targets: HeadstonePersonTarget[] = people
    .filter((p) => (p.full_name || "").trim().length > 0)
    .map((p, index) => {
      const split = splitName(p.full_name);
      return {
        full_name: p.full_name.trim(),
        title: p.title || "",
        forename: p.forename || split.forename,
        middle_name: p.middle_name || "",
        surname: p.surname || split.surname,
        maiden_name: p.maiden_name || "",
        known_as: p.known_as || "",
        role_on_stone: p.role_on_stone || defaultRole(index, options.stoneKind),
        position:
          p.position || defaultPosition(index, people.length),
        dates: {
          birth: normalizeDateToIso(p.date_of_birth || ""),
          death: normalizeDateToIso(p.date_of_death || ""),
          aged: p.age_at_death ?? null,
        },
        relationships: p.relationships || [],
        occupation: p.occupation || "",
        veteran: !!p.veteran,
        evidence:
          options.evidenceFallback ||
          p.notes ||
          `Confirmed person ${index + 1}`,
      };
    });

  const surnames = targets
    .map((t) => t.surname)
    .filter((s): s is string => !!s && s.length > 0);
  const sharedSurname =
    surnames.length > 0 && surnames.every((s) => s === surnames[0])
      ? surnames[0]
      : "";

  return {
    people: targets,
    shared: {
      surname: sharedSurname,
      epitaph: options.epitaph || "",
    },
    physical: normalizePhysicalAttrs(options.physical),
    notes: options.notes || "",
  };
}

/** Map reasoning JSON → PersonData for forms / plot creation */
export function reasoningTargetToPersons(
  target: HeadstoneReasoningTarget,
  plotId = "",
): PersonData[] {
  const now = new Date().toISOString();
  return (target.people || []).map((p) => {
    const split = splitName(p.full_name || "");
    return {
      id: "",
      plot_id: plotId,
      title: p.title || "",
      forename: p.forename || split.forename,
      middle_name: p.middle_name || "",
      surname: p.surname || split.surname || target.shared?.surname || "",
      full_name: p.full_name || "Unknown",
      known_as: p.known_as || "",
      maiden_name: p.maiden_name || "",
      gender: "",
      date_of_birth: p.dates?.birth || "",
      date_of_death: p.dates?.death || "",
      age_at_death: p.dates?.aged ?? null,
      time_of_death: "",
      birth_city: "",
      birth_sub_country: "",
      birth_country: "",
      address_line1: "",
      address_line2: "",
      town: "",
      county: "",
      country: "",
      postcode: "",
      mobile: "",
      landline: "",
      email_address: "",
      marital_status: "",
      race: "",
      ethnicity: "",
      deceased: true,
      person_of_interest: false,
      veteran: !!p.veteran,
      cause_of_death: "",
      notes: [
        p.occupation ? `Occupation: ${p.occupation}` : "",
        ...(p.relationships || []),
        p.evidence,
      ]
        .filter(Boolean)
        .join("; "),
      created_by: "local-vlm",
      date_created: now,
      last_updated_by: "local-vlm",
      last_updated_datetime: now,
    };
  });
}

/** Convert PersonData (wizard form) → confirm inputs */
export function personDataToConfirmInputs(
  persons: PersonData[],
): ConfirmPersonInput[] {
  return persons.map((p) => {
    const { relationships, occupation, notesRest } = parseNotesExtras(
      p.notes || "",
    );
    return {
      full_name: p.full_name || `${p.forename || ""} ${p.surname || ""}`.trim(),
      title: p.title,
      forename: p.forename,
      middle_name: p.middle_name,
      surname: p.surname,
      maiden_name: p.maiden_name,
      known_as: p.known_as,
      date_of_birth: p.date_of_birth,
      date_of_death: p.date_of_death,
      age_at_death: p.age_at_death,
      veteran: p.veteran,
      notes: notesRest || p.notes,
      relationships,
      occupation,
    };
  });
}

/** Pull relationships / occupation out of a free-text notes string */
export function parseNotesExtras(notes: string): {
  relationships: string[];
  occupation: string;
  notesRest: string;
} {
  if (!notes?.trim()) {
    return { relationships: [], occupation: "", notesRest: "" };
  }
  const parts = notes
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const relationships: string[] = [];
  let occupation = "";
  const rest: string[] = [];
  const relHint =
    /\b(husband|wife|mother|father|son|daughter|spouse|partner|widow|widower|brother|sister|dear|beloved|of)\b/i;
  for (const part of parts) {
    const occ = part.match(/^Occupation:\s*(.+)$/i);
    if (occ) {
      occupation = occ[1].trim();
      continue;
    }
    if (relHint.test(part) && part.length < 120) {
      relationships.push(part);
      continue;
    }
    rest.push(part);
  }
  return { relationships, occupation, notesRest: rest.join("; ") };
}

/** Infer staff stone kind from person count */
export function inferStaffStoneKind(personCount: number): StaffStoneKind {
  if (personCount <= 1) return "one_person";
  if (personCount === 2) return "couple";
  if (personCount >= 3) return "family";
  return "other";
}

export function staffKindToStoneType(kind: StaffStoneKind): StoneType {
  return STAFF_STONE_KIND_TO_TYPE[kind];
}

/**
 * Parse model text into HeadstoneReasoningTarget.
 * Accepts either the reasoning schema or legacy { persons: [...] } shape.
 */
export function parseReasoningJson(text: unknown): HeadstoneReasoningTarget {
  const source = asInscriptionText(text);
  const jsonMatch = source.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const recovered = recoverMalformedPeople(source);
    if (recovered.length > 0) {
      return targetFromLegacyStones(recovered, source);
    }
    return {
      people: [],
      shared: { surname: "", epitaph: "" },
      physical: normalizePhysicalAttrs(undefined),
      notes: inscriptionFallback(source),
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    const recovered = recoverMalformedPeople(source);
    if (recovered.length > 0) {
      return targetFromLegacyStones(recovered, source);
    }
    return {
      people: [],
      shared: { surname: "", epitaph: "" },
      physical: normalizePhysicalAttrs(undefined),
      notes: inscriptionFallback(source),
    };
  }

  // Already reasoning schema
  if (Array.isArray(parsed.people)) {
    return fillMissingPersonDates(
      {
        people: parsed.people.map((p: any, i: number) =>
          normalizePersonTarget(p, i),
        ),
        shared: {
          surname: parsed.shared?.surname || "",
          epitaph: parsed.shared?.epitaph || "",
        },
        physical: normalizePhysicalAttrs(parsed.physical),
        notes: asInscriptionText(parsed.notes || parsed.transcription || ""),
      },
      source,
    );
  }

  // Legacy GPT / persons array
  if (Array.isArray(parsed.persons)) {
    const people = parsed.persons.map((p: any, i: number) =>
      normalizePersonTarget(
        {
          full_name:
            p.full_name ||
            `${p.forename || ""} ${p.surname || ""}`.trim() ||
            "Unknown",
          title: p.title,
          forename: p.forename,
          middle_name: p.middle_name,
          surname: p.surname,
          maiden_name: p.maiden_name,
          known_as: p.known_as,
          dates: {
            birth: p.date_of_birth,
            death: p.date_of_death,
            aged: p.age_at_death,
          },
          veteran: p.veteran,
          evidence: p.notes || "",
          relationships: [],
        },
        i,
      ),
    );
    return fillMissingPersonDates(
      {
        people,
        shared: {
          surname: "",
          epitaph: parsed.shared_epitaph || "",
        },
        physical: normalizePhysicalAttrs(parsed.physical),
        notes: asInscriptionText(parsed.full_text_transcription || ""),
      },
      source,
    );
  }

  // Older/small VLMs sometimes invent { stones: [{ name, date, age }] }.
  if (Array.isArray(parsed.stones)) {
    return targetFromLegacyStones(
      parsed.stones,
      asInscriptionText(parsed.notes || source),
    );
  }

  return {
    people: [],
    shared: { surname: "", epitaph: "" },
    physical: normalizePhysicalAttrs(undefined),
    notes: typeof parsed === "object" ? JSON.stringify(parsed).slice(0, 500) : "",
  };
}

function splitDateRange(value: unknown): { birth: string; death: string } {
  if (typeof value !== "string") return { birth: "", death: "" };
  const parts = value
    .split(/\s+(?:-|–|—|to)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    birth: parts[0] || "",
    death: parts.length > 1 ? parts.slice(1).join(" – ") : "",
  };
}

function targetFromLegacyStones(
  stones: any[],
  sourceText: string,
): HeadstoneReasoningTarget {
  const people = stones
    .filter((stone) => stone && (stone.name || stone.full_name))
    .map((stone, index) => {
      const dates = splitDateRange(stone.date || stone.dates);
      return normalizePersonTarget(
        {
          full_name: stone.name || stone.full_name,
          role_on_stone: index === 0 ? "primary" : "other",
          position: index === 0 ? "upper" : "lower",
          dates: {
        birth: stone.birth || stone.date_of_birth || dates.birth,
        death: stone.death || stone.date_of_death || dates.death,
            aged: stone.age ?? null,
          },
          // Small stock models often mislabel relationships as occupations.
          relationships: stone.relationships || [],
          occupation: stone.occupation || "",
          evidence: stone.evidence || "",
        },
        index,
      );
    });

  const surnames = people.map((person) => person.surname).filter(Boolean);
  const sharedSurname =
    surnames.length > 0 && surnames.every((surname) => surname === surnames[0])
      ? surnames[0]
      : "";

  return fillMissingPersonDates(
    {
      people,
      shared: { surname: sharedSurname, epitaph: "" },
      physical: normalizePhysicalAttrs(undefined),
      notes: asInscriptionText(sourceText).slice(0, 1000),
    },
    sourceText,
  );
}

/**
 * Salvage name/date/age when a small VLM is cut off before closing its JSON.
 * This is intentionally narrow; staff still reviews every recovered value.
 */
function recoverLegacyStones(text: string): any[] {
  const source = asInscriptionText(text);
  if (!/"stones"\s*:/.test(source)) return [];

  const names = [...source.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
  return names.map((match, index) => {
    const start = match.index ?? 0;
    const end = names[index + 1]?.index ?? source.length;
    const segment = source.slice(start, end);
    const date = segment.match(/"date"\s*:\s*"([^"]+)"/)?.[1] || "";
    const ageText = segment.match(/"age"\s*:\s*(\d+)/)?.[1];
    return {
      name: match[1],
      date,
      age: ageText ? Number(ageText) : null,
    };
  });
}

function recoverMalformedPeople(text: string): any[] {
  const source = asInscriptionText(text);
  const legacy = recoverLegacyStones(source);
  if (legacy.length > 0) return legacy;

  const results: any[] = [];
  const seen = new Set<string>();
  const patterns = [
    /"full_name"\s*:\s*"([^"]+)"/gi,
    /"full_name[^"=:\n]*\s*(?:=|:)\s*"([^"]+)"/gi,
    /"name"\s*:\s*"([^"]+)"/gi,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const start = match.index ?? 0;
      const segment = source.slice(start, start + 500);
      results.push({
        name,
        birth:
          segment.match(/"(?:birth|date_of_birth)"\s*:\s*"([^"]*)"/i)?.[1] ||
          "",
        death:
          segment.match(/"(?:death|date_of_death)"\s*:\s*"([^"]*)"/i)?.[1] ||
          "",
      });
    }
  }
  return results;
}

const RELATIONSHIP_NAME =
  /^(?:a\s+|an\s+|the\s+)?(?:dear\s+|beloved\s+)?(?:husband|wife|mother|father|son|daughter)(?:\s+and\s+(?:mother|father|son|daughter|husband|wife))?$/i;

function normalizePersonTarget(p: any, index: number): HeadstonePersonTarget {
  let full =
    p.full_name ||
    `${p.forename || ""} ${p.surname || ""}`.trim() ||
    "Unknown";
  const relationships = Array.isArray(p.relationships) ? [...p.relationships] : [];
  if (RELATIONSHIP_NAME.test(full.trim())) {
    relationships.unshift(full.trim());
    full = "Unknown";
  }
  const split = splitName(full);
  return {
    full_name: full,
    title: p.title || "",
    forename: p.forename || split.forename,
    middle_name: p.middle_name || "",
    surname: p.surname || split.surname,
    maiden_name: p.maiden_name || "",
    known_as: p.known_as || "",
    role_on_stone: (p.role_on_stone as PersonRoleOnStone) || (index === 0 ? "primary" : "other"),
    position: (p.position as PersonPosition) || "unknown",
    dates: {
      birth: normalizeDateToIso(
        p.dates?.birth ||
          p.date_of_birth ||
          p.birth ||
          p.dob ||
          p.born ||
          "",
      ),
      death: normalizeDateToIso(
        p.dates?.death ||
          p.date_of_death ||
          p.death ||
          p.dod ||
          p.died ||
          "",
      ),
      aged: p.dates?.aged ?? p.age_at_death ?? null,
    },
    relationships,
    occupation: p.occupation || "",
    veteran: !!p.veteran,
    evidence: p.evidence || p.notes || "",
  };
}

function datesNearName(text: string, name: string): string[] {
  const source = asInscriptionText(text);
  const label = asInscriptionText(name);
  if (!source || !label) return [];
  const idx = source.toLowerCase().indexOf(label.toLowerCase());
  if (idx < 0) return [];
  return extractInscriptionDates(source.slice(idx, idx + 220));
}

/** Attach birth/death when the model named people but omitted the carved dates. */
export function fillMissingPersonDates(
  target: HeadstoneReasoningTarget,
  sourceText: string,
): HeadstoneReasoningTarget {
  const notes = asInscriptionText(target.notes || "");
  target.notes = notes;
  const inscription = asInscriptionText(sourceText);
  const fromNotes = extractInscriptionDates(notes);
  const haystack = fromNotes.length > 0 ? notes : inscription;
  const pool = extractInscriptionDates(haystack);
  let poolIndex = 0;

  for (const person of target.people) {
    if (person.dates.birth && person.dates.death) continue;
    const nearby = datesNearName(haystack, person.full_name);
    if (!person.dates.birth) {
      person.dates.birth = nearby[0] || pool[poolIndex] || "";
      if (!nearby[0] && person.dates.birth) poolIndex += 1;
    }
    if (!person.dates.death) {
      person.dates.death = nearby[1] || pool[poolIndex] || "";
      if (!nearby[1] && person.dates.death) poolIndex += 1;
    }
    person.dates.birth = normalizeDateToIso(person.dates.birth);
    person.dates.death = normalizeDateToIso(person.dates.death);
  }

  if (looksLikeModelJson(target.notes || "")) {
    target.notes = "";
  } else if (!target.notes?.trim() && pool.length > 0 && !looksLikeModelJson(haystack)) {
    target.notes = haystack.slice(0, 1000);
  }

  return target;
}

/** Keep plain inscription text. Drop token noise that never became a reading. */
function inscriptionFallback(source: string): string {
  if (/\b(?:1[5-9]\d{2}|20\d{2})\b/.test(source)) return source.slice(0, 500);
  return "";
}

function looksLikeModelJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") && /"people"\s*:/.test(trimmed);
}

export function reasoningToTranscription(target: HeadstoneReasoningTarget): string {
  const notes = target.notes?.trim() || "";
  if (notes && !looksLikeModelJson(notes)) return notes;
  const lines: string[] = [];
  for (const p of target.people) {
    const dates = [p.dates?.birth, p.dates?.death].filter(Boolean).join(" – ");
    lines.push([p.full_name, dates].filter(Boolean).join("\n"));
  }
  if (target.shared?.epitaph) lines.push(target.shared.epitaph);
  return lines.join("\n\n");
}
