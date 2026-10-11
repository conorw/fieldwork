// LLM Web Worker - runs FastVLM analysis off the main thread
// Using a Web Worker bypasses Vite's import analysis issues with transformers.web.js
// and prevents blocking the UI during heavy model loading/inference

import "../utils/insecureContext.js";
import {
  isHtmlBody,
  isRemoteModelRequest,
  modelFileName,
} from "../utils/modelFileCache";
import {
  env,
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
} from "@huggingface/transformers";

// Weights come from Hugging Face or an adapter URL. Looking under /models
// hits the app page on the dev server and the loader tries to parse HTML.
env.allowLocalModels = false;
env.allowRemoteModels = true;
// Secure pages use the browser cache. LAN http pages use the IndexedDB stand-in
// installed above; if that is missing, download without caching.
env.useBrowserCache = typeof caches !== "undefined";

const MODEL_CACHE = "transformers-cache";
/** Written by an older service worker that stored Hub redirects as HTML. */
const BROKEN_RUNTIME_CACHE = "fieldwork-model-runtime";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const droppedBrokenCache =
  typeof caches === "undefined"
    ? Promise.resolve(false)
    : caches.delete(BROKEN_RUNTIME_CACHE);

async function usableCachedResponse(
  cache: Cache,
  request: RequestInfo,
): Promise<Response | undefined> {
  const hit = await cache.match(request);
  if (!hit?.ok) return undefined;
  if (await isHtmlBody(hit)) {
    await cache.delete(request);
    return undefined;
  }
  return hit.clone();
}

/** A file saved under another revision still counts as the same model file. */
async function cachedModelResponse(url: string): Promise<Response | undefined> {
  if (typeof caches === "undefined" || !isRemoteModelRequest(url)) return undefined;
  await droppedBrokenCache;
  const cache = await caches.open(MODEL_CACHE);
  const exact = await usableCachedResponse(cache, url);
  if (exact) return exact;
  const wanted = modelFileName(url);
  if (!wanted) return undefined;
  for (const key of await cache.keys()) {
    if (modelFileName(key.url) !== wanted) continue;
    const hit = await usableCachedResponse(cache, key);
    if (hit) return hit;
  }
  return undefined;
}

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = requestUrl(input);
  const cached = await cachedModelResponse(url);
  if (cached) return cached;

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline && isRemoteModelRequest(url)) {
    throw new Error(
      `Offline model file is not on this device yet (${modelFileName(url)}). Connect once and let the headstone model finish downloading.`,
    );
  }

  const response = await nativeFetch(input, init);
  if (isRemoteModelRequest(url) && (await isHtmlBody(response))) {
    throw new Error(
      `Model file ${modelFileName(url)} came back as a web page. Reload after the latest app version installs, then let the download finish.`,
    );
  }
  if (
    response.ok &&
    isRemoteModelRequest(url) &&
    typeof caches !== "undefined"
  ) {
    try {
      const cache = await caches.open(MODEL_CACHE);
      await cache.put(url, response.clone());
    } catch {
      /* Quota or an opaque body. The response is still usable online. */
    }
  }
  return response;
};

if (typeof caches !== "undefined") {
  env.useCustomCache = true;
  env.customCache = {
    async match(request: string) {
      return cachedModelResponse(request);
    },
    async put(request: string, response: Response) {
      if (await isHtmlBody(response)) return;
      const cache = await caches.open(MODEL_CACHE);
      await cache.put(request, response);
    },
  };
}

const DEFAULT_MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

let processor: any = null;
let model: any = null;
let isLoaded = false;
let isLoading = false;
let loadedModelUrl: string | null = null;

type WorkerMessage =
  | {
      type: "initialize";
      modelUrl?: string;
      device?: "webgpu" | "wasm";
      revision?: string;
    }
  | {
      type: "analyze";
      prompt: string;
      imageUrl?: string;
      imageBuffer?: ArrayBuffer;
      mimeType?: string;
    }
  | { type: "status" };

