import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { USER_ROLES, userRoleSchema, type UserRole } from "./roles";

export const ALL_ROLES = USER_ROLES;
export const ADMIN_ROLES = ["admin"] as const satisfies readonly UserRole[];
export const STUDY_MANAGER_ROLES = [
  "researcher",
  "admin",
] as const satisfies readonly UserRole[];
export const COMMENTER_ROLES = [
  "researcher",
  "reviewer",
  "admin",
] as const satisfies readonly UserRole[];

export const getViewerAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      return null;
    }

    const role = await getRoleFromIdentity(ctx, identity);

    return {
      role,
      permissions: getRolePermissions(role),
    };
  },
});

export async function requireIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}

export function resolveOrgId(identity: { tokenIdentifier: string }): string {
  const parts = identity.tokenIdentifier.split("|");
  return parts.length >= 2 ? `${parts[0]}|${parts[1]}` : identity.tokenIdentifier;
}

export async function requireOrgId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  return resolveOrgId(await requireIdentity(ctx));
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  allowedRoles: readonly UserRole[],
) {
  const identity = await requireIdentity(ctx);
  const role = await getRoleFromIdentity(ctx, identity);

  if (!allowedRoles.includes(role)) {
    throw new ConvexError(
      `FORBIDDEN: ${role} role cannot access this function.`,
    );
  }

  return {
    identity,
    role,
  };
}

export async function getRoleFromIdentity(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  identity: Record<string, unknown>,
) {
  const directRole = parseRole(identity.role);

  if (directRole !== null) {
    return directRole;
  }

  const customRole = parseRole(identity["custom:role"]);

  if (customRole !== null) {
    return customRole;
  }

  const claims = getRecord(identity.claims);
  const claimRole =
    claims === null
      ? null
      : parseRole(claims.role) ?? parseRole(claims["custom:role"]);

  if (claimRole !== null) {
    return claimRole;
  }

  const email =
    toEmail(identity.email) ??
    (claims === null ? null : toEmail(claims.email));

  if (email !== null) {
    const storedRole: UserRole | null = await ctx.runQuery(
      internal.userManagement.getStoredRoleForEmail,
      { email },
    );

    if (storedRole !== null) {
      return storedRole;
    }
  }

  return "researcher";
}

export function getRolePermissions(role: UserRole) {
  return {
    canManageStudies: role !== "reviewer",
    canManagePersonaConfigs: role !== "reviewer",
    canAddNotes: true,
    canAccessSettings: role === "admin",
    canAccessAdminDiagnostics: role === "admin",
    canExportReports: true,
  };
}

function parseRole(value: unknown): UserRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsedRole = userRoleSchema.safeParse(value.trim().toLowerCase());
  return parsedRole.success ? parsedRole.data : null;
}

function getRecord(value: unknown) {
  if (value === null || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function toEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}
