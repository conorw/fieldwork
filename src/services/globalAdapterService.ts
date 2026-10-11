/**
 * Shared global adapter metadata (weights only — no photos).
 * Clients poll /api/global-adapter and Blob latest/ so every cemetery
 * benefits when any cemetery makes the model smarter.
 */
import { prefetchAdapterManifest } from "./modelCacheService";
import { rewritePublicStorageUrl } from "../utils/storageUrl";

const GLOBAL_META_KEY = "fieldwork-global-adapter-meta";
const GLOBAL_UPDATED_EVENT = "fieldwork-global-adapter-updated";

export interface GlobalAdapterMeta {
  adapterUrl: string;
  version: string;
  updatedAt: string;
  onnx?: boolean;
  /** Hub commit so a replaced ONNX file is not served from the browser cache. */
  onnxRevision?: string;
  /** Hub repo id when the manifest points at Hugging Face. */
  onnxModelId?: string;
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

function clearCachedGlobalAdapterMeta(): void {
  try {
    localStorage.removeItem(GLOBAL_META_KEY);
  } catch {
    /* ignore */
  }
}

// Only a pointer whose manifest was fetched counts; the env URL alone may
// point at an empty bucket path and would lower the training gate wrongly.
export async function hasGlobalAdapterCached(): Promise<boolean> {
  return !!getCachedGlobalAdapterMeta()?.adapterUrl;
}

export async function resolveGlobalBaseAdapterUrl(): Promise<string | null> {
  const meta = getCachedGlobalAdapterMeta();
  return meta?.adapterUrl ? meta.adapterUrl.replace(/\/?$/, "/") : null;
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

/**
 * A LAN dev worker keeps its own copy of the manifest. The GPU job publishes
 * the new pointer on the public host. Prefer that pointer when its revision
 * differs so a reload downloads the new model.
 */
export function publishedManifestChoice(
  local: Record<string, unknown> | null,
  remote: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const remoteRevision =
    typeof remote?.onnx_revision === "string" ? remote.onnx_revision : "";
  if (!remote || !remoteRevision) return local;
  if (!local) return remote;
  const localRevision =
    typeof local.onnx_revision === "string" ? local.onnx_revision : "";
  if (remoteRevision === localRevision) return local;
  return { ...local, ...remote };
}

function remotePublishBase(): string {
  const fromEnv = (
    import.meta.env.VITE_STORAGE_PUBLIC_BASE as string | undefined
  )?.replace(/\/$/, "");
  return fromEnv || "https://fieldwork.conorw.workers.dev";
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
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return previous;
  }

  // 1) API pointer (survives CDN / multi-client)
  const api = await fetchJson("/api/global-adapter");
  let candidateUrl: string | null = null;
  let candidateVersion: string | null = null;

  if (api?.adapterUrl) {
    candidateUrl = rewritePublicStorageUrl(String(api.adapterUrl)).replace(
      /\/?$/,
      "/",
    );
    candidateVersion = api.version || null;
  }

  // The API answered and nothing is published: drop any stale pointer.
  if (!candidateUrl && api) {
    if (previous) clearCachedGlobalAdapterMeta();
    return null;
  }

  // 2) API unreachable: env / cached URL + remote manifest
  if (!candidateUrl) {
    candidateUrl =
      getGlobalAdapterUrlFromEnv()?.replace(/\/?$/, "/") ||
      previous?.adapterUrl?.replace(/\/?$/, "/") ||
      null;
  }

  if (!candidateUrl) return previous;

  let manifestRes: Response;
  try {
    manifestRes = await fetch(`${candidateUrl}manifest.json`, {
      cache: "no-cache",
    });
  } catch {
    return previous;
  }
  if (manifestRes.status === 404) {
    if (previous) clearCachedGlobalAdapterMeta();
    return null;
  }
  const localManifest = manifestRes.ok
    ? await manifestRes.json().catch(() => null)
    : null;
  if (!localManifest) return previous;

  let manifest: any = localManifest;
  const remoteBase = remotePublishBase();
  if (
    typeof window !== "undefined" &&
    window.location.origin !== new URL(remoteBase).origin
  ) {
    const remote = await fetchJson(
      `${remoteBase}/files/adapters/global/latest/manifest.json`,
    );
    manifest =
      publishedManifestChoice(
        localManifest as Record<string, unknown>,
        remote as Record<string, unknown> | null,
      ) || localManifest;
  }
  // The file in the bucket is the weights the browser will load. The API
  // version can lag behind a publish, so the manifest wins when it has one.
  const version =
    manifest?.version ||
    manifest?.adapter_version ||
    candidateVersion ||
    previous?.version ||
    "unknown";

  const meta: GlobalAdapterMeta = {
    adapterUrl: candidateUrl,
    version: String(version),
    updatedAt: api?.updatedAt || new Date().toISOString(),
    onnx: !!(
      manifest?.onnx ||
      manifest?.onnx_model_id ||
      String(manifest?.export_mode || "").includes("onnx")
    ),
    onnxRevision: manifest?.onnx_revision
      ? String(manifest.onnx_revision)
      : undefined,
    onnxModelId: manifest?.onnx_model_id
      ? String(manifest.onnx_model_id)
      : undefined,
  };

  const bumped =
    !previous ||
    previous.version !== meta.version ||
    previous.adapterUrl !== meta.adapterUrl ||
    previous.onnxRevision !== meta.onnxRevision;

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
