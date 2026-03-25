import { describe, expect, it } from "vitest";
import {
  shouldCaptureAlwaysMilestone,
  shouldCaptureConditionalMilestone,
  type MilestoneStepState,
} from "./milestonePolicy";

function createStep(overrides: Partial<MilestoneStepState> = {}): MilestoneStepState {
  return {
    index: 1,
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
    branchOptions: null,
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: null,
    ...overrides,
  };
}

describe("milestonePolicy", () => {
  describe("shouldCaptureAlwaysMilestone", () => {
    it("captures the first page", () => {
      expect(shouldCaptureAlwaysMilestone(createStep({ index: 0 }))).toBe(true);
    });

    it("captures finish steps", () => {
      expect(shouldCaptureAlwaysMilestone(createStep({ action: { type: "finish" } }))).toBe(true);
    });

    it("captures abort steps", () => {
      expect(shouldCaptureAlwaysMilestone(createStep({ action: { type: "abort" } }))).toBe(true);
    });

    it("captures error steps", () => {
      expect(
        shouldCaptureAlwaysMilestone(
          createStep({
            errorMessage: "Navigation failed",
          }),
        ),
      ).toBe(true);
    });

    it("captures HTTP error steps", () => {
      expect(shouldCaptureAlwaysMilestone(createStep({ httpStatus: 500 }))).toBe(true);
    });

    it("does not capture routine mid-run steps", () => {
      expect(shouldCaptureAlwaysMilestone(createStep())).toBe(false);
    });
  });

  describe("shouldCaptureConditionalMilestone", () => {
    it("captures major branch decisions", () => {
      expect(
        shouldCaptureConditionalMilestone(
          createStep({
            isMajorBranchDecision: true,
            branchOptions: ["Continue as guest", "Sign in"],
          }),
          [],
        ),
      ).toBe(true);
    });

    it("captures branch decisions when multiple options are present", () => {
      expect(
        shouldCaptureConditionalMilestone(
          createStep({
            branchOptions: ["Use saved address", "Enter address manually"],
          }),
          [],
        ),
      ).toBe(true);
    });

    it("captures repeated loops", () => {
      const history = [
        createStep({ index: 0, url: "https://staging.example.com/home" }),
        createStep({ index: 1, url: "https://staging.example.com/cart" }),
        createStep({ index: 2, url: "https://staging.example.com/checkout" }),
      ];

      expect(
        shouldCaptureConditionalMilestone(
          createStep({ index: 3, url: "https://staging.example.com/cart" }),
          history,
        ),
      ).toBe(true);
    });

    it("captures representative dead ends", () => {
      expect(
        shouldCaptureConditionalMilestone(
          createStep({
            deadEnd: true,
          }),
          [],
        ),
      ).toBe(true);
    });

    it("does not capture routine navigation", () => {
      const history = [createStep({ index: 0, url: "https://staging.example.com/home" })];

      expect(
        shouldCaptureConditionalMilestone(
          createStep({
            index: 1,
            url: "https://staging.example.com/account",
            action: { type: "click", selector: "#profile-link" },
          }),
          history,
        ),
      ).toBe(false);
    });

    it("does not treat revisits outside the loop window as milestones", () => {
      const history = [
        createStep({ index: 0, url: "https://staging.example.com/cart" }),
        createStep({ index: 1, url: "https://staging.example.com/one" }),
        createStep({ index: 2, url: "https://staging.example.com/two" }),
        createStep({ index: 3, url: "https://staging.example.com/three" }),
        createStep({ index: 4, url: "https://staging.example.com/four" }),
        createStep({ index: 5, url: "https://staging.example.com/five" }),
      ];

      expect(
        shouldCaptureConditionalMilestone(
          createStep({ index: 6, url: "https://staging.example.com/cart" }),
          history,
          { sameUrlRevisitWindow: 5 },
        ),
      ).toBe(false);
    });
  });
});
