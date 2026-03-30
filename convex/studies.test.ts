import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  ACTIVE_CONCURRENCY_HARD_CAP,
  DEFAULT_POST_TASK_QUESTIONS,
  DEFAULT_STUDY_RUN_BUDGET,
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
): StudyTaskSpecInput => ({
  scenario: "Purchase a pair of running shoes.",
  goal: "Complete checkout without assistance.",
  startingUrl: "https://example.com/products/running-shoes",
  allowedDomains: ["example.com"],
  allowedActions: ["goto", "click", "type", "finish"],
  forbiddenActions: ["payment_submission"],
  successCriteria: ["Order confirmation is visible"],
  stopConditions: ["The user leaves the allowed domain"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
  ...overrides,
});

describe("studies.createStudy", () => {
  it("creates a draft study with defaults, caps active concurrency, and records the creator", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await insertPack(t, { status: "published" });
    const before = Date.now();

    const createdStudy = await asResearcher.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: configId,
        name: "Checkout launch readiness",
        description: "Validate the primary checkout funnel.",
        taskSpec: makeTaskSpec(),
        activeConcurrency: 50,
      },
    });

    const persistedStudy = await getStudyDoc(t, createdStudy._id);

    expect(createdStudy).toMatchObject({
      _id: createdStudy._id,
      personaConfigId: configId,
      name: "Checkout launch readiness",
      description: "Validate the primary checkout funnel.",
      status: "draft",
      runBudget: DEFAULT_STUDY_RUN_BUDGET,
      activeConcurrency: ACTIVE_CONCURRENCY_HARD_CAP,
      createdBy: researchIdentity.tokenIdentifier,
      orgId: researchIdentity.tokenIdentifier,
    });
    expect(createdStudy.taskSpec.postTaskQuestions).toEqual(
      DEFAULT_POST_TASK_QUESTIONS,
    );
    expect(createdStudy.createdAt).toBeGreaterThanOrEqual(before);
    expect(createdStudy.updatedAt).toBeGreaterThanOrEqual(createdStudy.createdAt);
    expect(persistedStudy).toEqual(createdStudy);
  });

  it("preserves custom post-task questions exactly", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await insertPack(t);
    const customQuestions = [
      "Did you complete the task?",
      "What felt risky?",
      "What would you change first?",
    ];

    const createdStudy = await asResearcher.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: configId,
        name: "Custom question study",
        taskSpec: makeTaskSpec({ postTaskQuestions: customQuestions }),
        runBudget: 12,
        activeConcurrency: 4,
      },
    });

    expect(createdStudy.taskSpec.postTaskQuestions).toEqual(customQuestions);
  });

  it("rejects invalid inputs and missing persona configurations", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await insertPack(t);

    await expect(
      asResearcher.mutation(api.studies.createStudy, {
        study: {
          personaConfigId: configId,
          name: "Missing environment label",
          taskSpec: makeTaskSpec({ environmentLabel: "" }),
          runBudget: 5,
          activeConcurrency: 2,
        },
      }),
    ).rejects.toThrow();

    await expect(
      asResearcher.mutation(api.studies.createStudy, {
        study: {
          personaConfigId: configId,
          name: "Zero budget",
          taskSpec: makeTaskSpec(),
          runBudget: 0,
          activeConcurrency: 2,
        },
      }),
    ).rejects.toThrow();

    await expect(
      asResearcher.mutation(api.studies.createStudy, {
        study: {
          personaConfigId: "fake_pack_id" as Id<"personaConfigs">,
          name: "Missing config",
          taskSpec: makeTaskSpec(),
          runBudget: 5,
          activeConcurrency: 2,
        },
      }),
    ).rejects.toThrow(/config/i);

    const studies = await t.run(async (ctx) => ctx.db.query("studies").collect());
    expect(studies).toHaveLength(0);
  });
});

describe("studies.updateStudy", () => {
  it("updates draft studies, including nested task spec fields", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, {
      status: "draft",
      runBudget: 6,
      activeConcurrency: 2,
      taskSpec: {
        ...makeTaskSpec(),
        postTaskQuestions: ["How confident were you?"],
      },
    });
    const beforeUpdate = await getStudyDoc(t, studyId);

    const updatedStudy = await asResearcher.mutation(api.studies.updateStudy, {
      studyId,
      patch: {
        name: "Updated checkout study",
        description: "Updated description",
        runBudget: 8,
        activeConcurrency: 99,
        taskSpec: {
          scenario: "Buy a gift card instead of physical goods.",
          environmentLabel: "production",
          postTaskQuestions: [],
        },
      },
    });

    expect(updatedStudy).toMatchObject({
      _id: studyId,
      name: "Updated checkout study",
      description: "Updated description",
      runBudget: 8,
      activeConcurrency: ACTIVE_CONCURRENCY_HARD_CAP,
      status: "draft",
    });
    expect(updatedStudy.taskSpec.scenario).toBe(
      "Buy a gift card instead of physical goods.",
    );
    expect(updatedStudy.taskSpec.environmentLabel).toBe("production");
    expect(updatedStudy.taskSpec.postTaskQuestions).toEqual(
      DEFAULT_POST_TASK_QUESTIONS,
    );
    expect(updatedStudy.taskSpec.goal).toBe(beforeUpdate!.taskSpec.goal);
    expect(updatedStudy.updatedAt).toBeGreaterThanOrEqual(beforeUpdate!.updatedAt);
  });

  it("rejects updates once the study is no longer draft", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "ready" });
    const beforeUpdate = await getStudyDoc(t, studyId);

    await expect(
      asResearcher.mutation(api.studies.updateStudy, {
        studyId,
        patch: {
          name: "Should not apply",
        },
      }),
    ).rejects.toThrow(/draft/i);

    const afterUpdate = await getStudyDoc(t, studyId);
    expect(afterUpdate).toEqual(beforeUpdate);
  });
});

