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

const makeProtoPersona = (
  index: number,
  overrides: Partial<ProtoPersonaJson> = {},
): ProtoPersonaJson => ({
  name: `Proto Persona ${index + 1}`,
  summary: `Summary for proto persona ${index + 1}`,
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
  notes: `Notes for proto persona ${index + 1}`,
  ...overrides,
});

const makeImportPayload = (
  overrides: Partial<PersonaPackJson> = {},
): PersonaPackJson => ({
  name: "Imported Persona Pack",
  description: "Pack loaded from JSON",
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
  protoPersonas: [makeProtoPersona(0), makeProtoPersona(1)],
  ...overrides,
});

describe("persona pack JSON import/export", () => {
  it("imports valid JSON into a new draft pack regardless of source status", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const importedPackId = await asResearcher.action(api.personaPacks.importJson, {
      json: JSON.stringify(makeImportPayload({ status: "archived" })),
    });

    const importedPack = await asResearcher.query(api.personaPacks.get, {
      packId: importedPackId,
    });
    const protoPersonas = await asResearcher.query(
      api.personaPacks.listProtoPersonas,
      { packId: importedPackId },
    );

    expect(importedPack).toMatchObject({
      name: "Imported Persona Pack",
      description: "Pack loaded from JSON",
      context: "Checkout usability study",
      status: "draft",
      version: 1,
      createdBy: researchIdentity.tokenIdentifier,
      orgId: researchIdentity.tokenIdentifier,
    });
    expect(importedPack?.sharedAxes).toEqual(makeImportPayload().sharedAxes);
    expect(protoPersonas).toHaveLength(2);
    expect(protoPersonas).toMatchObject([
      {
        name: "Proto Persona 1",
        summary: "Summary for proto persona 1",
        sourceType: "json_import",
        evidenceSnippets: ["Evidence snippet A1", "Evidence snippet B1"],
        notes: "Notes for proto persona 1",
      },
      {
        name: "Proto Persona 2",
        summary: "Summary for proto persona 2",
        sourceType: "json_import",
        evidenceSnippets: ["Evidence snippet A2", "Evidence snippet B2"],
        notes: "Notes for proto persona 2",
      },
    ]);
  });

  it("rejects invalid JSON structure and invalid axis definitions without writing data", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.action(api.personaPacks.importJson, {
        json: JSON.stringify({
          description: "Missing name",
          context: "Checkout usability study",
          sharedAxes: [makeAxis()],
          protoPersonas: [makeProtoPersona(0)],
        }),
      }),
    ).rejects.toThrow("name");

    await expect(
      asResearcher.action(api.personaPacks.importJson, {
        json: JSON.stringify({
          ...makeImportPayload(),
          sharedAxes: "not-an-array",
        }),
      }),
    ).rejects.toThrow("sharedAxes");

    await expect(
      asResearcher.action(api.personaPacks.importJson, {
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
      asResearcher.action(api.personaPacks.importJson, {
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

    const packs = await t.run(async (ctx) => ctx.db.query("personaPacks").collect());
    const protoPersonas = await t.run(async (ctx) =>
      ctx.db.query("protoPersonas").collect(),
    );

    expect(packs).toHaveLength(0);
    expect(protoPersonas).toHaveLength(0);
  });

  it("rejects malformed JSON before validation or writes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    await expect(
      asResearcher.action(api.personaPacks.importJson, {
        json: "{not json}",
      }),
    ).rejects.toThrow(/json/i);

    await expect(
      asResearcher.action(api.personaPacks.importJson, {
        json: "",
      }),
    ).rejects.toThrow(/json/i);

    const packs = await t.run(async (ctx) => ctx.db.query("personaPacks").collect());
    expect(packs).toHaveLength(0);
  });

  it("imports a large pack with 10 proto-personas and preserves evidence snippets", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const largePayload = makeImportPayload({
      protoPersonas: Array.from({ length: 10 }, (_, index) =>
        makeProtoPersona(index, {
          evidenceSnippets: Array.from(
            { length: 20 },
            (_, snippetIndex) =>
              `Proto ${index + 1} evidence snippet ${snippetIndex + 1}`,
          ),
        }),
      ),
    });

    const importedPackId = await asResearcher.action(api.personaPacks.importJson, {
      json: JSON.stringify(largePayload),
    });
    const protoPersonas = await asResearcher.query(
      api.personaPacks.listProtoPersonas,
      { packId: importedPackId },
    );

    expect(protoPersonas).toHaveLength(10);
    expect(protoPersonas[0]?.evidenceSnippets).toHaveLength(20);
    expect(protoPersonas[9]?.evidenceSnippets[19]).toBe(
      "Proto 10 evidence snippet 20",
    );
  });

  it("exports draft, published, and archived packs including proto-personas but excluding variants", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const draftPackId = await createDraftPack(t, "Draft export pack");
    const publishedPackId = await createPublishedPack(t, "Published export pack");
    const archivedPackId = await createArchivedPack(t, "Archived export pack");

    await insertVariantForPack(t, draftPackId);

    for (const [packId, expectedStatus] of [
      [draftPackId, "draft"],
      [publishedPackId, "published"],
      [archivedPackId, "archived"],
    ] as const) {
      const exported = JSON.parse(
        await asResearcher.action(api.personaPacks.exportJson, { packId }),
      ) as PersonaPackJson & Record<string, unknown>;

      expect(exported.status).toBe(expectedStatus);
      expect(exported.protoPersonas).toHaveLength(1);
      expect(exported.protoPersonas[0]).toMatchObject({
        name: `${expectedStatus} proto-persona`,
        evidenceSnippets: [`${expectedStatus} evidence`],
      });
      expect(exported.protoPersonas[0]).not.toHaveProperty("sourceType");
      expect(exported).not.toHaveProperty("variants");
      expect(exported).not.toHaveProperty("personaVariants");
    }
  });

  it("round-trips export -> import -> export with fidelity", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const originalPackId = await createPublishedPack(t, "Round-trip pack", {
      description: "Round-trip description",
      context: "Round-trip context",
      protoPersona: {
        name: "Round-trip proto-persona",
        summary: "Summary preserved across export/import",
        evidenceSnippets: ["Quote 1", "Quote 2"],
        notes: "Detailed notes",
      },
    });

    const originalExport = JSON.parse(
      await asResearcher.action(api.personaPacks.exportJson, {
        packId: originalPackId,
      }),
    ) as PersonaPackJson;

    const reimportedPackId = await asResearcher.action(api.personaPacks.importJson, {
      json: JSON.stringify(originalExport),
    });

    const reimportedExport = JSON.parse(
      await asResearcher.action(api.personaPacks.exportJson, {
        packId: reimportedPackId,
      }),
    ) as PersonaPackJson;

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

type ProtoPersonaJson = {
  name: string;
  summary: string;
  axes: AxisInput[];
  evidenceSnippets: string[];
  notes?: string;
};

type PersonaPackJson = {
  name: string;
  description: string;
  context: string;
  status?: "draft" | "published" | "archived";
  sharedAxes: AxisInput[];
  protoPersonas: ProtoPersonaJson[];
};

type TestInstance = ReturnType<typeof createTest>;

async function createDraftPack(
  t: TestInstance,
  name: string,
  overrides: {
    description?: string;
    context?: string;
    protoPersona?: Partial<ProtoPersonaJson>;
  } = {},
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
    pack: {
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

  await asResearcher.mutation(api.personaPacks.createProtoPersona, {
    packId,
    protoPersona: {
      name: overrides.protoPersona?.name ?? "draft proto-persona",
      summary:
        overrides.protoPersona?.summary ?? "Summary for the exported proto-persona",
      axes: overrides.protoPersona?.axes ?? [
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
        overrides.protoPersona?.evidenceSnippets ?? ["draft evidence"],
      ...(overrides.protoPersona?.notes !== undefined
        ? { notes: overrides.protoPersona.notes }
        : {}),
    },
  });

  return packId;
}

async function createPublishedPack(
  t: TestInstance,
  name: string,
  overrides: {
    description?: string;
    context?: string;
    protoPersona?: Partial<ProtoPersonaJson>;
  } = {},
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await createDraftPack(t, name, {
    ...overrides,
    protoPersona: {
      name: "published proto-persona",
      evidenceSnippets: ["published evidence"],
      ...overrides.protoPersona,
    },
  });

  await asResearcher.mutation(api.personaPacks.publish, { packId });
  return packId;
}

async function createArchivedPack(t: TestInstance, name: string) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await createPublishedPack(t, name, {
    protoPersona: {
      name: "archived proto-persona",
      evidenceSnippets: ["archived evidence"],
    },
  });

  await asResearcher.mutation(api.personaPacks.archive, { packId });
  return packId;
}

async function insertVariantForPack(
  t: TestInstance,
  packId: Id<"personaPacks">,
) {
  await t.run(async (ctx) => {
    const protoPersonas = await ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", packId))
      .take(1);

    const studyId = await ctx.db.insert("studies", {
      orgId: researchIdentity.tokenIdentifier,
      personaPackId: packId,
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
      personaPackId: packId,
      protoPersonaId: protoPersonas[0]!._id,
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
