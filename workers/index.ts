import { handleAnalyzeHeadstone } from "./analyze";
import { proxyBasemap } from "./basemap";
import { handleClip } from "./clip";
import { bindProcessEnv, json, text, authorizeStorage, type Env } from "./env";
import { handleFileOptions, serveFile } from "./r2";
import {
  handleImportBlob,
  handleStoragePut,
  handleUploadImage,
} from "./storage";
import {
  handleGlobalAdapter,
  handleTrainHeadstone,
  handleTrainWebhook,
} from "./train";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    bindProcessEnv(env);
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return handleFileOptions();
    }

    if (pathname === "/api/clip") {
      return handleClip(request, env);
    }
    if (pathname === "/api/upload-image") {
      return handleUploadImage(request, env, ctx);
    }
    if (pathname === "/api/analyze-headstone") {
      return handleAnalyzeHeadstone(request);
    }
    if (pathname === "/api/train-headstone") {
      return handleTrainHeadstone(request, env);
    }
    if (pathname === "/api/train-headstone-webhook") {
      return handleTrainWebhook(request);
    }
    if (pathname === "/api/global-adapter") {
      return handleGlobalAdapter(env);
    }
    if (pathname === "/api/admin/import-blob") {
      if (!authorizeStorage(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }
      return handleImportBlob(request, env);
    }
    if (pathname.startsWith("/api/storage/")) {
      if (!authorizeStorage(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }
      const key = decodeURIComponent(pathname.slice("/api/storage/".length));
      if (!key || key.includes("..")) {
        return json({ error: "Invalid key" }, 400);
      }
      return handleStoragePut(request, env, key);
    }
    if (pathname.startsWith("/files/")) {
      const key = decodeURIComponent(pathname.slice("/files/".length));
      if (!key || key.includes("..")) {
        return text("Not found", 404);
      }
      const response = await serveFile(request, env, key);
      const sourceKey = env.SOURCE_PMTILES_KEY || "pmtiles/OUTPUT.pmtiles";
      if (response.status === 404 && key === sourceKey) {
        return proxyBasemap(request, env, ctx);
      }
      return response;
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return json({ error: "Not found", path: pathname }, 404);
  },
} satisfies ExportedHandler<Env>;
