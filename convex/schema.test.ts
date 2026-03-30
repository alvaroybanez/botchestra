import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";

// convex-test needs a modules map with a "_generated" path to derive the module
// prefix. We provide an explicit map instead of import.meta.glob so tests work
// with both `bunx vitest` and `bun test`. Since smoke tests only use t.run()
// (direct DB access), no module is ever actually loaded.
const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
};

// ─── Shared fixtures ───────────────────────────────────────────────────────

const sampleAxis = {
  key: "digital_confidence",
  label: "Digital Confidence",
  description: "How comfortable the user is with digital products",
  lowAnchor: "Very hesitant",
  midAnchor: "Moderately confident",
  highAnchor: "Power user",
  weight: 1.0,
};

const sampleTaskSpec = {
  scenario: "A new user wants to complete checkout.",
  goal: "Complete the purchase flow.",
  startingUrl: "https://example.com/shop",
  allowedDomains: ["example.com"],
  allowedActions: ["goto", "click", "type", "finish"] as ("goto" | "click" | "type" | "select" | "scroll" | "wait" | "back" | "finish" | "abort")[],
  forbiddenActions: ["payment_submission", "email_send"] as ("external_download" | "payment_submission" | "email_send" | "sms_send" | "captcha_bypass" | "account_creation_without_fixture" | "cross_domain_escape" | "file_upload_unless_allowed")[],
  successCriteria: ["Order confirmation page reached"],
  stopConditions: ["User navigates off domain"],
  postTaskQuestions: ["How easy was checkout?"],
  maxSteps: 30,
  maxDurationSec: 300,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1280, height: 800 },
};

// ─── 1. personaPacks ───────────────────────────────────────────────────────

describe("personaPacks", () => {
  it("inserts and reads back a minimal personaPack", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) => {
      return await ctx.db.insert("personaPacks", {
        name: "E-commerce Shoppers",
        description: "Pack for e-commerce checkout studies",
        context: "US online retail context",
        sharedAxes: [sampleAxis],
        version: 1,
        status: "draft",
        orgId: "org_123",
        createdBy: "user_abc",
        createdAt: now,
        updatedAt: now,
      });
    });

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.name).toBe("E-commerce Shoppers");
    expect(doc!.status).toBe("draft");
    expect(doc!.sharedAxes).toHaveLength(1);
    expect(doc!.sharedAxes[0].key).toBe("digital_confidence");
  });
});

// ─── 2. syntheticUsers ─────────────────────────────────────────────────────

describe("syntheticUsers", () => {
  it("inserts and reads back a minimal syntheticUser", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) => {
      return await ctx.db.insert("personaPacks", {
        name: "Pack A",
        description: "desc",
        context: "ctx",
        sharedAxes: [],
        version: 1,
        status: "draft",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      });
    });

    const id = await t.run(async (ctx) => {
      return await ctx.db.insert("syntheticUsers", {
        packId,
        name: "Careful Carol",
        summary: "A cautious, detail-oriented shopper",
        axes: [sampleAxis],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: ["Prefers to read all instructions before clicking"],
        notes: "High friction tolerance",
      });
    });

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.name).toBe("Careful Carol");
    expect(doc!.packId).toBe(packId);
    expect(doc!.sourceType).toBe("manual");
    expect(doc!.notes).toBe("High friction tolerance");
  });
});

// ─── 3. personaVariants ───────────────────────────────────────────────────

describe("personaVariants", () => {
  it("inserts and reads back a minimal personaVariant", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack B",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "published",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Checkout Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "draft",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const protoId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        packId,
        name: "Quick Quinn",
        summary: "Impatient and efficient",
        axes: [],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: [],
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: packId,
        syntheticUserId: protoId,
        axisValues: [{ key: "digital_confidence", value: 0.8 }],
        edgeScore: 0.75,
        tensionSeed: "Trusts interfaces too quickly",
        firstPersonBio: "I know what I want. I click fast and move on.",
        behaviorRules: ["Skip instructions", "Click first button available"],
        coherenceScore: 0.9,
        distinctnessScore: 0.85,
        accepted: true,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.accepted).toBe(true);
    expect(doc!.axisValues).toHaveLength(1);
    expect(doc!.axisValues[0].value).toBe(0.8);
    expect(doc!.studyId).toBe(studyId);
  });
});

// ─── 4. studies ───────────────────────────────────────────────────────────

describe("studies", () => {
  it("inserts and reads back a minimal study", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack C",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "draft",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Checkout Flow v1",
        description: "Test the main checkout flow",
        taskSpec: {
          ...sampleTaskSpec,
          credentialsRef: "cred_checkout",
          randomSeed: "abc123",
        },
        runBudget: 64,
        activeConcurrency: 10,
        status: "draft",
        launchRequestedBy: "user_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.name).toBe("Checkout Flow v1");
    expect(doc!.status).toBe("draft");
    expect(doc!.taskSpec.startingUrl).toBe("https://example.com/shop");
    expect(doc!.taskSpec.maxSteps).toBe(30);
    expect(doc!.taskSpec.viewport.width).toBe(1280);
  });
});

