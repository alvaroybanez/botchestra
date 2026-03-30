import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./credentials.ts": () => import("./credentials"),
  "./settings.ts": () => import("./settings"),
};

const createTest = () => convexTest(schema, modules);

const CREDENTIAL_ENCRYPTION_SECRET = "test-credential-encryption-secret";

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

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_SECRET = CREDENTIAL_ENCRYPTION_SECRET;
});

afterEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_SECRET;
});

describe("credentials CRUD", () => {
  it("creates encrypted credentials and never returns encryptedPayload to frontend queries", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const studyId = await insertStudy(t);

    const created = await asAdmin.mutation((api as any).credentials.createCredential, {
      credential: {
        ref: "cred_checkout",
        label: "Checkout fixture",
        description: "Shared staging checkout account",
        allowedStudyIds: [studyId],
        payload: [
          { key: "email", value: "alice@example.com" },
          { key: "password", value: "swordfish" },
        ],
      },
    });

    expect(created).toMatchObject({
      ref: "cred_checkout",
      label: "Checkout fixture",
      description: "Shared staging checkout account",
      allowedStudyIds: [studyId],
      orgId: adminIdentity.tokenIdentifier,
      createdBy: adminIdentity.tokenIdentifier,
    });
    expect("encryptedPayload" in created).toBe(false);

    const list = await asAdmin.query((api as any).credentials.listCredentials, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      ref: "cred_checkout",
      label: "Checkout fixture",
      allowedStudyIds: [studyId],
    });
    expect("encryptedPayload" in list[0]).toBe(false);

    const settings = await asAdmin.query((api as any).settings.getSettings, {});
    expect(settings.credentials).toHaveLength(1);
    expect(settings.credentials[0]).toMatchObject({
      ref: "cred_checkout",
      label: "Checkout fixture",
      allowedStudyIds: [studyId],
    });
    expect("encryptedPayload" in settings.credentials[0]).toBe(false);

    const stored = await findCredentialByRef(t, "cred_checkout");
    expect(stored).not.toBeNull();
    expect((stored as any).encryptedPayload).toBeTypeOf("string");
    expect((stored as any).encryptedPayload).not.toContain("alice@example.com");
    expect((stored as any).encryptedPayload).not.toContain("swordfish");
  });

  it("updates encrypted credentials and resolves plaintext only through the internal study-scoped query", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const studyId = await insertStudy(t);
    const otherStudyId = await insertStudy(t);

    const created = await asAdmin.mutation((api as any).credentials.createCredential, {
      credential: {
        ref: "cred_checkout",
        label: "Checkout fixture",
        description: "Initial secret",
        allowedStudyIds: [studyId],
        payload: [
          { key: "email", value: "alice@example.com" },
          { key: "password", value: "swordfish" },
        ],
      },
    });

    const beforeUpdate = await findCredentialByRef(t, "cred_checkout");

    const updated = await asAdmin.mutation((api as any).credentials.updateCredential, {
      credentialId: created._id,
      patch: {
        label: "Checkout fixture (rotated)",
        payload: [
          { key: "email", value: "alice+rotated@example.com" },
          { key: "password", value: "hunter2" },
        ],
      },
    });

    expect(updated.label).toBe("Checkout fixture (rotated)");
    expect("encryptedPayload" in updated).toBe(false);

    const afterUpdate = await findCredentialByRef(t, "cred_checkout");
    expect((afterUpdate as any).encryptedPayload).not.toBe((beforeUpdate as any).encryptedPayload);
    expect((afterUpdate as any).encryptedPayload).not.toContain("alice+rotated@example.com");
    expect((afterUpdate as any).encryptedPayload).not.toContain("hunter2");

    const resolved = await t.query((internal as any).credentials.resolveCredentialForStudy, {
      studyId,
      credentialsRef: "cred_checkout",
    });

    expect(resolved).toEqual({
      ref: "cred_checkout",
      label: "Checkout fixture (rotated)",
      description: "Initial secret",
      payload: [
        { key: "email", value: "alice+rotated@example.com" },
        { key: "password", value: "hunter2" },
      ],
      secretValues: ["alice+rotated@example.com", "hunter2"],
    });

    await expect(
      t.query((internal as any).credentials.resolveCredentialForStudy, {
        studyId: otherStudyId,
        credentialsRef: "cred_checkout",
      }),
    ).rejects.toThrowError("Credential reference is not available for this study.");
  });

  it("deletes credentials and blocks non-admin credential management access", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const asResearcher = t.withIdentity(researcherIdentity);

    await expect(
      asResearcher.query((api as any).credentials.listCredentials, {}),
    ).rejects.toThrowError("FORBIDDEN");
    await expect(
      asResearcher.mutation((api as any).credentials.createCredential, {
        credential: {
          ref: "cred_checkout",
          label: "Checkout fixture",
          payload: [{ key: "email", value: "alice@example.com" }],
        },
      }),
    ).rejects.toThrowError("FORBIDDEN");

    const created = await asAdmin.mutation((api as any).credentials.createCredential, {
      credential: {
        ref: "cred_checkout",
        label: "Checkout fixture",
        description: "Shared staging checkout account",
        payload: [{ key: "email", value: "alice@example.com" }],
      },
    });

    await asAdmin.mutation((api as any).credentials.deleteCredential, {
      credentialId: created._id,
    });

    expect(await asAdmin.query((api as any).credentials.listCredentials, {})).toEqual([]);
    expect(await findCredentialByRef(t, "cred_checkout")).toBeNull();
  });
});

async function insertStudy(t: ReturnType<typeof createTest>) {
  const now = Date.now();
  const configId = await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: adminIdentity.tokenIdentifier,
      name: "Checkout persona configuration",
      description: "Published config for credentials tests",
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
      createdAt: now,
      updatedAt: now,
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: adminIdentity.tokenIdentifier,
      personaConfigId: configId,
      name: "Checkout study",
      taskSpec: makeTaskSpec(),
      runBudget: 64,
      activeConcurrency: 10,
      status: "draft",
      createdBy: adminIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function findCredentialByRef(
  t: ReturnType<typeof createTest>,
  ref: string,
) {
  return await t.run(async (ctx) => {
    for await (const credential of ctx.db.query("credentials")) {
      if ((credential as any).ref === ref) {
        return credential as any;
      }
    }

    return null;
  });
}

function makeTaskSpec() {
  return {
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
    successCriteria: ["Order confirmation is visible."],
    stopConditions: ["The user leaves the allowed domain."],
    postTaskQuestions: ["Did you complete the task?"],
    maxSteps: 25,
    maxDurationSec: 420,
    environmentLabel: "staging",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  };
}
