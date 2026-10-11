import { text } from "./env";

const HUB_PREFIX = "/api/hf/";
const WASM_PREFIX = "/api/onnx-runtime/";

/**
 * Public Hub files this app is allowed to mirror.
 * The browser loads them from this origin so a service worker never has to
 * follow Hugging Face's relative redirects.
 */
export function hubUpstreamUrl(pathname: string): string | null {
  if (!pathname.startsWith(HUB_PREFIX)) return null;
  let rest = pathname.slice(HUB_PREFIX.length);
  try {
    rest = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (rest.includes("..") || rest.includes("\\") || rest.includes("//")) return null;
  const match =
    /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/resolve\/([A-Za-z0-9._-]+)\/(.+)$/.exec(
      rest,
    );
  if (!match) return null;
  const [, owner, name, revision, file] = match;
  if (!file || file.endsWith("/")) return null;
  const allowed =
    owner === "conorwoods" ||
    (owner === "onnx-community" && name === "FastVLM-0.5B-ONNX");
  if (!allowed) return null;
  return `https://huggingface.co/${owner}/${name}/resolve/${revision}/${file}`;
}

/** ONNX runtime files published with the transformers package. */
export function onnxRuntimeUpstream(pathname: string): string | null {
  if (!pathname.startsWith(WASM_PREFIX)) return null;
  const rest = pathname.slice(WASM_PREFIX.length);
  const match = /^(\d+\.\d+\.\d+)\/([A-Za-z0-9._-]+\.(?:wasm|mjs|js))$/.exec(rest);
  if (!match) return null;
  const [, version, file] = match;
  return `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${version}/dist/${file}`;
}

async function proxy(request: Request, upstream: string | null): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return text("Method not allowed", 405);
  }
  if (!upstream) return text("Not found", 404);
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers,
      redirect: "follow",
    });
  } catch {
    return text("Model host unavailable", 502);
  }
  const out = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "accept-ranges",
  ]) {
    const value = upstreamResponse.headers.get(name);
    if (value) out.set(name, value);
  }
  if (!out.has("content-type")) out.set("content-type", "application/octet-stream");
  out.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(request.method === "HEAD" ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: out,
  });
}

export function proxyHubFile(request: Request): Promise<Response> {
  return proxy(request, hubUpstreamUrl(new URL(request.url).pathname));
}

export function proxyOnnxRuntime(request: Request): Promise<Response> {
  return proxy(request, onnxRuntimeUpstream(new URL(request.url).pathname));
}