describe("studies.launchStudy", () => {
  it("moves draft studies into persona_review and starts launch preparation", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "draft" });
    const workflowStartSpy = vi
      .spyOn(workflow, "start")
      .mockResolvedValue("workflow_1" as never);

    const launchedStudy = await asResearcher.mutation(api.studies.launchStudy, {
      studyId,
    });

    expect(workflowStartSpy).toHaveBeenCalledTimes(1);
    expect(launchedStudy.status).toBe("persona_review");
    expect(launchedStudy.launchRequestedBy).toBe(
      researchIdentity.tokenIdentifier,
    );
    expect(launchedStudy.launchedAt).toBeUndefined();
  });

  it("rejects studies whose persona configuration is not published", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    const draftPackStudyId = await insertStudy(t, {
      status: "ready",
      personaConfigStatus: "draft",
    });
    const archivedPackStudyId = await insertStudy(t, {
      status: "ready",
      personaConfigStatus: "archived",
    });

    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId: draftPackStudyId }),
    ).rejects.toThrow(/published/i);
    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId: archivedPackStudyId }),
    ).rejects.toThrow(/published/i);
  });

  it("rejects production launches without acknowledgement", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, {
      status: "ready",
      taskSpec: makeTaskSpec({
        environmentLabel: "production",
        postTaskQuestions: ["Did this feel safe?"],
      }),
    });
    await seedAcceptedVariants(t, studyId, 5);

    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId }),
    ).rejects.toThrow(/production acknowledgement/i);

    expect((await getStudyDoc(t, studyId))!.status).toBe("ready");
  });

  it("moves ready studies back to persona_review when accepted variants are missing", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "ready", runBudget: 5 });
    await seedAcceptedVariants(t, studyId, 4);
    const workflowStartSpy = vi
      .spyOn(workflow, "start")
      .mockResolvedValue("workflow_1" as never);

    const launchedStudy = await asResearcher.mutation(api.studies.launchStudy, {
      studyId,
    });

    expect(workflowStartSpy).toHaveBeenCalledTimes(1);
    expect(launchedStudy.status).toBe("persona_review");
    expect(launchedStudy.launchRequestedBy).toBe(
      researchIdentity.tokenIdentifier,
    );
    expect(launchedStudy.launchedAt).toBeUndefined();
  });

  it("queues ready studies and records launch metadata once variants are confirmed", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "ready", runBudget: 5 });
    await seedAcceptedVariants(t, studyId, 5);
    const workflowStartSpy = vi
      .spyOn(workflow, "start")
      .mockResolvedValue("workflow_1" as never);
    const beforeLaunch = Date.now();

    const launchedStudy = await asResearcher.mutation(api.studies.launchStudy, {
      studyId,
    });

    expect(launchedStudy.status).toBe("queued");
    expect(workflowStartSpy).toHaveBeenCalledTimes(1);
    expect(launchedStudy.launchRequestedBy).toBe(
      researchIdentity.tokenIdentifier,
    );
    expect(launchedStudy.launchedAt).toBeGreaterThanOrEqual(beforeLaunch);
  });

  it("rejects launch when the study has zero run budget or zero active concurrency", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const zeroBudgetStudyId = await insertStudy(t, {
      status: "ready",
      runBudget: 0,
    });
    const zeroConcurrencyStudyId = await insertStudy(t, {
      status: "ready",
      activeConcurrency: 0,
    });
    await seedAcceptedVariants(t, zeroBudgetStudyId, 1);
    await seedAcceptedVariants(t, zeroConcurrencyStudyId, 1);

    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId: zeroBudgetStudyId }),
    ).rejects.toThrow(/run budget/i);
    await expect(
      asResearcher.mutation(api.studies.launchStudy, {
        studyId: zeroConcurrencyStudyId,
      }),
    ).rejects.toThrow(/active concurrency/i);
  });

  it("rejects duplicate launches after the study has already been queued", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "ready", runBudget: 5 });
    await seedAcceptedVariants(t, studyId, 5);
    vi.spyOn(workflow, "start").mockResolvedValue("workflow_1" as never);

    await asResearcher.mutation(api.studies.launchStudy, { studyId });

    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId }),
    ).rejects.toThrow(/ready/i);
  });

  it("rejects duplicate launches while persona review generation is already in progress", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, {
      status: "persona_review",
      launchRequestedBy: researchIdentity.tokenIdentifier,
    });

    await expect(
      asResearcher.mutation(api.studies.launchStudy, { studyId }),
    ).rejects.toThrow(/already preparing/i);
  });
});

