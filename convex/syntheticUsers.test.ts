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

const makeCreateDraftInput = (
  overrides: Partial<CreateDraftInput> = {},
): CreateDraftInput => ({
  name: "E-commerce Shoppers",
  description: "Config for e-commerce checkout studies",
  context: "US online retail context",
  sharedAxes: [
    makeAxis(),
    makeAxis({
      key: "patience",
      label: "Patience",
      description: "Tolerance for friction",
    }),
  ],
  ...overrides,
});

const makeSyntheticUserInput = (
  overrides: Partial<CreateSyntheticUserInput> = {},
): CreateSyntheticUserInput => ({
  name: "Cautious shopper",
  summary: "Double-checks forms before submitting orders.",
  axes: [makeAxis(), makeAxis({ key: "patience", label: "Patience", description: "Tolerance for friction" })],
  evidenceSnippets: [
    "Prefers to verify totals twice before checkout.",
    "Reads return policy language carefully.",
  ],
  notes: "Initial draft persona",
  ...overrides,
});

describe("synthetic user CRUD", () => {
  it("creates a manual synthetic user on a draft config and returns it from queries", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);

    const syntheticUserId = await asResearcher.mutation(
      api.personaConfigs.createSyntheticUser,
      {
        configId,
        syntheticUser: makeSyntheticUserInput(),
      },
    );

    const syntheticUser = await asResearcher.query(api.personaConfigs.getSyntheticUser, {
      syntheticUserId,
    });
    const syntheticUsers = await asResearcher.query(api.personaConfigs.listSyntheticUsers, {
      configId,
    });

    expect(syntheticUser).toMatchObject({
      _id: syntheticUserId,
      configId,
      name: "Cautious shopper",
      summary: "Double-checks forms before submitting orders.",
      sourceType: "manual",
      sourceRefs: [],
      notes: "Initial draft persona",
    });
    expect(syntheticUser?.evidenceSnippets).toEqual([
      "Prefers to verify totals twice before checkout.",
      "Reads return policy language carefully.",
    ]);
    expect(
      syntheticUsers.map((item: { _id: Id<"syntheticUsers"> }) => item._id),
    ).toEqual([syntheticUserId]);
  });

  it("rejects missing required name or summary", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);

    await expect(
      asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
        configId,
        syntheticUser: makeSyntheticUserInput({ name: "" }),
      }),
    ).rejects.toThrow("Synthetic user name is required");

    await expect(
      asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
        configId,
        syntheticUser: makeSyntheticUserInput({ summary: "" }),
      }),
    ).rejects.toThrow("Synthetic user summary is required");
  });

  it("rejects synthetic user axes whose keys are not defined on the parent config", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);

    await expect(
      asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
        configId,
        syntheticUser: makeSyntheticUserInput({
          axes: [makeAxis({ key: "nonexistent_key", label: "Missing axis" })],
        }),
      }),
    ).rejects.toThrow("Synthetic user axes must reference shared config axis keys");
  });

  it("updates synthetic user fields on draft configs only", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);
    const syntheticUserId = await insertSyntheticUser(t, configId);

    await asResearcher.mutation(api.personaConfigs.updateSyntheticUser, {
      syntheticUserId,
      patch: {
        name: "Updated cautious shopper",
        summary: "Needs stronger reassurance throughout checkout.",
        axes: [makeAxis({ key: "patience", label: "Patience", description: "Tolerance for friction" })],
        evidenceSnippets: ["Abandons flows after unexpected fees."],
        notes: "Updated after interview review",
      },
    });

    const syntheticUser = await asResearcher.query(api.personaConfigs.getSyntheticUser, {
      syntheticUserId,
    });

    expect(syntheticUser).toMatchObject({
      name: "Updated cautious shopper",
      summary: "Needs stronger reassurance throughout checkout.",
      notes: "Updated after interview review",
      sourceType: "manual",
    });
    expect(
      syntheticUser?.axes.map((axis: { key: string }) => axis.key),
    ).toEqual(["patience"]);
    expect(syntheticUser?.evidenceSnippets).toEqual([
      "Abandons flows after unexpected fees.",
    ]);
  });

  it("deletes synthetic users from draft configs, including the last remaining synthetic user", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);
    const firstSyntheticUserId = await insertSyntheticUser(t, configId, {
      name: "First synthetic user",
    });
    const secondSyntheticUserId = await insertSyntheticUser(t, configId, {
      name: "Second synthetic user",
    });

    await asResearcher.mutation(api.personaConfigs.deleteSyntheticUser, {
      syntheticUserId: firstSyntheticUserId,
    });

    expect(
      await asResearcher.query(api.personaConfigs.listSyntheticUsers, { configId }),
    ).toMatchObject([{ _id: secondSyntheticUserId, name: "Second synthetic user" }]);

    await asResearcher.mutation(api.personaConfigs.deleteSyntheticUser, {
      syntheticUserId: secondSyntheticUserId,
    });

    expect(
      await asResearcher.query(api.personaConfigs.listSyntheticUsers, { configId }),
    ).toEqual([]);
    await expect(
      asResearcher.mutation(api.personaConfigs.publish, { configId }),
    ).rejects.toThrow("synthetic user");
  });

  it("rejects create, update, and delete for published or archived configs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const publishedPackId = await createPublishedPack(t);
    const archivedPackId = await createArchivedPack(t);
    const publishedSyntheticUserId = await getFirstSyntheticUserId(t, publishedPackId);
    const archivedSyntheticUserId = await getFirstSyntheticUserId(t, archivedPackId);

    await expect(
      asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
        configId: publishedPackId,
        syntheticUser: makeSyntheticUserInput(),
      }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
        configId: archivedPackId,
        syntheticUser: makeSyntheticUserInput(),
      }),
    ).rejects.toThrow(/archived/i);

    await expect(
      asResearcher.mutation(api.personaConfigs.updateSyntheticUser, {
        syntheticUserId: publishedSyntheticUserId,
        patch: { name: "Nope" },
      }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.personaConfigs.updateSyntheticUser, {
        syntheticUserId: archivedSyntheticUserId,
        patch: { name: "Nope" },
      }),
    ).rejects.toThrow(/archived/i);

    await expect(
      asResearcher.mutation(api.personaConfigs.deleteSyntheticUser, {
        syntheticUserId: publishedSyntheticUserId,
      }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.personaConfigs.deleteSyntheticUser, {
        syntheticUserId: archivedSyntheticUserId,
      }),
    ).rejects.toThrow(/archived/i);
  });

  it("preserves evidence snippets in order and enforces a maximum of 10 synthetic users per config", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);

    for (let index = 0; index < 9; index += 1) {
      await insertSyntheticUser(t, configId, {
        name: `Existing synthetic user ${index + 1}`,
      });
    }

    const tenthSyntheticUserId = await asResearcher.mutation(
      api.personaConfigs.createSyntheticUser,
      {
        configId,
        syntheticUser: makeSyntheticUserInput({
          name: "Tenth synthetic user",
          evidenceSnippets: ["Snippet 1", "Snippet 2", "Snippet 3"],
        }),
      },
    );

    const tenthSyntheticUser = await asResearcher.query(api.personaConfigs.getSyntheticUser, {
      syntheticUserId: tenthSyntheticUserId,
    });

    expect(tenthSyntheticUser?.evidenceSnippets).toEqual([
      "Snippet 1",
      "Snippet 2",
      "Snippet 3",
    ]);

    await expect(
      asResearcher.mutation(api.personaConfigs.createSyntheticUser, {
        configId,
        syntheticUser: makeSyntheticUserInput({ name: "Eleventh synthetic user" }),
      }),
    ).rejects.toThrow("maximum of 10 synthetic users");
  });

  it("applies transcript-derived archetypes to a draft config with source refs and updated shared axes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createDraftPack(t);
    const sharedAxes = [
      makeAxis({
        key: "support_needs",
        label: "Support Needs",
        description: "How much human guidance the person expects.",
      }),
    ];

    const createdSyntheticUserIds = await asResearcher.mutation(
      api.personaConfigs.applyTranscriptDerivedSyntheticUsers,
      {
        configId,
        input: {
          sharedAxes,
          archetypes: [
            {
              name: "Escalation-ready buyer",
              summary: "Requests live help as soon as uncertainty appears.",
              axisValues: [{ key: "support_needs", value: 0.9 }],
              evidenceSnippets: [
                {
                  transcriptId: "transcript-1",
                  quote: "I wanted to talk to a person right away.",
                },
                {
                  transcriptId: "transcript-2",
                  quote: "The chatbot was not enough for me.",
                },
              ],
              contributingTranscriptIds: ["transcript-1", "transcript-2"],
            },
          ],
        },
      },
    );

    const config = await asResearcher.query(api.personaConfigs.get, { configId });
    const syntheticUsers = await asResearcher.query(api.personaConfigs.listSyntheticUsers, {
      configId,
    });

    expect(createdSyntheticUserIds).toHaveLength(1);
    expect(config?.sharedAxes).toMatchObject(sharedAxes);
    expect(syntheticUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: createdSyntheticUserIds[0],
          sourceType: "transcript_derived",
          sourceRefs: ["transcript-1", "transcript-2"],
          evidenceSnippets: [
            "I wanted to talk to a person right away.",
            "The chatbot was not enough for me.",
          ],
          axes: sharedAxes,
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

type CreateSyntheticUserInput = {
  name: string;
  summary: string;
  axes: AxisInput[];
  evidenceSnippets: string[];
  notes?: string;
};

type TestInstance = ReturnType<typeof createTest>;

async function createDraftPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  return await asResearcher.mutation(api.personaConfigs.createDraft, {
    config: makeCreateDraftInput(),
  });
}

async function createPublishedPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await createDraftPack(t);
  await insertSyntheticUser(t, configId);
  await asResearcher.mutation(api.personaConfigs.publish, { configId });
  return configId;
}

async function createArchivedPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await createPublishedPack(t);
  await asResearcher.mutation(api.personaConfigs.archive, { configId });
  return configId;
}

async function getFirstSyntheticUserId(
  t: TestInstance,
  configId: Id<"personaConfigs">,
) {
  const syntheticUsers = await t.run(async (ctx) =>
    ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .take(1),
  );

  return syntheticUsers[0]!._id;
}

async function insertSyntheticUser(
  t: TestInstance,
  configId: Id<"personaConfigs">,
  overrides: Partial<CreateSyntheticUserInput> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      name: "Synthetic User",
      summary: "A draft synthetic user",
      axes: [makeAxis()],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: ["Evidence snippet"],
      ...overrides,
    }),
  );
}
