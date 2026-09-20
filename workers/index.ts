import { handleAnalyzeHeadstone } from "./analyze";
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
      return handleUploadImage(request, env);
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
      return handleGlobalAdapter();
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
      return serveFile(request, env, key);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return json({ error: "Not found", path: pathname }, 404);
  },
} satisfies ExportedHandler<Env>;
