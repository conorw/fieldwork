/**
 * End-to-end state machine for cemetery training:
 * teacher → (reviewed examples) → training → local | error
 *
 * External HF / Supabase / Blob are mocked; this validates the process contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOB_ID,
  LOCATION_ID,
  USER_OWNER,
  WEBHOOK_SECRET,
  makeExampleBatch,
} from "./fixtures";
import { invokeHandler } from "./httpHarness";

type AiState = {
  ai_status: string;
  adapter_url?: string | null;
  adapter_version?: string | null;
  ai_train_error?: string | null;
  ai_train_job_id?: string | null;
};

const locationState: { current: AiState } = {
  current: { ai_status: "teacher" },
};

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
import webhookHandler from "../../api/train-headstone-webhook";

describe("cemetery train process — full integration", () => {
  const examples = makeExampleBatch();

  beforeEach(() => {
    locationState.current = { ai_status: "teacher" };
    process.env.TRAIN_WEBHOOK_SECRET = WEBHOOK_SECRET;

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
    mocks.startHuggingFaceJob.mockResolvedValue({ jobId: JOB_ID });
    mocks.updateLocationAiState.mockImplementation(
      async (_admin, _id, fields: AiState) => {
        locationState.current = { ...locationState.current, ...fields };
      },
    );
  });

  afterEach(() => {
    delete process.env.TRAIN_WEBHOOK_SECRET;
  });

  it("teacher → training → local (success webhook)", async () => {
    expect(locationState.current.ai_status).toBe("teacher");

    const start = await invokeHandler(trainHandler, {
      method: "POST",
      headers: {
        authorization: "Bearer tok",
        host: "app.example.com",
        "x-forwarded-proto": "https",
      },
      body: { locationId: LOCATION_ID, examples },
    });
    expect(start.statusCode).toBe(202);
    expect(locationState.current.ai_status).toBe("training");
    expect(locationState.current.ai_train_job_id).toBe(JOB_ID);

    const version = start.body.version as string;
    const hfPayload = mocks.startHuggingFaceJob.mock.calls[0][0];
    expect(hfPayload.examples[0].target.people[0].evidence).toBeTruthy();

    const done = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: {
        locationId: LOCATION_ID,
        status: "success",
        adapterUrl: `https://blob.vercel-storage.com/adapters/${LOCATION_ID}/${version}/`,
        adapterVersion: version,
        exportMode: "onnx",
        jobId: JOB_ID,
      },
    });
    expect(done.statusCode).toBe(200);
    expect(locationState.current.ai_status).toBe("local");
    expect(locationState.current.adapter_url).toContain("adapters/");
    expect(locationState.current.adapter_version).toBe(version);
    expect(locationState.current.ai_train_error).toBeNull();
  });

  it("teacher → training → error (failure webhook), GPT remains fallback", async () => {
    await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { locationId: LOCATION_ID, examples },
    });
    expect(locationState.current.ai_status).toBe("training");

    const fail = await invokeHandler(webhookHandler, {
      method: "POST",
      headers: { "x-train-webhook-secret": WEBHOOK_SECRET },
      body: {
        locationId: LOCATION_ID,
        status: "failure",
        error: "CUDA OOM",
        jobId: JOB_ID,
      },
    });
    expect(fail.statusCode).toBe(200);
    expect(locationState.current.ai_status).toBe("error");
    expect(locationState.current.ai_train_error).toMatch(/CUDA OOM/);
    // Product rule: error does not wipe teacher capability — status is not "local"
    expect(locationState.current.ai_status).not.toBe("local");
  });

  it("kickoff refused before enough reviewed examples", async () => {
    const res = await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: {
        locationId: LOCATION_ID,
        examples: examples.slice(0, 5),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(locationState.current.ai_status).toBe("teacher");
    expect(mocks.startHuggingFaceJob).not.toHaveBeenCalled();
  });

  it("status polling works while training", async () => {
    await invokeHandler(trainHandler, {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { locationId: LOCATION_ID, examples },
    });
    mocks.getHuggingFaceJobStatus.mockResolvedValue({
      status: { stage: "RUNNING", message: "epoch 2" },
    });
    const status = await invokeHandler(trainHandler, {
      method: "GET",
      headers: { authorization: "Bearer tok" },
      query: { jobId: JOB_ID },
    });
    expect(status.statusCode).toBe(200);
    expect(status.body.stage).toBe("RUNNING");
  });
});
