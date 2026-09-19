// LLM Web Worker - runs FastVLM analysis off the main thread
// Using a Web Worker bypasses Vite's import analysis issues with transformers.web.js
// and prevents blocking the UI during heavy model loading/inference

import {
  env,
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
} from "@huggingface/transformers";

// Prefer browser cache so a second load works offline after Hub/adapter download
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const DEFAULT_MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

let processor: any = null;
let model: any = null;
let isLoaded = false;
let isLoading = false;
let loadedModelUrl: string | null = null;

type WorkerMessage =
  | { type: "initialize"; modelUrl?: string; device?: "webgpu" | "wasm" }
  | {
      type: "analyze";
      prompt: string;
      imageUrl?: string;
      imageBuffer?: ArrayBuffer;
      mimeType?: string;
    }
  | { type: "status" };

/** Vision encoder is expensive; shrink photos before generate. */
const MAX_IMAGE_SIDE = 768;
/** Headstone JSON is small; 1024 tokens routinely exceeds a minute on WASM. */
const MAX_NEW_TOKENS = 512;
/** First WebGPU compile + WASM decode can take well over 60s. */
const INFERENCE_TIMEOUT_MS = 180_000;

function postProgress(progress: number) {
  self.postMessage({ type: "progress", progress });
}

function postError(error: string) {
  self.postMessage({ type: "error", error });
}

async function initialize(
  modelUrl: string = DEFAULT_MODEL_ID,
  device: "webgpu" | "wasm" = "webgpu",
) {
  if (isLoaded && loadedModelUrl === modelUrl) {
    self.postMessage({ type: "ready", modelUrl });
    return;
  }
  if (isLoading) return;
  isLoading = true;

  try {
    // Unload previous if switching adapters
    if (isLoaded && loadedModelUrl !== modelUrl) {
      processor = null;
      model = null;
      isLoaded = false;
    }

    self.postMessage({ type: "loading", modelUrl });

    const dtype = {
      embed_tokens: "fp16" as const,
      vision_encoder: "q4" as const,
      decoder_model_merged: "q4" as const,
    };

    processor = await AutoProcessor.from_pretrained(modelUrl, {
      progress_callback: (p: any) => {
        if (p.progress !== undefined) {
          postProgress(Math.min(50, Number(p.progress) / 2));
        }
      },
    });

    const loadOpts: Record<string, unknown> = {
      dtype,
      progress_callback: (p: any) => {
        if (p.progress !== undefined) {
          postProgress(50 + Math.min(50, Number(p.progress) / 2));
        }
      },
    };

    // device hint when supported by transformers.js
    if (device === "webgpu") {
      loadOpts.device = "webgpu";
    }

    try {
      model = await AutoModelForImageTextToText.from_pretrained(
        modelUrl,
        loadOpts,
      );
    } catch (webgpuErr) {
      console.warn(
        "[llmWorker] WebGPU load failed, retrying without device hint:",
        webgpuErr,
      );
      const { device: _d, ...rest } = loadOpts;
      model = await AutoModelForImageTextToText.from_pretrained(modelUrl, rest);
    }

    isLoaded = true;
    isLoading = false;
    loadedModelUrl = modelUrl;
    self.postMessage({ type: "ready", modelUrl });
  } catch (err) {
    isLoading = false;
    postError(err instanceof Error ? err.message : String(err));
  }
}

async function loadImage(
  data: Extract<WorkerMessage, { type: "analyze" }>,
): Promise<any> {
  if (data.imageBuffer) {
    const blob = new Blob([data.imageBuffer], {
      type: data.mimeType || "image/jpeg",
    });
    return RawImage.read(blob);
  }
  if (data.imageUrl) {
    return RawImage.read(data.imageUrl);
  }
  throw new Error("No image provided");
}

async function resizeForInference(image: any): Promise<any> {
  const rgb = typeof image.rgb === "function" ? image.rgb() : image;
  const width = Number(rgb?.width || 0);
  const height = Number(rgb?.height || 0);
  const longSide = Math.max(width, height);
  if (!longSide || longSide <= MAX_IMAGE_SIDE || typeof rgb.resize !== "function") {
    return rgb;
  }
  const scale = MAX_IMAGE_SIDE / longSide;
  return rgb.resize(
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  );
}

async function analyze(data: Extract<WorkerMessage, { type: "analyze" }>) {
  if (!model || !processor) {
    postError("Model not loaded");
    return;
  }

  const started = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {
    self.postMessage({ type: "inference-start" });
    heartbeat = setInterval(() => {
      self.postMessage({
        type: "inference-progress",
        elapsedMs: Date.now() - started,
      });
    }, 5000);

    const messages = [
      {
        role: "user",
        content: `<image>${data.prompt}`,
      },
    ];

    const formattedPrompt = await Promise.resolve(
      processor.apply_chat_template(messages, {
        add_generation_prompt: true,
      }),
    );

    const image = await resizeForInference(await loadImage(data));
    if (!image?.width || !image?.height || !image?.data) {
      throw new Error("Failed to decode image for local analysis");
    }

    const inputs = await processor(image, formattedPrompt, {
      add_special_tokens: false,
    });

    const isCompactStockPrompt = data.prompt.includes('"transcription":""');
    const outputs = await Promise.race([
      model.generate({
        ...inputs,
        max_new_tokens: isCompactStockPrompt ? 320 : MAX_NEW_TOKENS,
        do_sample: false,
        repetition_penalty: 1.08,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Inference timeout after ${INFERENCE_TIMEOUT_MS / 1000}s — keep the tab in the foreground and try a smaller photo`,
              ),
            ),
          INFERENCE_TIMEOUT_MS,
        ),
      ),
    ]);

    const decoded = processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true },
    );

    self.postMessage({ type: "result", text: decoded[0] });
  } catch (err) {
    console.error("[llmWorker] Error during analysis:", err);
    postError(err instanceof Error ? err.message : String(err));
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  if (data.type === "initialize") {
    await initialize(data.modelUrl, data.device);
  } else if (data.type === "analyze") {
    await analyze(data);
  } else if (data.type === "status") {
    self.postMessage({
      type: "status",
      isLoaded,
      modelUrl: loadedModelUrl,
    });
  }
};
