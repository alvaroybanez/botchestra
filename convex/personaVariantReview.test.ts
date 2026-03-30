import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./personaVariantReview.ts": () => import("./personaVariantReview"),
};
const createTest = () => convexTest(schema, modules);

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

const otherIdentity = {
  subject: "researcher-2",
  tokenIdentifier: "researcher-2",
  name: "Researcher Two",
  email: "researcher.two@example.com",
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

describe("personaVariantReview.getStudyVariantReview", () => {
  it("returns accepted variants with synthetic user names for the study's config", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const sharedAxes = [makeAxis(0), makeAxis(1)];
    const configId = await t.run(async (ctx) =>
      ctx.db.insert("personaConfigs", {
        orgId: researchIdentity.tokenIdentifier,
        name: "Checkout Config",
        description: "Config for checkout studies",
        context: "US e-commerce checkout",
        sharedAxes,
        version: 2,
        status: "published",
        createdBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const cautiousSyntheticUserId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        configId,
        name: "Cautious shopper",
        summary: "Double-checks totals before submitting payment.",
        axes: sharedAxes,
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: ["Looks for hidden fees"],
      }),
    );
    const confidentSyntheticUserId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        configId,
        name: "Confident repeat buyer",
        summary: "Moves quickly through familiar storefronts.",
        axes: sharedAxes,
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: ["Prefers fast checkout"],
      }),
    );
    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: researchIdentity.tokenIdentifier,
        personaConfigId: configId,
        name: "Checkout review",
        description: "Review generated personas before launch",
        taskSpec: {
          scenario: "Purchase running shoes",
          goal: "Complete checkout",
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
        runBudget: 64,
        activeConcurrency: 4,
        status: "draft",
        createdBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await insertVariant(t, {
      studyId,
      configId,
      syntheticUserId: cautiousSyntheticUserId,
      axisValues: [
        { key: "axis_1", value: -0.6 },
        { key: "axis_2", value: 0.2 },
      ],
      edgeScore: 0.81,
      coherenceScore: 0.74,
      distinctnessScore: 0.9,
      accepted: true,
      firstPersonBio:
        "Careful shopper who pauses at totals, looks for fee transparency, and wants reassurance before committing to a final purchase.",
    });
    await insertVariant(t, {
      studyId,
      configId,
      syntheticUserId: confidentSyntheticUserId,
      axisValues: [
        { key: "axis_1", value: 0.72 },
        { key: "axis_2", value: -0.1 },
      ],
      edgeScore: 0.66,
      coherenceScore: 0.91,
      distinctnessScore: 0.7,
      accepted: true,
      firstPersonBio:
        "Experienced buyer who skims familiar screens, expects autofill to work, and only slows down when something feels inconsistent.",
    });
    await insertVariant(t, {
      studyId,
      configId,
      syntheticUserId: confidentSyntheticUserId,
      axisValues: [
        { key: "axis_1", value: 0.2 },
        { key: "axis_2", value: 0.1 },
      ],
      edgeScore: 0.2,
      coherenceScore: 0.4,
      distinctnessScore: 0.3,
      accepted: false,
      firstPersonBio: "Rejected persona variant that should not appear in the review grid.",
    });

    const review = await asResearcher.query(api.personaVariantReview.getStudyVariantReview, {
      studyId,
    });

    expect(review).not.toBeNull();
    expect(review?.study).not.toBeNull();
    expect(review?.study?._id).toBe(studyId);
    expect(review?.study?.name).toBe("Checkout review");
    expect(review?.config.name).toBe("Checkout Config");
    expect(review?.syntheticUsers).toHaveLength(2);
    expect(review?.variants).toHaveLength(2);
    expect(
      review?.variants.map((variant: { syntheticUserName: string }) => variant.syntheticUserName),
    ).toEqual(
      expect.arrayContaining(["Cautious shopper", "Confident repeat buyer"]),
    );
    expect(
      review?.variants.every((variant: { syntheticUserId: Id<"syntheticUsers"> }) =>
        review.syntheticUsers.some(
          (syntheticUser: { _id: Id<"syntheticUsers"> }) =>
            syntheticUser._id === variant.syntheticUserId,
        ),
      ),
    ).toBe(true);
  });

  it("returns null when the study belongs to another organization", async () => {
    const t = createTest();
    const asOtherResearcher = t.withIdentity(otherIdentity);
    const configId = await t.run(async (ctx) =>
      ctx.db.insert("personaConfigs", {
        orgId: researchIdentity.tokenIdentifier,
        name: "Private Config",
        description: "Only visible to its organization",
        context: "Internal",
        sharedAxes: [makeAxis(0)],
        version: 2,
        status: "published",
        createdBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: researchIdentity.tokenIdentifier,
        personaConfigId: configId,
        name: "Private study",
        description: "Org scoped",
        taskSpec: {
          scenario: "Review checkout",
          goal: "Complete checkout",
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
        activeConcurrency: 2,
        status: "draft",
        createdBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const review = await asOtherResearcher.query(
      api.personaVariantReview.getStudyVariantReview,
      { studyId },
    );

    expect(review).toBeNull();
  });

  it("returns config-scoped review data with linked studies for config detail pages", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const sharedAxes = [makeAxis(0), makeAxis(1)];
    const configId = await t.run(async (ctx) =>
      ctx.db.insert("personaConfigs", {
        orgId: researchIdentity.tokenIdentifier,
        name: "Published Checkout Config",
        description: "Config for linked-study review",
        context: "Checkout flows",
        sharedAxes,
        version: 2,
        status: "published",
        createdBy: researchIdentity.tokenIdentifier,
        updatedBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const syntheticUserId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        configId,
        name: "Careful shopper",
        summary: "Checks totals before continuing.",
        axes: sharedAxes,
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: ["Reads each line item"],
      }),
    );
    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: researchIdentity.tokenIdentifier,
        personaConfigId: configId,
        name: "Linked study",
        description: "Config detail review study",
        taskSpec: {
          scenario: "Purchase a subscription",
          goal: "Complete checkout",
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
        runBudget: 64,
        activeConcurrency: 4,
        status: "persona_review",
        createdBy: researchIdentity.tokenIdentifier,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await insertVariant(t, {
      studyId,
      configId,
      syntheticUserId,
      axisValues: [
        { key: "axis_1", value: -0.55 },
        { key: "axis_2", value: 0.48 },
      ],
      edgeScore: 0.87,
      coherenceScore: 0.79,
      distinctnessScore: 0.82,
      accepted: true,
      firstPersonBio:
        "Careful buyer who wants clarity around totals, notices missing context quickly, and pauses whenever a checkout flow feels ambiguous.",
    });

    const review = await asResearcher.query(
      api.personaVariantReview.getPackVariantReview,
      { configId },
    );

    expect(review).not.toBeNull();
    expect(review?.config.name).toBe("Published Checkout Config");
    expect(review?.studies).toHaveLength(1);
    expect(review?.studies[0]).toMatchObject({
      _id: studyId,
      name: "Linked study",
      acceptedVariantCount: 1,
    });
    expect(review?.selectedStudy?._id).toBe(studyId);
    expect(review?.variants).toHaveLength(1);
    expect(review?.variants[0]?.syntheticUserName).toBe("Careful shopper");
  });
});

async function insertVariant(
  t: ReturnType<typeof createTest>,
  {
    studyId,
    configId,
    syntheticUserId,
    axisValues,
    edgeScore,
    coherenceScore,
    distinctnessScore,
    accepted,
    firstPersonBio,
  }: {
    studyId: Id<"studies">;
    configId: Id<"personaConfigs">;
    syntheticUserId: Id<"syntheticUsers">;
    axisValues: { key: string; value: number }[];
    edgeScore: number;
    coherenceScore: number;
    distinctnessScore: number;
    accepted: boolean;
    firstPersonBio: string;
  },
) {
  await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaConfigId: configId,
      syntheticUserId,
      axisValues,
      edgeScore,
      tensionSeed: "Worries about entering payment details on the wrong screen.",
      firstPersonBio,
      behaviorRules: [
        "Reads labels carefully.",
        "Looks for reassurance cues.",
        "Notices missing context quickly.",
        "Avoids risky actions without confidence.",
        "Compares totals before submitting.",
      ],
      coherenceScore,
      distinctnessScore,
      accepted,
    }),
  );
}
