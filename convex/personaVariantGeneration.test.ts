import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: vi.fn(),
}));

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  type GeneratedVariantCandidate,
  validateGeneratedVariantCandidate,
} from "./personaEngine/variantGeneration";
import { generateWithModel } from "../packages/ai/src/index";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./personaPacks.ts": () => import("./personaPacks"),
  "./personaVariantGeneration.ts": () => import("./personaVariantGeneration"),
  "./personaVariantGenerationModel.ts": () =>
    import("./personaVariantGenerationModel"),
};

const createTest = () => convexTest(schema, modules);
const mockedGenerateWithModel = vi.mocked(generateWithModel);
const variantGenerationApi = (api as any).personaVariantGeneration;

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

const makeAxis = (index: number) => ({
  key: `axis_${index + 1}`,
  label: `Axis ${index + 1}`,
  description: `Description for axis ${index + 1}`,
  lowAnchor: `Low ${index + 1}`,
  midAnchor: `Mid ${index + 1}`,
  highAnchor: `High ${index + 1}`,
  weight: 1,
});

const makeBehaviorRules = (count = 6) =>
  Array.from(
    { length: count },
    (_, index) =>
      `Rule ${index + 1}: stays focused on the checkout flow and reacts consistently.`,
  );

const makeBio = (wordCount: number) =>
  Array.from(
    { length: wordCount },
    (_, index) => `persona${(index % 12) + 1}`,
  ).join(" ");

const makeCandidate = (
  overrides: Partial<GeneratedVariantCandidate> = {},
): GeneratedVariantCandidate => ({
  firstPersonBio: makeBio(100),
  behaviorRules: makeBehaviorRules(6),
  tensionSeed: "Worries that hidden fees might appear after entering payment details.",
  coherenceScore: 0.88,
  ...overrides,
});

describe("variant generation validation gate", () => {
  it("rejects bios outside the 80-150 word window", () => {
    expect(
      validateGeneratedVariantCandidate(
        makeCandidate({ firstPersonBio: makeBio(79) }),
      ).accepted,
    ).toBe(false);

    expect(
      validateGeneratedVariantCandidate(
        makeCandidate({ firstPersonBio: makeBio(151) }),
      ).accepted,
    ).toBe(false);

    expect(validateGeneratedVariantCandidate(makeCandidate()).accepted).toBe(true);
  });

  it("rejects behavior rules outside the 5-8 item window", () => {
    expect(
      validateGeneratedVariantCandidate(
        makeCandidate({ behaviorRules: makeBehaviorRules(4) }),
      ).accepted,
    ).toBe(false);

    expect(
      validateGeneratedVariantCandidate(
        makeCandidate({ behaviorRules: makeBehaviorRules(9) }),
      ).accepted,
    ).toBe(false);

    expect(validateGeneratedVariantCandidate(makeCandidate()).accepted).toBe(true);
  });
});

