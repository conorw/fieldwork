// Kick off per-cemetery FastVLM LoRA training via Hugging Face Jobs.
// Does NOT train on Vercel — only validates examples and starts the GPU job.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  assertLocationAdmin,
  buildTrainJobPayload,
  getHuggingFaceJobStatus,
  getSupabaseAdmin,
  getSupabaseAuthed,
  startHuggingFaceJob,
  updateLocationAiState,
  validateExamples,
} from "./lib/trainHelpers";

export const maxDuration = 30;

function getBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function webhookBaseUrl(req: VercelRequest): string {
  if (process.env.TRAIN_WEBHOOK_BASE_URL) {
    return process.env.TRAIN_WEBHOOK_BASE_URL.replace(/\/$/, "");
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      return await handleStatus(req, res);
    }
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    return await handleStart(req, res);
  } catch (err) {
    console.error("train-headstone error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

async function handleStart(req: VercelRequest, res: VercelResponse) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const locationId = body?.locationId as string | undefined;
  if (!locationId) {
    return res.status(400).json({ error: "locationId is required" });
  }

  let examples;
  try {
    examples = validateExamples(body?.examples);
  } catch (e) {
    return res.status(400).json({
      error: e instanceof Error ? e.message : "Invalid examples",
    });
  }

  const userClient = getSupabaseAuthed(token);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    await assertLocationAdmin(userClient, user.id, locationId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden";
    const status = msg.startsWith("Forbidden") ? 403 : 400;
    return res.status(status).json({ error: msg });
  }

  const payload = buildTrainJobPayload({
    locationId,
    examples,
    webhookBaseUrl: webhookBaseUrl(req),
  });

  const admin = getSupabaseAdmin();
  await updateLocationAiState(admin, locationId, {
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
    await updateLocationAiState(admin, locationId, {
      ai_status: "error",
      ai_train_error: message,
    });
    return res.status(502).json({ error: message });
  }

  await updateLocationAiState(admin, locationId, {
    ai_status: "training",
    ai_train_job_id: jobId,
    adapter_version: payload.version,
  });

  return res.status(202).json({
    jobId,
    version: payload.version,
    exampleCount: examples.length,
    status: "training",
  });
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const jobId = req.query.jobId;
  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({ error: "jobId query param is required" });
  }

  const userClient = getSupabaseAuthed(token);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const raw = await getHuggingFaceJobStatus(jobId);
  const status = (raw as any)?.status || {};
  return res.status(200).json({
    jobId,
    stage: status.stage,
    message: status.message,
    raw,
  });
}
