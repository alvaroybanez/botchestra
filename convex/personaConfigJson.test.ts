import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
  "./schema.ts": () => import("./schema"),
  "./personaConfigs.ts": () => import("./personaConfigs"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
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

const makeSyntheticUser = (
  index: number,
  overrides: Partial<SyntheticUserJson> = {},
): SyntheticUserJson => ({
  name: `Synthetic User ${index + 1}`,
  summary: `Summary for synthetic user ${index + 1}`,
  axes: [
    makeAxis(),
    makeAxis({
      key: "patience",
      label: "Patience",
      description: "Tolerance for friction",
      lowAnchor: "Leaves quickly",
      midAnchor: "Sticks around briefly",
      highAnchor: "Persistent finisher",
      weight: 0.6,
    }),
  ],
  evidenceSnippets: [
    `Evidence snippet A${index + 1}`,
    `Evidence snippet B${index + 1}`,
  ],
  notes: `Notes for synthetic user ${index + 1}`,
  ...overrides,
});

const makeImportPayload = (
  overrides: Partial<PersonaConfigJson> = {},
): PersonaConfigJson => ({
  name: "Imported Persona Configuration",
  description: "Config loaded from JSON",
  context: "Checkout usability study",
  status: "published",
  sharedAxes: [
    makeAxis(),
    makeAxis({
      key: "patience",
      label: "Patience",
      description: "Tolerance for friction",
      lowAnchor: "Leaves quickly",
      midAnchor: "Sticks around briefly",
      highAnchor: "Persistent finisher",
      weight: 0.6,
    }),
  ],
  syntheticUsers: [makeSyntheticUser(0), makeSyntheticUser(1)],
  ...overrides,
});

describe("persona configuration JSON import/export", () => {
  it("imports valid JSON into a new draft config regardless of source status", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const importedPackId = await asResearcher.action(api.personaConfigs.importJson, {
      json: JSON.stringify(makeImportPayload({ status: "archived" })),
    });

    const importedPack = await asResearcher.query(api.personaConfigs.get, {
      configId: importedPackId,
    });
    const syntheticUsers = await asResearcher.query(
      api.personaConfigs.listSyntheticUsers,
      { configId: importedPackId },
    );

    expect(importedPack).toMatchObject({
      name: "Imported Persona Configuration",
      description: "Config loaded from JSON",
      context: "Checkout usability study",
      status: "draft",
      version: 1,
      createdBy: researchIdentity.tokenIdentifier,
      orgId: researchIdentity.tokenIdentifier,
    });
    expect(importedPack?.sharedAxes).toEqual(makeImportPayload().sharedAxes);
    expect(syntheticUsers).toHaveLength(2);
    expect(syntheticUsers).toMatchObject([
      {
        name: "Synthetic User 1",
        summary: "Summary for synthetic user 1",
        sourceType: "json_import",
        evidenceSnippets: ["Evidence snippet A1", "Evidence snippet B1"],
        notes: "Notes for synthetic user 1",
      },
      {
        name: "Synthetic User 2",
        summary: "Summary for synthetic user 2",
        sourceType: "json_import",
        evidenceSnippets: ["Evidence snippet A2", "Evidence snippet B2"],
        notes: "Notes for synthetic user 2",
      },
    ]);
  });

  it("rejects invalid JSON structure and invalid axis definitions without writing data", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: JSON.stringify({
          description: "Missing name",
          context: "Checkout usability study",
          sharedAxes: [makeAxis()],
          syntheticUsers: [makeSyntheticUser(0)],
        }),
      }),
    ).rejects.toThrow("name");

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: JSON.stringify({
          ...makeImportPayload(),
          sharedAxes: "not-an-array",
        }),
      }),
    ).rejects.toThrow("sharedAxes");

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: JSON.stringify({
          ...makeImportPayload(),
          sharedAxes: [
            {
              ...makeAxis(),
              lowAnchor: undefined,
            },
          ],
        }),
      }),
    ).rejects.toThrow("lowAnchor");

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: JSON.stringify({
          ...makeImportPayload(),
          sharedAxes: [
            {
              ...makeAxis(),
              description: 123,
            },
          ],
        }),
      }),
    ).rejects.toThrow("description");

    const configs = await t.run(async (ctx) => ctx.db.query("personaConfigs").collect());
    const syntheticUsers = await t.run(async (ctx) =>
      ctx.db.query("syntheticUsers").collect(),
    );

    expect(configs).toHaveLength(0);
    expect(syntheticUsers).toHaveLength(0);
  });

  it("rejects synthetic users whose axis keys are not present in sharedAxes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: JSON.stringify(
          makeImportPayload({
            syntheticUsers: [
              makeSyntheticUser(0, {
                axes: [
                  makeAxis({
                    key: "missing_axis",
                    label: "Missing axis",
                    description: "Not included in shared axes",
                  }),
                ],
              }),
            ],
          }),
        ),
      }),
    ).rejects.toThrow(/shared config axis keys/i);

    const configs = await t.run(async (ctx) => ctx.db.query("personaConfigs").collect());
    const syntheticUsers = await t.run(async (ctx) =>
      ctx.db.query("syntheticUsers").collect(),
    );

    expect(configs).toHaveLength(0);
    expect(syntheticUsers).toHaveLength(0);
  });

  it("rejects malformed JSON before validation or writes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: "{not json}",
      }),
    ).rejects.toThrow(/json/i);

    await expect(
      asResearcher.action(api.personaConfigs.importJson, {
        json: "",
      }),
    ).rejects.toThrow(/json/i);

    const configs = await t.run(async (ctx) => ctx.db.query("personaConfigs").collect());
    expect(configs).toHaveLength(0);
  });

  it("imports a large config with 10 synthetic users and preserves evidence snippets", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const largePayload = makeImportPayload({
      syntheticUsers: Array.from({ length: 10 }, (_, index) =>
        makeSyntheticUser(index, {
          evidenceSnippets: Array.from(
            { length: 20 },
            (_, snippetIndex) =>
              `Proto ${index + 1} evidence snippet ${snippetIndex + 1}`,
          ),
        }),
      ),
    });

    const importedPackId = await asResearcher.action(api.personaConfigs.importJson, {
      json: JSON.stringify(largePayload),
    });
    const syntheticUsers = await asResearcher.query(
      api.personaConfigs.listSyntheticUsers,
      { configId: importedPackId },
    );

    expect(syntheticUsers).toHaveLength(10);
    expect(syntheticUsers[0]?.evidenceSnippets).toHaveLength(20);
    expect(syntheticUsers[9]?.evidenceSnippets[19]).toBe(
      "Proto 10 evidence snippet 20",
    );
  });

  it("exports draft, published, and archived configs including synthetic users but excluding variants", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const draftPackId = await createDraftPack(t, "Draft export config");
    const publishedPackId = await createPublishedPack(t, "Published export config");
    const archivedPackId = await createArchivedPack(t, "Archived export config");

    await insertVariantForPack(t, draftPackId);

    for (const [configId, expectedStatus] of [
      [draftPackId, "draft"],
      [publishedPackId, "published"],
      [archivedPackId, "archived"],
    ] as const) {
      const exported = JSON.parse(
        await asResearcher.action(api.personaConfigs.exportJson, { configId }),
      ) as PersonaConfigJson & Record<string, unknown>;

      expect(exported.status).toBe(expectedStatus);
      expect(exported.syntheticUsers).toHaveLength(1);
      expect(exported.syntheticUsers[0]).toMatchObject({
        name: `${expectedStatus} synthetic user`,
        evidenceSnippets: [`${expectedStatus} evidence`],
      });
      expect(exported.syntheticUsers[0]).not.toHaveProperty("sourceType");
      expect(exported).not.toHaveProperty("variants");
      expect(exported).not.toHaveProperty("personaVariants");
    }
  });

  it("round-trips export -> import -> export with fidelity", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const originalPackId = await createPublishedPack(t, "Round-trip config", {
      description: "Round-trip description",
      context: "Round-trip context",
      syntheticUser: {
        name: "Round-trip synthetic user",
        summary: "Summary preserved across export/import",
        evidenceSnippets: ["Quote 1", "Quote 2"],
        notes: "Detailed notes",
      },
    });

    const originalExport = JSON.parse(
      await asResearcher.action(api.personaConfigs.exportJson, {
        configId: originalPackId,
      }),
    ) as PersonaConfigJson;

    const reimportedPackId = await asResearcher.action(api.personaConfigs.importJson, {
      json: JSON.stringify(originalExport),
    });

    const reimportedExport = JSON.parse(
      await asResearcher.action(api.personaConfigs.exportJson, {
        configId: reimportedPackId,
      }),
    ) as PersonaConfigJson;

    expect(reimportedExport).toEqual({
      ...originalExport,
      status: "draft",
    });
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

type SyntheticUserJson = {
  name: string;
  summary: string;
  axes: AxisInput[];
  evidenceSnippets: string[];
  notes?: string;
};

type PersonaConfigJson = {
  name: string;
  description: string;
  context: string;
  status?: "draft" | "published" | "archived";
  sharedAxes: AxisInput[];
  syntheticUsers: SyntheticUserJson[];
};

type TestInstance = ReturnType<typeof createTest>;

async function createDraftPack(
  t: TestInstance,
  name: string,
  overrides: {
    description?: string;
    context?: string;
    syntheticUser?: Partial<SyntheticUserJson>;
  } = {},
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
    config: {
      name,
      description: overrides.description ?? `${name} description`,
      context: overrides.context ?? `${name} context`,
      sharedAxes: [
        makeAxis(),
        makeAxis({
          key: "patience",
          label: "Patience",
          description: "Tolerance for friction",
          lowAnchor: "Leaves quickly",
          midAnchor: "Sticks around briefly",
          highAnchor: "Persistent finisher",
          weight: 0.6,
        }),
      ],
    },
  });

  await asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
    configId,
    syntheticUser: {
      name: overrides.syntheticUser?.name ?? "draft synthetic user",
      summary:
        overrides.syntheticUser?.summary ?? "Summary for the exported synthetic user",
      axes: overrides.syntheticUser?.axes ?? [
        makeAxis(),
        makeAxis({
          key: "patience",
          label: "Patience",
          description: "Tolerance for friction",
          lowAnchor: "Leaves quickly",
          midAnchor: "Sticks around briefly",
          highAnchor: "Persistent finisher",
          weight: 0.6,
        }),
      ],
      evidenceSnippets:
        overrides.syntheticUser?.evidenceSnippets ?? ["draft evidence"],
      ...(overrides.syntheticUser?.notes !== undefined
        ? { notes: overrides.syntheticUser.notes }
        : {}),
    },
  });

  return configId;
}

