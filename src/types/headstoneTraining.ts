/**
 * Frozen target schema for per-cemetery VLM training.
 * The local model must reason about people + layout, not just transcribe.
 * Keep in sync with training/schema.py
 */

export type StoneType =
  | "single"
  | "couple"
  | "family"
  | "kerb"
  | "ledger"
  | "cross"
  | "child"
  | "war"
  | "weathered"
  | "unknown";

/** Physical material of the monument (separate from occupancy stoneType) */
export type StoneMaterial =
  | "granite"
  | "marble"
  | "slate"
  | "limestone"
  | "sandstone"
  | "bronze"
  | "wood"
  | "concrete"
  | "other"
  | "unknown";

/** Physical form / monument style */
export type MonumentForm =
  | "upright"
  | "arched"
  | "desk"
  | "kerb"
  | "ledger"
  | "cross"
  | "plaque"
  | "cremation"
  | "obelisk"
  | "other"
  | "unknown";

/** Visual / structural condition of the stone */
export type StoneCondition =
  | "excellent"
  | "good"
  | "fair"
  | "weathered"
  | "damaged"
  | "leaning"
  | "fallen"
  | "illegible"
  | "new"
  | "unknown";

export interface HeadstonePhysicalAttrs {
  material: StoneMaterial;
  form: MonumentForm;
  condition: StoneCondition;
  /** Optional free-text detail, e.g. "polished dark grey", "fresh soil around base" */
  detail?: string;
}

export type PersonPosition =
  | "left"
  | "right"
  | "upper"
  | "lower"
  | "shared"
  | "center"
  | "unknown";

export type PersonRoleOnStone =
  | "primary"
  | "spouse"
  | "child"
  | "parent"
  | "other";

export interface HeadstonePersonTarget {
  full_name: string;
  title?: string;
  forename?: string;
  middle_name?: string;
  surname?: string;
  maiden_name?: string;
  known_as?: string;
  role_on_stone: PersonRoleOnStone;
  position: PersonPosition;
  dates: {
    birth?: string;
    death?: string;
    aged?: number | null;
  };
  relationships: string[];
  /** Trade / regiment / profession when inscribed (e.g. "blacksmith", "Royal Irish Rifles") */
  occupation?: string;
  veteran?: boolean;
  evidence: string;
}

export interface HeadstoneReasoningTarget {
  people: HeadstonePersonTarget[];
  shared: {
    surname?: string;
    epitaph?: string;
  };
  /** Material, physical form, and condition of the monument */
  physical?: HeadstonePhysicalAttrs;
  notes?: string;
  /**
   * Staff review metadata — stripped before VLM train labels are applied.
   * Corrections feed this cemetery’s adapter and the shared global model.
   */
  review?: {
    was_corrected: boolean;
    source: "confirm" | "correction" | "soft_skip";
    /** Original model prediction before edits (JSON-serializable) */
    prediction?: HeadstoneReasoningTarget | Record<string, unknown>;
  };
}

export interface TrainingExamplePayload {
  imageUrl: string;
  stoneType: StoneType;
  target: HeadstoneReasoningTarget;
  plotId?: string;
  plotImageId?: string;
}

export interface TrainJobPayload {
  locationId: string;
  version: string;
  examples: TrainingExamplePayload[];
  webhookUrl: string;
  /** Global LoRA weights URL (no images). Optional cold-start. */
  baseAdapterUrl?: string;
}

/** Cold-start minimum reviewed examples before a train job may start */
export const MIN_TRAINING_EXAMPLES = 15;

/** With a shared global adapter, cemeteries only need a smaller local set */
export const MIN_TRAINING_EXAMPLES_WITH_GLOBAL = 6;

/** After local is live, this many new confirms trigger a silent retrain */
export const RETRAIN_DELTA_EXAMPLES = 8;

/** Distinct stone kinds required in the onboarding checklist */
export const MIN_DISTINCT_STONE_TYPES = 3;

export const DEFAULT_ONNX_MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

/** Prompt shared by train jobs and on-device inference — keep in sync with training/schema.py */
export const REASONING_PROMPT =
  "Read every inscription on this headstone. Return ONLY one valid compact JSON object, " +
  "with no markdown and no repeated keys, using exactly this shape: " +
  '{"people":[{"full_name":"","role_on_stone":"primary","position":"upper",' +
  '"dates":{"birth":"","death":"","aged":null},"relationships":[],' +
  '"occupation":"","veteran":false,"evidence":""}],' +
  '"shared":{"surname":"","epitaph":""},' +
  '"physical":{"material":"unknown","form":"unknown","condition":"unknown","detail":""},' +
  '"notes":""}. ' +
  "Copy dates as yyyy-mm-dd (example: 1933-06-25). " +
  "Relationships such as dear husband, wife, mother, son or daughter belong in " +
  "relationships, never occupation. notes is a concise full transcription. " +
  "Valid role_on_stone values: primary, spouse, child, parent, other. " +
  "Valid positions: upper, lower, left, right, center, shared, unknown. " +
  "Never use a stones or persons key.";

