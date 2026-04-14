/**
 * Gate: validates that the self-report prompt module exports the expected
 * interface and that the prompt produces structured output for each outcome.
 *
 * This gate runs WITHOUT LLM calls — it only checks structural correctness.
 * Exit 0 = pass, exit 1 = fail.
 */

import { resolve } from "node:path";

const TARGET_PATH = process.env.EVO_TARGET
  ? resolve(process.env.EVO_TARGET)
  : resolve(import.meta.dir, "../apps/browser-executor/src/selfReportPrompt.ts");

const promptModule = (await import(TARGET_PATH)) as typeof import("../apps/browser-executor/src/selfReportPrompt");

const STANDARD_QUESTIONS = [
  "Do you think you completed the task?",
  "What was the hardest part?",
  "How confident are you in the result?",
];

const REQUEST_BASE: import("../apps/browser-executor/src/selfReportPrompt").SelfReportPromptRequest = {
  taskSpec: {
    scenario: "Buy a product",
    goal: "Complete the checkout flow",
    postTaskQuestions: STANDARD_QUESTIONS,
  },
  personaVariant: {
    firstPersonBio: "I am a careful shopper who reads every step before clicking.",
    behaviorRules: ["Re-read confirmation pages", "Trust well-known brands"],
    tensionSeed: "I want to finish quickly without making mistakes.",
  },
};

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.error(`  PASS: ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL: ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

console.error("[gate] Self-report prompt structural checks");

check("buildSelfReportPrompt is a function", () => {
  if (typeof promptModule.buildSelfReportPrompt !== "function") {
    throw new Error("buildSelfReportPrompt is not exported as a function");
  }
});

check("SELF_REPORT_SYSTEM_PROMPT is a non-empty string", () => {
  if (typeof promptModule.SELF_REPORT_SYSTEM_PROMPT !== "string") {
    throw new Error("SELF_REPORT_SYSTEM_PROMPT is not exported as a string");
  }
  if (promptModule.SELF_REPORT_SYSTEM_PROMPT.length < 10) {
    throw new Error("SELF_REPORT_SYSTEM_PROMPT is too short");
  }
});

const OUTCOMES: Array<"SUCCESS" | "ABANDONED" | "FAILED"> = [
  "SUCCESS",
  "ABANDONED",
  "FAILED",
];

for (const outcome of OUTCOMES) {
  check(`generates non-empty prompt for outcome=${outcome}`, () => {
    const prompt = promptModule.buildSelfReportPrompt(REQUEST_BASE, {
      finalOutcome: outcome,
      stepCount: 4,
      durationSec: 25,
      frustrationCount: outcome === "SUCCESS" ? 0 : 2,
      milestones: [
        {
          stepIndex: 0,
          actionType: "navigate",
          title: "Cart",
          url: "https://shop.example.com/cart",
        },
        {
          stepIndex: 2,
          actionType: "click",
          title: "Checkout",
          url: "https://shop.example.com/checkout",
        },
      ],
    });
    if (typeof prompt !== "string" || prompt.length < 50) {
      throw new Error(`Prompt too short (${prompt?.length ?? 0} chars)`);
    }
  });
}

check("handles empty milestones without throwing", () => {
  const prompt = promptModule.buildSelfReportPrompt(REQUEST_BASE, {
    finalOutcome: "FAILED",
    stepCount: 0,
    durationSec: 0,
    frustrationCount: 0,
    milestones: [],
  });
  if (typeof prompt !== "string" || prompt.length < 50) {
    throw new Error(`Prompt too short for empty milestones (${prompt?.length ?? 0} chars)`);
  }
});

check("handles single question without throwing", () => {
  const prompt = promptModule.buildSelfReportPrompt(
    {
      ...REQUEST_BASE,
      taskSpec: { ...REQUEST_BASE.taskSpec, postTaskQuestions: ["Did it work?"] },
    },
    {
      finalOutcome: "SUCCESS",
      stepCount: 1,
      durationSec: 1,
      frustrationCount: 0,
      milestones: [],
    },
  );
  if (typeof prompt !== "string" || !prompt.includes("Did it work?")) {
    throw new Error("Prompt did not include the single question");
  }
});

check("prompt references all required output keys", () => {
  const prompt = promptModule.buildSelfReportPrompt(REQUEST_BASE, {
    finalOutcome: "SUCCESS",
    stepCount: 2,
    durationSec: 5,
    frustrationCount: 0,
    milestones: [],
  });
  const requiredKeys = [
    "perceivedSuccess",
    "hardestPart",
    "confusion",
    "confidence",
    "suggestedChange",
    "answers",
  ];
  for (const key of requiredKeys) {
    if (!prompt.includes(key)) {
      throw new Error(`Prompt missing reference to output key "${key}"`);
    }
  }
});

check("prompt instructs to key answers by exact question text", () => {
  const prompt = promptModule.buildSelfReportPrompt(REQUEST_BASE, {
    finalOutcome: "SUCCESS",
    stepCount: 2,
    durationSec: 5,
    frustrationCount: 0,
    milestones: [],
  });
  // Must mention each question and instruct on key fidelity.
  for (const q of STANDARD_QUESTIONS) {
    if (!prompt.includes(q)) {
      throw new Error(`Prompt did not include question text: "${q}"`);
    }
  }
  if (!/exact|key|verbatim/i.test(prompt)) {
    throw new Error("Prompt does not instruct on key fidelity (exact/key/verbatim)");
  }
});

check("prompt surfaces persona context", () => {
  const prompt = promptModule.buildSelfReportPrompt(REQUEST_BASE, {
    finalOutcome: "SUCCESS",
    stepCount: 2,
    durationSec: 5,
    frustrationCount: 0,
    milestones: [],
  });
  if (!prompt.includes(REQUEST_BASE.personaVariant.firstPersonBio)) {
    throw new Error("Prompt does not include persona bio");
  }
  if (!prompt.includes(REQUEST_BASE.personaVariant.tensionSeed)) {
    throw new Error("Prompt does not include tension seed");
  }
});

console.error(`\n[gate] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
