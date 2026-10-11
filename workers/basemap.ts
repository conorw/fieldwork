import { resolveSourcePmtilesUrl } from "./clip";
import { text, type Env } from "./env";
import { fileCorsHeaders } from "./r2";

const MAX_CACHED_RANGE_BYTES = 4 * 1024 * 1024;

function buildId(upstream: string): string {
  return (
    upstream
      .split("/")
      .pop()
      ?.replace(/\.pmtiles$/i, "")
      .replace(/[^a-z0-9_-]/gi, "") || "source"
  );
}

function parseClosedRange(
  header: string | null,
): { offset: number; length: number } | null {
  const match = header && /^bytes=(\d+)-(\d+)$/i.exec(header.trim());
  if (!match) return null;
  const offset = Number(match[1]);
  const length = Number(match[2]) - offset + 1;
  if (!Number.isSafeInteger(offset) || length <= 0) return null;
  return { offset, length };
}

/**
 * Serves the world base map when the source PMTiles is not in R2 by proxying
 * the upstream build. Byte ranges are written back to R2 so repeat requests
 * (same build, same offsets) never leave Cloudflare.
 */
export async function proxyBasemap(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const upstream = await resolveSourcePmtilesUrl(env);
  if (!upstream) return text("Base map unavailable", 503, fileCorsHeaders());

  const rangeHeader = request.headers.get("range");
  const range = parseClosedRange(rangeHeader);
  const cacheKey =
    range && range.length <= MAX_CACHED_RANGE_BYTES
      ? `basemap-cache/${buildId(upstream)}/${range.offset}-${range.length}`
      : null;

  if (cacheKey && request.method === "GET") {
    const hit = await env.BUCKET.get(cacheKey);
    if (hit) {
      const headers = new Headers(fileCorsHeaders());
      headers.set("content-type", "application/vnd.pmtiles");
      headers.set("content-length", String(hit.size));
      headers.set("cache-control", "public, max-age=86400");
      const meta = hit.customMetadata || {};
      if (meta.contentRange) headers.set("content-range", meta.contentRange);
      if (meta.etag) headers.set("etag", meta.etag);
      return new Response(hit.body, { status: 206, headers });
    }
  }

  const res = await fetch(upstream, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: rangeHeader ? { range: rangeHeader } : {},
  });
  if (!res.ok) {
    return text(`Base map upstream ${res.status}`, 502, fileCorsHeaders());
  }

  const headers = new Headers(fileCorsHeaders());
  for (const name of ["content-length", "content-range", "etag"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("content-type", "application/vnd.pmtiles");
  headers.set("cache-control", "public, max-age=86400");

  if (!cacheKey || request.method !== "GET" || res.status !== 206) {
    return new Response(res.body, { status: res.status, headers });
  }

  const bytes = await res.arrayBuffer();
  ctx.waitUntil(
    env.BUCKET.put(cacheKey, bytes, {
      httpMetadata: { contentType: "application/vnd.pmtiles" },
      customMetadata: {
        contentRange: res.headers.get("content-range") || "",
        etag: res.headers.get("etag") || "",
      },
    }),
  );
  return new Response(bytes, { status: 206, headers });
}
