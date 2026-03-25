import type { ExecuteRunRequest } from "@botchestra/shared";
import {
  buildObservation,
  type BuildObservationConfig,
  type ObservationActionHistoryEntry,
  type ObservationBundle,
  type ObservationInteractiveElement,
} from "./observationBuilder";
import {
  shouldCaptureAlwaysMilestone,
  shouldCaptureConditionalMilestone,
  type MilestoneStepState,
} from "./milestonePolicy";
import {
  validateAction,
  validateNavigation,
} from "./guardrails";
import {
  updateFrustrationState,
  type FrustrationPolicy,
  type StepSnapshot,
} from "./stepPolicy";

type AllowedAction = ExecuteRunRequest["taskSpec"]["allowedActions"][number];

export type AgentAction = {
  type: AllowedAction | (string & {});
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  durationMs?: number;
  rationale?: string;
};

export type BrowserPageSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  interactiveElements: readonly ObservationInteractiveElement[];
  pageFingerprint?: string | null;
  branchOptions?: readonly string[] | null;
  isMajorBranchDecision?: boolean;
  navigationError?: string | null;
  httpStatus?: number | null;
  deadEnd?: boolean;
  agentNotes?: string | null;
};

export type BrowserContextOptions = {
  locale: ExecuteRunRequest["taskSpec"]["locale"];
  viewport: ExecuteRunRequest["taskSpec"]["viewport"];
};

export type BrowserPage = {
  snapshot(): Promise<BrowserPageSnapshot>;
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  scroll(deltaY?: number): Promise<void>;
  wait(durationMs?: number): Promise<void>;
  back(): Promise<void>;
};

export type BrowserContext = {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
};

export type BrowserLike = {
  newContext(options: BrowserContextOptions): Promise<BrowserContext>;
};

export type AcquireLeaseResult =
  | {
      ok: true;
      leaseId: string;
    }
  | {
      ok: false;
      errorCode: "LEASE_UNAVAILABLE";
      message?: string;
    };

export type BrowserLeaseClient = {
  acquire(request: { runId: string; leaseTimeoutMs: number }): Promise<AcquireLeaseResult>;
  release(leaseId: string): Promise<unknown>;
};

export type RunMilestone = {
  stepIndex: number;
  url: string;
  title: string;
  actionType: string;
  rationaleShort: string;
  captureReason: "always" | "conditional";
};

export type RunExecutionSuccess = {
  ok: true;
  finalOutcome: "SUCCESS" | "ABANDONED";
  stepCount: number;
  durationSec: number;
  frustrationCount: number;
  milestones: RunMilestone[];
};

export type RunExecutionFailure = {
  ok: false;
  finalOutcome: "FAILED";
  errorCode:
    | "LEASE_UNAVAILABLE"
    | "MAX_STEPS_EXCEEDED"
    | "MAX_DURATION_EXCEEDED"
    | "GUARDRAIL_VIOLATION"
    | "BROWSER_ERROR";
  message: string;
  stepCount: number;
  durationSec: number;
  frustrationCount: number;
  milestones: RunMilestone[];
};

export type RunExecutionResult = RunExecutionSuccess | RunExecutionFailure;

export type SelectActionInput = {
  request: ExecuteRunRequest;
  stepIndex: number;
  page: BrowserPageSnapshot;
  observation: ObservationBundle;
  actionHistory: readonly ObservationActionHistoryEntry[];
};

type RunExecutorDependencies = {
  browser: BrowserLike;
  leaseClient: BrowserLeaseClient;
  selectAction(input: SelectActionInput): Promise<AgentAction>;
  now?: () => number;
  observationConfig?: Partial<BuildObservationConfig>;
  frustrationPolicy?: Partial<FrustrationPolicy>;
  onMilestone?: (milestone: RunMilestone) => Promise<void> | void;
};

const DEFAULT_OBSERVATION_TOKEN_BUDGET = 256;

function getNow(dependencies: RunExecutorDependencies) {
  return dependencies.now ?? Date.now;
}

function toDurationSec(startedAt: number, now: () => number) {
  return Math.max(0, (now() - startedAt) / 1000);
}

function failure(
  errorCode: RunExecutionFailure["errorCode"],
  message: string,
  state: {
    startedAt: number;
    now: () => number;
    stepCount: number;
    frustrationCount: number;
    milestones: RunMilestone[];
  },
): RunExecutionFailure {
  return {
    ok: false,
    finalOutcome: "FAILED",
    errorCode,
    message,
    stepCount: state.stepCount,
    durationSec: toDurationSec(state.startedAt, state.now),
    frustrationCount: state.frustrationCount,
    milestones: state.milestones,
  };
}

