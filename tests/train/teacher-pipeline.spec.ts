import { describe, expect, it } from "vitest";
import { publishedManifestChoice } from "../../src/services/globalAdapterService";
import {
  countExamplesSince,
  decideTeacherTrain,
  isHumanLabel,
  mimeFromFileName,
  preferTrainingExamples,
  publishWatermark,
  teacherExampleFromAnalysis,
  type StoredTrainingRow,
} from "../../workers/lib/teacherDecision";

function row(partial: Partial<StoredTrainingRow> & Pick<StoredTrainingRow, "image_url">): StoredTrainingRow {
  return {
    id: partial.id || "1",
    image_url: partial.image_url,
    stone_type: partial.stone_type || "single",
    target_json: partial.target_json || JSON.stringify({ people: [], shared: {} }),
    review_source: partial.review_source,
    was_corrected: partial.was_corrected,
    reviewed_at: partial.reviewed_at,
    plot_id: partial.plot_id,
  };
}

describe("teacher upload decisions", () => {
  it("reads jpeg, png, and webp only", () => {
    expect(mimeFromFileName("a.jpg")).toBe("image/jpeg");
    expect(mimeFromFileName("a.WEBP")).toBe("image/webp");
    expect(mimeFromFileName("a.gif", "image/gif")).toBeNull();
    expect(mimeFromFileName("a.bin", "image/png")).toBe("image/png");
  });

  it("parses the published onnx version as a watermark", () => {
    expect(publishWatermark("onnx-2026-10-11T17-31-11Z")).toBe(
      "2026-10-11T17:31:11Z",
    );
    expect(publishWatermark(null)).toBeNull();
  });

  it("keeps a human correction ahead of a ChatGPT label for the same photo", () => {
    const image = "https://example.test/files/plot-images/a.jpg";
    const examples = preferTrainingExamples([
      row({
        id: "teacher",
        image_url: image,
        review_source: "teacher",
        target_json: JSON.stringify({
          people: [{ full_name: "From ChatGPT" }],
          shared: {},
          review: { source: "teacher", was_corrected: false },
        }),
      }),
      row({
        id: "human",
        image_url: image,
        review_source: "correction",
        was_corrected: true,
        stone_type: "couple",
        target_json: JSON.stringify({
          people: [{ full_name: "From staff" }],
          shared: { epitaph: "missed" },
          review: { source: "correction", was_corrected: true },
        }),
      }),
    ]);
    expect(examples).toHaveLength(1);
    expect(examples[0].stoneType).toBe("couple");
    expect(examples[0].target.people[0].full_name).toBe("From staff");
    expect(examples[0].target.review).toBeUndefined();
    expect(isHumanLabel(row({ image_url: image, review_source: "teacher" }))).toBe(
      false,
    );
  });

  it("waits for variety, then for eight new photos after a publish", () => {
    const waiting = decideTeacherTrain({
      aiStatus: "teacher",
      total: 2,
      byStoneType: { single: 2 },
      hasGlobalAdapter: true,
      examplesSincePublish: 2,
      watermark: null,
    });
    expect(waiting.start).toBe(false);
    expect(waiting.minExamples).toBe(6);

    const ready = decideTeacherTrain({
      aiStatus: "teacher",
      total: 6,
      byStoneType: { single: 2, couple: 2, family: 2 },
      hasGlobalAdapter: true,
      examplesSincePublish: 6,
      watermark: null,
    });
    expect(ready.start).toBe(true);

    const local = decideTeacherTrain({
      aiStatus: "local",
      total: 10,
      byStoneType: { single: 4, couple: 3, family: 3 },
      hasGlobalAdapter: true,
      examplesSincePublish: 3,
      watermark: "2026-10-11T17:31:11Z",
    });
    expect(local.start).toBe(false);
    expect(local.reason).toBe("retrain_delta_low");
  });

  it("counts only labels saved after the last publish", () => {
    const rows = [
      row({
        image_url: "old",
        reviewed_at: "2026-10-11T17:00:00Z",
      }),
      row({
        image_url: "new",
        reviewed_at: "2026-10-11T18:00:00Z",
      }),
    ];
    expect(countExamplesSince(rows, "2026-10-11T17:31:11Z")).toBe(1);
  });

  it("turns a ChatGPT reading into a couple-stone training label", () => {
    const example = teacherExampleFromAnalysis(
      {
        persons: [
          { full_name: "Dennis William Fone", date_of_birth: "1933-06-25", date_of_death: "2020-10-01" },
          { full_name: "Beryl Jean Fone", date_of_birth: "1948-02-02", date_of_death: "2021-11-01" },
        ],
        full_text_transcription: "DENNIS WILLIAM FONE",
        shared_epitaph: "Always missed, never forgotten",
      },
      "https://example.test/files/plot-images/fone.webp",
    );
    expect(example?.stoneType).toBe("couple");
    expect(example?.target.people).toHaveLength(2);
    expect(example?.target.shared.epitaph).toBe("Always missed, never forgotten");
    expect(example?.target.review).toBeUndefined();
  });
});

describe("published manifest choice", () => {
  it("uses the public revision when the local copy is older", () => {
    const chosen = publishedManifestChoice(
      { version: "old", onnx_revision: "aaa", onnx_model_id: "conorwoods/fieldwork-fastvlm-0.5b-onnx" },
      { version: "onnx-new", onnx_revision: "bbb", export_mode: "onnx", onnx_model_id: "conorwoods/fieldwork-fastvlm-0.5b-onnx" },
    );
    expect(chosen?.onnx_revision).toBe("bbb");
    expect(chosen?.version).toBe("onnx-new");
  });

  it("keeps the local manifest when the revision matches", () => {
    const local = { version: "same", onnx_revision: "abc" };
    expect(publishedManifestChoice(local, { onnx_revision: "abc", version: "other" })).toBe(local);
  });
});
