import { describe, expect, it } from "vitest";
import {
  MASKED_VALUE,
  maskCredentials,
  validateAction,
  validateCallbackToken,
  validateNavigation,
} from "./guardrails";

const forbiddenActions = [
  "external_download",
  "payment_submission",
  "email_send",
  "sms_send",
  "captcha_bypass",
  "account_creation_without_fixture",
  "cross_domain_escape",
  "file_upload_unless_allowed",
] as const;

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeBase64UrlBytes(bytes: Uint8Array) {
  return encodeBase64Url(String.fromCharCode(...bytes));
}

async function createCallbackToken(runId: string, secret: string, exp: number) {
  const payload = encodeBase64Url(JSON.stringify({ runId, exp }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${encodeBase64UrlBytes(new Uint8Array(signature))}`;
}

describe("validateNavigation", () => {
  it("passes for an exact hostname match", () => {
    expect(validateNavigation("https://staging.example.com/shop", ["staging.example.com"])).toEqual({
      ok: true,
    });
  });

  it("blocks subdomains that are not exact allowlist matches", () => {
    expect(
      validateNavigation("https://app.staging.example.com/shop", ["staging.example.com"]),
    ).toMatchObject({
      ok: false,
      code: "domain_not_allowed",
    });
  });

  it("ignores port differences when comparing hostnames", () => {
    expect(
      validateNavigation("https://staging.example.com:8443/shop", ["http://staging.example.com:3000"]),
    ).toEqual({
      ok: true,
    });
  });

  it("ignores protocol differences when comparing hostnames", () => {
    expect(validateNavigation("https://staging.example.com/shop", ["http://staging.example.com"])).toEqual({
      ok: true,
    });
  });

  it("blocks navigation when the allowlist is empty", () => {
    expect(validateNavigation("https://staging.example.com/shop", [])).toMatchObject({
      ok: false,
      code: "domain_not_allowed",
    });
  });
});

describe("validateAction", () => {
  it.each(forbiddenActions)("blocks %s when it appears in the forbidden action list", (actionType) => {
    expect(validateAction(actionType, [actionType])).toMatchObject({
      ok: false,
      code: "forbidden_action",
    });
  });

  it("passes when the action is not forbidden for the current study", () => {
    expect(validateAction("email_send", ["payment_submission"])).toEqual({ ok: true });
  });
});

describe("maskCredentials", () => {
  it("masks a single credential value", () => {
    expect(maskCredentials("username=alice@example.com", ["alice@example.com"])).toBe(
      "username=[MASKED]",
    );
  });

  it("masks multiple credential values and repeated occurrences", () => {
    expect(
      maskCredentials(
        "alice@example.com logged in with password swordfish, then alice@example.com retried.",
        ["alice@example.com", "swordfish"],
      ),
    ).toBe("[MASKED] logged in with password [MASKED], then [MASKED] retried.");
  });

  it("masks credential values embedded inside URLs", () => {
    expect(
      maskCredentials(
        "https://alice@example.com:swordfish@staging.example.com/login",
        ["alice@example.com", "swordfish"],
      ),
    ).toBe("https://[MASKED]:[MASKED]@staging.example.com/login");
  });

  it("returns the original text when there are no credentials to mask", () => {
    expect(maskCredentials("no secrets here", [])).toBe("no secrets here");
    expect(MASKED_VALUE).toBe("[MASKED]");
  });
});

describe("validateCallbackToken", () => {
  const secret = "callback-secret";
  const now = 1_750_000_000_000;

  it("accepts a correctly signed, non-expired token", async () => {
    const token = await createCallbackToken("run_123", secret, now + 60_000);

    await expect(
      validateCallbackToken(token, secret, { expectedRunId: "run_123", now }),
    ).resolves.toEqual({
      ok: true,
      payload: { runId: "run_123", exp: now + 60_000 },
    });
  });

  it("rejects expired tokens", async () => {
    const token = await createCallbackToken("run_123", secret, now - 1);

    await expect(
      validateCallbackToken(token, secret, { expectedRunId: "run_123", now }),
    ).resolves.toMatchObject({
      ok: false,
      code: "callback_token_expired",
    });
  });

  it("rejects tokens signed with the wrong secret", async () => {
    const token = await createCallbackToken("run_123", "wrong-secret", now + 60_000);

    await expect(
      validateCallbackToken(token, secret, { expectedRunId: "run_123", now }),
    ).resolves.toMatchObject({
      ok: false,
      code: "callback_token_invalid_signature",
    });
  });

  it("rejects valid tokens for a different run", async () => {
    const token = await createCallbackToken("run_999", secret, now + 60_000);

    await expect(
      validateCallbackToken(token, secret, { expectedRunId: "run_123", now }),
    ).resolves.toMatchObject({
      ok: false,
      code: "callback_token_run_id_mismatch",
    });
  });

  it("rejects tampered payloads", async () => {
    const token = await createCallbackToken("run_123", secret, now + 60_000);
    const [payload, signature] = token.split(".");
    const tamperedPayload = encodeBase64Url(JSON.stringify({ runId: "run_999", exp: now + 60_000 }));

    await expect(
      validateCallbackToken(`${tamperedPayload}.${signature}`, secret, { expectedRunId: "run_123", now }),
    ).resolves.toMatchObject({
      ok: false,
      code: "callback_token_invalid_signature",
    });

    await expect(validateCallbackToken(`${payload}.tampered`, secret, { now })).resolves.toMatchObject({
      ok: false,
      code: "callback_token_invalid_signature",
    });
  });
});
