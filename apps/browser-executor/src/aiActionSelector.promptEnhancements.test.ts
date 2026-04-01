import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import type { ObservationBundle } from "./observationBuilder";
import type { BrowserPageSnapshot, SelectActionInput } from "./runExecutor";
import { createAiActionSelector } from "./aiActionSelector";

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_prompt_enhancements",
    studyId: "study_prompt_enhancements",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: { techSavviness: 0.1 },
      edgeScore: 0.2,
      tensionSeed: "I get nervous when nothing happens after I click.",
      firstPersonBio: "I am a cautious shopper who needs clear feedback.",
      behaviorRules: ["Avoid repeating failed actions."],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Find help before continuing checkout.",
      goal: "Use the page information to choose a productive next step.",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "finish", "wait"],
      forbiddenActions: [],
      successCriteria: ["Open a useful page or finish when complete."],
      stopConditions: [],
      postTaskQuestions: [],
      maxSteps: 4,
      maxDurationSec: 60,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "unused",
    callbackBaseUrl: "https://convex.example.com",
  };
}

function createPage(): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Need help? Open the support page.",
    interactiveElements: [
      {
        role: "link",
        label: "Help",
        selector: "a[href='/help']",
        href: "/help",
      },
      {
        role: "button",
        label: "Checkout",
        selector: "#checkout",
      },
    ],
    pageFingerprint: "cart",
    branchOptions: [],
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: 200,
    deadEnd: false,
    agentNotes: null,
  };
}

function createObservation(): ObservationBundle {
  return {
    currentUrl: "https://shop.example.com/cart",
    pageTitle: "Cart",
    visibleTextExcerpt: "Need help? Open the support page.",
    interactiveElementSummary: 'link "Help" (a[href="/help"]); button "Checkout" (#checkout)',
    recentActionHistory: "No prior actions recorded.",
    taskProgressSummary:
      "Step 2 of 4. Goal: Use the page information to choose a productive next step. No milestones completed yet.",
    text: [
      "URL: https://shop.example.com/cart",
      "Title: Cart",
      "Visible text: Need help? Open the support page.",
      'Interactive elements: link "Help" (a[href="/help"]); button "Checkout" (#checkout)',
      "Recent actions: No prior actions recorded.",
      "Task progress: Step 2 of 4.",
    ].join("\n"),
    tokenCount: 42,
    truncated: false,
  };
}

function createInput(): SelectActionInput {
  return {
    request: createRequest(),
    stepIndex: 1,
    page: createPage(),
    observation: createObservation(),
    actionHistory: [
      {
        stepIndex: 0,
        actionType: "click",
        target: "#checkout",
        outcome: "no visible change (same URL, title, and elements)",
      },
    ],
  };
}

describe("aiActionSelector prompt enhancements", () => {
  it("includes anti-loop guidance and link href metadata in the prompt", async () => {
    const generateAction = vi.fn(async (options: { system: string; prompt: string }) => ({
      text: JSON.stringify({
        type: "click",
        selector: "a[href='/help']",
        rationale: "Open the help page instead of repeating the failed checkout click.",
      }),
      options,
    }));
    const selectAction = createAiActionSelector({ generateAction });

    await selectAction(createInput());

    const call = generateAction.mock.calls[0];
    expect(call).toBeDefined();
    const [options] = call!;
    const { system, prompt } = options;
    expect(system).toContain(
      "IMPORTANT: If your action history shows you tried the same action and the outcome was no visible change, you MUST try a completely different action or selector. Never repeat a failed action.",
    );
    expect(prompt).toContain('"href": "/help"');
  });
});
