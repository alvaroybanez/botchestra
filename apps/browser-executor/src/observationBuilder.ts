import type { ExecuteRunRequest } from "@botchestra/shared";

type AllowedAction = ExecuteRunRequest["taskSpec"]["allowedActions"][number];

export type ObservationInteractiveElement = {
  role: string;
  label: string;
  selector?: string | null;
  href?: string | null;
  hint?: string | null;
  disabled?: boolean;
};

export type ObservationActionHistoryEntry = {
  stepIndex: number;
  actionType: AllowedAction | (string & {});
  target?: string | null;
  outcome?: string | null;
};

export type ObservationProgress = {
  currentStep: number;
  maxSteps: number;
  goal: string;
  completedMilestones?: readonly string[];
  nextMilestone?: string | null;
};

export type ObservationPageState = {
  url: string;
  title: string;
  visibleText: string;
  interactiveElements: readonly ObservationInteractiveElement[];
  actionHistory: readonly ObservationActionHistoryEntry[];
  progress: ObservationProgress;
};

export type BuildObservationConfig = {
  tokenBudget: number;
  maxInteractiveElements?: number;
  maxActionHistory?: number;
};

export type ObservationBundle = {
  currentUrl: string;
  pageTitle: string;
  visibleTextExcerpt: string;
  interactiveElementSummary: string;
  recentActionHistory: string;
  taskProgressSummary: string;
  text: string;
  tokenCount: number;
  truncated: boolean;
};

const DEFAULT_MAX_INTERACTIVE_ELEMENTS = 20;
const DEFAULT_MAX_ACTION_HISTORY = 5;
const DEFAULT_VISIBLE_TEXT_PLACEHOLDER = "Visible text omitted to fit the token budget.";

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function tokenize(value: string) {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.split(" ") : [];
}

function estimateTokenCount(value: string) {
  return tokenize(value).length;
}

function truncateToTokenBudget(value: string, tokenBudget: number) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || tokenBudget <= 0) {
    return "";
  }

  const tokens = normalized.split(" ");
  if (tokens.length <= tokenBudget) {
    return normalized;
  }

  if (tokenBudget === 1) {
    return "…";
  }

  return `${tokens.slice(0, tokenBudget - 1).join(" ")} …`;
}

function summarizeInteractiveElements(
  interactiveElements: readonly ObservationInteractiveElement[],
  maxInteractiveElements: number,
) {
  if (interactiveElements.length === 0) {
    return "No interactive elements detected.";
  }

  const summarizedElements = interactiveElements.slice(0, maxInteractiveElements).map((element) => {
    const label = normalizeWhitespace(element.label || "Unlabeled element");
    const selector = element.selector ? ` (${normalizeWhitespace(element.selector)})` : "";
    const href = element.href ? ` → ${normalizeWhitespace(element.href)}` : "";
    const hint = element.hint ? ` — ${normalizeWhitespace(element.hint)}` : "";
    const disabled = element.disabled ? " [disabled]" : "";

    return `${element.role} "${label}"${selector}${href}${disabled}${hint}`;
  });

  const remainingCount = interactiveElements.length - summarizedElements.length;
  if (remainingCount > 0) {
    summarizedElements.push(`+${remainingCount} more`);
  }

  return summarizedElements.join("; ");
}

function summarizeActionHistory(
  actionHistory: readonly ObservationActionHistoryEntry[],
  maxActionHistory: number,
) {
  if (actionHistory.length === 0) {
    return "No prior actions recorded.";
  }

  return actionHistory
    .slice(-maxActionHistory)
    .map((entry) => {
      const target = entry.target ? ` ${normalizeWhitespace(entry.target)}` : "";
      const outcome = entry.outcome ? ` → ${normalizeWhitespace(entry.outcome)}` : "";
      return `#${entry.stepIndex + 1} ${entry.actionType}${target}${outcome}`;
    })
    .join("; ");
}

function summarizeProgress(progress: ObservationProgress) {
  const summaryParts = [
    `Step ${progress.currentStep + 1} of ${progress.maxSteps}.`,
    `Goal: ${normalizeWhitespace(progress.goal)}.`,
  ];

  if (progress.completedMilestones && progress.completedMilestones.length > 0) {
    summaryParts.push(`Completed: ${progress.completedMilestones.map(normalizeWhitespace).join(", ")}.`);
  } else {
    summaryParts.push("No milestones completed yet.");
  }

  if (progress.nextMilestone) {
    summaryParts.push(`Next: ${normalizeWhitespace(progress.nextMilestone)}.`);
  }

  return summaryParts.join(" ");
}

function buildObservationText(bundle: Omit<ObservationBundle, "text" | "tokenCount" | "truncated">) {
  return [
    `URL: ${bundle.currentUrl}`,
    `Title: ${bundle.pageTitle}`,
    `Visible text: ${bundle.visibleTextExcerpt}`,
    `Interactive elements: ${bundle.interactiveElementSummary}`,
    `Recent actions: ${bundle.recentActionHistory}`,
    `Task progress: ${bundle.taskProgressSummary}`,
  ].join("\n");
}

export function buildObservation(
  pageState: ObservationPageState,
  config: BuildObservationConfig,
): ObservationBundle {
  if (!Number.isFinite(config.tokenBudget) || config.tokenBudget <= 0) {
    throw new RangeError("tokenBudget must be a positive number");
  }

  const maxInteractiveElements = config.maxInteractiveElements ?? DEFAULT_MAX_INTERACTIVE_ELEMENTS;
  const maxActionHistory = config.maxActionHistory ?? DEFAULT_MAX_ACTION_HISTORY;

  const interactiveElementSummary = summarizeInteractiveElements(
    pageState.interactiveElements,
    maxInteractiveElements,
  );
  const recentActionHistory = summarizeActionHistory(pageState.actionHistory, maxActionHistory);
  const taskProgressSummary = summarizeProgress(pageState.progress);

  const baseBundle = {
    currentUrl: normalizeWhitespace(pageState.url),
    pageTitle: normalizeWhitespace(pageState.title),
    visibleTextExcerpt: "",
    interactiveElementSummary,
    recentActionHistory,
    taskProgressSummary,
  };

  const textWithoutVisibleText = buildObservationText({
    ...baseBundle,
    visibleTextExcerpt: "",
  });
  const remainingVisibleTextBudget = config.tokenBudget - estimateTokenCount(textWithoutVisibleText);

  const visibleTextExcerpt =
    truncateToTokenBudget(pageState.visibleText, Math.max(4, remainingVisibleTextBudget)) ||
    DEFAULT_VISIBLE_TEXT_PLACEHOLDER;

  const unboundedText = buildObservationText({
    ...baseBundle,
    visibleTextExcerpt,
  });
  const text = truncateToTokenBudget(unboundedText, config.tokenBudget) || "Observation unavailable.";

  return {
    ...baseBundle,
    visibleTextExcerpt,
    text,
    tokenCount: estimateTokenCount(text),
    truncated:
      visibleTextExcerpt !== normalizeWhitespace(pageState.visibleText) || text !== normalizeWhitespace(unboundedText),
  };
}
