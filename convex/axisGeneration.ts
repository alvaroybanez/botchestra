"use node";

import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  buildSuggestAxesPrompt,
  buildSuggestAxesSystemPrompt,
} from "./axisGenerationPrompt";
import { axisSchema } from "./personaConfigs";
import { requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const AXIS_KEY_PATTERN = /^[a-z0-9_]+$/;

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const suggestAxesArgsSchema = z.object({
  name: requiredString("Config name"),
  context: requiredString("Config context"),
  description: requiredString("Config description"),
  existingAxisKeys: z.array(requiredString("Existing axis key")).optional(),
  forceError: z.boolean().optional(),
});

const suggestedAxesSchema = z
  .array(axisSchema)
  .min(3, "The model must return at least 3 axes.")
  .max(5, "The model must return at most 5 axes.")
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();

    axes.forEach((axis, index) => {
      if (!AXIS_KEY_PATTERN.test(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message:
            "Axis key must be snake_case (lowercase letters, numbers, and underscores only).",
        });
      }

      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Axis keys must be unique within the response.",
        });
        return;
      }

      seen.add(axis.key);
    });
  });

export const suggestAxes = action({
  args: {
    name: v.string(),
    context: v.string(),
    description: v.string(),
    existingAxisKeys: v.optional(v.array(v.string())),
    forceError: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = suggestAxesArgsSchema.parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);

    if (parsedArgs.forceError === true) {
      throw new ConvexError("Forced axis suggestion failure for testing.");
    }

    const settings = await ctx.runQuery(internal.settings.getEffectiveSettingsForOrg, {
      orgId: identity.tokenIdentifier,
    });
    const modelOverride = settings.modelConfig.find(
      (entry: { taskCategory: string; modelId: string }) =>
        entry.taskCategory === "recommendation",
    )?.modelId;
    const result = await generateWithModel("recommendation", {
      system: buildSuggestAxesSystemPrompt(),
      prompt: buildSuggestAxesPrompt(parsedArgs),
      modelOverride,
    });

    return parseSuggestedAxes(result.text);
  },
});

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function parseSuggestedAxes(responseText: string) {
  let parsedJson: unknown;
  const cleaned = stripMarkdownFences(responseText);

  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new ConvexError("Failed to parse suggested axes JSON.");
  }

  if (Array.isArray(parsedJson)) {
    parsedJson = parsedJson.map((axis: Record<string, unknown>) => ({
      weight: 1,
      ...axis,
    }));
  }

  const parsedAxes = suggestedAxesSchema.safeParse(parsedJson);

  if (!parsedAxes.success) {
    throw new ConvexError(
      `Suggested axes response is invalid: ${formatZodIssues(parsedAxes.error)}`,
    );
  }

  return parsedAxes.data;
}

function formatZodIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path =
        issue.path.length > 0
          ? issue.path
              .map((segment) =>
                typeof segment === "number" ? `[${segment}]` : String(segment),
              )
              .join(".")
              .replace(".[", "[")
          : "response";

      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
