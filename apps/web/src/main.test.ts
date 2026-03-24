import { describe, it, expect } from "vitest";

describe("@botchestra/web", () => {
  it("lib/utils cn function works", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("foo", "bar")).toBe("foo bar");
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
