"use node";

import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { axisSchema } from "./personaPacks";
import { requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const AXIS_KEY_PATTERN = /^[a-z0-9_]+$/;

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const suggestAxesArgsSchema = z.object({
  name: requiredString("Pack name"),
  context: requiredString("Pack context"),
  description: requiredString("Pack description"),
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

function buildSuggestAxesSystemPrompt() {
  return [
    "You are a questionnaire-design specialist generating diversity axes for persona packs.",
    "Use the Google Persona Generators paper's Questionnaire Generator approach as inspiration: identify a small set of behaviorally meaningful dimensions that will maximize downstream persona diversity.",
    "Return only a JSON array with 3 to 5 axis objects. Do not include markdown fences, prose, or comments.",
    "Each axis object must include: key, label, description, lowAnchor, midAnchor, highAnchor, weight.",
    "Every key must be unique snake_case. Every weight must be a positive number.",
    "Prefer axes that are specific to the pack context, internally coherent, and distinct from one another.",
  ].join(" ");
}

function buildSuggestAxesPrompt(args: z.infer<typeof suggestAxesArgsSchema>) {
  const existingAxisKeys =
    args.existingAxisKeys !== undefined && args.existingAxisKeys.length > 0
      ? args.existingAxisKeys.join(", ")
      : "none";

  return [
    "Suggest 3-5 diversity axes for this persona pack.",
    `Pack name: ${args.name}`,
    `Pack context: ${args.context}`,
    `Pack description: ${args.description}`,
    `Existing axis keys to avoid duplicating: ${existingAxisKeys}`,
    "Return an array of axes that would help a researcher generate meaningfully different personas for usability validation.",
  ].join("\n");
}

function parseSuggestedAxes(responseText: string) {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new ConvexError("Failed to parse suggested axes JSON.");
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
