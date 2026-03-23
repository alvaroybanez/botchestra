import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "convex",
    include: ["**/*.test.ts"],
  },
});
