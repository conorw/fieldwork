import { json, type Env } from "./env";
import { putObject } from "./r2";
import { publicFileUrl } from "./env";
import { runUploadTeacher } from "./lib/teacherPipeline";

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function handleUploadImage(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  const body = (await request.json()) as {
    fileName?: string;
    fileData?: string;
    locationId?: string;
    mimeType?: string;
    teach?: boolean;
  };
  if (!body.fileName || !body.fileData) {
    return json({ error: "Missing fileName or fileData" }, 400);
  }
  const key = body.fileName.replace(/^\/+/, "");
  const binary = Uint8Array.from(atob(body.fileData), (c) => c.charCodeAt(0));
  await putObject(env, key, binary);
  const url = publicFileUrl(request, key);
  const token = bearer(request);
  const teaching = !!(body.teach && body.locationId && token);
  if (teaching && token && body.locationId) {
    const locationId = body.locationId;
    const fileData = body.fileData;
    const mimeType = body.mimeType;
    ctx.waitUntil(
      runUploadTeacher({
        env,
        locationId,
        fileName: key,
        fileData,
        mimeType,
        accessToken: token,
      }).catch((err) => {
        console.error("[teacher]", err);
      }),
    );
  }
  return json({ url, fileName: key, size: binary.byteLength, teaching });
}

export async function handleStoragePut(
  request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  if (request.method !== "PUT" && request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const contentType =
    request.headers.get("content-type") || undefined;
  await putObject(env, key, bytes, contentType);
  const url = publicFileUrl(request, key);
  return json({ url, key, size: bytes.byteLength });
}

export async function handleImportBlob(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  const body = (await request.json()) as {
    pathname?: string;
    sourceUrl?: string;
    contentType?: string;
  };
  if (!body.pathname || !body.sourceUrl) {
    return json({ error: "pathname and sourceUrl are required" }, 400);
  }
  const { importFromUrl } = await import("./r2");
  return importFromUrl(
    request,
    env,
    body.pathname.replace(/^\/+/, ""),
    body.sourceUrl,
    body.contentType,
  );
}
