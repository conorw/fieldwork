/**
 * Detect on-device AI capabilities (WebGPU / WASM fallback messaging).
 */
export type InferenceBackend = "webgpu" | "wasm" | "unsupported";

export interface DeviceAiCapabilities {
  backend: InferenceBackend;
  hasWebGPU: boolean;
  staffMessage: string;
  canRunOfflineAi: boolean;
}

let cached: DeviceAiCapabilities | null = null;

export async function detectDeviceAiCapabilities(
  force = false,
): Promise<DeviceAiCapabilities> {
  if (cached && !force) return cached;

  const hasWebGPU =
    typeof navigator !== "undefined" && "gpu" in navigator;

  let backend: InferenceBackend = "unsupported";
  if (hasWebGPU) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      backend = adapter ? "webgpu" : "wasm";
    } catch {
      backend = "wasm";
    }
  } else {
    // Transformers.js can still run WASM/CPU — slow but usable on some devices
    backend = typeof WebAssembly !== "undefined" ? "wasm" : "unsupported";
  }

  const canRunOfflineAi = backend === "webgpu" || backend === "wasm";
  let staffMessage: string;
  if (backend === "webgpu") {
    staffMessage = "This device can run offline headstone reading.";
  } else if (backend === "wasm") {
    staffMessage =
      "Offline reading will work on this device but may be slower. Use Chrome on Android or a recent desktop browser for best results.";
  } else {
    staffMessage =
      "This device cannot run offline AI. Keep using online reading, or use another tablet/phone that supports modern browsers.";
  }

  cached = { backend, hasWebGPU, staffMessage, canRunOfflineAi };
  return cached;
}

export function getCachedDeviceCapabilities(): DeviceAiCapabilities | null {
  return cached;
}
