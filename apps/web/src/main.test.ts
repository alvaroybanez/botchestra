import { describe, it, expect } from "vitest";
import { APP_NAME } from "./main";

describe("@botchestra/web", () => {
  it("is importable and exports app name", () => {
    expect(APP_NAME).toBe("Botchestra");
  });
});
