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
