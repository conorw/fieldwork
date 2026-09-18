/**
 * Download / load per-cemetery merged ONNX when ai_status becomes local.
 */
import { localLLMService } from "./localLLMService";
import {
  isModelCached,
  prefetchAdapterManifest,
} from "./modelCacheService";
import type { LocationData } from "../stores/locations";
import { DEFAULT_ONNX_MODEL_ID } from "../types/headstoneTraining";

export async function resolveOnnxModelUrl(
  adapterUrl: string,
): Promise<string> {
  // Hub model id (no protocol)
  if (!adapterUrl.includes("://") && !adapterUrl.startsWith("/")) {
    return adapterUrl;
  }
  const { onnxUrl } = await prefetchAdapterManifest(adapterUrl);
  return onnxUrl;
}

/**
 * Ensure the worker has the location's ONNX loaded (or stock model for eval).
 */
export async function ensureLocalModelForLocation(
  location: Pick<
    LocationData,
    "id" | "aiStatus" | "adapterUrl" | "adapterVersion"
  >,
): Promise<boolean> {
  if (location.aiStatus !== "local" || !location.adapterUrl) {
    return false;
  }

  const modelUrl = await resolveOnnxModelUrl(location.adapterUrl);

  if (localLLMService.isReadyFor(modelUrl)) {
    return true;
  }

  await localLLMService.initialize({
    modelUrl,
    locationId: location.id,
    adapterVersion: location.adapterVersion,
  });

  return localLLMService.isReadyFor(modelUrl);
}

export async function ensureStockModelForEval(): Promise<void> {
  await localLLMService.initialize({ modelUrl: DEFAULT_ONNX_MODEL_ID });
}

export async function locationModelIsCached(
  location: Pick<LocationData, "adapterUrl" | "aiStatus">,
): Promise<boolean> {
  if (location.aiStatus !== "local" || !location.adapterUrl) return false;
  try {
    const modelUrl = await resolveOnnxModelUrl(location.adapterUrl);
    if (localLLMService.isReadyFor(modelUrl)) return true;
    return isModelCached(modelUrl);
  } catch {
    return false;
  }
}
