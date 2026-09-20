/**
 * Pure helpers for background-sampling field uploads into the shared training set.
 */
import type {
  HeadstonePhysicalAttrs,
  HeadstoneReasoningTarget,
  ReviewSource,
  StoneType,
} from "../types/headstoneTraining";
import type { ConfirmPersonInput } from "./reasoningMapper";
import {
  inferStaffStoneKind,
  personsToReasoningTarget,
  staffKindToStoneType,
} from "./reasoningMapper";

/** After coverage is met, keep 1 in N unconfirmed field samples. */
export const FIELD_SAMPLE_KEEP_EVERY = 4;

export interface FieldAnalysisSnapshot {
  success?: boolean;
  persons?: Array<{
    full_name?: string;
    title?: string;
    forename?: string;
    middle_name?: string;
    surname?: string;
    maiden_name?: string;
    known_as?: string;
    date_of_birth?: string;
    date_of_death?: string;
    age_at_death?: number | null;
    veteran?: boolean;
    notes?: string;
  }>;
  full_text_transcription?: string;
  shared_epitaph?: string;
  physical?: HeadstonePhysicalAttrs | null;
}

export function isUsefulFieldSample(analysis: FieldAnalysisSnapshot): boolean {
  const named = (analysis.persons || []).some(
    (p) => (p.full_name || "").trim().length >= 2,
  );
  const text = (analysis.full_text_transcription || "").trim();
  return named || text.length >= 20;
}

export function fieldSampleFromAnalysis(
  analysis: FieldAnalysisSnapshot,
  source: ReviewSource = "field_sample",
): {
  stoneType: StoneType;
  target: HeadstoneReasoningTarget;
  physical?: HeadstonePhysicalAttrs;
} | null {
  if (!isUsefulFieldSample(analysis)) return null;

  const persons = analysis.persons || [];
  const kind = inferStaffStoneKind(persons.length);
  const people: ConfirmPersonInput[] = persons.map((p) => ({
    full_name: p.full_name || "",
    title: p.title,
    forename: p.forename,
    middle_name: p.middle_name,
    surname: p.surname,
    maiden_name: p.maiden_name,
    known_as: p.known_as,
    date_of_birth: p.date_of_birth,
    date_of_death: p.date_of_death,
    age_at_death: p.age_at_death,
    veteran: p.veteran,
    notes: p.notes,
  }));
  const target = personsToReasoningTarget(people, {
    stoneKind: kind,
    epitaph: analysis.shared_epitaph || "",
    notes: analysis.full_text_transcription || "",
    physical: analysis.physical || undefined,
    evidenceFallback: "Field sample",
  });
  target.review = {
    was_corrected: false,
    source,
  };

  return {
    stoneType: staffKindToStoneType(kind),
    target,
    physical: analysis.physical || undefined,
  };
}

export function shouldKeepUnconfirmedFieldSample(
  plotImageId: string,
  currentTotal: number,
  requiredTotal: number,
): boolean {
  if (currentTotal < requiredTotal) return true;
  let hash = 0;
  for (let i = 0; i < plotImageId.length; i++) {
    hash = (hash * 31 + plotImageId.charCodeAt(i)) >>> 0;
  }
  return hash % FIELD_SAMPLE_KEEP_EVERY === 0;
}
