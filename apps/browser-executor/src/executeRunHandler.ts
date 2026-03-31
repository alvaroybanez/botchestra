import puppeteer from "@cloudflare/puppeteer";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { createArtifactUploader } from "./artifactUploader";
import { redactSecrets, type MaskableSecret } from "./guardrails";
import { createProgressReporterFromRequest } from "./progressReporter";
import { PuppeteerBrowserAdapter } from "./puppeteerAdapter";
import {
  createRunExecutor,
  type AgentAction,
  type BrowserLeaseClient,
  type BrowserLike,
  type RunExecutionFailure,
  type SelectActionInput,
} from "./runExecutor";
import { generateSelfReport } from "./selfReport";

type ArtifactBucket = {
  get(
    key: string,
  ): Promise<
    | {
        arrayBuffer(): Promise<ArrayBuffer>;
        httpMetadata?: { contentType?: string };
      }
    | null
  >;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
};

type DurableObjectStub = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type DurableObjectId = unknown;

type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
};

type CloudflareBrowserWorkerLike = {
  fetch: typeof fetch;
};

type ProgressReporterFetch = typeof fetch;
type GeneratedSelfReport = Awaited<ReturnType<typeof generateSelfReport>>;
type PuppeteerBrowserLike = ConstructorParameters<typeof PuppeteerBrowserAdapter>[0];
type ClosableBrowserLike = {
  close?: () => Promise<void>;
};
type BrowserBindingLike = BrowserLike | CloudflareBrowserWorkerLike | {
  launch?: () => Promise<BrowserLike | (PuppeteerBrowserLike & ClosableBrowserLike)>;
};

export type ExecuteRunIntegrationOptions = {
  browser?: BrowserLike;
  leaseClient?: BrowserLeaseClient;
  selectAction?: (input: SelectActionInput) => Promise<AgentAction>;
  fetch?: ProgressReporterFetch;
  resolveSecrets?: (
    request: ExecuteRunRequest,
  ) => Promise<readonly MaskableSecret[]> | readonly MaskableSecret[];
  generateSelfReport?: (options: {
    request: ExecuteRunRequest;
    result: Awaited<ReturnType<ReturnType<typeof createRunExecutor>["execute"]>>;
  }) => Promise<GeneratedSelfReport>;
  now?: () => number;
};

export type ExecuteRunHandlerEnv = {
  ARTIFACTS?: ArtifactBucket;
  BROWSER?: BrowserBindingLike;
  BROWSER_LEASE?: DurableObjectNamespaceLike;
};

type ReportGenerator = (
  options: Parameters<typeof generateSelfReport>[0],
) => ReturnType<typeof generateSelfReport>;

type ResolvedBrowser = {
  browser: BrowserLike;
  closeBrowser: () => Promise<void>;
};

type RunFailureResponseStatus = Record<RunExecutionFailure["errorCode"], number>;

const LEASE_NAMESPACE_NAME = "browser-lease";

const FAILURE_STATUS_BY_CODE: RunFailureResponseStatus = {
  LEASE_UNAVAILABLE: 409,
  MAX_STEPS_EXCEEDED: 500,
  MAX_DURATION_EXCEEDED: 500,
  GUARDRAIL_VIOLATION: 422,
  BROWSER_ERROR: 500,
};

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

function misconfiguredWorker(message: string) {
  return json({ error: "misconfigured_worker", message }, 500);
}

function getDefaultAction(actionType: ExecuteRunRequest["taskSpec"]["allowedActions"][number]) {
  switch (actionType) {
    case "wait":
      return { type: "wait", durationMs: 250, rationale: "Pause briefly to observe the page." };
    case "abort":
      return { type: "abort", rationale: "No safe fallback action is available." };
    case "scroll":
      return { type: "scroll", durationMs: 300, rationale: "Reveal more of the page." };
    default:
      return { type: actionType, rationale: `Fallback action: ${actionType}.` };
  }
}

function createFallbackActionSelector() {
  return async (input: SelectActionInput): Promise<AgentAction> => {
    if (input.stepIndex === 0) {
      const primaryElement = input.page.interactiveElements.find(
        (element) => typeof element.selector === "string" && element.selector.trim().length > 0,
      );

      if (primaryElement?.selector && input.request.taskSpec.allowedActions.includes("click")) {
        return {
          type: "click",
          selector: primaryElement.selector,
          rationale: `Try the prominent "${primaryElement.label}" control first.`,
        };
      }
    }

    if (input.request.taskSpec.allowedActions.includes("finish")) {
      return {
        type: "finish",
        rationale: "End the run when no richer action selector is configured.",
      };
    }

    const fallbackActionType = input.request.taskSpec.allowedActions[0];
    if (!fallbackActionType) {
      return {
        type: "abort",
        rationale: "No allowed actions are available for the run.",
      };
    }

    return getDefaultAction(fallbackActionType);
  };
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  return (await response.json()) as TResponse;
}

function createDurableObjectLeaseClient(namespace: DurableObjectNamespaceLike): BrowserLeaseClient {
  const durableObjectId = namespace.idFromName(LEASE_NAMESPACE_NAME);
  const stub = namespace.get(durableObjectId);

  return {
    async acquire(request) {
      const response = await stub.fetch("https://browser-lease.internal/acquire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });

      return parseJsonResponse<Awaited<ReturnType<BrowserLeaseClient["acquire"]>>>(response);
    },
    async release(leaseId) {
      const response = await stub.fetch("https://browser-lease.internal/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId }),
      });

      return parseJsonResponse<Awaited<ReturnType<BrowserLeaseClient["release"]>>>(response);
    },
  };
}