describe("previewVariants", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("returns projected coverage without writing personaVariants rows", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t, { protoPersonaCount: 4 });

    const beforeCount = await t.run(async (ctx) =>
      ctx.db.query("personaVariants").collect(),
    );

    const preview = await asResearcher.action(variantGenerationApi.previewVariants, {
      packId,
      budget: 64,
    });

    const afterCount = await t.run(async (ctx) =>
      ctx.db.query("personaVariants").collect(),
    );

    expect(beforeCount).toHaveLength(0);
    expect(afterCount).toHaveLength(0);
    expect(preview.projectedVariants).toHaveLength(64);
    expect(preview.coverage.budget).toBe(64);
    expect(preview.coverage.edgeCount + preview.coverage.interiorCount).toBe(64);
    expect(preview.coverage.perProtoPersona).toHaveLength(4);
    expect(
      preview.coverage.perProtoPersona.reduce(
        (sum, allocation) => sum + allocation.projectedCount,
        0,
      ),
    ).toBe(64);
    expect(
      preview.coverage.perProtoPersona.every(
        (allocation) =>
          allocation.projectedCount === allocation.edgeCount + allocation.interiorCount,
      ),
    ).toBe(true);
  });

  it("supports both draft and published packs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const draftPackId = await createDraftPack(t, { protoPersonaCount: 1 });
    const publishedPackId = await createPublishedPack(t, { protoPersonaCount: 1 });

    const draftPreview = await asResearcher.action(variantGenerationApi.previewVariants, {
      packId: draftPackId,
      budget: 50,
    });
    const publishedPreview = await asResearcher.action(
      variantGenerationApi.previewVariants,
      {
        packId: publishedPackId,
        budget: 50,
      },
    );

    expect(draftPreview.projectedVariants).toHaveLength(50);
    expect(publishedPreview.projectedVariants).toHaveLength(50);
    expect(draftPreview.coverage.perProtoPersona).toHaveLength(1);
    expect(publishedPreview.coverage.perProtoPersona).toHaveLength(1);
  });

  it("reflects the 70/30 edge-interior split in the preview output", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t, { protoPersonaCount: 1 });

    const preview = await asResearcher.action(variantGenerationApi.previewVariants, {
      packId,
      budget: 64,
    });

    expect(preview.coverage.edgeCount).toBe(45);
    expect(preview.coverage.interiorCount).toBe(19);
    expect(preview.coverage.perProtoPersona[0]).toMatchObject({
      projectedCount: 64,
      edgeCount: 45,
      interiorCount: 19,
    });
  });

  it("respects the requested budget", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t, { protoPersonaCount: 3 });

    for (const budget of [50, 64, 100]) {
      const preview = await asResearcher.action(variantGenerationApi.previewVariants, {
        packId,
        budget,
      });

      expect(preview.coverage.budget).toBe(budget);
      expect(preview.projectedVariants).toHaveLength(budget);
      expect(preview.coverage.edgeCount + preview.coverage.interiorCount).toBe(
        budget,
      );
      expect(
        preview.coverage.perProtoPersona.reduce(
          (sum, allocation) => sum + allocation.projectedCount,
          0,
        ),
      ).toBe(budget);
    }
  });

  it("requires at least one proto-persona", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createDraftPack(t, { protoPersonaCount: 0 });

    await expect(
      asResearcher.action(variantGenerationApi.previewVariants, {
        packId,
        budget: 50,
      }),
    ).rejects.toThrow(/at least one proto-persona/i);
  });
});

