import { openai } from "@ai-sdk/openai";
import { generateText, streamText, type GenerateTextResult, type StreamTextResult } from "ai";

// -- Task categories ---------------------------------------------------------

export type TaskCategory =
  | "expansion"
  | "action"
  | "summarization"
  | "clustering"
  | "recommendation";

// -- Model config ------------------------------------------------------------

export const MODEL_CONFIG: Record<TaskCategory, string> = {
  expansion: "gpt-4o",
  action: "gpt-4o-mini",
  summarization: "gpt-4o",
  clustering: "gpt-4o-mini",
  recommendation: "gpt-4o",
};

// -- Model resolution --------------------------------------------------------

export function resolveModel(category: TaskCategory): string {
  const envKey = `BOTCHESTRA_MODEL_${category.toUpperCase()}`;
  return process.env[envKey] || MODEL_CONFIG[category];
}

// -- generateWithModel -------------------------------------------------------

type GenerateOptions = {
  prompt: string;
  system?: string;
  stream?: false;
} & Omit<Parameters<typeof generateText>[0], "model" | "prompt" | "system">;

type StreamOptions = {
  prompt: string;
  system?: string;
  stream: true;
} & Omit<Parameters<typeof streamText>[0], "model" | "prompt" | "system">;

export async function generateWithModel(
  category: TaskCategory,
  options: GenerateOptions,
): Promise<GenerateTextResult<never, never>>;
export async function generateWithModel(
  category: TaskCategory,
  options: StreamOptions,
): Promise<StreamTextResult<never, never>>;
export async function generateWithModel(
  category: TaskCategory,
  options: GenerateOptions | StreamOptions,
) {
  const modelId = resolveModel(category);
  const model = openai(modelId);

  if ("stream" in options && options.stream) {
    const { stream: _, ...rest } = options;
    return streamText({ ...rest, model });
  }

  const { stream: _, ...rest } = options as GenerateOptions & { stream?: false };
  return generateText({ ...rest, model });
}
