import { z } from "zod";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { userRoleSchema, userRoleValidator, type UserRole } from "./roles";

export const DEFAULT_USER_ROLE: UserRole = "researcher";

type AuthSyncArgs = {
  userId: string;
  profile: Record<string, unknown> & {
    email?: string;
  };
};

type AuthSyncCtx = {
  db: MutationCtx["db"];
};

export async function syncUserFromAuth(ctx: AuthSyncCtx, args: AuthSyncArgs) {
  const user = await ctx.db.get("users", args.userId as Id<"users">);

  if (user === null) {
    throw new Error("Authenticated user is missing from the users table.");
  }

  const email = getRequiredEmail(args.profile, user.email);
  const patch: {
    email?: string;
    role?: UserRole;
  } = {};

  if (user.email !== email) {
    patch.email = email;
  }

  if (user.role === undefined) {
    patch.role = DEFAULT_USER_ROLE;
  }

  if (patch.email !== undefined || patch.role !== undefined) {
    await ctx.db.patch("users", args.userId as Id<"users">, patch);
  }

  return args.userId;
}

export const getStoredRoleForEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        email: z.string().email(),
      })
      .parse(args);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (query) =>
        query.eq("email", normalizeUserEmail(parsedArgs.email)),
      )
      .unique();
    return user?.role ?? null;
  },
});

export const setUserRole = internalMutation({
  args: {
    email: v.string(),
    role: userRoleValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        email: z.string().email(),
        role: userRoleSchema,
      })
      .parse(args);
    const email = normalizeUserEmail(parsedArgs.email);

    const user = await ctx.db
      .query("users")
      .withIndex("email", (query) => query.eq("email", email))
      .unique();

    if (user === null) {
      throw new Error(`User ${email} was not found.`);
    }

    await ctx.db.patch(user._id, {
      email,
      role: parsedArgs.role,
    });

    return (await ctx.db.get(user._id))!;
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
