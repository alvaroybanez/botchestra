import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "browser-executor",
    include: ["src/**/*.test.ts"],
  },
});
