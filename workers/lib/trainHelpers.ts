/**
 * Shared helpers for train-headstone API routes.
 * Vercel Node handlers call these; keep free of Vue/Pinia.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  TrainJobPayload,
  TrainingExamplePayload,
} from "../../src/types/headstoneTraining";
import {
  MIN_TRAINING_EXAMPLES,
  MIN_TRAINING_EXAMPLES_WITH_GLOBAL,
} from "../../src/types/headstoneTraining";

export { MIN_TRAINING_EXAMPLES, MIN_TRAINING_EXAMPLES_WITH_GLOBAL };

export function getSupabaseAdmin(): SupabaseClient {
  const url =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for train APIs",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAuthed(accessToken: string): SupabaseClient {
  const url =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anon =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !anon) {
    throw new Error("SUPABASE_URL and anon key are required");
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function assertLocationAdmin(
  supabase: SupabaseClient,
  userId: string,
  locationId: string,
): Promise<void> {
  const { data: location, error } = await supabase
    .from("locations")
    .select("id, owner_id")
    .eq("id", locationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load location: ${error.message}`);
  if (!location) throw new Error("Location not found");
  if (location.owner_id === userId) return;

  const { data: membership, error: memErr } = await supabase
    .from("location_members")
    .select("role")
    .eq("location_id", locationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) throw new Error(`Failed to check membership: ${memErr.message}`);
  if (membership && ["owner", "admin"].includes(membership.role)) return;

  throw new Error("Forbidden: owner or admin role required");
}

export function validateExamples(
  examples: TrainingExamplePayload[] | undefined,
  minExamples: number = MIN_TRAINING_EXAMPLES,
): TrainingExamplePayload[] {
  if (!examples || !Array.isArray(examples)) {
    throw new Error("examples array is required");
  }
  if (examples.length < minExamples) {
    throw new Error(
      `Need at least ${minExamples} reviewed examples (got ${examples.length})`,
    );
  }
  for (const ex of examples) {
    if (!ex.imageUrl || !ex.target) {
      throw new Error("Each example needs imageUrl and target");
    }
  }
  return examples;
}

export function buildTrainJobPayload(input: {
  locationId: string;
  examples: TrainingExamplePayload[];
  webhookBaseUrl: string;
  baseAdapterUrl?: string;
}): TrainJobPayload {
  const version = new Date().toISOString();
  return {
    locationId: input.locationId,
    version,
    examples: input.examples,
    webhookUrl: `${input.webhookBaseUrl.replace(/\/$/, "")}/api/train-headstone-webhook`,
    baseAdapterUrl: input.baseAdapterUrl,
  };
}

export interface BrowserTrainJobOptions {
  overlayBaseUrl: string;
  overlayFiles: string;
  minExamples: number;
  onnxVersion: string;
  onnxRepoId: string;
  globalAdapterPublicUrl: string;
}

/**
 * Train, then publish the browser ONNX from the new LoRA without
 * replacing adapters/global/latest/manifest.json until the publish finishes.
 */
export function browserTrainCommand(): string {
  return `set -e
git clone --depth 1 --branch "$TRAIN_REPO_REF" "$TRAIN_REPO_URL" /tmp/fieldwork || git clone --depth 1 "$TRAIN_REPO_URL" /tmp/fieldwork
cd /tmp/fieldwork
mkdir -p /tmp/fw
python3 << 'PY'
import os, urllib.request
from pathlib import Path
base = os.environ["OVERLAY_BASE_URL"].rstrip("/") + "/"
root = Path("/tmp/fieldwork")
for rel in os.environ["OVERLAY_FILES"].split(","):
    rel = rel.strip()
    if not rel:
        continue
    dest = root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(base + rel, headers={"User-Agent": "fieldwork-train/1.0"})
    dest.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    print("[overlay]", rel, dest.stat().st_size)
PY
pip install -q -r training/requirements.txt
export BROWSER_ONNX_AFTER=1
export TRAIN_REQUIRE_ONNX=0
python3 -m training.run_job --min-examples "$MIN_EXAMPLES"
cp scripts/export_browser_onnx.py /tmp/fw/export_browser_onnx.py
cp scripts/finish_onnx_webhook.py /tmp/fw/finish_onnx_webhook.py
export ADAPTER_BASE_URL="$(python3 -c 'print(open("/tmp/fw/adapter_base_url.txt", encoding="utf-8").read().strip())')"
(python3 -m pip uninstall -y onnxruntime-gpu || true)
python3 -m pip install -q 'peft==0.21.2' 'transformers==4.48.3' optimum onnx 'onnxruntime==1.21.0' onnxscript safetensors huggingface_hub timm onnx-graphsurgeon tqdm 'onnxconverter-common>=1.14.0'
python3 /tmp/fw/export_browser_onnx.py || { python3 /tmp/fw/finish_onnx_webhook.py fail; exit 1; }
python3 /tmp/fw/finish_onnx_webhook.py
`;
}

/**
 * Start a Hugging Face Job that runs training/run_job.py
 * Docs: POST https://huggingface.co/api/jobs/{namespace}
 */