/**
 * The stock 0.5B model is useful for bootstrapping/evaluation but is not yet
 * fine-tuned to the rich reasoning schema. Keep this response deliberately
 * small, then normalize it through reasoningMapper.
 */
export const STOCK_REASONING_PROMPT =
  "Read the headstone inscription. For every deceased person, copy the name " +
  "AND the two dates carved with that name (birth then death). Convert each date " +
  "to yyyy-mm-dd (example: 25th June 1933 → 1933-06-25). Return ONLY JSON: " +
  '{"people":[{"full_name":"","birth":"yyyy-mm-dd","death":"yyyy-mm-dd"}],' +
  '"transcription":""}. ' +
  "transcription is the full readable inscription including every date. " +
  "Never leave birth or death blank if a date is visible under that name.";

export const STONE_TYPES: StoneType[] = [
  "single",
  "couple",
  "family",
  "kerb",
  "ledger",
  "cross",
  "child",
  "war",
  "weathered",
  "unknown",
];

export const STONE_MATERIALS: StoneMaterial[] = [
  "granite",
  "marble",
  "slate",
  "limestone",
  "sandstone",
  "bronze",
  "wood",
  "concrete",
  "other",
  "unknown",
];

export const MONUMENT_FORMS: MonumentForm[] = [
  "upright",
  "arched",
  "desk",
  "kerb",
  "ledger",
  "cross",
  "plaque",
  "cremation",
  "obelisk",
  "other",
  "unknown",
];

export const STONE_CONDITIONS: StoneCondition[] = [
  "excellent",
  "good",
  "fair",
  "weathered",
  "damaged",
  "leaning",
  "fallen",
  "illegible",
  "new",
  "unknown",
];

export const STONE_MATERIAL_LABELS: Record<StoneMaterial, string> = {
  granite: "Granite",
  marble: "Marble",
  slate: "Slate",
  limestone: "Limestone",
  sandstone: "Sandstone",
  bronze: "Bronze",
  wood: "Wood",
  concrete: "Concrete",
  other: "Other",
  unknown: "Unknown",
};

export const MONUMENT_FORM_LABELS: Record<MonumentForm, string> = {
  upright: "Upright",
  arched: "Arched / shouldered",
  desk: "Desk / wedge",
  kerb: "Kerb",
  ledger: "Ledger / flat",
  cross: "Cross",
  plaque: "Plaque",
  cremation: "Cremation / tablet",
  obelisk: "Obelisk",
  other: "Other",
  unknown: "Unknown",
};

export const STONE_CONDITION_LABELS: Record<StoneCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  weathered: "Weathered",
  damaged: "Damaged",
  leaning: "Leaning",
  fallen: "Fallen",
  illegible: "Illegible",
  new: "New / recently set",
  unknown: "Unknown",
};

export function emptyPhysicalAttrs(): HeadstonePhysicalAttrs {
  return {
    material: "unknown",
    form: "unknown",
    condition: "unknown",
    detail: "",
  };
}

export function normalizePhysicalAttrs(
  raw: Partial<HeadstonePhysicalAttrs> | null | undefined,
): HeadstonePhysicalAttrs {
  const material = STONE_MATERIALS.includes(raw?.material as StoneMaterial)
    ? (raw!.material as StoneMaterial)
    : "unknown";
  const form = MONUMENT_FORMS.includes(raw?.form as MonumentForm)
    ? (raw!.form as MonumentForm)
    : "unknown";
  const condition = STONE_CONDITIONS.includes(raw?.condition as StoneCondition)
    ? (raw!.condition as StoneCondition)
    : "unknown";
  return {
    material,
    form,
    condition,
    detail: (raw?.detail || "").trim(),
  };
}

/** Staff-facing checklist (4 options mapped into StoneType) */
export type StaffStoneKind = "one_person" | "couple" | "family" | "other";

export const STAFF_STONE_KIND_TO_TYPE: Record<StaffStoneKind, StoneType> = {
  one_person: "single",
  couple: "couple",
  family: "family",
  other: "unknown",
};

export const STAFF_STONE_KIND_LABELS: Record<StaffStoneKind, string> = {
  one_person: "One person",
  couple: "Couple",
  family: "Family",
  other: "Other / weathered",
};

export function trainingExampleGate(hasGlobalAdapter: boolean): number {
  return hasGlobalAdapter
    ? MIN_TRAINING_EXAMPLES_WITH_GLOBAL
    : MIN_TRAINING_EXAMPLES;
}
