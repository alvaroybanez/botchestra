import type { ExecuteRunRequest } from "@botchestra/shared";

export const MASKED_VALUE = "[MASKED]" as const;

export type ForbiddenAction = ExecuteRunRequest["taskSpec"]["forbiddenActions"][number];

export type CallbackTokenPayload = {
  runId: string;
  exp: number;
};

type GuardrailPass = {
  ok: true;
};

type GuardrailFailure<TCode extends string> = {
  ok: false;
  code: TCode;
  message: string;
};

export type NavigationValidationResult =
  | GuardrailPass
  | GuardrailFailure<"invalid_url" | "domain_not_allowed">;

export type ActionValidationResult = GuardrailPass | GuardrailFailure<"forbidden_action">;

export type CallbackTokenValidationResult =
  | {
      ok: true;
      payload: CallbackTokenPayload;
    }
  | GuardrailFailure<
      | "callback_token_malformed"
      | "callback_token_expired"
      | "callback_token_invalid_signature"
      | "callback_token_run_id_mismatch"
    >;

type CallbackTokenValidationOptions = {
  expectedRunId?: string;
  now?: number;
};

type MaskableCredential =
  | string
  | {
      value: string;
    };

function failure<TCode extends string>(code: TCode, message: string): GuardrailFailure<TCode> {
  return { ok: false, code, message };
}

function normalizeHostname(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.replace(/^\/\//, "");

  try {
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
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

export function validateNavigation(url: string, allowedDomains: readonly string[]): NavigationValidationResult {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return failure("invalid_url", `Invalid navigation URL: ${url}`);
  }

  const normalizedAllowedDomains = new Set(
    allowedDomains
      .map(normalizeHostname)
      .filter((domain): domain is string => domain !== null),
  );

  if (normalizedAllowedDomains.has(hostname)) {
    return { ok: true };
  }

  if (normalizedAllowedDomains.size === 0) {
    return failure("domain_not_allowed", "No allowed domains configured for this run");
  }

  return failure(
    "domain_not_allowed",
    `Navigation to ${hostname} is outside the allowed domains: ${[...normalizedAllowedDomains].join(", ")}`,
  );
}

export function validateAction(
  actionType: string,
  forbiddenActions: readonly ForbiddenAction[],
): ActionValidationResult {
  if (forbiddenActions.includes(actionType as ForbiddenAction)) {
    return failure("forbidden_action", `Action ${actionType} is forbidden by the current guardrails`);
  }

  return { ok: true };
}

function normalizeCredentialValues(credentials: readonly MaskableCredential[]) {
  return [...new Set(
    credentials
      .map((credential) => (typeof credential === "string" ? credential : credential.value))
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )].sort((left, right) => right.length - left.length);
}

export function maskCredentials(text: string, credentials: readonly MaskableCredential[]) {
  return normalizeCredentialValues(credentials).reduce(
    (maskedText, credentialValue) => maskedText.split(credentialValue).join(MASKED_VALUE),
    text,
  );
}

export async function validateCallbackToken(
  token: string,
  secret: string,
  options: CallbackTokenValidationOptions = {},
): Promise<CallbackTokenValidationResult> {
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    return failure("callback_token_malformed", "Callback token must contain payload and signature segments");
  }

  let payload: CallbackTokenPayload;
  try {
    const decodedPayload = new TextDecoder().decode(decodeBase64Url(encodedPayload));
    const parsedPayload = JSON.parse(decodedPayload) as Partial<CallbackTokenPayload>;
    const { runId, exp } = parsedPayload;

    if (typeof runId !== "string" || typeof exp !== "number" || !Number.isFinite(exp)) {
      return failure("callback_token_malformed", "Callback token payload is missing required fields");
    }

    payload = {
      runId,
      exp,
    };
  } catch {
    return failure("callback_token_malformed", "Callback token payload is not valid base64url JSON");
  }

  try {
    const key = await importHmacKey(secret, ["verify"]);
    const signatureIsValid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );

    if (!signatureIsValid) {
      return failure("callback_token_invalid_signature", "Callback token signature is invalid");
    }
  } catch {
    return failure("callback_token_invalid_signature", "Callback token signature could not be verified");
  }

  if (options.expectedRunId && payload.runId !== options.expectedRunId) {
    return failure(
      "callback_token_run_id_mismatch",
      `Callback token runId ${payload.runId} does not match expected runId ${options.expectedRunId}`,
    );
  }

  const now = options.now ?? Date.now();
  if (payload.exp <= now) {
    return failure("callback_token_expired", "Callback token has expired");
  }

  return {
    ok: true,
    payload,
  };
}