// ─── 5. runs ──────────────────────────────────────────────────────────────

describe("runs", () => {
  it("inserts and reads back a minimal run", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack D",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "published",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Run Test Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "running",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const protoId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        packId,
        name: "Proto E",
        summary: "summary",
        axes: [],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: [],
      }),
    );

    const variantId = await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: packId,
        syntheticUserId: protoId,
        axisValues: [],
        edgeScore: 0.5,
        tensionSeed: "neutral",
        firstPersonBio: "A neutral persona.",
        behaviorRules: [],
        coherenceScore: 0.8,
        distinctnessScore: 0.8,
        accepted: true,
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId: variantId,
        syntheticUserId: protoId,
        status: "queued",
        frustrationCount: 0,
        milestoneKeys: [],
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("queued");
    expect(doc!.frustrationCount).toBe(0);
    expect(doc!.milestoneKeys).toHaveLength(0);
    expect(doc!.studyId).toBe(studyId);
  });

  it("accepts a run with full optional fields including selfReport", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack E",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "published",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Full Run Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "completed",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const protoId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        packId,
        name: "Proto F",
        summary: "summary",
        axes: [],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: [],
      }),
    );

    const variantId = await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: packId,
        syntheticUserId: protoId,
        axisValues: [],
        edgeScore: 0.5,
        tensionSeed: "neutral",
        firstPersonBio: "A neutral persona.",
        behaviorRules: [],
        coherenceScore: 0.8,
        distinctnessScore: 0.8,
        accepted: true,
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId: variantId,
        syntheticUserId: protoId,
        status: "success",
        startedAt: now,
        endedAt: now + 120_000,
        durationSec: 120,
        stepCount: 12,
        finalUrl: "https://example.com/confirmation",
        finalOutcome: "order_confirmed",
        selfReport: {
          perceivedSuccess: true,
          hardestPart: "Finding the CTA",
          confusion: "none",
          confidence: 0.9,
          suggestedChange: "Make CTA more prominent",
        },
        frustrationCount: 1,
        milestoneKeys: ["s3://bucket/run_001_step_001.png"],
        artifactManifestKey: "manifests/run_001.json",
        summaryKey: "summaries/run_001.json",
        workerSessionId: "worker_session_xyz",
        errorCode: undefined,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("success");
    expect(doc!.selfReport?.perceivedSuccess).toBe(true);
    expect(doc!.selfReport?.confidence).toBe(0.9);
    expect(doc!.stepCount).toBe(12);
  });
});

// ─── 6. runMilestones ─────────────────────────────────────────────────────

describe("runMilestones", () => {
  it("inserts and reads back a runMilestone", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack F",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "published",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Milestone Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "running",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const protoId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        packId,
        name: "Proto G",
        summary: "summary",
        axes: [],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: [],
      }),
    );

    const variantId = await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: packId,
        syntheticUserId: protoId,
        axisValues: [],
        edgeScore: 0.5,
        tensionSeed: "neutral",
        firstPersonBio: "Bio",
        behaviorRules: [],
        coherenceScore: 0.8,
        distinctnessScore: 0.8,
        accepted: true,
      }),
    );

    const runId = await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId: variantId,
        syntheticUserId: protoId,
        status: "running",
        frustrationCount: 0,
        milestoneKeys: [],
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("runMilestones", {
        runId,
        studyId,
        stepIndex: 1,
        timestamp: now,
        url: "https://example.com/cart",
        title: "Cart page",
        actionType: "goto",
        rationaleShort: "Navigated to cart to begin checkout",
        screenshotKey: "screenshots/run_001_step_001.png",
        note: "CTA was below the fold",
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.stepIndex).toBe(1);
    expect(doc!.actionType).toBe("goto");
    expect(doc!.runId).toBe(runId);
    expect(doc!.screenshotKey).toBe("screenshots/run_001_step_001.png");
  });
});

// ─── 7. issueClusters ─────────────────────────────────────────────────────

describe("issueClusters", () => {
  it("inserts and reads back an issueCluster", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack G",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "published",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Issue Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "analyzing",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const protoId = await t.run(async (ctx) =>
      ctx.db.insert("syntheticUsers", {
        packId,
        name: "Proto Issue",
        summary: "summary",
        axes: [],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: [],
      }),
    );

    const variantId = await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: packId,
        syntheticUserId: protoId,
        axisValues: [],
        edgeScore: 0.5,
        tensionSeed: "neutral",
        firstPersonBio: "Bio",
        behaviorRules: [],
        coherenceScore: 0.8,
        distinctnessScore: 0.8,
        accepted: true,
      }),
    );

    const runId = await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId: variantId,
        syntheticUserId: protoId,
        status: "hard_fail",
        frustrationCount: 3,
        milestoneKeys: [],
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("issueClusters", {
        studyId,
        title: "Checkout button hard to find",
        summary: "32% of users failed to locate the primary CTA",
        severity: "major",
        affectedRunCount: 20,
        affectedRunRate: 0.32,
        affectedSyntheticUserIds: [protoId],
        affectedAxisRanges: [
          { key: "digital_confidence", min: -1.0, max: 0.0 },
        ],
        representativeRunIds: [runId],
        replayConfidence: 0.85,
        evidenceKeys: ["evidence/cluster_001.png"],
        recommendation: "Increase button contrast and size",
        confidenceNote: "Based on 20 runs with consistent failure pattern",
        score: 0.78,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.title).toBe("Checkout button hard to find");
    expect(doc!.severity).toBe("major");
    expect(doc!.affectedAxisRanges).toHaveLength(1);
    expect(doc!.affectedAxisRanges[0].key).toBe("digital_confidence");
    expect(doc!.studyId).toBe(studyId);
  });
});

