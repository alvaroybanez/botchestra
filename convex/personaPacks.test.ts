import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./personaPacks.ts": () => import("./personaPacks"),
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

    const pack = await t.run(async (ctx) => ctx.db.get(packId));

    expect(pack).not.toBeNull();
    expect(pack).toMatchObject({
      name: "E-commerce Shoppers",
      description: "Pack for e-commerce checkout studies",
      context: "US online retail context",
      status: "draft",
      version: 1,
      createdBy: researchIdentity.tokenIdentifier,
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
    const beforeUpdate = await t.run(async (ctx) => ctx.db.get(packId));

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

    const afterUpdate = await t.run(async (ctx) => ctx.db.get(packId));

    expect(afterUpdate).toMatchObject({
      name: "Refined E-commerce Shoppers",
      description: "Updated description",
      context: "Updated context",
    });
    expect(afterUpdate!.sharedAxes.map((axis) => axis.key)).toEqual([
      "digital_confidence",
      "patience",
    ]);
    expect(afterUpdate!.updatedAt).toBeGreaterThanOrEqual(beforeUpdate!.updatedAt);
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

    const pack = await t.run(async (ctx) => ctx.db.get(packId));
    expect(pack!.sharedAxes.map((axis) => axis.key)).toEqual([
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

    const beforePublish = await t.run(async (ctx) => ctx.db.get(packId));
    await asResearcher.mutation(api.personaPacks.publish, { packId });
    const afterPublish = await t.run(async (ctx) => ctx.db.get(packId));

    expect(afterPublish!.status).toBe("published");
    expect(afterPublish!.version).toBe(beforePublish!.version + 1);
    expect(afterPublish!.updatedAt).toBeGreaterThanOrEqual(beforePublish!.updatedAt);
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

  it("archive transitions a published pack to archived", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t);

    await asResearcher.mutation(api.personaPacks.archive, { packId });

    const pack = await t.run(async (ctx) => ctx.db.get(packId));
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

    expect(packs.map((item) => item._id)).toEqual([ownPackId]);
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

    const pack = await t.run(async (ctx) => ctx.db.get(packId));

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

async function createArchivedPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await createPublishedPack(t);
  await asResearcher.mutation(api.personaPacks.archive, { packId });
  return packId;
}

async function insertProtoPersona(
  t: TestInstance,
  packId: Id<"personaPacks">,
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
    }),
  );
}
