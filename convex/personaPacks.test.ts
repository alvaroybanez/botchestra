import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
  "./personaPacks.ts": () => import("./personaPacks"),
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
  description: "Pack for e-commerce checkout studies",
  context: "US online retail context",
  sharedAxes: [makeAxis()],
  ...overrides,
});

describe("personaPacks", () => {
  it("createDraft stores a draft pack at version 1 with timestamps and creator", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const before = Date.now();

    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
    });

    const pack = await getPackDoc(t, packId);

    expect(pack).not.toBeNull();
    expect(pack).toMatchObject({
      name: "E-commerce Shoppers",
      description: "Pack for e-commerce checkout studies",
      context: "US online retail context",
      status: "draft",
      version: 1,
      createdBy: researchIdentity.tokenIdentifier,
      updatedBy: researchIdentity.tokenIdentifier,
      orgId: researchIdentity.tokenIdentifier,
    });
    expect(pack!.createdAt).toBeGreaterThanOrEqual(before);
    expect(pack!.updatedAt).toBeGreaterThanOrEqual(pack!.createdAt);
  });

  it("createDraft rejects missing required fields", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const invalidInputs = [
      makeCreateDraftInput({ name: "" }),
      makeCreateDraftInput({ description: "" }),
      makeCreateDraftInput({ context: "" }),
    ];

    for (const pack of invalidInputs) {
      await expect(
        asResearcher.mutation(api.personaPacks.createDraft, { pack }),
      ).rejects.toThrow();
    }

    const packs = await t.run(async (ctx) => ctx.db.query("personaPacks").collect());
    expect(packs).toHaveLength(0);
  });

  it("createDraft rejects an empty sharedAxes array", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.mutation(api.personaPacks.createDraft, {
        pack: makeCreateDraftInput({ sharedAxes: [] }),
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
        asResearcher.mutation(api.personaPacks.createDraft, {
          pack: makeCreateDraftInput({
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
      asResearcher.mutation(api.personaPacks.createDraft, {
        pack: makeCreateDraftInput({ sharedAxes: [makeAxis({ weight: 0 })] }),
      }),
    ).rejects.toThrow("Axis weight must be a positive number");

    await expect(
      asResearcher.mutation(api.personaPacks.createDraft, {
        pack: makeCreateDraftInput({
          sharedAxes: [makeAxis(), makeAxis({ label: "Duplicate axis" })],
        }),
      }),
    ).rejects.toThrow("Axis keys must be unique");
  });

  it("updateDraft updates draft fields and refreshes updatedAt", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
    });
    const beforeUpdate = await getPackDoc(t, packId);

    await asResearcher.mutation(api.personaPacks.updateDraft, {
      packId,
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

    const afterUpdate = await getPackDoc(t, packId);

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
    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
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

    await asCollaborator.mutation(api.personaPacks.updateDraft, {
      packId,
      patch: {
        description: "Collaborator-updated description",
      },
    });

    const pack = await getPackDoc(t, packId);
    expect(pack).toMatchObject({
      createdBy: researchIdentity.tokenIdentifier,
      updatedBy: collaboratorIdentity.tokenIdentifier,
      description: "Collaborator-updated description",
    });
  });

  it("updateDraft supports adding and removing shared axes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({
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

    await asResearcher.mutation(api.personaPacks.updateDraft, {
      packId,
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

    await asResearcher.mutation(api.personaPacks.updateDraft, {
      packId,
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

    const pack = await getPackDoc(t, packId);
    expect(pack!.sharedAxes.map((axis: AxisInput) => axis.key)).toEqual([
      "patience",
      "risk_tolerance",
    ]);
  });

  it("updateDraft rejects changes to published and archived packs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const publishedPackId = await createPublishedPack(t);
    const archivedPackId = await createArchivedPack(t);

    await expect(
      asResearcher.mutation(api.personaPacks.updateDraft, {
        packId: publishedPackId,
        patch: { name: "Should fail" },
      }),
    ).rejects.toThrow(/published/i);

    await expect(
      asResearcher.mutation(api.personaPacks.updateDraft, {
        packId: archivedPackId,
        patch: { name: "Should also fail" },
      }),
    ).rejects.toThrow(/archived/i);
  });

  it("publish transitions a draft pack to published, increments version, and refreshes updatedAt", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
    });
    await insertProtoPersona(t, packId);

    const beforePublish = await getPackDoc(t, packId);
    await asResearcher.mutation(api.personaPacks.publish, { packId });
    const afterPublish = await getPackDoc(t, packId);

    expect(afterPublish!.status).toBe("published");
    expect(afterPublish!.version).toBe(beforePublish!.version + 1);
    expect(afterPublish!.updatedAt).toBeGreaterThanOrEqual(beforePublish!.updatedAt);
  });

  it("publish creates axis library entries for each shared axis", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({
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
    await insertProtoPersona(t, packId);

    await asResearcher.mutation(api.personaPacks.publish, { packId });

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
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({
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
    await insertProtoPersona(t, packId);

    await asResearcher.mutation(api.personaPacks.publish, { packId });

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

  it("publish deduplicates overlapping axis keys across multiple packs in the same org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const firstPackId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({
        name: "Pack One",
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
    const secondPackId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({
        name: "Pack Two",
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
    await insertProtoPersona(t, firstPackId);
    await insertProtoPersona(t, secondPackId);

    await asResearcher.mutation(api.personaPacks.publish, { packId: firstPackId });
    await asResearcher.mutation(api.personaPacks.publish, { packId: secondPackId });

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
    const researcherPackId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({ name: "Researcher pack" }),
    });
    const collaboratorPackId = await asCollaborator.mutation(
      api.personaPacks.createDraft,
      {
        pack: makeCreateDraftInput({ name: "Collaborator pack" }),
      },
    );
    await insertProtoPersona(t, researcherPackId);
    await insertProtoPersona(t, collaboratorPackId);

    await asResearcher.mutation(api.personaPacks.publish, {
      packId: researcherPackId,
    });
    await asCollaborator.mutation(api.personaPacks.publish, {
      packId: collaboratorPackId,
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

  it("publish rejects packs without proto-personas", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
    });

    await expect(
      asResearcher.mutation(api.personaPacks.publish, { packId }),
    ).rejects.toThrow("proto-persona");
  });

  it("publish rejects already published and archived packs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const publishedPackId = await createPublishedPack(t);
    const archivedPackId = await createArchivedPack(t);

    await expect(
      asResearcher.mutation(api.personaPacks.publish, { packId: publishedPackId }),
    ).rejects.toThrow("already published");

    await expect(
      asResearcher.mutation(api.personaPacks.publish, { packId: archivedPackId }),
    ).rejects.toThrow(/archived/i);
  });

  it("publish rejects packs whose proto-persona axes drifted after shared axis removal", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({
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

    await insertProtoPersona(t, packId, {
      axes: [
        makeAxis({ key: "digital_confidence" }),
        makeAxis({
          key: "patience",
          label: "Patience",
          description: "Tolerance for friction",
        }),
      ],
    });

    await asResearcher.mutation(api.personaPacks.updateDraft, {
      packId,
      patch: {
        sharedAxes: [makeAxis({ key: "digital_confidence" })],
      },
    });

    await expect(
      asResearcher.mutation(api.personaPacks.publish, { packId }),
    ).rejects.toThrow(/shared pack axis keys/i);
  });

  it("archive transitions a published pack to archived", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t);

    await asResearcher.mutation(api.personaPacks.archive, { packId });

    const pack = await getPackDoc(t, packId);
    expect(pack!.status).toBe("archived");
  });

  it("archive rejects draft packs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
    });

    await expect(
      asResearcher.mutation(api.personaPacks.archive, { packId }),
    ).rejects.toThrow("published");
  });

  it("list returns the current user's packs and get returns pack details", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const asCollaborator = t.withIdentity(collaboratorIdentity);

    const ownPackId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({ name: "Own pack" }),
    });
    await asCollaborator.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput({ name: "Collaborator pack" }),
    });

    const packs = await asResearcher.query(api.personaPacks.list, {});
    const pack = await asResearcher.query(api.personaPacks.get, { packId: ownPackId });

    expect(packs.map((item: { _id: Id<"personaPacks"> }) => item._id)).toEqual([
      ownPackId,
    ]);
    expect(pack?._id).toBe(ownPackId);
  });

  it("concurrent draft updates leave the pack in one consistent state", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
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
      asResearcher.mutation(api.personaPacks.updateDraft, { packId, patch: patchA }),
      asResearcher.mutation(api.personaPacks.updateDraft, { packId, patch: patchB }),
    ]);

    const pack = await getPackDoc(t, packId);

    expect(
      [patchA, patchB].some(
        (patch) =>
          pack!.name === patch.name &&
          pack!.description === patch.description &&
          pack!.context === patch.context,
      ),
    ).toBe(true);
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
  const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
    pack: makeCreateDraftInput(),
  });
  await insertProtoPersona(t, packId);
  await asResearcher.mutation(api.personaPacks.publish, { packId });
  return packId;
}

async function getPackDoc(
  t: TestInstance,
  packId: Id<"personaPacks">,
): Promise<Doc<"personaPacks"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(packId)) as Doc<"personaPacks"> | null);
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
  const packId = await createPublishedPack(t);
  await asResearcher.mutation(api.personaPacks.archive, { packId });
  return packId;
}

async function insertProtoPersona(
  t: TestInstance,
  packId: Id<"personaPacks">,
  overrides: Partial<Doc<"protoPersonas">> = {},
) {
  await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId,
      name: "Proto Persona",
      summary: "A draft proto-persona",
      axes: [makeAxis()],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: ["Evidence snippet"],
      ...overrides,
    }),
  );
}
