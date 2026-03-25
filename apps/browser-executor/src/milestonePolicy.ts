import type { FrustrationPolicy, StepSnapshot } from "./stepPolicy";
import { detectSameUrlRevisit } from "./stepPolicy";

export type MilestoneStepState = StepSnapshot & {
  branchOptions?: readonly string[] | null;
  isMajorBranchDecision?: boolean;
  navigationError?: string | null;
  httpStatus?: number | null;
};

function hasNonEmptyText(value?: string | null) {
  return Boolean(value?.trim());
}

function hasStepError(stepState: MilestoneStepState) {
  return (
    hasNonEmptyText(stepState.errorMessage) ||
    hasNonEmptyText(stepState.validationError) ||
    hasNonEmptyText(stepState.navigationError) ||
    (typeof stepState.httpStatus === "number" && stepState.httpStatus >= 400)
  );
}

function hasMultipleBranchOptions(stepState: MilestoneStepState) {
  return (stepState.branchOptions?.filter((option) => option.trim().length > 0).length ?? 0) >= 2;
}

function isBranchDecision(stepState: MilestoneStepState) {
  return stepState.isMajorBranchDecision === true || hasMultipleBranchOptions(stepState);
}

export function shouldCaptureAlwaysMilestone(stepState: MilestoneStepState) {
  return (
    stepState.index === 0 ||
    stepState.action.type === "finish" ||
    stepState.action.type === "abort" ||
    hasStepError(stepState)
  );
}

export function shouldCaptureConditionalMilestone(
  stepState: MilestoneStepState,
  history: readonly StepSnapshot[],
  policy?: Partial<FrustrationPolicy>,
) {
  return (
    isBranchDecision(stepState) ||
    detectSameUrlRevisit(stepState, history, policy) !== null ||
    stepState.deadEnd === true
  );
}
