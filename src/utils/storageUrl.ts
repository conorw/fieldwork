/**
 * Rewrite stored Vercel Blob URLs to Cloudflare Worker /files/ paths
 * so existing DB rows keep working after the storage migration.
 */
const VERCEL_BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/i;

function storageBase(): string {
  const base = import.meta.env.VITE_STORAGE_PUBLIC_BASE as string | undefined;
  return base ? base.replace(/\/$/, "") : "";
}

export function publicFileUrl(key: string): string {
  const clean = key.replace(/^\/+/, "");
  return `${storageBase()}/files/${clean}`;
}

export function rewritePublicStorageUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://placeholder.local");
    if (VERCEL_BLOB_HOST_RE.test(parsed.hostname)) {
      const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      return publicFileUrl(key);
    }
  } catch {
    /* keep original */
  }
  return url;
}
