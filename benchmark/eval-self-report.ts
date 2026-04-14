/**
 * Evo benchmark: post-task self-report prompt quality.
 *
 * Evaluates buildSelfReportPrompt + SELF_REPORT_SYSTEM_PROMPT from the target
 * file against a fixed set of synthetic browser-run scenarios. Each task pairs
 * a (taskSpec + personaVariant) with a (RunExecutionResult) and a set of
 * expectations.
 *
 * The prompt is called via the AI package (category=summarization, matching
 * production), the response is validated against the production SelfReportSchema,
 * and a composite quality score is computed.
 *
 * Scoring dimensions:
 *   - Validity (gate): must parse as JSON and pass SelfReportSchema
 *   - Question coverage (25%): every postTaskQuestion answered with the exact key
 *   - Outcome alignment (20%): perceivedSuccess matches result.finalOutcome
 *   - Confidence calibration (15%): confidence band matches outcome severity
 *   - Persona authenticity (20%): first-person voice + grounded in persona traits
 *   - Failure grounding (20%): for non-SUCCESS, hardestPart/confusion references failure
 *
 * Metric: mean per-task score (higher is better).
 *
 * Usage:
 *   EVO_TRACES_DIR=/tmp/traces bun run benchmark/eval-self-report.ts 2>/tmp/stderr.log
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { generateWithModel } from "../packages/ai/src/index";

// Dynamic import of the prompt from {target} (worktree copy) or fallback to local.
const TARGET_PATH = process.env.EVO_TARGET
  ? resolve(process.env.EVO_TARGET)
  : resolve(import.meta.dir, "../apps/browser-executor/src/selfReportPrompt.ts");
const promptModule = (await import(TARGET_PATH)) as typeof import("../apps/browser-executor/src/selfReportPrompt");

// ---------------------------------------------------------------------------
// Inline instrumentation (no SDK dependency)
// ---------------------------------------------------------------------------

const TRACES_DIR = process.env.EVO_TRACES_DIR || null;
const EXPERIMENT_ID = process.env.EVO_EXPERIMENT_ID || "unknown";
const SCORES: Record<string, number> = {};
const STARTED_AT = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");

if (TRACES_DIR) mkdirSync(TRACES_DIR, { recursive: true });

function logTask(
  taskId: string,
  score: number,
  extra: Record<string, unknown> = {},
) {
  SCORES[taskId] = score;
  if (!TRACES_DIR) return;
  const trace: Record<string, unknown> = {
    experiment_id: EXPERIMENT_ID,
    task_id: taskId,
    status: score >= 0.5 ? "passed" : "failed",
    score,
    ended_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
  };
  Object.assign(trace, extra);
  writeFileSync(
    join(TRACES_DIR, `task_${taskId}.json`),
    JSON.stringify(trace, null, 2),
    "utf-8",
  );
}

function writeResult(score?: number) {
  const ids = Object.keys(SCORES);
  const finalScore =
    score ??
    (ids.length === 0
      ? 0.0
      : ids.reduce((a, id) => a + SCORES[id]!, 0) / ids.length);
  const result = {
    score: Math.round(finalScore * 10000) / 10000,
    tasks: { ...SCORES },
    started_at: STARTED_AT,
    ended_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Production validation schema (mirrors packages/shared SelfReportSchema)
// ---------------------------------------------------------------------------

const selfReportAnswerSchema = z.union([z.string(), z.number(), z.boolean()]);

const selfReportSchema = z.object({
  perceivedSuccess: z.boolean(),
  hardestPart: z.string().optional(),
  confusion: z.string().optional(),
  confidence: z.number().optional(),
  suggestedChange: z.string().optional(),
  answers: z.record(selfReportAnswerSchema).optional(),
});

type ParsedSelfReport = z.infer<typeof selfReportSchema>;

// ---------------------------------------------------------------------------
// Evaluation tasks
// ---------------------------------------------------------------------------

type EvalTask = {
  id: string;
  description: string;
  request: import("../apps/browser-executor/src/selfReportPrompt").SelfReportPromptRequest;
  result: import("../apps/browser-executor/src/selfReportPrompt").SelfReportPromptResult;
  expected: {
    perceivedSuccess: boolean;
    confidenceBand: [number, number]; // inclusive range
    failureMustReference?: string[]; // tokens hardestPart/confusion should mention
    personaTokens: string[]; // tokens that signal authentic persona grounding
  };
};

const STANDARD_QUESTIONS = [
  "Do you think you completed the task?",
  "What was the hardest part?",
  "How confident are you in the result?",
  "What would you change about this experience?",
];

const EVAL_TASKS: EvalTask[] = [
  // --- Clean success ------------------------------------------------------
  {
    id: "success_tech_savvy",
    description: "Tech-savvy persona completes checkout cleanly",
    request: {
      taskSpec: {
        scenario: "Buy a wireless mouse",
        goal: "Complete the checkout flow on shop.example.com",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a software engineer who shops online almost daily and expects keyboard shortcuts and instant page loads.",
        behaviorRules: [
          "Use keyboard shortcuts whenever possible",
          "Skim hero copy and dive into product specs",
          "Trust well-known checkout flows without re-reading",
        ],
        tensionSeed:
          "I am efficient, but I get annoyed when sites force me through marketing interstitials before I can pay.",
      },
    },
    result: {
      finalOutcome: "SUCCESS",
      stepCount: 6,
      durationSec: 22.4,
      frustrationCount: 0,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Product page", url: "https://shop.example.com/product/mouse-x1" },
        { stepIndex: 2, actionType: "click", title: "Add to cart", url: "https://shop.example.com/product/mouse-x1" },
        { stepIndex: 4, actionType: "click", title: "Checkout", url: "https://shop.example.com/cart" },
        { stepIndex: 5, actionType: "click", title: "Place order", url: "https://shop.example.com/checkout/pay" },
      ],
    },
    expected: {
      perceivedSuccess: true,
      confidenceBand: [0.7, 1.0],
      personaTokens: ["i", "my"],
    },
  },

  // --- Success with friction ---------------------------------------------
  {
    id: "success_with_friction",
    description: "Cautious shopper finishes but hits address validation issues",
    request: {
      taskSpec: {
        scenario: "Buy a birthday gift",
        goal: "Complete checkout including shipping address",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a cautious shopper who double-checks every step. I worry about making mistakes during checkout, especially with addresses.",
        behaviorRules: [
          "Re-read every form field before submitting",
          "Use guest checkout when possible",
          "Verify the shipping address carefully",
        ],
        tensionSeed:
          "I want to finish quickly, but I am terrified of the package being delivered to the wrong place.",
      },
    },
    result: {
      finalOutcome: "SUCCESS",
      stepCount: 12,
      durationSec: 95.1,
      frustrationCount: 2,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Cart", url: "https://shop.example.com/cart" },
        { stepIndex: 3, actionType: "type", title: "Shipping address", url: "https://shop.example.com/checkout/shipping" },
        { stepIndex: 6, actionType: "type", title: "Re-enter shipping address", url: "https://shop.example.com/checkout/shipping" },
        { stepIndex: 9, actionType: "click", title: "Confirm payment", url: "https://shop.example.com/checkout/pay" },
        { stepIndex: 11, actionType: "navigate", title: "Order confirmation", url: "https://shop.example.com/checkout/done" },
      ],
    },
    expected: {
      perceivedSuccess: true,
      confidenceBand: [0.4, 0.8],
      personaTokens: ["address", "shipping"],
    },
  },

  // --- Abandoned ----------------------------------------------------------
  {
    id: "abandoned_long_kyc",
    description: "Persona gives up on tedious KYC verification",
    request: {
      taskSpec: {
        scenario: "Open a bank account",
        goal: "Complete identity verification and account creation",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a busy parent juggling work and a toddler. I have little patience for forms that ask the same question multiple ways.",
        behaviorRules: [
          "Abandon flows that take more than 5 minutes",
          "Skip optional fields aggressively",
          "Get frustrated by repeated upload failures",
        ],
        tensionSeed:
          "I genuinely need this account opened, but every minute spent on verification is a minute away from my kid.",
      },
    },
    result: {
      finalOutcome: "ABANDONED",
      stepCount: 18,
      durationSec: 240.6,
      frustrationCount: 5,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "KYC start", url: "https://bank.example.com/kyc/start" },
        { stepIndex: 5, actionType: "type", title: "Personal details", url: "https://bank.example.com/kyc/personal" },
        { stepIndex: 10, actionType: "click", title: "Upload ID photo", url: "https://bank.example.com/kyc/identity" },
        { stepIndex: 14, actionType: "click", title: "Re-upload ID photo", url: "https://bank.example.com/kyc/identity" },
        { stepIndex: 17, actionType: "click", title: "Re-upload ID photo", url: "https://bank.example.com/kyc/identity" },
      ],
    },
    expected: {
      perceivedSuccess: false,
      confidenceBand: [0.1, 0.5],
      failureMustReference: ["upload", "id", "photo", "verif"],
      personaTokens: ["i", "frustrat", "patien"],
    },
  },

  // --- Failed: browser error ---------------------------------------------
  {
    id: "failed_browser_error",
    description: "Persona hit a hard browser crash mid-flow",
    request: {
      taskSpec: {
        scenario: "Schedule a doctor visit",
        goal: "Book the next available appointment",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a retired teacher who manages my own healthcare online. I appreciate clear feedback when something goes wrong.",
        behaviorRules: [
          "Read every error message slowly",
          "Try once more before giving up",
          "Trust messages from official-looking pages",
        ],
        tensionSeed:
          "I trust the system to tell me what happened, but I do not know what to do when the page suddenly disappears.",
      },
    },
    result: {
      finalOutcome: "FAILED",
      stepCount: 5,
      durationSec: 41.2,
      frustrationCount: 1,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Appointments", url: "https://clinic.example.com/appointments" },
        { stepIndex: 2, actionType: "click", title: "Pick a date", url: "https://clinic.example.com/appointments/select" },
        { stepIndex: 4, actionType: "click", title: "Confirm slot", url: "https://clinic.example.com/appointments/confirm" },
      ],
    },
    expected: {
      perceivedSuccess: false,
      confidenceBand: [0.0, 0.3],
      failureMustReference: ["error", "fail", "page", "crash", "wrong"],
      personaTokens: ["i", "page"],
    },
  },

  // --- Failed: max steps exceeded ----------------------------------------
  {
    id: "failed_max_steps",
    description: "Run hit the maxSteps limit without finishing",
    request: {
      taskSpec: {
        scenario: "Find a refund policy",
        goal: "Locate the refund policy and confirm the timeframe",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a methodical retail manager who follows links carefully and dislikes when sites bury important policies.",
        behaviorRules: [
          "Search by keyword first",
          "Open the footer for legal pages",
          "Persist for several minutes before giving up",
        ],
        tensionSeed:
          "I am thorough, but the maze of nested help articles wears me down.",
      },
    },
    result: {
      finalOutcome: "FAILED",
      stepCount: 30,
      durationSec: 180.0,
      frustrationCount: 4,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Home", url: "https://shop.example.com/" },
        { stepIndex: 5, actionType: "click", title: "Help", url: "https://shop.example.com/help" },
        { stepIndex: 12, actionType: "click", title: "Contact", url: "https://shop.example.com/help/contact" },
        { stepIndex: 22, actionType: "click", title: "FAQ", url: "https://shop.example.com/help/faq" },
        { stepIndex: 29, actionType: "click", title: "Returns", url: "https://shop.example.com/help/returns" },
      ],
    },
    expected: {
      perceivedSuccess: false,
      confidenceBand: [0.0, 0.4],
      failureMustReference: ["step", "help", "find", "policy", "refund", "navig"],
      personaTokens: ["i", "polic"],
    },
  },

  // --- Failed: guardrail violation ---------------------------------------
  {
    id: "failed_guardrail",
    description: "Run blocked by a guardrail before reaching the goal",
    request: {
      taskSpec: {
        scenario: "Update billing information",
        goal: "Replace the saved card on file",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a privacy-conscious freelancer. I want my finances updated without sharing more data than necessary.",
        behaviorRules: [
          "Never share unrequested personal data",
          "Skip optional marketing checkboxes",
          "Pause if a page asks for an SSN unexpectedly",
        ],
        tensionSeed:
          "I want to update my card quickly, but I am wary of any request that feels like fishing for extra information.",
      },
    },
    result: {
      finalOutcome: "FAILED",
      stepCount: 4,
      durationSec: 18.7,
      frustrationCount: 0,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Billing", url: "https://app.example.com/settings/billing" },
        { stepIndex: 2, actionType: "click", title: "Replace card", url: "https://app.example.com/settings/billing/replace" },
        { stepIndex: 3, actionType: "type", title: "Card details", url: "https://app.example.com/settings/billing/replace" },
      ],
    },
    expected: {
      perceivedSuccess: false,
      confidenceBand: [0.0, 0.3],
      failureMustReference: ["block", "stop", "guardrail", "safety", "prevent"],
      personaTokens: ["i", "card", "billing"],
    },
  },

  // --- Failed: timeout ---------------------------------------------------
  {
    id: "failed_timeout",
    description: "Run timed out on a slow dashboard",
    request: {
      taskSpec: {
        scenario: "Pull a usage report",
        goal: "Download last month's API usage CSV",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am an analyst who lives in dashboards. Slow load times are a personal nemesis of mine.",
        behaviorRules: [
          "Open multiple reports in parallel tabs",
          "Refresh once if a chart never loads",
          "Walk away if a page hangs for over a minute",
        ],
        tensionSeed:
          "I rely on this data, but I lose patience the moment the loading spinner outlasts my coffee sip.",
      },
    },
    result: {
      finalOutcome: "FAILED",
      stepCount: 3,
      durationSec: 300.0,
      frustrationCount: 2,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Dashboard", url: "https://dash.example.com/login" },
        { stepIndex: 1, actionType: "type", title: "Credentials", url: "https://dash.example.com/login" },
        { stepIndex: 2, actionType: "navigate", title: "Usage report", url: "https://dash.example.com/usage" },
      ],
    },
    expected: {
      perceivedSuccess: false,
      confidenceBand: [0.0, 0.3],
      failureMustReference: ["slow", "load", "wait", "timeout", "spinner", "hang", "long"],
      personaTokens: ["i", "patience", "load"],
    },
  },

  // --- Failed: lease unavailable (minimal context) -----------------------
  {
    id: "failed_no_context",
    description: "Lease unavailable failure — almost no run context",
    request: {
      taskSpec: {
        scenario: "Book a hotel",
        goal: "Reserve a room for next weekend",
        postTaskQuestions: STANDARD_QUESTIONS,
      },
      personaVariant: {
        firstPersonBio:
          "I am a frequent traveler who books quickly and expects sites to just work on the first try.",
        behaviorRules: [
          "Compare two or three hotels at most",
          "Trust well-known booking sites by default",
          "Bail when a page does not load",
        ],
        tensionSeed:
          "I value speed, but I do not have time to debug a website that will not even open.",
      },
    },
    result: {
      finalOutcome: "FAILED",
      stepCount: 0,
      durationSec: 0.5,
      frustrationCount: 0,
      milestones: [],
    },
    expected: {
      perceivedSuccess: false,
      confidenceBand: [0.0, 0.4],
      failureMustReference: ["start", "open", "load", "begin", "could"],
      personaTokens: ["i"],
    },
  },

  // --- Single-question coverage edge case --------------------------------
  {
    id: "single_question_success",
    description: "Single-question task spec — tests prompt does not over-answer",
    request: {
      taskSpec: {
        scenario: "Subscribe to the newsletter",
        goal: "Submit the email signup form",
        postTaskQuestions: ["Did the signup feel easy?"],
      },
      personaVariant: {
        firstPersonBio:
          "I am a casual reader who only signs up for newsletters when the form is friction-free.",
        behaviorRules: [
          "Reject signup if confirmation is unclear",
          "Use throwaway emails by default",
          "Move on quickly once the form is done",
        ],
        tensionSeed:
          "I would like to keep up with this brand, but my inbox is already overflowing.",
      },
    },
    result: {
      finalOutcome: "SUCCESS",
      stepCount: 3,
      durationSec: 9.4,
      frustrationCount: 0,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Footer signup", url: "https://media.example.com/" },
        { stepIndex: 1, actionType: "type", title: "Email field", url: "https://media.example.com/" },
        { stepIndex: 2, actionType: "click", title: "Subscribe", url: "https://media.example.com/" },
      ],
    },
    expected: {
      perceivedSuccess: true,
      confidenceBand: [0.6, 1.0],
      personaTokens: ["i", "easy", "sign"],
    },
  },

  // --- Many-question coverage edge case ----------------------------------
  {
    id: "many_questions_success",
    description: "Six post-task questions — coverage and key-fidelity stress test",
    request: {
      taskSpec: {
        scenario: "Switch electricity providers",
        goal: "Complete the switch wizard end-to-end",
        postTaskQuestions: [
          "Do you think you completed the task?",
          "What was the hardest part?",
          "How long did it feel?",
          "Did you trust the new provider?",
          "What would you change about this experience?",
          "Would you recommend this site to a friend?",
        ],
      },
      personaVariant: {
        firstPersonBio:
          "I am a homeowner trying to lower my utility bills. I research providers carefully before switching.",
        behaviorRules: [
          "Read pricing fine print before committing",
          "Check provider trust badges",
          "Pause to compare two offers side by side",
        ],
        tensionSeed:
          "I want a better rate, but I am wary of being locked into a contract I do not fully understand.",
      },
    },
    result: {
      finalOutcome: "SUCCESS",
      stepCount: 14,
      durationSec: 110.4,
      frustrationCount: 1,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Compare offers", url: "https://power.example.com/compare" },
        { stepIndex: 5, actionType: "click", title: "Choose Plan A", url: "https://power.example.com/plans/a" },
        { stepIndex: 9, actionType: "type", title: "Account info", url: "https://power.example.com/switch/details" },
        { stepIndex: 13, actionType: "click", title: "Confirm switch", url: "https://power.example.com/switch/confirm" },
      ],
    },
    expected: {
      perceivedSuccess: true,
      confidenceBand: [0.5, 1.0],
      personaTokens: ["i", "plan", "switch", "provider"],
    },
  },
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function nonEmptyAnswer(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return false;
}

function questionCoverageScore(
  task: EvalTask,
  response: ParsedSelfReport,
): number {
  const questions = task.request.taskSpec.postTaskQuestions;
  if (questions.length === 0) {
    return response.answers === undefined || Object.keys(response.answers).length === 0
      ? 1.0
      : 0.5;
  }
  const answers = response.answers ?? {};
  let answered = 0;
  let extraneous = 0;
  for (const q of questions) {
    if (q in answers && nonEmptyAnswer(answers[q])) {
      answered += 1;
    }
  }
  for (const k of Object.keys(answers)) {
    if (!questions.includes(k)) extraneous += 1;
  }
  const coverage = answered / questions.length;
  const noiseDecay = extraneous === 0 ? 1.0 : Math.max(0.6, 1 - extraneous * 0.1);
  return coverage * noiseDecay;
}

function outcomeAlignmentScore(
  task: EvalTask,
  response: ParsedSelfReport,
): number {
  return response.perceivedSuccess === task.expected.perceivedSuccess ? 1.0 : 0.0;
}

function confidenceCalibrationScore(
  task: EvalTask,
  response: ParsedSelfReport,
): number {
  const [low, high] = task.expected.confidenceBand;
  if (response.confidence === undefined) {
    // Missing confidence is acceptable but suboptimal — small partial credit.
    return 0.3;
  }
  if (response.confidence >= low && response.confidence <= high) {
    return 1.0;
  }
  // Linear falloff: score scales with distance from the band edge, capped at 0.
  const distance = response.confidence < low
    ? low - response.confidence
    : response.confidence - high;
  return Math.max(0, 1 - distance / 0.3);
}

const FIRST_PERSON_TOKENS = ["i ", "i'", "my ", "me ", " i'", " me", " my", " i "];

function hasFirstPersonVoice(text: string): boolean {
  const padded = ` ${text.toLowerCase()} `;
  return FIRST_PERSON_TOKENS.some((token) => padded.includes(token));
}

function personaAuthenticityScore(
  task: EvalTask,
  response: ParsedSelfReport,
): number {
  const sources = [
    response.hardestPart,
    response.confusion,
    response.suggestedChange,
    ...(response.answers
      ? Object.values(response.answers).filter((v): v is string => typeof v === "string")
      : []),
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  if (sources.length === 0) return 0.0;

  const combined = sources.join(" ").toLowerCase();
  const firstPersonHits = sources.filter(hasFirstPersonVoice).length;
  const firstPersonRatio = sources.length === 0 ? 0 : firstPersonHits / sources.length;

  // Persona token grounding: at least one expected token appears in the combined text.
  const expected = task.expected.personaTokens;
  const tokensHit = expected.filter((t) => combined.includes(t.toLowerCase())).length;
  const tokenRatio = expected.length === 0 ? 1.0 : tokensHit / expected.length;

  return firstPersonRatio * 0.5 + tokenRatio * 0.5;
}

function failureGroundingScore(
  task: EvalTask,
  response: ParsedSelfReport,
): number {
  if (task.expected.perceivedSuccess) {
    // Not applicable for success — full credit so it doesn't penalise.
    return 1.0;
  }
  const expectedTokens = task.expected.failureMustReference ?? [];
  if (expectedTokens.length === 0) return 1.0;

  const text = [response.hardestPart, response.confusion]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ")
    .toLowerCase();
  if (!text) return 0.0;

  const hits = expectedTokens.filter((t) => text.includes(t.toLowerCase())).length;
  // At least one hit gives a strong signal; more hits scale linearly to full credit.
  if (hits === 0) return 0.1;
  return Math.min(1.0, 0.4 + (hits / expectedTokens.length) * 0.6);
}

function scoreResponse(task: EvalTask, response: ParsedSelfReport) {
  const coverage = questionCoverageScore(task, response);
  const outcome = outcomeAlignmentScore(task, response);
  const confidence = confidenceCalibrationScore(task, response);
  const authenticity = personaAuthenticityScore(task, response);
  const grounding = failureGroundingScore(task, response);

  const weighted =
    coverage * 0.25 +
    outcome * 0.20 +
    confidence * 0.15 +
    authenticity * 0.20 +
    grounding * 0.20;

  const score = Math.round(weighted * 10000) / 10000;

  return {
    score,
    details: {
      coverage: Math.round(coverage * 1000) / 1000,
      outcome: Math.round(outcome * 1000) / 1000,
      confidence: Math.round(confidence * 1000) / 1000,
      authenticity: Math.round(authenticity * 1000) / 1000,
      grounding: Math.round(grounding * 1000) / 1000,
      perceivedSuccess: response.perceivedSuccess,
      reportedConfidence: response.confidence,
      answerKeys: response.answers ? Object.keys(response.answers) : [],
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
}

async function main() {
  const modelOverride = process.env.BOTCHESTRA_MODEL_SUMMARIZATION;
  const taskSubset = process.env.EVO_TASK_IDS
    ? process.env.EVO_TASK_IDS.split(",").map((s) => s.trim())
    : null;
  const tasks = taskSubset
    ? EVAL_TASKS.filter((t) => taskSubset.includes(t.id))
    : EVAL_TASKS;

  console.error(
    `[eval] self-report benchmark: ${tasks.length} tasks${DRY_RUN ? " (dry-run)" : ""}`,
  );
  if (modelOverride) console.error(`[eval] Model override: ${modelOverride}`);

  for (const task of tasks) {
    console.error(`[eval] Task ${task.id}: ${task.description}`);
    const prompt = promptModule.buildSelfReportPrompt(task.request, task.result);

    if (DRY_RUN) {
      const mock: ParsedSelfReport = {
        perceivedSuccess: task.expected.perceivedSuccess,
        hardestPart: `I struggled with ${task.expected.failureMustReference?.[0] ?? "the flow"} during the run.`,
        confusion: `I was unsure about ${task.expected.failureMustReference?.[1] ?? "the next step"}.`,
        confidence: (task.expected.confidenceBand[0] + task.expected.confidenceBand[1]) / 2,
        suggestedChange: "I would like clearer feedback at every step.",
        answers: task.request.taskSpec.postTaskQuestions.reduce<Record<string, string>>(
          (acc, q) => {
            acc[q] = "Mock answer.";
            return acc;
          },
          {},
        ),
      };
      const { score, details } = scoreResponse(task, mock);
      console.error(`[eval]   ${task.id}: score=${score} (dry-run)`);
      logTask(task.id, score, { summary: "dry-run", ...details });
      continue;
    }

    try {
      const result = await generateWithModel("summarization", {
        system: promptModule.SELF_REPORT_SYSTEM_PROMPT,
        prompt,
        modelOverride,
      });

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(stripFence(result.text));
      } catch {
        console.error(`[eval]   ${task.id}: FAILED - invalid JSON`);
        logTask(task.id, 0, {
          summary: "invalid JSON response",
          failureReason: "JSON parse error",
          rawResponse: result.text.slice(0, 500),
        });
        continue;
      }

      const parsed = selfReportSchema.safeParse(parsedJson);
      if (!parsed.success) {
        const reasons = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        console.error(`[eval]   ${task.id}: FAILED - schema validation: ${reasons.join("; ")}`);
        logTask(task.id, 0, {
          summary: `schema validation failed: ${reasons.join("; ")}`,
          failureReason: reasons.join("; "),
        });
        continue;
      }

      const { score, details } = scoreResponse(task, parsed.data);
      console.error(
        `[eval]   ${task.id}: score=${score} perceivedSuccess=${parsed.data.perceivedSuccess} confidence=${parsed.data.confidence ?? "n/a"}`,
      );

      logTask(task.id, score, {
        summary: `scored ${score}`,
        ...details,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[eval]   ${task.id}: FAILED - ${message}`);
      logTask(task.id, 0, {
        summary: `infrastructure failure: ${message}`,
        failureReason: message,
      });
    }
  }

  writeResult();
}

main().catch((error) => {
  console.error("[eval] Fatal:", error);
  process.exit(1);
});
