import { describe, it, expect } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("@botchestra/shared", () => {
  it("is importable and exports package name", () => {
    expect(PACKAGE_NAME).toBe("@botchestra/shared");
  });
});
