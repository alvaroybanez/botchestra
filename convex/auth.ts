import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  createAccount,
  convexAuth,
  retrieveAccount,
} from "@convex-dev/auth/server";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import type { GenericDataModel } from "convex/server";

const PASSWORD_PROVIDER_ID = "password";
const PASSWORD_HASH_ITERATIONS = 100_000;
const PASSWORD_HASH_KEY_LENGTH = 32;
const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const PASSWORD_HASH_SALT_LENGTH = 16;

export const DUPLICATE_PASSWORD_ACCOUNT_ERROR = "Account already exists";

type PasswordAuthContext = Pick<
  GenericActionCtxWithAuthConfig<GenericDataModel>,
  "runMutation"
>;

export function normalizePasswordEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function assertPasswordSignUpEmailAvailable(
  ctx: PasswordAuthContext,
  email: string,
  lookupPasswordAccount = retrieveAccount,
) {
  const normalizedEmail = normalizePasswordEmail(email);

  try {
    await lookupPasswordAccount(
      ctx as GenericActionCtxWithAuthConfig<GenericDataModel>,
      {
        provider: PASSWORD_PROVIDER_ID,
        account: { id: normalizedEmail },
      },
    );
    throw new Error(DUPLICATE_PASSWORD_ACCOUNT_ERROR);
  } catch (error) {
    if (error instanceof Error && error.message === "InvalidAccountId") {
      return;
    }

    throw error;
  }
}

function validatePasswordRequirements(password: string) {
  if (!password || password.length < 8) {
    throw new Error("Invalid password");
  }
}

async function derivePasswordHash(secret: string, salt: Uint8Array) {
  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PASSWORD_HASH_ITERATIONS,
      salt: Uint8Array.from(salt).buffer,
    },
    secretKey,
    PASSWORD_HASH_KEY_LENGTH * 8,
  );

  return new Uint8Array(bits);
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid password hash");
  }

  return Uint8Array.from(
    { length: hex.length / 2 },
    (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }

  return diff === 0;
}

async function hashPasswordSecret(secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_HASH_SALT_LENGTH));
  const derived = await derivePasswordHash(secret, salt);
  return `${PASSWORD_HASH_PREFIX}:${bytesToHex(salt)}:${bytesToHex(derived)}`;
}

async function verifyPasswordSecret(secret: string, storedHash: string) {
  const [prefix, saltHex, digestHex] = storedHash.split(":");

  if (
    prefix !== PASSWORD_HASH_PREFIX ||
    typeof saltHex !== "string" ||
    typeof digestHex !== "string"
  ) {
    return false;
  }

  const derived = await derivePasswordHash(secret, hexToBytes(saltHex));
  return constantTimeEqual(derived, hexToBytes(digestHex));
}

const passwordProvider = ConvexCredentials({
  id: PASSWORD_PROVIDER_ID,
  authorize: async (params, ctx) => {
    const flow = params.flow;
    const emailParam = params.email;

    if (typeof emailParam !== "string") {
      throw new Error("Missing `email` param");
    }

    const email = normalizePasswordEmail(emailParam);

    if (flow === "signUp") {
      const password = params.password;

      if (typeof password !== "string") {
        throw new Error("Missing `password` param for `signUp` flow");
      }

      validatePasswordRequirements(password);
      await assertPasswordSignUpEmailAvailable(ctx, email);

      const { user } = await createAccount(ctx, {
        provider: PASSWORD_PROVIDER_ID,
        account: { id: email, secret: password },
        profile: { email },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });

      return { userId: user._id };
    }

    if (flow === "signIn") {
      const password = params.password;

      if (typeof password !== "string") {
        throw new Error("Missing `password` param for `signIn` flow");
      }

      const retrieved = await retrieveAccount(ctx, {
        provider: PASSWORD_PROVIDER_ID,
        account: { id: email, secret: password },
      });

      return { userId: retrieved.user._id };
    }

    throw new Error(
      'Missing `flow` param, it must be one of "signUp" or "signIn"!',
    );
  },
  crypto: {
    async hashSecret(password: string) {
      return await hashPasswordSecret(password);
    },
    async verifySecret(password: string, hash: string) {
      return await verifyPasswordSecret(password, hash);
    },
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
});