describe("generateVariantsForStudy", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("writes exactly the run budget of accepted variants and returns summary metrics", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t, { protoPersonaCount: 4 });
    const studyId = await insertStudy(t, packId, { runBudget: 64 });

    mockedGenerateWithModel.mockImplementation(async () =>
      createAiResult(makeCandidate()),
    );

    const summary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId },
    );

    const variants = await t.run(async (ctx) =>
      ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
        .collect(),
    );

    expect(summary.acceptedCount).toBe(64);
    expect(summary.rejectedCount).toBe(0);
    expect(summary.retryCount).toBe(0);
    expect(summary.acceptedCount + summary.rejectedCount).toBe(64);
    expect(summary.coverage.edgeCount + summary.coverage.interiorCount).toBe(64);
    expect(variants).toHaveLength(64);
    expect(variants.every((variant) => variant.accepted)).toBe(true);
    expect(new Set(variants.map((variant) => variant.protoPersonaId)).size).toBe(4);

    for (const variant of variants) {
      expect(variant.studyId).toBe(studyId);
      expect(variant.personaPackId).toBe(packId);
      expect(variant.axisValues).not.toHaveLength(0);
      expect(variant.behaviorRules).toHaveLength(6);
      expect(variant.firstPersonBio.split(/\s+/)).toHaveLength(100);
      expect(variant.tensionSeed.length).toBeGreaterThan(0);
      expect(variant.coherenceScore).toBeGreaterThanOrEqual(0);
      expect(variant.coherenceScore).toBeLessThanOrEqual(1);
      expect(variant.distinctnessScore).toBeGreaterThanOrEqual(0);
      expect(variant.distinctnessScore).toBeLessThanOrEqual(1);
    }
  });

  it("retries invalid generations until a valid candidate succeeds", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t, { protoPersonaCount: 1 });
    const studyId = await insertStudy(t, packId, { runBudget: 50 });

    mockedGenerateWithModel
      .mockImplementationOnce(async () =>
        createAiResult(makeCandidate({ firstPersonBio: makeBio(50) })),
      )
      .mockImplementationOnce(async () =>
        createAiResult(makeCandidate({ behaviorRules: makeBehaviorRules(3) })),
      )
      .mockImplementation(async () => createAiResult(makeCandidate()));

    const summary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId },
    );

    const variants = await t.run(async (ctx) =>
      ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
        .collect(),
    );

    expect(summary.acceptedCount).toBe(50);
    expect(summary.rejectedCount).toBe(0);
    expect(summary.retryCount).toBe(2);
    expect(variants).toHaveLength(50);
    expect(variants.every((variant) => variant.accepted)).toBe(true);
  });

  it("stores exhausted variants with accepted=false and reports the shortfall", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t, { protoPersonaCount: 1 });
    const studyId = await insertStudy(t, packId, { runBudget: 50 });
    let callCount = 0;

    mockedGenerateWithModel.mockImplementation(async () => {
      callCount += 1;
      if (callCount <= 4) {
        return createAiResult(makeCandidate({ firstPersonBio: makeBio(40) }));
      }

      return createAiResult(makeCandidate());
    });

    const summary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId },
    );

    const variants = await t.run(async (ctx) =>
      ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
        .collect(),
    );

    expect(summary.acceptedCount).toBe(49);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.retryCount).toBe(3);
    expect(variants).toHaveLength(50);
    expect(variants.filter((variant) => variant.accepted)).toHaveLength(49);
    expect(variants.filter((variant) => !variant.accepted)).toHaveLength(1);
  });

  it("requires a published pack and enforces budget bounds plus the default budget", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const draftPackId = await createDraftPack(t, { protoPersonaCount: 1 });
    const publishedPackId = await createPublishedPack(t, { protoPersonaCount: 1 });
    const archivedPackId = await archivePublishedPack(t, { protoPersonaCount: 1 });

    mockedGenerateWithModel.mockImplementation(async () =>
      createAiResult(makeCandidate()),
    );

    await expect(
      asResearcher.action(variantGenerationApi.generateVariantsForStudy, {
        studyId: await insertStudy(t, draftPackId, { runBudget: 50 }),
      }),
    ).rejects.toThrow(/published/i);

    await expect(
      asResearcher.action(variantGenerationApi.generateVariantsForStudy, {
        studyId: await insertStudy(t, archivedPackId, { runBudget: 50 }),
      }),
    ).rejects.toThrow(/published/i);

    await expect(
      asResearcher.action(variantGenerationApi.generateVariantsForStudy, {
        studyId: await insertStudy(t, publishedPackId, { runBudget: 49 }),
      }),
    ).rejects.toThrow(/50.*100/i);

    const minBudgetStudyId = await insertStudy(t, publishedPackId, { runBudget: 50 });
    const minBudgetSummary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId: minBudgetStudyId },
    );
    expect(minBudgetSummary.acceptedCount).toBe(50);

    const maxBudgetStudyId = await insertStudy(t, publishedPackId, { runBudget: 100 });
    const maxBudgetSummary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId: maxBudgetStudyId },
    );
    expect(maxBudgetSummary.acceptedCount).toBe(100);

    await expect(
      asResearcher.action(variantGenerationApi.generateVariantsForStudy, {
        studyId: await insertStudy(t, publishedPackId, { runBudget: 101 }),
      }),
    ).rejects.toThrow(/50.*100/i);

    const defaultBudgetStudyId = await insertStudy(t, publishedPackId, {
      runBudget: undefined,
    });
    const defaultBudgetSummary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId: defaultBudgetStudyId },
    );
    expect(defaultBudgetSummary.acceptedCount).toBe(64);
  });

  it("is idempotent per study and does not double-write variants", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t, { protoPersonaCount: 2 });
    const studyId = await insertStudy(t, packId, { runBudget: 50 });

    mockedGenerateWithModel.mockImplementation(async () =>
      createAiResult(makeCandidate()),
    );

    const firstSummary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId },
    );
    const secondSummary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId },
    );

    const variants = await t.run(async (ctx) =>
      ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
        .collect(),
    );

    expect(firstSummary.acceptedCount).toBe(50);
    expect(secondSummary.acceptedCount).toBe(50);
    expect(variants).toHaveLength(50);
  });

  it("supports packs with many axes while keeping values normalized", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const packId = await createPublishedPack(t, {
      protoPersonaCount: 1,
      axisCount: 15,
    });
    const studyId = await insertStudy(t, packId, { runBudget: 50 });

    mockedGenerateWithModel.mockImplementation(async () =>
      createAiResult(makeCandidate()),
    );

    const summary = await asResearcher.action(
      variantGenerationApi.generateVariantsForStudy,
      { studyId },
    );
    const variants = await t.run(async (ctx) =>
      ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
        .collect(),
    );

    expect(summary.acceptedCount).toBe(50);
    expect(variants).toHaveLength(50);
    expect(variants.every((variant) => variant.axisValues.length === 15)).toBe(true);
    expect(
      variants.every((variant) =>
        variant.axisValues.every(
          (axisValue) => axisValue.value >= -1 && axisValue.value <= 1,
        ),
      ),
    ).toBe(true);
  });
});

