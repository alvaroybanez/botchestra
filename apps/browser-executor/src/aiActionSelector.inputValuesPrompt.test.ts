import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import type { ObservationBundle } from "./observationBuilder";
import type { BrowserPageSnapshot, SelectActionInput } from "./runExecutor";
import { createAiActionSelector } from "./aiActionSelector";

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_input_values_prompt",
    studyId: "study_input_values_prompt",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: { patience: 0.3 },
      edgeScore: 0.2,
      tensionSeed: "I expect forms to tell me what still needs filling out.",
      firstPersonBio: "I am methodical and double-check empty fields before submitting.",
      behaviorRules: ["Confirm required inputs are filled before clicking submit."],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Fill out the contact form.",
      goal: "Submit the form only after required fields have values.",
      startingUrl: "https://shop.example.com/contact",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "type", "finish", "wait"],
      forbiddenActions: [],
      successCriteria: ["Required contact fields are filled before submission."],
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
    url: "https://shop.example.com/contact",
    title: "Contact us",
    visibleText: "Please fill out all required fields before submitting.",
    interactiveElements: [
      {
        role: "textbox",
        label: "Full name",
        selector: "#full-name",
        value: "",
        placeholder: "Jane Smith",
      } as never,
      {
        role: "textbox",
        label: "Email",
        selector: "#email",
        value: "alex@example.com",
        placeholder: "jane@example.com",
      } as never,
    ],
    pageFingerprint: "contact",
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
    currentUrl: "https://shop.example.com/contact",
    pageTitle: "Contact us",
    visibleTextExcerpt: "Please fill out all required fields before submitting.",
    interactiveElementSummary:
      'textbox "Full name" (#full-name) [empty, placeholder: "Jane Smith"]; textbox "Email" (#email) value="alex@example.com"',
    recentActionHistory: "No prior actions recorded.",
    taskProgressSummary:
      "Step 1 of 4. Goal: Submit the form only after required fields have values. No milestones completed yet.",
    text: [
      "URL: https://shop.example.com/contact",
      "Title: Contact us",
      "Visible text: Please fill out all required fields before submitting.",
      'Interactive elements: textbox "Full name" (#full-name) [empty, placeholder: "Jane Smith"]; textbox "Email" (#email) value="alex@example.com"',
      "Recent actions: No prior actions recorded.",
      "Task progress: Step 1 of 4.",
    ].join("\n"),
    tokenCount: 49,
    truncated: false,
  };
}

function createInput(): SelectActionInput {
  return {
    request: createRequest(),
    stepIndex: 0,
    page: createPage(),
    observation: createObservation(),
    actionHistory: [],
  };
}

describe("aiActionSelector input value prompt metadata", () => {
  it("includes value and placeholder fields in the interactive elements JSON prompt", async () => {
    const generateAction = vi.fn(async (_options: { system: string; prompt: string }) => ({
      text: JSON.stringify({
        type: "type",
        selector: "#full-name",
        text: "Alex Example",
        rationale: "The full name input is empty, so it should be filled before submission.",
      }),
    }));
    const selectAction = createAiActionSelector({ generateAction });

    await selectAction(createInput());

    const [options] = generateAction.mock.calls[0]!;
    expect(options.prompt).toContain('"value": ""');
    expect(options.prompt).toContain('"placeholder": "Jane Smith"');
    expect(options.prompt).toContain('"value": "alex@example.com"');
    expect(options.prompt).toContain('"placeholder": "jane@example.com"');
  });
});
