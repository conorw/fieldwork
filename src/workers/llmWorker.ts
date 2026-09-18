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
  | { type: "analyze"; imageUrl: string; prompt: string }
  | { type: "status" };

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

async function analyze(imageUrl: string, prompt: string) {
  if (!model || !processor) {
    postError("Model not loaded");
    return;
  }

  try {
    self.postMessage({ type: "inference-start" });

    const messages = [
      {
        role: "user",
        content: `<image>${prompt}`,
      },
    ];

    const formattedPrompt = processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });

    const image = await RawImage.read(imageUrl);

    const inputs = await processor(image, formattedPrompt, {
      add_special_tokens: false,
    });

    const outputs = await Promise.race([
      model.generate({
        ...inputs,
        max_new_tokens: 1024,
        do_sample: false,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Inference timeout after 60s")),
          60000,
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
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  if (data.type === "initialize") {
    await initialize(data.modelUrl, data.device);
  } else if (data.type === "analyze") {
    await analyze(data.imageUrl, data.prompt);
  } else if (data.type === "status") {
    self.postMessage({
      type: "status",
      isLoaded,
      modelUrl: loadedModelUrl,
    });
  }
};
