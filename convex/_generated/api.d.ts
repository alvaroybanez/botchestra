/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  analysisNotes: {
    addNote: FunctionReference<
      "mutation",
      "public",
      { issueId: Id<"issueClusters">; note: string },
      any
    >;
  };
  analysisQueries: {
    getIssueCluster: FunctionReference<
      "query",
      "public",
      { issueId: Id<"issueClusters"> },
      any
    >;
    getReport: FunctionReference<
      "query",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
    listFindings: FunctionReference<
      "query",
      "public",
      {
        axisRange?: { key: string; max?: number; min?: number };
        outcome?:
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
        protoPersonaId?: Id<"protoPersonas">;
        severity?: "blocker" | "major" | "minor" | "cosmetic";
        studyId: Id<"studies">;
        urlPrefix?: string;
      },
      any
    >;
    resolveArtifactUrls: FunctionReference<
      "query",
      "public",
      { keys: Array<string>; studyId: Id<"studies"> },
      any
    >;
  };
  artifactResolver: {
    getArtifactUrl: FunctionReference<"query", "public", { key: string }, any>;
  };
  auth: {
    isAuthenticated: FunctionReference<"query", "public", {}, any>;
    signIn: FunctionReference<
      "action",
      "public",
      {
        calledBy?: string;
        params?: any;
        provider?: string;
        refreshToken?: string;
        verifier?: string;
      },
      any
    >;
    signOut: FunctionReference<"action", "public", {}, any>;
  };
  credentials: {
    createCredential: FunctionReference<
      "mutation",
      "public",
      {
        credential: {
          allowedStudyIds?: Array<Id<"studies">>;
          description?: string;
          label: string;
          payload: Array<{ key: string; value: string }>;
          ref: string;
        };
      },
      any
    >;
    deleteCredential: FunctionReference<
      "mutation",
      "public",
      { credentialId: Id<"credentials"> },
      any
    >;
    listCredentials: FunctionReference<"query", "public", {}, any>;
    updateCredential: FunctionReference<
      "mutation",
      "public",
      {
        credentialId: Id<"credentials">;
        patch: {
          allowedStudyIds?: Array<Id<"studies">> | null;
          description?: string;
          label?: string;
          payload?: Array<{ key: string; value: string }>;
          ref?: string;
        };
      },
      any
    >;
  };
  observability: {
    getAdminDiagnosticsOverview: FunctionReference<
      "query",
      "public",
      { recentMetricLimit?: number; recentStudyLimit?: number },
      any
    >;
    listAuditEvents: FunctionReference<
      "query",
      "public",
      {
        actorId?: string;
        endAt?: number;
        eventType?:
          | "study.launched"
          | "study.cancelled"
          | "report.published"
          | "settings.updated"
          | "credential.created"
          | "credential.updated"
          | "credential.deleted";
        limit?: number;
        startAt?: number;
        studyId?: Id<"studies">;
      },
      any
    >;
    listMetrics: FunctionReference<
      "query",
      "public",
      {
        endAt?: number;
        limit?: number;
        metricType?:
          | "wave.dispatched_runs"
          | "run.completed"
          | "study.completed";
        startAt?: number;
        studyId?: Id<"studies">;
      },
      any
    >;
  };
  personaPacks: {
    archive: FunctionReference<
      "mutation",
      "public",
      { packId: Id<"personaPacks"> },
      any
    >;
    createDraft: FunctionReference<
      "mutation",
      "public",
      {
        pack: {
          context: string;
          description: string;
          name: string;
          sharedAxes: Array<{
            description: string;
            highAnchor: string;
            key: string;
            label: string;
            lowAnchor: string;
            midAnchor: string;
            weight: number;
          }>;
        };
      },
      any
    >;
    createProtoPersona: FunctionReference<
      "mutation",
      "public",
      {
        packId: Id<"personaPacks">;
        protoPersona: {
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
          summary: string;
        };
      },
      any
    >;
    deleteProtoPersona: FunctionReference<
      "mutation",
      "public",
      { protoPersonaId: Id<"protoPersonas"> },
      any
    >;
    exportJson: FunctionReference<
      "action",
      "public",
      { packId: Id<"personaPacks"> },
      any
    >;
    get: FunctionReference<
      "query",
      "public",
      { packId: Id<"personaPacks"> },
      any
    >;
    getProtoPersona: FunctionReference<
      "query",
      "public",
      { protoPersonaId: Id<"protoPersonas"> },
      any
    >;
    importJson: FunctionReference<"action", "public", { json: string }, any>;
    list: FunctionReference<"query", "public", {}, any>;
    listProtoPersonas: FunctionReference<
      "query",
      "public",
      { packId: Id<"personaPacks"> },
      any
    >;
    publish: FunctionReference<
      "mutation",
      "public",
      { packId: Id<"personaPacks"> },
      any
    >;
    updateDraft: FunctionReference<
      "mutation",
      "public",
      {
        packId: Id<"personaPacks">;
        patch: {
          context?: string;
          description?: string;
          name?: string;
          sharedAxes?: Array<{
            description: string;
            highAnchor: string;
            key: string;
            label: string;
            lowAnchor: string;
            midAnchor: string;
            weight: number;
          }>;
        };
      },
      any
    >;
    updateProtoPersona: FunctionReference<
      "mutation",
      "public",
      {
        patch: {
          axes?: Array<{
            description: string;
            highAnchor: string;
            key: string;
            label: string;
            lowAnchor: string;
            midAnchor: string;
            weight: number;
          }>;
          evidenceSnippets?: Array<string>;
          name?: string;
          notes?: string;
          summary?: string;
        };
        protoPersonaId: Id<"protoPersonas">;
      },
      any
    >;
  };
  personaVariantGeneration: {
    generateVariantsForStudy: FunctionReference<
      "action",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
    previewVariants: FunctionReference<
      "action",
      "public",
      { budget: number; packId: Id<"personaPacks"> },
      any
    >;
  };
  personaVariantReview: {
    getPackVariantReview: FunctionReference<
      "query",
      "public",
      { packId: Id<"personaPacks">; studyId?: Id<"studies"> },
      any
    >;
    getStudyVariantReview: FunctionReference<
      "query",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
  };
  rbac: {
    getViewerAccess: FunctionReference<"query", "public", {}, any>;
  };
  reportExports: {
    exportHtml: FunctionReference<
      "action",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
    exportJson: FunctionReference<
      "action",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
  };
  runs: {
    getRun: FunctionReference<"query", "public", { runId: Id<"runs"> }, any>;
    getRunSummary: FunctionReference<
      "query",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
    listRuns: FunctionReference<
      "query",
      "public",
      {
        finalUrlContains?: string;
        outcome?:
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
        protoPersonaId?: Id<"protoPersonas">;
        studyId: Id<"studies">;
      },
      any
    >;
  };
  settings: {
    addDomainToAllowlist: FunctionReference<
      "mutation",
      "public",
      { domain: string },
      any
    >;
    getSettings: FunctionReference<"query", "public", {}, any>;
    removeDomainFromAllowlist: FunctionReference<
      "mutation",
      "public",
      { domain: string },
      any
    >;
    updateSettings: FunctionReference<
      "mutation",
      "public",
      {
        patch: {
          browserPolicy?: {
            blockAnalytics?: boolean;
            blockHeavyMedia?: boolean;
            screenshotFormat?: string;
            screenshotMode?: string;
          };
          budgetLimits?: {
            maxBrowserSecPerStudy?: number;
            maxTokensPerStudy?: number;
          };
          domainAllowlist?: Array<string>;
          maxConcurrency?: number;
          modelConfig?: Array<{
            modelId: string;
            taskCategory:
              | "expansion"
              | "action"
              | "summarization"
              | "clustering"
              | "recommendation";
          }>;
          runBudgetCap?: number;
          signedUrlExpirySeconds?: number;
        };
      },
      any
    >;
  };
  studies: {
    cancelStudy: FunctionReference<
      "mutation",
      "public",
      { reason?: string; studyId: Id<"studies"> },
      any
    >;
    createStudy: FunctionReference<
      "mutation",
      "public",
      {
        study: {
          activeConcurrency: number;
          description?: string;
          name: string;
          personaPackId: Id<"personaPacks">;
          runBudget?: number;
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
            postTaskQuestions?: Array<string>;
            randomSeed?: string;
            scenario: string;
            startingUrl: string;
            stopConditions: Array<string>;
            successCriteria: Array<string>;
            viewport: { height: number; width: number };
          };
        };
      },
      any
    >;
    getStudy: FunctionReference<
      "query",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
    launchStudy: FunctionReference<
      "mutation",
      "public",
      { productionAck?: boolean; studyId: Id<"studies"> },
      any
    >;
    listStudies: FunctionReference<"query", "public", {}, any>;
    updateStudy: FunctionReference<
      "mutation",
      "public",
      {
        patch: {
          activeConcurrency?: number;
          description?: string;
          name?: string;
          runBudget?: number;
          taskSpec?: {
            allowedActions?: Array<
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
            allowedDomains?: Array<string>;
            credentialsRef?: string;
            environmentLabel?: string;
            forbiddenActions?: Array<
              | "external_download"
              | "payment_submission"
              | "email_send"
              | "sms_send"
              | "captcha_bypass"
              | "account_creation_without_fixture"
              | "cross_domain_escape"
              | "file_upload_unless_allowed"
            >;
            goal?: string;
            locale?: string;
            maxDurationSec?: number;
            maxSteps?: number;
            postTaskQuestions?: Array<string>;
            randomSeed?: string;
            scenario?: string;
            startingUrl?: string;
            stopConditions?: Array<string>;
            successCriteria?: Array<string>;
            viewport?: { height: number; width: number };
          };
        };
        studyId: Id<"studies">;
      },
      any
    >;
    validateStudyLaunch: FunctionReference<
      "mutation",
      "public",
      { productionAck?: boolean; studyId: Id<"studies"> },
      any
    >;
  };
  studyLifecycleWorkflow: {
    getStudyReport: FunctionReference<
      "query",
      "public",
      { studyId: Id<"studies"> },
      any
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  analysisPipeline: {
    analyzeStudy: FunctionReference<
      "action",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    summarizeStudyRuns: FunctionReference<
      "action",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
  };
  analysisPipelineModel: {
    getRunSummarizationContext: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    getStudyAnalysisSnapshot: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    listRankedIssueClusterIds: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    persistRunSummary: FunctionReference<
      "mutation",
      "internal",
      { runId: Id<"runs">; summaryKey: string },
      any
    >;
    replaceIssueClustersForStudy: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
  };
  auditEvents: {
    recordAuditEvent: FunctionReference<
      "mutation",
      "internal",
      {
        actorId: string;
        eventType: "study.cancelled";
        reason?: string;
        studyId: Id<"studies">;
        timestamp?: number;
      },
      any
    >;
  };
  auth: {
    store: FunctionReference<
      "mutation",
      "internal",
      {
        args:
          | {
              generateTokens: boolean;
              sessionId?: Id<"authSessions">;
              type: "signIn";
              userId: Id<"users">;
            }
          | { type: "signOut" }
          | { refreshToken: string; type: "refreshSession" }
          | {
              allowExtraProviders: boolean;
              generateTokens: boolean;
              params: any;
              provider?: string;
              type: "verifyCodeAndSignIn";
              verifier?: string;
            }
          | { type: "verifier" }
          | { signature: string; type: "verifierSignature"; verifier: string }
          | {
              profile: any;
              provider: string;
              providerAccountId: string;
              signature: string;
              type: "userOAuth";
            }
          | {
              accountId?: Id<"authAccounts">;
              allowExtraProviders: boolean;
              code: string;
              email?: string;
              expirationTime: number;
              phone?: string;
              provider: string;
              type: "createVerificationCode";
            }
          | {
              account: { id: string; secret?: string };
              profile: any;
              provider: string;
              shouldLinkViaEmail?: boolean;
              shouldLinkViaPhone?: boolean;
              type: "createAccountFromCredentials";
            }
          | {
              account: { id: string; secret?: string };
              provider: string;
              type: "retrieveAccountWithCredentials";
            }
          | {
              account: { id: string; secret: string };
              provider: string;
              type: "modifyAccount";
            }
          | {
              except?: Array<Id<"authSessions">>;
              type: "invalidateSessions";
              userId: Id<"users">;
            };
      },
      any
    >;
  };
  costControls: {
    evaluateStudyCostControls: FunctionReference<
      "mutation",
      "internal",
      { observedAt?: number; studyId: Id<"studies"> },
      any
    >;
  };
  credentials: {
    resolveCredentialForStudy: FunctionReference<
      "query",
      "internal",
      { credentialsRef: string; studyId: Id<"studies"> },
      any
    >;
  };
  heartbeatMonitor: {
    monitorStaleRuns: FunctionReference<
      "mutation",
      "internal",
      { now?: number },
      any
    >;
  };
  personaPacks: {
    getExportPayload: FunctionReference<
      "query",
      "internal",
      { orgId: string; packId: Id<"personaPacks"> },
      any
    >;
    persistImportedPack: FunctionReference<
      "mutation",
      "internal",
      {
        createdBy: string;
        importedPack: {
          context: string;
          description: string;
          name: string;
          protoPersonas: Array<{
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
            summary: string;
          }>;
          sharedAxes: Array<{
            description: string;
            highAnchor: string;
            key: string;
            label: string;
            lowAnchor: string;
            midAnchor: string;
            weight: number;
          }>;
          status?: "draft" | "published" | "archived";
          version?: number;
        };
        orgId: string;
      },
      any
    >;
  };
  personaVariantGeneration: {
    generateVariantsForStudyInternal: FunctionReference<
      "action",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
  };
  personaVariantGenerationModel: {
    getGenerationContext: FunctionReference<
      "query",
      "internal",
      { orgId: string; studyId: Id<"studies"> },
      any
    >;
    getPreviewContext: FunctionReference<
      "query",
      "internal",
      { orgId: string; packId: Id<"personaPacks"> },
      any
    >;
    getStudyGenerationOwner: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    persistVariantsIfAbsent: FunctionReference<
      "mutation",
      "internal",
      {
        orgId: string;
        studyId: Id<"studies">;
        summary: {
          acceptedCount: number;
          coverage: {
            budget: number;
            edgeCount: number;
            interiorCount: number;
            minimumPairwiseDistance: number;
            perProtoPersona: Array<{
              acceptedCount: number;
              protoPersonaId: Id<"protoPersonas">;
              rejectedCount: number;
            }>;
          };
          rejectedCount: number;
          retryCount: number;
        };
        variants: Array<{
          accepted: boolean;
          axisValues: Array<{ key: string; value: number }>;
          behaviorRules: Array<string>;
          coherenceScore: number;
          distinctnessScore: number;
          edgeScore: number;
          firstPersonBio: string;
          personaPackId: Id<"personaPacks">;
          protoPersonaId: Id<"protoPersonas">;
          studyId: Id<"studies">;
          tensionSeed: string;
        }>;
      },
      any
    >;
  };
  reportExports: {
    getArtifactsForOrg: FunctionReference<
      "query",
      "internal",
      { orgId: string; studyId: Id<"studies"> },
      any
    >;
  };
  runProgress: {
    appendRunMilestone: FunctionReference<
      "mutation",
      "internal",
      {
        actionType: string;
        rationaleShort: string;
        runId: Id<"runs">;
        screenshotKey?: string;
        stepIndex: number;
        title: string;
        url: string;
      },
      any
    >;
    recordRunHeartbeat: FunctionReference<
      "mutation",
      "internal",
      { runId: Id<"runs">; timestamp: number },
      any
    >;
  };
  runs: {
    settleRunFromCallback: FunctionReference<
      "mutation",
      "internal",
      {
        nextStatus:
          | "success"
          | "hard_fail"
          | "soft_fail"
          | "gave_up"
          | "timeout"
          | "blocked_by_guardrail"
          | "infra_error";
        patch?: {
          artifactManifestKey?: string;
          durationSec?: number;
          endedAt?: number;
          errorCode?: string;
          errorMessage?: string;
          finalOutcome?: string;
          finalUrl?: string;
          frustrationCount?: number;
          guardrailCode?: string;
          milestoneKeys?: Array<string>;
          selfReport?: {
            answers?: Record<string, string | number | boolean>;
            confidence?: number;
            confusion?: string;
            hardestPart?: string;
            perceivedSuccess: boolean;
            suggestedChange?: string;
          };
          stepCount?: number;
          summaryKey?: string;
          workerSessionId?: string;
        };
        runId: Id<"runs">;
      },
      any
    >;
    transitionRunState: FunctionReference<
      "mutation",
      "internal",
      {
        nextStatus:
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
        runId: Id<"runs">;
      },
      any
    >;
  };
  settings: {
    getEffectiveSettingsForOrg: FunctionReference<
      "query",
      "internal",
      { orgId: string },
      any
    >;
  };
  studies: {
    finalizeCancelledStudyIfComplete: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    recordGuardrailEvent: FunctionReference<
      "mutation",
      "internal",
      {
        actorId: string;
        createdAt?: number;
        outcome: "pass" | "fail";
        reasons: Array<string>;
        studyId: Id<"studies">;
      },
      any
    >;
    transitionStudyState: FunctionReference<
      "mutation",
      "internal",
      {
        failureReason?: string;
        nextStatus:
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
        studyId: Id<"studies">;
      },
      any
    >;
  };
  studyLifecycleWorkflow: {
    advanceStudyLifecycleAfterInitialCohort: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    buildStudyLifecycleReportDraft: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    completeStudyLifecycleAfterReplay: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    createStudyLifecycleReport: FunctionReference<
      "action",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    finalizePreparedStudyLaunch: FunctionReference<
      "mutation",
      "internal",
      { launchRequestedBy?: string; studyId: Id<"studies"> },
      any
    >;
    getReplayCandidates: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    getStudyLifecycleSnapshot: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    getStudyReportArtifacts: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    getStudyReportRecord: FunctionReference<
      "query",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    handleStudyLifecycleComplete: FunctionReference<
      "mutation",
      "internal",
      {
        context: { studyId: Id<"studies"> };
        result:
          | { kind: "success"; returnValue: any }
          | { error: string; kind: "failed" }
          | { kind: "canceled" };
        workflowId: string;
      },
      any
    >;
    insertStudyLifecycleReport: FunctionReference<
      "mutation",
      "internal",
      {
        htmlReportStorageId: Id<"_storage">;
        jsonReportStorageId: Id<"_storage">;
        report: {
          createdAt: number;
          headlineMetrics: {
            abandonmentRate: number;
            completionRate: number;
            medianDurationSec: number;
            medianSteps: number;
          };
          htmlReportKey: string;
          issueClusterIds: Array<Id<"issueClusters">>;
          jsonReportKey: string;
          limitations: Array<string>;
          segmentBreakdownKey: string;
          studyId: Id<"studies">;
        };
      },
      any
    >;
    prepareStudyForLaunch: FunctionReference<
      "mutation",
      "internal",
      { launchRequestedBy?: string; studyId: Id<"studies"> },
      any
    >;
    queueReplayRunsForStudy: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    runStudyLifecycle: FunctionReference<"mutation", "internal", any, any>;
    startStudyLifecycleWorkflow: FunctionReference<
      "mutation",
      "internal",
      { launchRequestedBy?: string; studyId: Id<"studies"> },
      any
    >;
  };
  userManagement: {
    getStoredRoleForEmail: FunctionReference<
      "query",
      "internal",
      { email: string },
      any
    >;
    setUserRole: FunctionReference<
      "mutation",
      "internal",
      { email: string; role: "researcher" | "reviewer" | "admin" },
      any
    >;
  };
  waveDispatch: {
    dispatchQueuedRunsForStudy: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    dispatchStudyWave: FunctionReference<
      "mutation",
      "internal",
      { studyId: Id<"studies"> },
      any
    >;
    executeRun: FunctionReference<
      "action",
      "internal",
      { runId: Id<"runs"> },
      any
    >;
    getRunDispatchPayload: FunctionReference<
      "query",
      "internal",
      { runId: Id<"runs"> },
      any
    >;
    handleRunDispatchComplete: FunctionReference<
      "mutation",
      "internal",
      {
        context: { runId: Id<"runs">; studyId: Id<"studies"> };
        result:
          | { kind: "success"; returnValue: any }
          | { error: string; kind: "failed" }
          | { kind: "canceled" };
        workId: string;
      },
      any
    >;
  };
};

