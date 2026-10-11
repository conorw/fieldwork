import { describe, expect, it } from "vitest";
import { resolveLocalAnalysisRoute } from "../../src/utils/localAnalysisRoute";

describe("local analysis routing", () => {
  it("uses the on-device model as soon as it is ready", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: true,
        modelReady: true,
        modelLoading: false,
      }),
    ).toEqual({
      useLocal: true,
      reason: "shared_loaded",
      startDownload: false,
      waitForModel: false,
    });
  });

  it("uses OpenAI only while the model is still downloading", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: true,
        modelReady: false,
        modelLoading: true,
      }),
    ).toEqual({
      useLocal: false,
      reason: "shared_model_downloading",
      startDownload: true,
      waitForModel: false,
    });
  });

  it("starts a background download when the model is not loaded yet", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: true,
        modelReady: false,
        modelLoading: false,
      }),
    ).toEqual({
      useLocal: false,
      reason: "shared_model_not_ready",
      startDownload: true,
      waitForModel: false,
    });
  });

  it("waits for the cached model when the device is offline", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: true,
        modelReady: false,
        modelLoading: true,
        offline: true,
      }),
    ).toEqual({
      useLocal: false,
      reason: "offline_wait_for_cache",
      startDownload: true,
      waitForModel: true,
    });
  });

  it("reads on-device immediately when the model is already loaded offline", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: true,
        modelReady: true,
        modelLoading: false,
        offline: true,
      }),
    ).toEqual({
      useLocal: true,
      reason: "offline_cached_model",
      startDownload: false,
      waitForModel: false,
    });
  });

  it("does not download on unsupported devices", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: false,
        modelReady: false,
        modelLoading: false,
        offline: true,
      }),
    ).toEqual({
      useLocal: false,
      reason: "device_unsupported",
      startDownload: false,
      waitForModel: false,
    });
  });
});
