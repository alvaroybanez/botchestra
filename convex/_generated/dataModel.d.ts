/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  auditEvents: {
    document: {
      actorId: string;
      createdAt: number;
      eventType: string;
      orgId: string;
      reason?: string;
      resourceId?: string;
      resourceType?: string;
      studyId?: Id<"studies">;
      _id: Id<"auditEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorId"
      | "createdAt"
      | "eventType"
      | "orgId"
      | "reason"
      | "resourceId"
      | "resourceType"
      | "studyId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_actorId_and_createdAt: ["actorId", "createdAt", "_creationTime"];
      by_eventType_and_createdAt: ["eventType", "createdAt", "_creationTime"];
      by_orgId_and_actorId_and_createdAt: [
        "orgId",
        "actorId",
        "createdAt",
        "_creationTime",
      ];
      by_orgId_and_createdAt: ["orgId", "createdAt", "_creationTime"];
      by_orgId_and_eventType_and_createdAt: [
        "orgId",
        "eventType",
        "createdAt",
        "_creationTime",
      ];
      by_orgId_and_studyId_and_createdAt: [
        "orgId",
        "studyId",
        "createdAt",
        "_creationTime",
      ];
      by_studyId_and_createdAt: ["studyId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authAccounts: {
    document: {
      emailVerified?: string;
      phoneVerified?: string;
      provider: string;
      providerAccountId: string;
      secret?: string;
      userId: Id<"users">;
      _id: Id<"authAccounts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "emailVerified"
      | "phoneVerified"
      | "provider"
      | "providerAccountId"
      | "secret"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      providerAndAccountId: ["provider", "providerAccountId", "_creationTime"];
      userIdAndProvider: ["userId", "provider", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authRateLimits: {
    document: {
      attemptsLeft: number;
      identifier: string;
      lastAttemptTime: number;
      _id: Id<"authRateLimits">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attemptsLeft"
      | "identifier"
      | "lastAttemptTime";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      identifier: ["identifier", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authRefreshTokens: {
    document: {
      expirationTime: number;
      firstUsedTime?: number;
      parentRefreshTokenId?: Id<"authRefreshTokens">;
      sessionId: Id<"authSessions">;
      _id: Id<"authRefreshTokens">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "expirationTime"
      | "firstUsedTime"
      | "parentRefreshTokenId"
      | "sessionId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      sessionId: ["sessionId", "_creationTime"];
      sessionIdAndParentRefreshTokenId: [
        "sessionId",
        "parentRefreshTokenId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authSessions: {
    document: {
      expirationTime: number;
      userId: Id<"users">;
      _id: Id<"authSessions">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "expirationTime" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authVerificationCodes: {
    document: {
      accountId: Id<"authAccounts">;
      code: string;
      emailVerified?: string;
      expirationTime: number;
      phoneVerified?: string;
      provider: string;
      verifier?: string;
      _id: Id<"authVerificationCodes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accountId"
      | "code"
      | "emailVerified"
      | "expirationTime"
      | "phoneVerified"
      | "provider"
      | "verifier";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      accountId: ["accountId", "_creationTime"];
      code: ["code", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  authVerifiers: {
    document: {
      sessionId?: Id<"authSessions">;
      signature?: string;
      _id: Id<"authVerifiers">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "sessionId" | "signature";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      signature: ["signature", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  axisDefinitions: {
    document: {
      createdAt: number;
      createdBy: string;
      creationSource: "manual" | "pack_publish";
      description: string;
      highAnchor: string;
      key: string;
      label: string;
      lowAnchor: string;
      midAnchor: string;
      orgId: string;
      tags: Array<string>;
      updatedAt: number;
      updatedBy: string;
      usageCount: number;
      weight: number;
      _id: Id<"axisDefinitions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "createdBy"
      | "creationSource"
      | "description"
      | "highAnchor"
      | "key"
      | "label"
      | "lowAnchor"
      | "midAnchor"
      | "orgId"
      | "tags"
      | "updatedAt"
      | "updatedBy"
      | "usageCount"
      | "weight";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId: ["orgId", "_creationTime"];
      by_orgId_and_key: ["orgId", "key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  credentials: {
    document: {
      allowedStudyIds?: Array<Id<"studies">>;
      createdAt: number;
      createdBy: string;
      description: string;
      encryptedPayload: string;
      label: string;
      orgId: string;
      ref: string;
      updatedAt: number;
      _id: Id<"credentials">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "allowedStudyIds"
      | "createdAt"
      | "createdBy"
      | "description"
      | "encryptedPayload"
      | "label"
      | "orgId"
      | "ref"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId_and_ref: ["orgId", "ref", "_creationTime"];
      by_orgId_and_updatedAt: ["orgId", "updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  guardrailEvents: {
    document: {
      actorId: string;
      createdAt: number;
      orgId: string;
      outcome: "pass" | "fail";
      reasons: Array<string>;
      studyId: Id<"studies">;
      _id: Id<"guardrailEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorId"
      | "createdAt"
      | "orgId"
      | "outcome"
      | "reasons"
      | "studyId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId_and_createdAt: ["orgId", "createdAt", "_creationTime"];
      by_studyId_and_createdAt: ["studyId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  issueClusterNotes: {
    document: {
      authorId: string;
      createdAt: number;
      issueClusterId: Id<"issueClusters">;
      note: string;
      _id: Id<"issueClusterNotes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "authorId"
      | "createdAt"
      | "issueClusterId"
      | "note";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_issueClusterId: ["issueClusterId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  issueClusters: {
    document: {
      affectedAxisRanges: Array<{ key: string; max: number; min: number }>;
      affectedRunCount: number;
      affectedRunRate: number;
      affectedSyntheticUserIds: Array<Id<"syntheticUsers">>;
      confidenceNote: string;
      evidenceKeys: Array<string>;
      recommendation: string;
      replayConfidence: number;
      representativeRunIds: Array<Id<"runs">>;
      score: number;
      severity: "blocker" | "major" | "minor" | "cosmetic";
      studyId: Id<"studies">;
      summary: string;
      title: string;
      _id: Id<"issueClusters">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "affectedAxisRanges"
      | "affectedRunCount"
      | "affectedRunRate"
      | "affectedSyntheticUserIds"
      | "confidenceNote"
      | "evidenceKeys"
      | "recommendation"
      | "replayConfidence"
      | "representativeRunIds"
      | "score"
      | "severity"
      | "studyId"
      | "summary"
      | "title";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_studyId: ["studyId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  metrics: {
    document: {
      errorCode?: string;
      metricType: string;
      orgId: string;
      recordedAt: number;
      runId?: Id<"runs">;
      status?: string;
      studyId: Id<"studies">;
      unit: string;
      value: number;
      _id: Id<"metrics">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "errorCode"
      | "metricType"
      | "orgId"
      | "recordedAt"
      | "runId"
      | "status"
      | "studyId"
      | "unit"
      | "value";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId_and_metricType_and_recordedAt: [
        "orgId",
        "metricType",
        "recordedAt",
        "_creationTime",
      ];
      by_orgId_and_recordedAt: ["orgId", "recordedAt", "_creationTime"];
      by_studyId_and_recordedAt: ["studyId", "recordedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  packTranscripts: {
    document: {
      createdAt: number;
      packId: Id<"personaPacks">;
      transcriptId: Id<"transcripts">;
      _id: Id<"packTranscripts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "packId"
      | "transcriptId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_packId: ["packId", "_creationTime"];
      by_transcriptId: ["transcriptId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  personaPacks: {
    document: {
      context: string;
      createdAt: number;
      createdBy: string;
      description: string;
      name: string;
      orgId: string;
      sharedAxes: Array<{
        description: string;
        highAnchor: string;
        key: string;
        label: string;
        lowAnchor: string;
        midAnchor: string;
        weight: number;
      }>;
      status: "draft" | "published" | "archived";
      updatedAt: number;
      updatedBy?: string;
      version: number;
      _id: Id<"personaPacks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "context"
      | "createdAt"
      | "createdBy"
      | "description"
      | "name"
      | "orgId"
      | "sharedAxes"
      | "status"
      | "updatedAt"
      | "updatedBy"
      | "version";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId: ["orgId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  personaVariants: {
    document: {
      accepted: boolean;
      axisValues: Array<{ key: string; value: number }>;
      behaviorRules: Array<string>;
      coherenceScore: number;
      distinctnessScore: number;
      edgeScore: number;
      firstPersonBio: string;
      personaPackId: Id<"personaPacks">;
      studyId: Id<"studies">;
      syntheticUserId: Id<"syntheticUsers">;
      tensionSeed: string;
      _id: Id<"personaVariants">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accepted"
      | "axisValues"
      | "behaviorRules"
      | "coherenceScore"
      | "distinctnessScore"
      | "edgeScore"
      | "firstPersonBio"
      | "personaPackId"
      | "studyId"
      | "syntheticUserId"
      | "tensionSeed";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_studyId: ["studyId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  runMilestones: {
    document: {
      actionType: string;
      note?: string;
      rationaleShort: string;
      runId: Id<"runs">;
      screenshotKey?: string;
      stepIndex: number;
      studyId: Id<"studies">;
      timestamp: number;
      title: string;
      url: string;
      _id: Id<"runMilestones">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actionType"
      | "note"
      | "rationaleShort"
      | "runId"
      | "screenshotKey"
      | "stepIndex"
      | "studyId"
      | "timestamp"
      | "title"
      | "url";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_runId: ["runId", "_creationTime"];
      by_runId_and_stepIndex: ["runId", "stepIndex", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  runs: {
    document: {
      artifactManifestKey?: string;
      cancellationReason?: string;
      cancellationRequestedAt?: number;
      durationSec?: number;
      endedAt?: number;
      errorCode?: string;
      finalOutcome?: string;
      finalUrl?: string;
      frustrationCount: number;
      guardrailCode?: string;
      lastHeartbeatAt?: number;
      milestoneKeys: Array<string>;
      personaVariantId: Id<"personaVariants">;
      replayOfRunId?: Id<"runs">;
      selfReport?: {
        answers?: Record<string, string | number | boolean>;
        confidence?: number;
        confusion?: string;
        hardestPart?: string;
        perceivedSuccess: boolean;
        suggestedChange?: string;
      };
      startedAt?: number;
      status:
        | "queued"
        | "dispatching"
        | "running"
        | "success"
        | "hard_fail"
        | "soft_fail"
        | "gave_up"
        | "timeout"
        | "blocked_by_guardrail"
        | "infra_error"
        | "cancelled";
      stepCount?: number;
      studyId: Id<"studies">;
      summaryKey?: string;
      syntheticUserId: Id<"syntheticUsers">;
      workerSessionId?: string;
      _id: Id<"runs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "artifactManifestKey"
      | "cancellationReason"
      | "cancellationRequestedAt"
      | "durationSec"
      | "endedAt"
      | "errorCode"
      | "finalOutcome"
      | "finalUrl"
      | "frustrationCount"
      | "guardrailCode"
      | "lastHeartbeatAt"
      | "milestoneKeys"
      | "personaVariantId"
      | "replayOfRunId"
      | "selfReport"
      | "selfReport.answers"
      | `selfReport.answers.${string}`
      | "selfReport.confidence"
      | "selfReport.confusion"
      | "selfReport.hardestPart"
      | "selfReport.perceivedSuccess"
      | "selfReport.suggestedChange"
      | "startedAt"
      | "status"
      | "stepCount"
      | "studyId"
      | "summaryKey"
      | "syntheticUserId"
      | "workerSessionId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_status: ["status", "_creationTime"];
      by_studyId: ["studyId", "_creationTime"];
      by_studyId_and_syntheticUserId: [
        "studyId",
        "syntheticUserId",
        "_creationTime",
      ];
      by_studyId_status: ["studyId", "status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  settings: {
    document: {
      browserPolicy?: {
        blockAnalytics: boolean;
        blockHeavyMedia: boolean;
        screenshotFormat: string;
        screenshotMode: string;
      };
      budgetLimits?: {
        maxBrowserSecPerStudy?: number;
        maxTokensPerStudy?: number;
      };
      domainAllowlist: Array<string>;
      maxConcurrency: number;
      modelConfig: Array<{ modelId: string; taskCategory: string }>;
      orgId: string;
      runBudgetCap: number;
      signedUrlExpirySeconds?: number;
      updatedAt: number;
      updatedBy: string;
      _id: Id<"settings">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "browserPolicy"
      | "browserPolicy.blockAnalytics"
      | "browserPolicy.blockHeavyMedia"
      | "browserPolicy.screenshotFormat"
      | "browserPolicy.screenshotMode"
      | "budgetLimits"
      | "budgetLimits.maxBrowserSecPerStudy"
      | "budgetLimits.maxTokensPerStudy"
      | "domainAllowlist"
      | "maxConcurrency"
      | "modelConfig"
      | "orgId"
      | "runBudgetCap"
      | "signedUrlExpirySeconds"
      | "updatedAt"
      | "updatedBy";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId: ["orgId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  studies: {
    document: {
      activeConcurrency: number;
      cancellationReason?: string;
      cancellationRequestedAt?: number;
      completedAt?: number;
      createdAt: number;
      createdBy: string;
      description?: string;
      failureReason?: string;
      launchRequestedBy?: string;
      launchedAt?: number;
      name: string;
      orgId: string;
      personaPackId: Id<"personaPacks">;
      runBudget?: number;
      status:
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
      taskSpec: {
        allowedActions: Array<
          | "goto"
          | "click"
          | "type"
          | "select"
          | "scroll"
          | "wait"
          | "back"
          | "finish"
          | "abort"
        >;
        allowedDomains: Array<string>;
        credentialsRef?: string;
        environmentLabel: string;
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
        goal: string;
        locale: string;
        maxDurationSec: number;
        maxSteps: number;
        postTaskQuestions: Array<string>;
        randomSeed?: string;
        scenario: string;
        startingUrl: string;
        stopConditions: Array<string>;
        successCriteria: Array<string>;
        viewport: { height: number; width: number };
      };
      updatedAt: number;
      _id: Id<"studies">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeConcurrency"
      | "cancellationReason"
      | "cancellationRequestedAt"
      | "completedAt"
      | "createdAt"
      | "createdBy"
      | "description"
      | "failureReason"
      | "launchedAt"
      | "launchRequestedBy"
      | "name"
      | "orgId"
      | "personaPackId"
      | "runBudget"
      | "status"
      | "taskSpec"
      | "taskSpec.allowedActions"
      | "taskSpec.allowedDomains"
      | "taskSpec.credentialsRef"
      | "taskSpec.environmentLabel"
      | "taskSpec.forbiddenActions"
      | "taskSpec.goal"
      | "taskSpec.locale"
      | "taskSpec.maxDurationSec"
      | "taskSpec.maxSteps"
      | "taskSpec.postTaskQuestions"
      | "taskSpec.randomSeed"
      | "taskSpec.scenario"
      | "taskSpec.startingUrl"
      | "taskSpec.stopConditions"
      | "taskSpec.successCriteria"
      | "taskSpec.viewport"
      | "taskSpec.viewport.height"
      | "taskSpec.viewport.width"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId_and_updatedAt: ["orgId", "updatedAt", "_creationTime"];
      by_personaPackId: ["personaPackId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  studyReports: {
    document: {
      createdAt: number;
      headlineMetrics: {
        abandonmentRate: number;
        completionRate: number;
        medianDurationSec: number;
        medianSteps: number;
      };
      htmlReportKey?: string;
      htmlReportStorageId?: Id<"_storage">;
      issueClusterIds: Array<Id<"issueClusters">>;
      jsonReportKey?: string;
      jsonReportStorageId?: Id<"_storage">;
      limitations: Array<string>;
      segmentBreakdownKey: string;
      studyId: Id<"studies">;
      _id: Id<"studyReports">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "headlineMetrics"
      | "headlineMetrics.abandonmentRate"
      | "headlineMetrics.completionRate"
      | "headlineMetrics.medianDurationSec"
      | "headlineMetrics.medianSteps"
      | "htmlReportKey"
      | "htmlReportStorageId"
      | "issueClusterIds"
      | "jsonReportKey"
      | "jsonReportStorageId"
      | "limitations"
      | "segmentBreakdownKey"
      | "studyId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_studyId: ["studyId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  syntheticUsers: {
    document: {
      axes: Array<{
        description: string;
        highAnchor: string;
        key: string;
        label: string;
        lowAnchor: string;
        midAnchor: string;
        weight: number;
      }>;
      evidenceSnippets: Array<string>;
      name: string;
      notes?: string;
      packId: Id<"personaPacks">;
      sourceRefs: Array<string>;
      sourceType: "manual" | "json_import" | "transcript_derived";
      summary: string;
      _id: Id<"syntheticUsers">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "axes"
      | "evidenceSnippets"
      | "name"
      | "notes"
      | "packId"
      | "sourceRefs"
      | "sourceType"
      | "summary";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_packId: ["packId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  transcriptExtractionRuns: {
    document: {
      archetypes: Array<{
        axisValues: Array<{ key: string; value: number }>;
        contributingTranscriptIds: Array<Id<"transcripts">>;
        evidenceSnippets: Array<{
          endChar: number;
          quote: string;
          startChar: number;
          transcriptId: Id<"transcripts">;
        }>;
        name: string;
        summary: string;
      }>;
      completedAt?: number;
      currentTranscriptId?: Id<"transcripts">;
      errorMessage?: string;
      failedTranscripts: Array<{
        error: string;
        transcriptId: Id<"transcripts">;
      }>;
      guidedAxes: Array<{
        description: string;
        highAnchor: string;
        key: string;
        label: string;
        lowAnchor: string;
        midAnchor: string;
        weight: number;
      }>;
      mode: "auto_discover" | "guided";
      orgId: string;
      packId: Id<"personaPacks">;
      processedTranscriptCount: number;
      proposedAxes: Array<{
        description: string;
        highAnchor: string;
        key: string;
        label: string;
        lowAnchor: string;
        midAnchor: string;
        weight: number;
      }>;
      startedAt: number;
      startedBy: string;
      status: "processing" | "completed" | "completed_with_failures" | "failed";
      succeededTranscriptIds: Array<Id<"transcripts">>;
      totalTranscripts: number;
      updatedAt: number;
      _id: Id<"transcriptExtractionRuns">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "archetypes"
      | "completedAt"
      | "currentTranscriptId"
      | "errorMessage"
      | "failedTranscripts"
      | "guidedAxes"
      | "mode"
      | "orgId"
      | "packId"
      | "processedTranscriptCount"
      | "proposedAxes"
      | "startedAt"
      | "startedBy"
      | "status"
      | "succeededTranscriptIds"
      | "totalTranscripts"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId: ["orgId", "_creationTime"];
      by_packId: ["packId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  transcripts: {
    document: {
      characterCount: number;
      createdAt: number;
      createdBy: string;
      format: "txt" | "json";
      metadata: {
        date?: number;
        notes?: string;
        participantId?: string;
        tags: Array<string>;
      };
      orgId: string;
      originalFilename: string;
      processingError?: string;
      processingStatus: "pending" | "processing" | "processed" | "error";
      storageId: Id<"_storage">;
      updatedAt: number;
      _id: Id<"transcripts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "characterCount"
      | "createdAt"
      | "createdBy"
      | "format"
      | "metadata"
      | "metadata.date"
      | "metadata.notes"
      | "metadata.participantId"
      | "metadata.tags"
      | "orgId"
      | "originalFilename"
      | "processingError"
      | "processingStatus"
      | "storageId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_orgId: ["orgId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  transcriptSignals: {
    document: {
      createdAt: number;
      orgId: string;
      packId: Id<"personaPacks">;
      processingError?: string;
      signals?: {
        attitudes: Array<string>;
        decisionPatterns: Array<string>;
        evidenceSnippets: Array<{
          endChar: number;
          quote: string;
          startChar: number;
        }>;
        painPoints: Array<string>;
        themes: Array<string>;
      };
      status: "pending" | "processing" | "completed" | "failed";
      transcriptId: Id<"transcripts">;
      updatedAt: number;
      _id: Id<"transcriptSignals">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "orgId"
      | "packId"
      | "processingError"
      | "signals"
      | "signals.attitudes"
      | "signals.decisionPatterns"
      | "signals.evidenceSnippets"
      | "signals.painPoints"
      | "signals.themes"
      | "status"
      | "transcriptId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_packId: ["packId", "_creationTime"];
      by_packId_and_transcriptId: ["packId", "transcriptId", "_creationTime"];
      by_transcriptId: ["transcriptId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      email?: string;
      emailVerificationTime?: number;
      image?: string;
      isAnonymous?: boolean;
      name?: string;
      phone?: string;
      phoneVerificationTime?: number;
      role?: string;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "email"
      | "emailVerificationTime"
      | "image"
      | "isAnonymous"
      | "name"
      | "phone"
      | "phoneVerificationTime"
      | "role";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      email: ["email", "_creationTime"];
      phone: ["phone", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
