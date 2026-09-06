import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertLocationAdmin,
  buildTrainJobPayload,
  MIN_TRAINING_EXAMPLES,
  startHuggingFaceJob,
  updateLocationAiState,
  validateExamples,
} from "../../api/lib/trainHelpers";
import {
  JOB_ID,
  LOCATION_ID,
  USER_MEMBER,
  USER_OWNER,
  makeExample,
  makeExampleBatch,
} from "./fixtures";

describe("trainHelpers — example gate", () => {
  it("rejects missing examples", () => {
    expect(() => validateExamples(undefined)).toThrow(/examples array/i);
  });

  it(`rejects fewer than ${MIN_TRAINING_EXAMPLES} examples`, () => {
    expect(() => validateExamples(makeExampleBatch(MIN_TRAINING_EXAMPLES - 1))).toThrow(
      /at least 15/i,
    );
  });

  it("rejects examples missing imageUrl or target", () => {
    const bad = makeExampleBatch();
    // @ts-expect-error intentional
    bad[0].imageUrl = "";
    expect(() => validateExamples(bad)).toThrow(/imageUrl and target/i);
  });

  it("accepts a full reviewed batch", () => {
    const ok = validateExamples(makeExampleBatch());
    expect(ok).toHaveLength(MIN_TRAINING_EXAMPLES);
    expect(ok[0].stoneType).toBeTruthy();
    expect(ok[0].target.people[0].evidence).toBeTruthy();
  });
});

describe("trainHelpers — job payload", () => {
  it("builds webhook URL and version", () => {
    const examples = makeExampleBatch();
    const payload = buildTrainJobPayload({
      locationId: LOCATION_ID,
      examples,
      webhookBaseUrl: "https://app.example.com/",
    });
    expect(payload.locationId).toBe(LOCATION_ID);
    expect(payload.examples).toHaveLength(MIN_TRAINING_EXAMPLES);
    expect(payload.webhookUrl).toBe(
      "https://app.example.com/api/train-headstone-webhook",
    );
    expect(payload.version).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves reasoning fields (position, evidence, relationships)", () => {
    const ex = makeExample(0, {
      stoneType: "couple",
      target: {
        people: [
          {
            full_name: "A",
            role_on_stone: "primary",
            position: "left",
            dates: { birth: "1", death: "2", aged: null },
            relationships: ["wife of B"],
            evidence: "left column dates under name",
          },
          {
            full_name: "B",
            role_on_stone: "spouse",
            position: "right",
            dates: {},
            relationships: [],
            evidence: "right column",
          },
        ],
        shared: { surname: "X", epitaph: "RIP" },
      },
    });
    const payload = buildTrainJobPayload({
      locationId: LOCATION_ID,
      examples: makeExampleBatch().map((e, i) => (i === 0 ? ex : e)),
      webhookBaseUrl: "https://x.test",
    });
    expect(payload.examples[0].target.people).toHaveLength(2);
    expect(payload.examples[0].target.people[0].position).toBe("left");
    expect(payload.examples[0].target.shared?.surname).toBe("X");
  });
});

describe("trainHelpers — authz", () => {
  it("allows location owner", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("locations");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: LOCATION_ID, owner_id: USER_OWNER },
                error: null,
              }),
            }),
          }),
        };
      },
    } as any;
    await expect(
      assertLocationAdmin(supabase, USER_OWNER, LOCATION_ID),
    ).resolves.toBeUndefined();
  });

  it("allows location admin member", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "locations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: LOCATION_ID, owner_id: USER_OWNER },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "admin" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    } as any;
    await expect(
      assertLocationAdmin(supabase, USER_MEMBER, LOCATION_ID),
    ).resolves.toBeUndefined();
  });

  it("forbids plain members", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "locations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: LOCATION_ID, owner_id: USER_OWNER },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "member" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    } as any;
    await expect(
      assertLocationAdmin(supabase, USER_MEMBER, LOCATION_ID),
    ).rejects.toThrow(/Forbidden/i);
  });

  it("errors when location missing", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as any;
    await expect(
      assertLocationAdmin(supabase, USER_OWNER, LOCATION_ID),
    ).rejects.toThrow(/not found/i);
  });
});

describe("trainHelpers — HF Jobs kickoff", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.HF_TOKEN = "hf_test_token";
    process.env.HF_NAMESPACE = "test-ns";
    process.env.BLOB_READ_WRITE_TOKEN = "blob_test";
    process.env.TRAIN_WEBHOOK_SECRET = "whsec";
    process.env.TRAIN_REPO_URL = "https://github.com/conorw/fieldwork.git";
    process.env.TRAIN_REPO_REF = "feature/cemetery-train-orchestrator";
    process.env.HF_JOB_FLAVOR = "l4x1";
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
  });

  it("POSTs job spec with payload, flavor, timeout, and secrets", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: JOB_ID }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = buildTrainJobPayload({
      locationId: LOCATION_ID,
      examples: makeExampleBatch(),
      webhookBaseUrl: "https://app.example.com",
    });

    const result = await startHuggingFaceJob(payload);
    expect(result.jobId).toBe(JOB_ID);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://huggingface.co/api/jobs/test-ns");
    expect(init?.method).toBe("POST");
    expect((init?.headers as any).Authorization).toBe("Bearer hf_test_token");

    const body = JSON.parse(init?.body as string);
    expect(body.flavor).toBe("l4x1");
    expect(body.timeoutSeconds).toBe(3600);
    expect(body.environment.TRAIN_PAYLOAD_JSON).toContain(LOCATION_ID);
    expect(body.secrets.TRAIN_WEBHOOK_SECRET).toBe("whsec");
    expect(body.command[0]).toBe("bash");
    expect(body.command[2]).toContain("python -m training.run_job");
  });

  it("throws when HF API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 402 })),
    );
    const payload = buildTrainJobPayload({
      locationId: LOCATION_ID,
      examples: makeExampleBatch(),
      webhookBaseUrl: "https://app.example.com",
    });
    await expect(startHuggingFaceJob(payload)).rejects.toThrow(/402/);
  });
});

describe("trainHelpers — location AI state updates", () => {
  it("writes ai_status and date_modified", async () => {
    const updates: any[] = [];
    const admin = {
      from: (table: string) => {
        expect(table).toBe("locations");
        return {
          update: (fields: unknown) => {
            updates.push(fields);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    } as any;

    await updateLocationAiState(admin, LOCATION_ID, {
      ai_status: "local",
      adapter_url: "https://blob/adapters/x/",
      adapter_version: "2026-01-01T00:00:00Z",
      ai_train_error: null,
      ai_train_job_id: JOB_ID,
    });

    expect(updates[0].ai_status).toBe("local");
    expect(updates[0].adapter_url).toContain("adapters");
    expect(updates[0].date_modified).toMatch(/^\d{4}-/);
  });
});
