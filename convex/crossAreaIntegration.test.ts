import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
  "./personaConfigs.ts": () => import("./personaConfigs"),
  "./studies.ts": () => import("./studies"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

describe("cross-area integration", () => {
  it("publishing a config with generated synthetic users upserts shared axes into the axis library", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        sharedAxes: [
          makeAxis({
            key: "checkout_confidence",
            label: "Checkout Confidence",
            description: "Confidence completing checkout without help.",
            lowAnchor: "Needs reassurance often",
            midAnchor: "Can recover from small hiccups",
            highAnchor: "Moves forward confidently",
          }),
          makeAxis({
            key: "speed_preference",
            label: "Speed Preference",
            description: "How quickly the user wants to finish the task.",
            lowAnchor: "Takes it slow",
            midAnchor: "Balances speed with certainty",
            highAnchor: "Optimizes for speed",
            weight: 2,
          }),
        ],
      }),
    });

    await insertGeneratedSyntheticUser(t, configId, {
      axes: [
        makeAxis({
          key: "checkout_confidence",
          label: "Checkout Confidence",
          description: "Confidence completing checkout without help.",
          lowAnchor: "Needs reassurance often",
          midAnchor: "Can recover from small hiccups",
          highAnchor: "Moves forward confidently",
        }),
        makeAxis({
          key: "speed_preference",
          label: "Speed Preference",
          description: "How quickly the user wants to finish the task.",
          lowAnchor: "Takes it slow",
          midAnchor: "Balances speed with certainty",
          highAnchor: "Optimizes for speed",
          weight: 2,
        }),
      ],
      axisValues: [
        { key: "checkout_confidence", value: 1 },
        { key: "speed_preference", value: -1 },
      ],
    });

    await asResearcher.mutation(api.personaConfigs.publish, { configId });

    const axisDefinitions = await getAxisDefinitionsForOrg(
      t,
      researchIdentity.tokenIdentifier,
    );

    expect(axisDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "checkout_confidence",
          creationSource: "pack_publish",
          usageCount: 1,
          orgId: researchIdentity.tokenIdentifier,
        }),
        expect.objectContaining({
          key: "speed_preference",
          creationSource: "pack_publish",
          usageCount: 1,
          orgId: researchIdentity.tokenIdentifier,
        }),
      ]),
    );
  });

  it("creates a study from a published config that contains generated synthetic users", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });

    await insertGeneratedSyntheticUser(t, configId);
    await asResearcher.mutation(api.personaConfigs.publish, { configId });

    const createdStudy = await asResearcher.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: configId,
        name: "Generated cohort checkout study",
        description: "Validates a published config backed by generated synthetic users.",
        taskSpec: makeTaskSpec(),
        runBudget: 50,
        activeConcurrency: 3,
      },
    });

    expect(createdStudy).toMatchObject({
      personaConfigId: configId,
      name: "Generated cohort checkout study",
      status: "draft",
      orgId: researchIdentity.tokenIdentifier,
    });
  });

  it("listSyntheticUsers returns manual, generated, and transcript-derived users together", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const sharedAxes = [
      makeAxis({
        key: "confidence_level",
        label: "Confidence Level",
        description: "Comfort finishing the task without help.",
        lowAnchor: "Needs hand-holding",
        midAnchor: "Can continue with light guidance",
        highAnchor: "Comfortable figuring it out solo",
      }),
    ];
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({ sharedAxes }),
    });

    await insertManualSyntheticUser(t, configId, { axes: sharedAxes });
    await insertGeneratedSyntheticUser(t, configId, {
      axes: sharedAxes,
      axisValues: [{ key: "confidence_level", value: 0.75 }],
    });
    await asResearcher.mutation(api.personaConfigs.applyTranscriptDerivedSyntheticUsers, {
      configId,
      input: {
        sharedAxes,
        archetypes: [
          {
            name: "Transcript archetype",
            summary: "Wants to double-check pricing before continuing.",
            axisValues: [{ key: "confidence_level", value: -0.4 }],
            contributingTranscriptIds: ["transcript-1"],
            evidenceSnippets: [
              {
                transcriptId: "transcript-1",
                quote: "I wanted to confirm the total before I clicked continue.",
              },
            ],
          },
        ],
      },
    });

    const syntheticUsers = await asResearcher.query(api.personaConfigs.listSyntheticUsers, {
      configId,
    });

    expect(syntheticUsers).toHaveLength(3);
    expect(
      syntheticUsers
        .map((syntheticUser: Doc<"syntheticUsers">) => syntheticUser.sourceType)
        .sort(),
    ).toEqual(["generated", "manual", "transcript_derived"]);
    expect(syntheticUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "manual",
          name: "Manual synthetic user",
        }),
        expect.objectContaining({
          sourceType: "generated",
          name: "Generated synthetic user",
          generationStatus: "completed",
        }),
        expect.objectContaining({
          sourceType: "transcript_derived",
          name: "Transcript archetype",
          sourceRefs: ["transcript-1"],
          evidenceSnippets: [
            "I wanted to confirm the total before I clicked continue.",
          ],
        }),
      ]),
    );
  });
});

