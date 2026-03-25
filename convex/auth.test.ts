import { describe, expect, it, vi } from "vitest";
import {
  DUPLICATE_PASSWORD_ACCOUNT_ERROR,
  assertPasswordSignUpEmailAvailable,
  normalizePasswordEmail,
} from "./auth";

describe("password auth sign up", () => {
  it("normalizes email before checking for an existing account", async () => {
    const lookupPasswordAccount = vi
      .fn()
      .mockRejectedValue(new Error("InvalidAccountId"));

    await assertPasswordSignUpEmailAvailable(
      { runMutation: vi.fn() } as never,
      "  TEST@Example.COM  ",
      lookupPasswordAccount,
    );

    expect(normalizePasswordEmail("  TEST@Example.COM  ")).toBe(
      "test@example.com",
    );
    expect(lookupPasswordAccount).toHaveBeenCalledWith(
      expect.anything(),
      {
        provider: "password",
        account: { id: "test@example.com" },
      },
    );
  });

  it("rejects duplicate sign up attempts for existing password accounts", async () => {
    const lookupPasswordAccount = vi.fn().mockResolvedValue({
      account: { _id: "existing-account" },
      user: { _id: "existing-user" },
    });

    await expect(
      assertPasswordSignUpEmailAvailable(
        { runMutation: vi.fn() } as never,
        "existing@example.com",
        lookupPasswordAccount,
      ),
    ).rejects.toThrow(DUPLICATE_PASSWORD_ACCOUNT_ERROR);
  });
});
