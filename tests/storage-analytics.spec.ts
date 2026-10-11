import { describe, expect, it } from "vitest";
import {
  classifyCacheEntry,
  modelRevisionFromUrl,
  summarizeMeasuredStorage,
} from "../src/utils/storageAnalytics";

describe("storage analytics", () => {
  it("treats Hugging Face and ONNX files as the AI model", () => {
    expect(
      classifyCacheEntry(
        "transformers-cache",
        "https://huggingface.co/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/abc/onnx/decoder.onnx",
      ),
    ).toBe("models");
    expect(
      classifyCacheEntry("pmtiles-cache-v1", "https://example.com/map.pmtiles"),
    ).toBe("tiles");
    expect(
      classifyCacheEntry("workbox-runtime", "https://example.com/app.js"),
    ).toBe("cache");
  });

  it("reads the model revision from a Hub cache URL", () => {
    expect(
      modelRevisionFromUrl(
        "https://huggingface.co/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/94977a30/onnx/decoder.onnx",
      ),
    ).toBe("94977a30");
    expect(modelRevisionFromUrl("https://cdn-lfs.huggingface.co/blob")).toBe(
      null,
    );
  });

  it("adds model, tiles, photos, and app data up to site usage", () => {
    const summary = summarizeMeasuredStorage({
      usage: 1_000,
      quota: 5_000,
      models: { size: 600, items: 6, copies: 2 },
      tiles: { size: 200, items: 4 },
      otherCache: { size: 50, items: 2 },
      images: { size: 40, items: 3 },
    });

    expect(summary.totalSize).toBe(1_000);
    expect(summary.breakdown.models.size).toBe(600);
    expect(summary.breakdown.models.copies).toBe(2);
    expect(summary.breakdown.tiles.size).toBe(200);
    expect(summary.breakdown.images.size).toBe(40);
    expect(summary.breakdown.database.size).toBe(110);
    expect(summary.breakdown.cache.size).toBe(50);
    const parts =
      summary.breakdown.models.size +
      summary.breakdown.tiles.size +
      summary.breakdown.images.size +
      summary.breakdown.database.size +
      summary.breakdown.cache.size;
    expect(parts).toBe(summary.totalSize);
  });
});
