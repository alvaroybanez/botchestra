/**
 * Evo benchmark: axis generation prompt quality.
 *
 * Evaluates buildSuggestAxesSystemPrompt and buildSuggestAxesPrompt from the
 * target file against a fixed set of persona config scenarios. Each scenario
 * is a (name, context, description, existingAxisKeys?) tuple.
 *
 * The prompt is called via the AI package, the response is validated using the
 * production Zod schema, and a composite quality score is computed.
 *
 * Scoring dimensions:
 *   - Validity (gate): must parse as JSON and pass Zod schema
 *   - Axis count: prefer 5 axes for max diversity coverage
 *   - Description richness: longer, more specific descriptions score higher
 *   - Anchor specificity: anchors that are behavioral and descriptive, not generic
 *   - Context relevance: axes that reference domain-specific concepts from the config
 *   - Mutual distinctness: axes that measure different things (low pairwise similarity)
 *
 * Metric: mean per-task score (higher is better).
 *
 * Usage:
 *   EVO_TRACES_DIR=/tmp/traces bun run benchmark/eval-axis-generation.ts 2>/tmp/stderr.log
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { generateWithModel } from "../packages/ai/src/index";

// --- Inline instrumentation (same contract as evo-agent SDK) ---

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

// --- Target loading ---

const TARGET_PATH = process.env.EVO_TARGET
  ? resolve(process.env.EVO_TARGET)
  : resolve(import.meta.dir, "../convex/axisGenerationPrompt.ts");
const promptModule = (await import(TARGET_PATH)) as typeof import("../convex/axisGenerationPrompt");

// --- Validation schema (mirrors production) ---

const AXIS_KEY_PATTERN = /^[a-z0-9_]+$/;

const axisSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  lowAnchor: z.string().trim().min(1),
  midAnchor: z.string().trim().min(1),
  highAnchor: z.string().trim().min(1),
  weight: z.number().positive(),
});

const suggestedAxesSchema = z
  .array(axisSchema)
  .min(3)
  .max(5)
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();
    axes.forEach((axis, index) => {
      if (!AXIS_KEY_PATTERN.test(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Axis key must be snake_case.",
        });
      }
      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Axis keys must be unique.",
        });
        return;
      }
      seen.add(axis.key);
    });
  });

type Axis = z.infer<typeof axisSchema>;

// --- Evaluation tasks ---

type EvalTask = {
  id: string;
  name: string;
  context: string;
  description: string;
  existingAxisKeys?: string[];
  /** Domain-specific keywords the axes should relate to */
  domainKeywords: string[];
};

