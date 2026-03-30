import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
  "./schema.ts": () => import("./schema"),
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

const makeProtoPersonaInput = (
  overrides: Partial<CreateProtoPersonaInput> = {},
): CreateProtoPersonaInput => ({
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

describe("proto persona CRUD", () => {
  it("creates a manual proto-persona on a draft pack and returns it from queries", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t);

    const protoPersonaId = await asResearcher.mutation(
      api.personaPacks.createProtoPersona,
      {
        packId,
        protoPersona: makeProtoPersonaInput(),
      },
    );

    const protoPersona = await asResearcher.query(api.personaPacks.getProtoPersona, {
      protoPersonaId,
    });
    const protoPersonas = await asResearcher.query(api.personaPacks.listProtoPersonas, {
      packId,
    });

    expect(protoPersona).toMatchObject({
      _id: protoPersonaId,
      packId,
      name: "Cautious shopper",
      summary: "Double-checks forms before submitting orders.",
      sourceType: "manual",
      sourceRefs: [],
      notes: "Initial draft persona",
    });
    expect(protoPersona?.evidenceSnippets).toEqual([
      "Prefers to verify totals twice before checkout.",
      "Reads return policy language carefully.",
    ]);
    expect(
      protoPersonas.map((item: { _id: Id<"protoPersonas"> }) => item._id),
    ).toEqual([protoPersonaId]);
  });

  it("rejects missing required name or summary", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t);

    await expect(
      asResearcher.mutation(api.personaPacks.createProtoPersona, {
        packId,
        protoPersona: makeProtoPersonaInput({ name: "" }),
      }),
    ).rejects.toThrow("Proto-persona name is required");

    await expect(
      asResearcher.mutation(api.personaPacks.createProtoPersona, {
        packId,
        protoPersona: makeProtoPersonaInput({ summary: "" }),
      }),
    ).rejects.toThrow("Proto-persona summary is required");
  });

  it("rejects proto-persona axes whose keys are not defined on the parent pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t);

    await expect(
      asResearcher.mutation(api.personaPacks.createProtoPersona, {
        packId,
        protoPersona: makeProtoPersonaInput({
          axes: [makeAxis({ key: "nonexistent_key", label: "Missing axis" })],
        }),
      }),
    ).rejects.toThrow("Proto-persona axes must reference shared pack axis keys");
  });

  it("updates proto-persona fields on draft packs only", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t);
    const protoPersonaId = await insertProtoPersona(t, packId);

    await asResearcher.mutation(api.personaPacks.updateProtoPersona, {
      protoPersonaId,
      patch: {
        name: "Updated cautious shopper",
        summary: "Needs stronger reassurance throughout checkout.",
        axes: [makeAxis({ key: "patience", label: "Patience", description: "Tolerance for friction" })],
        evidenceSnippets: ["Abandons flows after unexpected fees."],
        notes: "Updated after interview review",
      },
    });

    const protoPersona = await asResearcher.query(api.personaPacks.getProtoPersona, {
      protoPersonaId,
    });

    expect(protoPersona).toMatchObject({
      name: "Updated cautious shopper",
      summary: "Needs stronger reassurance throughout checkout.",
      notes: "Updated after interview review",
      sourceType: "manual",
    });
    expect(
      protoPersona?.axes.map((axis: { key: string }) => axis.key),
    ).toEqual(["patience"]);
    expect(protoPersona?.evidenceSnippets).toEqual([
      "Abandons flows after unexpected fees.",
    ]);
  });

  it("deletes proto-personas from draft packs, including the last remaining proto-persona", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t);
    const firstProtoPersonaId = await insertProtoPersona(t, packId, {
      name: "First proto-persona",
    });
    const secondProtoPersonaId = await insertProtoPersona(t, packId, {
      name: "Second proto-persona",
    });

    await asResearcher.mutation(api.personaPacks.deleteProtoPersona, {
      protoPersonaId: firstProtoPersonaId,
    });

    expect(
      await asResearcher.query(api.personaPacks.listProtoPersonas, { packId }),
    ).toMatchObject([{ _id: secondProtoPersonaId, name: "Second proto-persona" }]);

    await asResearcher.mutation(api.personaPacks.deleteProtoPersona, {
      protoPersonaId: secondProtoPersonaId,
    });

    expect(
      await asResearcher.query(api.personaPacks.listProtoPersonas, { packId }),
    ).toEqual([]);
    await expect(
      asResearcher.mutation(api.personaPacks.publish, { packId }),
    ).rejects.toThrow("proto-persona");
  });

  it("rejects create, update, and delete for published or archived packs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const publishedPackId = await createPublishedPack(t);
    const archivedPackId = await createArchivedPack(t);
    const publishedProtoPersonaId = await getFirstProtoPersonaId(t, publishedPackId);
    const archivedProtoPersonaId = await getFirstProtoPersonaId(t, archivedPackId);

    await expect(
      asResearcher.mutation(api.personaPacks.createProtoPersona, {
        packId: publishedPackId,
        protoPersona: makeProtoPersonaInput(),
      }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.personaPacks.createProtoPersona, {
        packId: archivedPackId,
        protoPersona: makeProtoPersonaInput(),
      }),
    ).rejects.toThrow(/archived/i);

    await expect(
      asResearcher.mutation(api.personaPacks.updateProtoPersona, {
        protoPersonaId: publishedProtoPersonaId,
        patch: { name: "Nope" },
      }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.personaPacks.updateProtoPersona, {
        protoPersonaId: archivedProtoPersonaId,
        patch: { name: "Nope" },
      }),
    ).rejects.toThrow(/archived/i);

    await expect(
      asResearcher.mutation(api.personaPacks.deleteProtoPersona, {
        protoPersonaId: publishedProtoPersonaId,
      }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.personaPacks.deleteProtoPersona, {
        protoPersonaId: archivedProtoPersonaId,
      }),
    ).rejects.toThrow(/archived/i);
  });

  it("preserves evidence snippets in order and enforces a maximum of 10 proto-personas per pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t);

    for (let index = 0; index < 9; index += 1) {
      await insertProtoPersona(t, packId, {
        name: `Existing proto-persona ${index + 1}`,
      });
    }

    const tenthProtoPersonaId = await asResearcher.mutation(
      api.personaPacks.createProtoPersona,
      {
        packId,
        protoPersona: makeProtoPersonaInput({
          name: "Tenth proto-persona",
          evidenceSnippets: ["Snippet 1", "Snippet 2", "Snippet 3"],
        }),
      },
    );

    const tenthProtoPersona = await asResearcher.query(api.personaPacks.getProtoPersona, {
      protoPersonaId: tenthProtoPersonaId,
    });

    expect(tenthProtoPersona?.evidenceSnippets).toEqual([
      "Snippet 1",
      "Snippet 2",
      "Snippet 3",
    ]);

    await expect(
      asResearcher.mutation(api.personaPacks.createProtoPersona, {
        packId,
        protoPersona: makeProtoPersonaInput({ name: "Eleventh proto-persona" }),
      }),
    ).rejects.toThrow("maximum of 10 proto-personas");
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

type CreateProtoPersonaInput = {
  name: string;
  summary: string;
  axes: AxisInput[];
  evidenceSnippets: string[];
  notes?: string;
};

type TestInstance = ReturnType<typeof createTest>;

async function createDraftPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  return await asResearcher.mutation(api.personaPacks.createDraft, {
    pack: makeCreateDraftInput(),
  });
}

async function createPublishedPack(t: TestInstance) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await createDraftPack(t);
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

async function getFirstProtoPersonaId(
  t: TestInstance,
  packId: Id<"personaPacks">,
) {
  const protoPersonas = await t.run(async (ctx) =>
    ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", packId))
      .take(1),
  );

  return protoPersonas[0]!._id;
}

async function insertProtoPersona(
  t: TestInstance,
  packId: Id<"personaPacks">,
  overrides: Partial<CreateProtoPersonaInput> = {},
) {
  return await t.run(async (ctx) =>
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
