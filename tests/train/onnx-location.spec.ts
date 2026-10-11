import { describe, expect, it } from "vitest";
import { onnxLocationFromManifest } from "../../src/services/modelCacheService";

describe("onnxLocationFromManifest", () => {
  const base = "/files/adapters/global/latest/";

  it("uses the Hugging Face repo named by an onnx manifest", () => {
    expect(
      onnxLocationFromManifest(base, {
        export_mode: "onnx",
        onnx_model_id: "conorwoods/fieldwork-fastvlm-0.5b-onnx",
      }),
    ).toBe("conorwoods/fieldwork-fastvlm-0.5b-onnx");
  });

  it("uses the onnx directory when the manifest has no hub id", () => {
    expect(
      onnxLocationFromManifest(base, { export_mode: "onnx" }),
    ).toBe("/files/adapters/global/latest/onnx/");
  });

  it("rejects a LoRA-only publish", () => {
    expect(
      onnxLocationFromManifest(base, { export_mode: "lora" }),
    ).toBeNull();
  });
});
