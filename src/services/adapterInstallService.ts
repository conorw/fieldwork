/**
 * Load the shared headstone model on boot, and a per-cemetery merged ONNX
 * when that cemetery has published its own.
 */
import { localLLMService } from "./localLLMService";
import {
  isModelCached,
  prefetchAdapterManifest,
} from "./modelCacheService";
import { refreshGlobalAdapterMeta } from "./globalAdapterService";
import type { LocationData } from "../stores/locations";
import { DEFAULT_ONNX_MODEL_ID } from "../types/headstoneTraining";

const SHARED_MODEL_MISSING =
  "The shared headstone model is not published yet.";

function modelLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : SHARED_MODEL_MISSING;
  if (message === "Failed to fetch") {
    return "The headstone model could not be downloaded. Stay online and try Download model again.";
  }
  return message;
}

/** Transformers.js treats a root path as a Hub id. Same-origin weights need an absolute URL. */
function asRemoteModelUrl(url: string): string {
  if (url.includes("://") || !url.startsWith("/")) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

export async function resolveOnnxModelUrl(
  adapterUrl: string,
): Promise<string> {
  // Hub model id (no protocol)
  if (!adapterUrl.includes("://") && !adapterUrl.startsWith("/")) {
    return adapterUrl;
  }
  const { onnxUrl } = await prefetchAdapterManifest(adapterUrl);
  return asRemoteModelUrl(onnxUrl);
}

let sharedLoad: Promise<boolean> | null = null;

/**
 * Load the published shared headstone model. New cemeteries use this
 * immediately. The general Hub model is not a substitute.
 */
export function ensureSharedLocalModel(): Promise<boolean> {
  if (sharedLoad) return sharedLoad;
  sharedLoad = loadSharedHeadstoneModel().finally(() => {
    sharedLoad = null;
  });
  return sharedLoad;
}

async function loadSharedHeadstoneModel(): Promise<boolean> {
  try {
    const meta = await refreshGlobalAdapterMeta();
    if (!meta?.adapterUrl) {
      const loaded = localLLMService.getLoadedModelUrl();
      if (!loaded || loaded === DEFAULT_ONNX_MODEL_ID) {
        localLLMService.reportUnavailable(SHARED_MODEL_MISSING);
      }
      console.warn("ensureSharedLocalModel:", SHARED_MODEL_MISSING);
      return false;
    }

    const modelUrl = meta.onnxModelId
      ? meta.onnxModelId
      : await resolveOnnxModelUrl(meta.adapterUrl);
    if (localLLMService.isReadyFor(modelUrl, meta.onnxRevision)) return true;

    console.log("Loading shared headstone model", modelUrl);
    await localLLMService.initialize({
      modelUrl,
      adapterVersion: meta.version,
      revision: meta.onnxRevision,
    });
    return localLLMService.isReadyFor(modelUrl);
  } catch (e) {
    console.warn("ensureSharedLocalModel:", e);
    const loaded = localLLMService.getLoadedModelUrl();
    if (!loaded || loaded === DEFAULT_ONNX_MODEL_ID) {
      localLLMService.reportUnavailable(modelLoadError(e));
    }
    return false;
  }
}

/**
 * Ensure the worker has the location's ONNX loaded when this cemetery
 * has a published adapter. Otherwise load the shared headstone model.
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

/** Dev harness only. Cemetery reading does not use this model. */
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
