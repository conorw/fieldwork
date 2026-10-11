/**
 * After a headstone photo is stored, label it with ChatGPT and, once the
 * cemetery has enough photos, train and publish the on-device model.
 * The upload response does not wait for this.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { analyzeHeadstoneWithOpenAI } from "./analyzeHeadstone";
import {
  countsByStoneType,
  countExamplesSince,
  decideTeacherTrain,
  isHumanLabel,
  mimeFromFileName,
  preferTrainingExamples,
  publishWatermark,
  teacherExampleFromAnalysis,
  type StoredTrainingRow,
} from "./teacherDecision";
import {
  assertLocationAdmin,
  buildTrainJobPayload,
  getSupabaseAdmin,
  getSupabaseAuthed,
  startHuggingFaceJob,
  updateLocationAiState,
  validateExamples,
} from "./trainHelpers";
import { trainingOverlayFiles } from "./trainingBundle";
import type { TrainingExamplePayload } from "../../src/types/headstoneTraining";

export interface UploadTeacherInput {
  env: Env;
  locationId: string;
  fileName: string;
  fileData: string;
  mimeType?: string;
  accessToken: string;
}

function publicBase(env: Env): string {
  return (
    env.STORAGE_PUBLIC_BASE || "https://fieldwork.conorw.workers.dev"
  ).replace(/\/$/, "");
}

async function putPublicObject(
  env: Env,
  key: string,
  body: BodyInit,
  contentType: string,
): Promise<void> {
  const upload = (env.STORAGE_UPLOAD_URL || "").replace(/\/$/, "");
  const secret = env.STORAGE_SECRET || env.TRAIN_WEBHOOK_SECRET || "";
  if (!upload || !secret) {
    throw new Error(
      "STORAGE_UPLOAD_URL and STORAGE_SECRET are required to publish a model",
    );
  }
  const res = await fetch(`${upload}/${key}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": contentType,
      "User-Agent": "fieldwork-train/1.0",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ${key} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

function decodeBase64(fileData: string): Uint8Array {
  const binary = atob(fileData);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function runUploadTeacher(input: UploadTeacherInput): Promise<void> {
  const mime = mimeFromFileName(input.fileName, input.mimeType);
  if (!mime) {
    console.log("[teacher] skip unsupported image", input.fileName);
    return;
  }

  const userClient = getSupabaseAuthed(input.accessToken);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    console.warn("[teacher] skip: invalid session");
    return;
  }
  try {
    await assertLocationAdmin(userClient, user.id, input.locationId);
  } catch (err) {
    console.warn(
      "[teacher] skip:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  const key = input.fileName.replace(/^\/+/, "");
  await putPublicObject(input.env, key, decodeBase64(input.fileData), mime);
  const imageUrl = `${publicBase(input.env)}/files/${key}`;

  const analysis = await analyzeHeadstoneWithOpenAI(input.fileData, mime);
  const example = teacherExampleFromAnalysis(analysis, imageUrl);
  if (!example) {
    console.log("[teacher] no usable inscription", imageUrl);
    return;
  }

  const admin = getSupabaseAdmin();
  const saved = await saveTeacherLabel(admin, {
    locationId: input.locationId,
    reviewedBy: user.id,
    example,
  });
  if (!saved) {
    console.log("[teacher] kept a human label for", imageUrl);
    return;
  }
  console.log("[teacher] labeled", imageUrl);
  await maybeStartTeacherJob(input.env, admin, input.locationId);
}

async function saveTeacherLabel(
  admin: SupabaseClient,
  input: {
    locationId: string;
    reviewedBy: string;
    example: TrainingExamplePayload;
  },
): Promise<boolean> {
  const { data, error } = await admin
    .from("headstone_training_examples")
    .select(
      "id, image_url, stone_type, target_json, was_corrected, review_source, reviewed_at",
    )
    .eq("location_id", input.locationId)
    .eq("image_url", input.example.imageUrl);
  if (error) throw new Error(error.message);
  const rows = (data || []) as StoredTrainingRow[];
  if (rows.some(isHumanLabel)) return false;

  const now = new Date().toISOString();
  const targetJson = JSON.stringify({
    ...input.example.target,
    review: { was_corrected: false, source: "teacher" },
  });
  const existing = rows[0];
  if (existing) {
    const { error: updateError } = await admin
      .from("headstone_training_examples")
      .update({
        stone_type: input.example.stoneType,
        target_json: targetJson,
        reviewed_at: now,
        review_source: "teacher",
        was_corrected: false,
      })
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
    return true;
  }

  const { error: insertError } = await admin
    .from("headstone_training_examples")
    .insert({
      id: crypto.randomUUID(),
      location_id: input.locationId,
      plot_id: null,
      plot_image_id: null,
      image_url: input.example.imageUrl,
      stone_type: input.example.stoneType,
      target_json: targetJson,
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
      date_created: now,
      was_corrected: false,
      review_source: "teacher",
    });
  if (insertError) throw new Error(insertError.message);
  return true;
}

async function maybeStartTeacherJob(
  env: Env,
  admin: SupabaseClient,
  locationId: string,
): Promise<void> {
  const { data: location, error: locationError } = await admin
    .from("locations")
    .select("ai_status, adapter_version")
    .eq("id", locationId)
    .maybeSingle();
  if (locationError) throw new Error(locationError.message);

  const { data, error } = await admin
    .from("headstone_training_examples")
    .select(
      "id, image_url, stone_type, target_json, plot_id, plot_image_id, was_corrected, review_source, reviewed_at",
    )
    .eq("location_id", locationId);
  if (error) throw new Error(error.message);
  const stored = (data || []) as StoredTrainingRow[];
  const examples = preferTrainingExamples(stored);
  const watermark = publishWatermark(location?.adapter_version);
  const hasGlobal = !!(await env.BUCKET.head("adapters/global/latest/manifest.json"));
  const decision = decideTeacherTrain({
    aiStatus: location?.ai_status,
    total: examples.length,
    byStoneType: countsByStoneType(examples),
    hasGlobalAdapter: hasGlobal,
    examplesSincePublish: countExamplesSince(stored, watermark),
    watermark,
  });
  console.log(
    "[teacher]",
    locationId,
    decision.reason,
    `${examples.length} examples`,
  );
  if (!decision.start) return;

  await updateLocationAiState(admin, locationId, {
    ai_status: "training",
    ai_train_error: null,
    ai_train_job_id: null,
  });

  try {
    const files = trainingOverlayFiles();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const prefix = `training-data/job-overlay/${stamp}`;
    for (const [rel, body] of Object.entries(files)) {
      const contentType = rel.endsWith(".py")
        ? "text/x-python"
        : "text/plain; charset=utf-8";
      await putPublicObject(env, `${prefix}/${rel}`, body, contentType);
    }

    const base = publicBase(env);
    const payload = buildTrainJobPayload({
      locationId,
      examples: validateExamples(examples, decision.minExamples),
      webhookBaseUrl: base,
      baseAdapterUrl: `${base}/files/adapters/global/latest/`,
    });
    const { jobId } = await startHuggingFaceJob(payload, {
      overlayBaseUrl: `${base}/files/${prefix}/`,
      overlayFiles: Object.keys(files).join(","),
      minExamples: decision.minExamples,
      onnxVersion: `onnx-${stamp}`,
      onnxRepoId: `${env.HF_NAMESPACE || "conorwoods"}/fieldwork-fastvlm-0.5b-onnx`,
      globalAdapterPublicUrl: `${base}/files/adapters/global/latest/`,
    });
    await updateLocationAiState(admin, locationId, {
      ai_status: "training",
      ai_train_job_id: jobId,
      adapter_version: payload.version,
      ai_train_error: null,
    });
    console.log("[teacher] publish job", jobId, payload.version);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateLocationAiState(admin, locationId, {
      ai_status: "error",
      ai_train_error: message,
    });
    console.error("[teacher] publish failed:", message);
  }
}
