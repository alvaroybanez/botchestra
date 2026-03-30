import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./studies.ts": () => import("./studies"),
};

const createTest = () => convexTest(schema, modules);

const adminIdentity = {
  subject: "admin-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Admin One",
  email: "admin.one@example.com",
  role: "admin",
};

const researcherIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Researcher One",
  email: "researcher.one@example.com",
  role: "researcher",
};

const reviewerIdentity = {
  subject: "reviewer-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Reviewer One",
  email: "reviewer.one@example.com",
  role: "reviewer",
};

const makeTaskSpec = (allowedDomains: string[]) => ({
  scenario: "Complete checkout for a pair of shoes.",
  goal: "Reach order confirmation.",
  startingUrl: `https://${allowedDomains[0]}/products/shoes`,
  allowedDomains,
  allowedActions: ["goto", "click", "type", "finish"] as (
    | "goto"
    | "click"
    | "type"
    | "select"
    | "scroll"
    | "wait"
    | "back"
    | "finish"
    | "abort"
  )[],
  forbiddenActions: ["payment_submission"] as (
    | "external_download"
    | "payment_submission"
    | "email_send"
    | "sms_send"
    | "captcha_bypass"
    | "account_creation_without_fixture"
    | "cross_domain_escape"
    | "file_upload_unless_allowed"
  )[],
  successCriteria: ["Order confirmation is visible."],
  stopConditions: ["The user leaves the allowed domain."],
  postTaskQuestions: ["Did you complete the task?"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
});

describe("settings.getSettings", () => {
  it("returns org defaults for admins before anything is persisted", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);

    const settings = await asAdmin.query((api as any).settings.getSettings, {});

    expect(settings).toMatchObject({
      orgId: adminIdentity.tokenIdentifier,
      domainAllowlist: [],
      maxConcurrency: 30,
      modelConfig: [],
      runBudgetCap: 100,
      budgetLimits: {},
      browserPolicy: {
        blockAnalytics: false,
        blockHeavyMedia: false,
        screenshotFormat: "jpeg",
        screenshotMode: "milestones",
      },
      signedUrlExpirySeconds: 14400,
      updatedBy: null,
      updatedAt: null,
    });
  });

  it("blocks non-admins from viewing settings", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asReviewer = t.withIdentity(reviewerIdentity);

    await expect(
      asResearcher.query((api as any).settings.getSettings, {}),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.query((api as any).settings.getSettings, {}),
    ).rejects.toThrowError("FORBIDDEN");
  });
});

describe("settings.updateSettings", () => {
  it("creates, normalizes, and persists every settings category", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);

    const updated = await asAdmin.mutation((api as any).settings.updateSettings, {
      patch: {
        domainAllowlist: [
          " https://Example.com/checkout ",
          "staging.example.com",
          "example.com",
        ],
        maxConcurrency: 12,
        modelConfig: [
          { taskCategory: "expansion", modelId: "model-expansion" },
          { taskCategory: "action", modelId: "model-action" },
        ],
        runBudgetCap: 8,
        budgetLimits: {
          maxTokensPerStudy: 1200,
          maxBrowserSecPerStudy: 900,
        },
        browserPolicy: {
          blockAnalytics: true,
          blockHeavyMedia: true,
          screenshotFormat: "png",
          screenshotMode: "all",
        },
        signedUrlExpirySeconds: 7200,
      },
    });

    expect(updated).toMatchObject({
      orgId: adminIdentity.tokenIdentifier,
      domainAllowlist: ["example.com", "staging.example.com"],
      maxConcurrency: 12,
      modelConfig: [
        { taskCategory: "expansion", modelId: "model-expansion" },
        { taskCategory: "action", modelId: "model-action" },
      ],
      runBudgetCap: 8,
      budgetLimits: {
        maxTokensPerStudy: 1200,
        maxBrowserSecPerStudy: 900,
      },
      browserPolicy: {
        blockAnalytics: true,
        blockHeavyMedia: true,
        screenshotFormat: "png",
        screenshotMode: "all",
      },
      signedUrlExpirySeconds: 7200,
      updatedBy: adminIdentity.tokenIdentifier,
    });
    expect(updated.updatedAt).toBeTypeOf("number");

    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("settings")
        .withIndex("by_orgId", (query) => query.eq("orgId", adminIdentity.tokenIdentifier))
        .unique(),
    );

    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({
      domainAllowlist: ["example.com", "staging.example.com"],
      maxConcurrency: 12,
      runBudgetCap: 8,
      updatedBy: adminIdentity.tokenIdentifier,
    });
  });

  it("rejects unknown model categories and blocks non-admin mutation access", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const asResearcher = t.withIdentity(researcherIdentity);

    await expect(
      asAdmin.mutation((api as any).settings.updateSettings, {
        patch: {
          modelConfig: [{ taskCategory: "unknown", modelId: "bad-model" }],
        },
      }),
    ).rejects.toThrow();

    await expect(
      asResearcher.mutation((api as any).settings.updateSettings, {
        patch: { maxConcurrency: 4 },
      }),
    ).rejects.toThrowError("FORBIDDEN");
  });
});