describe("studies.transitionStudyState", () => {
  it("allows every valid study state transition", async () => {
    const t = createTest();

    const validTransitions: Array<[StudyStatus, StudyStatus]> = [
      ["draft", "persona_review"],
      ["persona_review", "ready"],
      ["ready", "queued"],
      ["queued", "running"],
      ["running", "replaying"],
      ["running", "failed"],
      ["running", "cancelled"],
      ["replaying", "analyzing"],
      ["replaying", "failed"],
      ["analyzing", "completed"],
      ["analyzing", "failed"],
      ["queued", "cancelled"],
    ];

    for (const [currentStatus, nextStatus] of validTransitions) {
      const studyId = await insertStudy(t, { status: currentStatus });

      const transitionedStudy = await t.mutation(
        internal.studies.transitionStudyState,
        {
          studyId,
          nextStatus,
        },
      );

      expect(transitionedStudy.status).toBe(nextStatus);

      if (nextStatus === "completed") {
        expect(transitionedStudy.completedAt).toBeTypeOf("number");
      }
    }
  });

  it("rejects invalid study state transitions", async () => {
    const t = createTest();

    const invalidTransitions: Array<[StudyStatus, StudyStatus]> = [
      ["draft", "running"],
      ["completed", "running"],
      ["cancelled", "queued"],
      ["analyzing", "running"],
      ["queued", "analyzing"],
      ["ready", "completed"],
    ];

    for (const [currentStatus, nextStatus] of invalidTransitions) {
      const studyId = await insertStudy(t, { status: currentStatus });

      await expect(
        t.mutation(internal.studies.transitionStudyState, {
          studyId,
          nextStatus,
        }),
      ).rejects.toThrow(/invalid/i);
    }
  });
});

type StudyTaskSpecInput = {
  scenario: string;
  goal: string;
  startingUrl: string;
  allowedDomains: string[];
  allowedActions: Array<
    "goto" | "click" | "type" | "select" | "scroll" | "wait" | "back" | "finish" | "abort"
  >;
  forbiddenActions: Array<
    | "external_download"
    | "payment_submission"
    | "email_send"
    | "sms_send"
    | "captcha_bypass"
    | "account_creation_without_fixture"
    | "cross_domain_escape"
    | "file_upload_unless_allowed"
  >;
  successCriteria: string[];
  stopConditions: string[];
  postTaskQuestions?: string[];
  maxSteps: number;
  maxDurationSec: number;
  environmentLabel: string;
  locale: string;
  viewport: {
    width: number;
    height: number;
  };
  credentialsRef?: string;
  randomSeed?: string;
};

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

type TestInstance = ReturnType<typeof createTest>;

async function insertPack(
  t: TestInstance,
  overrides: Partial<Doc<"personaConfigs">> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: researchIdentity.tokenIdentifier,
      name: "Checkout persona configuration",
      description: "Published config for checkout studies",
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
    taskSpec?: StudyTaskSpecInput & { postTaskQuestions?: string[] };
    personaConfigStatus?: "draft" | "published" | "archived";
    launchRequestedBy?: string;
    launchedAt?: number;
  } = {},
) {
  const configId = await insertPack(t, {
    status: overrides.personaConfigStatus ?? "published",
  });

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: researchIdentity.tokenIdentifier,
      personaConfigId: configId,
      name: "Checkout study",
      description: "Study description",
      taskSpec: {
        ...makeTaskSpec({
          postTaskQuestions: ["How did this task feel?"],
        }),
        ...(overrides.taskSpec ?? {}),
        postTaskQuestions:
          overrides.taskSpec?.postTaskQuestions ?? ["How did this task feel?"],
      },
      runBudget: overrides.runBudget ?? 5,
      activeConcurrency: overrides.activeConcurrency ?? 2,
      status: overrides.status ?? "draft",
      ...(overrides.launchRequestedBy !== undefined
        ? { launchRequestedBy: overrides.launchRequestedBy }
        : {}),
      ...(overrides.launchedAt !== undefined
        ? { launchedAt: overrides.launchedAt }
        : {}),
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

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId: study.personaConfigId,
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
        personaConfigId: study.personaConfigId,
        syntheticUserId,
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

async function getStudyDoc(
  t: TestInstance,
  studyId: Id<"studies">,
): Promise<Doc<"studies"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(studyId)) as Doc<"studies"> | null);
}