async function createPublishedPack(
  t: TestInstance,
  name: string,
  overrides: {
    description?: string;
    context?: string;
    syntheticUser?: Partial<SyntheticUserJson>;
  } = {},
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await createDraftPack(t, name, {
    ...overrides,
    syntheticUser: {
      name: "published synthetic user",
      evidenceSnippets: ["published evidence"],
      ...overrides.syntheticUser,
    },
  });

  await asResearcher.mutation(api.personaConfigs.publish, { configId });
  return configId;
}

async function createArchivedPack(t: TestInstance, name: string) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await createPublishedPack(t, name, {
    syntheticUser: {
      name: "archived synthetic user",
      evidenceSnippets: ["archived evidence"],
    },
  });

  await asResearcher.mutation(api.personaConfigs.archive, { configId });
  return configId;
}

async function insertVariantForPack(
  t: TestInstance,
  configId: Id<"personaConfigs">,
) {
  await t.run(async (ctx) => {
    const syntheticUsers = await ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .take(1);

    const studyId = await ctx.db.insert("studies", {
      orgId: researchIdentity.tokenIdentifier,
      personaConfigId: configId,
      name: "Variant study",
      taskSpec: {
        scenario: "Scenario",
        goal: "Goal",
        startingUrl: "https://example.com",
        allowedDomains: ["example.com"],
        allowedActions: ["goto", "click", "type", "wait", "finish"],
        forbiddenActions: [],
        successCriteria: ["Complete the task"],
        stopConditions: ["Stop on success"],
        postTaskQuestions: ["How did it go?"],
        maxSteps: 10,
        maxDurationSec: 120,
        environmentLabel: "staging",
        locale: "en-US",
        viewport: { width: 1280, height: 720 },
      },
      runBudget: 64,
      activeConcurrency: 5,
      status: "draft",
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("personaVariants", {
      studyId,
      personaConfigId: configId,
      syntheticUserId: syntheticUsers[0]!._id,
      axisValues: [
        { key: "digital_confidence", value: 0.5 },
        { key: "patience", value: -0.2 },
      ],
      edgeScore: 0.8,
      tensionSeed: "Needs reassurance before completing checkout",
      firstPersonBio:
        "I am careful and deliberate, and I compare information carefully before I decide whether to continue with a checkout flow that feels unfamiliar.",
      behaviorRules: [
        "Read key labels carefully",
        "Pause before submitting",
        "Look for reassurance",
        "Avoid risky choices",
        "Finish when confident",
      ],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    });
  });
}
