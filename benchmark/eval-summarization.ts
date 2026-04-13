/**
 * Evo benchmark: run summarization prompt quality.
 *
 * Evaluates buildSummarizationPrompt + SUMMARIZATION_SYSTEM_PROMPT from the
 * target file against a fixed set of synthetic usability run scenarios. Each
 * task is a RunSummaryPromptContext with known ground-truth expectations.
 *
 * The prompt is called via the AI package, the response is validated using
 * the production Zod schema (aiRunSummarySchema), and a composite quality
 * score is computed.
 *
 * Scoring dimensions:
 *   - Validity (gate): must parse as JSON and pass Zod schema
 *   - Outcome accuracy (30%): outcomeClassification matches expected
 *   - Failure summary quality (20%): conciseness + specificity
 *   - Evidence grounding (20%): representativeQuote references self-report
 *   - Frustration capture (15%): frustrationMarkers populated when expected
 *   - Confidence calibration (15%): selfReportedConfidence close to self-report
 *
 * Metric: mean per-task score (higher is better).
 *
 * Usage:
 *   EVO_TRACES_DIR=/tmp/traces bun run benchmark/eval-summarization.ts 2>/tmp/stderr.log
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { generateWithModel } from "../packages/ai/src/index";

// Dynamic import of the prompt from {target} (worktree copy) or fallback
const TARGET_PATH = process.env.EVO_TARGET
  ? resolve(process.env.EVO_TARGET)
  : resolve(import.meta.dir, "../convex/analysis/summarizationPrompt.ts");
const promptModule = (await import(TARGET_PATH)) as typeof import("../convex/analysis/summarizationPrompt");

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
// Production validation schema (matches analysisPipeline.ts aiRunSummarySchema)
// ---------------------------------------------------------------------------

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

type AiRunSummary = z.infer<typeof aiRunSummarySchema>;

// ---------------------------------------------------------------------------
// Evaluation tasks — fixed synthetic run contexts covering diverse scenarios
// ---------------------------------------------------------------------------

type EvalTask = {
  id: string;
  description: string;
  run: import("../convex/analysis/summarizationPrompt").RunSummaryPromptContext;
  expected: {
    outcomeClassification: "success" | "failure" | "abandoned";
    hasFrustrationMarkers: boolean;
    hasSelfReportedConfidence: boolean;
    hasBlockingText: boolean;
    quoteSourceField?: string; // which self-report field contains the ideal quote
  };
};

const EVAL_TASKS: EvalTask[] = [
  // --- Success scenarios ---
  {
    id: "clean_success",
    description: "Straightforward successful checkout with no issues",
    run: {
      status: "success",
      finalOutcome: "completed",
      finalUrl: "https://shop.example.com/order-confirmation",
      errorCode: null,
      stepCount: 8,
      durationSec: 45,
      frustrationCount: 0,
      selfReport: {
        confidence: 0.9,
        hardestPart: null,
        confusion: null,
        suggestedChange: "The checkout was smooth overall.",
        answers: { overallRating: 5 },
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Homepage", url: "https://shop.example.com/", note: null },
        { stepIndex: 3, actionType: "click", title: "Add to cart", url: "https://shop.example.com/product/42", note: null },
        { stepIndex: 5, actionType: "click", title: "Proceed to checkout", url: "https://shop.example.com/cart", note: null },
        { stepIndex: 7, actionType: "click", title: "Place order", url: "https://shop.example.com/checkout/payment", note: null },
      ],
    },
    expected: {
      outcomeClassification: "success",
      hasFrustrationMarkers: false,
      hasSelfReportedConfidence: true,
      hasBlockingText: false,
    },
  },
  {
    id: "success_with_friction",
    description: "Successful but with confusion on the address form",
    run: {
      status: "success",
      finalOutcome: "completed",
      finalUrl: "https://shop.example.com/order-confirmation",
      errorCode: null,
      stepCount: 14,
      durationSec: 120,
      frustrationCount: 2,
      selfReport: {
        confidence: 0.6,
        hardestPart: "The address validation kept rejecting my apartment format.",
        confusion: "I didn't understand the difference between billing and shipping address.",
        suggestedChange: "Let me copy billing to shipping with one click.",
        answers: {},
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Homepage", url: "https://shop.example.com/", note: null },
        { stepIndex: 4, actionType: "click", title: "Add to cart", url: "https://shop.example.com/product/77", note: null },
        { stepIndex: 6, actionType: "click", title: "Proceed to checkout", url: "https://shop.example.com/cart", note: null },
        { stepIndex: 8, actionType: "type", title: "Enter shipping address", url: "https://shop.example.com/checkout/shipping", note: "Re-entered address 3 times" },
        { stepIndex: 11, actionType: "type", title: "Enter billing address", url: "https://shop.example.com/checkout/billing", note: "Confusion between billing and shipping" },
        { stepIndex: 13, actionType: "click", title: "Place order", url: "https://shop.example.com/checkout/payment", note: null },
      ],
    },
    expected: {
      outcomeClassification: "success",
      hasFrustrationMarkers: true,
      hasSelfReportedConfidence: true,
      hasBlockingText: false,
      quoteSourceField: "hardestPart",
    },
  },

  // --- Hard failure scenarios ---
  {
    id: "hard_fail_payment",
    description: "Payment gateway crash with error code",
    run: {
      status: "hard_fail",
      finalOutcome: "payment_gateway_error",
      finalUrl: "https://shop.example.com/checkout/payment",
      errorCode: "PAYMENT_TIMEOUT_503",
      stepCount: 10,
      durationSec: 65,
      frustrationCount: 3,
      selfReport: {
        confidence: 0.2,
        hardestPart: "The payment page just showed a spinning wheel and then an error.",
        confusion: "I entered my card details twice but the page froze both times.",
        suggestedChange: "Show a clear error message instead of a generic 'something went wrong'.",
        answers: {},
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Homepage", url: "https://shop.example.com/", note: null },
        { stepIndex: 3, actionType: "click", title: "Add to cart", url: "https://shop.example.com/product/15", note: null },
        { stepIndex: 5, actionType: "click", title: "Proceed to checkout", url: "https://shop.example.com/cart", note: null },
        { stepIndex: 7, actionType: "type", title: "Enter payment details", url: "https://shop.example.com/checkout/payment", note: "First attempt timed out" },
        { stepIndex: 9, actionType: "type", title: "Re-enter payment details", url: "https://shop.example.com/checkout/payment", note: "Second attempt also failed" },
      ],
    },
    expected: {
      outcomeClassification: "failure",
      hasFrustrationMarkers: true,
      hasSelfReportedConfidence: true,
      hasBlockingText: true,
      quoteSourceField: "confusion",
    },
  },
  {
    id: "hard_fail_navigation",
    description: "Page not found during multi-step form wizard",
    run: {
      status: "hard_fail",
      finalOutcome: "page_not_found",
      finalUrl: "https://portal.example.com/onboarding/step-3",
      errorCode: "HTTP_404",
      stepCount: 5,
      durationSec: 30,
      frustrationCount: 1,
      selfReport: {
        confidence: 0.1,
        hardestPart: "Step 3 of the wizard just showed a blank page.",
        confusion: null,
        suggestedChange: null,
        answers: {},
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Onboarding start", url: "https://portal.example.com/onboarding/step-1", note: null },
        { stepIndex: 2, actionType: "click", title: "Next step", url: "https://portal.example.com/onboarding/step-2", note: null },
        { stepIndex: 4, actionType: "click", title: "Next step", url: "https://portal.example.com/onboarding/step-3", note: "Blank page rendered" },
      ],
    },
    expected: {
      outcomeClassification: "failure",
      hasFrustrationMarkers: true,
      hasSelfReportedConfidence: true,
      hasBlockingText: true,
      quoteSourceField: "hardestPart",
    },
  },

  // --- Soft failure / gave up ---
  {
    id: "gave_up_complex_form",
    description: "User gave up on a long KYC form after repeated validation errors",
    run: {
      status: "gave_up",
      finalOutcome: "abandoned_kyc",
      finalUrl: "https://bank.example.com/kyc/identity-verification",
      errorCode: null,
      stepCount: 18,
      durationSec: 240,
      frustrationCount: 5,
      selfReport: {
        confidence: 0.15,
        hardestPart: "The identity verification kept asking me to re-upload my ID photo.",
        confusion: "I couldn't tell if my photo was rejected because of file size or image quality.",
        suggestedChange: "Show specific reasons why the upload was rejected.",
        answers: { wouldRetry: false },
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "KYC start", url: "https://bank.example.com/kyc/start", note: null },
        { stepIndex: 4, actionType: "type", title: "Personal details", url: "https://bank.example.com/kyc/personal", note: null },
        { stepIndex: 8, actionType: "click", title: "Upload ID photo", url: "https://bank.example.com/kyc/identity-verification", note: "First upload rejected" },
        { stepIndex: 12, actionType: "click", title: "Re-upload ID photo", url: "https://bank.example.com/kyc/identity-verification", note: "Second upload rejected" },
        { stepIndex: 16, actionType: "click", title: "Re-upload ID photo", url: "https://bank.example.com/kyc/identity-verification", note: "Third upload rejected, user gave up" },
      ],
    },
    expected: {
      outcomeClassification: "abandoned",
      hasFrustrationMarkers: true,
      hasSelfReportedConfidence: true,
      hasBlockingText: true,
      quoteSourceField: "confusion",
    },
  },
  {
    id: "soft_fail_accessibility",
    description: "Soft failure due to inaccessible dropdown on government form",
    run: {
      status: "soft_fail",
      finalOutcome: "could_not_complete_form",
      finalUrl: "https://gov.example.com/benefits/apply",
      errorCode: "ELEMENT_NOT_INTERACTABLE",
      stepCount: 7,
      durationSec: 90,
      frustrationCount: 2,
      selfReport: {
        confidence: 0.3,
        hardestPart: "The dropdown for selecting my county would not open when I clicked it.",
        confusion: "I tried clicking the dropdown many times but nothing happened.",
        suggestedChange: "Make the county selector work with keyboard navigation.",
        answers: {},
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Benefits application", url: "https://gov.example.com/benefits/apply", note: null },
        { stepIndex: 3, actionType: "type", title: "Personal info", url: "https://gov.example.com/benefits/apply", note: null },
        { stepIndex: 5, actionType: "click", title: "Select county", url: "https://gov.example.com/benefits/apply", note: "Dropdown failed to open" },
        { stepIndex: 6, actionType: "click", title: "Retry county selection", url: "https://gov.example.com/benefits/apply", note: "Still unresponsive" },
      ],
    },
    expected: {
      outcomeClassification: "failure",
      hasFrustrationMarkers: true,
      hasSelfReportedConfidence: true,
      hasBlockingText: true,
      quoteSourceField: "hardestPart",
    },
  },

  // --- Timeout ---
  {
    id: "timeout_slow_load",
    description: "Run timed out waiting for a slow-loading dashboard page",
    run: {
      status: "timeout",
      finalOutcome: "timeout",
      finalUrl: "https://dashboard.example.com/analytics",
      errorCode: null,
      stepCount: 3,
      durationSec: 300,
      frustrationCount: 1,
      selfReport: null,
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Dashboard login", url: "https://dashboard.example.com/login", note: null },
        { stepIndex: 1, actionType: "type", title: "Enter credentials", url: "https://dashboard.example.com/login", note: null },
        { stepIndex: 2, actionType: "navigate", title: "Analytics page", url: "https://dashboard.example.com/analytics", note: "Page loading spinner never resolved" },
      ],
    },
    expected: {
      outcomeClassification: "abandoned",
      hasFrustrationMarkers: true,
      hasSelfReportedConfidence: false,
      hasBlockingText: false,
    },
  },

  // --- Guardrail blocked ---
  {
    id: "guardrail_blocked",
    description: "Guardrail stopped the run when agent tried to enter PII in an external field",
    run: {
      status: "blocked_by_guardrail",
      finalOutcome: "guardrail_block",
      finalUrl: "https://app.example.com/settings/integrations",
      errorCode: "GUARDRAIL_PII_DETECTED",
      stepCount: 6,
      durationSec: 40,
      frustrationCount: 0,
      selfReport: {
        confidence: null,
        hardestPart: null,
        confusion: null,
        suggestedChange: null,
        answers: {},
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "App settings", url: "https://app.example.com/settings", note: null },
        { stepIndex: 2, actionType: "click", title: "Integrations tab", url: "https://app.example.com/settings/integrations", note: null },
        { stepIndex: 4, actionType: "type", title: "Configure webhook URL", url: "https://app.example.com/settings/integrations", note: null },
        { stepIndex: 5, actionType: "type", title: "Enter API key", url: "https://app.example.com/settings/integrations", note: "Guardrail blocked PII entry" },
      ],
    },
    expected: {
      outcomeClassification: "failure",
      hasFrustrationMarkers: false,
      hasSelfReportedConfidence: false,
      hasBlockingText: true,
    },
  },

  // --- Minimal data scenario ---
  {
    id: "minimal_data_fail",
    description: "Hard failure with almost no context — tests prompt robustness",
    run: {
      status: "hard_fail",
      finalOutcome: null,
      finalUrl: null,
      errorCode: null,
      stepCount: null,
      durationSec: null,
      frustrationCount: 0,
      selfReport: null,
      milestones: [],
    },
    expected: {
      outcomeClassification: "failure",
      hasFrustrationMarkers: false,
      hasSelfReportedConfidence: false,
      hasBlockingText: false,
    },
  },

  // --- Rich self-report success ---
  {
    id: "rich_selfreport_success",
    description: "Successful run with verbose self-report to test quote extraction",
    run: {
      status: "success",
      finalOutcome: "completed",
      finalUrl: "https://learn.example.com/course/js-101/certificate",
      errorCode: null,
      stepCount: 22,
      durationSec: 180,
      frustrationCount: 0,
      selfReport: {
        confidence: 0.85,
        hardestPart: "The coding exercises in module 3 were tricky because the instructions assumed I knew about arrays already.",
        confusion: "I wasn't sure if I needed to complete the optional quizzes to get the certificate.",
        suggestedChange: "Add a progress bar that shows which activities count toward the certificate.",
        answers: {
          overallRating: 4,
          wouldRecommend: true,
          favoriteFeature: "The interactive code editor was really helpful for trying things out.",
        },
      },
      milestones: [
        { stepIndex: 0, actionType: "navigate", title: "Course dashboard", url: "https://learn.example.com/course/js-101", note: null },
        { stepIndex: 5, actionType: "click", title: "Start module 1", url: "https://learn.example.com/course/js-101/module-1", note: null },
        { stepIndex: 10, actionType: "click", title: "Start module 2", url: "https://learn.example.com/course/js-101/module-2", note: null },
        { stepIndex: 15, actionType: "click", title: "Start module 3", url: "https://learn.example.com/course/js-101/module-3", note: "Struggled with array exercises" },
        { stepIndex: 20, actionType: "click", title: "Complete course", url: "https://learn.example.com/course/js-101/complete", note: null },
        { stepIndex: 21, actionType: "navigate", title: "Download certificate", url: "https://learn.example.com/course/js-101/certificate", note: null },
      ],
    },
    expected: {
      outcomeClassification: "success",
      hasFrustrationMarkers: false,
      hasSelfReportedConfidence: true,
      hasBlockingText: false,
      quoteSourceField: "hardestPart",
    },
  },
];

// ---------------------------------------------------------------------------
// Score a single LLM response
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function scoreResponse(
  task: EvalTask,
  response: AiRunSummary,
): { score: number; details: Record<string, unknown> } {
  let totalWeight = 0;
  let weightedScore = 0;

  // 1. Outcome accuracy (30%) — must match expected classification
  const outcomeCorrect =
    response.outcomeClassification === task.expected.outcomeClassification;
  const outcomeScore = outcomeCorrect ? 1.0 : 0.0;
  weightedScore += outcomeScore * 0.3;
  totalWeight += 0.3;

  // 2. Failure summary quality (20%) — concise, specific, non-empty for failures
  let failureSummaryScore = 0;
  if (task.expected.outcomeClassification === "success") {
    // For successes, reward indicating success or low-severity language
    const mentionsSuccess =
      response.failureSummary !== null &&
      /success|complet|no.?fail|smooth/i.test(response.failureSummary);
    failureSummaryScore = mentionsSuccess ? 1.0 : 0.5;
  } else {
    // For failures/abandoned: reward specificity
    if (response.failureSummary === null || response.failureSummary.trim() === "") {
      failureSummaryScore = 0;
    } else {
      const words = countWords(response.failureSummary);
      // Ideal: 5-25 words (concise but specific)
      const conciseness = words >= 5 && words <= 25 ? 1.0 : words < 5 ? 0.3 : Math.max(0, 1 - (words - 25) / 25);
      // References the run's actual context (error code, URL, status)
      const contextTerms = [
        task.run.errorCode,
        task.run.finalUrl ? new URL(task.run.finalUrl).pathname : null,
        task.run.finalOutcome,
      ].filter(Boolean) as string[];
      const referencesContext =
        contextTerms.length === 0
          ? 0.5
          : contextTerms.some((term) =>
              response.failureSummary!.toLowerCase().includes(term.toLowerCase().slice(0, 15)),
            )
            ? 1.0
            : 0.3;
      failureSummaryScore = conciseness * 0.5 + referencesContext * 0.5;
    }
  }
  weightedScore += failureSummaryScore * 0.2;
  totalWeight += 0.2;

  // 3. Evidence grounding — representativeQuote (20%)
  let quoteScore = 0;
  if (task.run.selfReport === null) {
    // No self-report: reward null or appropriate fallback
    quoteScore = response.representativeQuote === null ? 1.0 : 0.5;
  } else {
    if (response.representativeQuote === null || response.representativeQuote.trim() === "") {
      quoteScore = 0.1; // Missed opportunity
    } else {
      // Check if quote resembles self-report content
      const selfReportTexts = [
        task.run.selfReport.hardestPart,
        task.run.selfReport.confusion,
        task.run.selfReport.suggestedChange,
        ...Object.values(task.run.selfReport.answers ?? {}).filter(
          (v): v is string => typeof v === "string",
        ),
      ].filter(Boolean) as string[];

      const quoteNorm = response.representativeQuote.toLowerCase();
      const hasGrounding = selfReportTexts.some((text) => {
        const textNorm = text.toLowerCase();
        // Check for shared significant words (3+ chars)
        const quoteWords = new Set(quoteNorm.split(/\s+/).filter((w) => w.length >= 3));
        const textWords = textNorm.split(/\s+/).filter((w) => w.length >= 3);
        const overlap = textWords.filter((w) => quoteWords.has(w)).length;
        return overlap >= 3 || quoteNorm.includes(textNorm.slice(0, 30).toLowerCase());
      });

      quoteScore = hasGrounding ? 1.0 : 0.3;
    }
  }
  weightedScore += quoteScore * 0.2;
  totalWeight += 0.2;

  // 4. Frustration capture (15%)
  let frustrationScore = 0;
  if (task.expected.hasFrustrationMarkers) {
    frustrationScore = response.frustrationMarkers.length > 0 ? 1.0 : 0.0;
  } else {
    frustrationScore = response.frustrationMarkers.length === 0 ? 1.0 : 0.5;
  }
  weightedScore += frustrationScore * 0.15;
  totalWeight += 0.15;

  // 5. Confidence calibration (15%)
  let confidenceScore = 0;
  if (task.expected.hasSelfReportedConfidence) {
    if (response.selfReportedConfidence === null) {
      confidenceScore = 0.0;
    } else {
      const expectedConf = task.run.selfReport?.confidence ?? 0.5;
      const diff = Math.abs(response.selfReportedConfidence - expectedConf);
      confidenceScore = Math.max(0, 1 - diff / 0.5); // 0 if off by 0.5+
    }
  } else {
    confidenceScore = response.selfReportedConfidence === null ? 1.0 : 0.3;
  }
  weightedScore += confidenceScore * 0.15;
  totalWeight += 0.15;

  const score = Math.round((weightedScore / totalWeight) * 10000) / 10000;

  return {
    score,
    details: {
      outcomeCorrect,
      outcomeScore,
      failureSummaryScore: Math.round(failureSummaryScore * 1000) / 1000,
      quoteScore: Math.round(quoteScore * 1000) / 1000,
      frustrationScore: Math.round(frustrationScore * 1000) / 1000,
      confidenceScore: Math.round(confidenceScore * 1000) / 1000,
      responseOutcome: response.outcomeClassification,
      expectedOutcome: task.expected.outcomeClassification,
      frustrationMarkerCount: response.frustrationMarkers.length,
      selfReportedConfidence: response.selfReportedConfidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Main evaluation loop
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const modelOverride = process.env.BOTCHESTRA_MODEL_SUMMARIZATION;
  const taskSubset = process.env.EVO_TASK_IDS
    ? process.env.EVO_TASK_IDS.split(",").map((s) => s.trim())
    : null;
  const tasks = taskSubset
    ? EVAL_TASKS.filter((t) => taskSubset.includes(t.id))
    : EVAL_TASKS;

  console.error(
    `[eval] Starting summarization benchmark with ${tasks.length} tasks${DRY_RUN ? " (dry-run)" : ""}`,
  );
  if (modelOverride) console.error(`[eval] Model override: ${modelOverride}`);

  for (const task of tasks) {
    console.error(`[eval] Task ${task.id}: ${task.description}`);

    const prompt = promptModule.buildSummarizationPrompt(task.run);

    if (DRY_RUN) {
      const mockResponse: AiRunSummary = {
        outcomeClassification: task.expected.outcomeClassification,
        failureSummary: "Mock failure summary for validation.",
        failurePoint: task.run.finalUrl ?? "unknown",
        lastSuccessfulState: "Mock last successful state.",
        blockingText: task.expected.hasBlockingText ? "Mock blocking text" : null,
        frustrationMarkers: task.expected.hasFrustrationMarkers ? ["mock_marker"] : [],
        selfReportedConfidence: task.expected.hasSelfReportedConfidence
          ? (task.run.selfReport?.confidence ?? 0.5)
          : null,
        representativeQuote: task.run.selfReport?.hardestPart ?? null,
      };
      const { score, details } = scoreResponse(task, mockResponse);
      console.error(`[eval]   ${task.id}: score=${score} (dry-run)`);
      logTask(task.id, score, { summary: "dry-run", ...details });
      continue;
    }

    try {
      const result = await generateWithModel("summarization", {
        system: promptModule.SUMMARIZATION_SYSTEM_PROMPT,
        prompt,
        modelOverride,
      });

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(result.text);
      } catch {
        console.error(`[eval]   ${task.id}: FAILED - invalid JSON`);
        logTask(task.id, 0, {
          summary: "invalid JSON response",
          failureReason: "JSON parse error",
          rawResponse: result.text.slice(0, 500),
        });
        continue;
      }

      const parsed = aiRunSummarySchema.safeParse(parsedJson);
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
        `[eval]   ${task.id}: score=${score} outcome=${parsed.data.outcomeClassification} (expected=${task.expected.outcomeClassification})`,
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
