// Local browser-based VLM service for headstone analysis (FastVLM via Web Worker).
// Loaded on app boot so new customers can read stones on-device immediately.

import type { HeadstoneAnalysisResult } from "../utils/headstoneAnalysisService";
import {
  DEFAULT_ONNX_MODEL_ID,
  normalizePhysicalAttrs,
  REASONING_PROMPT,
  STOCK_REASONING_PROMPT,
} from "../types/headstoneTraining";
import {
  parseReasoningJson,
  reasoningTargetToPersons,
  reasoningToTranscription,
} from "../utils/reasoningMapper";
import { markModelReady } from "./modelCacheService";
import { detectDeviceAiCapabilities } from "../utils/deviceAiCapabilities";
import type { InferenceBackend } from "../utils/deviceAiCapabilities";

interface ModelState {
  isLoaded: boolean;
  isLoading: boolean;
  loadProgress: number;
  error: string | null;
  modelUrl: string | null;
  revision: string | null;
  backend: InferenceBackend | null;
}

class LocalLLMService {
  private modelState: ModelState = {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
    modelUrl: null,
    revision: null,
    backend: null,
  };

  private worker: Worker | null = null;
  private analyzeResolve: ((text: string) => void) | null = null;
  private analyzeReject: ((err: Error) => void) | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;
  private readyPromise: Promise<void> | null = null;

