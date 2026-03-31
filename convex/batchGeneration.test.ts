import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: vi.fn(),
}));

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseExpandedSyntheticUserResponse } from "./batchGeneration/expansion";
import schema from "./schema";
import { generateWithModel } from "../packages/ai/src/index";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
  "./batchGeneration.ts": () => import("./batchGeneration"),
  "./batchGenerationAction.ts": () => import("./batchGenerationAction"),
  "./personaConfigs.ts": () => import("./personaConfigs"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);
const mockedGenerateWithModel = vi.mocked(generateWithModel);
const batchGenerationApi = (api as any).batchGeneration;
const batchGenerationActionApi = (internal as any).batchGenerationAction;

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

beforeEach(() => {
  vi.useFakeTimers();
  mockedGenerateWithModel.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("batch generation", () => {
  it("coerces array tensionSeed values to a string during expansion parsing", () => {
    const fallbackAxes = [
      makeAxis({
        key: "confidence",
        label: "Confidence",
        weight: 2,
      }),
    ];

    const parsed = parseExpandedSyntheticUserResponse(
      fencedJson({
        name: "Array Tension Persona",
        firstPersonBio:
          "I want to understand every checkout step before I commit so I can avoid making a mistake I have to unwind later.",
        behaviorRules: [
          "Read labels carefully before typing.",
          "Pause when the page changes unexpectedly.",
        ],
        tensionSeed: ["Concerned about hidden fees", "Needs reassurance"],
      }),
      fallbackAxes,
    );

    expect(parsed.tensionSeed).toBe(
      "Concerned about hidden fees; Needs reassurance",
    );
    expect(parsed.axes).toEqual(fallbackAxes);
  });

  it("uses fallback axes when the expansion response omits axes", () => {
    const fallbackAxes = [
      makeAxis({
        key: "confidence",
        label: "Confidence",
        description: "Confidence using new technology",
        weight: 2,
      }),
      makeAxis({
        key: "patience",
        label: "Patience",
        description: "Tolerance for friction",
        weight: 3,
      }),
    ];

    const parsed = parseExpandedSyntheticUserResponse(
      fencedJson({
        name: "Fallback Axes Persona",
        firstPersonBio:
          "I compare the current step with what I expected so I can stay confident that the flow is still on track.",
        behaviorRules: [
          "Scan headings before acting.",
          "Look for helper copy before continuing.",
        ],
        tensionSeed: "Worries that the flow could change without warning.",
      }),
      fallbackAxes,
    );

    expect(parsed.axes).toEqual(fallbackAxes);
  });

  it("uses fallback axes even when the expansion response returns partial axes", () => {
    const fallbackAxes = [
      makeAxis({
        key: "confidence",
        label: "Confidence",
        description: "Confidence using new technology",
        weight: 2,
      }),
      makeAxis({
        key: "patience",
        label: "Patience",
        description: "Tolerance for friction",
        weight: 3,
      }),
    ];

    const parsed = parseExpandedSyntheticUserResponse(
      fencedJson({
        name: "Partial Axes Persona",
        firstPersonBio:
          "I stay with the task when the page explains itself clearly, but unexpected copy changes make me hesitate before moving on.",
        behaviorRules: [
          "Read helper text before clicking.",
          "Re-check the previous step when labels shift.",
        ],
        tensionSeed: "Gets uneasy when instructions feel inconsistent.",
        axes: [
          {
            key: "confidence",
            label: "Confidence",
            description: "Confidence using new technology",
            lowAnchor: "Needs reassurance",
            midAnchor: "Gets by with support",
            highAnchor: "Explores independently",
          },
        ],
      }),
      fallbackAxes,
    );

    expect(parsed.axes).toEqual(fallbackAxes);
  });

  it("startBatchGeneration rejects non-draft configs, zero-axis configs, oversized runs, and concurrent runs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const publishedConfigId = await createDraftConfig(t, { axisCount: 2 });
    await insertManualSyntheticUser(t, publishedConfigId);
    await asResearcher.mutation(api.personaConfigs.publish, {
      configId: publishedConfigId,
    });

    await expect(
      asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
        configId: publishedConfigId,
        levelsPerAxis: 3,
      }),
    ).rejects.toThrow(/draft/i);

    const zeroAxisConfigId = await insertConfig(t, {
      sharedAxes: [],
    });

    await expect(
      asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
        configId: zeroAxisConfigId,
        levelsPerAxis: 3,
      }),
    ).rejects.toThrow("At least one axis required");

    const oversizedConfigId = await createDraftConfig(t, { axisCount: 5 });

    await expect(
      asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
        configId: oversizedConfigId,
        levelsPerAxis: 7,
      }),
    ).rejects.toThrow(/exceeds cap/i);

    const activeConfigId = await createDraftConfig(t, { axisCount: 2 });
    mockedGenerateWithModel.mockResolvedValue(makeExpansionResult());

    await asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
      configId: activeConfigId,
      levelsPerAxis: 3,
    });

    await expect(
      asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
        configId: activeConfigId,
        levelsPerAxis: 3,
      }),
    ).rejects.toThrow(/active batch generation/i);
  });

  it("creates generated stubs, expands users one at a time, and returns progress for the latest run", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftConfig(t, {
      axes: [
        makeAxis({
          key: "confidence",
          label: "Confidence",
          description: "Confidence using new technology",
          weight: 2,
        }),
        makeAxis({
          key: "patience",
          label: "Patience",
          description: "Tolerance for friction",
          weight: 3,
        }),
      ],
    });
    mockedGenerateWithModel.mockImplementation(async () =>
      makeExpansionResult({
        text: fencedJson({
          name: `Generated Persona ${mockedGenerateWithModel.mock.calls.length}`,
          firstPersonBio:
            "I compare every screen against my mental checklist before I continue so I can avoid mistakes and keep the task moving with confidence.",
          behaviorRules: [
            "Read every section heading before clicking.",
            "Pause when the flow introduces unexpected wording.",
            "Look for reassurance before submitting information.",
          ],
          tensionSeed: "Worries that a rushed click could create a costly mistake.",
          axes: [
            {
              key: "confidence",
              label: "Confidence",
              description: "Confidence using new technology",
              lowAnchor: "Needs reassurance",
              midAnchor: "Gets by with support",
              highAnchor: "Explores independently",
            },
            {
              key: "patience",
              label: "Patience",
              description: "Tolerance for friction",
              lowAnchor: "Bails quickly",
              midAnchor: "Keeps trying",
              highAnchor: "Persists for a long time",
            },
          ],
        }),
      }),
    );

    const runId = await asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
      configId,
      levelsPerAxis: 3,
    });

    const initialRun = await asResearcher.query(batchGenerationApi.getBatchGenerationRun, {
      configId,
    });
    const pendingUsers = await listGeneratedUsersForConfig(t, configId);

    expect(initialRun).toMatchObject({
      _id: runId,
      configId,
      status: "pending",
      totalCount: 9,
      completedCount: 0,
      failedCount: 0,
    });
    expect(pendingUsers).toHaveLength(9);
    expect(
      pendingUsers.every(
        (syntheticUser) =>
          syntheticUser.sourceType === "generated" &&
          syntheticUser.generationStatus === "pending_expansion",
      ),
    ).toBe(true);

    await t.action(batchGenerationActionApi.expandNextUser, { runId });

    const runningRun = await asResearcher.query(batchGenerationApi.getBatchGenerationRun, {
      configId,
    });
    const usersAfterOneExpansion = await listGeneratedUsersForConfig(t, configId);
    const expandedUser = usersAfterOneExpansion.find(
      (syntheticUser) => syntheticUser.generationStatus === "completed",
    );

    expect(runningRun).toMatchObject({
      _id: runId,
      status: "running",
      totalCount: 9,
      completedCount: 1,
      failedCount: 0,
    });
    expect(expandedUser).toMatchObject({
      sourceType: "generated",
      generationStatus: "completed",
      name: "Generated Persona 1",
      tensionSeed: "Worries that a rushed click could create a costly mistake.",
    });
    expect(expandedUser?.firstPersonBio).toEqual(expect.any(String));
    const expandedBio = expandedUser?.firstPersonBio ?? "";
    expect(expandedBio.length).toBeGreaterThan(20);
    expect(expandedUser?.behaviorRules).toEqual([
      "Read every section heading before clicking.",
      "Pause when the flow introduces unexpected wording.",
      "Look for reassurance before submitting information.",
    ]);
    expect(expandedUser?.axisValues).toHaveLength(2);
    expect(expandedUser?.axes.map((axis) => axis.weight)).toEqual([2, 3]);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const completedRun = await asResearcher.query(batchGenerationApi.getBatchGenerationRun, {
      configId,
    });
    const completedUsers = await listGeneratedUsersForConfig(t, configId);

    expect(completedRun).toMatchObject({
      _id: runId,
      status: "completed",
      totalCount: 9,
      completedCount: 9,
      failedCount: 0,
    });
    expect(completedRun?.completedAt).toEqual(expect.any(Number));
    expect(
      completedUsers.every(
        (syntheticUser) =>
          syntheticUser.sourceType === "generated" &&
          syntheticUser.generationStatus === "completed" &&
          typeof syntheticUser.name === "string" &&
          syntheticUser.name.length > 0 &&
          typeof syntheticUser.firstPersonBio === "string" &&
          syntheticUser.firstPersonBio.length > 0 &&
          Array.isArray(syntheticUser.behaviorRules) &&
          syntheticUser.behaviorRules.length > 0 &&
          typeof syntheticUser.tensionSeed === "string" &&
          syntheticUser.tensionSeed.length > 0,
      ),
    ).toBe(true);
    expect(mockedGenerateWithModel).toHaveBeenCalledTimes(9);
  });

  it("continues after a failed expansion and marks the run partially_failed", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftConfig(t, { axisCount: 1 });

    mockedGenerateWithModel
      .mockResolvedValueOnce(
        {
          text: fencedJson("not valid json"),
        } as unknown as Awaited<ReturnType<typeof generateWithModel>>,
      )
      .mockResolvedValueOnce(makeExpansionResult())
      .mockResolvedValue(makeExpansionResult());

    const runId = await asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
      configId,
      levelsPerAxis: 3,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    const generatedUsers = await listGeneratedUsersForConfig(t, configId);
    const failedUser = generatedUsers.find(
      (syntheticUser) => syntheticUser.generationStatus === "failed",
    );
    const completedUsers = generatedUsers.filter(
      (syntheticUser) => syntheticUser.generationStatus === "completed",
    );

    expect(run).toMatchObject({
      status: "partially_failed",
      totalCount: 3,
      completedCount: 2,
      failedCount: 1,
    });
    expect(failedUser?.sourceType).toBe("generated");
    expect(failedUser?.generationError).toMatch(/Failed to parse generated synthetic user JSON/);
    expect(completedUsers).toHaveLength(2);
  });

  it("marks the run failed when every generated user expansion fails", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftConfig(t, { axisCount: 1 });

    mockedGenerateWithModel.mockRejectedValue(new Error("model unavailable"));

    const runId = await asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
      configId,
      levelsPerAxis: 3,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    const generatedUsers = await listGeneratedUsersForConfig(t, configId);

    expect(run).toMatchObject({
      status: "failed",
      totalCount: 3,
      completedCount: 0,
      failedCount: 3,
    });
    expect(
      generatedUsers.every(
        (syntheticUser) => syntheticUser.generationStatus === "failed",
      ),
    ).toBe(true);
  });

  it("regenerates a generated synthetic user while keeping its axis values", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftConfig(t, { axisCount: 2 });

    mockedGenerateWithModel.mockResolvedValueOnce(
      makeExpansionResult({
        text: fencedJson({
          name: "Original Persona",
          firstPersonBio:
            "I like to move steadily through the flow, but I hesitate when the page stops explaining why it needs more information from me.",
          behaviorRules: [
            "Read helper text before filling a field.",
            "Stop when error messages appear.",
          ],
          tensionSeed: "Feels uneasy when a form asks for sensitive details too early.",
        }),
      }),
    );

    await asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
      configId,
      levelsPerAxis: {
        axis_1: 3,
        axis_2: 3,
      },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [generatedUser] = await listGeneratedUsersForConfig(t, configId);
    const originalAxisValues = generatedUser?.axisValues;

    mockedGenerateWithModel.mockResolvedValueOnce(
      makeExpansionResult({
        text: fencedJson({
          name: "Regenerated Persona",
          firstPersonBio:
            "I recover quickly after small mistakes, but I still slow down whenever a checkout flow changes the order of information unexpectedly.",
          behaviorRules: [
            "Compare the current step with the previous step before continuing.",
            "Use page chrome and headings to confirm location.",
            "Re-read summary text before final submission.",
          ],
          tensionSeed: "Gets suspicious when a familiar checkout pattern suddenly changes.",
        }),
      }),
    );

    await asResearcher.mutation(batchGenerationApi.regenerateSyntheticUser, {
      syntheticUserId: generatedUser!._id,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const regeneratedUser = await asResearcher.query(api.personaConfigs.getSyntheticUser, {
      syntheticUserId: generatedUser!._id,
    });

    expect(regeneratedUser).toMatchObject({
      _id: generatedUser!._id,
      name: "Regenerated Persona",
      generationStatus: "completed",
      sourceType: "generated",
      tensionSeed: "Gets suspicious when a familiar checkout pattern suddenly changes.",
    });
    expect(regeneratedUser?.axisValues).toEqual(originalAxisValues);
    expect(regeneratedUser?.firstPersonBio).not.toBe(generatedUser?.firstPersonBio);
  });

  it("preserves the existing generated profile when regeneration fails", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftConfig(t, { axisCount: 2 });

    mockedGenerateWithModel.mockResolvedValueOnce(
      makeExpansionResult({
        text: fencedJson({
          name: "Stable Persona",
          firstPersonBio:
            "I move carefully through new flows and rely on familiar patterns to stay oriented when a form introduces unexpected questions.",
          behaviorRules: [
            "Read helper text before acting.",
            "Cross-check labels against expectations.",
          ],
          tensionSeed: "Gets uneasy when the flow asks for personal data before explaining why.",
        }),
      }),
    );

    await asResearcher.mutation(batchGenerationApi.startBatchGeneration, {
      configId,
      levelsPerAxis: 3,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [generatedUser] = await listGeneratedUsersForConfig(t, configId);
    expect(generatedUser).toBeDefined();

    mockedGenerateWithModel.mockRejectedValueOnce(new Error("regeneration failed"));

    await asResearcher.mutation(batchGenerationApi.regenerateSyntheticUser, {
      syntheticUserId: generatedUser!._id,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const preservedUser = await asResearcher.query(api.personaConfigs.getSyntheticUser, {
      syntheticUserId: generatedUser!._id,
    });

    expect(preservedUser).toMatchObject({
      _id: generatedUser!._id,
      name: "Stable Persona",
      generationStatus: "completed",
      generationError: "regeneration failed",
      sourceType: "generated",
      firstPersonBio:
        "I move carefully through new flows and rely on familiar patterns to stay oriented when a form introduces unexpected questions.",
      behaviorRules: [
        "Read helper text before acting.",
        "Cross-check labels against expectations.",
      ],
      tensionSeed:
        "Gets uneasy when the flow asks for personal data before explaining why.",
    });
    expect(preservedUser?.axisValues).toEqual(generatedUser?.axisValues);
  });
});

function makeAxis(overrides: Partial<AxisInput> = {}): AxisInput {
  return {
    key: "axis_1",
    label: "Axis 1",
    description: "Description for axis 1",
    lowAnchor: "Low 1",
    midAnchor: "Mid 1",
    highAnchor: "High 1",
    weight: 1,
    ...overrides,
  };
}

async function createDraftConfig(
  t: ReturnType<typeof createTest>,
  options: {
    axisCount?: number;
    axes?: AxisInput[];
  } = {},
) {
  const asResearcher = t.withIdentity(researchIdentity);

  return await asResearcher.mutation(api.personaConfigs.createDraft, {
    config: {
      name: "Batch Generation Config",
      description: "Config for batch generation tests",
      context: "Checkout validation",
      sharedAxes:
        options.axes ??
        Array.from({ length: options.axisCount ?? 2 }, (_, index) =>
          makeAxis({
            key: `axis_${index + 1}`,
            label: `Axis ${index + 1}`,
            description: `Description for axis ${index + 1}`,
            lowAnchor: `Low ${index + 1}`,
            midAnchor: `Mid ${index + 1}`,
            highAnchor: `High ${index + 1}`,
          }),
        ),
    },
  });
}

async function insertConfig(
  t: ReturnType<typeof createTest>,
  overrides: Partial<{
    sharedAxes: AxisInput[];
    status: "draft" | "published" | "archived";
  }> = {},
) {
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      name: "Inserted Config",
      description: "Inserted config",
      context: "Inserted context",
      sharedAxes: overrides.sharedAxes ?? [makeAxis()],
      version: 1,
      status: overrides.status ?? "draft",
      orgId: researchIdentity.tokenIdentifier,
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function insertManualSyntheticUser(
  t: ReturnType<typeof createTest>,
  configId: Id<"personaConfigs">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      name: "Manual User",
      summary: "Existing manual synthetic user",
      axes: [makeAxis()],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: ["Evidence"],
    }),
  );
}

async function listGeneratedUsersForConfig(
  t: ReturnType<typeof createTest>,
  configId: Id<"personaConfigs">,
) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .collect(),
  );
}

function makeExpansionResult(overrides: { text?: string } = {}) {
  return {
    text: JSON.stringify({
      name: "Generated Persona",
      firstPersonBio:
        "I want every step to feel clearly explained, so I pause to compare the page copy with what I expected before I continue toward checkout completion.",
      behaviorRules: [
        "Scan headings before acting.",
        "Pause when labels look unfamiliar.",
        "Use helper copy to confirm the next move.",
      ],
      tensionSeed: "Feels nervous when the flow suddenly changes tone.",
    }),
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}

function fencedJson(value: unknown) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return `\`\`\`json\n${json}\n\`\`\``;
}

type AxisInput = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: number;
};
