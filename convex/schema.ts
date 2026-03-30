import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const { users: _authUsers, ...otherAuthTables } = authTables;

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

const transcriptEvidenceSnippetValidator = v.object({
  quote: v.string(),
  startChar: v.number(),
  endChar: v.number(),
});

const transcriptSignalPayloadValidator = v.object({
  themes: v.array(v.string()),
  attitudes: v.array(v.string()),
  painPoints: v.array(v.string()),
  decisionPatterns: v.array(v.string()),
  evidenceSnippets: v.array(transcriptEvidenceSnippetValidator),
});

const archetypeAxisValueValidator = v.object({
  key: v.string(),
  value: v.number(),
});

const archetypeEvidenceSnippetValidator = v.object({
  transcriptId: v.id("transcripts"),
  quote: v.string(),
  startChar: v.number(),
  endChar: v.number(),
});

const extractionModeValidator = v.union(
  v.literal("auto_discover"),
  v.literal("guided"),
);

const extractionRunStatusValidator = v.union(
  v.literal("processing"),
  v.literal("completed"),
  v.literal("completed_with_failures"),
  v.literal("failed"),
);

const transcriptSignalStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);

const transcriptArchetypeValidator = v.object({
  name: v.string(),
  summary: v.string(),
  axisValues: v.array(archetypeAxisValueValidator),
  evidenceSnippets: v.array(archetypeEvidenceSnippetValidator),
  contributingTranscriptIds: v.array(v.id("transcripts")),
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
  ...otherAuthTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

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
    updatedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_orgId", ["orgId"]),

  // 2. axisDefinitions
  axisDefinitions: defineTable({
    key: v.string(),
    label: v.string(),
    description: v.string(),
    lowAnchor: v.string(),
    midAnchor: v.string(),
    highAnchor: v.string(),
    weight: v.number(),
    tags: v.array(v.string()),
    usageCount: v.number(),
    creationSource: v.union(v.literal("manual"), v.literal("pack_publish")),
    orgId: v.string(),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orgId", ["orgId"])
    .index("by_orgId_and_key", ["orgId", "key"]),

  // 2b. transcripts
  transcripts: defineTable({
    storageId: v.id("_storage"),
    originalFilename: v.string(),
    format: v.union(v.literal("txt"), v.literal("json")),
    metadata: v.object({
      participantId: v.optional(v.string()),
      date: v.optional(v.number()),
      tags: v.array(v.string()),
      notes: v.optional(v.string()),
    }),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("error"),
    ),
    processingError: v.optional(v.string()),
    characterCount: v.number(),
    orgId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_orgId", ["orgId"]),

  // 2c. packTranscripts
  packTranscripts: defineTable({
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
    createdAt: v.number(),
  })
    .index("by_packId", ["packId"])
    .index("by_transcriptId", ["transcriptId"]),

  // 2d. transcriptSignals
  transcriptSignals: defineTable({
    transcriptId: v.id("transcripts"),
    packId: v.id("personaPacks"),
    orgId: v.string(),
    status: transcriptSignalStatusValidator,
    signals: v.optional(transcriptSignalPayloadValidator),
    processingError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_packId", ["packId"])
    .index("by_transcriptId", ["transcriptId"])
    .index("by_packId_and_transcriptId", ["packId", "transcriptId"]),

  // 2e. transcriptExtractionRuns
  transcriptExtractionRuns: defineTable({
    packId: v.id("personaPacks"),
    orgId: v.string(),
    mode: extractionModeValidator,
    status: extractionRunStatusValidator,
    guidedAxes: v.array(axisValidator),
    proposedAxes: v.array(axisValidator),
    archetypes: v.array(transcriptArchetypeValidator),
    totalTranscripts: v.number(),
    processedTranscriptCount: v.number(),
    currentTranscriptId: v.optional(v.id("transcripts")),
    succeededTranscriptIds: v.array(v.id("transcripts")),
    failedTranscripts: v.array(
      v.object({
        transcriptId: v.id("transcripts"),
        error: v.string(),
      }),
    ),
    errorMessage: v.optional(v.string()),
    startedBy: v.string(),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_packId", ["packId"])
    .index("by_orgId", ["orgId"]),

  // 3. syntheticUsers
  syntheticUsers: defineTable({
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

  // 4. personaVariants
  personaVariants: defineTable({
    studyId: v.id("studies"),
    personaPackId: v.id("personaPacks"),
    syntheticUserId: v.id("syntheticUsers"),
    axisValues: v.array(axisValueValidator),
    edgeScore: v.number(),
    tensionSeed: v.string(),
    firstPersonBio: v.string(),
    behaviorRules: v.array(v.string()),
    coherenceScore: v.number(),
    distinctnessScore: v.number(),
    accepted: v.boolean(),
  }).index("by_studyId", ["studyId"]),

  // 5. studies
  studies: defineTable({
    orgId: v.string(),
    personaPackId: v.id("personaPacks"),
    name: v.string(),
    description: v.optional(v.string()),
    taskSpec: taskSpecValidator,
    runBudget: v.optional(v.number()),
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
    failureReason: v.optional(v.string()),
    cancellationRequestedAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_personaPackId", ["personaPackId"])
    .index("by_orgId_and_updatedAt", ["orgId", "updatedAt"]),

  // 6. runs
  runs: defineTable({
    studyId: v.id("studies"),
    personaVariantId: v.id("personaVariants"),
    syntheticUserId: v.id("syntheticUsers"),
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
        answers: v.optional(
          v.record(
            v.string(),
            v.union(v.string(), v.number(), v.boolean()),
          ),
        ),
      }),
    ),
    lastHeartbeatAt: v.optional(v.number()),
    cancellationRequestedAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
    frustrationCount: v.number(),
    milestoneKeys: v.array(v.string()),
    artifactManifestKey: v.optional(v.string()),
    summaryKey: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    guardrailCode: v.optional(v.string()),
  })
    .index("by_studyId", ["studyId"])
    .index("by_studyId_status", ["studyId", "status"])
    .index("by_studyId_and_syntheticUserId", ["studyId", "syntheticUserId"])
    .index("by_status", ["status"]),

  // 7. runMilestones
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
  })
    .index("by_runId", ["runId"])
    .index("by_runId_and_stepIndex", ["runId", "stepIndex"]),

  // 8. issueClusters
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
    affectedSyntheticUserIds: v.array(v.id("syntheticUsers")),
    affectedAxisRanges: v.array(axisRangeValidator),
    representativeRunIds: v.array(v.id("runs")),
    replayConfidence: v.number(),
    evidenceKeys: v.array(v.string()),
    recommendation: v.string(),
    confidenceNote: v.string(),
    score: v.number(),
  }).index("by_studyId", ["studyId"]),

  // 8. issueClusterNotes
  issueClusterNotes: defineTable({
    issueClusterId: v.id("issueClusters"),
    authorId: v.string(),
    note: v.string(),
    createdAt: v.number(),
  }).index("by_issueClusterId", ["issueClusterId"]),

  // 9. studyReports
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
    htmlReportStorageId: v.optional(v.id("_storage")),
    jsonReportKey: v.optional(v.string()),
    jsonReportStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_studyId", ["studyId"]),

  // 10. auditEvents
  auditEvents: defineTable({
    orgId: v.string(),
    actorId: v.string(),
    eventType: v.string(),
    studyId: v.optional(v.id("studies")),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_orgId_and_createdAt", ["orgId", "createdAt"])
    .index("by_orgId_and_actorId_and_createdAt", ["orgId", "actorId", "createdAt"])
    .index("by_orgId_and_studyId_and_createdAt", ["orgId", "studyId", "createdAt"])
    .index("by_orgId_and_eventType_and_createdAt", ["orgId", "eventType", "createdAt"])
    .index("by_studyId_and_createdAt", ["studyId", "createdAt"])
    .index("by_actorId_and_createdAt", ["actorId", "createdAt"])
    .index("by_eventType_and_createdAt", ["eventType", "createdAt"]),

  // 11. guardrailEvents
  guardrailEvents: defineTable({
    orgId: v.string(),
    studyId: v.id("studies"),
    actorId: v.string(),
    outcome: v.union(v.literal("pass"), v.literal("fail")),
    reasons: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_studyId_and_createdAt", ["studyId", "createdAt"])
    .index("by_orgId_and_createdAt", ["orgId", "createdAt"]),

  // 12. credentials
  credentials: defineTable({
    ref: v.string(),
    label: v.string(),
    encryptedPayload: v.string(),
    description: v.string(),
    allowedStudyIds: v.optional(v.array(v.id("studies"))),
    orgId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orgId_and_ref", ["orgId", "ref"])
    .index("by_orgId_and_updatedAt", ["orgId", "updatedAt"]),

  // 13. settings
  settings: defineTable({
    orgId: v.string(),
    domainAllowlist: v.array(v.string()),
    maxConcurrency: v.number(),
    modelConfig: v.array(
      v.object({ taskCategory: v.string(), modelId: v.string() }),
    ),
    runBudgetCap: v.number(),
    budgetLimits: v.optional(
      v.object({
        maxTokensPerStudy: v.optional(v.number()),
        maxBrowserSecPerStudy: v.optional(v.number()),
      }),
    ),
    browserPolicy: v.optional(
      v.object({
        blockAnalytics: v.boolean(),
        blockHeavyMedia: v.boolean(),
        screenshotFormat: v.string(),
        screenshotMode: v.string(),
      }),
    ),
    signedUrlExpirySeconds: v.optional(v.number()),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_orgId", ["orgId"]),

  // 14. metrics
  metrics: defineTable({
    orgId: v.string(),
    studyId: v.id("studies"),
    runId: v.optional(v.id("runs")),
    metricType: v.string(),
    value: v.number(),
    unit: v.string(),
    status: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    recordedAt: v.number(),
  })
    .index("by_orgId_and_recordedAt", ["orgId", "recordedAt"])
    .index("by_studyId_and_recordedAt", ["studyId", "recordedAt"])
    .index("by_orgId_and_metricType_and_recordedAt", [
      "orgId",
      "metricType",
      "recordedAt",
    ]),
});
