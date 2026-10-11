import { describe, expect, it } from "vitest";
import {
  isHtmlBody,
  isRemoteModelRequest,
  modelFileName,
} from "../../src/utils/modelFileCache";

describe("model file cache keys", () => {
  it("treats the same file under two Hub revisions as one file", () => {
    const main =
      "https://huggingface.co/onnx-community/FastVLM-0.5B-ONNX/resolve/main/preprocessor_config.json";
    const pinned =
      "https://huggingface.co/onnx-community/FastVLM-0.5B-ONNX/resolve/abc123/preprocessor_config.json";
    expect(modelFileName(main)).toBe("preprocessor_config.json");
    expect(modelFileName(pinned)).toBe(modelFileName(main));
  });

  it("recognises model hosts", () => {
    expect(
      isRemoteModelRequest(
        "https://huggingface.co/onnx-community/FastVLM-0.5B-ONNX/resolve/main/preprocessor_config.json",
      ),
    ).toBe(true);
    expect(isRemoteModelRequest("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm.wasm")).toBe(
      true,
    );
    expect(isRemoteModelRequest("https://fieldwork.conorw.workers.dev/api/analyze-headstone")).toBe(
      false,
    );
  });

  it("recognises an HTML app shell returned in place of model JSON", async () => {
    const page = new Response("<!DOCTYPE html><html><body>fieldwork</body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const plainBody = "<!DOCTYPE html><html></html>";
    const plain = new Response(plainBody, {
      headers: {
        "content-type": "text/plain",
        "content-length": String(plainBody.length),
      },
    });
    const config = new Response('{"model_type":"fastvlm"}', {
      headers: { "content-type": "text/plain" },
    });
    expect(await isHtmlBody(page)).toBe(true);
    expect(await isHtmlBody(plain)).toBe(true);
    expect(await isHtmlBody(config)).toBe(false);
  });
});