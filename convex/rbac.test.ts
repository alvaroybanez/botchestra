import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ADMIN_ROLES, requireRole, resolveOrgId } from "./rbac";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./analysisNotes.ts": () => import("./analysisNotes"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
  "./configTranscripts.ts": () => import("./configTranscripts"),
  "./personaConfigs.ts": () => import("./personaConfigs"),
  "./personaVariantGeneration.ts": () => import("./personaVariantGeneration"),
  "./rbac.ts": () => import("./rbac"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
  "./transcripts.ts": () => import("./transcripts"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

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

const adminIdentity = {
  subject: "admin-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Admin One",
  email: "admin.one@example.com",
  role: "admin",
};

const rolelessIdentity = {
  subject: "someone-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Someone One",
  email: "someone.one@example.com",
};

const makeAxis = () => ({
  key: "digital_confidence",
  label: "Digital Confidence",
  description: "Comfort using digital products",
  lowAnchor: "Needs reassurance",
  midAnchor: "Can continue independently",
  highAnchor: "Power user",
  weight: 1,
});

const makeTaskSpec = () => ({
  scenario: "Complete checkout for a pair of shoes.",
  goal: "Reach order confirmation.",
  startingUrl: "https://example.com/products/shoes",
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
  postTaskQuestions: ["Did you complete the task?"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
});

describe("resolveOrgId", () => {
  const issuer = "https://tame-lark-825.eu-west-1.convex.site";
  const userId = "kh7110vb6rn7vxa1dvnrz87mwh843v2h";
  const sessionId = "jh7fzhk70e6rdcst7a9b482m4d843dw3";

  it("drops the sessionId from a 3-part production tokenIdentifier", () => {
    expect(resolveOrgId({ tokenIdentifier: `${issuer}|${userId}|${sessionId}` })).toBe(
      `${issuer}|${userId}`,
    );
  });

  it("is idempotent — 2-part stable value passes through unchanged", () => {
    const stable = `${issuer}|${userId}`;
    expect(resolveOrgId({ tokenIdentifier: stable })).toBe(stable);
  });

  it("preserves 1-part opaque identifiers (test fixtures)", () => {
    expect(resolveOrgId({ tokenIdentifier: "org_1" })).toBe("org_1");
  });

  it("handles empty strings gracefully (no crash, passes through)", () => {
    expect(resolveOrgId({ tokenIdentifier: "" })).toBe("");
  });

  it("two different sessions for the same user yield the same orgId", () => {
    const sessionA = `${issuer}|${userId}|session_A`;
    const sessionB = `${issuer}|${userId}|session_B`;
    expect(resolveOrgId({ tokenIdentifier: sessionA })).toBe(
      resolveOrgId({ tokenIdentifier: sessionB }),
    );
  });
});

describe("orgId persistence across sessions", () => {
  const issuer = "https://tame-lark-825.eu-west-1.convex.site";
  const userId = "kh7110vb6rn7vxa1dvnrz87mwh843v2h";

  const identityWithSession = (sessionId: string) => ({
    subject: userId,
    tokenIdentifier: `${issuer}|${userId}|${sessionId}`,
    issuer,
    name: "Alvaro",
    email: "alvaro@example.com",
    role: "researcher",
  });

  it("a study created in session A is visible to session B for the same user", async () => {
    const t = createTest();
    const sessionA = t.withIdentity(identityWithSession("session_A"));
    const sessionB = t.withIdentity(identityWithSession("session_B"));

    const publishedPackId = await insertPack(t, { status: "published" });
    await t.run(async (ctx) =>
      ctx.db.patch(publishedPackId, {
        orgId: resolveOrgId({ tokenIdentifier: `${issuer}|${userId}|any_session` }),
        createdBy: resolveOrgId({ tokenIdentifier: `${issuer}|${userId}|any_session` }),
        updatedBy: resolveOrgId({ tokenIdentifier: `${issuer}|${userId}|any_session` }),
      }),
    );

    const created = await sessionA.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: publishedPackId,
        name: "Cross-session study",
        description: "Created on session A.",
        taskSpec: makeTaskSpec(),
        runBudget: 50,
        activeConcurrency: 4,
      },
    });

    expect(created.orgId).toBe(`${issuer}|${userId}`);

    const fromSessionB = await sessionB.query(api.studies.getStudy, {
      studyId: created._id,
    });
    expect(fromSessionB._id).toBe(created._id);
  });
});