const EVAL_TASKS: EvalTask[] = [
  {
    id: "ecommerce_checkout",
    name: "E-commerce Checkout Flow",
    context:
      "Testing a multi-step checkout process for an online retail store targeting diverse demographics.",
    description:
      "Shoppers comparing retailers and payment options across mobile and desktop.",
    existingAxisKeys: ["brand_loyalty"],
    domainKeywords: [
      "price", "cost", "shop", "buy", "cart", "payment", "checkout",
      "shipping", "discount", "impulse", "compare", "deal", "spend",
      "mobile", "trust", "return", "browse",
    ],
  },
  {
    id: "healthcare_portal",
    name: "Healthcare Portal Onboarding",
    context:
      "Patient portal for a regional hospital. Users range from young adults to elderly patients managing chronic conditions.",
    description:
      "Patients accessing medical records, scheduling appointments, and managing prescriptions online.",
    domainKeywords: [
      "health", "medical", "patient", "doctor", "appointment", "record",
      "prescription", "privacy", "secure", "condition", "chronic",
      "portal", "anxiety", "trust", "data", "symptom", "diagnosis",
    ],
  },
  {
    id: "learning_platform",
    name: "Online Learning Platform",
    context:
      "Self-paced coding bootcamp targeting career changers. Mix of structured lessons and hands-on projects.",
    description:
      "Career changers learning to code through a self-paced online bootcamp with projects and certificates.",
    existingAxisKeys: ["prior_coding_experience"],
    domainKeywords: [
      "learn", "study", "course", "lesson", "skill", "practice",
      "exercise", "project", "certificate", "motivation", "discipline",
      "progress", "pace", "difficulty", "feedback", "visual", "tutorial",
    ],
  },
  {
    id: "banking_onboarding",
    name: "Banking App Enrollment",
    context:
      "Mobile-first bank onboarding for a neobank targeting millennials and Gen Z. Emphasis on trust signals and fast KYC.",
    description:
      "New customers opening accounts at a digital-only bank, uploading ID documents, and setting up direct deposit.",
    domainKeywords: [
      "bank", "finance", "money", "account", "trust", "security",
      "digital", "mobile", "kyc", "identity", "deposit", "savings",
      "invest", "risk", "privacy", "fee", "transfer",
    ],
  },
  {
    id: "travel_booking",
    name: "Travel Booking Platform",
    context:
      "Multi-step flight and hotel booking flow for a travel aggregator. Users compare prices, read reviews, and manage itineraries.",
    description:
      "Travelers searching for flights, comparing hotel options, and managing complex multi-city itineraries.",
    domainKeywords: [
      "travel", "flight", "hotel", "book", "price", "compare",
      "itinerary", "destination", "review", "cancel", "refund",
      "flexible", "budget", "luxury", "adventure", "plan", "trip",
    ],
  },
  {
    id: "saas_dashboard",
    name: "B2B SaaS Analytics Dashboard",
    context:
      "Enterprise analytics platform onboarding. Users range from non-technical marketing managers to data engineers building custom queries.",
    description:
      "Business users exploring dashboards, creating reports, and configuring data integrations.",
    existingAxisKeys: ["sql_proficiency", "data_literacy"],
    domainKeywords: [
      "data", "analytic", "dashboard", "report", "metric", "chart",
      "query", "filter", "insight", "kpi", "visualization", "export",
      "integrate", "custom", "team", "share", "automate",
    ],
  },
  {
    id: "food_delivery",
    name: "Food Delivery App",
    context:
      "On-demand food delivery app in a competitive urban market. Users order from restaurants, track deliveries, and manage dietary preferences.",
    description:
      "Hungry users ordering food for delivery, comparing restaurants, tracking orders, and managing dietary restrictions.",
    domainKeywords: [
      "food", "order", "deliver", "restaurant", "menu", "diet",
      "allergy", "fast", "wait", "track", "tip", "price", "cuisine",
      "review", "rating", "repeat", "craving",
    ],
  },
  {
    id: "accessibility_tool",
    name: "Government Services Portal",
    context:
      "Citizen-facing portal for tax filing, benefit applications, and license renewals. Must serve users with varying abilities, literacy levels, and digital access.",
    description:
      "Citizens filing taxes, applying for benefits, and renewing licenses across a wide spectrum of ability and digital literacy.",
    domainKeywords: [
      "access", "assist", "literacy", "simple", "clear", "form",
      "submit", "document", "upload", "deadline", "status", "help",
      "language", "disability", "screen reader", "government", "benefit",
    ],
  },
];

// --- Scoring ---

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Jaccard similarity on word bigrams of two strings */
function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const words = s.toLowerCase().split(/\s+/);
    const bg = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      bg.add(`${words[i]} ${words[i + 1]}`);
    }
    // Also add individual words for short strings
    for (const w of words) bg.add(w);
    return bg;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function scoreAxes(
  axes: Axis[],
  task: EvalTask,
): { score: number; details: Record<string, unknown> } {
  // 1. Axis count bonus (20%): prefer 5 axes for maximum diversity
  //    3 axes = 0.0, 4 = 0.5, 5 = 1.0
  const axisCountBonus = (axes.length - 3) / 2;

  // 2. Description richness (20%): ideal 12-25 words per description
  const descWordCounts = axes.map((a) => countWords(a.description));
  const descRichness =
    descWordCounts.reduce((sum, wc) => {
      if (wc < 8) return sum + wc / 8; // too short
      if (wc <= 25) return sum + 1.0; // ideal range
      return sum + Math.max(0, 1 - (wc - 25) / 15); // diminishing for verbose
    }, 0) / axes.length;

  // 3. Anchor specificity (20%): anchors should be behavioral/descriptive (3+ words)
  const anchorScores = axes.map((a) => {
    const anchors = [a.lowAnchor, a.midAnchor, a.highAnchor];
    return (
      anchors.reduce((sum, anchor) => {
        const wc = countWords(anchor);
        if (wc <= 1) return sum + 0.2; // single-word anchor is weak
        if (wc === 2) return sum + 0.5;
        if (wc <= 6) return sum + 1.0; // ideal: 3-6 words
        return sum + Math.max(0.5, 1 - (wc - 6) / 10); // too verbose
      }, 0) / 3
    );
  });
  const anchorSpecificity =
    anchorScores.reduce((a, b) => a + b, 0) / axes.length;

  // 4. Context relevance (20%): do axes reference domain concepts?
  const lowerKeywords = task.domainKeywords.map((k) => k.toLowerCase());
  const relevanceScores = axes.map((a) => {
    const combined = `${a.label} ${a.description} ${a.lowAnchor} ${a.midAnchor} ${a.highAnchor}`.toLowerCase();
    const hits = lowerKeywords.filter((kw) => combined.includes(kw)).length;
    return Math.min(1, hits / 2); // 2+ keyword hits = full score
  });
  const contextRelevance =
    relevanceScores.reduce((a, b) => a + b, 0) / axes.length;

  // 5. Mutual distinctness (20%): low pairwise similarity between axes
  let totalSimilarity = 0;
  let pairs = 0;
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const textI = `${axes[i].label} ${axes[i].description}`;
      const textJ = `${axes[j].label} ${axes[j].description}`;
      totalSimilarity += bigramSimilarity(textI, textJ);
      pairs++;
    }
  }
  const avgSimilarity = pairs > 0 ? totalSimilarity / pairs : 0;
  // Low similarity = high distinctness. 0 similarity = 1.0, 0.5 similarity = 0.0
  const distinctness = Math.max(0, 1 - avgSimilarity * 2);

  const score =
    axisCountBonus * 0.2 +
    descRichness * 0.2 +
    anchorSpecificity * 0.2 +
    contextRelevance * 0.2 +
    distinctness * 0.2;

  return {
    score: Math.round(score * 10000) / 10000,
    details: {
      axisCount: axes.length,
      axisCountBonus: Math.round(axisCountBonus * 1000) / 1000,
      descRichness: Math.round(descRichness * 1000) / 1000,
      descWordCounts,
      anchorSpecificity: Math.round(anchorSpecificity * 1000) / 1000,
      contextRelevance: Math.round(contextRelevance * 1000) / 1000,
      relevancePerAxis: relevanceScores.map((s) => Math.round(s * 100) / 100),
      distinctness: Math.round(distinctness * 1000) / 1000,
      avgPairSimilarity: Math.round(avgSimilarity * 1000) / 1000,
      axisKeys: axes.map((a) => a.key),
    },
  };
}

