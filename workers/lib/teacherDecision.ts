/**
 * Pure decisions for the upload → ChatGPT → train loop.
 * The worker stores a teacher label for every useful headstone photo.
 * A GPU publish starts only once a cemetery has enough variety, then
 * again after a batch of new photos, because each publish is a long job.
 */
import { evaluateTrainingCoverage } from "../../src/utils/trainingCoverage";
import type {
  TrainingExamplePayload,
} from "../../src/types/headstoneTraining";
import { RETRAIN_DELTA_EXAMPLES } from "../../src/types/headstoneTraining";

export interface TeacherAnalysis {
  persons?: Array<{
    full_name?: string | null;
    date_of_birth?: string | null;
    date_of_death?: string | null;
    age_at_death?: number | null;
    relationships?: string[];
    occupation?: string | null;
    veteran?: boolean | null;
  }>;
  full_text_transcription?: string | null;
  shared_epitaph?: string | null;
}

const HUMAN_SOURCES = new Set([
  "confirm",
  "correction",
  "soft_skip",
  "field_sample",
]);

const SOURCE_RANK: Record<string, number> = {
  correction: 50,
  confirm: 40,
  soft_skip: 30,
  field_sample: 20,
  teacher: 10,
};

export interface StoredTrainingRow {
  id: string;
  image_url: string;
  stone_type: string;
  target_json: string;
  plot_id?: string | null;
  plot_image_id?: string | null;
  was_corrected?: boolean | string | null;
  review_source?: string | null;
  reviewed_at?: string | null;
}

export function mimeFromFileName(fileName: string, hinted?: string): string | null {
  const hintedMime = (hinted || "").toLowerCase();
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(hintedMime)) {
    return hintedMime === "image/jpg" ? "image/jpeg" : hintedMime;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

/** Turn onnx-2026-10-11T17-31-11Z or an ISO timestamp into a comparable ISO time. */
export function publishWatermark(
  adapterVersion: string | null | undefined,
): string | null {
  if (!adapterVersion) return null;
  const hyphen = adapterVersion.match(
    /(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})Z?/,
  );
  if (hyphen) {
    return `${hyphen[1]}${hyphen[2]}:${hyphen[3]}:${hyphen[4]}Z`;
  }
  const parsed = Date.parse(adapterVersion);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function rowWasCorrected(
  row: Pick<StoredTrainingRow, "was_corrected">,
): boolean {
  return row.was_corrected === true || row.was_corrected === "true";
}

export function isHumanLabel(row: StoredTrainingRow): boolean {
  if (rowWasCorrected(row)) return true;
  return HUMAN_SOURCES.has(row.review_source || "");
}

function exampleRank(row: StoredTrainingRow): number {
  const rank = SOURCE_RANK[row.review_source || ""] || 0;
  return rank + (rowWasCorrected(row) ? 100 : 0);
}

export function preferTrainingExamples(
  rows: StoredTrainingRow[],
): TrainingExamplePayload[] {
  const best = new Map<string, StoredTrainingRow>();
  for (const row of rows) {
    if (!row.image_url || !row.target_json) continue;
    const current = best.get(row.image_url);
    if (!current || exampleRank(row) >= exampleRank(current)) {
      best.set(row.image_url, row);
    }
  }
  const payloads: TrainingExamplePayload[] = [];
  for (const row of best.values()) {
    let target: TrainingExamplePayload["target"];
    try {
      const parsed = JSON.parse(row.target_json) as TrainingExamplePayload["target"] & {
        review?: unknown;
      };
      delete parsed.review;
      target = parsed;
    } catch {
      continue;
    }
    payloads.push({
      imageUrl: row.image_url,
      stoneType: row.stone_type as TrainingExamplePayload["stoneType"],
      target,
      plotId: row.plot_id || undefined,
      plotImageId: row.plot_image_id || undefined,
    });
  }
  return payloads;
}

export function countExamplesSince(
  rows: StoredTrainingRow[],
  watermark: string | null,
): number {
  if (!watermark) return rows.length;
  const cutoff = Date.parse(watermark);
  if (Number.isNaN(cutoff)) return rows.length;
  return rows.filter((row) => {
    const at = Date.parse(row.reviewed_at || "");
    return !Number.isNaN(at) && at > cutoff;
  }).length;
}

export function decideTeacherTrain(input: {
  aiStatus: string | null | undefined;
  total: number;
  byStoneType: Record<string, number>;
  hasGlobalAdapter: boolean;
  examplesSincePublish: number;
  watermark: string | null;
}): { start: boolean; reason: string; minExamples: number } {
  const coverage = evaluateTrainingCoverage({
    total: input.total,
    byStoneType: input.byStoneType,
    hasGlobalAdapter: input.hasGlobalAdapter,
  });
  if (input.aiStatus === "training") {
    return {
      start: false,
      reason: "already_training",
      minExamples: coverage.requiredTotal,
    };
  }
  if (input.aiStatus === "local") {
    if (!input.watermark) {
      return {
        start: false,
        reason: "retrain_watermark_missing",
        minExamples: coverage.requiredTotal,
      };
    }
    if (input.examplesSincePublish < RETRAIN_DELTA_EXAMPLES) {
      return {
        start: false,
        reason: "retrain_delta_low",
        minExamples: coverage.requiredTotal,
      };
    }
  } else if (!coverage.ready) {
    return {
      start: false,
      reason: coverage.message,
      minExamples: coverage.requiredTotal,
    };
  }
  return { start: true, reason: "ready", minExamples: coverage.requiredTotal };
}

export function teacherExampleFromAnalysis(
  analysis: TeacherAnalysis,
  imageUrl: string,
): TrainingExamplePayload | null {
  const persons = analysis.persons || [];
  const named = persons.some((person) => (person.full_name || "").trim().length >= 2);
  const notes = (analysis.full_text_transcription || "").trim();
  if (!named && notes.length < 20) return null;

  const stoneType =
    persons.length >= 3 ? "family" : persons.length === 2 ? "couple" : "single";
  return {
    imageUrl,
    stoneType,
    target: {
      people: persons.map((person, index) => ({
        full_name: (person.full_name || "").trim(),
        role_on_stone: index === 0 ? "primary" : "spouse",
        position:
          persons.length === 2 ? (index === 0 ? "upper" : "lower") : "center",
        dates: {
          birth: person.date_of_birth || "",
          death: person.date_of_death || "",
          aged: person.age_at_death ?? null,
        },
        relationships: person.relationships || [],
        occupation: person.occupation || "",
        veteran: !!person.veteran,
        evidence: "ChatGPT reading",
      })),
      shared: {
        epitaph: analysis.shared_epitaph || "",
      },
      notes,
    },
  };
}

export function countsByStoneType(
  examples: TrainingExamplePayload[],
): Record<string, number> {
  const byStoneType: Record<string, number> = {};
  for (const example of examples) {
    byStoneType[example.stoneType] = (byStoneType[example.stoneType] || 0) + 1;
  }
  return byStoneType;
}
