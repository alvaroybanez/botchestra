import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "web",
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "happy-dom",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