// --- Main ---

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const modelOverride = process.env.BOTCHESTRA_MODEL_RECOMMENDATION;
  const taskSubset = process.env.EVO_TASK_IDS
    ? process.env.EVO_TASK_IDS.split(",").map((s) => s.trim())
    : null;
  const tasks = taskSubset
    ? EVAL_TASKS.filter((t) => taskSubset.includes(t.id))
    : EVAL_TASKS;

  console.error(
    `[eval] Starting axis generation benchmark with ${tasks.length} tasks${DRY_RUN ? " (dry-run)" : ""}`,
  );
  if (modelOverride) console.error(`[eval] Model override: ${modelOverride}`);

  for (const task of tasks) {
    console.error(`[eval] Task ${task.id}...`);

    const system = promptModule.buildSuggestAxesSystemPrompt();
    const prompt = promptModule.buildSuggestAxesPrompt({
      name: task.name,
      context: task.context,
      description: task.description,
      existingAxisKeys: task.existingAxisKeys,
    });

    if (DRY_RUN) {
      const mockAxes: Axis[] = [
        { key: "tech_savviness", label: "Tech Savviness", description: "How comfortable the user is with technology", lowAnchor: "Avoids technology", midAnchor: "Comfortable with basics", highAnchor: "Power user", weight: 1 },
        { key: "patience", label: "Patience Level", description: "Willingness to wait and tolerate friction", lowAnchor: "Easily frustrated", midAnchor: "Moderate tolerance", highAnchor: "Very patient", weight: 1 },
        { key: "price_sensitivity", label: "Price Sensitivity", description: "How much cost influences decisions", lowAnchor: "Price insensitive", midAnchor: "Cost conscious", highAnchor: "Extreme deal seeker", weight: 1 },
      ];
      const { score, details } = scoreAxes(mockAxes, task);
      console.error(`[eval]   ${task.id}: score=${score} (dry-run)`);
      logTask(task.id, score, { summary: "dry-run", ...details });
      continue;
    }

    try {
      const result = await generateWithModel("recommendation", {
        system,
        prompt,
        modelOverride,
      });

      const cleaned = stripMarkdownFences(result.text);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleaned);
      } catch {
        console.error(`[eval]   ${task.id}: FAILED - invalid JSON`);
        logTask(task.id, 0, {
          summary: "invalid JSON response",
          failureReason: "Failed to parse JSON",
        });
        continue;
      }

      // Apply weight default (mirrors production)
      if (Array.isArray(parsedJson)) {
        parsedJson = parsedJson.map((axis: Record<string, unknown>) => ({
          weight: 1,
          ...axis,
        }));
      }

      const validation = suggestedAxesSchema.safeParse(parsedJson);
      if (!validation.success) {
        const issues = validation.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        console.error(
          `[eval]   ${task.id}: FAILED - schema validation: ${issues}`,
        );
        logTask(task.id, 0, {
          summary: `schema validation failed: ${issues}`,
          failureReason: issues,
        });
        continue;
      }

      const axes = validation.data;
      const { score, details } = scoreAxes(axes, task);

      console.error(
        `[eval]   ${task.id}: score=${score} axes=${axes.length} keys=[${axes.map((a) => a.key).join(",")}]`,
      );

      logTask(task.id, score, {
        summary: `${axes.length} axes, quality=${score}`,
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
