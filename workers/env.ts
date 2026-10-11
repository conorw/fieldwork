export interface Env {
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  OPENAI_API_KEY?: string;
  HF_TOKEN?: string;
  HF_NAMESPACE?: string;
  HF_JOB_FLAVOR?: string;
  HF_JOB_TIMEOUT_SECONDS?: string;
  HF_TRAIN_DOCKER_IMAGE?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  TRAIN_WEBHOOK_SECRET?: string;
  TRAIN_WEBHOOK_BASE_URL?: string;
  TRAIN_REPO_URL?: string;
  TRAIN_REPO_REF?: string;
  STORAGE_SECRET?: string;
  STORAGE_PUBLIC_BASE?: string;
  STORAGE_UPLOAD_URL?: string;
  BLOB_READ_WRITE_TOKEN?: string;
  SOURCE_PMTILES_KEY?: string;
  SOURCE_PMTILES_URL?: string;
  GLOBAL_ADAPTER_URL?: string;
  VITE_GLOBAL_ADAPTER_URL?: string;
}

/** Copy Worker bindings into process.env for shared Node helpers. */
export function bindProcessEnv(env: Env): void {
  const proc = (globalThis as { process?: { env?: Record<string, string> } })
    .process;
  if (!proc?.env) return;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") proc.env[key] = value;
  }
}

export function publicFileUrl(request: Request, key: string): string {
  const origin = new URL(request.url).origin;
  return `${origin}/files/${key.replace(/^\/+/, "")}`;
}

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

export function text(body: string, status = 200, extra?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...extra,
    },
  });
}

export function authorizeStorage(request: Request, env: Env): boolean {
  const secret = env.STORAGE_SECRET || env.TRAIN_WEBHOOK_SECRET || "";
  if (!secret) return false;
  const header =
    request.headers.get("authorization") ||
    request.headers.get("x-train-webhook-secret") ||
    "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === secret;
}

export function contentTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".pmtiles")) return "application/vnd.pmtiles";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".safetensors")) return "application/octet-stream";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "application/gzip";
  if (lower.endsWith(".jinja")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}
