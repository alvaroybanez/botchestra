import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: vi.fn(),
}));

import { api } from "./_generated/api";
import schema from "./schema";
import { generateWithModel } from "../packages/ai/src/index";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./axisGeneration.ts": () => import("./axisGeneration"),
  "./personaConfigs.ts": () => import("./personaConfigs"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);
const mockedGenerateWithModel = vi.mocked(generateWithModel);
const axisGenerationApi = (api as any).axisGeneration;

const researcherIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Researcher One",
  email: "researcher.one@example.com",
  role: "researcher",
};

const adminIdentity = {
  subject: "admin-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Admin One",
  email: "admin.one@example.com",
  role: "admin",
};

const reviewerIdentity = {
  subject: "reviewer-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Reviewer One",
  email: "reviewer.one@example.com",
  role: "reviewer",
};

type AxisSuggestion = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: number;
};

const makeAxisSuggestion = (
  index: number,
  overrides: Partial<AxisSuggestion> = {},
): AxisSuggestion => ({
  key: `axis_${index}`,
  label: `Axis ${index}`,
  description: `Description for axis ${index}`,
  lowAnchor: `Low ${index}`,
  midAnchor: `Mid ${index}`,
  highAnchor: `High ${index}`,
  weight: 1,
  ...overrides,
});

