import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ─── Reusable validators ───────────────────────────────────────────────────

const axisValidator = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  lowAnchor: v.string(),
  midAnchor: v.string(),
  highAnchor: v.string(),
  weight: v.number(),
});

const axisValueValidator = v.object({
  key: v.string(),
  value: v.number(),
});

const axisRangeValidator = v.object({
  key: v.string(),
  min: v.number(),
  max: v.number(),
});

const allowedActionValidator = v.union(
  v.literal("goto"),
  v.literal("click"),
  v.literal("type"),
  v.literal("select"),
  v.literal("scroll"),
  v.literal("wait"),
  v.literal("back"),
  v.literal("finish"),
  v.literal("abort"),
);

const forbiddenActionValidator = v.union(
  v.literal("external_download"),
  v.literal("payment_submission"),
  v.literal("email_send"),
  v.literal("sms_send"),
  v.literal("captcha_bypass"),
  v.literal("account_creation_without_fixture"),
  v.literal("cross_domain_escape"),
  v.literal("file_upload_unless_allowed"),
);

const taskSpecValidator = v.object({
  scenario: v.string(),
  goal: v.string(),
  startingUrl: v.string(),
  allowedDomains: v.array(v.string()),
  allowedActions: v.array(allowedActionValidator),
  forbiddenActions: v.array(forbiddenActionValidator),
  successCriteria: v.array(v.string()),
  stopConditions: v.array(v.string()),
  postTaskQuestions: v.array(v.string()),
  maxSteps: v.number(),
  maxDurationSec: v.number(),
  environmentLabel: v.string(),
  locale: v.string(),
  viewport: v.object({ width: v.number(), height: v.number() }),
  credentialsRef: v.optional(v.string()),
  randomSeed: v.optional(v.string()),
});

// ─── Schema ────────────────────────────────────────────────────────────────

export default defineSchema({
  ...authTables,
  // 1. personaPacks
  personaPacks: defineTable({
    name: v.string(),
    description: v.string(),
    context: v.string(),
    sharedAxes: v.array(axisValidator),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    orgId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_orgId", ["orgId"]),

  // 2. protoPersonas
  protoPersonas: defineTable({
    packId: v.id("personaPacks"),
    name: v.string(),
    summary: v.string(),
    axes: v.array(axisValidator),
    sourceType: v.union(
      v.literal("manual"),
      v.literal("json_import"),
      v.literal("transcript_derived"),
    ),
    sourceRefs: v.array(v.string()),
    evidenceSnippets: v.array(v.string()),
    notes: v.optional(v.string()),
  }).index("by_packId", ["packId"]),

  // 3. personaVariants
  personaVariants: defineTable({
    studyId: v.id("studies"),
    personaPackId: v.id("personaPacks"),
    protoPersonaId: v.id("protoPersonas"),
    axisValues: v.array(axisValueValidator),
    edgeScore: v.number(),
    tensionSeed: v.string(),
    firstPersonBio: v.string(),
    behaviorRules: v.array(v.string()),
    coherenceScore: v.number(),
    distinctnessScore: v.number(),
    accepted: v.boolean(),
  }).index("by_studyId", ["studyId"]),

  // 4. studies
  studies: defineTable({
    orgId: v.string(),
    personaPackId: v.id("personaPacks"),
    name: v.string(),
    description: v.optional(v.string()),
    taskSpec: taskSpecValidator,
    runBudget: v.number(),
    activeConcurrency: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("persona_review"),
      v.literal("ready"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("replaying"),
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    launchRequestedBy: v.optional(v.string()),
    launchedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // 5. runs
  runs: defineTable({
    studyId: v.id("studies"),
    personaVariantId: v.id("personaVariants"),
    protoPersonaId: v.id("protoPersonas"),
    status: v.union(
      v.literal("queued"),
      v.literal("dispatching"),
      v.literal("running"),
      v.literal("success"),
      v.literal("hard_fail"),
      v.literal("soft_fail"),
      v.literal("gave_up"),
      v.literal("timeout"),
      v.literal("blocked_by_guardrail"),
      v.literal("infra_error"),
      v.literal("cancelled"),
    ),
    replayOfRunId: v.optional(v.id("runs")),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    stepCount: v.optional(v.number()),
    finalUrl: v.optional(v.string()),
    finalOutcome: v.optional(v.string()),
    selfReport: v.optional(
      v.object({
        perceivedSuccess: v.boolean(),
        hardestPart: v.optional(v.string()),
        confusion: v.optional(v.string()),
        confidence: v.optional(v.number()),
        suggestedChange: v.optional(v.string()),
      }),
    ),
    frustrationCount: v.number(),
    milestoneKeys: v.array(v.string()),
    artifactManifestKey: v.optional(v.string()),
    summaryKey: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  })
    .index("by_studyId", ["studyId"])
    .index("by_studyId_status", ["studyId", "status"]),

  // 6. runMilestones
  runMilestones: defineTable({
    runId: v.id("runs"),
    studyId: v.id("studies"),
    stepIndex: v.number(),
    timestamp: v.number(),
    url: v.string(),
    title: v.string(),
    actionType: v.string(),
    rationaleShort: v.string(),
    screenshotKey: v.optional(v.string()),
    note: v.optional(v.string()),
  }).index("by_runId", ["runId"]),

  // 7. issueClusters
  issueClusters: defineTable({
    studyId: v.id("studies"),
    title: v.string(),
    summary: v.string(),
    severity: v.union(
      v.literal("blocker"),
      v.literal("major"),
      v.literal("minor"),
      v.literal("cosmetic"),
    ),
    affectedRunCount: v.number(),
    affectedRunRate: v.number(),
    affectedProtoPersonaIds: v.array(v.id("protoPersonas")),
    affectedAxisRanges: v.array(axisRangeValidator),
    representativeRunIds: v.array(v.id("runs")),
    replayConfidence: v.number(),
    evidenceKeys: v.array(v.string()),
    recommendation: v.string(),
    confidenceNote: v.string(),
    score: v.number(),
  }).index("by_studyId", ["studyId"]),

  // 8. studyReports
  studyReports: defineTable({
    studyId: v.id("studies"),
    headlineMetrics: v.object({
      completionRate: v.number(),
      abandonmentRate: v.number(),
      medianSteps: v.number(),
      medianDurationSec: v.number(),
    }),
    issueClusterIds: v.array(v.id("issueClusters")),
    segmentBreakdownKey: v.string(),
    limitations: v.array(v.string()),
    htmlReportKey: v.optional(v.string()),
    jsonReportKey: v.optional(v.string()),
    createdAt: v.number(),
  }),

  // 9. credentials
  credentials: defineTable({
    label: v.string(),
    encryptedPayload: v.string(),
    description: v.string(),
    allowedStudyIds: v.optional(v.array(v.id("studies"))),
    orgId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // 10. settings
  settings: defineTable({
    orgId: v.string(),
    domainAllowlist: v.array(v.string()),
    maxConcurrency: v.number(),
    modelConfig: v.array(
      v.object({ taskCategory: v.string(), modelId: v.string() }),
    ),
    runBudgetCap: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }),
});
