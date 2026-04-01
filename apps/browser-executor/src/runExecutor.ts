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
  isActionAllowed,
  toGuardrailRuleCode,
  validateNavigation,
  type GuardrailRuleCode,
} from "./guardrails";
import {
  updateFrustrationState,
  type FrustrationPolicy,
  type StepSnapshot,
} from "./stepPolicy";
import {
  getErrorMessage,
  logStructured,
  logStructuredError,
} from "./structuredLogger";

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

export type BrowserScreenshotOptions = {
  type: "jpeg";
  quality: number;
};

export type BrowserPage = {
  snapshot(): Promise<BrowserPageSnapshot>;
  screenshot(options?: BrowserScreenshotOptions): Promise<Uint8Array>;
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
  guardrailCode?: GuardrailRuleCode;
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
  sendHeartbeat?: () => Promise<boolean> | boolean;
  now?: () => number;
  observationConfig?: Partial<BuildObservationConfig>;
  frustrationPolicy?: Partial<FrustrationPolicy>;
  onMilestone?: (milestone: RunMilestone, screenshot: Uint8Array) => Promise<unknown> | unknown;
};

const DEFAULT_OBSERVATION_TOKEN_BUDGET = 256;
const JPEG_SCREENSHOT_OPTIONS: BrowserScreenshotOptions = {
  type: "jpeg",
  quality: 80,
};

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
  details: Pick<RunExecutionFailure, "guardrailCode"> = {},
): RunExecutionFailure {
  return {
    ok: false,
    finalOutcome: "FAILED",
    errorCode,
    message,
    ...(details.guardrailCode !== undefined
      ? { guardrailCode: details.guardrailCode }
      : {}),
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
  return milestones
    .filter((milestone) => milestone.actionType !== "start")
    .map((milestone) => `${milestone.actionType} @ step ${milestone.stepIndex + 1}`);
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
  page: BrowserPage,
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

  await captureMilestone(dependencies, page, milestone, milestones);
}

async function captureMilestone(
  dependencies: RunExecutorDependencies,
  page: BrowserPage,
  milestone: RunMilestone,
  milestones: RunMilestone[],
) {
  milestones.push(milestone);

  if (!dependencies.onMilestone) {
    return;
  }

  const screenshot = await page.screenshot(JPEG_SCREENSHOT_OPTIONS);
  await dependencies.onMilestone(milestone, screenshot);
}

async function getLatestSnapshot(
  page: BrowserPage,
  fallbackSnapshot: BrowserPageSnapshot | null,
  runId: string,
) {
  try {
    return await page.snapshot();
  } catch (error) {
    logStructuredError("run.snapshot.error", runId, error);
    return fallbackSnapshot;
  }
}

async function captureTerminalMilestone(
  dependencies: RunExecutorDependencies,
  page: BrowserPage | null,
  milestones: RunMilestone[],
  fallbackSnapshot: BrowserPageSnapshot | null,
  runId: string,
  milestone: Pick<RunMilestone, "stepIndex" | "actionType" | "rationaleShort">,
) {
  if (!page) {
    return;
  }

  try {
    const snapshot = await getLatestSnapshot(page, fallbackSnapshot, runId);

    if (!snapshot) {
      return;
    }

    await captureMilestone(
      dependencies,
      page,
      {
        stepIndex: milestone.stepIndex,
        url: snapshot.url,
        title: snapshot.title,
        actionType: milestone.actionType,
        rationaleShort: milestone.rationaleShort,
        captureReason: "always",
      },
      milestones,
    );
  } catch (error) {
    logStructuredError("run.milestone.error", runId, error, {
      step: milestone.stepIndex,
      actionType: milestone.actionType,
    });
    // Preserve the original terminal result if evidence capture fails.
  }
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
      let page: BrowserPage | null = null;
      let lastPageSnapshot: BrowserPageSnapshot | null = null;
      const finishRun = <TResult extends RunExecutionResult>(
        result: TResult,
        exitReason: string,
      ) => {
        logStructured("run.end", request.runId, {
          outcome: result.finalOutcome,
          stepCount: result.stepCount,
          durationSec: result.durationSec,
          frustrationCount: result.frustrationCount,
          exitReason,
        });
        return result;
      };

      logStructured("run.start", request.runId, {
        personaVariantId: request.personaVariant.id,
        startingUrl: request.taskSpec.startingUrl,
        maxSteps: request.taskSpec.maxSteps,
        maxDurationSec: request.taskSpec.maxDurationSec,
      });

      try {
        const lease = await dependencies.leaseClient.acquire({
          runId: request.runId,
          leaseTimeoutMs: Math.ceil(request.taskSpec.maxDurationSec * 1000),
        });
        logStructured("run.lease", request.runId, lease.ok
          ? {
              success: true,
              leaseId: lease.leaseId,
            }
          : {
              success: false,
              errorCode: lease.errorCode,
              message: lease.message ?? "Browser lease unavailable",
            });

        if (!lease.ok) {
          return finishRun(failure(lease.errorCode, lease.message ?? "Browser lease unavailable", {
            startedAt,
            now,
            stepCount,
            frustrationCount,
            milestones,
          }), "lease_unavailable");
        }

        leaseId = lease.leaseId;
        context = await dependencies.browser.newContext({
          locale: request.taskSpec.locale,
          viewport: request.taskSpec.viewport,
        });

        page = await context.newPage();
        const startingNavigation = validateNavigation(
          request.taskSpec.startingUrl,
          request.taskSpec.allowedDomains,
        );

        if (!startingNavigation.ok) {
          await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
            stepIndex: stepCount,
            actionType: "guardrail_violation",
            rationaleShort: startingNavigation.message,
          });
          return finishRun(failure("GUARDRAIL_VIOLATION", startingNavigation.message, {
            startedAt,
            now,
            stepCount,
            frustrationCount,
            milestones,
          }, {
            guardrailCode: toGuardrailRuleCode(startingNavigation.code),
          }), "starting_url_guardrail_violation");
        }

        await page.goto(request.taskSpec.startingUrl);
        lastPageSnapshot = await page.snapshot();
        await captureMilestone(
          dependencies,
          page,
          {
            stepIndex: stepCount,
            url: lastPageSnapshot.url,
            title: lastPageSnapshot.title,
            actionType: "start",
            rationaleShort: "Loaded the starting page.",
            captureReason: "always",
          },
          milestones,
        );

        while (stepCount < request.taskSpec.maxSteps) {
          if (hasExceededMaxDuration(request, startedAt, now)) {
            await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
              stepIndex: stepCount,
              actionType: "max_duration_exceeded",
              rationaleShort: "Run exceeded the configured duration limit",
            });
            return finishRun(failure("MAX_DURATION_EXCEEDED", "Run exceeded the configured duration limit", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            }), "max_duration_exceeded");
          }

          const shouldStop = (await dependencies.sendHeartbeat?.()) ?? false;
          logStructured("run.heartbeat", request.runId, { shouldStop });
          if (shouldStop) {
            const cancelStepIndex = Math.max(stepCount, 1);
            await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
              stepIndex: cancelStepIndex,
              actionType: "cancel",
              rationaleShort: "Run cancelled via heartbeat stop signal",
            });
            return finishRun(success("ABANDONED", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            }), "heartbeat_stop");
          }

          const pageSnapshot = await page.snapshot();
          lastPageSnapshot = pageSnapshot;
          logStructured("step.begin", request.runId, {
            step: stepCount,
            url: pageSnapshot.url,
            title: pageSnapshot.title,
            interactiveElementCount: pageSnapshot.interactiveElements.length,
          });
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
          logStructured("step.action", request.runId, {
            step: stepCount,
            actionType: action.type,
            selector: action.selector,
            url: action.url,
            text: action.text,
            rationale: action.rationale,
          });

          const actionValidation = isActionAllowed(action, request.taskSpec);
          if (!actionValidation.ok) {
            await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
              stepIndex: stepCount,
              actionType: "guardrail_violation",
              rationaleShort: actionValidation.message,
            });
            return finishRun(failure("GUARDRAIL_VIOLATION", actionValidation.message, {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            }, {
              guardrailCode: toGuardrailRuleCode(actionValidation.code),
            }), "action_guardrail_violation");
          }

          if (action.type === "finish" || action.type === "abort") {
            const terminalStepState = toStepState(stepCount, action, pageSnapshot);
            await maybeCaptureMilestone(
              dependencies,
              page,
              terminalStepState,
              pageSnapshot.title,
              history,
              milestones,
            );
            actionHistory.push(toActionHistoryEntry(stepCount, action));
            stepCount += 1;

            return finishRun(success(action.type === "finish" ? "SUCCESS" : "ABANDONED", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            }), action.type === "finish" ? "finish" : "abort");
          }

          let nextPageSnapshot: BrowserPageSnapshot;
          try {
            await executeAction(page, action);
            nextPageSnapshot = await page.snapshot();
          } catch (error) {
            logStructured("step.result", request.runId, {
              step: stepCount,
              error: getErrorMessage(error),
            });
            throw error;
          }

          if (hasExceededMaxDuration(request, startedAt, now)) {
            await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
              stepIndex: stepCount,
              actionType: "max_duration_exceeded",
              rationaleShort: "Run exceeded the configured duration limit",
            });
            return finishRun(failure("MAX_DURATION_EXCEEDED", "Run exceeded the configured duration limit", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            }), "max_duration_exceeded");
          }

          lastPageSnapshot = nextPageSnapshot;
          logStructured("step.result", request.runId, {
            step: stepCount,
            newUrl: nextPageSnapshot.url,
            newTitle: nextPageSnapshot.title,
          });
          const stepState = toStepState(stepCount, action, nextPageSnapshot);
          await maybeCaptureMilestone(
            dependencies,
            page,
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
          if (frustrationState.events.length > 0) {
            logStructured("step.frustration", request.runId, {
              step: stepCount,
              events: frustrationState.events,
            });
          }
          history.push(stepState);
          stepCount += 1;

          if (frustrationState.shouldAbort) {
            await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
              stepIndex: stepCount,
              actionType: "abandon",
              rationaleShort: "Repeated friction caused the run to be abandoned.",
            });
            return finishRun(success("ABANDONED", {
              startedAt,
              now,
              stepCount,
              frustrationCount,
              milestones,
            }), "frustration_abort");
          }
        }

        await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
          stepIndex: stepCount,
          actionType: "max_steps_exceeded",
          rationaleShort: "Run exceeded the configured maximum step count",
        });
        return finishRun(failure("MAX_STEPS_EXCEEDED", "Run exceeded the configured maximum step count", {
          startedAt,
          now,
          stepCount,
          frustrationCount,
          milestones,
        }), "max_steps_exceeded");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown browser execution error";
        logStructuredError("run.error", request.runId, error, { step: stepCount });
        await captureTerminalMilestone(dependencies, page, milestones, lastPageSnapshot, request.runId, {
          stepIndex: stepCount,
          actionType: "browser_error",
          rationaleShort: message,
        });

        return finishRun(failure("BROWSER_ERROR", message, {
          startedAt,
          now,
          stepCount,
          frustrationCount,
          milestones,
        }), "browser_error");
      } finally {
        await context?.close();

        if (leaseId) {
          await dependencies.leaseClient.release(leaseId);
        }
      }
    },
  };
}
