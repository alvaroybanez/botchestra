import { z } from "zod";

// -- Enums ------------------------------------------------------------------

const AllowedActionSchema = z.enum([
  "goto",
  "click",
  "type",
  "select",
  "scroll",
  "wait",
  "back",
  "finish",
  "abort",
]);

const ForbiddenActionSchema = z.enum([
  "external_download",
  "payment_submission",
  "email_send",
  "sms_send",
  "captcha_bypass",
  "account_creation_without_fixture",
  "cross_domain_escape",
  "file_upload_unless_allowed",
]);

// -- PersonaVariant ----------------------------------------------------------

const PersonaVariantSchema = z.object({
  id: z.string(),
  personaPackId: z.string(),
  protoPersonaId: z.string(),
  axisValues: z.record(z.string(), z.number()),
  edgeScore: z.number(),
  tensionSeed: z.string(),
  firstPersonBio: z.string(),
  behaviorRules: z.array(z.string()),
  coherenceScore: z.number(),
  distinctnessScore: z.number(),
  accepted: z.boolean(),
});

// -- TaskSpec ----------------------------------------------------------------

const TaskSpecSchema = z.object({
  scenario: z.string(),
  goal: z.string(),
  startingUrl: z.string(),
  allowedDomains: z.array(z.string()),
  allowedActions: z.array(AllowedActionSchema),
  forbiddenActions: z.array(ForbiddenActionSchema),
  successCriteria: z.array(z.string()),
  stopConditions: z.array(z.string()),
  postTaskQuestions: z.array(z.string()),
  maxSteps: z.number().int().positive(),
  maxDurationSec: z.number().positive(),
  environmentLabel: z.string(),
  locale: z.string(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  credentialsRef: z.string().optional(),
  randomSeed: z.string().optional(),
});

// -- ExecuteRunRequest -------------------------------------------------------

export const ExecuteRunRequestSchema = z.object({
  runId: z.string(),
  studyId: z.string(),
  personaVariant: PersonaVariantSchema,
  taskSpec: TaskSpecSchema,
  callbackToken: z.string(),
  callbackBaseUrl: z.string(),
});

export type ExecuteRunRequest = z.infer<typeof ExecuteRunRequestSchema>;

// -- RunProgressUpdate -------------------------------------------------------

const HeartbeatSchema = z.object({
  runId: z.string(),
  eventType: z.literal("heartbeat"),
  payload: z.object({
    timestamp: z.number(),
  }),
});

const MilestoneSchema = z.object({
  runId: z.string(),
  eventType: z.literal("milestone"),
  payload: z.object({
    stepIndex: z.number().int().nonnegative(),
    url: z.string(),
    title: z.string(),
    actionType: z.string(),
    rationaleShort: z.string(),
    screenshotKey: z.string().optional(),
  }),
});

export const SelfReportAnswerSchema = z.union([z.string(), z.number(), z.boolean()]);

export const SelfReportSchema = z.object({
  perceivedSuccess: z.boolean(),
  hardestPart: z.string().optional(),
  confusion: z.string().optional(),
  confidence: z.number().optional(),
  suggestedChange: z.string().optional(),
  answers: z.record(SelfReportAnswerSchema).optional(),
});

const CompletionSchema = z.object({
  runId: z.string(),
  eventType: z.literal("completion"),
  payload: z.object({
    finalOutcome: z.string(),
    stepCount: z.number().int().nonnegative(),
    durationSec: z.number().nonnegative(),
    frustrationCount: z.number().int().nonnegative(),
    selfReport: SelfReportSchema.optional(),
    artifactManifestKey: z.string().optional(),
  }),
});

const FailureSchema = z.object({
  runId: z.string(),
  eventType: z.literal("failure"),
  payload: z.object({
    errorCode: z.string(),
    message: z.string().optional(),
    selfReport: SelfReportSchema.optional(),
  }),
});

export const RunProgressUpdateSchema = z.discriminatedUnion("eventType", [
  HeartbeatSchema,
  MilestoneSchema,
  CompletionSchema,
  FailureSchema,
]);

export type RunProgressUpdate = z.infer<typeof RunProgressUpdateSchema>;
export type SelfReport = z.infer<typeof SelfReportSchema>;
export type SelfReportAnswer = z.infer<typeof SelfReportAnswerSchema>;
