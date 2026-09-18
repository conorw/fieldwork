import { usePowerSyncStore } from "../stores/powersync";
import { useAuthStore } from "../stores/auth";
import type {
  HeadstoneReasoningTarget,
  StoneType,
  TrainingExamplePayload,
} from "../types/headstoneTraining";
import { MIN_TRAINING_EXAMPLES } from "../types/headstoneTraining";
import { evaluateTrainingCoverage } from "./trainingCoverage";
import {
  hasGlobalAdapterCached,
  resolveGlobalBaseAdapterUrl,
} from "../services/globalAdapterService";

export interface TrainingExampleRecord {
  id: string;
  location_id: string;
  plot_id: string | null;
  plot_image_id: string | null;
  image_url: string;
  stone_type: StoneType;
  target_json: string;
  reviewed_by: string;
  reviewed_at: string;
  date_created: string;
  was_corrected?: boolean;
  prediction_json?: string | null;
  review_source?: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ex_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Gold label for the VLM — strip staff review metadata */
export function stripReviewMeta(
  target: HeadstoneReasoningTarget,
): HeadstoneReasoningTarget {
  const { review: _review, ...rest } = target;
  return rest;
}

/**
 * Persist a human-reviewed headstone example for a cemetery.
 * Corrections (wasCorrected) are high-value signal for this cemetery and the global model.
 */
export async function saveReviewedTrainingExample(input: {
  locationId: string;
  imageUrl: string;
  stoneType: StoneType;
  target: HeadstoneReasoningTarget;
  plotId?: string;
  plotImageId?: string;
  wasCorrected?: boolean;
}): Promise<TrainingExampleRecord> {
  const powerSyncStore = usePowerSyncStore();
  const authStore = useAuthStore();

  if (!powerSyncStore.powerSync) {
    throw new Error("PowerSync client not initialized");
  }
  if (!authStore.user) {
    throw new Error("Must be signed in to save training examples");
  }
  if (!input.imageUrl) {
    throw new Error("imageUrl is required");
  }

  const now = new Date().toISOString();
  const wasCorrected =
    input.wasCorrected ?? input.target.review?.was_corrected ?? false;
  const reviewSource =
    input.target.review?.source || (wasCorrected ? "correction" : "confirm");
  const predictionJson = input.target.review?.prediction
    ? JSON.stringify(input.target.review.prediction)
    : null;

  // Persist gold label + review meta in target_json (works before migration 009)
  const targetForStore: HeadstoneReasoningTarget = {
    ...input.target,
    review: {
      was_corrected: wasCorrected,
      source: reviewSource as "confirm" | "correction" | "soft_skip",
      prediction: input.target.review?.prediction,
    },
  };

  const record: TrainingExampleRecord = {
    id: newId(),
    location_id: input.locationId,
    plot_id: input.plotId ?? null,
    plot_image_id: input.plotImageId ?? null,
    image_url: input.imageUrl,
    stone_type: input.stoneType,
    target_json: JSON.stringify(targetForStore),
    reviewed_by: authStore.user.id,
    reviewed_at: now,
    date_created: now,
    was_corrected: wasCorrected,
    prediction_json: predictionJson,
    review_source: reviewSource,
  };

  try {
    await powerSyncStore.powerSync.execute(
      `INSERT INTO headstone_training_examples
        (id, location_id, plot_id, plot_image_id, image_url, stone_type, target_json,
         reviewed_by, reviewed_at, date_created, was_corrected, prediction_json, review_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.location_id,
        record.plot_id,
        record.plot_image_id,
        record.image_url,
        record.stone_type,
        record.target_json,
        record.reviewed_by,
        record.reviewed_at,
        record.date_created,
        wasCorrected ? "true" : "false",
        predictionJson,
        reviewSource,
      ],
    );
  } catch (e) {
    // Pre-migration 009 local DBs: fall back without new columns
    console.warn("Training insert with correction columns failed; retrying basic:", e);
    await powerSyncStore.powerSync.execute(
      `INSERT INTO headstone_training_examples
        (id, location_id, plot_id, plot_image_id, image_url, stone_type, target_json, reviewed_by, reviewed_at, date_created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.location_id,
        record.plot_id,
        record.plot_image_id,
        record.image_url,
        record.stone_type,
        record.target_json,
        record.reviewed_by,
        record.reviewed_at,
        record.date_created,
      ],
    );
  }

  return record;
}

export async function listTrainingExamplesForLocation(
  locationId: string,
): Promise<TrainingExampleRecord[]> {
  const powerSyncStore = usePowerSyncStore();
  if (!powerSyncStore.powerSync) {
    throw new Error("PowerSync client not initialized");
  }

  const rows = await powerSyncStore.powerSync.getAll(
    `SELECT * FROM headstone_training_examples
     WHERE location_id = ?
     ORDER BY reviewed_at ASC`,
    [locationId],
  );

  return rows as TrainingExampleRecord[];
}

export async function countTrainingExamples(
  locationId: string,
): Promise<{ total: number; byStoneType: Record<string, number> }> {
  const examples = await listTrainingExamplesForLocation(locationId);
  const byStoneType: Record<string, number> = {};
  for (const ex of examples) {
    byStoneType[ex.stone_type] = (byStoneType[ex.stone_type] || 0) + 1;
  }
  return { total: examples.length, byStoneType };
}

/** @deprecated prefer evaluateTrainingCoverage — kept for existing tests */
export function examplesReadyForTraining(
  total: number,
  minTotal = MIN_TRAINING_EXAMPLES,
): boolean {
  return total >= minTotal;
}

export function toTrainPayloadExamples(
  records: TrainingExampleRecord[],
): TrainingExamplePayload[] {
  return records.map((r) => {
    const parsed = JSON.parse(r.target_json) as HeadstoneReasoningTarget;
    return {
      imageUrl: r.image_url,
      stoneType: r.stone_type,
      target: stripReviewMeta(parsed),
      plotId: r.plot_id ?? undefined,
      plotImageId: r.plot_image_id ?? undefined,
    };
  });
}

/**
 * Kick off a cemetery train job via the Vercel orchestrator.
 * Sends reviewed examples from local PowerSync (source of truth until synced).
 */
export async function startLocationTraining(
  locationId: string,
): Promise<{ jobId: string; version: string }> {
  const examples = await listTrainingExamplesForLocation(locationId);
  const byStoneType: Record<string, number> = {};
  for (const ex of examples) {
    byStoneType[ex.stone_type] = (byStoneType[ex.stone_type] || 0) + 1;
  }
  const hasGlobal = await hasGlobalAdapterCached();
  const coverage = evaluateTrainingCoverage({
    total: examples.length,
    byStoneType,
    hasGlobalAdapter: hasGlobal,
  });
  if (!coverage.ready) {
    throw new Error(coverage.message);
  }

  const authStore = useAuthStore();
  const session = authStore.session;
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const baseAdapterUrl = await resolveGlobalBaseAdapterUrl();

  const res = await fetch("/api/train-headstone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      locationId,
      examples: toTrainPayloadExamples(examples),
      minExamples: coverage.requiredTotal,
      baseAdapterUrl: baseAdapterUrl || undefined,
    }),
  });

  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Train request failed (${res.status})`);
  }

  const data = await res.json();
  return { jobId: data.jobId, version: data.version };
}

export async function getTrainJobStatus(jobId: string): Promise<{
  stage?: string;
  message?: string;
  raw?: unknown;
}> {
  const authStore = useAuthStore();
  const session = authStore.session;
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(
    `/api/train-headstone?jobId=${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Status request failed (${res.status})`);
  }

  return res.json();
}

export { MIN_TRAINING_EXAMPLES };