describe("settings domain mutations", () => {
  it("adds, deduplicates, and removes allowlist domains", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);

    await asAdmin.mutation((api as any).settings.addDomainToAllowlist, {
      domain: "Checkout.Example.com",
    });
    await asAdmin.mutation((api as any).settings.addDomainToAllowlist, {
      domain: "https://checkout.example.com/flow",
    });

    const afterAdd = await asAdmin.query((api as any).settings.getSettings, {});
    expect(afterAdd.domainAllowlist).toEqual(["checkout.example.com"]);

    const afterRemove = await asAdmin.mutation(
      (api as any).settings.removeDomainFromAllowlist,
      {
        domain: "checkout.example.com",
      },
    );

    expect(afterRemove.domainAllowlist).toEqual([]);
  });
});

describe("settings effects on subsequent studies", () => {
  it("caps new study limits and validates launches against the latest allowlist", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const asResearcher = t.withIdentity(researcherIdentity);
    const configId = await insertPack(t);

    await asAdmin.mutation((api as any).settings.updateSettings, {
      patch: {
        domainAllowlist: ["example.com"],
        maxConcurrency: 3,
        runBudgetCap: 7,
      },
    });

    const cappedStudy = await asResearcher.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: configId,
        name: "Capped checkout study",
        taskSpec: makeTaskSpec(["example.com"]),
        runBudget: 25,
        activeConcurrency: 9,
      },
    });

    expect(cappedStudy.runBudget).toBe(7);
    expect(cappedStudy.activeConcurrency).toBe(3);

    await asAdmin.mutation((api as any).settings.updateSettings, {
      patch: {
        domainAllowlist: ["new.example"],
      },
    });

    const updatedDomainStudy = await asResearcher.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: configId,
        name: "Updated allowlist study",
        taskSpec: makeTaskSpec(["new.example"]),
        runBudget: 6,
        activeConcurrency: 2,
      },
    });

    const passingValidation = await asResearcher.mutation(
      api.studies.validateStudyLaunch,
      {
        studyId: updatedDomainStudy._id,
      },
    );
    const failingValidation = await asResearcher.mutation(
      api.studies.validateStudyLaunch,
      {
        studyId: cappedStudy._id,
      },
    );

    expect(passingValidation).toEqual({ pass: true, reasons: [] });
    expect(failingValidation.pass).toBe(false);
    expect(failingValidation.reasons).toContain(
      'Domain "example.com" is not on the allowlist.',
    );
  });
});

async function insertPack(t: ReturnType<typeof createTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: adminIdentity.tokenIdentifier,
      name: "Checkout persona configuration",
      description: "Published config for settings tests",
      context: "US e-commerce checkout",
      sharedAxes: [
        {
          key: "digital_confidence",
          label: "Digital confidence",
          description: "Comfort using digital products",
          lowAnchor: "Very hesitant",
          midAnchor: "Comfortable enough",
          highAnchor: "Power user",
          weight: 1,
        },
      ],
      version: 2,
      status: "published",
      createdBy: adminIdentity.tokenIdentifier,
      updatedBy: adminIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}