function success(
  finalOutcome: RunExecutionSuccess["finalOutcome"],
  state: {
    startedAt: number;
    now: () => number;
    stepCount: number;
    frustrationCount: number;
    milestones: RunMilestone[];
  },
): RunExecutionSuccess {
  return {
    ok: true,
    finalOutcome,
    stepCount: state.stepCount,
    durationSec: toDurationSec(state.startedAt, state.now),
    frustrationCount: state.frustrationCount,
    milestones: state.milestones,
  };
}

function getObservationConfig(config: Partial<BuildObservationConfig> | undefined): BuildObservationConfig {
  return {
    tokenBudget: config?.tokenBudget ?? DEFAULT_OBSERVATION_TOKEN_BUDGET,
    maxInteractiveElements: config?.maxInteractiveElements,
    maxActionHistory: config?.maxActionHistory,
  };
}

function getCompletedMilestones(milestones: readonly RunMilestone[]) {
  return milestones.map((milestone) => `${milestone.actionType} @ step ${milestone.stepIndex + 1}`);
}

function toActionHistoryEntry(stepIndex: number, action: AgentAction): ObservationActionHistoryEntry {
  return {
    stepIndex,
    actionType: action.type,
    target: action.url ?? action.selector ?? action.value ?? null,
    outcome: action.rationale ?? null,
  };
}

function toStepState(stepIndex: number, action: AgentAction, page: BrowserPageSnapshot): MilestoneStepState {
  return {
    index: stepIndex,
    url: page.url,
    action: {
      type: action.type,
      selector: action.selector ?? null,
    },
    pageFingerprint: page.pageFingerprint ?? null,
    agentNotes: page.agentNotes ?? action.rationale ?? null,
    validationError: null,
    errorMessage: null,
    deadEnd: page.deadEnd ?? false,
    branchOptions: page.branchOptions ?? [],
    isMajorBranchDecision: page.isMajorBranchDecision ?? false,
    navigationError: page.navigationError ?? null,
    httpStatus: page.httpStatus ?? null,
  };
}

function isActionAllowed(actionType: string, allowedActions: readonly AllowedAction[]) {
  return allowedActions.includes(actionType as AllowedAction);
}

function getRequiredString(value: string | undefined, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  return value;
}

