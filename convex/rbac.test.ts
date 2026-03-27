import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ADMIN_ROLES, requireRole } from "./rbac";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./analysisNotes.ts": () => import("./analysisNotes"),
  "./personaPacks.ts": () => import("./personaPacks"),
  "./personaVariantGeneration.ts": () => import("./personaVariantGeneration"),
  "./rbac.ts": () => import("./rbac"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
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
        canManagePersonaPacks: true,
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
    const publishedProtoPersonaId = await insertProtoPersona(t, publishedPackId);
    const draftProtoPersonaId = await insertProtoPersona(t, draftPackId);
    const draftStudyId = await insertStudy(t, {
      packId: publishedPackId,
      status: "draft",
    });
    const readyStudyId = await insertStudy(t, {
      packId: publishedPackId,
      status: "ready",
    });
    const personaReviewStudyId = await insertStudy(t, {
      packId: publishedPackId,
      status: "persona_review",
    });
    const issueId = await insertIssueCluster(t, publishedPackId);

    await expect(
      asReviewer.mutation(api.personaPacks.createDraft, {
        pack: makeCreateDraftInput(),
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.action(api.personaPacks.importJson, {
        json: JSON.stringify(makeImportedPackJson()),
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaPacks.updateDraft, {
        packId: draftPackId,
        patch: { description: "Reviewer should not update packs." },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaPacks.publish, {
        packId: draftPackId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaPacks.archive, {
        packId: publishedPackId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaPacks.createProtoPersona, {
        packId: draftPackId,
        protoPersona: makeProtoPersonaInput(),
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaPacks.updateProtoPersona, {
        protoPersonaId: draftProtoPersonaId,
        patch: { summary: "Reviewer should not edit proto-personas." },
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.personaPacks.deleteProtoPersona, {
        protoPersonaId: draftProtoPersonaId,
      }),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asReviewer.mutation(api.studies.createStudy, {
        study: {
          personaPackId: publishedPackId,
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

    const note = await asReviewer.mutation((api as any).analysisNotes.addNote, {
      issueId,
      note: "Reviewer comments remain allowed.",
    });

    expect(note).toMatchObject({
      issueClusterId: issueId,
      note: "Reviewer comments remain allowed.",
    });
    expect(note.authorId).toBe(reviewerIdentity.subject);
    expect(publishedProtoPersonaId).toBeDefined();
  });

  it("allows admins to run representative mutations across packs, studies, and notes", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const publishedPackId = await insertPack(t, { status: "published" });
    const issueId = await insertIssueCluster(t, publishedPackId);

    const createdPackId = await asAdmin.mutation(api.personaPacks.createDraft, {
      pack: makeCreateDraftInput(),
    });
    const importedPackId = await asAdmin.action(api.personaPacks.importJson, {
      json: JSON.stringify(makeImportedPackJson()),
    });
    const createdStudy = await asAdmin.mutation(api.studies.createStudy, {
      study: {
        personaPackId: publishedPackId,
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
    ctx.db.insert("personaPacks", {
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

async function insertProtoPersona(
  t: ReturnType<typeof createTest>,
  packId: Id<"personaPacks">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId,
      ...makeProtoPersonaInput(),
      sourceType: "manual",
      sourceRefs: [],
    }),
  );
}

async function insertStudy(
  t: ReturnType<typeof createTest>,
  options: {
    packId: Id<"personaPacks">;
    status: "draft" | "ready" | "persona_review";
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: reviewerIdentity.tokenIdentifier,
      personaPackId: options.packId,
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
  packId: Id<"personaPacks">,
) {
  const studyId = await insertStudy(t, { packId, status: "ready" });

  return await t.run(async (ctx) =>
    ctx.db.insert("issueClusters", {
      studyId,
      title: "Checkout CTA hidden",
      summary: "Primary action falls below the fold.",
      severity: "major",
      affectedRunCount: 2,
      affectedRunRate: 0.5,
      affectedProtoPersonaIds: [],
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

function makeCreateDraftInput() {
  return {
    name: "Checkout Pack",
    description: "Persona pack for checkout flow studies.",
    context: "US e-commerce",
    sharedAxes: [makeAxis()],
  };
}

function makeProtoPersonaInput() {
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
    protoPersonas: [makeProtoPersonaInput()],
  };
}
