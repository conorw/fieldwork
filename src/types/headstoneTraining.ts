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
  veteran?: boolean;
  evidence: string;
}

export interface HeadstoneReasoningTarget {
  people: HeadstonePersonTarget[];
  shared: {
    surname?: string;
    epitaph?: string;
  };
  notes?: string;
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
}

/** Minimum reviewed examples before a train job may start */
export const MIN_TRAINING_EXAMPLES = 15;

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