async function executeAction(page: BrowserPage, action: AgentAction) {
  switch (action.type) {
    case "goto":
      return page.goto(getRequiredString(action.url, "action.url"));
    case "click":
      return page.click(getRequiredString(action.selector, "action.selector"));
    case "type":
      return page.type(
        getRequiredString(action.selector, "action.selector"),
        getRequiredString(action.text, "action.text"),
      );
    case "select":
      return page.select(
        getRequiredString(action.selector, "action.selector"),
        getRequiredString(action.value, "action.value"),
      );
    case "scroll":
      return page.scroll(action.durationMs ?? 0);
    case "wait":
      return page.wait(action.durationMs ?? 0);
    case "back":
      return page.back();
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

async function maybeCaptureMilestone(
  dependencies: RunExecutorDependencies,
  stepState: MilestoneStepState,
  pageTitle: string,
  history: readonly StepSnapshot[],
  milestones: RunMilestone[],
) {
  const captureReason = shouldCaptureAlwaysMilestone(stepState)
    ? "always"
    : shouldCaptureConditionalMilestone(stepState, history, dependencies.frustrationPolicy)
      ? "conditional"
      : null;

  if (!captureReason) {
    return;
  }

  const milestone: RunMilestone = {
    stepIndex: stepState.index,
    url: stepState.url,
    title: pageTitle,
    actionType: stepState.action.type,
    rationaleShort: stepState.agentNotes ?? `Executed ${stepState.action.type}`,
    captureReason,
  };

  milestones.push(milestone);
  await dependencies.onMilestone?.(milestone);
}

function hasExceededMaxDuration(
  request: ExecuteRunRequest,
  startedAt: number,
  now: () => number,
) {
  return now() - startedAt > request.taskSpec.maxDurationSec * 1000;
}

export function createRunExecutor(dependencies: RunExecutorDependencies) {
  const now = getNow(dependencies);

  return {
    async execute(request: ExecuteRunRequest): Promise<RunExecutionResult> {
      const startedAt = now();
      const milestones: RunMilestone[] = [];
      const history: StepSnapshot[] = [];
      const actionHistory: ObservationActionHistoryEntry[] = [];
      let frustrationCount = 0;
      let stepCount = 0;
      let leaseId: string | null = null;
      let context: BrowserContext | null = null;

      try {
        const lease = await dependencies.leaseClient.acquire({
          runId: request.runId,
          leaseTimeoutMs: Math.ceil(request.taskSpec.maxDurationSec * 1000),
        });

        if (!lease.ok) {
          return failure(lease.errorCode, lease.message ?? "Browser lease unavailable", {
            startedAt,
            now,
            stepCount,
            frustrationCount,
            milestones,
          });
        }

        leaseId = lease.leaseId;
        context = await dependencies.browser.newContext({
          locale: request.taskSpec.locale,
          viewport: request.taskSpec.viewport,
        });

        const page = await context.newPage();
        const startingNavigation = validateNavigation(
          request.taskSpec.startingUrl,
          request.taskSpec.allowedDomains,
        );

        if (!startingNavigation.ok) {
          return failure("GUARDRAIL_VIOLATION", startingNavigation.message, {
            startedAt,
            now,
            stepCount,
            frustrationCount,
            milestones,
          });
        }

        await page.goto(request.taskSpec.startingUrl);

        while (stepCount < request.taskSpec.maxSteps) {
          if (hasExceededMaxDuration(request, startedAt, now)) {
            return failure("MAX_DURATION_EXCEEDED", "Run exceeded the configured duration limit", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            });
          }

          const pageSnapshot = await page.snapshot();
          const observation = buildObservation(
            {
              url: pageSnapshot.url,
              title: pageSnapshot.title,
              visibleText: pageSnapshot.visibleText,
              interactiveElements: pageSnapshot.interactiveElements,
              actionHistory,
              progress: {
                currentStep: stepCount,
                maxSteps: request.taskSpec.maxSteps,
                goal: request.taskSpec.goal,
                completedMilestones: getCompletedMilestones(milestones),
                nextMilestone: null,
              },
            },
            getObservationConfig(dependencies.observationConfig),
          );

          const action = await dependencies.selectAction({
            request,
            stepIndex: stepCount,
            page: pageSnapshot,
            observation,
            actionHistory,
          });

          if (!isActionAllowed(action.type, request.taskSpec.allowedActions)) {
            return failure("GUARDRAIL_VIOLATION", `Action ${action.type} is not allowed for this task`, {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            });
          }

          const actionValidation = validateAction(action.type, request.taskSpec.forbiddenActions);
          if (!actionValidation.ok) {
            return failure("GUARDRAIL_VIOLATION", actionValidation.message, {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            });
          }

          if (action.type === "goto") {
            const navigationValidation = validateNavigation(
              getRequiredString(action.url, "action.url"),
              request.taskSpec.allowedDomains,
            );

            if (!navigationValidation.ok) {
              return failure("GUARDRAIL_VIOLATION", navigationValidation.message, {
                startedAt,
                now,
                stepCount,
                frustrationCount,
                milestones,
              });
            }
          }

          if (action.type === "finish" || action.type === "abort") {
            const terminalStepState = toStepState(stepCount, action, pageSnapshot);
            await maybeCaptureMilestone(
              dependencies,
              terminalStepState,
              pageSnapshot.title,
              history,
              milestones,
            );
            actionHistory.push(toActionHistoryEntry(stepCount, action));
            stepCount += 1;

            return success(action.type === "finish" ? "SUCCESS" : "ABANDONED", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            });
          }

          await executeAction(page, action);

          if (hasExceededMaxDuration(request, startedAt, now)) {
            return failure("MAX_DURATION_EXCEEDED", "Run exceeded the configured duration limit", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            });
          }

          const nextPageSnapshot = await page.snapshot();
          const stepState = toStepState(stepCount, action, nextPageSnapshot);
          await maybeCaptureMilestone(
            dependencies,
            stepState,
            nextPageSnapshot.title,
            history,
            milestones,
          );
          actionHistory.push(toActionHistoryEntry(stepCount, action));

          const frustrationState = updateFrustrationState({
            currentStep: stepState,
            history,
            frustrationCount,
            policy: dependencies.frustrationPolicy,
          });

          frustrationCount = frustrationState.frustrationCount;
          history.push(stepState);
          stepCount += 1;

          if (frustrationState.shouldAbort) {
            return success("ABANDONED", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            });
          }
        }

        return failure("MAX_STEPS_EXCEEDED", "Run exceeded the configured maximum step count", {
          startedAt,
          now,
          stepCount,
          frustrationCount,
          milestones,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown browser execution error";

        return failure("BROWSER_ERROR", message, {
          startedAt,
          now,
          stepCount,
          frustrationCount,
          milestones,
        });
      } finally {
        await context?.close();

        if (leaseId) {
          await dependencies.leaseClient.release(leaseId);
        }
      }
    },
  };
}
