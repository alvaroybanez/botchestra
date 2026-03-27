import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  evaluateStudyLaunchGuardrails,
  type StudyTaskSpecInput,
} from "./studies";
import { workflow } from "./workflow";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

afterEach(() => {
  vi.restoreAllMocks();
});

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

const makeTaskSpec = (
  overrides: Partial<StudyTaskSpecInput> = {},
): PersistedStudyTaskSpec => {
  const taskSpec: PersistedStudyTaskSpec = {
    scenario: "Evaluate the standard checkout journey.",
    goal: "Reach the review step without using disallowed actions.",
    startingUrl: "https://example.com/products/running-shoes",
    allowedDomains: ["example.com"],
    allowedActions: ["goto", "click", "type", "finish"],
    forbiddenActions: [],
    successCriteria: ["The order review screen is visible."],
    stopConditions: ["Leave the approved domain allowlist."],
    postTaskQuestions: ["Did you complete the task?"],
    maxSteps: 20,
    maxDurationSec: 300,
    environmentLabel: "staging",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    ...overrides,
  };

  return {
    ...taskSpec,
    postTaskQuestions:
      taskSpec.postTaskQuestions ?? ["Did you complete the task?"],
  };
};

describe("evaluateStudyLaunchGuardrails", () => {
  it("fails when a study domain is outside the org allowlist", () => {
    const result = evaluateStudyLaunchGuardrails({
      taskSpec: makeTaskSpec({
        startingUrl: "https://checkout.bad.example/path",
        allowedDomains: ["checkout.bad.example"],
      }),
      domainAllowlist: ["example.com"],
      productionAck: false,
    });

    expect(result).toEqual({
      pass: false,
      reasons: ['Domain "checkout.bad.example" is not on the allowlist.'],
    });
  });

  it("fails when the task spec explicitly references a forbidden action", () => {
    const result = evaluateStudyLaunchGuardrails({
      taskSpec: makeTaskSpec({
        forbiddenActions: ["payment_submission"],
        successCriteria: ["Submit payment and reach the order confirmation page."],
      }),
      domainAllowlist: ["example.com"],
      productionAck: false,
    });

    expect(result).toEqual({
      pass: false,
      reasons: [
        'Task spec references forbidden action "payment_submission".',
      ],
    });
  });

  it("fails when production launch acknowledgement is missing", () => {
    const result = evaluateStudyLaunchGuardrails({
      taskSpec: makeTaskSpec({ environmentLabel: "production" }),
      domainAllowlist: ["example.com"],
      productionAck: false,
    });

    expect(result).toEqual({
      pass: false,
      reasons: [
        "Production acknowledgement is required before launching this study.",
      ],
    });
  });

  it("passes when domains are approved, no forbidden action conflict exists, and production is acknowledged", () => {
    const result = evaluateStudyLaunchGuardrails({
      taskSpec: makeTaskSpec({
        environmentLabel: "production",
      }),
      domainAllowlist: ["example.com"],
      productionAck: true,
    });

    expect(result).toEqual({
      pass: true,
      reasons: [],
    });
  });
});

describe("studies.validateStudyLaunch", () => {
  it("records pass and fail outcomes in guardrailEvents", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const failingStudyId = await insertStudy(t, {
      taskSpec: makeTaskSpec({
        startingUrl: "https://forbidden.example/checkout",
        allowedDomains: ["forbidden.example"],
      }),
    });
    const passingStudyId = await insertStudy(t, {
      taskSpec: makeTaskSpec({
        environmentLabel: "production",
      }),
    });

    await seedSettings(t, ["example.com"]);

    const failingResult = await asResearcher.mutation(
      api.studies.validateStudyLaunch,
      {
        studyId: failingStudyId,
      },
    );
    const passingResult = await asResearcher.mutation(
      api.studies.validateStudyLaunch,
      {
        studyId: passingStudyId,
        productionAck: true,
      },
    );

    const guardrailEvents = await listGuardrailEvents(t);

    expect(failingResult.pass).toBe(false);
    expect(failingResult.reasons).toContain(
      'Domain "forbidden.example" is not on the allowlist.',
    );
    expect(passingResult).toEqual({ pass: true, reasons: [] });
    expect(
      guardrailEvents.map((event) => ({
        studyId: event.studyId,
        outcome: event.outcome,
        reasons: event.reasons,
      })),
    ).toEqual([
      {
        studyId: failingStudyId,
        outcome: "fail",
        reasons: ['Domain "forbidden.example" is not on the allowlist.'],
      },
      {
        studyId: passingStudyId,
        outcome: "pass",
        reasons: [],
      },
    ]);
  });
});

