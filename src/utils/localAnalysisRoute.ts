/**
 * Decide whether a headstone photo should be read on-device or online.
 * Never wait for a model download here — that stays in the background.
 */
export function resolveLocalAnalysisRoute(input: {
  canRunOfflineAi: boolean;
  modelReady: boolean;
  modelLoading: boolean;
}): { useLocal: boolean; reason: string; startDownload: boolean } {
  if (!input.canRunOfflineAi) {
    return {
      useLocal: false,
      reason: "device_unsupported",
      startDownload: false,
    };
  }
  if (input.modelReady) {
    return { useLocal: true, reason: "shared_loaded", startDownload: false };
  }
  return {
    useLocal: false,
    reason: input.modelLoading
      ? "shared_model_downloading"
      : "shared_model_not_ready",
    startDownload: true,
  };
}
