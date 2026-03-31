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
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

const collaboratorIdentity = {
  subject: "researcher-2",
  tokenIdentifier: "researcher-2",
  name: "Researcher Two",
  email: "researcher.two@example.com",
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
  sharedAxes: [makeAxis()],
  ...overrides,
});

describe("personaConfigs", () => {
  it("createDraft stores a draft config at version 1 with timestamps and creator", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const before = Date.now();

    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });

    const config = await getPackDoc(t, configId);

    expect(config).not.toBeNull();
    expect(config).toMatchObject({
      name: "E-commerce Shoppers",
      description: "Config for e-commerce checkout studies",
      context: "US online retail context",
      status: "draft",
      version: 1,
      createdBy: researchIdentity.tokenIdentifier,
      updatedBy: researchIdentity.tokenIdentifier,
      orgId: researchIdentity.tokenIdentifier,
    });
    expect(config!.createdAt).toBeGreaterThanOrEqual(before);
    expect(config!.updatedAt).toBeGreaterThanOrEqual(config!.createdAt);
  });

  it("createDraft rejects missing required fields", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const invalidInputs = [
      makeCreateDraftInput({ name: "" }),
      makeCreateDraftInput({ description: "" }),
      makeCreateDraftInput({ context: "" }),
    ];

    for (const config of invalidInputs) {
      await expect(
        asResearcher.mutation(api.personaConfigs.createDraft, { config }),
      ).rejects.toThrow();
    }

    const configs = await t.run(async (ctx) => ctx.db.query("personaConfigs").collect());
    expect(configs).toHaveLength(0);
  });

  it("createDraft rejects an empty sharedAxes array", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.mutation(api.personaConfigs.createDraft, {
        config: makeCreateDraftInput({ sharedAxes: [] }),
      }),
    ).rejects.toThrow("At least one shared axis is required");
  });

  it("createDraft rejects axes missing any required field", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const invalidAxes = [
      { label: undefined },
      { description: undefined },
      { lowAnchor: undefined },
      { midAnchor: undefined },
      { highAnchor: undefined },
      { key: undefined },
      { weight: undefined },
    ];

    for (const overrides of invalidAxes) {
      await expect(
        asResearcher.mutation(api.personaConfigs.createDraft, {
          config: makeCreateDraftInput({
            sharedAxes: [makeAxis(overrides as Partial<AxisInput>)],
          }),
        }),
      ).rejects.toThrow();
    }
  });

  it("createDraft rejects non-positive axis weights and duplicate axis keys", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.mutation(api.personaConfigs.createDraft, {
        config: makeCreateDraftInput({ sharedAxes: [makeAxis({ weight: 0 })] }),
      }),
    ).rejects.toThrow("Axis weight must be a positive number");

    await expect(
      asResearcher.mutation(api.personaConfigs.createDraft, {
        config: makeCreateDraftInput({
          sharedAxes: [makeAxis(), makeAxis({ label: "Duplicate axis" })],
        }),
      }),
    ).rejects.toThrow("Axis keys must be unique");
  });

  it("updateDraft updates draft fields and refreshes updatedAt", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });
    const beforeUpdate = await getPackDoc(t, configId);

    await asResearcher.mutation(api.personaConfigs.updateDraft, {
      configId,
      patch: {
        name: "Refined E-commerce Shoppers",
        description: "Updated description",
        context: "Updated context",
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
          }),
        ],
      },
    });

    const afterUpdate = await getPackDoc(t, configId);

    expect(afterUpdate).toMatchObject({
      name: "Refined E-commerce Shoppers",
      description: "Updated description",
      context: "Updated context",
    });
    expect(afterUpdate!.sharedAxes.map((axis: AxisInput) => axis.key)).toEqual([
      "digital_confidence",
      "patience",
    ]);
    expect(afterUpdate!.updatedAt).toBeGreaterThanOrEqual(beforeUpdate!.updatedAt);
  });

  it("tracks the last modifying actor separately from the creator", async () => {
    const t = createTest();
    const asCollaborator = t.withIdentity(collaboratorIdentity);
    const configId = await t.run(async (ctx) =>
      ctx.db.insert("personaConfigs", {
        ...makeCreateDraftInput(),
        version: 1,
        status: "draft",
        orgId: collaboratorIdentity.tokenIdentifier,
        createdBy: researchIdentity.tokenIdentifier,
        updatedBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await asCollaborator.mutation(api.personaConfigs.updateDraft, {
      configId,
      patch: {
        description: "Collaborator-updated description",
      },
    });

    const config = await getPackDoc(t, configId);
    expect(config).toMatchObject({
      createdBy: researchIdentity.tokenIdentifier,
      updatedBy: collaboratorIdentity.tokenIdentifier,
      description: "Collaborator-updated description",
    });
  });

  it("updateDraft supports adding and removing shared axes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
          }),
        ],
      }),
    });

    await asResearcher.mutation(api.personaConfigs.updateDraft, {
      configId,
      patch: {
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
          }),
          makeAxis({
            key: "risk_tolerance",
            label: "Risk Tolerance",
            description: "Comfort with uncertain outcomes",
          }),
        ],
      },
    });

    await asResearcher.mutation(api.personaConfigs.updateDraft, {
      configId,
      patch: {
        sharedAxes: [
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
          }),
          makeAxis({
            key: "risk_tolerance",
            label: "Risk Tolerance",
            description: "Comfort with uncertain outcomes",
          }),
        ],
      },
    });

    const config = await getPackDoc(t, configId);
    expect(config!.sharedAxes.map((axis: AxisInput) => axis.key)).toEqual([
      "patience",
      "risk_tolerance",
    ]);
  });

  it("updateDraft rejects changes to published and archived configs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const publishedPackId = await createPublishedPack(t);
    const archivedPackId = await createArchivedPack(t);

    await expect(
      asResearcher.mutation(api.personaConfigs.updateDraft, {
        configId: publishedPackId,
        patch: { name: "Should fail" },
      }),
    ).rejects.toThrow(/published/i);

    await expect(
      asResearcher.mutation(api.personaConfigs.updateDraft, {
        configId: archivedPackId,
        patch: { name: "Should also fail" },
      }),
    ).rejects.toThrow(/archived/i);
  });

  it("publish transitions a draft config to published, increments version, and refreshes updatedAt", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });
    await insertSyntheticUser(t, configId);

    const beforePublish = await getPackDoc(t, configId);
    await asResearcher.mutation(api.personaConfigs.publish, { configId });
    const afterPublish = await getPackDoc(t, configId);

    expect(afterPublish!.status).toBe("published");
    expect(afterPublish!.version).toBe(beforePublish!.version + 1);
    expect(afterPublish!.updatedAt).toBeGreaterThanOrEqual(beforePublish!.updatedAt);
  });

  it("publish rejects draft configs with an active batch generation run", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    for (const status of ["pending", "running"] as const) {
      const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
        config: makeCreateDraftInput({
          name: `Config with ${status} generation`,
        }),
      });
      await insertSyntheticUser(t, configId);

      await t.run(async (ctx) =>
        ctx.db.insert("batchGenerationRuns", {
          configId,
          orgId: researchIdentity.tokenIdentifier,
          status,
          levelsPerAxis: { digital_confidence: 3 },
          totalCount: 3,
          completedCount: status === "running" ? 1 : 0,
          failedCount: 0,
          startedAt: Date.now(),
        }),
      );

      await expect(
        asResearcher.mutation(api.personaConfigs.publish, { configId }),
      ).rejects.toThrow("Cannot publish while batch generation is in progress");
    }
  });

  it("publish creates axis library entries for each shared axis", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
            lowAnchor: "Abandons quickly",
            midAnchor: "Will try a couple times",
            highAnchor: "Pushes through blockers",
            weight: 2,
          }),
        ],
      }),
    });
    await insertSyntheticUser(t, configId);

    await asResearcher.mutation(api.personaConfigs.publish, { configId });

    const axisDefinitions = await getAxisDefinitionsForOrg(
      t,
      researchIdentity.tokenIdentifier,
    );

    expect(axisDefinitions).toHaveLength(2);
    expect(axisDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "digital_confidence",
          label: "Digital Confidence",
          description: "Comfort using digital products",
          lowAnchor: "Very hesitant",
          midAnchor: "Comfortable enough",
          highAnchor: "Power user",
          weight: 1,
          tags: [],
          usageCount: 1,
          creationSource: "pack_publish",
          orgId: researchIdentity.tokenIdentifier,
        }),
        expect.objectContaining({
          key: "patience",
          label: "Patience",
          description: "Tolerance for friction",
          lowAnchor: "Abandons quickly",
          midAnchor: "Will try a couple times",
          highAnchor: "Pushes through blockers",
          weight: 2,
          tags: [],
          usageCount: 1,
          creationSource: "pack_publish",
          orgId: researchIdentity.tokenIdentifier,
        }),
      ]),
    );
  });

  it("publish increments usageCount for an existing axis definition without overwriting fields", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const existingAxisId = await t.run(async (ctx) =>
      ctx.db.insert("axisDefinitions", {
        key: "digital_confidence",
        label: "Original Label",
        description: "Original description",
        lowAnchor: "Original low",
        midAnchor: "Original mid",
        highAnchor: "Original high",
        weight: 3,
        tags: ["manual"],
        usageCount: 4,
        creationSource: "manual",
        orgId: researchIdentity.tokenIdentifier,
        createdBy: researchIdentity.tokenIdentifier,
        updatedBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      }),
    );
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        sharedAxes: [
          makeAxis({
            key: "digital_confidence",
            label: "New Label",
            description: "New description",
            lowAnchor: "New low",
            midAnchor: "New mid",
            highAnchor: "New high",
            weight: 1,
          }),
        ],
      }),
    });
    await insertSyntheticUser(t, configId);

    await asResearcher.mutation(api.personaConfigs.publish, { configId });

    const storedAxis = await getAxisDefinitionDoc(t, existingAxisId);

    expect(storedAxis).toMatchObject({
      _id: existingAxisId,
      key: "digital_confidence",
      label: "Original Label",
      description: "Original description",
      lowAnchor: "Original low",
      midAnchor: "Original mid",
      highAnchor: "Original high",
      weight: 3,
      tags: ["manual"],
      usageCount: 5,
      creationSource: "manual",
      orgId: researchIdentity.tokenIdentifier,
    });
  });

  it("publish deduplicates overlapping axis keys across multiple configs in the same org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const firstPackId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        name: "Config One",
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
          }),
        ],
      }),
    });
    const secondPackId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        name: "Config Two",
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "risk_tolerance",
            label: "Risk Tolerance",
            description: "Comfort with uncertain outcomes",
          }),
        ],
      }),
    });
    await insertSyntheticUser(t, firstPackId);
    await insertSyntheticUser(t, secondPackId);

    await asResearcher.mutation(api.personaConfigs.publish, { configId: firstPackId });
    await asResearcher.mutation(api.personaConfigs.publish, { configId: secondPackId });

    const axisDefinitions = await getAxisDefinitionsForOrg(
      t,
      researchIdentity.tokenIdentifier,
    );
    const digitalConfidenceEntries = axisDefinitions.filter(
      (axisDefinition) => axisDefinition.key === "digital_confidence",
    );

    expect(axisDefinitions).toHaveLength(3);
    expect(digitalConfidenceEntries).toHaveLength(1);
    expect(digitalConfidenceEntries[0]?.usageCount).toBe(2);
  });

  it("publish keeps axis library usage isolated by org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const asCollaborator = t.withIdentity(collaboratorIdentity);
    const researcherPackId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({ name: "Researcher config" }),
    });
    const collaboratorPackId = await asCollaborator.mutation(
      api.personaConfigs.createDraft,
      {
        config: makeCreateDraftInput({ name: "Collaborator config" }),
      },
    );
    await insertSyntheticUser(t, researcherPackId);
    await insertSyntheticUser(t, collaboratorPackId);

    await asResearcher.mutation(api.personaConfigs.publish, {
      configId: researcherPackId,
    });
    await asCollaborator.mutation(api.personaConfigs.publish, {
      configId: collaboratorPackId,
    });

    const researcherAxisDefinitions = await getAxisDefinitionsForOrg(
      t,
      researchIdentity.tokenIdentifier,
    );
    const collaboratorAxisDefinitions = await getAxisDefinitionsForOrg(
      t,
      collaboratorIdentity.tokenIdentifier,
    );

    expect(researcherAxisDefinitions).toHaveLength(1);
    expect(collaboratorAxisDefinitions).toHaveLength(1);
    expect(researcherAxisDefinitions[0]).toMatchObject({
      key: "digital_confidence",
      usageCount: 1,
      orgId: researchIdentity.tokenIdentifier,
    });
    expect(collaboratorAxisDefinitions[0]).toMatchObject({
      key: "digital_confidence",
      usageCount: 1,
      orgId: collaboratorIdentity.tokenIdentifier,
    });
  });

  it("publish rejects configs without synthetic users", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });

    await expect(
      asResearcher.mutation(api.personaConfigs.publish, { configId }),
    ).rejects.toThrow("synthetic user");
  });

  it("publish rejects already published and archived configs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const publishedPackId = await createPublishedPack(t);
    const archivedPackId = await createArchivedPack(t);

    await expect(
      asResearcher.mutation(api.personaConfigs.publish, { configId: publishedPackId }),
    ).rejects.toThrow("already published");

    await expect(
      asResearcher.mutation(api.personaConfigs.publish, { configId: archivedPackId }),
    ).rejects.toThrow(/archived/i);
  });

  it("publish rejects configs whose synthetic user axes drifted after shared axis removal", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({
        sharedAxes: [
          makeAxis({ key: "digital_confidence" }),
          makeAxis({
            key: "patience",
            label: "Patience",
            description: "Tolerance for friction",
          }),
        ],
      }),
    });

    await insertSyntheticUser(t, configId, {
      axes: [
        makeAxis({ key: "digital_confidence" }),
        makeAxis({
          key: "patience",
          label: "Patience",
          description: "Tolerance for friction",
        }),
      ],
    });

    await asResearcher.mutation(api.personaConfigs.updateDraft, {
      configId,
      patch: {
        sharedAxes: [makeAxis({ key: "digital_confidence" })],
      },
    });

    await expect(
      asResearcher.mutation(api.personaConfigs.publish, { configId }),
    ).rejects.toThrow(/shared config axis keys/i);
  });

  it("archive transitions a published config to archived", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await createPublishedPack(t);

    await asResearcher.mutation(api.personaConfigs.archive, { configId });

    const config = await getPackDoc(t, configId);
    expect(config!.status).toBe("archived");
  });

  it("archive rejects draft configs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });

    await expect(
      asResearcher.mutation(api.personaConfigs.archive, { configId }),
    ).rejects.toThrow("published");
  });

  it("list returns the current user's configs and get returns config details", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const asCollaborator = t.withIdentity(collaboratorIdentity);

    const ownPackId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({ name: "Own config" }),
    });
    await asCollaborator.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput({ name: "Collaborator config" }),
    });

    const configs = await asResearcher.query(api.personaConfigs.list, {});
    const config = await asResearcher.query(api.personaConfigs.get, { configId: ownPackId });

    expect(configs.map((item: { _id: Id<"personaConfigs"> }) => item._id)).toEqual([
      ownPackId,
    ]);
    expect(config?._id).toBe(ownPackId);
  });

  it("concurrent draft updates leave the config in one consistent state", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });

    const patchA = {
      name: "Patch A",
      description: "Patch A description",
      context: "Patch A context",
    };
    const patchB = {
      name: "Patch B",
      description: "Patch B description",
      context: "Patch B context",
    };

    await Promise.allSettled([
      asResearcher.mutation(api.personaConfigs.updateDraft, { configId, patch: patchA }),
      asResearcher.mutation(api.personaConfigs.updateDraft, { configId, patch: patchB }),
    ]);

    const config = await getPackDoc(t, configId);

    expect(
      [patchA, patchB].some(
        (patch) =>
          config!.name === patch.name &&
          config!.description === patch.description &&
          config!.context === patch.context,
      ),
    ).toBe(true);
  });

  it("publishes configs with transcript-derived personas, preserves source refs, and upserts discovered axes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });

    await asResearcher.mutation(api.personaConfigs.applyTranscriptDerivedSyntheticUsers, {
      configId,
      input: {
        sharedAxes: [
          makeAxis({
            key: "confidence_level",
            label: "Confidence Level",
            description: "Comfort completing the task without live help.",
          }),
        ],
        archetypes: [
          {
            name: "Deliberate verifier",
            summary: "Double-checks totals and wants reassurance before continuing.",
            axisValues: [{ key: "confidence_level", value: -0.35 }],
            evidenceSnippets: [
              {
                transcriptId: "transcript-auto-1",
                quote: "I wanted to double-check the price before continuing.",
              },
            ],
            contributingTranscriptIds: ["transcript-auto-1"],
          },
        ],
      },
    });
    await insertSyntheticUser(t, configId, {
      name: "Manual synthetic user",
      axes: [
        makeAxis({
          key: "confidence_level",
          label: "Confidence Level",
          description: "Comfort completing the task without live help.",
        }),
      ],
    });

    await asResearcher.mutation(api.personaConfigs.publish, { configId });

    const syntheticUsers = await asResearcher.query(api.personaConfigs.listSyntheticUsers, {
      configId,
    });
    const transcriptDerivedPersona = syntheticUsers.find(
      (syntheticUser: { sourceType: string }) => syntheticUser.sourceType === "transcript_derived",
    );
    const axisDefinitions = await getAxisDefinitionsForOrg(
      t,
      researchIdentity.tokenIdentifier,
    );

    expect(transcriptDerivedPersona).toMatchObject({
      sourceType: "transcript_derived",
      sourceRefs: ["transcript-auto-1"],
      evidenceSnippets: ["I wanted to double-check the price before continuing."],
    });
    expect(axisDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "confidence_level",
          creationSource: "pack_publish",
          usageCount: 1,
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

type TestInstance = ReturnType<typeof createTest>;

async function createPublishedPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await asResearcher.mutation(api.personaConfigs.createDraft, {
    config: makeCreateDraftInput(),
  });
  await insertSyntheticUser(t, configId);
  await asResearcher.mutation(api.personaConfigs.publish, { configId });
  return configId;
}

async function getPackDoc(
  t: TestInstance,
  configId: Id<"personaConfigs">,
): Promise<Doc<"personaConfigs"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(configId)) as Doc<"personaConfigs"> | null);
}

async function getAxisDefinitionDoc(
  t: TestInstance,
  axisDefinitionId: Id<"axisDefinitions">,
): Promise<Doc<"axisDefinitions"> | null> {
  return await t.run(
    async (ctx) =>
      (await ctx.db.get(axisDefinitionId)) as Doc<"axisDefinitions"> | null,
  );
}

async function getAxisDefinitionsForOrg(t: TestInstance, orgId: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("axisDefinitions").collect()).filter(
      (axisDefinition) => axisDefinition.orgId === orgId,
    ),
  );
}

async function createArchivedPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  const configId = await createPublishedPack(t);
  await asResearcher.mutation(api.personaConfigs.archive, { configId });
  return configId;
}

async function insertSyntheticUser(
  t: TestInstance,
  configId: Id<"personaConfigs">,
  overrides: Partial<Doc<"syntheticUsers">> = {},
) {
  await t.run(async (ctx) =>
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
