/**
 * Evo gate: persona variant expansion validation invariants.
 *
 * Ensures the prompt still produces valid JSON that passes the production
 * validation gate for at least 2 critical task scenarios. This is a safety
 * check — it runs with real LLM calls and exits 0 (all pass) or 1 (any fail).
 *
 * Usage:
 *   OPENAI_API_KEY=... bun run benchmark/gate-expansion.ts
 */

import { generateWithModel } from "../packages/ai/src/index";
import {
  validateGeneratedVariantCandidate,
  type GeneratedVariantCandidate,
} from "../convex/personaEngine/variantGeneration";

const GATE_TASKS = [
  {
    id: "gate_low_tech",
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
      ],
    },
    axisValues: { techSavviness: 0.05, patience: 0.9, priceConscious: 0.8 },
  },
  {
    id: "gate_balanced",
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
      ],
    },
    axisValues: {
      techSavviness: 0.5,
      healthAnxiety: 0.6,
      trustInDigitalHealth: 0.4,
    },
  },
];

function buildExpansionPrompt(
  config: { name: string; context: string },
  syntheticUser: { summary: string; evidenceSnippets: string[] },
  axisValues: Record<string, number>,
): string {
  return [
    `Config name: ${config.name}`,
    `Config context: ${config.context}`,
    `Synthetic user summary: ${syntheticUser.summary}`,
    `Evidence snippets: ${syntheticUser.evidenceSnippets.join(" | ")}`,
    `Axis values: ${JSON.stringify(axisValues)}`,
    "Return JSON with keys firstPersonBio, behaviorRules, tensionSeed, coherenceScore.",
    "The bio must be 80-150 words, behaviorRules must contain 5-8 strings, tensionSeed must be non-empty, and coherenceScore must be between 0 and 1.",
  ].join("\n");
}

async function main() {
  let failures = 0;

  for (const task of GATE_TASKS) {
    console.error(`[gate] ${task.id}...`);

    try {
      const result = await generateWithModel("expansion", {
        system:
          "Return only valid JSON for a synthetic persona variant. Do not include markdown fences.",
        prompt: buildExpansionPrompt(
          task.config,
          task.syntheticUser,
          task.axisValues,
        ),
      });

      const parsed = JSON.parse(result.text) as GeneratedVariantCandidate;
      const validation = validateGeneratedVariantCandidate(parsed);

      if (!validation.accepted) {
        console.error(`[gate]   FAIL: ${validation.reasons.join("; ")}`);
        failures += 1;
      } else {
        console.error(
          `[gate]   PASS: coherence=${validation.coherenceScore} words=${validation.wordCount}`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[gate]   FAIL (infra): ${msg}`);
      failures += 1;
    }
  }

  process.exit(failures > 0 ? 1 : 0);
}

main();
