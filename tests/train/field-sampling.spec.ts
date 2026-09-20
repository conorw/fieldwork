import { describe, expect, it } from "vitest";
import {
  FIELD_SAMPLE_KEEP_EVERY,
  fieldSampleFromAnalysis,
  isUsefulFieldSample,
  shouldKeepUnconfirmedFieldSample,
} from "../../src/utils/fieldSampling";

describe("field sampling", () => {
  it("keeps every unconfirmed sample until coverage is met", () => {
    expect(shouldKeepUnconfirmedFieldSample("img-a", 0, 6)).toBe(true);
    expect(shouldKeepUnconfirmedFieldSample("img-b", 5, 6)).toBe(true);
  });

  it(`keeps 1 in ${FIELD_SAMPLE_KEEP_EVERY} after coverage`, () => {
    const kept = ["img-1", "img-2", "img-3", "img-4", "img-5", "img-6", "img-7", "img-8"].filter(
      (id) => shouldKeepUnconfirmedFieldSample(id, 12, 6),
    );
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(8);
  });

  it("is deterministic for the same image id", () => {
    const a = shouldKeepUnconfirmedFieldSample("plot-img-42", 20, 6);
    const b = shouldKeepUnconfirmedFieldSample("plot-img-42", 20, 6);
    expect(a).toBe(b);
  });

  it("skips empty analyses and keeps named people", () => {
    expect(isUsefulFieldSample({ persons: [] })).toBe(false);
    expect(
      isUsefulFieldSample({
        persons: [{ full_name: "Jane Doe" } as any],
      }),
    ).toBe(true);
    expect(
      isUsefulFieldSample({
        full_text_transcription: "In loving memory of a long inscription here",
      }),
    ).toBe(true);
  });

  it("builds a field_sample review target", () => {
    const sample = fieldSampleFromAnalysis(
      {
        persons: [
          {
            full_name: "Jane Doe",
            forename: "Jane",
            surname: "Doe",
            notes: "",
          } as any,
        ],
        shared_epitaph: "Rest in peace",
        full_text_transcription: "JANE DOE",
      },
      "field_sample",
    );
    expect(sample).not.toBeNull();
    expect(sample?.stoneType).toBe("single");
    expect(sample?.target.review?.source).toBe("field_sample");
    expect(sample?.target.people[0].full_name).toBe("Jane Doe");
  });
});
