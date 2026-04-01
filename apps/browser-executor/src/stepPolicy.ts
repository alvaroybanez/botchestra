import type { ExecuteRunRequest } from "@botchestra/shared";

export const DEFAULT_SAME_URL_REVISIT_WINDOW = 5;
export const DEFAULT_FRUSTRATION_ABORT_THRESHOLD = 5;
const SAME_URL_REVISIT_ACTION_TYPES = ["click", "goto"] as const;

const DEFAULT_CONFUSION_KEYWORDS = [
  "confused",
  "unsure",
  "not sure",
  "don't know",
  "stuck",
  "lost",
] as const;

type ActionType = ExecuteRunRequest["taskSpec"]["allowedActions"][number];

type FrustrationEventDetailValue = string | number | boolean | readonly string[] | null;

export type StepSnapshot = {
  index: number;
  url: string;
  action: {
    type: ActionType | (string & {});
    selector?: string | null;
  };
  pageFingerprint?: string | null;
  agentNotes?: string | null;
  validationError?: string | null;
  errorMessage?: string | null;
  deadEnd?: boolean;
};

export type FrustrationEventType =
  | "same_url_revisit"
  | "repeated_action_selector"
  | "repeated_validation_error"
  | "wait_without_change"
  | "contradictory_navigation"
  | "post_step_confusion"
  | "abort_after_error"
  | "abort_after_dead_end";

export type FrustrationEvent = {
  type: FrustrationEventType;
  stepIndex: number;
  url: string;
  actionType: StepSnapshot["action"]["type"];
  message: string;
  details: Record<string, FrustrationEventDetailValue>;
};

export type FrustrationPolicy = {
  sameUrlRevisitWindow: number;
  abortThreshold: number;
  confusionKeywords: readonly string[];
};

type UpdateFrustrationStateArgs = {
  currentStep: StepSnapshot;
  history: readonly StepSnapshot[];
  frustrationCount: number;
  policy?: Partial<FrustrationPolicy>;
};

function buildEvent(
  currentStep: StepSnapshot,
  type: FrustrationEventType,
  message: string,
  details: Record<string, FrustrationEventDetailValue>,
): FrustrationEvent {
  return {
    type,
    stepIndex: currentStep.index,
    url: currentStep.url,
    actionType: currentStep.action.type,
    message,
    details,
  };
}

function getPolicy(policy: Partial<FrustrationPolicy> = {}): FrustrationPolicy {
  return {
    sameUrlRevisitWindow: policy.sameUrlRevisitWindow ?? DEFAULT_SAME_URL_REVISIT_WINDOW,
    abortThreshold: policy.abortThreshold ?? DEFAULT_FRUSTRATION_ABORT_THRESHOLD,
    confusionKeywords: policy.confusionKeywords ?? DEFAULT_CONFUSION_KEYWORDS,
  };
}

