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
    });
  });

  it("does not download on unsupported devices", () => {
    expect(
      resolveLocalAnalysisRoute({
        canRunOfflineAi: false,
        modelReady: false,
        modelLoading: false,
      }),
    ).toEqual({
      useLocal: false,
      reason: "device_unsupported",
      startDownload: false,
    });
  });
});
