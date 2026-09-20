/**
 * When shared global weights get smarter, pull them onto this device and
 * quietly retrain cemeteries so their on-device ONNX inherits the knowledge.
 *
 * Strategy (avoid train-job stampedes):
 * - Always warm-cache the new global weights (done in refreshGlobalAdapterMeta).
 * - Retrain only the currently selected local cemetery on this device.
 * - When the user later selects another local cemetery that hasn't absorbed
 *   this global version, retrain that one then.
 */
import {
  onGlobalAdapterUpdated,
  type GlobalAdapterMeta,
} from "./globalAdapterService";
import { useLocationsStore } from "../stores/locations";
import { toastService } from "./toastService";
import type { LocationData } from "../stores/locations";

const HANDLED_VERSION_KEY = "fieldwork-global-handled-version";
const LOCATION_GLOBAL_KEY = "fieldwork-location-global-version";
const pendingRetrain = new Set<string>();

function getHandledVersion(): string | null {
  try {
    return localStorage.getItem(HANDLED_VERSION_KEY);
  } catch {
    return null;
  }
}

function setHandledVersion(version: string) {
  try {
    localStorage.setItem(HANDLED_VERSION_KEY, version);
  } catch {
    /* ignore */
  }
}

function getLocationGlobalMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCATION_GLOBAL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function setLocationGlobalVersion(locationId: string, version: string) {
  try {
    const map = getLocationGlobalMap();
    map[locationId] = version;
    localStorage.setItem(LOCATION_GLOBAL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function locationNeedsGlobalAbsorb(
  locationId: string,
  globalVersion: string,
): boolean {
  const map = getLocationGlobalMap();
  return map[locationId] !== globalVersion;
}

async function tryRetrainForGlobal(
  location: LocationData,
  meta: GlobalAdapterMeta,
): Promise<boolean> {
  if (!location?.id || location.aiStatus !== "local") return false;
  if (!locationNeedsGlobalAbsorb(location.id, meta.version)) return false;
  if (pendingRetrain.has(location.id)) return false;

  pendingRetrain.add(location.id);
  try {
    const { countTrainingExamples, startLocationTraining } = await import(
      "../utils/headstoneTrainingService"
    );
    const counts = await countTrainingExamples(location.id);
    if (counts.total < 2) {
      // Mark absorbed so we don't loop; teaching can catch up later
      setLocationGlobalVersion(location.id, meta.version);
      return false;
    }

    await startLocationTraining(location.id);
    setLocationGlobalVersion(location.id, meta.version);
    console.log(
      `[global-learning] retrain ${location.id} for global ${meta.version}`,
    );
    return true;
  } catch (e) {
    console.warn("[global-learning] retrain deferred:", e);
    return false;
  } finally {
    pendingRetrain.delete(location.id);
  }
}

async function onGlobalBump(meta: GlobalAdapterMeta): Promise<void> {
  const locationsStore = useLocationsStore();
  const selected = locationsStore.selectedLocation;
  const started = selected
    ? await tryRetrainForGlobal(selected, meta)
    : false;

  if (started) {
    toastService.info(
      "Smarter offline model",
      "Updating this cemetery with shared improvements…",
      4500,
    );
  }
}

/**
 * Call when the selected cemetery changes — absorb pending global bumps.
 */
export async function absorbGlobalForLocation(
  location: LocationData | null | undefined,
): Promise<void> {
  if (!location || location.aiStatus !== "local") return;
  const { getCachedGlobalAdapterMeta } = await import("./globalAdapterService");
  const meta = getCachedGlobalAdapterMeta();
  if (!meta?.version) return;
  if (!locationNeedsGlobalAbsorb(location.id, meta.version)) return;
  await tryRetrainForGlobal(location, meta);
}

/**
 * Subscribe once at app boot.
 */
export function startGlobalLearningSync(): () => void {
  return onGlobalAdapterUpdated(async (meta, previous) => {
    if (!previous) {
      setHandledVersion(meta.version);
      return;
    }
    if (meta.version === getHandledVersion()) return;
    if (meta.version === previous.version) return;

    setHandledVersion(meta.version);
    console.log(
      `[global-learning] global ${previous.version} → ${meta.version}`,
    );
    await onGlobalBump(meta);
  });
}
