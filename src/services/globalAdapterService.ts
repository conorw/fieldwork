/**
 * Shared global adapter metadata (weights only — no photos).
 * Clients poll /api/global-adapter and Blob latest/ so every cemetery
 * benefits when any cemetery makes the model smarter.
 */
import { prefetchAdapterManifest } from "./modelCacheService";

const GLOBAL_META_KEY = "fieldwork-global-adapter-meta";
const GLOBAL_UPDATED_EVENT = "fieldwork-global-adapter-updated";

export interface GlobalAdapterMeta {
  adapterUrl: string;
  version: string;
  updatedAt: string;
  onnx?: boolean;
}

export type GlobalAdapterListener = (
  meta: GlobalAdapterMeta,
  previous: GlobalAdapterMeta | null,
) => void;

const listeners = new Set<GlobalAdapterListener>();

/** Env / build-time override (e.g. Blob adapters/global/latest/) */
export function getGlobalAdapterUrlFromEnv(): string | null {
  const url = import.meta.env.VITE_GLOBAL_ADAPTER_URL as string | undefined;
  return url && url.length > 0 ? url : null;
}

export function getCachedGlobalAdapterMeta(): GlobalAdapterMeta | null {
  try {
    const raw = localStorage.getItem(GLOBAL_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlobalAdapterMeta;
  } catch {
    return null;
  }
}

export function setCachedGlobalAdapterMeta(meta: GlobalAdapterMeta): void {
  try {
    localStorage.setItem(GLOBAL_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota */
  }
}

export async function hasGlobalAdapterCached(): Promise<boolean> {
  if (getGlobalAdapterUrlFromEnv()) return true;
  const meta = getCachedGlobalAdapterMeta();
  return !!meta?.adapterUrl;
}

export async function resolveGlobalBaseAdapterUrl(): Promise<string | null> {
  const meta = getCachedGlobalAdapterMeta();
  if (meta?.adapterUrl) return meta.adapterUrl.replace(/\/?$/, "/");
  const fromEnv = getGlobalAdapterUrlFromEnv();
  if (fromEnv) return fromEnv.replace(/\/?$/, "/");
  return null;
}

export function onGlobalAdapterUpdated(fn: GlobalAdapterListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitUpdated(meta: GlobalAdapterMeta, previous: GlobalAdapterMeta | null) {
  for (const fn of listeners) {
    try {
      fn(meta, previous);
    } catch (e) {
      console.warn("global adapter listener error", e);
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent(GLOBAL_UPDATED_EVENT, { detail: { meta, previous } }),
    );
  } catch {
    /* SSR / tests */
  }
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Resolve the newest shared adapter pointer from:
 * 1) GET /api/global-adapter (DB)
 * 2) VITE_GLOBAL_ADAPTER_URL / Blob latest manifest
 * Prefetches weights into Cache Storage when the version changes.
 */
export async function refreshGlobalAdapterMeta(): Promise<GlobalAdapterMeta | null> {
  const previous = getCachedGlobalAdapterMeta();

  // 1) API pointer (survives CDN / multi-client)
  const api = await fetchJson("/api/global-adapter");
  let candidateUrl: string | null = null;
  let candidateVersion: string | null = null;

  if (api?.adapterUrl) {
    candidateUrl = String(api.adapterUrl).replace(/\/?$/, "/");
    candidateVersion = api.version || null;
  }

  // 2) Env / cached URL + remote manifest
  if (!candidateUrl) {
    candidateUrl =
      getGlobalAdapterUrlFromEnv()?.replace(/\/?$/, "/") ||
      previous?.adapterUrl?.replace(/\/?$/, "/") ||
      null;
  }

  if (!candidateUrl) return previous;

  const manifest = await fetchJson(`${candidateUrl}manifest.json`);
  const version =
    candidateVersion ||
    manifest?.version ||
    manifest?.adapter_version ||
    previous?.version ||
    "unknown";

  const meta: GlobalAdapterMeta = {
    adapterUrl: candidateUrl,
    version: String(version),
    updatedAt: api?.updatedAt || new Date().toISOString(),
    onnx: !!(manifest?.onnx || manifest?.export_mode?.includes("onnx")),
  };

  const bumped =
    !previous ||
    previous.version !== meta.version ||
    previous.adapterUrl !== meta.adapterUrl;

  setCachedGlobalAdapterMeta(meta);

  if (bumped) {
    // Warm browser cache for LoRA / optional ONNX so offline train + cold start are fast
    try {
      await prefetchAdapterManifest(meta.adapterUrl);
    } catch (e) {
      console.warn("Global adapter prefetch:", e);
    }
    emitUpdated(meta, previous);
  }

  return meta;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Poll for smarter shared weights (default every 5 minutes + on visibility). */
export function startGlobalAdapterPolling(intervalMs = 5 * 60 * 1000): () => void {
  void refreshGlobalAdapterMeta();

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    void refreshGlobalAdapterMeta();
  }, intervalMs);

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void refreshGlobalAdapterMeta();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);

  return () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onVisible);
  };
}
