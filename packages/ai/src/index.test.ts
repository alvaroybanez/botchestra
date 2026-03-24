import { describe, it, expect } from "vitest";
import {
  MODEL_CONFIG,
  resolveModel,
  generateWithModel,
  type TaskCategory,
} from "./index";

const ALL_CATEGORIES: TaskCategory[] = [
  "expansion",
  "action",
  "summarization",
  "clustering",
  "recommendation",
];

describe("model resolution", () => {
  it("resolves each task category to a non-empty model ID", () => {
    for (const category of ALL_CATEGORIES) {
      const modelId = resolveModel(category);
      expect(modelId, `${category} should resolve to a non-empty string`).toBeTruthy();
      expect(typeof modelId).toBe("string");
    }
  });

  it("MODEL_CONFIG contains all 5 task categories", () => {
    for (const category of ALL_CATEGORIES) {
      expect(MODEL_CONFIG).toHaveProperty(category);
      expect(MODEL_CONFIG[category]).toBeTruthy();
    }
  });

  it("overrides model via BOTCHESTRA_MODEL_{CATEGORY} env var", () => {
    const override = "custom-model-from-env";
    process.env.BOTCHESTRA_MODEL_EXPANSION = override;
    try {
      expect(resolveModel("expansion")).toBe(override);
    } finally {
      delete process.env.BOTCHESTRA_MODEL_EXPANSION;
    }
  });

  it("falls back to MODEL_CONFIG default when env var is unset", () => {
    delete process.env.BOTCHESTRA_MODEL_EXPANSION;
    expect(resolveModel("expansion")).toBe(MODEL_CONFIG.expansion);
  });

  it("exports generateWithModel as a function", () => {
    expect(typeof generateWithModel).toBe("function");
  });
});
