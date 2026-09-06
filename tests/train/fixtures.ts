import type {
  HeadstoneReasoningTarget,
  TrainingExamplePayload,
} from "../../src/types/headstoneTraining";
import { MIN_TRAINING_EXAMPLES } from "../../src/types/headstoneTraining";

export function makeTarget(
  overrides: Partial<HeadstoneReasoningTarget> = {},
): HeadstoneReasoningTarget {
  return {
    people: [
      {
        full_name: "Jane Example",
        role_on_stone: "primary",
        position: "left",
        forename: "Jane",
        surname: "Example",
        dates: { birth: "1920-01-01", death: "1998-06-15", aged: 78 },
        relationships: ["wife of John Example"],
        evidence: "left column",
      },
    ],
    shared: { surname: "Example", epitaph: "In loving memory" },
    notes: "",
    ...overrides,
  };
}

export function makeExample(
  index: number,
  overrides: Partial<TrainingExamplePayload> = {},
): TrainingExamplePayload {
  const types = [
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
  ] as const;
  return {
    imageUrl: `https://example.com/stones/${index}.jpg`,
    stoneType: types[index % types.length],
    target: makeTarget({
      people: [
        {
          full_name: `Person ${index}`,
          role_on_stone: "primary",
          position: index % 2 === 0 ? "left" : "right",
          dates: { birth: "1900", death: "1980", aged: null },
          relationships: [],
          evidence: `evidence ${index}`,
        },
      ],
    }),
    plotId: `plot-${index}`,
    plotImageId: `img-${index}`,
    ...overrides,
  };
}

/** Enough reviewed examples to pass the train gate */
export function makeExampleBatch(
  count = MIN_TRAINING_EXAMPLES,
): TrainingExamplePayload[] {
  return Array.from({ length: count }, (_, i) => makeExample(i));
}

export const LOCATION_ID = "loc-test-cemetery-001";
export const USER_OWNER = "user-owner-001";
export const USER_MEMBER = "user-member-001";
export const JOB_ID = "hfjob-test-123";
export const WEBHOOK_SECRET = "test-train-webhook-secret";
