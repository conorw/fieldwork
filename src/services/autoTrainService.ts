/**
 * Automatically start cemetery training when coverage is met,
 * poll job status, and install the adapter when ready.
 */
import {
  countTrainingExamples,
  getTrainJobStatus,
  listTrainingExamplesForLocation,
  startLocationTraining,
} from "../utils/headstoneTrainingService";
import { evaluateTrainingCoverage } from "../utils/trainingCoverage";
import { hasGlobalAdapterCached } from "./globalAdapterService";
import { ensureLocalModelForLocation } from "./adapterInstallService";
import type { LocationData } from "../stores/locations";
import { RETRAIN_DELTA_EXAMPLES } from "../types/headstoneTraining";
import { toastService } from "./toastService";

const lastTrainExampleCount = new Map<string, number>();
const inFlight = new Set<string>();

export async function maybeAutoStartTraining(
  location: LocationData,
): Promise<{ started: boolean; reason: string }> {
  if (!location?.id) return { started: false, reason: "no_location" };
  if (location.aiStatus === "training") {
    return { started: false, reason: "already_training" };
  }

  const counts = await countTrainingExamples(location.id);
  const hasGlobal = await hasGlobalAdapterCached();
  const coverage = evaluateTrainingCoverage({
    total: counts.total,
    byStoneType: counts.byStoneType,
    hasGlobalAdapter: hasGlobal,
  });

  if (location.aiStatus === "local") {
    const last = lastTrainExampleCount.get(location.id) ?? 0;
    const delta = counts.total - last;
    if (delta < RETRAIN_DELTA_EXAMPLES) {
      return { started: false, reason: "retrain_delta_low" };
    }
  } else if (!coverage.ready) {
    return { started: false, reason: coverage.message };
  }

  if (inFlight.has(location.id)) {
    return { started: false, reason: "in_flight" };
  }

  inFlight.add(location.id);
  try {
    const { jobId, version } = await startLocationTraining(location.id);
    lastTrainExampleCount.set(location.id, counts.total);
    toastService.info(
      "Learning this cemetery",
      "Offline reading will turn on automatically when ready.",
      5000,
    );
    void pollUntilDone(location, jobId);
    return { started: true, reason: `job:${jobId}:${version}` };
  } catch (e) {
    return {
      started: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  } finally {
    inFlight.delete(location.id);
  }
}

async function pollUntilDone(_location: LocationData, jobId: string) {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    try {
      const status = await getTrainJobStatus(jobId);
      const stage = (status.stage || "").toLowerCase();
      if (stage.includes("complete") || stage.includes("success")) {
        break;
      }
      if (stage.includes("error") || stage.includes("fail")) {
        return;
      }
    } catch {
      /* keep polling; webhook is source of truth via PowerSync */
    }
  }
}

/**
 * After PowerSync updates location to local, install model and toast.
 */
export async function onLocationBecameLocal(
  location: LocationData,
): Promise<void> {
  try {
    const examples = await listTrainingExamplesForLocation(location.id);
    lastTrainExampleCount.set(location.id, examples.length);
    await ensureLocalModelForLocation(location);
    toastService.success(
      "Offline ready",
      "This cemetery now works offline on this device.",
      6000,
    );
  } catch (e) {
    console.warn("onLocationBecameLocal install failed:", e);
  }
}

export function rememberExampleCount(locationId: string, total: number) {
  lastTrainExampleCount.set(locationId, total);
}
