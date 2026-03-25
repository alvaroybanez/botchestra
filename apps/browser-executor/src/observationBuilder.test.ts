import { describe, expect, it } from "vitest";
import { buildObservation } from "./observationBuilder";

function createPageState() {
  return {
    url: "https://staging.example.com/checkout",
    title: "Checkout - Shipping",
    visibleText:
      "Checkout Shipping address Contact information Continue to payment Review your cart Shipping options Standard delivery arrives tomorrow.",
    interactiveElements: [
      { role: "button", label: "Continue to payment", selector: "#continue" },
      { role: "link", label: "Return to cart", selector: "a[href='/cart']" },
      { role: "textbox", label: "Address line 1", selector: "#address-line-1" },
    ],
    actionHistory: [
      {
        stepIndex: 0,
        actionType: "goto",
        target: "https://staging.example.com/cart",
        outcome: "Cart page loaded",
      },
      {
        stepIndex: 1,
        actionType: "click",
        target: "#checkout",
        outcome: "Navigated to checkout",
      },
    ],
    progress: {
      currentStep: 2,
      maxSteps: 8,
      goal: "Complete checkout using the saved payment method",
      completedMilestones: ["Opened cart", "Reached checkout"],
      nextMilestone: "Submit shipping details",
    },
  };
}

describe("buildObservation", () => {
  it("truncates visible text to fit the token budget while preserving a coherent prefix", () => {
    const visibleText = Array.from({ length: 120 }, (_, index) => `token${index + 1}`).join(" ");

    const observation = buildObservation(
      {
        ...createPageState(),
        visibleText,
      },
      { tokenBudget: 60 },
    );

    expect(observation.tokenCount).toBeLessThanOrEqual(60);
    expect(observation.truncated).toBe(true);
    expect(observation.visibleTextExcerpt).toMatch(/^token1 token2 token3/);
    expect(observation.visibleTextExcerpt.endsWith("…")).toBe(true);
    expect(observation.visibleTextExcerpt).not.toContain("token120");
  });

  it("includes all required context fields and keeps them non-empty", () => {
    const observation = buildObservation(createPageState(), { tokenBudget: 200 });

    expect(observation.currentUrl).toBe("https://staging.example.com/checkout");
    expect(observation.pageTitle).toBe("Checkout - Shipping");
    expect(observation.visibleTextExcerpt.length).toBeGreaterThan(0);
    expect(observation.interactiveElementSummary.length).toBeGreaterThan(0);
    expect(observation.recentActionHistory.length).toBeGreaterThan(0);
    expect(observation.taskProgressSummary.length).toBeGreaterThan(0);

    expect(observation.text).toContain("URL: https://staging.example.com/checkout");
    expect(observation.text).toContain("Title: Checkout - Shipping");
    expect(observation.text).toContain("Visible text:");
    expect(observation.text).toContain("Interactive elements:");
    expect(observation.text).toContain("Recent actions:");
    expect(observation.text).toContain("Task progress:");
  });

  it("falls back to readable placeholders when there are no interactive elements or prior actions", () => {
    const observation = buildObservation(
      {
        ...createPageState(),
        interactiveElements: [],
        actionHistory: [],
        progress: {
          currentStep: 0,
          maxSteps: 5,
          goal: "Find the support contact form",
        },
      },
      { tokenBudget: 120 },
    );

    expect(observation.interactiveElementSummary).toBe("No interactive elements detected.");
    expect(observation.recentActionHistory).toBe("No prior actions recorded.");
    expect(observation.taskProgressSummary).toContain("No milestones completed yet.");
  });
});
