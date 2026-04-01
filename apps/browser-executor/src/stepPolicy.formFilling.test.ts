import { describe, expect, it } from "vitest";
import {
  detectSameUrlRevisit,
  updateFrustrationState,
  type StepSnapshot,
} from "./stepPolicy";

function createStep(overrides: Partial<StepSnapshot> = {}): StepSnapshot {
  return {
    index: 0,
    url: "https://staging.example.com/contact",
    action: {
      type: "click",
      selector: "#contact-link",
    },
    pageFingerprint: "page:contact",
    agentNotes: null,
    validationError: null,
    errorMessage: null,
    deadEnd: false,
    ...overrides,
  };
}

describe("stepPolicy same-url revisit form filling safeguards", () => {
  it.each(["type", "select", "wait"] as const)(
    "ignores %s actions when the URL stays the same",
    (actionType) => {
      const history = [createStep({ index: 0, url: "https://staging.example.com/contact" })];

      expect(
        detectSameUrlRevisit(
          createStep({
            index: 1,
            url: "https://staging.example.com/contact",
            action:
              actionType === "type"
                ? { type: actionType, selector: "#full-name" }
                : actionType === "select"
                  ? { type: actionType, selector: "#topic" }
                  : { type: actionType },
          }),
          history,
        ),
      ).toBeNull();
    },
  );

  it("only compares against prior click and goto navigation steps within the window", () => {
    const history = [
      createStep({
        index: 0,
        url: "https://staging.example.com/contact",
        action: { type: "click", selector: "#contact-link" },
      }),
      createStep({
        index: 1,
        url: "https://staging.example.com/contact",
        action: { type: "type", selector: "#full-name" },
      }),
      createStep({
        index: 2,
        url: "https://staging.example.com/contact",
        action: { type: "select", selector: "#topic" },
      }),
      createStep({
        index: 3,
        url: "https://staging.example.com/contact",
        action: { type: "wait" },
      }),
    ];

    expect(
      detectSameUrlRevisit(
        createStep({
          index: 4,
          url: "https://staging.example.com/contact",
          action: { type: "click", selector: "#submit" },
        }),
        history,
      ),
    ).toMatchObject({
      type: "same_url_revisit",
      stepIndex: 4,
      details: {
        matchingStepIndex: 0,
      },
    });
  });

  it("does not increment frustration for form-filling steps that stay on the same URL", () => {
    const result = updateFrustrationState({
      currentStep: createStep({
        index: 2,
        url: "https://staging.example.com/contact",
        action: { type: "type", selector: "#email" },
      }),
      history: [
        createStep({
          index: 0,
          url: "https://staging.example.com/contact",
          action: { type: "click", selector: "#contact-link" },
        }),
        createStep({
          index: 1,
          url: "https://staging.example.com/contact",
          action: { type: "select", selector: "#topic" },
        }),
      ],
      frustrationCount: 0,
    });

    expect(result.events).toEqual([]);
    expect(result.frustrationCount).toBe(0);
    expect(result.shouldAbort).toBe(false);
  });
});
