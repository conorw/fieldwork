import { describe, expect, it } from "vitest";
import { hubUpstreamUrl, onnxRuntimeUpstream } from "../../workers/hubProxy";

describe("hub file proxy", () => {
  it("mirrors a pinned headstone file on this origin", () => {
    expect(
      hubUpstreamUrl(
        "/api/hf/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/2def96456c92bcaf336ca2223b5bd344fb1b46e8/preprocessor_config.json",
      ),
    ).toBe(
      "https://huggingface.co/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/2def96456c92bcaf336ca2223b5bd344fb1b46e8/preprocessor_config.json",
    );
    expect(
      hubUpstreamUrl(
        "/api/hf/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/main/onnx/decoder_model_merged_q4f16.onnx",
      ),
    ).toBe(
      "https://huggingface.co/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/main/onnx/decoder_model_merged_q4f16.onnx",
    );
  });

  it("refuses other repositories and path escapes", () => {
    expect(
      hubUpstreamUrl("/api/hf/openai/whisper-tiny/resolve/main/config.json"),
    ).toBeNull();
    expect(
      hubUpstreamUrl(
        "/api/hf/conorwoods/fieldwork-fastvlm-0.5b-onnx/resolve/main/../../config.json",
      ),
    ).toBeNull();
  });

  it("mirrors one ONNX runtime file from the transformers package", () => {
    expect(onnxRuntimeUpstream("/api/onnx-runtime/3.8.1/ort-wasm-simd-threaded.wasm")).toBe(
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/ort-wasm-simd-threaded.wasm",
    );
    expect(onnxRuntimeUpstream("/api/onnx-runtime/3.8.1/../package.json")).toBeNull();
  });
});