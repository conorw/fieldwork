import {
  contentTypeForKey,
  json,
  publicFileUrl,
  text,
  type Env,
} from "./env";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, PUT, OPTIONS",
  "access-control-allow-headers": "range, content-type, authorization, x-train-webhook-secret",
  "access-control-expose-headers":
    "etag, content-length, content-range, accept-ranges, content-type",
  "accept-ranges": "bytes",
};

export function fileCorsHeaders(): Record<string, string> {
  return { ...CORS };
}

export function handleFileOptions(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

function parseRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return null;
  let start = hasStart ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = hasEnd ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (end < start) return null;
  return { offset: start, length: end - start + 1 };
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

/** Local dev stores a relative /files path. Missing objects are read from the published bucket. */
export function publishedFileFallbackUrl(
  requestUrl: string,
  storagePublicBase: string | undefined,
  key: string,
): string | null {
  const base = storagePublicBase?.replace(/\/$/, "");
  if (!base || !key || key.includes("..")) return null;
  let remote: URL;
  let here: URL;
  try {
    remote = new URL(base);
    here = new URL(requestUrl);
  } catch {
    return null;
  }
  if (remote.host === here.host) return null;
  if (!isLocalDevHost(here.hostname, here.port)) return null;
  const path = key
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/files/${path}`;
}

export async function proxyPublishedFile(
  request: Request,
  env: Env,
  key: string,
): Promise<Response | null> {
  const upstream = publishedFileFallbackUrl(
    request.url,
    env.STORAGE_PUBLIC_BASE,
    key,
  );
  if (!upstream) return null;
  const range = request.headers.get("range");
  const res = await fetch(upstream, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: range ? { range } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok && res.status !== 206) {
    return text(`Storage upstream ${res.status}`, 502, fileCorsHeaders());
  }
  const headers = new Headers(fileCorsHeaders());
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "accept-ranges",
  ]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", contentTypeForKey(key));
  }
  return new Response(request.method === "HEAD" ? null : res.body, {
    status: res.status,
    headers,
  });
}

export async function serveFile(
  request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  const head = await env.BUCKET.head(key);
  if (!head) {
    return text("Not found", 404, CORS);
  }

  const size = head.size;
  const range = parseRange(request.headers.get("range"), size);
  const contentType =
    head.httpMetadata?.contentType || contentTypeForKey(key);

  if (request.method === "HEAD") {
    const headers = new Headers(CORS);
    headers.set("content-type", contentType);
    headers.set("content-length", String(range ? range.length : size));
    headers.set("etag", head.httpEtag);
    if (range) {
      headers.set(
        "content-range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
      );
    }
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  const object = range
    ? await env.BUCKET.get(key, { range })
    : await env.BUCKET.get(key);

  if (!object) {
    return text("Not found", 404, CORS);
  }

  const headers = new Headers(CORS);
  headers.set("content-type", contentType);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (range) {
    headers.set("content-length", String(range.length));
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(size));
  return new Response(object.body, { status: 200, headers });
}

export async function putObject(
  env: Env,
  key: string,
  data: ReadableStream | ArrayBuffer | Uint8Array | Blob | string,
  contentType?: string,
): Promise<void> {
  await env.BUCKET.put(key, data, {
    httpMetadata: {
      contentType: contentType || contentTypeForKey(key),
    },
  });
}

export async function importFromUrl(
  request: Request,
  env: Env,
  pathname: string,
  sourceUrl: string,
  contentType?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "user-agent": "fieldwork-migrate/1.0",
  };
  if (env.BLOB_READ_WRITE_TOKEN && /vercel-storage\.com/i.test(sourceUrl)) {
    headers.Authorization = `Bearer ${env.BLOB_READ_WRITE_TOKEN}`;
    headers["x-api-version"] = "7";
  }
  const src = await fetch(sourceUrl, { headers });
  if (!src.ok || !src.body) {
    return json(
      { error: `Failed to fetch source (${src.status})` },
      502,
    );
  }
  await putObject(
    env,
    pathname,
    src.body,
    contentType || src.headers.get("content-type") || contentTypeForKey(pathname),
  );
  return json({
    ok: true,
    key: pathname,
    url: publicFileUrl(request, pathname),
    bytes: Number(src.headers.get("content-length") || 0) || undefined,
  });
}
