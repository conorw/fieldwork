import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOB_ID,
  LOCATION_ID,
  USER_OWNER,
  makeExampleBatch,
} from "./fixtures";
import { invokeHandler } from "./httpHarness";

const mocks = vi.hoisted(() => ({
  getSupabaseAuthed: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  assertLocationAdmin: vi.fn(),
  startHuggingFaceJob: vi.fn(),
  getHuggingFaceJobStatus: vi.fn(),
  updateLocationAiState: vi.fn(),
}));

vi.mock("../../api/lib/trainHelpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../api/lib/trainHelpers")
  >("../../api/lib/trainHelpers");
  return {
    ...actual,
    getSupabaseAuthed: mocks.getSupabaseAuthed,
    getSupabaseAdmin: mocks.getSupabaseAdmin,
    assertLocationAdmin: mocks.assertLocationAdmin,
    startHuggingFaceJob: mocks.startHuggingFaceJob,
    getHuggingFaceJobStatus: mocks.getHuggingFaceJobStatus,
    updateLocationAiState: mocks.updateLocationAiState,
  };
});

import trainHandler from "../../api/train-headstone";

describe("POST /api/train-headstone — orchestrator integration", () => {
  const examples = makeExampleBatch();

  beforeEach(() => {
    mocks.getSupabaseAuthed.mockReset();
    mocks.getSupabaseAdmin.mockReset();
    mocks.assertLocationAdmin.mockReset();
    mocks.startHuggingFaceJob.mockReset();
    mocks.getHuggingFaceJobStatus.mockReset();
    mocks.updateLocationAiState.mockReset();

    mocks.getSupabaseAuthed.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_OWNER } },
          error: null,
        }),
      },
    });
    mocks.getSupabaseAdmin.mockReturnValue({});
    mocks.assertLocationAdmin.mockResolvedValue(undefined);
    mocks.updateLocationAiState.mockResolvedValue(undefined);
    mocks.startHuggingFaceJob.mockResolvedValue({ jobId: JOB_ID });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      body: { locationId: LOCATION_ID, examples },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 405 for unsupported methods", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "PUT",
      headers: { authorization: "Bearer tok" },
    });
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when locationId missing", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { examples },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/locationId/i);
  });

  it("returns 400 when examples below gate", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { locationId: LOCATION_ID, examples: examples.slice(0, 3) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/at least 15/i);
  });

  it("returns 403 when caller is not owner/admin", async () => {
    mocks.assertLocationAdmin.mockRejectedValue(
      new Error("Forbidden: owner or admin role required"),
    );
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { locationId: LOCATION_ID, examples },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 for invalid session", async () => {
    mocks.getSupabaseAuthed.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: "bad" },
        }),
      },
    });
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { locationId: LOCATION_ID, examples },
    });
    expect(res.statusCode).toBe(401);
  });

  it("happy path: sets training state, starts HF job, returns 202", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: {
        authorization: "Bearer tok",
        host: "app.example.com",
        "x-forwarded-proto": "https",
      },
      body: { locationId: LOCATION_ID, examples },
    });

    expect(res.statusCode).toBe(202);
    expect(res.body.jobId).toBe(JOB_ID);
    expect(res.body.exampleCount).toBe(examples.length);
    expect(res.body.status).toBe("training");
    expect(typeof res.body.version).toBe("string");

    expect(mocks.startHuggingFaceJob).toHaveBeenCalledOnce();
    const hfPayload = mocks.startHuggingFaceJob.mock.calls[0][0];
    expect(hfPayload.locationId).toBe(LOCATION_ID);
    expect(hfPayload.webhookUrl).toContain("/api/train-headstone-webhook");
    expect(hfPayload.examples).toHaveLength(examples.length);

    const stateCalls = mocks.updateLocationAiState.mock.calls;
    expect(stateCalls.some((c) => c[2].ai_status === "training")).toBe(true);
    expect(
      stateCalls.some(
        (c) => c[2].ai_status === "training" && c[2].ai_train_job_id === JOB_ID,
      ),
    ).toBe(true);
  });

  it("HF failure: marks error and returns 502", async () => {
    mocks.startHuggingFaceJob.mockRejectedValue(new Error("HF down"));
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { locationId: LOCATION_ID, examples },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/HF down/);
    expect(
      mocks.updateLocationAiState.mock.calls.some(
        (c) => c[2].ai_status === "error",
      ),
    ).toBe(true);
  });
});

describe("GET /api/train-headstone — job status", () => {
  beforeEach(() => {
    mocks.getSupabaseAuthed.mockReturnValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_OWNER } },
          error: null,
        }),
      },
    });
    mocks.getHuggingFaceJobStatus.mockResolvedValue({
      status: { stage: "RUNNING", message: "training" },
    });
  });

  it("requires jobId", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "GET",
      headers: { authorization: "Bearer tok" },
      query: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns HF stage", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "GET",
      headers: { authorization: "Bearer tok" },
      query: { jobId: JOB_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.stage).toBe("RUNNING");
    expect(res.body.jobId).toBe(JOB_ID);
  });
});
