import type { ExecuteRunRequest } from "@botchestra/shared";

export const REDACTED_VALUE = "[REDACTED]" as const;
export const MASKED_VALUE = REDACTED_VALUE;

export type ForbiddenAction = ExecuteRunRequest["taskSpec"]["forbiddenActions"][number];
export type AllowedAction = ExecuteRunRequest["taskSpec"]["allowedActions"][number];

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
export type RuntimeActionValidationResult =
  | GuardrailPass
  | GuardrailFailure<"action_not_allowed" | "forbidden_action" | "invalid_url" | "domain_not_allowed">;

export type GuardrailRuleCode =
  | "ACTION_NOT_ALLOWED"
  | "DOMAIN_BLOCKED"
  | "FORBIDDEN_ACTION"
  | "URL_VIOLATION";

type GuardrailFailureCode =
  | "action_not_allowed"
  | "domain_not_allowed"
  | "forbidden_action"
  | "invalid_url";

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

export type RuntimeActionGuardrails = Pick<
  ExecuteRunRequest["taskSpec"],
  "allowedActions" | "allowedDomains" | "forbiddenActions"
>;

export type RuntimeAction = {
  type: string;
  url?: string;
};

export type MaskableSecret =
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

export function isActionAllowed(
  action: RuntimeAction,
  guardrails: RuntimeActionGuardrails,
): RuntimeActionValidationResult {
  const actionValidation = validateAction(action.type, guardrails.forbiddenActions);
  if (!actionValidation.ok) {
    return actionValidation;
  }

  if (!guardrails.allowedActions.includes(action.type as AllowedAction)) {
    return failure("action_not_allowed", `Action ${action.type} is not allowed for this task`);
  }

  if (action.type === "goto") {
    const url = action.url?.trim();
    if (!url) {
      return failure("invalid_url", "Action goto requires a non-empty URL");
    }

    return validateNavigation(url, guardrails.allowedDomains);
  }

  return { ok: true };
}

function normalizeSecretValues(secrets: readonly MaskableSecret[]) {
  return [...new Set(
    secrets
      .map((credential) => (typeof credential === "string" ? credential : credential.value))
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )].sort((left, right) => right.length - left.length);
}

export function maskSecrets(text: string, secrets: readonly MaskableSecret[]) {
  return normalizeSecretValues(secrets).reduce(
    (maskedText, credentialValue) => maskedText.split(credentialValue).join(REDACTED_VALUE),
    text,
  );
}

export const maskCredentials = maskSecrets;

export function toGuardrailRuleCode(code: GuardrailFailureCode): GuardrailRuleCode {
  switch (code) {
    case "domain_not_allowed":
      return "DOMAIN_BLOCKED";
    case "forbidden_action":
      return "FORBIDDEN_ACTION";
    case "invalid_url":
      return "URL_VIOLATION";
    case "action_not_allowed":
      return "ACTION_NOT_ALLOWED";
  }
}

function isProbablyText(value: string) {
  if (value.length === 0) {
    return true;
  }

  let printableCount = 0;

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    const isWhitespace = char === "\n" || char === "\r" || char === "\t";
    const isPrintableAscii = codePoint >= 0x20 && codePoint <= 0x7e;
    const isPrintableUnicode = codePoint > 0x7e && codePoint !== 0xfffd;

    if (isWhitespace || isPrintableAscii || isPrintableUnicode) {
      printableCount += 1;
    }
  }

  return printableCount / value.length >= 0.85;
}

export function maskSecretsInBytes(value: Uint8Array, secrets: readonly MaskableSecret[]) {
  if (normalizeSecretValues(secrets).length === 0) {
    return value;
  }

  // This helper only rewrites text-like byte payloads such as manifests, JSON callbacks,
  // and other UTF-8 content. It is intentionally not used for visual redaction of rendered
  // screenshot pixels because byte substitution cannot safely redact image content. JPEG
  // screenshots are sanitized by stripping metadata segments before upload instead.
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);

    if (!isProbablyText(decoded)) {
      return value;
    }

    const masked = maskSecrets(decoded, secrets);
    if (masked === decoded) {
      return value;
    }

    return new TextEncoder().encode(masked);
  } catch {
    return value;
  }
}

export function stripJpegMetadata(value: Uint8Array) {
  if (value.length < 4 || value[0] !== 0xff || value[1] !== 0xd8) {
    return value;
  }

  const sanitized: number[] = [0xff, 0xd8];
  let index = 2;

  while (index < value.length) {
    const markerStart = index;

    if (value[index] !== 0xff) {
      return value;
    }

    while (index < value.length && value[index] === 0xff) {
      index += 1;
    }

    if (index >= value.length) {
      return value;
    }

    const marker = value[index]!;
    index += 1;

    if (marker === 0xd9) {
      sanitized.push(...value.slice(markerStart, index));
      return Uint8Array.from(sanitized);
    }

    if (marker === 0xda) {
      sanitized.push(...value.slice(markerStart));
      return Uint8Array.from(sanitized);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      sanitized.push(...value.slice(markerStart, index));
      continue;
    }

    if (index + 1 >= value.length) {
      return value;
    }

    const segmentLength = (value[index]! << 8) | value[index + 1]!;
    if (segmentLength < 2) {
      return value;
    }

    const segmentEnd = index + segmentLength;
    if (segmentEnd > value.length) {
      return value;
    }

    const isMetadataSegment = marker === 0xfe || (marker >= 0xe0 && marker <= 0xef);
    if (!isMetadataSegment) {
      sanitized.push(...value.slice(markerStart, segmentEnd));
    }

    index = segmentEnd;
  }

  return Uint8Array.from(sanitized);
}

export function redactSecrets<T>(value: T, secrets: readonly MaskableSecret[]): T {
  if (normalizeSecretValues(secrets).length === 0) {
    return value;
  }

  if (typeof value === "string") {
    return maskSecrets(value, secrets) as T;
  }

  if (value instanceof Uint8Array) {
    return maskSecretsInBytes(value, secrets) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, secrets)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, redactSecrets(entryValue, secrets)]),
    ) as T;
  }

  return value;
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
