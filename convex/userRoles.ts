import { z } from "zod";

export const USER_ROLES = ["researcher", "reviewer", "admin"] as const;

export const userRoleSchema = z.enum(USER_ROLES);

export type UserRole = z.infer<typeof userRoleSchema>;