// ─── 8. studyReports ──────────────────────────────────────────────────────

describe("studyReports", () => {
  it("inserts and reads back a studyReport", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack H",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "published",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Report Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "completed",
        completedAt: now,
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const clusterId = await t.run(async (ctx) =>
      ctx.db.insert("issueClusters", {
        studyId,
        title: "Issue",
        summary: "summary",
        severity: "minor",
        affectedRunCount: 1,
        affectedRunRate: 0.1,
        affectedSyntheticUserIds: [],
        affectedAxisRanges: [],
        representativeRunIds: [],
        replayConfidence: 0.5,
        evidenceKeys: [],
        recommendation: "fix it",
        confidenceNote: "low",
        score: 0.1,
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("studyReports", {
        studyId,
        headlineMetrics: {
          completionRate: 0.68,
          abandonmentRate: 0.32,
          medianSteps: 8,
          medianDurationSec: 95,
        },
        issueClusterIds: [clusterId],
        segmentBreakdownKey: "segments/study_001.json",
        limitations: ["Synthetic personas only", "Single flow tested"],
        htmlReportKey: "reports/study_001.html",
        jsonReportKey: "reports/study_001.json",
        createdAt: now,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.headlineMetrics.completionRate).toBe(0.68);
    expect(doc!.headlineMetrics.abandonmentRate).toBe(0.32);
    expect(doc!.issueClusterIds).toHaveLength(1);
    expect(doc!.limitations).toHaveLength(2);
    expect(doc!.studyId).toBe(studyId);
  });
});

// ─── 9. credentials ───────────────────────────────────────────────────────

describe("credentials", () => {
  it("inserts and reads back a credential with scoped study IDs", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const packId = await t.run(async (ctx) =>
      ctx.db.insert("personaPacks", {
        name: "Pack Cred",
        description: "d",
        context: "c",
        sharedAxes: [],
        version: 1,
        status: "draft",
        orgId: "org_1",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const studyId = await t.run(async (ctx) =>
      ctx.db.insert("studies", {
        orgId: "org_1",
        personaPackId: packId,
        name: "Cred Study",
        taskSpec: sampleTaskSpec,
        runBudget: 64,
        activeConcurrency: 10,
        status: "draft",
        createdBy: "user_1",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert("credentials", {
        ref: "cred_checkout",
        label: "Staging checkout test account",
        encryptedPayload: "enc:base64==abcdef1234567890",
        description: "Shared test account for checkout studies",
        allowedStudyIds: [studyId],
        orgId: "org_1",
        createdBy: "user_admin",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.ref).toBe("cred_checkout");
    expect(doc!.label).toBe("Staging checkout test account");
    expect(doc!.orgId).toBe("org_1");
    expect(doc!.allowedStudyIds).toHaveLength(1);
  });

  it("inserts a credential without allowedStudyIds (unrestricted)", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert("credentials", {
        ref: "cred_global",
        label: "Global test account",
        encryptedPayload: "enc:base64==xyz",
        description: "Unrestricted credential",
        orgId: "org_1",
        createdBy: "user_admin",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.allowedStudyIds).toBeUndefined();
  });
});

// ─── 10. settings ─────────────────────────────────────────────────────────

describe("settings", () => {
  it("inserts and reads back org settings", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert("settings", {
        orgId: "org_123",
        domainAllowlist: ["example.com", "staging.example.com"],
        maxConcurrency: 20,
        modelConfig: [
          { taskCategory: "expansion", modelId: "gpt-4o" },
          { taskCategory: "action", modelId: "gpt-4o-mini" },
          { taskCategory: "summarization", modelId: "gpt-4o-mini" },
        ],
        runBudgetCap: 100,
        updatedBy: "user_admin",
        updatedAt: now,
      }),
    );

    const doc = await t.run(async (ctx) => ctx.db.get(id));

    expect(doc).not.toBeNull();
    expect(doc!.orgId).toBe("org_123");
    expect(doc!.domainAllowlist).toHaveLength(2);
    expect(doc!.maxConcurrency).toBe(20);
    expect(doc!.modelConfig).toHaveLength(3);
    expect(doc!.modelConfig[0].taskCategory).toBe("expansion");
    expect(doc!.runBudgetCap).toBe(100);
  });
});