/**
 * The vision model is MobileCLIP at 1024px. A smaller photo is scaled back up,
 * so this only avoids decoding a multi-megapixel camera image first.
 */
const MAX_IMAGE_SIDE = 1024;
/** Worst case if the model never closes its JSON. A normal stone stops sooner. */
const MAX_NEW_TOKENS = 192;
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
  revision?: string,
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

    // The published repo only has these three graphs. A q4 vision or decoder
    // file is not uploaded, so WASM uses the same set as WebGPU.
    const dtype = {
      embed_tokens: "fp16" as const,
      vision_encoder: "fp16" as const,
      decoder_model_merged: "q4f16" as const,
    };

    const revisionOpts = revision ? { revision } : {};
    processor = await AutoProcessor.from_pretrained(modelUrl, {
      ...revisionOpts,
      progress_callback: (p: any) => {
        if (p.progress !== undefined) {
          postProgress(Math.min(50, Number(p.progress) / 2));
        }
      },
    });

    const loadOpts: Record<string, unknown> = {
      ...revisionOpts,
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
      const { device: _device, ...rest } = loadOpts;
      model = await AutoModelForImageTextToText.from_pretrained(modelUrl, {
        ...rest,
        dtype,
      });
    }
    const decoder =
      model.sessions?.decoder_model_merged ?? model.sessions?.model;
    if (decoder?.config) decoder.config.kv_cache_dtype = "float16";

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

/** True once the model has emitted one complete JSON object. */
function jsonObjectClosed(text: string): boolean {
  let depth = 0;
  let started = false;
  let inString = false;
  let escape = false;
  for (const ch of text) {
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      started = true;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth <= 0) return true;
    }
  }
  return false;
}

function decodeGeneratedIds(ids: number[]): string {
  const tokenizer = processor.tokenizer ?? processor;
  if (typeof tokenizer.decode === "function") {
    return tokenizer.decode(ids, { skip_special_tokens: true });
  }
  return processor.batch_decode([ids], { skip_special_tokens: true })[0] ?? "";
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
    const promptLength = Number(inputs.input_ids.dims.at(-1) || 0);
    const preparedAt = Date.now();
    let generatedText = "";
    let decodeWarned = false;
    const stopWhenJsonCloses = (inputIds: Array<Array<bigint | number>>) =>
      inputIds.map((ids) => {
        const generated = ids.slice(promptLength);
        if (generated.length < 8 || generated.length % 8 !== 0) return false;
        try {
          generatedText = decodeGeneratedIds(generated.map((id) => Number(id)));
        } catch (err) {
          if (!decodeWarned) {
            decodeWarned = true;
            console.warn("[llmWorker] could not read tokens while generating", err);
          }
          return false;
        }
        return jsonObjectClosed(generatedText);
      });
    const outputs = await Promise.race([
      model.generate({
        ...inputs,
        max_new_tokens: isCompactStockPrompt ? 160 : MAX_NEW_TOKENS,
        do_sample: false,
        stopping_criteria: [stopWhenJsonCloses],
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

    console.log(
      `[llmWorker] photo ready in ${preparedAt - started}ms, generated in ${Date.now() - preparedAt}ms, closed=${jsonObjectClosed(generatedText)}, preview=${JSON.stringify(generatedText.slice(0, 160))}`,
    );

    const decoded = processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true },
    );

    const piece = Array.isArray(decoded) ? decoded[0] : decoded;
    const text = Array.isArray(piece)
      ? piece.map((part) => String(part ?? "")).join("")
      : typeof piece === "string"
        ? piece
        : piece == null
          ? ""
          : String(piece);
    if (!text.includes("{")) {
      postError("The on-device reader did not return a reading.");
      return;
    }
    self.postMessage({ type: "result", text });
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
    await initialize(data.modelUrl, data.device, data.revision);
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
