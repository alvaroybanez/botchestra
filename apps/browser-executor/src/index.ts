import { ExecuteRunRequestSchema } from "@botchestra/shared";

type BrowserExecutorEnv = {
  CALLBACK_SIGNING_SECRET?: string;
};

type CallbackTokenPayload = {
  runId: string;
  exp: number;
};

export class BrowserLeaseDO {
  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(): Promise<Response> {
    return Response.json({ error: "not_implemented" }, { status: 501 });
  }
}

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

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importHmacKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function validateCallbackToken(token: string, secret: string, runId: string) {
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  let payload: CallbackTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload)));
  } catch {
    return false;
  }

  if (payload.runId !== runId || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    return false;
  }

  try {
    const key = await importHmacKey(secret, ["verify"]);
    return crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
  } catch {
    return false;
  }
}

async function handleExecuteRun(request: Request, env: BrowserExecutorEnv) {
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

  const callbackTokenIsValid = await validateCallbackToken(
    result.data.callbackToken,
    env.CALLBACK_SIGNING_SECRET,
    result.data.runId,
  );
  if (!callbackTokenIsValid) {
    return invalidCallbackToken();
  }

  return json(
    {
      status: "accepted",
      runId: result.data.runId,
      studyId: result.data.studyId,
    },
    202,
  );
}

async function routeRequest(request: Request, env: BrowserExecutorEnv) {
  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/health") {
    return json({ status: "ok" }, 200);
  }

  if (request.method === "POST" && pathname === "/execute-run") {
    return handleExecuteRun(request, env);
  }

  return notFound();
}

const worker = {
  async fetch(request: Request, env: BrowserExecutorEnv, _ctx: ExecutionContext): Promise<Response> {
    return routeRequest(request, env);
  },
};

export default worker;
