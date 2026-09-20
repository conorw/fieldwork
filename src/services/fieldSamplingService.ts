/**
 * Persist background field samples so new customers improve the shared model
 * without a teaching onboarding step.
 */
import type { LocationData } from "../stores/locations";
import type {
  HeadstoneReasoningTarget,
  ReviewSource,
  StoneType,
} from "../types/headstoneTraining";
import {
  countTrainingExamples,
  saveReviewedTrainingExample,
} from "../utils/headstoneTrainingService";
import { evaluateTrainingCoverage } from "../utils/trainingCoverage";
import { hasGlobalAdapterCached } from "./globalAdapterService";
import { maybeAutoStartTraining } from "./autoTrainService";
import { shouldKeepUnconfirmedFieldSample } from "../utils/fieldSampling";

export {
  FIELD_SAMPLE_KEEP_EVERY,
  fieldSampleFromAnalysis,
  isUsefulFieldSample,
  shouldKeepUnconfirmedFieldSample,
} from "../utils/fieldSampling";
export type { FieldAnalysisSnapshot } from "../utils/fieldSampling";

function reviewSourceOf(
  target: HeadstoneReasoningTarget,
  wasCorrected?: boolean,
  explicit?: ReviewSource,
): ReviewSource {
  if (explicit) return explicit;
  if (target.review?.source) return target.review.source;
  return wasCorrected ? "correction" : "confirm";
}

export async function persistFieldSample(input: {
  locationId: string;
  imageUrl: string;
  plotId?: string;
  plotImageId?: string;
  stoneType: StoneType;
  target: HeadstoneReasoningTarget;
  wasCorrected?: boolean;
  reviewSource?: ReviewSource;
  location?: LocationData | null;
}): Promise<{ saved: boolean; reason: string }> {
  const source = reviewSourceOf(
    input.target,
    input.wasCorrected,
    input.reviewSource,
  );

  if (source === "field_sample") {
    const counts = await countTrainingExamples(input.locationId);
    const hasGlobal = await hasGlobalAdapterCached();
    const coverage = evaluateTrainingCoverage({
      total: counts.total,
      byStoneType: counts.byStoneType,
      hasGlobalAdapter: hasGlobal,
    });
    const keep = shouldKeepUnconfirmedFieldSample(
      input.plotImageId || input.imageUrl,
      counts.total,
      coverage.requiredTotal,
    );
    if (!keep) {
      return { saved: false, reason: "sampled_out" };
    }
  }

  const target: HeadstoneReasoningTarget = {
    ...input.target,
    review: {
      was_corrected: !!input.wasCorrected,
      source,
      prediction: input.target.review?.prediction,
    },
  };

  await saveReviewedTrainingExample({
    locationId: input.locationId,
    imageUrl: input.imageUrl,
    stoneType: input.stoneType,
    target,
    plotId: input.plotId,
    plotImageId: input.plotImageId,
    wasCorrected: input.wasCorrected,
    reviewSource: source,
  });

  if (input.location) {
    await maybeAutoStartTraining(input.location);
  }

  return { saved: true, reason: source };
}
