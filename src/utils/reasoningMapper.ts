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
          birth: p.date_of_birth || "",
          death: p.date_of_death || "",
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
export function parseReasoningJson(text: string): HeadstoneReasoningTarget {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      people: [],
      shared: { surname: "", epitaph: "" },
      physical: normalizePhysicalAttrs(undefined),
      notes: text.slice(0, 500),
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return {
      people: [],
      shared: { surname: "", epitaph: "" },
      physical: normalizePhysicalAttrs(undefined),
      notes: text.slice(0, 500),
    };
  }

  // Already reasoning schema
  if (Array.isArray(parsed.people)) {
    return {
      people: parsed.people.map((p: any, i: number) => normalizePersonTarget(p, i)),
      shared: {
        surname: parsed.shared?.surname || "",
        epitaph: parsed.shared?.epitaph || "",
      },
      physical: normalizePhysicalAttrs(parsed.physical),
      notes: parsed.notes || "",
    };
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
    return {
      people,
      shared: {
        surname: "",
        epitaph: parsed.shared_epitaph || "",
      },
      physical: normalizePhysicalAttrs(parsed.physical),
      notes: parsed.full_text_transcription || "",
    };
  }

  return {
    people: [],
    shared: { surname: "", epitaph: "" },
    physical: normalizePhysicalAttrs(undefined),
    notes: typeof parsed === "object" ? JSON.stringify(parsed).slice(0, 500) : "",
  };
}

function normalizePersonTarget(p: any, index: number): HeadstonePersonTarget {
  const full =
    p.full_name ||
    `${p.forename || ""} ${p.surname || ""}`.trim() ||
    "Unknown";
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
      birth: p.dates?.birth || p.date_of_birth || "",
      death: p.dates?.death || p.date_of_death || "",
      aged: p.dates?.aged ?? p.age_at_death ?? null,
    },
    relationships: Array.isArray(p.relationships) ? p.relationships : [],
    occupation: p.occupation || "",
    veteran: !!p.veteran,
    evidence: p.evidence || p.notes || "",
  };
}

/** Transcription string from reasoning target for plot notes */
export function reasoningToTranscription(target: HeadstoneReasoningTarget): string {
  if (target.notes && target.notes.trim()) return target.notes.trim();
  const lines: string[] = [];
  for (const p of target.people) {
    const dates = [p.dates?.birth, p.dates?.death].filter(Boolean).join(" – ");
    lines.push([p.full_name, dates].filter(Boolean).join("\n"));
  }
  if (target.shared?.epitaph) lines.push(target.shared.epitaph);
  return lines.join("\n\n");
}
