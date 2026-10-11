import type { StoneType } from "../types/headstoneTraining";
import {
  MIN_DISTINCT_STONE_TYPES,
  trainingExampleGate,
} from "../types/headstoneTraining";

export interface CoverageInput {
  total: number;
  byStoneType: Record<string, number>;
  hasGlobalAdapter: boolean;
}

export interface CoverageStatus {
  ready: boolean;
  requiredTotal: number;
  total: number;
  remaining: number;
  distinctTypes: number;
  requiredDistinctTypes: number;
  byStoneType: Record<string, number>;
  message: string;
}

export function evaluateTrainingCoverage(input: CoverageInput): CoverageStatus {
  const requiredTotal = trainingExampleGate(input.hasGlobalAdapter);
  const types = Object.keys(input.byStoneType).filter(
    (t) => (input.byStoneType[t] || 0) > 0 && t !== "unknown",
  );
  // unknown counts toward total but not distinct variety unless it's the only type
  const distinctTypes =
    types.length > 0
      ? types.length
      : (input.byStoneType.unknown || 0) > 0
        ? 1
        : 0;

  const requiredDistinct = Math.min(
    MIN_DISTINCT_STONE_TYPES,
    requiredTotal,
  );

  const ready =
    input.total >= requiredTotal && distinctTypes >= requiredDistinct;

  const remaining = Math.max(0, requiredTotal - input.total);
  let message: string;
  if (ready) {
    message = "Enough confirmed stones to learn this cemetery offline.";
  } else if (input.total < requiredTotal) {
    message = `Add ${remaining} more headstone photo${remaining === 1 ? "" : "s"} (${input.total} of ${requiredTotal}).`;
  } else {
    message = `Add more variety — need at least ${requiredDistinct} different kinds of stones (have ${distinctTypes}).`;
  }

  return {
    ready,
    requiredTotal,
    total: input.total,
    remaining,
    distinctTypes,
    requiredDistinctTypes: requiredDistinct,
    byStoneType: { ...input.byStoneType },
    message,
  };
}

export function checklistStoneTypes(): StoneType[] {
  return ["single", "couple", "family", "weathered"];
}
