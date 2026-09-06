// LLM Web Worker - runs FastVLM analysis off the main thread
// Using a Web Worker bypasses Vite's import analysis issues with transformers.web.js
// and prevents blocking the UI during heavy model loading/inference

import {
  env,
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;

const MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

let processor: any = null;
let model: any = null;
let isLoaded = false;
let isLoading = false;

type WorkerMessage =
  | { type: "initialize" }
  | { type: "analyze"; imageUrl: string; prompt: string };

function postProgress(progress: number) {
  self.postMessage({ type: "progress", progress });
}

function postError(error: string) {
  self.postMessage({ type: "error", error });
}

async function initialize() {
  if (isLoaded || isLoading) return;
  isLoading = true;

  try {
    self.postMessage({ type: "loading" });

    processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: (p: any) => {
        if (p.progress !== undefined) {
          postProgress(p.progress);
        }
      },
    });

    model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
      dtype: {
        embed_tokens: "fp16",
        vision_encoder: "q4",
        decoder_model_merged: "q4",
      },
      progress_callback: (p: any) => {
        if (p.progress !== undefined) {
          postProgress(p.progress);
        }
      },
    });

    isLoaded = true;
    isLoading = false;
    self.postMessage({ type: "ready" });
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
    console.log(
      "[llmWorker] Starting analysis, imageUrl:",
      imageUrl.substring(0, 50),
    );
    self.postMessage({ type: "inference-start" });

    const messages = [
      {
        role: "user",
        content: `<image>${prompt}`,
      },
    ];

    console.log("[llmWorker] Applying chat template");
    const formattedPrompt = processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });

    console.log("[llmWorker] Loading image from URL");
    const image = await RawImage.read(imageUrl);
    console.log(
      "[llmWorker] Image loaded, dimensions:",
      image.width,
      "x",
      image.height,
    );

    console.log("[llmWorker] Processing inputs");
    const inputs = await processor(image, formattedPrompt, {
      add_special_tokens: false,
    });

    console.log("[llmWorker] Running model.generate()");
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

    console.log("[llmWorker] Decoding outputs");
    const decoded = processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true },
    );

    console.log("[llmWorker] Sending result");
    self.postMessage({ type: "result", text: decoded[0] });
  } catch (err) {
    console.error("[llmWorker] Error during analysis:", err);
    postError(err instanceof Error ? err.message : String(err));
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;
  if (type === "initialize") {
    await initialize();
  } else if (type === "analyze") {
    const { imageUrl, prompt } = event.data as any;
    await analyze(imageUrl, prompt);
  }
};
