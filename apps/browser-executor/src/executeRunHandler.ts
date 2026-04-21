import { generateWithModel } from "@botchestra/ai";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { createAiActionSelectorWithFallback } from "./aiActionSelector";
import { createArtifactUploader } from "./artifactUploader";
import { createFallbackActionSelector } from "./fallbackActionSelector";
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
import { logStructured } from "./structuredLogger";

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
    apiKey?: string;
    baseURL?: string;
    onResult?: (result: { success: boolean; fallback: boolean; reason?: string }) => void;
  }) => Promise<GeneratedSelfReport>;
  now?: () => number;
};

export type ExecuteRunHandlerEnv = {
  ARTIFACTS?: ArtifactBucket;
  BROWSER?: BrowserBindingLike;
  BROWSER_LEASE?: DurableObjectNamespaceLike;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
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

function getNow(now?: () => number) {
  return now ?? Date.now;
}

function json(body: unknown, status: number) {
  return Response.json(body, { status });
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
    && (
      ("newPage" in value && typeof value.newPage === "function")
      || ("createBrowserContext" in value && typeof value.createBrowserContext === "function")
    );
}

function toResolvedBrowser(browser: unknown): ResolvedBrowser | null {
  if (isPuppeteerBrowserLike(browser)) {
    const closableBrowser = browser as ClosableBrowserLike;
    return {
      browser: new PuppeteerBrowserAdapter(browser),
      closeBrowser: async () => {
        await closableBrowser.close?.();
      },
    };
  }

  if (isBrowserLike(browser)) {
    const closableBrowser = browser as ClosableBrowserLike;
    return {
      browser,
      closeBrowser: async () => {
        await closableBrowser.close?.();
      },
    };
  }

  return null;
}

async function launchCloudflareBrowser(browserBinding: CloudflareBrowserWorkerLike) {
  const module = await import("@cloudflare/puppeteer");
  return module.default.launch(browserBinding);
}

async function resolveBrowser(
  runId: string,
  env: ExecuteRunHandlerEnv,
  options: ExecuteRunIntegrationOptions,
): Promise<ResolvedBrowser | null> {
  if (options.browser) {
    logStructured("handler.browser", runId, {
      branch: "options.browser",
      detail: "injected BrowserLike provided via options.browser",
    });
    return {
      browser: options.browser,
      closeBrowser: async () => undefined,
    };
  }

  if (!env.BROWSER) {
    logStructured("handler.browser", runId, {
      branch: "missing",
      detail: "no BROWSER binding available",
    });
    return null;
  }

  if (isCloudflareBrowserWorkerLike(env.BROWSER)) {
    logStructured("handler.browser", runId, {
      branch: "cloudflare-binding",
      detail: "CF browser binding detected, launching puppeteer",
    });
    const launchedBrowser = await launchCloudflareBrowser(env.BROWSER);
    const resolvedBrowser = toResolvedBrowser(launchedBrowser);
    logStructured("handler.browser", runId, {
      branch: "cloudflare-binding",
      detail: resolvedBrowser
        ? "puppeteer-launched browser resolved successfully"
        : "puppeteer-launched browser could not be resolved",
      success: resolvedBrowser !== null,
    });
    return resolvedBrowser;
  }

  if (isBrowserLike(env.BROWSER)) {
    logStructured("handler.browser", runId, {
      branch: "browser-like",
      detail: "pre-resolved BrowserLike detected",
    });
    return {
      browser: env.BROWSER,
      closeBrowser: async () => undefined,
    };
  }

  if ("launch" in env.BROWSER && typeof env.BROWSER.launch === "function") {
    logStructured("handler.browser", runId, {
      branch: "custom-launch",
      detail: "custom browser launch() binding detected",
    });
    const launchedBrowser = await env.BROWSER.launch();
    const resolvedBrowser = toResolvedBrowser(launchedBrowser);
    logStructured("handler.browser", runId, {
      branch: "custom-launch",
      detail: resolvedBrowser
        ? "custom launch() browser resolved successfully"
        : "custom launch() browser could not be resolved",
      success: resolvedBrowser !== null,
    });
    return resolvedBrowser;
  }

  logStructured("handler.browser", runId, {
    branch: "unsupported",
    detail: "BROWSER binding did not match any supported browser shape",
  });
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

function resolveSelectAction(
  env: ExecuteRunHandlerEnv,
  options: ExecuteRunIntegrationOptions,
) {
  if (options.selectAction) {
    return options.selectAction;
  }

  return createAiActionSelectorWithFallback({
    generateAction: ({ system, prompt, abortSignal }) =>
      generateWithModel("action", {
        system,
        prompt,
        abortSignal,
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
      }),
  });
}

export function createExecuteRunHandler(options: ExecuteRunIntegrationOptions = {}) {
  const reportGenerator: ReportGenerator = options.generateSelfReport ?? generateSelfReport;
  const now = getNow(options.now);

  return async (request: ExecuteRunRequest, env: ExecuteRunHandlerEnv) => {
    const startedAt = now();
    const respond = (body: unknown, status: number, outcome: string) => {
      const response = json(body, status);
      logStructured("handler.response", request.runId, {
        status,
        durationMs: now() - startedAt,
        outcome,
      });
      return response;
    };

    logStructured("handler.request", request.runId, {
      studyId: request.studyId,
      goal: request.taskSpec.goal,
    });

    const leaseClient = resolveLeaseClient(env, options);
    if (!leaseClient) {
      return respond(
        { error: "misconfigured_worker", message: "BROWSER_LEASE binding is required for run execution" },
        500,
        "MISCONFIGURED_WORKER",
      );
    }

    const resolvedBrowser = await resolveBrowser(request.runId, env, options);
    if (!resolvedBrowser) {
      return respond(
        { error: "misconfigured_worker", message: "BROWSER binding is required for run execution" },
        500,
        "MISCONFIGURED_WORKER",
      );
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
    const selectAction = resolveSelectAction(env, options);

    try {
      const runExecutor = createRunExecutor({
        browser: resolvedBrowser.browser,
        leaseClient,
        selectAction,
        sendHeartbeat: () => progressReporter.sendHeartbeat(),
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
      logStructured("handler.artifacts", request.runId, {
        milestoneCount: redactedResult.milestones.length,
        manifestKey: artifactManifestKey ?? null,
      });
      const selfReportResult = {
        success: true,
        fallback: false,
      };
      const selfReport = await reportGenerator({
        request: redactSecrets(request, secretValues),
        result: redactedResult,
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
        onResult: (resultMeta) => {
          selfReportResult.success = resultMeta.success;
          selfReportResult.fallback = resultMeta.fallback;
        },
      });
      logStructured("handler.selfReport", request.runId, selfReportResult);
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

        return respond(responseBody, getFailureStatus(redactedResult.errorCode), redactedResult.finalOutcome);
      }

      await progressReporter.sendCompletion({
        finalOutcome: redactedResult.finalOutcome,
        stepCount: redactedResult.stepCount,
        durationSec: redactedResult.durationSec,
        frustrationCount: redactedResult.frustrationCount,
        selfReport: redactedSelfReport,
        artifactManifestKey,
      });

      return respond(responseBody, 200, redactedResult.finalOutcome);
    } finally {
      await resolvedBrowser.closeBrowser();
    }
  };
}

export { createFallbackActionSelector };
