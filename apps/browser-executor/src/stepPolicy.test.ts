import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRUSTRATION_ABORT_THRESHOLD,
  DEFAULT_SAME_URL_REVISIT_WINDOW,
  detectAbortAfterDeadEnd,
  detectAbortAfterError,
  detectContradictoryNavigation,
  detectFrustrationEvents,
  detectPostStepConfusion,
  detectRepeatedActionSelector,
  detectRepeatedValidationError,
  detectSameUrlRevisit,
  detectWaitWithoutChange,
  shouldAbortForFrustration,
  updateFrustrationState,
  type StepSnapshot,
} from "./stepPolicy";

function createStep(overrides: Partial<StepSnapshot> = {}): StepSnapshot {
  return {
    index: 0,
    url: "https://staging.example.com/start",
    action: {
      type: "click",
      selector: "#continue",
    },
    pageFingerprint: "page:start",
    agentNotes: null,
    validationError: null,
    errorMessage: null,
    deadEnd: false,
    ...overrides,
  };
}

describe("stepPolicy frustration detectors", () => {
  describe("detectSameUrlRevisit", () => {
    it("returns a structured event when the same URL is revisited within the configurable window", () => {
      const history = [
        createStep({ index: 0, url: "https://staging.example.com/home" }),
        createStep({ index: 1, url: "https://staging.example.com/cart" }),
        createStep({ index: 2, url: "https://staging.example.com/checkout" }),
        createStep({ index: 3, url: "https://staging.example.com/cart" }),
      ];

      expect(
        detectSameUrlRevisit(
          createStep({ index: 4, url: "https://staging.example.com/checkout" }),
          history,
        ),
      ).toEqual({
        type: "same_url_revisit",
        stepIndex: 4,
        url: "https://staging.example.com/checkout",
        actionType: "click",
        message: "Current URL was revisited within the recent step window",
        details: {
          matchingStepIndex: 2,
          revisitUrl: "https://staging.example.com/checkout",
          windowSize: DEFAULT_SAME_URL_REVISIT_WINDOW,
        },
      });
    });

    it("returns null when the URL match falls outside the configured window", () => {
      const history = [
        createStep({ index: 0, url: "https://staging.example.com/checkout" }),
        createStep({ index: 1, url: "https://staging.example.com/one" }),
        createStep({ index: 2, url: "https://staging.example.com/two" }),
        createStep({ index: 3, url: "https://staging.example.com/three" }),
        createStep({ index: 4, url: "https://staging.example.com/four" }),
        createStep({ index: 5, url: "https://staging.example.com/five" }),
      ];

      expect(
        detectSameUrlRevisit(
          createStep({ index: 6, url: "https://staging.example.com/checkout" }),
          history,
          { sameUrlRevisitWindow: 5 },
        ),
      ).toBeNull();
    });
  });

  describe("detectRepeatedActionSelector", () => {
    it("returns a structured event when the same action and selector repeat without a page change", () => {
      const previous = createStep({
        index: 0,
        action: { type: "click", selector: "#submit" },
        pageFingerprint: "page:checkout:error",
      });

      expect(
        detectRepeatedActionSelector(
          createStep({
            index: 1,
            action: { type: "click", selector: "#submit" },
            pageFingerprint: "page:checkout:error",
          }),
          [previous],
        ),
      ).toEqual({
        type: "repeated_action_selector",
        stepIndex: 1,
        url: "https://staging.example.com/start",
        actionType: "click",
        message: "The same action and selector repeated without an observable state change",
        details: {
          selector: "#submit",
          repeatedAction: "click",
          previousStepIndex: 0,
        },
      });
    });

    it("returns null when the page fingerprint changes between repeated actions", () => {
      const previous = createStep({
        index: 0,
        action: { type: "click", selector: "#submit" },
        pageFingerprint: "page:checkout:error",
      });

      expect(
        detectRepeatedActionSelector(
          createStep({
            index: 1,
            action: { type: "click", selector: "#submit" },
            pageFingerprint: "page:checkout:success",
          }),
          [previous],
        ),
      ).toBeNull();
    });
  });

  it("returns a structured event for repeated validation errors on consecutive steps", () => {
    expect(
      detectRepeatedValidationError(
        createStep({ index: 2, validationError: "Email is required" }),
        [createStep({ index: 1, validationError: "Email is required" })],
      ),
    ).toEqual({
      type: "repeated_validation_error",
      stepIndex: 2,
      url: "https://staging.example.com/start",
      actionType: "click",
      message: "The same validation error repeated on consecutive steps",
      details: {
        previousStepIndex: 1,
        validationError: "Email is required",
      },
    });
  });

  it("returns a structured event for waiting without any observed page change", () => {
    expect(
      detectWaitWithoutChange(
        createStep({
          index: 3,
          action: { type: "wait" },
          pageFingerprint: "page:loading",
        }),
        [
          createStep({
            index: 2,
            action: { type: "scroll" },
            pageFingerprint: "page:loading",
          }),
        ],
      ),
    ).toEqual({
      type: "wait_without_change",
      stepIndex: 3,
      url: "https://staging.example.com/start",
      actionType: "wait",
      message: "The agent waited but no dynamic content change was observed",
      details: {
        previousStepIndex: 2,
      },
    });
  });

  it("returns a structured event for contradictory navigation when a goto is immediately followed by back", () => {
    const history = [
      createStep({ index: 0, url: "https://staging.example.com/account" }),
      createStep({
        index: 1,
        url: "https://staging.example.com/help",
        action: { type: "goto" },
      }),
    ];

    expect(
      detectContradictoryNavigation(
        createStep({
          index: 2,
          url: "https://staging.example.com/account",
          action: { type: "back" },
        }),
        history,
      ),
    ).toEqual({
      type: "contradictory_navigation",
      stepIndex: 2,
      url: "https://staging.example.com/account",
      actionType: "back",
      message: "A forward navigation was immediately reversed",
      details: {
        returnedToUrl: "https://staging.example.com/account",
        previousUrl: "https://staging.example.com/help",
      },
    });
  });

  it("returns a structured event when the agent notes indicate confusion", () => {
    expect(
      detectPostStepConfusion(
        createStep({
          index: 4,
          agentNotes: "I am confused and not sure what to do next from here.",
        }),
      ),
    ).toEqual({
      type: "post_step_confusion",
      stepIndex: 4,
      url: "https://staging.example.com/start",
      actionType: "click",
      message: "The agent explicitly expressed confusion after the step",
      details: {
        matchedKeywords: ["confused", "not sure"],
      },
    });
  });

  it("returns a structured event for aborting immediately after an error message", () => {
    expect(
      detectAbortAfterError(
        createStep({ index: 5, action: { type: "abort" } }),
        [
          createStep({
            index: 4,
            errorMessage: "The server could not complete your request",
          }),
        ],
      ),
    ).toEqual({
      type: "abort_after_error",
      stepIndex: 5,
      url: "https://staging.example.com/start",
      actionType: "abort",
      message: "The agent aborted immediately after hitting an error state",
      details: {
        previousStepIndex: 4,
        triggeringError: "The server could not complete your request",
      },
    });
  });

  it("returns a structured event for aborting immediately after a dead end", () => {
    expect(
      detectAbortAfterDeadEnd(
        createStep({ index: 6, action: { type: "abort" } }),
        [createStep({ index: 5, deadEnd: true })],
      ),
    ).toEqual({
      type: "abort_after_dead_end",
      stepIndex: 6,
      url: "https://staging.example.com/start",
      actionType: "abort",
      message: "The agent aborted immediately after reaching a dead end",
      details: {
        previousStepIndex: 5,
      },
    });
  });

  it("aggregates all detector outputs into structured frustration events", () => {
    const history = [
      createStep({ index: 0, url: "https://staging.example.com/checkout" }),
      createStep({
        index: 1,
        url: "https://staging.example.com/error",
        action: { type: "goto" },
        pageFingerprint: "page:error",
        validationError: "Email is required",
        errorMessage: "Email is required",
        deadEnd: true,
      }),
    ];

    const current = createStep({
      index: 2,
      url: "https://staging.example.com/checkout",
      action: { type: "abort" },
      pageFingerprint: "page:error",
      agentNotes: "I'm stuck and confused.",
      validationError: "Email is required",
    });

    expect(detectFrustrationEvents(current, history).map((event) => event.type)).toEqual([
      "same_url_revisit",
      "repeated_validation_error",
      "post_step_confusion",
      "abort_after_error",
      "abort_after_dead_end",
    ]);
  });
});

describe("stepPolicy abort threshold", () => {
  it("continues below the default threshold and abandons at the threshold", () => {
    expect(shouldAbortForFrustration(DEFAULT_FRUSTRATION_ABORT_THRESHOLD - 1)).toBe(false);
    expect(shouldAbortForFrustration(DEFAULT_FRUSTRATION_ABORT_THRESHOLD)).toBe(true);
  });

  it("updates the frustration count using detected events and honors a configurable threshold", () => {
    const result = updateFrustrationState({
      currentStep: createStep({
        index: 3,
        url: "https://staging.example.com/error",
        action: { type: "click", selector: "#submit" },
        pageFingerprint: "page:error",
      }),
      history: [
        createStep({
          index: 2,
          url: "https://staging.example.com/checkout",
          action: { type: "click", selector: "#submit" },
          pageFingerprint: "page:error",
        }),
      ],
      frustrationCount: 2,
      policy: {
        abortThreshold: 3,
      },
    });

    expect(result.events.map((event) => event.type)).toEqual(["repeated_action_selector"]);
    expect(result.frustrationCount).toBe(3);
    expect(result.shouldAbort).toBe(true);
  });
});