function getPreviousStep(history: readonly StepSnapshot[]) {
  return history.at(-1) ?? null;
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function fingerprintsMatch(currentStep: StepSnapshot, previousStep: StepSnapshot) {
  return Boolean(
    currentStep.pageFingerprint &&
      previousStep.pageFingerprint &&
      currentStep.pageFingerprint === previousStep.pageFingerprint,
  );
}

function isSameUrlRevisitActionType(actionType: StepSnapshot["action"]["type"]) {
  return SAME_URL_REVISIT_ACTION_TYPES.includes(
    actionType as (typeof SAME_URL_REVISIT_ACTION_TYPES)[number],
  );
}

export function detectSameUrlRevisit(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
  policy?: Partial<FrustrationPolicy>,
): FrustrationEvent | null {
  if (!isSameUrlRevisitActionType(currentStep.action.type)) {
    return null;
  }

  const { sameUrlRevisitWindow } = getPolicy(policy);
  const recentHistory = history.slice(-sameUrlRevisitWindow);
  const matchingStep = recentHistory.find(
    (step) => step.url === currentStep.url && isSameUrlRevisitActionType(step.action.type),
  );

  if (!matchingStep) {
    return null;
  }

  return buildEvent(
    currentStep,
    "same_url_revisit",
    "Current URL was revisited within the recent step window",
    {
      matchingStepIndex: matchingStep.index,
      revisitUrl: currentStep.url,
      windowSize: sameUrlRevisitWindow,
    },
  );
}

export function detectRepeatedActionSelector(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
): FrustrationEvent | null {
  const previousStep = getPreviousStep(history);
  const currentSelector = currentStep.action.selector?.trim();
  const previousSelector = previousStep?.action.selector?.trim();

  if (
    !previousStep ||
    !currentSelector ||
    !previousSelector ||
    currentStep.action.type !== previousStep.action.type ||
    currentSelector !== previousSelector ||
    !fingerprintsMatch(currentStep, previousStep)
  ) {
    return null;
  }

  return buildEvent(
    currentStep,
    "repeated_action_selector",
    "The same action and selector repeated without an observable state change",
    {
      selector: currentSelector,
      repeatedAction: currentStep.action.type,
      previousStepIndex: previousStep.index,
    },
  );
}

export function detectRepeatedValidationError(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
): FrustrationEvent | null {
  const previousStep = getPreviousStep(history);
  const currentValidationError = normalizeText(currentStep.validationError);
  const previousValidationError = normalizeText(previousStep?.validationError);

  if (!previousStep || !currentValidationError || currentValidationError !== previousValidationError) {
    return null;
  }

  return buildEvent(
    currentStep,
    "repeated_validation_error",
    "The same validation error repeated on consecutive steps",
    {
      previousStepIndex: previousStep.index,
      validationError: currentStep.validationError ?? null,
    },
  );
}

export function detectWaitWithoutChange(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
): FrustrationEvent | null {
  const previousStep = getPreviousStep(history);

  if (currentStep.action.type !== "wait" || !previousStep || !fingerprintsMatch(currentStep, previousStep)) {
    return null;
  }

  return buildEvent(
    currentStep,
    "wait_without_change",
    "The agent waited but no dynamic content change was observed",
    {
      previousStepIndex: previousStep.index,
    },
  );
}

export function detectContradictoryNavigation(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
): FrustrationEvent | null {
  const previousStep = history.at(-1);
  const stepBeforePrevious = history.at(-2);

  if (
    currentStep.action.type !== "back" ||
    !previousStep ||
    !stepBeforePrevious ||
    previousStep.action.type !== "goto" ||
    stepBeforePrevious.url !== currentStep.url
  ) {
    return null;
  }

  return buildEvent(
    currentStep,
    "contradictory_navigation",
    "A forward navigation was immediately reversed",
    {
      returnedToUrl: currentStep.url,
      previousUrl: previousStep.url,
    },
  );
}

export function detectPostStepConfusion(
  currentStep: StepSnapshot,
  policy?: Partial<FrustrationPolicy>,
): FrustrationEvent | null {
  const { confusionKeywords } = getPolicy(policy);
  const normalizedNotes = normalizeText(currentStep.agentNotes);

  if (!normalizedNotes) {
    return null;
  }

  const matchedKeywords = confusionKeywords.filter((keyword) => normalizedNotes.includes(keyword.toLowerCase()));
  if (matchedKeywords.length === 0) {
    return null;
  }

  return buildEvent(
    currentStep,
    "post_step_confusion",
    "The agent explicitly expressed confusion after the step",
    {
      matchedKeywords,
    },
  );
}

export function detectAbortAfterError(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
): FrustrationEvent | null {
  const previousStep = getPreviousStep(history);
  const triggeringError = previousStep?.errorMessage ?? previousStep?.validationError ?? null;

  if (currentStep.action.type !== "abort" || !previousStep || !triggeringError) {
    return null;
  }

  return buildEvent(
    currentStep,
    "abort_after_error",
    "The agent aborted immediately after hitting an error state",
    {
      previousStepIndex: previousStep.index,
      triggeringError,
    },
  );
}

export function detectAbortAfterDeadEnd(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
): FrustrationEvent | null {
  const previousStep = getPreviousStep(history);

  if (currentStep.action.type !== "abort" || !previousStep?.deadEnd) {
    return null;
  }

  return buildEvent(
    currentStep,
    "abort_after_dead_end",
    "The agent aborted immediately after reaching a dead end",
    {
      previousStepIndex: previousStep.index,
    },
  );
}

export function detectFrustrationEvents(
  currentStep: StepSnapshot,
  history: readonly StepSnapshot[],
  policy?: Partial<FrustrationPolicy>,
) {
  return [
    detectSameUrlRevisit(currentStep, history, policy),
    detectRepeatedActionSelector(currentStep, history),
    detectRepeatedValidationError(currentStep, history),
    detectWaitWithoutChange(currentStep, history),
    detectContradictoryNavigation(currentStep, history),
    detectPostStepConfusion(currentStep, policy),
    detectAbortAfterError(currentStep, history),
    detectAbortAfterDeadEnd(currentStep, history),
  ].filter((event): event is FrustrationEvent => event !== null);
}

export function shouldAbortForFrustration(
  frustrationCount: number,
  threshold = DEFAULT_FRUSTRATION_ABORT_THRESHOLD,
) {
  return frustrationCount >= threshold;
}

export function updateFrustrationState({
  currentStep,
  history,
  frustrationCount,
  policy,
}: UpdateFrustrationStateArgs) {
  const resolvedPolicy = getPolicy(policy);
  const events = detectFrustrationEvents(currentStep, history, resolvedPolicy);
  const nextFrustrationCount = frustrationCount + events.length;

  return {
    events,
    frustrationCount: nextFrustrationCount,
    shouldAbort: shouldAbortForFrustration(nextFrustrationCount, resolvedPolicy.abortThreshold),
  };
}
