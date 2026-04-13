/**
 * Gate: validates that the summarization prompt module exports the expected
 * interface and that the prompt produces parseable output for each run status.
 *
 * This gate runs WITHOUT LLM calls — it only checks structural correctness.
 * Exit 0 = pass, exit 1 = fail.
 */

import { resolve } from "node:path";
import { z } from "zod";

const TARGET_PATH = process.env.EVO_TARGET
  ? resolve(process.env.EVO_TARGET)
  : resolve(import.meta.dir, "../convex/analysis/summarizationPrompt.ts");

const promptModule = (await import(TARGET_PATH)) as typeof import("../convex/analysis/summarizationPrompt");

const aiRunSummarySchema = z.object({
  outcomeClassification: z.enum(["success", "failure", "abandoned"]),
  failureSummary: z.string().nullable(),
  failurePoint: z.string().nullable(),
  lastSuccessfulState: z.string().nullable(),
  blockingText: z.string().nullable(),
  frustrationMarkers: z.array(z.string()),
  selfReportedConfidence: z.number().nullable(),
  representativeQuote: z.string().nullable(),
});

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.error(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL: ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

console.error("[gate] Summarization prompt structural checks");

// Check exports exist
check("buildSummarizationPrompt is a function", () => {
  if (typeof promptModule.buildSummarizationPrompt !== "function") {
    throw new Error("buildSummarizationPrompt is not exported as a function");
  }
});

check("SUMMARIZATION_SYSTEM_PROMPT is a string", () => {
  if (typeof promptModule.SUMMARIZATION_SYSTEM_PROMPT !== "string") {
    throw new Error("SUMMARIZATION_SYSTEM_PROMPT is not exported as a string");
  }
  if (promptModule.SUMMARIZATION_SYSTEM_PROMPT.length < 10) {
    throw new Error("SUMMARIZATION_SYSTEM_PROMPT is too short");
  }
});

// Check prompt generation for each run status
const RUN_STATUSES = [
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
] as const;

for (const status of RUN_STATUSES) {
  check(`generates non-empty prompt for status=${status}`, () => {
    const prompt = promptModule.buildSummarizationPrompt({
      status,
      finalOutcome: status === "success" ? "completed" : "failed",
      finalUrl: "https://example.com/page",
      errorCode: status === "hard_fail" ? "TEST_ERROR" : null,
      stepCount: 5,
      durationSec: 30,
      frustrationCount: status === "success" ? 0 : 2,
      selfReport: {
        confidence: 0.5,
        hardestPart: "Test hard part",
        confusion: null,
        suggestedChange: null,
        answers: {},
      },
      milestones: [
        {
          stepIndex: 0,
          actionType: "navigate",
          title: "Test page",
          url: "https://example.com/page",
          note: null,
        },
      ],
    });
    if (typeof prompt !== "string" || prompt.length < 50) {
      throw new Error(`Prompt too short (${prompt?.length ?? 0} chars)`);
    }
  });
}

// Check prompt with minimal data (null everything)
check("handles minimal data without throwing", () => {
  const prompt = promptModule.buildSummarizationPrompt({
    status: "hard_fail",
    finalOutcome: null,
    finalUrl: null,
    errorCode: null,
    stepCount: null,
    durationSec: null,
    frustrationCount: 0,
    selfReport: null,
    milestones: [],
  });
  if (typeof prompt !== "string" || prompt.length < 50) {
    throw new Error(`Prompt too short for minimal data (${prompt?.length ?? 0} chars)`);
  }
});

// Check that the prompt mentions the JSON schema keys
check("prompt references expected output keys", () => {
  const prompt = promptModule.buildSummarizationPrompt({
    status: "hard_fail",
    finalOutcome: "failed",
    finalUrl: "https://example.com",
    errorCode: "TEST",
    stepCount: 1,
    durationSec: 10,
    frustrationCount: 1,
    selfReport: null,
    milestones: [],
  });
  const requiredKeys = [
    "outcomeClassification",
    "failureSummary",
    "frustrationMarkers",
    "representativeQuote",
  ];
  for (const key of requiredKeys) {
    if (!prompt.includes(key)) {
      throw new Error(`Prompt missing reference to output key "${key}"`);
    }
  }
});

console.error(`\n[gate] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
