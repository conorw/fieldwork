/**
 * Shared helpers for train-headstone API routes.
 * Vercel Node handlers call these; keep free of Vue/Pinia.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  TrainJobPayload,
  TrainingExamplePayload,
} from "../../src/types/headstoneTraining";
import { MIN_TRAINING_EXAMPLES } from "../../src/types/headstoneTraining";

export { MIN_TRAINING_EXAMPLES };

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
): TrainingExamplePayload[] {
  if (!examples || !Array.isArray(examples)) {
    throw new Error("examples array is required");
  }
  if (examples.length < MIN_TRAINING_EXAMPLES) {
    throw new Error(
      `Need at least ${MIN_TRAINING_EXAMPLES} reviewed examples (got ${examples.length})`,
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
}): TrainJobPayload {
  const version = new Date().toISOString();
  return {
    locationId: input.locationId,
    version,
    examples: input.examples,
    webhookUrl: `${input.webhookBaseUrl.replace(/\/$/, "")}/api/train-headstone-webhook`,
  };
}

/**
 * Start a Hugging Face Job that runs training/run_job.py
 * Docs: POST https://huggingface.co/api/jobs/{namespace}
 */
export async function startHuggingFaceJob(payload: TrainJobPayload): Promise<{
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
  const timeoutSeconds = Number(process.env.HF_JOB_TIMEOUT_SECONDS || 3600);
  const repoUrl =
    process.env.TRAIN_REPO_URL || "https://github.com/conorw/fieldwork.git";
  const repoRef = process.env.TRAIN_REPO_REF || "feature/cemetery-train-orchestrator";

  // Clone the repo (training/ package), install deps, run the job.
  // Payload is JSON in TRAIN_PAYLOAD_JSON (image URLs + labels only).
  const bootstrap = [
    "set -e",
    "git clone --depth 1 --branch \"$TRAIN_REPO_REF\" \"$TRAIN_REPO_URL\" /tmp/fieldwork || git clone --depth 1 \"$TRAIN_REPO_URL\" /tmp/fieldwork",
    "cd /tmp/fieldwork",
    "pip install -q -r training/requirements.txt",
    "python -m training.run_job",
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
    },
    secrets: {
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || "",
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
