/**
 * Decide whether a headstone photo should be read on-device or online.
 * Online, a missing model stays in the background and the photo uses the API.
 * Offline, the photo waits for the cached on-device model.
 */
export function resolveLocalAnalysisRoute(input: {
  canRunOfflineAi: boolean;
  modelReady: boolean;
  modelLoading: boolean;
  offline?: boolean;
}): { useLocal: boolean; reason: string; startDownload: boolean; waitForModel: boolean } {
  if (!input.canRunOfflineAi) {
    return {
      useLocal: false,
      reason: "device_unsupported",
      startDownload: false,
      waitForModel: false,
    };
  }
  if (input.modelReady) {
    return {
      useLocal: true,
      reason: input.offline ? "offline_cached_model" : "shared_loaded",
      startDownload: false,
      waitForModel: false,
    };
  }
  if (input.offline) {
    return {
      useLocal: false,
      reason: "offline_wait_for_cache",
      startDownload: true,
      waitForModel: true,
    };
  }
  return {
    useLocal: false,
    reason: input.modelLoading
      ? "shared_model_downloading"
      : "shared_model_not_ready",
    startDownload: true,
    waitForModel: false,
  };
}
