import { ConvexError } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { recordAuditEvent } from "./observability";
import { ADMIN_ROLES, requireRole } from "./rbac";
import { zid, zInternalQuery, zMutation, zQuery } from "./zodHelpers";

const CREDENTIAL_ENCRYPTION_PREFIX = "encv1";
const CREDENTIAL_ENCRYPTION_SALT = "botchestra.credentials.v1";
const PBKDF2_ITERATIONS = 120_000;
const AES_GCM_IV_LENGTH = 12;
const MAX_CREDENTIAL_QUERY_SIZE = 100;

const encryptionKeyCache = new Map<string, Promise<CryptoKey>>();

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const credentialPayloadEntrySchema = z.object({
  key: requiredString("Credential field"),
  value: requiredString("Credential value"),
});

const credentialPayloadSchema = z
  .array(credentialPayloadEntrySchema)
  .min(1, "Credential payload must include at least one secret.")
  .superRefine((payload, ctx) => {
    const seen = new Set<string>();

    for (const [index, entry] of payload.entries()) {
      const normalizedKey = normalizePayloadKey(entry.key);

      if (seen.has(normalizedKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate credential field "${entry.key}".`,
          path: [index, "key"],
        });
      }

      seen.add(normalizedKey);
    }
  });

const createCredentialSchema = z.object({
  ref: requiredString("Credential reference"),
  label: requiredString("Credential label"),
  description: z.string().trim().optional(),
  allowedStudyIds: z.array(zid("studies")).optional(),
  payload: credentialPayloadSchema,
});

const updateCredentialPatchSchema = z
  .object({
    ref: requiredString("Credential reference").optional(),
    label: requiredString("Credential label").optional(),
    description: z.string().trim().optional(),
    allowedStudyIds: z.union([z.array(zid("studies")), z.null()]).optional(),
    payload: credentialPayloadSchema.optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one credential field must be provided.",
  );

export const listCredentials = zQuery({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    return await listCredentialSummariesForOrg(ctx, identity.tokenIdentifier);
  },
});

export const createCredential = zMutation({
  args: {
    credential: createCredentialSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const orgId = identity.tokenIdentifier;
    const ref = normalizeCredentialRef(args.credential.ref);
    const existing = await loadCredentialByRef(ctx, orgId, ref);

    if (existing !== null) {
      throw new ConvexError(`Credential reference "${ref}" already exists.`);
    }

    const allowedStudyIds = await normalizeAllowedStudyIds(
      ctx,
      orgId,
      args.credential.allowedStudyIds,
    );
    const now = Date.now();
    const credentialId = await ctx.db.insert("credentials", {
      ref,
      label: args.credential.label.trim(),
      encryptedPayload: await encryptCredentialPayload(args.credential.payload),
      description: args.credential.description?.trim() ?? "",
      ...(allowedStudyIds !== undefined ? { allowedStudyIds } : {}),
      orgId,
      createdBy: orgId,
      createdAt: now,
      updatedAt: now,
    });

    const created = await ctx.db.get(credentialId);

    if (created === null) {
      throw new ConvexError("Credential could not be loaded after creation.");
    }

    await recordAuditEvent(ctx, {
      orgId,
      actorId: identity.tokenIdentifier,
      eventType: "credential.created",
      resourceType: "credential",
      resourceId: ref,
      createdAt: now,
    });

    return toCredentialSummary(created);
  },
});

export const updateCredential = zMutation({
  args: {
    credentialId: zid("credentials"),
    patch: updateCredentialPatchSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const orgId = identity.tokenIdentifier;
    const existing = await loadCredentialForOrg(ctx, args.credentialId, orgId);
    const nextRef =
      args.patch.ref === undefined
        ? existing.ref
        : normalizeCredentialRef(args.patch.ref);

    if (nextRef !== existing.ref) {
      const refConflict = await loadCredentialByRef(ctx, orgId, nextRef);

      if (refConflict !== null && refConflict._id !== existing._id) {
        throw new ConvexError(`Credential reference "${nextRef}" already exists.`);
      }
    }

    const allowedStudyIds =
      args.patch.allowedStudyIds === undefined
        ? existing.allowedStudyIds
        : await normalizeAllowedStudyIds(
            ctx,
            orgId,
            args.patch.allowedStudyIds === null ? undefined : args.patch.allowedStudyIds,
          );

    const updatedAt = Date.now();
    await ctx.db.replace(existing._id, {
      ref: nextRef,
      label:
        args.patch.label === undefined
          ? existing.label
          : args.patch.label.trim(),
      encryptedPayload:
        args.patch.payload === undefined
          ? existing.encryptedPayload
          : await encryptCredentialPayload(args.patch.payload),
      description:
        args.patch.description === undefined
          ? existing.description
          : args.patch.description.trim(),
      ...(allowedStudyIds !== undefined ? { allowedStudyIds } : {}),
      orgId: existing.orgId,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
      updatedAt,
    });

    await recordAuditEvent(ctx, {
      orgId,
      actorId: identity.tokenIdentifier,
      eventType: "credential.updated",
      resourceType: "credential",
      resourceId: nextRef,
      createdAt: updatedAt,
    });

    return toCredentialSummary(await loadCredentialForOrg(ctx, existing._id, orgId));
  },
});

export const deleteCredential = zMutation({
  args: {
    credentialId: zid("credentials"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const credential = await loadCredentialForOrg(
      ctx,
      args.credentialId,
      identity.tokenIdentifier,
    );
    const deletedAt = Date.now();

    await ctx.db.delete(credential._id);
    await recordAuditEvent(ctx, {
      orgId: identity.tokenIdentifier,
      actorId: identity.tokenIdentifier,
      eventType: "credential.deleted",
      resourceType: "credential",
      resourceId: credential.ref,
      createdAt: deletedAt,
    });

    return {
      credentialId: credential._id,
      deleted: true as const,
    };
  },
});

export const resolveCredentialForStudy = zInternalQuery({
  args: {
    studyId: zid("studies"),
    credentialsRef: requiredString("Credentials reference"),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null) {
      throw new ConvexError("Study not found.");
    }

    const credential = await requireCredentialForStudy(
      ctx,
      study.orgId,
      args.studyId,
      args.credentialsRef,
    );
    const payload = await decryptCredentialPayload(credential.encryptedPayload);

    return {
      ref: credential.ref,
      label: credential.label,
      description: credential.description,
      payload,
      secretValues: payload.map((entry) => entry.value),
    };
  },
});

export async function listCredentialSummariesForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
) {
  const credentials = await ctx.db
    .query("credentials")
    .withIndex("by_orgId_and_updatedAt", (query) => query.eq("orgId", orgId))
    .order("desc")
    .take(MAX_CREDENTIAL_QUERY_SIZE);

  return credentials.map(toCredentialSummary);
}

export async function requireCredentialForStudy(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studyId: Id<"studies">,
  credentialsRef: string,
) {
  const credential = await loadCredentialByRef(
    ctx,
    orgId,
    normalizeCredentialRef(credentialsRef),
  );

  if (
    credential === null ||
    (credential.allowedStudyIds !== undefined &&
      !credential.allowedStudyIds.includes(studyId))
  ) {
    throw new ConvexError("Credential reference is not available for this study.");
  }

  return credential;
}

async function loadCredentialByRef(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  ref: string,
) {
  return await ctx.db
    .query("credentials")
    .withIndex("by_orgId_and_ref", (query) =>
      query.eq("orgId", orgId).eq("ref", ref),
    )
    .unique();
}

async function loadCredentialForOrg(
  ctx: QueryCtx | MutationCtx,
  credentialId: Id<"credentials">,
  orgId: string,
) {
  const credential = await ctx.db.get(credentialId);

  if (credential === null || credential.orgId !== orgId) {
    throw new ConvexError("Credential not found.");
  }

  return credential;
}

async function normalizeAllowedStudyIds(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  allowedStudyIds: readonly Id<"studies">[] | undefined,
) {
  if (allowedStudyIds === undefined) {
    return undefined;
  }

  const normalizedStudyIds = [...new Set(allowedStudyIds)].sort();

  for (const studyId of normalizedStudyIds) {
    const study = await ctx.db.get(studyId);

    if (study === null || study.orgId !== orgId) {
      throw new ConvexError("Credentials can only be scoped to studies in the same org.");
    }
  }

  return normalizedStudyIds;
}

function toCredentialSummary(credential: Doc<"credentials">) {
  return {
    _id: credential._id,
    _creationTime: credential._creationTime,
    ref: credential.ref,
    label: credential.label,
    description: credential.description,
    allowedStudyIds: credential.allowedStudyIds ?? [],
    orgId: credential.orgId,
    createdBy: credential.createdBy,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

async function encryptCredentialPayload(
  payload: z.infer<typeof credentialPayloadSchema>,
) {
  const key = await getCredentialEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const plaintext = new TextEncoder().encode(
    JSON.stringify(normalizeCredentialPayload(payload)),
  );
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext,
  );

  return `${CREDENTIAL_ENCRYPTION_PREFIX}:${encodeBase64Url(iv)}:${encodeBase64Url(
    new Uint8Array(ciphertext),
  )}`;
}

async function decryptCredentialPayload(encryptedPayload: string) {
  const [prefix, encodedIv, encodedCiphertext] = encryptedPayload.split(":");

  if (
    prefix !== CREDENTIAL_ENCRYPTION_PREFIX ||
    typeof encodedIv !== "string" ||
    typeof encodedCiphertext !== "string"
  ) {
    throw new ConvexError("Credential payload is encrypted with an unknown format.");
  }

  try {
    const key = await getCredentialEncryptionKey();
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64Url(encodedIv),
      },
      key,
      decodeBase64Url(encodedCiphertext),
    );

    return normalizeCredentialPayload(
      credentialPayloadSchema.parse(
        JSON.parse(new TextDecoder().decode(plaintext)),
      ),
    );
  } catch {
    throw new ConvexError("Credential payload could not be decrypted.");
  }
}

async function getCredentialEncryptionKey() {
  const secret = getCredentialEncryptionSecret();
  const cachedKey = encryptionKeyCache.get(secret);

  if (cachedKey) {
    return await cachedKey;
  }

  const keyPromise = deriveCredentialEncryptionKey(secret);
  encryptionKeyCache.set(secret, keyPromise);

  return await keyPromise;
}

async function deriveCredentialEncryptionKey(secret: string) {
  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: new TextEncoder().encode(CREDENTIAL_ENCRYPTION_SALT),
    },
    secretKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

function getCredentialEncryptionSecret() {
  const secret =
    process.env.CREDENTIAL_ENCRYPTION_SECRET ??
    process.env.CALLBACK_SIGNING_SECRET;

  if (!secret) {
    throw new ConvexError("Credential encryption secret is not configured.");
  }

  return secret;
}

function normalizeCredentialPayload(
  payload: z.infer<typeof credentialPayloadSchema>,
) {
  return payload.map((entry) => ({
    key: normalizePayloadKey(entry.key),
    value: entry.value.trim(),
  }));
}

function normalizeCredentialRef(value: string) {
  return value.trim().toLowerCase();
}

function normalizePayloadKey(value: string) {
  return value.trim();
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
