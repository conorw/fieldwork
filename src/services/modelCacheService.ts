/**
 * Cache merged ONNX (or Hub model metadata) in Cache Storage for offline reload.
 * Transformers.js also caches Hub files; this tracks location adapter readiness.
 */

const CACHE_NAME = "fieldwork-vlm-models-v1";
const META_KEY = "fieldwork-vlm-model-meta";

export interface CachedModelMeta {
  modelUrl: string;
  locationId?: string;
  adapterVersion?: string;
  cachedAt: string;
  kind: "hub" | "adapter";
}

function metaStorageKey(modelUrl: string): string {
  return `${META_KEY}:${encodeURIComponent(modelUrl)}`;
}

export async function isModelCached(modelUrl: string): Promise<boolean> {
  if (typeof caches === "undefined") {
    // Fall back to localStorage marker (transformers.js may still have Hub cache)
    try {
      return !!localStorage.getItem(metaStorageKey(modelUrl));
    } catch {
      return false;
    }
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(modelUrl);
    if (match) return true;
    // Also check localStorage marker set after successful worker load
    return !!localStorage.getItem(metaStorageKey(modelUrl));
  } catch {
    return !!localStorage.getItem(metaStorageKey(modelUrl));
  }
}

export async function markModelReady(meta: CachedModelMeta): Promise<void> {
  try {
    localStorage.setItem(metaStorageKey(meta.modelUrl), JSON.stringify(meta));
  } catch {
    /* ignore quota */
  }
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    // Store a small JSON response as a marker (actual weights cached by transformers.js)
    const body = JSON.stringify(meta);
    await cache.put(
      meta.modelUrl,
      new Response(body, {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function getCachedModelMeta(modelUrl: string): CachedModelMeta | null {
  try {
    const raw = localStorage.getItem(metaStorageKey(modelUrl));
    if (!raw) return null;
    return JSON.parse(raw) as CachedModelMeta;
  } catch {
    return null;
  }
}

/**
 * Prefetch adapter directory files listed in manifest (best-effort).
 * modelUrl should be the Blob prefix ending with / or a Hub model id.
 */
export async function prefetchAdapterManifest(
  adapterBaseUrl: string,
  onProgress?: (pct: number) => void,
): Promise<{ onnxUrl: string; manifest: any }> {
  const base = adapterBaseUrl.replace(/\/?$/, "/");
  const manifestUrl = `${base}manifest.json`;
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    throw new Error(`Could not load model manifest (${res.status})`);
  }
  const manifest = await res.json();
  const onnxUrl = onnxLocationFromManifest(base, manifest);
  if (!onnxUrl) {
    throw new Error(
      "This model is published, but the on-device file is missing.",
    );
  }
  onProgress?.(100);
  return { onnxUrl, manifest };
}

/** Hub id or same-origin onnx/ directory. Empty when the manifest has no ONNX. */
export function onnxLocationFromManifest(
  adapterBaseUrl: string,
  manifest: { export_mode?: string; onnx_model_id?: string },
): string | null {
  const mode = String(manifest?.export_mode || "");
  const hubId = manifest?.onnx_model_id?.trim();
  if (hubId && (mode.includes("onnx") || !mode)) return hubId;
  if (mode && !mode.includes("onnx")) return null;
  const base = adapterBaseUrl.replace(/\/?$/, "/");
  return `${base}onnx/`;
}
