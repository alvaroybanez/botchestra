import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./analysisNotes.ts": () => import("./analysisNotes"),
  "./schema.ts": () => import("./schema"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

const primaryAnalystIdentity = {
  subject: "analyst-a",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Analyst A",
  email: "analyst.a@example.com",
};

const secondaryAnalystIdentity = {
  subject: "analyst-b",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Analyst B",
  email: "analyst.b@example.com",
};

const otherOrgIdentity = {
  subject: "analyst-c",
  tokenIdentifier: "org_2",
  issuer: "https://factory.test",
  name: "Analyst C",
  email: "analyst.c@example.com",
};

const sampleTaskSpec = {
  scenario: "A shopper wants to complete checkout.",
  goal: "Submit the order successfully.",
  startingUrl: "https://example.com/shop",
  allowedDomains: ["example.com"],
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
  successCriteria: ["Order confirmation is visible"],
  stopConditions: ["The user leaves the allowed domain"],
  postTaskQuestions: ["Do you think you completed the task?"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
};

describe("analysisNotes.addNote", () => {
  it("appends each new note without overwriting existing entries", async () => {
    const t = createTest();
    const asAnalyst = t.withIdentity(primaryAnalystIdentity);
    const issueId = await insertIssueCluster(t, "org_1");

    await asAnalyst.mutation((api as any).analysisNotes.addNote, {
      issueId,
      note: "Checkout CTA disappears below the fold on smaller laptop viewports.",
    });
    await asAnalyst.mutation((api as any).analysisNotes.addNote, {
      issueId,
      note: "The issue clusters with frustration spikes at the payment step.",
    });

    const notes = await listIssueClusterNotes(t, issueId);

    expect(notes).toHaveLength(2);
    expect(notes.map((entry) => entry.note)).toEqual([
      "Checkout CTA disappears below the fold on smaller laptop viewports.",
      "The issue clusters with frustration spikes at the payment step.",
    ]);
  });

  it("preserves notes from multiple authors in insertion order", async () => {
    const t = createTest();
    const asPrimaryAnalyst = t.withIdentity(primaryAnalystIdentity);
    const asSecondaryAnalyst = t.withIdentity(secondaryAnalystIdentity);
    const issueId = await insertIssueCluster(t, "org_1");

    const firstNote = await asPrimaryAnalyst.mutation(
      (api as any).analysisNotes.addNote,
      {
        issueId,
        note: "This failure likely affects first-time buyers the most.",
      },
    );
    const secondNote = await asSecondaryAnalyst.mutation(
      (api as any).analysisNotes.addNote,
      {
        issueId,
        note: "Replay evidence confirms the dead-end is reproducible.",
      },
    );

    const notes = await listIssueClusterNotes(t, issueId);

    expect(notes.map((entry) => entry._id)).toEqual([firstNote._id, secondNote._id]);
    expect(notes.map((entry) => entry.authorId)).toEqual(["analyst-a", "analyst-b"]);
    expect(notes.map((entry) => entry.note)).toEqual([
      "This failure likely affects first-time buyers the most.",
      "Replay evidence confirms the dead-end is reproducible.",
    ]);
  });

  it("rejects note creation for issue clusters outside the caller org", async () => {
    const t = createTest();
    const asOtherOrg = t.withIdentity(otherOrgIdentity);
    const issueId = await insertIssueCluster(t, "org_1");

    await expect(
      asOtherOrg.mutation((api as any).analysisNotes.addNote, {
        issueId,
        note: "This should not be visible cross-org.",
      }),
    ).rejects.toThrowError("Issue cluster not found.");
  });

  it("requires authentication", async () => {
    const t = createTest();
    const issueId = await insertIssueCluster(t, "org_1");

    await expect(
      t.mutation((api as any).analysisNotes.addNote, {
        issueId,
        note: "Anonymous note",
      }),
    ).rejects.toThrowError("Not authenticated.");
  });
});

async function insertIssueCluster(
  t: ReturnType<typeof createTest>,
  orgId: string,
): Promise<Id<"issueClusters">> {
  const now = Date.now();

  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId,
      name: "Checkout pack",
      description: "Pack used for analyst note tests",
      context: "Checkout flow",
      sharedAxes: [],
      version: 1,
      status: "published",
      createdBy: orgId,
      updatedBy: orgId,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const studyId = await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId,
      personaPackId: packId,
      name: "Checkout analysis study",
      taskSpec: sampleTaskSpec,
      runBudget: 6,
      activeConcurrency: 2,
      status: "completed",
      createdBy: orgId,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("issueClusters", {
      studyId,
      title: "Checkout CTA hidden",
      summary: "The primary checkout action is easy to miss.",
      severity: "major",
      affectedRunCount: 3,
      affectedRunRate: 0.5,
      affectedProtoPersonaIds: [],
      affectedAxisRanges: [],
      representativeRunIds: [],
      replayConfidence: 0.75,
      evidenceKeys: ["runs/checkout-hidden.png"],
      recommendation: "Make the CTA persistently visible.",
      confidenceNote: "Observed consistently in replay-backed failures.",
      score: 0.45,
    }),
  );
}

async function listIssueClusterNotes(
  t: ReturnType<typeof createTest>,
  issueId: Id<"issueClusters">,
) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("issueClusterNotes")
      .withIndex("by_issueClusterId", (query) => query.eq("issueClusterId", issueId))
      .take(10),
  );
}
