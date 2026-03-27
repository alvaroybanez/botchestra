import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { internal } from "./_generated/api";
import schema from "./schema";
import { syncUserFromAuth } from "./userManagement";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

describe("userManagement", () => {
  it("creates auth-linked role records with a default researcher role", async () => {
    const t = createTest();
    const roleRecordId = await t.run(async (ctx) =>
      syncUserFromAuth(ctx as never, {
        profile: {
          email: "  ADMIN@Example.com  ",
        },
      }),
    );

    const storedRoleRecord = await t.run(async (ctx) => ctx.db.get(roleRecordId));

    expect(storedRoleRecord).toMatchObject({
      _id: roleRecordId,
      email: "admin@example.com",
      role: "researcher",
    });
  });

  it("preserves an existing promoted role when auth sync runs again", async () => {
    const t = createTest();
    const roleRecordId = await t.run(async (ctx) =>
      syncUserFromAuth(ctx as never, {
        profile: {
          email: "reviewer@example.com",
        },
      }),
    );

    await t.run(async (ctx) =>
      ctx.db.patch(roleRecordId, {
        role: "admin",
      }),
    );

    const syncedRoleRecordId = await t.run(async (ctx) =>
      syncUserFromAuth(ctx as never, {
        profile: {
          email: "REVIEWER@example.com",
        },
      }),
    );

    const storedRoleRecord = await t.run(async (ctx) => ctx.db.get(roleRecordId));

    expect(syncedRoleRecordId).toBe(roleRecordId);
    expect(storedRoleRecord).toMatchObject({
      _id: roleRecordId,
      email: "reviewer@example.com",
      role: "admin",
    });
  });

  it("updates a user's role by email through the internal mutation", async () => {
    const t = createTest();
    const updatedUser = await t.mutation((internal as any).userManagement.setUserRole, {
      email: "admin@example.com",
      role: "admin",
    });

    expect(updatedUser).toMatchObject({
      email: "admin@example.com",
      role: "admin",
    });
  });
});