function isBrowserLike(value: unknown): value is BrowserLike {
  return typeof value === "object"
    && value !== null
    && "newContext" in value
    && typeof value.newContext === "function";
}

function isCloudflareBrowserWorkerLike(value: unknown): value is CloudflareBrowserWorkerLike {
  return typeof value === "object"
    && value !== null
    && "fetch" in value
    && typeof value.fetch === "function";
}

function isPuppeteerBrowserLike(value: unknown): value is PuppeteerBrowserLike {
  return typeof value === "object"
    && value !== null
    && "createBrowserContext" in value
    && typeof value.createBrowserContext === "function";
}

function toResolvedBrowser(browser: unknown): ResolvedBrowser | null {
  if (isBrowserLike(browser)) {
    const closableBrowser = browser as ClosableBrowserLike;
    return {
      browser,
      closeBrowser: async () => {
        await closableBrowser.close?.();
      },
    };
  }

  if (isPuppeteerBrowserLike(browser)) {
    const closableBrowser = browser as ClosableBrowserLike;
    return {
      browser: new PuppeteerBrowserAdapter(browser),
      closeBrowser: async () => {
        await closableBrowser.close?.();
      },
    };
  }

  return null;
}

async function resolveBrowser(
  env: ExecuteRunHandlerEnv,
  options: ExecuteRunIntegrationOptions,
): Promise<ResolvedBrowser | null> {
  if (options.browser) {
    return {
      browser: options.browser,
      closeBrowser: async () => undefined,
    };
  }

  if (!env.BROWSER) {
    return null;
  }

  if (isBrowserLike(env.BROWSER)) {
    return {
      browser: env.BROWSER,
      closeBrowser: async () => undefined,
    };
  }

  if (isCloudflareBrowserWorkerLike(env.BROWSER)) {
    const launchedBrowser = await puppeteer.launch(env.BROWSER);
    return toResolvedBrowser(launchedBrowser);
  }

  if ("launch" in env.BROWSER && typeof env.BROWSER.launch === "function") {
    const launchedBrowser = await env.BROWSER.launch();
    return toResolvedBrowser(launchedBrowser);
  }

  return null;
}

function resolveLeaseClient(
  env: ExecuteRunHandlerEnv,
  options: ExecuteRunIntegrationOptions,
): BrowserLeaseClient | null {
  if (options.leaseClient) {
    return options.leaseClient;
  }

  if (!env.BROWSER_LEASE) {
    return null;
  }

  return createDurableObjectLeaseClient(env.BROWSER_LEASE);
}

function getFailureStatus(errorCode: RunExecutionFailure["errorCode"]) {
  return FAILURE_STATUS_BY_CODE[errorCode] ?? 500;
}

export function createExecuteRunHandler(options: ExecuteRunIntegrationOptions = {}) {
  const selectAction = options.selectAction ?? createFallbackActionSelector();
  const reportGenerator: ReportGenerator = options.generateSelfReport ?? generateSelfReport;

  return async (request: ExecuteRunRequest, env: ExecuteRunHandlerEnv) => {
    const leaseClient = resolveLeaseClient(env, options);
    if (!leaseClient) {
      return misconfiguredWorker("BROWSER_LEASE binding is required for run execution");
    }

    const resolvedBrowser = await resolveBrowser(env, options);
    if (!resolvedBrowser) {
      return misconfiguredWorker("BROWSER binding is required for run execution");
    }

    const secretValues = (await options.resolveSecrets?.(request)) ?? [];
    const progressReporter = createProgressReporterFromRequest(request, {
      fetch: options.fetch,
      secretValues,
    });
    const uploader = createArtifactUploader({
      runId: request.runId,
      bucket: env.ARTIFACTS,
      now: options.now,
      secretValues,
    });

    try {
      await progressReporter.sendHeartbeat();

      const runExecutor = createRunExecutor({
        browser: resolvedBrowser.browser,
        leaseClient,
        selectAction,
        now: options.now,
        onMilestone: async (milestone, screenshot) => {
          const screenshotKey = await uploader.handleMilestone(milestone, screenshot);

          await progressReporter.sendMilestone({
            stepIndex: milestone.stepIndex,
            url: milestone.url,
            title: milestone.title,
            actionType: milestone.actionType,
            rationaleShort: milestone.rationaleShort,
            screenshotKey,
          });
        },
      });

      const result = await runExecutor.execute(request);
      const redactedResult = redactSecrets(result, secretValues);
      const artifactManifestKey = await uploader.writeManifest(redactedResult);
      const selfReport = await reportGenerator({
        request: redactSecrets(request, secretValues),
        result: redactedResult,
      });
      const redactedSelfReport = redactSecrets(selfReport, secretValues);
      const responseBody = redactSecrets(
        {
          ...redactedResult,
          selfReport: redactedSelfReport,
          artifactManifestKey,
        },
        secretValues,
      );

      if (!redactedResult.ok) {
        await progressReporter.sendFailure({
          errorCode: redactedResult.errorCode,
          ...(redactedResult.guardrailCode !== undefined
            ? { guardrailCode: redactedResult.guardrailCode }
            : {}),
          message: redactedResult.message,
          selfReport: redactedSelfReport,
        });

        return json(responseBody, getFailureStatus(redactedResult.errorCode));
      }

      await progressReporter.sendCompletion({
        finalOutcome: redactedResult.finalOutcome,
        stepCount: redactedResult.stepCount,
        durationSec: redactedResult.durationSec,
        frustrationCount: redactedResult.frustrationCount,
        selfReport: redactedSelfReport,
        artifactManifestKey,
      });

      return json(responseBody, 200);
    } finally {
      await resolvedBrowser.closeBrowser();
    }
  };
}