describe("studies.launchStudy", () => {
  it("enforces the production acknowledgement gate before allowing a successful launch", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, {
      status: "ready",
      runBudget: 1,
      taskSpec: makeTaskSpec({
        environmentLabel: "production",
      }),
    });

    await seedSettings(t, ["example.com"]);
    await seedAcceptedVariants(t, studyId, 1);
    const workflowStartSpy = vi
      .spyOn(workflow, "start")
      .mockResolvedValue("workflow_1" as never);

    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId }),
    ).rejects.toThrow(/production acknowledgement/i);

    const launchedStudy = await asResearcher.mutation(api.studies.launchStudy, {
      studyId,
      productionAck: true,
    });
    const guardrailEvents = await listGuardrailEvents(t, studyId);

    expect(workflowStartSpy).toHaveBeenCalledTimes(1);
    expect(launchedStudy.status).toBe("queued");
    expect(guardrailEvents.map((event) => event.outcome)).toEqual(["pass"]);
    expect(guardrailEvents[0]?.reasons).toEqual([]);
  });
});

type StudyStatus =
  | "draft"
  | "persona_review"
  | "ready"
  | "queued"
  | "running"
  | "replaying"
  | "analyzing"
  | "completed"
  | "failed"
  | "cancelled";

type PersistedStudyTaskSpec = Omit<StudyTaskSpecInput, "postTaskQuestions"> & {
  postTaskQuestions: string[];
};

type TestInstance = ReturnType<typeof createTest>;

async function insertPack(
  t: TestInstance,
  overrides: Partial<Doc<"personaPacks">> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: researchIdentity.tokenIdentifier,
      name: "Checkout persona pack",
      description: "Published pack for checkout studies",
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
      createdBy: researchIdentity.tokenIdentifier,
      updatedBy: researchIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    }),
  );
}

async function insertStudy(
  t: TestInstance,
  overrides: {
    status?: StudyStatus;
    runBudget?: number;
    activeConcurrency?: number;
    taskSpec?: StudyTaskSpecInput;
    personaPackStatus?: "draft" | "published" | "archived";
  } = {},
) {
  const packId = await insertPack(t, {
    status: overrides.personaPackStatus ?? "published",
  });

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: researchIdentity.tokenIdentifier,
      personaPackId: packId,
      name: "Checkout study",
      description: "Study description",
      taskSpec: makeTaskSpec(overrides.taskSpec),
      runBudget: overrides.runBudget ?? 5,
      activeConcurrency: overrides.activeConcurrency ?? 2,
      status: overrides.status ?? "draft",
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function seedAcceptedVariants(
  t: TestInstance,
  studyId: Id<"studies">,
  acceptedCount: number,
) {
  const study = await getStudyDoc(t, studyId);

  if (study === null) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId: study.personaPackId,
      name: "Confident buyer",
      summary: "Moves quickly through checkout.",
      axes: [
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
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: ["Fast-moving repeat buyer"],
    }),
  );

  for (let index = 0; index < acceptedCount; index += 1) {
    await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: study.personaPackId,
        protoPersonaId,
        axisValues: [{ key: "digital_confidence", value: 0.8 }],
        edgeScore: 0.8,
        tensionSeed: `Tension seed ${index + 1}`,
        firstPersonBio:
          "I move quickly through checkout, trust polished interfaces, and only pause when totals or payment details feel unclear or unexpectedly risky during the flow.",
        behaviorRules: [
          "Moves quickly when the path is obvious.",
          "Pauses on unclear payment states.",
          "Looks for reassurance before submitting.",
          "Trusts familiar storefront patterns.",
          "Backtracks if totals feel surprising.",
        ],
        coherenceScore: 0.9,
        distinctnessScore: 0.8,
        accepted: true,
      }),
    );
  }
}

async function seedSettings(t: TestInstance, domainAllowlist: string[]) {
  return await t.run(async (ctx) =>
    ctx.db.insert("settings", {
      orgId: researchIdentity.tokenIdentifier,
      domainAllowlist,
      maxConcurrency: 20,
      modelConfig: [],
      runBudgetCap: 100,
      updatedBy: researchIdentity.tokenIdentifier,
      updatedAt: Date.now(),
    }),
  );
}

async function getStudyDoc(
  t: TestInstance,
  studyId: Id<"studies">,
): Promise<Doc<"studies"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(studyId)) as Doc<"studies"> | null);
}

async function listGuardrailEvents(
  t: TestInstance,
  studyId?: Id<"studies">,
) {
  return await t.run(async (ctx) => {
    const query = studyId
      ? ctx.db
          .query("guardrailEvents")
          .withIndex("by_studyId_and_createdAt", (q) => q.eq("studyId", studyId))
      : ctx.db
          .query("guardrailEvents")
          .withIndex("by_orgId_and_createdAt", (q) =>
            q.eq("orgId", researchIdentity.tokenIdentifier),
          );

    return await query.collect();
  });
}
