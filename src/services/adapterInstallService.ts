/**
 * Load the shared FastVLM on boot, and a per-cemetery merged ONNX when available.
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
 * Ensure the shared Hub FastVLM is loaded so new cemeteries can read
 * on-device without a teaching onboarding step.
 */
export async function ensureSharedLocalModel(): Promise<boolean> {
  if (localLLMService.isReady()) return true;
  try {
    await localLLMService.initialize({ modelUrl: DEFAULT_ONNX_MODEL_ID });
    return localLLMService.isReady();
  } catch (e) {
    console.warn("ensureSharedLocalModel:", e);
    return false;
  }
}

/**
 * Ensure the worker has the location's ONNX loaded when this cemetery
 * has a published adapter. Falls back to the shared stock model.
 */
export async function ensureLocalModelForLocation(
  location: Pick<
    LocationData,
    "id" | "aiStatus" | "adapterUrl" | "adapterVersion"
  >,
): Promise<boolean> {
  if (location.aiStatus === "local" && location.adapterUrl) {
    try {
      const modelUrl = await resolveOnnxModelUrl(location.adapterUrl);

      if (localLLMService.isReadyFor(modelUrl)) {
        return true;
      }

      await localLLMService.initialize({
        modelUrl,
        locationId: location.id,
        adapterVersion: location.adapterVersion,
      });

      if (localLLMService.isReadyFor(modelUrl)) {
        return true;
      }
    } catch (e) {
      console.warn("Cemetery adapter not usable; using shared model:", e);
    }
  }

  return ensureSharedLocalModel();
}

export async function ensureStockModelForEval(): Promise<void> {
  await ensureSharedLocalModel();
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
