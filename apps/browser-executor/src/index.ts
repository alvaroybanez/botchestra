import {
  type ExecuteRunRequest,
  ExecuteRunRequestSchema,
} from "@botchestra/shared";
import {
  createExecuteRunHandler,
  type ExecuteRunHandlerEnv,
  type ExecuteRunIntegrationOptions,
} from "./executeRunHandler";
import { BrowserLeaseDO } from "./browserLeaseDO";
import { validateCallbackToken } from "./guardrails";

export type BrowserExecutorEnv = ExecuteRunHandlerEnv & {
  CALLBACK_SIGNING_SECRET?: string;
};

export type ExecuteRunHandler = (
  request: ExecuteRunRequest,
  env: BrowserExecutorEnv,
) => Promise<Response>;

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

function notFound() {
  return json({ error: "not_found" }, 404);
}

function invalidRequest(issues: Array<{ path: string; message: string }>) {
  return json({ error: "invalid_request", issues }, 400);
}

function invalidJson() {
  return json({ error: "invalid_json" }, 400);
}

function invalidCallbackToken() {
  return json({ error: "invalid_callback_token" }, 401);
}

function misconfiguredWorker() {
  return json({ error: "misconfigured_worker" }, 500);
}

function decodeArtifactKey(pathname: string) {
  const encodedKey = pathname.slice("/artifacts/".length);

  if (!encodedKey) {
    return null;
  }

  return decodeURIComponent(encodedKey);
}

async function handleArtifactRequest(
  request: Request,
  env: BrowserExecutorEnv,
) {
  if (!env.ARTIFACTS) {
    return misconfiguredWorker();
  }

  const artifactKey = decodeArtifactKey(new URL(request.url).pathname);

  if (!artifactKey) {
    return notFound();
  }

  const artifact = await env.ARTIFACTS.get(artifactKey);

  if (!artifact) {
    return notFound();
  }

  return new Response(await artifact.arrayBuffer(), {
    status: 200,
    headers: {
      "content-type":
        artifact.httpMetadata?.contentType ?? contentTypeForArtifactKey(artifactKey),
      "cache-control": "public, max-age=14400",
    },
  });
}

function contentTypeForArtifactKey(artifactKey: string) {
  const normalizedKey = artifactKey.toLowerCase();

  if (normalizedKey.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedKey.endsWith(".jpg") || normalizedKey.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedKey.endsWith(".gif")) {
    return "image/gif";
  }

  if (normalizedKey.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalizedKey.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (normalizedKey.endsWith(".json")) {
    return "application/json";
  }

  return "application/octet-stream";
}

async function handleExecuteRun(
  request: Request,
  env: BrowserExecutorEnv,
  executeRun: ExecuteRunHandler,
) {
  if (!env.CALLBACK_SIGNING_SECRET) {
    return misconfiguredWorker();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const result = ExecuteRunRequestSchema.safeParse(body);
  if (!result.success) {
    return invalidRequest(
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const callbackTokenValidation = await validateCallbackToken(
    result.data.callbackToken,
    env.CALLBACK_SIGNING_SECRET,
    { expectedRunId: result.data.runId },
  );
  if (!callbackTokenValidation.ok) {
    return invalidCallbackToken();
  }

  return executeRun(result.data, env);
}

async function routeRequest(
  request: Request,
  env: BrowserExecutorEnv,
  executeRun: ExecuteRunHandler,
) {
  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/health") {
    return json({ status: "ok" }, 200);
  }

  if (request.method === "POST" && pathname === "/execute-run") {
    return handleExecuteRun(request, env, executeRun);
  }

  if (request.method === "GET" && pathname.startsWith("/artifacts/")) {
    return handleArtifactRequest(request, env);
  }

  return notFound();
}

export function createWorker(options: { executeRun?: ExecuteRunHandler; runtime?: ExecuteRunIntegrationOptions } = {}) {
  const executeRun = options.executeRun ?? createExecuteRunHandler(options.runtime);

  return {
    async fetch(request: Request, env: BrowserExecutorEnv, _ctx: ExecutionContext): Promise<Response> {
      return routeRequest(request, env, executeRun);
    },
  };
}

const worker = createWorker();

export { BrowserLeaseDO };
export default worker;
