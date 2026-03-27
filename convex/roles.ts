import { v } from "convex/values";
import { z } from "zod";

export const USER_ROLES = ["researcher", "reviewer", "admin"] as const;

export const userRoleValidator = v.union(
  v.literal("researcher"),
  v.literal("reviewer"),
  v.literal("admin"),
);

export const userRoleSchema = z.enum(USER_ROLES);

export type UserRole = z.infer<typeof userRoleSchema>;
