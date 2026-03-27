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
  it("assigns a default researcher role on the auth user record", async () => {
    const t = createTest();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "  ADMIN@Example.com  ",
      }),
    );

    await t.run(async (ctx) =>
      syncUserFromAuth(ctx as never, {
        userId,
        profile: {
          email: "  ADMIN@Example.com  ",
        },
      }),
    );

    const storedUser = await t.run(async (ctx) => ctx.db.get(userId));

    expect(storedUser).toMatchObject({
      _id: userId,
      email: "admin@example.com",
      role: "researcher",
    });
  });

  it("preserves an existing promoted role when auth sync runs again", async () => {
    const t = createTest();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "reviewer@example.com",
        role: "admin",
      }),
    );

    await t.run(async (ctx) =>
      syncUserFromAuth(ctx as never, {
        userId,
        profile: {
          email: "REVIEWER@example.com",
        },
      }),
    );

    const storedUser = await t.run(async (ctx) => ctx.db.get(userId));

    expect(storedUser).toMatchObject({
      _id: userId,
      email: "reviewer@example.com",
      role: "admin",
    });
  });

  it("updates a user's role by email through the internal mutation", async () => {
    const t = createTest();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin@example.com",
      }),
    );

    const updatedUser = await t.mutation((internal as any).userManagement.setUserRole, {
      email: "admin@example.com",
      role: "admin",
    });

    expect(updatedUser).toMatchObject({
      _id: userId,
      email: "admin@example.com",
      role: "admin",
    });
  });
});
