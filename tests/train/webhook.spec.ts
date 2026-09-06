import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_ID, LOCATION_ID, WEBHOOK_SECRET } from "./fixtures";
import { invokeHandler } from "./httpHarness";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  updateLocationAiState: vi.fn(),
}));

vi.mock("../../api/lib/trainHelpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../api/lib/trainHelpers")
  >("../../api/lib/trainHelpers");
  return {
    ...actual,
    getSupabaseAdmin: mocks.getSupabaseAdmin,
    updateLocationAiState: mocks.updateLocationAiState,
  };
});

import webhookHandler from "../../api/train-headstone-webhook";

describe("POST /api/train-headstone-webhook", () => {
  beforeEach(() => {
    process.env.TRAIN_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mocks.getSupabaseAdmin.mockReset();
    mocks.updateLocationAiState.mockReset();
    mocks.getSupabaseAdmin.mockReturnValue({});
    mocks.updateLocationAiState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TRAIN_WEBHOOK_SECRET;
  });

  it("rejects non-POST", async () => {
    const res = await invokeHandler(webhookHandler, { method: "GET" });
    expect(res.statusCode).toBe(405);
  });

  it("rejects missing secret config", async () => {
    delete process.env.TRAIN_WEBHOOK_SECRET;
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: { locationId: LOCATION_ID, status: "success" },
    });
    expect(res.statusCode).toBe(500);
  });

  it("rejects bad secret", async () => {
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": "wrong" },
      body: {
        locationId: LOCATION_ID,
        status: "success",
        adapterUrl: "https://blob/x/",
        adapterVersion: "v1",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts secret via Authorization Bearer", async () => {
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { authorization: `Bearer ${WEBHOOK_SECRET}` },
      body: {
        locationId: LOCATION_ID,
        status: "success",
        adapterUrl: "https://blob.vercel-storage.com/adapters/loc/v1/",
        adapterVersion: "2026-09-06T20:00:00Z",
        jobId: JOB_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ai_status).toBe("local");
  });

  it("success → ai_status local with adapter fields", async () => {
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: {
        locationId: LOCATION_ID,
        status: "success",
        adapterUrl: "https://blob.vercel-storage.com/adapters/loc/v1/",
        adapterVersion: "2026-09-06T20:00:00Z",
        exportMode: "onnx",
        jobId: JOB_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.updateLocationAiState).toHaveBeenCalledWith(
      expect.anything(),
      LOCATION_ID,
      expect.objectContaining({
        ai_status: "local",
        adapter_url: "https://blob.vercel-storage.com/adapters/loc/v1/",
        adapter_version: "2026-09-06T20:00:00Z",
        ai_train_job_id: JOB_ID,
        ai_train_error: null,
      }),
    );
  });

  it("success without adapterUrl → 400", async () => {
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: { locationId: LOCATION_ID, status: "success" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("failure → ai_status error", async () => {
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: {
        locationId: LOCATION_ID,
        status: "failure",
        error: "OOM during ONNX export",
        jobId: JOB_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ai_status).toBe("error");
    expect(mocks.updateLocationAiState).toHaveBeenCalledWith(
      expect.anything(),
      LOCATION_ID,
      expect.objectContaining({
        ai_status: "error",
        ai_train_error: "OOM during ONNX export",
      }),
    );
  });

  it("requires locationId and status", async () => {
    const res = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: { status: "failure" },
    });
    expect(res.statusCode).toBe(400);
  });
});
