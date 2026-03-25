import {
  type ExecuteRunRequest,
  ExecuteRunRequestSchema,
} from "@botchestra/shared";
import { BrowserLeaseDO } from "./browserLeaseDO";
import { validateCallbackToken } from "./guardrails";

export type BrowserExecutorEnv = {
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

async function defaultExecuteRunHandler(request: ExecuteRunRequest) {
  return json(
    {
      status: "accepted",
      runId: request.runId,
      studyId: request.studyId,
    },
    202,
  );
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

  return notFound();
}

export function createWorker(options: { executeRun?: ExecuteRunHandler } = {}) {
  const executeRun = options.executeRun ?? defaultExecuteRunHandler;

  return {
    async fetch(request: Request, env: BrowserExecutorEnv, _ctx: ExecutionContext): Promise<Response> {
      return routeRequest(request, env, executeRun);
    },
  };
}

const worker = createWorker();

export { BrowserLeaseDO };
export default worker;