export declare const components: {
  workflow: {
    event: {
      create: FunctionReference<
        "mutation",
        "internal",
        { name: string; workflowId: string },
        string
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          eventId?: string;
          name?: string;
          result:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId?: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        string
      >;
    };
    journal: {
      load: FunctionReference<
        "query",
        "internal",
        { shortCircuit?: boolean; workflowId: string },
        {
          blocked?: boolean;
          journalEntries: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  inProgress: boolean;
                  kind: "sleep";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          ok: boolean;
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      startSteps: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          steps: Array<{
            retry?:
              | boolean
              | { base: number; initialBackoffMs: number; maxAttempts: number };
            schedulerOptions?: { runAt?: number } | { runAfter?: number };
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  inProgress: boolean;
                  kind: "sleep";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                };
          }>;
          workflowId: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        Array<{
          _creationTime: number;
          _id: string;
          step:
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                functionType: "query" | "mutation" | "action";
                handle: string;
                inProgress: boolean;
                kind?: "function";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workId?: string;
              }
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                handle: string;
                inProgress: boolean;
                kind: "workflow";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workflowId?: string;
              }
            | {
                args: { eventId?: string };
                argsSize: number;
                completedAt?: number;
                eventId?: string;
                inProgress: boolean;
                kind: "event";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
              }
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                inProgress: boolean;
                kind: "sleep";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workId?: string;
              };
          stepNumber: number;
          workflowId: string;
        }>
      >;
    };
    workflow: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { force?: boolean; workflowId: string },
        boolean
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          runResult:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId: string;
        },
        null
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          maxParallelism?: number;
          onComplete?: { context?: any; fnHandle: string };
          startAsync?: boolean;
          workflowArgs: any;
          workflowHandle: string;
          workflowName: string;
        },
        string
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          inProgress: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  inProgress: boolean;
                  kind: "sleep";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listByName: FunctionReference<
        "query",
        "internal",
        {
          name: string;
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listSteps: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          workflowId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            completedAt?: number;
            eventId?: string;
            kind: "function" | "workflow" | "event" | "sleep";
            name: string;
            nestedWorkflowId?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt: number;
            stepId: string;
            stepNumber: number;
            workId?: string;
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      restart: FunctionReference<
        "mutation",
        "internal",
        { from?: number | string; startAsync?: boolean; workflowId: string },
        null
      >;
    };
  };
  browserPool: {
    config: {
      update: FunctionReference<
        "mutation",
        "internal",
        {
          logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          maxParallelism?: number;
        },
        any
      >;
    };
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        {
          before?: number;
          limit?: number;
          logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
          };
          fnArgs: any;
          fnHandle: string;
          fnName: string;
          fnType: "action" | "mutation" | "query";
          onComplete?: { context?: any; fnHandle: string };
          retryBehavior?: {
            base: number;
            initialBackoffMs: number;
            maxAttempts: number;
          };
          runAt: number;
        },
        string
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
          };
          items: Array<{
            fnArgs: any;
            fnHandle: string;
            fnName: string;
            fnType: "action" | "mutation" | "query";
            onComplete?: { context?: any; fnHandle: string };
            retryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            runAt: number;
          }>;
        },
        Array<string>
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        | { previousAttempts: number; state: "pending" }
        | { previousAttempts: number; state: "running" }
        | { state: "finished" }
      >;
      statusBatch: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<
          | { previousAttempts: number; state: "pending" }
          | { previousAttempts: number; state: "running" }
          | { state: "finished" }
        >
      >;
    };
  };
};