  /**
   * Load stock Hub FastVLM or a per-cemetery merged ONNX URL.
   * Called on app boot for the shared model, and again when a cemetery adapter is ready.
   */
  async initialize(options?: {
    modelUrl?: string;
    locationId?: string;
    adapterVersion?: string;
    revision?: string;
  }): Promise<void> {
    const modelUrl = options?.modelUrl || DEFAULT_ONNX_MODEL_ID;
    const revision = options?.revision || null;

    if (
      this.modelState.isLoaded &&
      this.modelState.modelUrl === modelUrl &&
      this.modelState.revision === revision &&
      !this.modelState.error
    ) {
      return;
    }

    if (this.modelState.isLoading && this.readyPromise) {
      return this.readyPromise;
    }

    const caps = await detectDeviceAiCapabilities();
    if (!caps.canRunOfflineAi) {
      this.modelState.error = caps.staffMessage;
      throw new Error(caps.staffMessage);
    }

    this.modelState.isLoading = true;
    this.modelState.error = null;
    this.modelState.loadProgress = 0;
    this.modelState.backend = caps.backend;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    try {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
        this.modelState.isLoaded = false;
      }

      this.worker = new Worker(
        new URL("../workers/llmWorker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (event) =>
        this.handleWorkerMessage(event, options);
      this.worker.onerror = (err) =>
        this.handleWorkerError(err.message ?? "Worker error");

      const device = caps.backend === "webgpu" ? "webgpu" : "wasm";
      this.worker.postMessage({
        type: "initialize",
        modelUrl,
        device,
        revision: revision || undefined,
      });
    } catch (err) {
      this.modelState.isLoading = false;
      this.modelState.error = err instanceof Error ? err.message : String(err);
      this.readyReject?.(new Error(this.modelState.error));
      this.readyPromise = null;
      throw err;
    }

    return this.readyPromise;
  }

  private handleWorkerMessage(
    event: MessageEvent,
    options?: {
      modelUrl?: string;
      locationId?: string;
      adapterVersion?: string;
      revision?: string;
    },
  ) {
    const msg = event.data;

    switch (msg.type) {
      case "loading":
        this.modelState.isLoading = true;
        break;

      case "progress":
        this.modelState.loadProgress = msg.progress;
        window.dispatchEvent(
          new CustomEvent("llm-download-progress", {
            detail: { progress: msg.progress },
          }),
        );
        break;

      case "ready":
        this.modelState.isLoaded = true;
        this.modelState.isLoading = false;
        this.modelState.loadProgress = 100;
        this.modelState.modelUrl = msg.modelUrl || options?.modelUrl || DEFAULT_ONNX_MODEL_ID;
        this.modelState.revision = options?.revision || null;
        void markModelReady({
          modelUrl: this.modelState.modelUrl!,
          locationId: options?.locationId,
          adapterVersion: options?.adapterVersion,
          cachedAt: new Date().toISOString(),
          kind: options?.modelUrl?.includes("adapters/") ? "adapter" : "hub",
        });
        window.dispatchEvent(
          new CustomEvent("llm-download-complete", {
            detail: { modelUrl: this.modelState.modelUrl },
          }),
        );
        console.log("✅ LocalLLMService: FastVLM ready", this.modelState.modelUrl);
        this.readyResolve?.();
        this.readyResolve = null;
        this.readyReject = null;
        this.readyPromise = null;
        break;

      case "inference-start":
        console.log("LocalLLMService: inference started");
        break;

      case "inference-progress":
        console.log(
          `LocalLLMService: still generating (${Math.round((msg.elapsedMs || 0) / 1000)}s)`,
        );
        break;

      case "result":
        if (this.analyzeResolve) {
          this.analyzeResolve(msg.text);
          this.analyzeResolve = null;
          this.analyzeReject = null;
        }
        break;

      case "error":
        this.modelState.error = msg.error;
        if (!this.modelState.isLoaded) {
          this.modelState.isLoading = false;
          window.dispatchEvent(
            new CustomEvent("llm-load-error", { detail: { error: msg.error } }),
          );
          this.readyReject?.(new Error(msg.error));
          this.readyResolve = null;
          this.readyReject = null;
          this.readyPromise = null;
        }
        if (this.analyzeReject) {
          this.analyzeReject(new Error(msg.error));
          this.analyzeResolve = null;
          this.analyzeReject = null;
        }
        break;
    }
  }

  private handleWorkerError(message: string) {
    console.error("❌ LocalLLMService Worker error:", message);
    this.modelState.isLoading = false;
    this.modelState.error = message;
    this.readyReject?.(new Error(message));
    this.readyResolve = null;
    this.readyReject = null;
    this.readyPromise = null;
    if (this.analyzeReject) {
      this.analyzeReject(new Error(message));
      this.analyzeResolve = null;
      this.analyzeReject = null;
    }
  }

  async analyzeImage(
    imageFile: File,
    _base64Data?: string,
  ): Promise<HeadstoneAnalysisResult> {
    if (!this.modelState.isLoaded || !this.worker) {
      throw new Error("Local model is not loaded yet.");
    }

    return new Promise((resolve, reject) => {
      this.analyzeResolve = (text: string) => {
        try {
          resolve(this.parseStructuredOutput(text));
        } catch (e) {
          reject(e);
        }
      };
      this.analyzeReject = reject;

      void imageFile.arrayBuffer().then(
        (imageBuffer) => {
          const prompt =
            this.modelState.modelUrl === DEFAULT_ONNX_MODEL_ID
              ? STOCK_REASONING_PROMPT
              : REASONING_PROMPT;
          this.worker!.postMessage(
            {
              type: "analyze",
              imageBuffer,
              mimeType: imageFile.type || "image/jpeg",
              prompt,
            },
            [imageBuffer],
          );
        },
        (err) => {
          this.analyzeReject?.(
            err instanceof Error ? err : new Error(String(err)),
          );
          this.analyzeResolve = null;
          this.analyzeReject = null;
        },
      );
    });
  }

  private parseStructuredOutput(generatedText: string): HeadstoneAnalysisResult {
    const target = parseReasoningJson(generatedText);
    const persons = reasoningTargetToPersons(target);
    const transcription = reasoningToTranscription(target);

    return {
      success: true,
      persons,
      full_text_transcription: transcription,
      shared_epitaph: target.shared?.epitaph || "",
      physical: normalizePhysicalAttrs(target.physical),
      raw_analysis: generatedText,
      metadata: {
        analysis_timestamp: new Date().toISOString(),
        model_used: this.modelState.modelUrl || DEFAULT_ONNX_MODEL_ID,
        confidence_level: target.people.length > 0 ? "high" : "low",
      },
    };
  }

  getState(): ModelState {
    return { ...this.modelState };
  }

  getLoadedModelUrl(): string | null {
    return this.modelState.modelUrl;
  }

  isReady(): boolean {
    return (
      this.modelState.isLoaded &&
      !this.modelState.isLoading &&
      !this.modelState.error
    );
  }

  isReadyFor(modelUrl: string, revision?: string): boolean {
    return (
      this.isReady() &&
      this.modelState.modelUrl === modelUrl &&
      (revision == null || this.modelState.revision === revision)
    );
  }

  isLoading(): boolean {
    return this.modelState.isLoading;
  }

  /** Stop a general-model download and record why the shared model is not in use. */
  reportUnavailable(message: string): void {
    if (this.modelState.isLoaded) return;
    this.worker?.terminate();
    this.worker = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.readyPromise = null;
    this.modelState = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: message,
      modelUrl: null,
      revision: null,
      backend: null,
    };
    window.dispatchEvent(
      new CustomEvent("llm-load-error", { detail: { error: message } }),
    );
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.modelState = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: null,
      modelUrl: null,
      revision: null,
      backend: null,
    };
    this.readyPromise = null;
  }
}

export const localLLMService = new LocalLLMService();
