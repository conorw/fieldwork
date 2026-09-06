import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/stores/powersync", () => ({
  usePowerSyncStore: () => ({ powerSync: null }),
}));
vi.mock("../../src/stores/auth", () => ({
  useAuthStore: () => ({ user: null, session: null }),
}));

import {
  MIN_TRAINING_EXAMPLES,
  STONE_TYPES,
} from "../../src/types/headstoneTraining";
import {
  examplesReadyForTraining,
  toTrainPayloadExamples,
  type TrainingExampleRecord,
} from "../../src/utils/headstoneTrainingService";
import { LOCATION_ID, makeExampleBatch, makeTarget } from "./fixtures";

describe("client training example helpers", () => {
  it("examplesReadyForTraining respects the gate", () => {
    expect(examplesReadyForTraining(MIN_TRAINING_EXAMPLES - 1)).toBe(false);
    expect(examplesReadyForTraining(MIN_TRAINING_EXAMPLES)).toBe(true);
    expect(examplesReadyForTraining(40)).toBe(true);
  });

  it("toTrainPayloadExamples maps DB rows to HF job examples", () => {
    const now = new Date().toISOString();
    const target = makeTarget();
    const rows: TrainingExampleRecord[] = [
      {
        id: "ex-1",
        location_id: LOCATION_ID,
        plot_id: "p1",
        plot_image_id: "i1",
        image_url: "https://blob/a.jpg",
        stone_type: "couple",
        target_json: JSON.stringify(target),
        reviewed_by: "user-1",
        reviewed_at: now,
        date_created: now,
      },
    ];

    const payload = toTrainPayloadExamples(rows);
    expect(payload).toHaveLength(1);
    expect(payload[0].imageUrl).toBe("https://blob/a.jpg");
    expect(payload[0].stoneType).toBe("couple");
    expect(payload[0].target.people[0].full_name).toBe("Jane Example");
    expect(payload[0].plotId).toBe("p1");
  });

  it("onboarding batch covers distinct stone types", () => {
    const batch = makeExampleBatch(STONE_TYPES.length);
    const types = new Set(batch.map((e) => e.stoneType));
    for (const t of STONE_TYPES) {
      expect(types.has(t)).toBe(true);
    }
  });
});