type AxisInput = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: number;
};

type CreateDraftInput = {
  name: string;
  description: string;
  context: string;
  sharedAxes: AxisInput[];
};

type StudyTaskSpecInput = {
  scenario: string;
  goal: string;
  startingUrl: string;
  allowedDomains: string[];
  allowedActions: ("goto" | "click" | "type" | "finish")[];
  forbiddenActions: ("payment_submission")[];
  successCriteria: string[];
  stopConditions: string[];
  maxSteps: number;
  maxDurationSec: number;
  environmentLabel: string;
  locale: string;
  viewport: { width: number; height: number };
};

const makeAxis = (overrides: Partial<AxisInput> = {}): AxisInput => ({
  key: "digital_confidence",
  label: "Digital Confidence",
  description: "Comfort using digital products",
  lowAnchor: "Very hesitant",
  midAnchor: "Comfortable enough",
  highAnchor: "Power user",
  weight: 1,
  ...overrides,
});

const makeCreateDraftInput = (
  overrides: Partial<CreateDraftInput> = {},
): CreateDraftInput => ({
  name: "Cross-area integration config",
  description: "Used to validate generation, publishing, and studies together.",
  context: "Checkout validation",
  sharedAxes: [makeAxis()],
  ...overrides,
});

const makeTaskSpec = (
  overrides: Partial<StudyTaskSpecInput> = {},
): StudyTaskSpecInput => ({
  scenario: "Purchase a pair of running shoes.",
  goal: "Complete checkout without assistance.",
  startingUrl: "https://example.com/products/running-shoes",
  allowedDomains: ["example.com"],
  allowedActions: ["goto", "click", "type", "finish"],
  forbiddenActions: ["payment_submission"],
  successCriteria: ["Order confirmation is visible"],
  stopConditions: ["The user leaves the allowed domain"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
  ...overrides,
});

async function insertManualSyntheticUser(
  t: ReturnType<typeof createTest>,
  configId: Id<"personaConfigs">,
  overrides: Partial<Doc<"syntheticUsers">> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      name: "Manual synthetic user",
      summary: "Manually authored synthetic user",
      axes: [makeAxis()],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: ["Checks every total before continuing."],
      ...overrides,
    }),
  );
}

async function insertGeneratedSyntheticUser(
  t: ReturnType<typeof createTest>,
  configId: Id<"personaConfigs">,
  overrides: Partial<Doc<"syntheticUsers">> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      name: "Generated synthetic user",
      summary: "Generated cohort member",
      axes: [makeAxis()],
      axisValues: [{ key: "digital_confidence", value: 1 }],
      sourceType: "generated",
      generationStatus: "completed",
      firstPersonBio:
        "I move quickly through familiar flows and pause when totals or labels look unfamiliar.",
      behaviorRules: [
        "Scans headings before acting.",
        "Pauses on unexpected totals.",
        "Looks for reassuring copy before submitting.",
      ],
      tensionSeed: "Unexpected fees make this user hesitate.",
      sourceRefs: [],
      evidenceSnippets: [],
      ...overrides,
    }),
  );
}

async function getAxisDefinitionsForOrg(
  t: ReturnType<typeof createTest>,
  orgId: string,
) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("axisDefinitions").collect()).filter(
      (axisDefinition) => axisDefinition.orgId === orgId,
    ),
  );
}
