/**
 * Evo benchmark: persona variant expansion prompt quality.
 *
 * Evaluates buildExpansionPrompt from the target file against a fixed set of
 * synthetic evaluation tasks. Each task is a (config, syntheticUser, axisValues)
 * tuple. The prompt is called via the AI package, the response is validated
 * using the production validation gate, and a composite score is computed.
 *
 * Metric: acceptance rate × quality bonus (higher is better).
 *
 * Usage:
 *   EVO_TRACES_DIR=/tmp/traces bun run benchmark/eval-expansion.ts 2>/tmp/stderr.log
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateWithModel } from "../packages/ai/src/index";
import {
  validateGeneratedVariantCandidate,
  countWords,
  type GeneratedVariantCandidate,
} from "../convex/personaEngine/variantGeneration";

// Dynamic import of the prompt from {target} (worktree copy) or fallback to local
const TARGET_PATH = process.env.EVO_TARGET
  ? resolve(process.env.EVO_TARGET)
  : resolve(import.meta.dir, "../convex/personaEngine/expansionPrompt.ts");
const promptModule = await import(TARGET_PATH) as typeof import("../convex/personaEngine/expansionPrompt");

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
// Evaluation tasks — fixed synthetic inputs covering diverse persona scenarios
// ---------------------------------------------------------------------------

type EvalTask = {
  id: string;
  config: { name: string; context: string };
  syntheticUser: { summary: string; evidenceSnippets: string[] };
  axisValues: Record<string, number>;
};

const EVAL_TASKS: EvalTask[] = [
  {
    id: "edge_low_tech",
    config: {
      name: "E-commerce Checkout Flow",
      context:
        "Testing a multi-step checkout process for an online retail store targeting diverse demographics.",
    },
    syntheticUser: {
      summary:
        "Retired teacher in rural area with limited tech exposure, prefers phone calls over web.",
      evidenceSnippets: [
        "Participant struggled to find the cart icon.",
        "Asked what 'promo code' means.",
        "Preferred larger text and clear labels.",
      ],
    },
    axisValues: { techSavviness: 0.05, patience: 0.9, priceConscious: 0.8 },
  },
  {
    id: "edge_high_tech",
    config: {
      name: "E-commerce Checkout Flow",
      context:
        "Testing a multi-step checkout process for an online retail store targeting diverse demographics.",
    },
    syntheticUser: {
      summary:
        "Software engineer who shops online daily, expects instant page loads and keyboard shortcuts.",
      evidenceSnippets: [
        "Participant bypassed the wizard and typed the URL directly.",
        "Complained about unnecessary confirmation modals.",
        "Used browser DevTools to check shipping API response.",
      ],
    },
    axisValues: { techSavviness: 0.95, patience: 0.1, priceConscious: 0.3 },
  },
  {
    id: "interior_balanced",
    config: {
      name: "Healthcare Portal Onboarding",
      context:
        "Patient portal for a regional hospital. Users range from young adults to elderly patients managing chronic conditions.",
    },
    syntheticUser: {
      summary:
        "Middle-aged parent managing a family of four's medical records, moderately comfortable with technology.",
      evidenceSnippets: [
        "Used the portal on a tablet while waiting at the clinic.",
        "Had trouble distinguishing between 'My Records' and 'Family Records'.",
        "Appreciated the appointment reminder feature.",
      ],
    },
    axisValues: {
      techSavviness: 0.5,
      healthAnxiety: 0.6,
      trustInDigitalHealth: 0.4,
    },
  },
  {
    id: "edge_anxious_patient",
    config: {
      name: "Healthcare Portal Onboarding",
      context:
        "Patient portal for a regional hospital. Users range from young adults to elderly patients managing chronic conditions.",
    },
    syntheticUser: {
      summary:
        "Elderly patient recently diagnosed with a chronic condition, very anxious about medical data privacy.",
      evidenceSnippets: [
        "Asked three times whether the portal was 'really secure'.",
        "Refused to enter social security number online.",
        "Printed every page as a personal backup.",
      ],
    },
    axisValues: {
      techSavviness: 0.1,
      healthAnxiety: 0.95,
      trustInDigitalHealth: 0.05,
    },
  },
  {
    id: "interior_casual_learner",
    config: {
      name: "Online Learning Platform",
      context:
        "Self-paced coding bootcamp targeting career changers. Mix of structured lessons and hands-on projects.",
    },
    syntheticUser: {
      summary:
        "Graphic designer exploring a career pivot to front-end development, learns best through visual examples.",
      evidenceSnippets: [
        "Skipped text-heavy lessons in favor of video walkthroughs.",
        "Spent extra time on CSS exercises but rushed through JavaScript theory.",
        "Bookmarked color-related code snippets for personal projects.",
      ],
    },
    axisValues: {
      selfDiscipline: 0.4,
      priorCodingExperience: 0.15,
      visualLearningPreference: 0.85,
    },
  },
  {
    id: "edge_power_learner",
    config: {
      name: "Online Learning Platform",
      context:
        "Self-paced coding bootcamp targeting career changers. Mix of structured lessons and hands-on projects.",
    },
    syntheticUser: {
      summary:
        "Data analyst with Python experience, enrolled to formalize web development skills and earn a certificate.",
      evidenceSnippets: [
        "Completed 3 modules in one sitting.",
        "Filed a bug report about an incorrect test case in the grading system.",
        "Asked for harder challenge problems in the forum.",
      ],
    },
    axisValues: {
      selfDiscipline: 0.9,
      priorCodingExperience: 0.7,
      visualLearningPreference: 0.3,
    },
  },
  {
    id: "edge_impulsive_shopper",
    config: {
      name: "E-commerce Checkout Flow",
      context:
        "Testing a multi-step checkout process for an online retail store targeting diverse demographics.",
    },
    syntheticUser: {
      summary:
        "College student who impulse-shops on mobile during lectures, extremely price-sensitive but impatient.",
      evidenceSnippets: [
        "Added 5 items to cart then removed 4 at checkout.",
        "Abandoned cart twice when shipping wasn't free.",
        "Completed purchase only after a 10% popup coupon appeared.",
      ],
    },
    axisValues: { techSavviness: 0.7, patience: 0.05, priceConscious: 0.95 },
  },
  {
    id: "interior_cautious_parent",
    config: {
      name: "Banking App Enrollment",
      context:
        "Mobile-first bank onboarding for a neobank targeting millennials and Gen Z. Emphasis on trust signals and fast KYC.",
    },
    syntheticUser: {
      summary:
        "New parent opening a savings account for their child, cautious about sharing financial data with a digital-only bank.",
      evidenceSnippets: [
        "Read the entire privacy policy before proceeding.",
        "Hesitated at the ID photo upload step for 2 minutes.",
        "Searched 'is [bank name] FDIC insured' in a separate tab.",
      ],
    },
    axisValues: {
      trustInDigitalBanking: 0.3,
      financialLiteracy: 0.6,
      mobileNativeFluency: 0.5,
    },
  },
];

// ---------------------------------------------------------------------------
// Score a single candidate
// ---------------------------------------------------------------------------

function scoreCandidate(candidate: GeneratedVariantCandidate): {
  score: number;
  validation: ReturnType<typeof validateGeneratedVariantCandidate>;
  details: Record<string, unknown>;
} {
  const validation = validateGeneratedVariantCandidate(candidate);

  if (!validation.accepted) {
    return { score: 0, validation, details: { rejected: true, reasons: validation.reasons } };
  }

  // Quality bonus components (each 0-1, averaged):
  // 1. Coherence: self-reported score from LLM (already validated >= 0.65)
  const coherenceBonus = candidate.coherenceScore;

  // 2. Bio richness: closer to midpoint of 80-150 range is better
  const wordCount = countWords(candidate.firstPersonBio);
  const idealMidpoint = 115;
  const bioRichness = 1 - Math.abs(wordCount - idealMidpoint) / 35;

  // 3. Rule diversity: more rules (up to 8) is better
  const ruleDiversity = (candidate.behaviorRules.length - 5) / 3; // 0 at 5, 1 at 8

  // 4. Tension seed substantiveness: longer seeds with more detail score higher
  const tensionWords = countWords(candidate.tensionSeed);
  const tensionBonus = Math.min(1, tensionWords / 20);

  const qualityBonus =
    coherenceBonus * 0.35 +
    Math.max(0, bioRichness) * 0.25 +
    Math.max(0, ruleDiversity) * 0.2 +
    tensionBonus * 0.2;

  // Final score: acceptance (binary) × quality bonus
  const score = Math.round(qualityBonus * 10000) / 10000;

  return {
    score,
    validation,
    details: {
      coherenceBonus,
      bioRichness: Math.max(0, bioRichness),
      ruleDiversity: Math.max(0, ruleDiversity),
      tensionBonus,
      wordCount,
      tensionWords,
      ruleCount: candidate.behaviorRules.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Main evaluation loop
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const modelOverride = process.env.BOTCHESTRA_MODEL_EXPANSION;
  const taskSubset = process.env.EVO_TASK_IDS
    ? process.env.EVO_TASK_IDS.split(",").map((s) => s.trim())
    : null;
  const tasks = taskSubset
    ? EVAL_TASKS.filter((t) => taskSubset.includes(t.id))
    : EVAL_TASKS;

  console.error(
    `[eval] Starting expansion benchmark with ${tasks.length} tasks${DRY_RUN ? " (dry-run)" : ""}`,
  );
  if (modelOverride) console.error(`[eval] Model override: ${modelOverride}`);

  for (const task of tasks) {
    console.error(`[eval] Task ${task.id}...`);
    const prompt = promptModule.buildExpansionPrompt(
      task.config,
      task.syntheticUser,
      task.axisValues,
    );

    if (DRY_RUN) {
      // Validate harness wiring without LLM calls
      const mockCandidate: GeneratedVariantCandidate = {
        firstPersonBio: Array.from({ length: 100 }, (_, i) => `word${i}`).join(" "),
        behaviorRules: ["r1", "r2", "r3", "r4", "r5", "r6"],
        tensionSeed: "I worry about making mistakes when navigating unfamiliar interfaces.",
        coherenceScore: 0.82,
      };
      const { score, validation, details } = scoreCandidate(mockCandidate);
      console.error(
        `[eval]   ${task.id}: score=${score} accepted=${validation.accepted} (dry-run)`,
      );
      logTask(task.id, score, { summary: "dry-run", ...details });
      continue;
    }

    try {
      const result = await generateWithModel("expansion", {
        system:
          promptModule.EXPANSION_SYSTEM_PROMPT,
        prompt,
        modelOverride,
      });

      const parsed = JSON.parse(result.text) as GeneratedVariantCandidate;
      const { score, validation, details } = scoreCandidate(parsed);

      console.error(
        `[eval]   ${task.id}: score=${score} accepted=${validation.accepted} words=${validation.wordCount}`,
      );

      logTask(task.id, score, {
        summary: validation.accepted
          ? `accepted, quality=${score}`
          : `rejected: ${validation.reasons.join("; ")}`,
        failureReason: validation.accepted ? undefined : validation.reasons.join("; "),
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