describe("axisGeneration.suggestAxes", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("returns 3-5 valid axis suggestions for study managers", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const suggestions = [
      makeAxisSuggestion(1, { key: "price_sensitivity" }),
      makeAxisSuggestion(2, { key: "digital_confidence" }),
      makeAxisSuggestion(3, { key: "decision_speed" }),
    ];
    mockedGenerateWithModel.mockResolvedValue(createAiResult(suggestions));

    const result = await asResearcher.action(axisGenerationApi.suggestAxes, {
      name: "Checkout Config",
      context: "E-commerce checkout",
      description: "Shoppers comparing retailers and payment options.",
      existingAxisKeys: ["brand_loyalty"],
    });

    expect(result).toEqual(suggestions);
    expect(mockedGenerateWithModel).toHaveBeenCalledWith(
      "recommendation",
      expect.objectContaining({
        modelOverride: undefined,
      }),
    );
  });

  it("passes org-level recommendation model overrides into generateWithModel", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    mockedGenerateWithModel.mockResolvedValue(
      createAiResult([
        makeAxisSuggestion(1, { key: "support_reliance" }),
        makeAxisSuggestion(2, { key: "research_depth" }),
        makeAxisSuggestion(3, { key: "risk_tolerance" }),
      ]),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("settings", {
        orgId: adminIdentity.tokenIdentifier,
        domainAllowlist: [],
        maxConcurrency: 30,
        modelConfig: [
          {
            taskCategory: "recommendation",
            modelId: "org-recommendation-model",
          },
        ],
        runBudgetCap: 100,
        updatedBy: adminIdentity.tokenIdentifier,
        updatedAt: Date.now(),
      }),
    );

    await asAdmin.action(axisGenerationApi.suggestAxes, {
      name: "Support config",
      context: "B2B support portal",
      description: "Customers troubleshooting setup and billing issues.",
      existingAxisKeys: [],
    });

    expect(mockedGenerateWithModel).toHaveBeenCalledWith(
      "recommendation",
      expect.objectContaining({
        modelOverride: "org-recommendation-model",
      }),
    );
  });

  it("includes config metadata and existing axis keys in the prompt", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    mockedGenerateWithModel.mockResolvedValue(
      createAiResult([
        makeAxisSuggestion(1, { key: "comparison_style" }),
        makeAxisSuggestion(2, { key: "trust_threshold" }),
        makeAxisSuggestion(3, { key: "checkout_patience" }),
      ]),
    );

    await asResearcher.action(axisGenerationApi.suggestAxes, {
      name: "Travel booking config",
      context: "Multi-step flight booking flow",
      description: "Travelers comparing fares, baggage rules, and refund flexibility.",
      existingAxisKeys: ["budget_focus", "brand_loyalty"],
    });

    const options = mockedGenerateWithModel.mock.calls[0]?.[1];

    expect(options?.system).toContain("expert UX researcher");
    expect(options?.system).toContain("Domain Specificity");
    expect(options?.prompt).toContain("Travel booking config");
    expect(options?.prompt).toContain("Multi-step flight booking flow");
    expect(options?.prompt).toContain(
      "Travelers comparing fares, baggage rules, and refund flexibility.",
    );
    expect(options?.prompt).toContain("budget_focus, brand_loyalty");
  });

  it("throws a descriptive ConvexError when the model returns malformed JSON", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    mockedGenerateWithModel.mockResolvedValue(
      createTextOnlyResult("{ definitely not valid json"),
    );

    await expect(
      asResearcher.action(axisGenerationApi.suggestAxes, {
        name: "Checkout Config",
        context: "E-commerce checkout",
        description: "Shoppers comparing retailers and payment options.",
      }),
    ).rejects.toThrow("Failed to parse suggested axes JSON.");
  });

  it("supports an explicit forced error path for browser validation", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    await expect(
      asResearcher.action(axisGenerationApi.suggestAxes, {
        name: "Checkout Config",
        context: "E-commerce checkout",
        description: "Shoppers comparing retailers and payment options.",
        forceError: true,
      }),
    ).rejects.toThrow("Forced axis suggestion failure for testing.");

    expect(mockedGenerateWithModel).not.toHaveBeenCalled();
  });

  it("throws a descriptive ConvexError when required fields are missing", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    mockedGenerateWithModel.mockResolvedValue(
      createAiResult([
        {
          key: "price_sensitivity",
          label: "Price Sensitivity",
          description: "Sensitivity to checkout costs.",
          lowAnchor: "Price barely matters",
          midAnchor: "Balances cost and convenience",
          weight: 1,
        },
        makeAxisSuggestion(2, { key: "digital_confidence" }),
        makeAxisSuggestion(3, { key: "decision_speed" }),
      ]),
    );

    await expect(
      asResearcher.action(axisGenerationApi.suggestAxes, {
        name: "Checkout Config",
        context: "E-commerce checkout",
        description: "Shoppers comparing retailers and payment options.",
      }),
    ).rejects.toThrow(/invalid.*highAnchor/i);
  });

  it("rejects duplicate keys in the model response", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    mockedGenerateWithModel.mockResolvedValue(
      createAiResult([
        makeAxisSuggestion(1, { key: "price_sensitivity" }),
        makeAxisSuggestion(2, { key: "price_sensitivity" }),
        makeAxisSuggestion(3, { key: "decision_speed" }),
      ]),
    );

    await expect(
      asResearcher.action(axisGenerationApi.suggestAxes, {
        name: "Checkout Config",
        context: "E-commerce checkout",
        description: "Shoppers comparing retailers and payment options.",
      }),
    ).rejects.toThrow(/unique/i);
  });

  it("rejects non-snake_case keys in the model response", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    mockedGenerateWithModel.mockResolvedValue(
      createAiResult([
        makeAxisSuggestion(1, { key: "Price Sensitivity" }),
        makeAxisSuggestion(2, { key: "digital_confidence" }),
        makeAxisSuggestion(3, { key: "decision_speed" }),
      ]),
    );

    await expect(
      asResearcher.action(axisGenerationApi.suggestAxes, {
        name: "Checkout Config",
        context: "E-commerce checkout",
        description: "Shoppers comparing retailers and payment options.",
      }),
    ).rejects.toThrow(/snake_case/i);
  });

  it("defaults weight to 1 when the LLM omits it", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const axesWithoutWeight = [
      { key: "price_sensitivity", label: "Price Sensitivity", description: "Sensitivity to checkout costs.", lowAnchor: "Price barely matters", midAnchor: "Balances cost and convenience", highAnchor: "Always shops for deals" },
      { key: "digital_confidence", label: "Digital Confidence", description: "Comfort with digital interfaces.", lowAnchor: "Avoids technology", midAnchor: "Comfortable with basics", highAnchor: "Power user" },
      { key: "decision_speed", label: "Decision Speed", description: "How quickly decisions are made.", lowAnchor: "Very deliberate", midAnchor: "Moderate pace", highAnchor: "Impulsive" },
    ];
    mockedGenerateWithModel.mockResolvedValue(createAiResult(axesWithoutWeight));

    const result = await asResearcher.action(axisGenerationApi.suggestAxes, {
      name: "Checkout Config",
      context: "E-commerce checkout",
      description: "Shoppers comparing retailers and payment options.",
    });

    for (const axis of result) {
      expect(axis.weight).toBe(1);
    }
    expect(result).toHaveLength(3);
  });

  it("blocks reviewers from invoking the action", async () => {
    const t = createTest();
    const asReviewer = t.withIdentity(reviewerIdentity);

    await expect(
      asReviewer.action(axisGenerationApi.suggestAxes, {
        name: "Checkout Config",
        context: "E-commerce checkout",
        description: "Shoppers comparing retailers and payment options.",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mockedGenerateWithModel).not.toHaveBeenCalled();
  });
});

function createAiResult(payload: unknown) {
  return createTextOnlyResult(JSON.stringify(payload));
}

function createTextOnlyResult(text: string) {
  return {
    text,
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}