export async function startHuggingFaceJob(
  payload: TrainJobPayload,
  browser?: BrowserTrainJobOptions,
): Promise<{
  jobId: string;
}> {
  const token = process.env.HF_TOKEN;
  const namespace = process.env.HF_NAMESPACE;
  if (!token) throw new Error("HF_TOKEN is not set");
  if (!namespace) throw new Error("HF_NAMESPACE is not set");

  const flavor = process.env.HF_JOB_FLAVOR || "l4x1";
  const dockerImage =
    process.env.HF_TRAIN_DOCKER_IMAGE ||
    "huggingface/transformers-pytorch-gpu:latest";
  const timeoutSeconds = browser
    ? 7200
    : Number(process.env.HF_JOB_TIMEOUT_SECONDS || 3600);
  const repoUrl =
    process.env.TRAIN_REPO_URL || "https://github.com/conorw/fieldwork.git";
  const repoRef = process.env.TRAIN_REPO_REF || "feature/cemetery-train-orchestrator";

  // Clone the repo (training/ package), install deps, run the job.
  // Payload is JSON in TRAIN_PAYLOAD_JSON (image URLs + labels only).
  const bootstrap = browser
    ? browserTrainCommand()
    : [
        "set -e",
        "git clone --depth 1 --branch \"$TRAIN_REPO_REF\" \"$TRAIN_REPO_URL\" /tmp/fieldwork || git clone --depth 1 \"$TRAIN_REPO_URL\" /tmp/fieldwork",
        "cd /tmp/fieldwork",
        "pip install -q -r training/requirements.txt",
        "python3 -m training.run_job",
      ].join(" && ");

  const jobBody = {
    dockerImage,
    command: ["bash", "-c", bootstrap],
    flavor,
    timeoutSeconds,
    environment: {
      TRAIN_PAYLOAD_JSON: JSON.stringify(payload),
      TRAIN_REPO_URL: repoUrl,
      TRAIN_REPO_REF: repoRef,
      HF_HOME: "/tmp/hf",
      STORAGE_UPLOAD_URL: process.env.STORAGE_UPLOAD_URL || "",
      STORAGE_PUBLIC_BASE: process.env.STORAGE_PUBLIC_BASE || "",
      ...(browser
        ? {
            OVERLAY_BASE_URL: browser.overlayBaseUrl,
            OVERLAY_FILES: browser.overlayFiles,
            MIN_EXAMPLES: String(browser.minExamples),
            BROWSER_ONNX_AFTER: "1",
            TRAIN_REQUIRE_ONNX: "0",
            ONNX_VERSION: browser.onnxVersion,
            ONNX_REPO_ID: browser.onnxRepoId,
            GLOBAL_ADAPTER_PUBLIC_URL: browser.globalAdapterPublicUrl,
            TRAIN_WEBHOOK_URL: payload.webhookUrl,
            TEACHER_LOCATION_ID: payload.locationId,
          }
        : {}),
    },
    secrets: {
      STORAGE_SECRET:
        process.env.STORAGE_SECRET || process.env.TRAIN_WEBHOOK_SECRET || "",
      TRAIN_WEBHOOK_SECRET: process.env.TRAIN_WEBHOOK_SECRET || "",
      HF_TOKEN: token,
    },
    labels: {
      name: `fieldwork-train-${payload.locationId.slice(0, 8)}`,
      locationId: payload.locationId
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 100),
    },
  };

  const res = await fetch(`https://huggingface.co/api/jobs/${namespace}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jobBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF Jobs create failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id?: string; job?: { id?: string } };
  const jobId = data.id || data.job?.id;
  if (!jobId) {
    throw new Error(`HF Jobs response missing id: ${JSON.stringify(data)}`);
  }
  return { jobId };
}

export async function getHuggingFaceJobStatus(jobId: string): Promise<unknown> {
  const token = process.env.HF_TOKEN;
  const namespace = process.env.HF_NAMESPACE;
  if (!token || !namespace) {
    throw new Error("HF_TOKEN and HF_NAMESPACE are required");
  }

  const res = await fetch(
    `https://huggingface.co/api/jobs/${namespace}/${jobId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF Jobs status failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function updateLocationAiState(
  admin: SupabaseClient,
  locationId: string,
  fields: {
    ai_status: "teacher" | "training" | "local" | "error";
    adapter_url?: string | null;
    adapter_version?: string | null;
    ai_train_error?: string | null;
    ai_train_job_id?: string | null;
  },
): Promise<void> {
  const { error } = await admin
    .from("locations")
    .update({
      ...fields,
      date_modified: new Date().toISOString(),
    })
    .eq("id", locationId);

  if (error) {
    throw new Error(`Failed to update location AI state: ${error.message}`);
  }
}

/** Persist shared global adapter pointer (weights only — no photos). */
export async function upsertGlobalAdapter(
  admin: SupabaseClient,
  fields: {
    global_adapter_url: string;
    global_adapter_version: string;
    notes?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("ai_global_models").upsert(
    {
      id: "default",
      global_adapter_url: fields.global_adapter_url,
      global_adapter_version: fields.global_adapter_version,
      updated_at: now,
      notes:
        fields.notes ||
        "Shared VLM weights updated from cemetery training (no photos).",
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Failed to upsert global adapter: ${error.message}`);
  }
}

export async function getGlobalAdapterRow(
  admin: SupabaseClient,
): Promise<{
  global_adapter_url: string | null;
  global_adapter_version: string | null;
  updated_at: string | null;
} | null> {
  const { data, error } = await admin
    .from("ai_global_models")
    .select("global_adapter_url, global_adapter_version, updated_at")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    console.warn("getGlobalAdapterRow:", error.message);
    return null;
  }
  return data;
}
