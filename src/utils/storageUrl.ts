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

function isLocalDevHost(hostname: string, port: string): boolean {
  if (port === "8787") return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const octets = host.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets[0] === 172 &&
    octets[1] >= 16 &&
    octets[1] <= 31 &&
    octets.every((part) => part >= 0 && part <= 255)
  );
}

export function rewritePublicStorageUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const pageOrigin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://placeholder.local";
    const parsed = new URL(url, pageOrigin);
    if (VERCEL_BLOB_HOST_RE.test(parsed.hostname)) {
      const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      return publicFileUrl(key);
    }
    // Local wrangler and LAN dev URLs are served through the current host so
    // Vite can proxy /files. A production workers.dev URL stays absolute:
    // the local bucket does not have that object, and rewriting it 404s.
    if (parsed.pathname.startsWith("/files/")) {
      const pageHost =
        typeof window !== "undefined" ? window.location.host : "";
      const onThisPage = pageHost !== "" && parsed.host === pageHost;
      if (onThisPage || isLocalDevHost(parsed.hostname, parsed.port)) {
        return parsed.pathname + parsed.search;
      }
      return parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}