async function createDraftPack(
  t: ReturnType<typeof createTest>,
  {
    protoPersonaCount,
    axisCount = 2,
  }: { protoPersonaCount: number; axisCount?: number },
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const sharedAxes = Array.from({ length: axisCount }, (_, index) => makeAxis(index));

  const packId = await asResearcher.mutation(api.personaPacks.createDraft, {
    pack: {
      name: "Checkout Pack",
      description: "Pack for checkout validation",
      context: "US e-commerce checkout",
      sharedAxes,
    },
  });

  for (let index = 0; index < protoPersonaCount; index += 1) {
    await asResearcher.mutation(api.personaPacks.createProtoPersona, {
      packId,
      protoPersona: {
        name: `Proto Persona ${index + 1}`,
        summary: `Summary for proto persona ${index + 1}`,
        axes: sharedAxes.slice(0, Math.min(axisCount, index + 2)),
        evidenceSnippets: Array.from(
          { length: Math.min(5, index + 1) },
          (_, evidenceIndex) =>
            `Evidence ${evidenceIndex + 1} for proto persona ${index + 1}`,
        ),
        notes: `Notes for proto persona ${index + 1}`,
      },
    });
  }

  return packId;
}

async function createPublishedPack(
  t: ReturnType<typeof createTest>,
  options: { protoPersonaCount: number; axisCount?: number },
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await createDraftPack(t, options);
  await asResearcher.mutation(api.personaPacks.publish, { packId });
  return packId;
}

async function archivePublishedPack(
  t: ReturnType<typeof createTest>,
  options: { protoPersonaCount: number; axisCount?: number },
) {
  const asResearcher = t.withIdentity(researchIdentity);
  const packId = await createPublishedPack(t, options);
  await asResearcher.mutation(api.personaPacks.archive, { packId });
  return packId;
}

async function insertStudy(
  t: ReturnType<typeof createTest>,
  personaPackId: Id<"personaPacks">,
  { runBudget }: { runBudget: number | undefined },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: researchIdentity.tokenIdentifier,
      personaPackId,
      name: "Study for variant generation",
      description: "Variant generation regression study",
      taskSpec: {
        scenario: "Buy a pair of shoes",
        goal: "Complete checkout with confidence",
        startingUrl: "https://example.com/checkout",
        allowedDomains: ["example.com"],
        allowedActions: ["goto", "click", "type", "finish"],
        forbiddenActions: [],
        successCriteria: ["Order submitted"],
        stopConditions: ["Blocked by guardrail"],
        postTaskQuestions: ["How confident did you feel?"],
        maxSteps: 25,
        maxDurationSec: 600,
        environmentLabel: "staging",
        locale: "en-US",
        viewport: { width: 1440, height: 900 },
      },
      ...(runBudget === undefined ? {} : { runBudget }),
      activeConcurrency: 3,
      status: "draft",
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

function createAiResult(candidate: GeneratedVariantCandidate) {
  return {
    text: JSON.stringify(candidate),
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}
