import {
  assertLocationAdmin,
  buildTrainJobPayload,
  getGlobalAdapterRow,
  getHuggingFaceJobStatus,
  getSupabaseAdmin,
  getSupabaseAuthed,
  startHuggingFaceJob,
  updateLocationAiState,
  upsertGlobalAdapter,
  validateExamples,
} from "./lib/trainHelpers";
import { json, type Env } from "./env";

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function webhookBaseUrl(request: Request, env: Env): string {
  if (env.TRAIN_WEBHOOK_BASE_URL) {
    return env.TRAIN_WEBHOOK_BASE_URL.replace(/\/$/, "");
  }
  return new URL(request.url).origin;
}

export async function handleTrainHeadstone(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (request.method === "GET") {
      return await handleStatus(request);
    }
    if (request.method !== "POST") {
      return json({ error: "Method Not Allowed" }, 405);
    }
    return await handleStart(request, env);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
}

async function handleStart(request: Request, env: Env): Promise<Response> {
  const token = bearer(request);
  if (!token) return json({ error: "Missing Bearer token" }, 401);

  const body = (await request.json()) as {
    locationId?: string;
    examples?: unknown;
    minExamples?: number;
    baseAdapterUrl?: string;
  };
  if (!body.locationId) {
    return json({ error: "locationId is required" }, 400);
  }

  let examples;
  try {
    const minExamples =
      typeof body.minExamples === "number"
        ? body.minExamples
        : body.baseAdapterUrl
          ? 6
          : undefined;
    examples = validateExamples(body.examples as never, minExamples);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Invalid examples" },
      400,
    );
  }

  const userClient = getSupabaseAuthed(token);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Invalid session" }, 401);

  try {
    await assertLocationAdmin(userClient, user.id, body.locationId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden";
    return json({ error: msg }, msg.startsWith("Forbidden") ? 403 : 400);
  }

  const payload = buildTrainJobPayload({
    locationId: body.locationId,
    examples,
    webhookBaseUrl: webhookBaseUrl(request, env),
    baseAdapterUrl: body.baseAdapterUrl,
  });

  const admin = getSupabaseAdmin();
  await updateLocationAiState(admin, body.locationId, {
    ai_status: "training",
    ai_train_error: null,
    ai_train_job_id: null,
    adapter_version: payload.version,
  });

  let jobId: string;
  try {
    ({ jobId } = await startHuggingFaceJob(payload));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateLocationAiState(admin, body.locationId, {
      ai_status: "error",
      ai_train_error: message,
    });
    return json({ error: message }, 502);
  }

  await updateLocationAiState(admin, body.locationId, {
    ai_status: "training",
    ai_train_job_id: jobId,
    adapter_version: payload.version,
  });

  return json(
    {
      jobId,
      version: payload.version,
      exampleCount: examples.length,
      status: "training",
    },
    202,
  );
}

async function handleStatus(request: Request): Promise<Response> {
  const token = bearer(request);
  if (!token) return json({ error: "Missing Bearer token" }, 401);
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return json({ error: "jobId query param is required" }, 400);

  const userClient = getSupabaseAuthed(token);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Invalid session" }, 401);

  const raw = await getHuggingFaceJobStatus(jobId);
  const status = (raw as { status?: { stage?: string; message?: string } })
    ?.status || {};
  return json({
    jobId,
    stage: status.stage,
    message: status.message,
    raw,
  });
}

export async function handleTrainWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  const secret = process.env.TRAIN_WEBHOOK_SECRET;
  if (!secret) {
    return json({ error: "TRAIN_WEBHOOK_SECRET not configured" }, 500);
  }
  const headerSecret =
    request.headers.get("x-train-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!headerSecret || headerSecret !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = (await request.json()) as {
    locationId?: string;
    status?: "success" | "failure";
    adapterUrl?: string;
    adapterVersion?: string;
    exportMode?: string;
    jobId?: string;
    globalAdapterUrl?: string;
    globalAdapterVersion?: string;
    error?: string;
  };
  if (!body.locationId || !body.status) {
    return json({ error: "locationId and status are required" }, 400);
  }

  const admin = getSupabaseAdmin();
  if (body.status === "success") {
    if (!body.adapterUrl || !body.adapterVersion) {
      return json(
        { error: "adapterUrl and adapterVersion required on success" },
        400,
      );
    }
    if (body.exportMode !== "onnx") {
      await updateLocationAiState(admin, body.locationId, {
        ai_status: "error",
        ai_train_error:
          "Offline model export failed (ONNX required). Online reading still works.",
        ai_train_job_id: body.jobId ?? null,
      });
      return json({ ok: true, ai_status: "error" });
    }

    await updateLocationAiState(admin, body.locationId, {
      ai_status: "local",
      adapter_url: body.adapterUrl,
      adapter_version: body.adapterVersion,
      ai_train_error: null,
      ai_train_job_id: body.jobId ?? null,
    });

    let globalPersisted = false;
    if (body.globalAdapterUrl) {
      try {
        await upsertGlobalAdapter(admin, {
          global_adapter_url: body.globalAdapterUrl.replace(/\/?$/, "/"),
          global_adapter_version:
            body.globalAdapterVersion || body.adapterVersion,
          notes: `Updated from location ${body.locationId}`,
        });
        globalPersisted = true;
      } catch (e) {
        console.error("upsertGlobalAdapter failed:", e);
      }
    }
    return json({
      ok: true,
      ai_status: "local",
      globalAdapterUrl: body.globalAdapterUrl ?? null,
      globalAdapterVersion: body.globalAdapterVersion ?? body.adapterVersion,
      globalPersisted,
    });
  }

  await updateLocationAiState(admin, body.locationId, {
    ai_status: "error",
    ai_train_error: body.error || "Training failed",
    ai_train_job_id: body.jobId ?? null,
  });
  return json({ ok: true, ai_status: "error" });
}

async function isPublishedInBucket(env: Env, adapterUrl: string): Promise<boolean> {
  const path = adapterUrl.startsWith("/")
    ? adapterUrl
    : (() => {
        try {
          return new URL(adapterUrl).pathname;
        } catch {
          return "";
        }
      })();
  if (!path.startsWith("/files/")) return true;
  const key = `${path.slice("/files/".length)}manifest.json`;
  return !!(await env.BUCKET.head(key));
}

export async function handleGlobalAdapter(env: Env): Promise<Response> {
  const envUrl =
    process.env.VITE_GLOBAL_ADAPTER_URL ||
    process.env.GLOBAL_ADAPTER_URL ||
    null;
  let row: Awaited<ReturnType<typeof getGlobalAdapterRow>> = null;
  try {
    row = await getGlobalAdapterRow(getSupabaseAdmin());
  } catch (e) {
    console.warn("global-adapter: DB unavailable, using env", e);
  }
  const adapterUrl = (row?.global_adapter_url || envUrl || "").replace(
    /\/?$/,
    "/",
  );
  if (
    !adapterUrl ||
    adapterUrl === "/" ||
    !(await isPublishedInBucket(env, adapterUrl))
  ) {
    return json({
      error: "No global adapter published yet",
      adapterUrl: null,
      version: null,
    });
  }
  return json(
    {
      adapterUrl,
      version: row?.global_adapter_version || "unknown",
      updatedAt: row?.updated_at || new Date().toISOString(),
      source: row?.global_adapter_url ? "database" : "env",
      kind: "global_lora",
      note: "Weights only — no cemetery photos",
    },
    200,
    { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  );
}
