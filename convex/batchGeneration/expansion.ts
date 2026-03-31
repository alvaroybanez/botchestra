import { ConvexError } from "convex/values";
import { z } from "zod";

import type { Doc } from "../_generated/dataModel";

const expandedSyntheticUserResponseSchema = z.object({
  name: z.string().trim().min(1, "Generated synthetic user name is required."),
  summary: z
    .string()
    .trim()
    .min(1, "Generated synthetic user summary is required.")
    .optional(),
  firstPersonBio: z
    .string()
    .trim()
    .min(1, "Generated synthetic user bio is required."),
  behaviorRules: z
    .array(z.string().trim().min(1, "Behavior rule is required."))
    .min(1, "At least one behavior rule is required."),
  tensionSeed: z
    .string()
    .trim()
    .min(1, "Generated synthetic user tension seed is required."),
});

export const expandedSyntheticUserPersistedSchema = z.object({
  name: z.string(),
  summary: z.string(),
  axes: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string(),
      lowAnchor: z.string(),
      midAnchor: z.string(),
      highAnchor: z.string(),
      weight: z.number(),
    }),
  ),
  firstPersonBio: z.string(),
  behaviorRules: z.array(z.string()),
  tensionSeed: z.string().optional(),
});

export type ExpandedSyntheticUser = z.infer<
  typeof expandedSyntheticUserPersistedSchema
>;

export function buildExpandedSyntheticUserPrompt(
  config: Doc<"personaConfigs">,
  syntheticUser: Pick<
    Doc<"syntheticUsers">,
    "axes" | "axisValues" | "name" | "summary" | "evidenceSnippets"
  >,
) {
  return [
    `Config name: ${config.name}`,
    `Config description: ${config.description}`,
    `Config context: ${config.context}`,
    `Shared axes: ${JSON.stringify(config.sharedAxes)}`,
    `Target axis values: ${JSON.stringify(syntheticUser.axisValues ?? [])}`,
    `Current synthetic user name: ${syntheticUser.name}`,
    `Current synthetic user summary: ${syntheticUser.summary}`,
    `Evidence snippets: ${syntheticUser.evidenceSnippets.join(" | ") || "none"}`,
    "Return JSON with keys name, firstPersonBio, behaviorRules, tensionSeed.",
    "You may optionally include summary. Do not include axes; the config axes are the source of truth.",
    "Keep the output grounded in the target axis values and the config context.",
  ].join("\n");
}

export function parseExpandedSyntheticUserResponse(
  responseText: string,
  fallbackAxes: Doc<"personaConfigs">["sharedAxes"],
) {
  let parsedJson: unknown;
  const cleaned = stripMarkdownFences(responseText);

  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new ConvexError("Failed to parse generated synthetic user JSON.");
  }

  if (parsedJson !== null && typeof parsedJson === "object") {
    const parsedJsonRecord = parsedJson as {
      axes?: unknown;
      tensionSeed?: unknown;
    };

    parsedJson = {
      ...parsedJsonRecord,
      ...(parsedJsonRecord.tensionSeed !== undefined &&
      typeof parsedJsonRecord.tensionSeed !== "string"
        ? {
            tensionSeed: Array.isArray(parsedJsonRecord.tensionSeed)
              ? parsedJsonRecord.tensionSeed.join("; ")
              : String(parsedJsonRecord.tensionSeed),
          }
        : {}),
    };
  }

  const parsedResponse = expandedSyntheticUserResponseSchema.safeParse(parsedJson);

  if (!parsedResponse.success) {
    throw new ConvexError(
      `Generated synthetic user response is invalid: ${formatZodIssues(parsedResponse.error)}`,
    );
  }

  return {
    name: parsedResponse.data.name.trim(),
    summary:
      parsedResponse.data.summary?.trim() ??
      parsedResponse.data.firstPersonBio.trim(),
    axes: fallbackAxes,
    firstPersonBio: parsedResponse.data.firstPersonBio.trim(),
    behaviorRules: parsedResponse.data.behaviorRules.map((rule) => rule.trim()),
    tensionSeed: parsedResponse.data.tensionSeed.trim(),
  };
}

function formatZodIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path =
        issue.path.length === 0
          ? "response"
          : issue.path
              .map((segment) =>
                typeof segment === "number" ? `[${segment}]` : String(segment),
              )
              .join(".")
              .replace(".[", "[");

      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function stripMarkdownFences(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}