describe("rbac", () => {
  it("defaults authenticated users without a role claim to researcher access", async () => {
    const t = createTest();
    const asRolelessUser = t.withIdentity(rolelessIdentity);

    const access = await asRolelessUser.query((api as any).rbac.getViewerAccess, {});

    expect(access).toMatchObject({
      role: "researcher",
      permissions: {
        canAccessSettings: false,
        canAddNotes: true,
        canExportReports: true,
        canManagePersonaConfigs: true,
        canManageStudies: true,
      },
    });
  });

  it("falls back to the stored users table role when no role claim is present", async () => {
    const t = createTest();
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "stored-admin@example.com",
        role: "admin",
      }),
    );
    const asStoredAdmin = t.withIdentity({
      ...rolelessIdentity,
      email: "stored-admin@example.com",
    });

    const access = await asStoredAdmin.query((api as any).rbac.getViewerAccess, {});

    expect(access).toMatchObject({
      role: "admin",
      permissions: {
        canAccessSettings: true,
        canAccessAdminDiagnostics: true,
      },
    });
  });

  it("prefers a JWT role claim over the stored users table role", async () => {
    const t = createTest();
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "claim-admin@example.com",
        role: "reviewer",
      }),
    );
    const asClaimAdmin = t.withIdentity({
      ...rolelessIdentity,
      email: "claim-admin@example.com",
      role: "admin",
    });

    const role = await asClaimAdmin.mutation(async (ctx) => {
      const result = await requireRole(ctx, ADMIN_ROLES);
      return result.role;
    });

    expect(role).toBe("admin");
  });

  it("blocks researchers from admin-only guards with FORBIDDEN", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    await expect(
      asResearcher.mutation(async (ctx) => {
        await requireRole(ctx, ADMIN_ROLES);
        return "ok";
      }),
    ).rejects.toThrowError("FORBIDDEN");
  });

  it("rejects reviewers on every mutating function except notes", async () => {
    const t = createTest();
    const asReviewer = t.withIdentity(reviewerIdentity);
    const publishedPackId = await insertPack(t, { status: "published" });
    const draftPackId = await insertPack(t, { status: "draft" });
    const publishedSyntheticUserId = await insertSyntheticUser(t, publishedPackId);
    const draftSyntheticUserId = await insertSyntheticUser(t, draftPackId);
    const draftStudyId = await insertStudy(t, {
      configId: publishedPackId,
      status: "draft",
    });
    const readyStudyId = await insertStudy(t, {
      configId: publishedPackId,
      status: "ready",
    });
    const personaReviewStudyId = await insertStudy(t, {
      configId: publishedPackId,
      status: "persona_review",
    });
    const transcriptId = await insertTranscript(t);
    const issueId = await insertIssueCluster(t, publishedPackId);

    await expect(
      asReviewer.mutation(api.personaConfigs.createDraft, {
        config: makeCreateDraftInput(),
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.action(api.personaConfigs.importJson, {
        json: JSON.stringify(makeImportedPackJson()),
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaConfigs.updateDraft, {
        configId: draftPackId,
        patch: { description: "Reviewer should not update configs." },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaConfigs.publish, {
        configId: draftPackId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaConfigs.archive, {
        configId: publishedPackId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaConfigs.createSyntheticUser, {
        configId: draftPackId,
        syntheticUser: makeSyntheticUserInput(),
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaConfigs.updateSyntheticUser, {
        syntheticUserId: draftSyntheticUserId,
        patch: { summary: "Reviewer should not edit synthetic users." },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaConfigs.deleteSyntheticUser, {
        syntheticUserId: draftSyntheticUserId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.studies.createStudy, {
        study: {
          personaConfigId: publishedPackId,
          name: "Reviewer draft study",
          description: "Should be blocked before insert.",
          taskSpec: makeTaskSpec(),
          runBudget: 50,
          activeConcurrency: 4,
        },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.studies.updateStudy, {
        studyId: draftStudyId,
        patch: { name: "Reviewer update" },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.studies.launchStudy, {
        studyId: readyStudyId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.studies.cancelStudy, {
        studyId: personaReviewStudyId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.action(api.personaVariantGeneration.generateVariantsForStudy, {
        studyId: draftStudyId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).transcripts.uploadTranscript, {
        storageId: await storeTranscriptBlob(t),
        originalFilename: "blocked.txt",
        metadata: { tags: ["blocked"] },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).transcripts.updateTranscriptMetadata, {
        transcriptId,
        metadata: { notes: "Reviewer should not edit transcript metadata." },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).transcripts.deleteTranscript, {
        transcriptId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).configTranscripts.attachTranscript, {
        configId: draftPackId,
        transcriptId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await t.run(async (ctx) =>
      ctx.db.insert("configTranscripts", {
        configId: draftPackId,
        transcriptId,
        createdAt: Date.now(),
      }),
    );
    await expect(
      asReviewer.mutation((api as any).configTranscripts.detachTranscript, {
        configId: draftPackId,
        transcriptId,
      }),
    ).rejects.toThrowError("FORBIDDEN");

    const note = await asReviewer.mutation((api as any).analysisNotes.addNote, {
      issueId,
      note: "Reviewer comments remain allowed.",
    });

    expect(note).toMatchObject({
      issueClusterId: issueId,
      note: "Reviewer comments remain allowed.",
    });
    expect(note.authorId).toBe(reviewerIdentity.subject);
    expect(publishedSyntheticUserId).toBeDefined();
  });

  it("allows admins to run representative mutations across configs, studies, and notes", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const publishedPackId = await insertPack(t, { status: "published" });
    const issueId = await insertIssueCluster(t, publishedPackId);

    const createdPackId = await asAdmin.mutation(api.personaConfigs.createDraft, {
      config: makeCreateDraftInput(),
    });
    const importedPackId = await asAdmin.action(api.personaConfigs.importJson, {
      json: JSON.stringify(makeImportedPackJson()),
    });
    const createdStudy = await asAdmin.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: publishedPackId,
        name: "Admin study",
        description: "Created by an admin user.",
        taskSpec: makeTaskSpec(),
        runBudget: 50,
        activeConcurrency: 5,
      },
    });
    const note = await asAdmin.mutation((api as any).analysisNotes.addNote, {
      issueId,
      note: "Admin note",
    });

    expect(createdPackId).toBeDefined();
    expect(importedPackId).toBeDefined();
    expect(createdStudy).toMatchObject({
      name: "Admin study",
      createdBy: adminIdentity.tokenIdentifier,
      orgId: adminIdentity.tokenIdentifier,
    });
    expect(note.authorId).toBe(adminIdentity.subject);
  });
});

async function insertPack(
  t: ReturnType<typeof createTest>,
  options: { status: "draft" | "published" | "archived" },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      ...makeCreateDraftInput(),
      version: 1,
      status: options.status,
      orgId: reviewerIdentity.tokenIdentifier,
      createdBy: reviewerIdentity.tokenIdentifier,
      updatedBy: reviewerIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertSyntheticUser(
  t: ReturnType<typeof createTest>,
  configId: Id<"personaConfigs">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      ...makeSyntheticUserInput(),
      sourceType: "manual",
      sourceRefs: [],
    }),
  );
}

async function insertStudy(
  t: ReturnType<typeof createTest>,
  options: {
    configId: Id<"personaConfigs">;
    status: "draft" | "ready" | "persona_review";
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: reviewerIdentity.tokenIdentifier,
      personaConfigId: options.configId,
      name: `${options.status} study`,
      description: "Seeded for RBAC tests.",
      taskSpec: makeTaskSpec(),
      runBudget: 50,
      activeConcurrency: 4,
      status: options.status,
      createdBy: reviewerIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertIssueCluster(
  t: ReturnType<typeof createTest>,
  configId: Id<"personaConfigs">,
) {
  const studyId = await insertStudy(t, { configId, status: "ready" });

  return await t.run(async (ctx) =>
    ctx.db.insert("issueClusters", {
      studyId,
      title: "Checkout CTA hidden",
      summary: "Primary action falls below the fold.",
      severity: "major",
      affectedRunCount: 2,
      affectedRunRate: 0.5,
      affectedSyntheticUserIds: [],
      affectedAxisRanges: [],
      representativeRunIds: [],
      replayConfidence: 0.75,
      evidenceKeys: ["runs/run-1/milestones/2.jpg"],
      recommendation: "Keep the CTA visible.",
      confidenceNote: "Confirmed with replay evidence.",
      score: 0.42,
    }),
  );
}

async function insertTranscript(t: ReturnType<typeof createTest>) {
  const storageId = await storeTranscriptBlob(t);

  return await t.run(async (ctx) =>
    ctx.db.insert("transcripts", {
      storageId,
      originalFilename: "seed.txt",
      format: "txt",
      metadata: {
        tags: ["seed"],
      },
      processingStatus: "processed",
      characterCount: "seed transcript".length,
      orgId: reviewerIdentity.tokenIdentifier,
      createdBy: reviewerIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function storeTranscriptBlob(t: ReturnType<typeof createTest>) {
  return await t.action(async (ctx) =>
    ctx.storage.store(new Blob(["seed transcript"], { type: "text/plain" })),
  );
}

function makeCreateDraftInput() {
  return {
    name: "Checkout Config",
    description: "Persona config for checkout flow studies.",
    context: "US e-commerce",
    sharedAxes: [makeAxis()],
  };
}

function makeSyntheticUserInput() {
  return {
    name: "Cautious shopper",
    summary: "Moves carefully through checkout.",
    axes: [makeAxis()],
    evidenceSnippets: ["Prefers to double-check totals before continuing."],
  };
}

function makeImportedPackJson() {
  return {
    ...makeCreateDraftInput(),
    syntheticUsers: [makeSyntheticUserInput()],
  };
}
