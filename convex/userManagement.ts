import { z } from "zod";

import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { userRoleSchema, type UserRole } from "./userRoles";
import { zInternalMutation, zInternalQuery } from "./zodHelpers";

export const DEFAULT_USER_ROLE: UserRole = "researcher";

type AuthSyncArgs = {
  profile: Record<string, unknown> & {
    email?: string;
  };
};

type AuthSyncCtx = {
  db: MutationCtx["db"];
};

export async function syncUserFromAuth(ctx: AuthSyncCtx, args: AuthSyncArgs) {
  const email = getRequiredEmail(args.profile);
  const existingRecord = await ctx.db
    .query("userRoles")
    .withIndex("by_email", (query) => query.eq("email", email))
    .unique();

  if (existingRecord !== null) {
    return existingRecord._id;
  }

  return await ctx.db.insert("userRoles", {
    email,
    role: DEFAULT_USER_ROLE,
  });
}

export const getStoredRoleForEmail = zInternalQuery({
  args: {
    email: z.string().email(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("userRoles")
      .withIndex("by_email", (query) => query.eq("email", normalizeUserEmail(args.email)))
      .unique();
    return record?.role ?? null;
  },
});

export const setUserRole = zInternalMutation({
  args: {
    email: z.string().email(),
    role: userRoleSchema,
  },
  handler: async (ctx, args) => {
    const email = normalizeUserEmail(args.email);

    const existingRecord = await ctx.db
      .query("userRoles")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique();

    if (existingRecord !== null) {
      await ctx.db.patch(existingRecord._id, {
        email,
        role: args.role,
      });

      return (await ctx.db.get(existingRecord._id))!;
    }

    const roleRecordId = await ctx.db.insert("userRoles", {
      email,
      role: args.role,
    });

    return (await ctx.db.get(roleRecordId))!;
  },
});

function getRequiredEmail(profile: AuthSyncArgs["profile"], fallback?: string) {
  const email = toTrimmedString(profile.email) ?? fallback;

  if (email === undefined) {
    throw new Error("Authenticated user is missing an email address.");
  }

  return normalizeUserEmail(email);
}

function normalizeUserEmail(email: string) {
  return email.trim().toLowerCase();
}

function toTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
