import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./artifactResolver.ts": () => import("./artifactResolver"),
  "./schema.ts": () => import("./schema"),
};

const createTest = () => convexTest(schema, modules);
const artifactResolverApi = (api as any).artifactResolver;

const owningIdentity = {
  subject: "reviewer-1",
  tokenIdentifier: "org_1",
  name: "Reviewer One",
  email: "reviewer.one@example.com",
};

const BASE_TIME = new Date("2026-03-26T12:00:00.000Z");
const ARTIFACT_BASE_URL = "https://artifacts.example.com";
const ARTIFACT_SIGNING_SECRET = "artifact-signing-secret";

describe("artifact resolver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    process.env.ARTIFACT_BASE_URL = ARTIFACT_BASE_URL;
    process.env.CALLBACK_SIGNING_SECRET = ARTIFACT_SIGNING_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ARTIFACT_BASE_URL;
    delete process.env.CALLBACK_SIGNING_SECRET;
  });

  it("returns a signed artifact URL with a default four-hour expiry", async () => {
    const t = createTest();
    const asOwner = t.withIdentity(owningIdentity);
    const { runId } = await seedArtifactFixture(t, owningIdentity.tokenIdentifier);

    const url = await asOwner.query(artifactResolverApi.getArtifactUrl, {
      key: `runs/${runId}/manifest.json`,
    });

    const parsedUrl = new URL(url);

    expect(parsedUrl.origin).toBe(ARTIFACT_BASE_URL);
    expect(parsedUrl.pathname).toBe(
      `/artifacts/${encodeURIComponent(`runs/${runId}/manifest.json`)}`,
    );
    expect(parsedUrl.searchParams.get("expires")).toBe(
      String(BASE_TIME.getTime() + 14_400_000),
    );
    expect(parsedUrl.searchParams.get("signature")).toBeTruthy();
  });

  it("uses the org's configured signed URL expiry when present", async () => {
    const t = createTest();
    const asOwner = t.withIdentity(owningIdentity);
    const { runId } = await seedArtifactFixture(t, owningIdentity.tokenIdentifier);

    await t.run(async (ctx) =>
      ctx.db.insert(
        "settings",
        {
          orgId: owningIdentity.tokenIdentifier,
          domainAllowlist: ["example.com"],
          maxConcurrency: 20,
          modelConfig: [],
          runBudgetCap: 100,
          updatedBy: owningIdentity.tokenIdentifier,
          updatedAt: Date.now(),
          signedUrlExpirySeconds: 900,
        } as any,
      ),
    );

    const url = await asOwner.query(artifactResolverApi.getArtifactUrl, {
      key: `runs/${runId}/manifest.json`,
    });

    expect(new URL(url).searchParams.get("expires")).toBe(
      String(BASE_TIME.getTime() + 900_000),
    );
  });
});

type TestInstance = ReturnType<typeof createTest>;

async function seedArtifactFixture(t: TestInstance, orgId: string) {
  const configId = await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId,
      name: "Artifact store config",
      description: "Config for artifact resolver tests",
      context: "Checkout",
      sharedAxes: [
        {
          key: "digital_confidence",
          label: "Digital confidence",
          description: "Comfort level with online checkout",
          lowAnchor: "Hesitant",
          midAnchor: "Comfortable",
          highAnchor: "Power user",
          weight: 1,
        },
      ],
      status: "published",
      version: 1,
      createdBy: orgId,
      updatedBy: orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      name: "Careful shopper",
      summary: "Moves carefully through checkout.",
      axes: [],
      sourceRefs: [],
      evidenceSnippets: [],
      notes: "Artifact fixture",
      sourceType: "manual",
    }),
  );

  const studyId = await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId,
      name: "Artifact study",
      description: "Study for signed artifact URLs",
      personaConfigId: configId,
      status: "running",
      runBudget: 50,
      activeConcurrency: 1,
      taskSpec: {
        scenario: "Complete checkout.",
        goal: "Reach confirmation.",
        startingUrl: "https://example.com/checkout",
        allowedDomains: ["example.com"],
        allowedActions: ["goto", "click", "finish"],
        forbiddenActions: [],
        successCriteria: ["Confirmation visible"],
        stopConditions: ["Leave the site"],
        postTaskQuestions: ["Did you complete the task?"],
        maxSteps: 10,
        maxDurationSec: 300,
        environmentLabel: "staging",
        locale: "en-US",
        viewport: { width: 1280, height: 720 },
      },
      createdBy: orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

  const personaVariantId = await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaConfigId: configId,
      syntheticUserId,
      axisValues: [{ key: "digital_confidence", value: -0.4 }],
      edgeScore: 0.7,
      firstPersonBio: "I move carefully through checkout and avoid risky decisions online.",
      tensionSeed: "Needs reassurance before committing to payment.",
      behaviorRules: [
        "Double-check totals before continuing.",
        "Pause when unexpected fees appear.",
        "Read labels carefully.",
        "Prefer obvious next steps.",
        "Avoid guessing when an error occurs.",
      ],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    }),
  );

  const runId = await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId,
      personaVariantId,
      syntheticUserId,
      status: "success",
      workerSessionId: "worker-session-1",
      stepCount: 3,
      durationSec: 45,
      frustrationCount: 0,
      milestoneKeys: [],
      artifactManifestKey: "runs/run_123/manifest.json",
      summaryKey: "runs/run_123/summary.json",
      startedAt: Date.now(),
      endedAt: Date.now(),
    }),
  );

  return {
    studyId,
    runId: runId as Id<"runs">,
  };
}
