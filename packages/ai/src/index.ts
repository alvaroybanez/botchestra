import { createOpenAI, openai } from "@ai-sdk/openai";
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
  expansion: "gpt-5.4-nano",
  action: "gpt-5.4-nano",
  summarization: "gpt-5.4-nano",
  clustering: "gpt-5.4-nano",
  recommendation: "gpt-5.4-nano",
};

// -- Model resolution --------------------------------------------------------

function getEnvValue(key: string) {
  if (typeof process === "undefined") {
    return undefined;
  }

  return process.env[key];
}

export function resolveModel(category: TaskCategory, modelOverride?: string): string;
export function resolveModel(category: TaskCategory, modelOverride?: string): string {
  const normalizedOverride = modelOverride?.trim();
  if (normalizedOverride) {
    return normalizedOverride;
  }

  const envKey = `BOTCHESTRA_MODEL_${category.toUpperCase()}`;
  return getEnvValue(envKey) || MODEL_CONFIG[category];
}

// -- generateWithModel -------------------------------------------------------

type GenerateOptions = {
  prompt: string;
  system?: string;
  modelOverride?: string;
  apiKey?: string;
  baseURL?: string;
  stream?: false;
} & Omit<Parameters<typeof generateText>[0], "model" | "prompt" | "system">;

type StreamOptions = {
  prompt: string;
  system?: string;
  modelOverride?: string;
  apiKey?: string;
  baseURL?: string;
  stream: true;
} & Omit<Parameters<typeof streamText>[0], "model" | "prompt" | "system">;

function resolveProvider(apiKey?: string, baseURL?: string) {
  const normalizedApiKey = apiKey?.trim();
  const normalizedBaseURL = baseURL?.trim() || getEnvValue("OPENAI_BASE_URL")?.trim();
  if (!normalizedApiKey && !normalizedBaseURL) {
    return openai;
  }

  return createOpenAI({
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    ...(normalizedBaseURL ? { baseURL: normalizedBaseURL } : {}),
  });
}

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
  const modelId = resolveModel(category, options.modelOverride);
  const model = resolveProvider(options.apiKey, options.baseURL)(modelId);

  if ("stream" in options && options.stream) {
    const { stream: _, modelOverride: __, apiKey: ___, baseURL: ____, ...rest } = options;
    return streamText({ ...rest, model });
  }

  const {
    stream: _,
    modelOverride: __,
    apiKey: ___,
    baseURL: ____,
    ...rest
  } = options as GenerateOptions & {
    stream?: false;
  };
  return generateText({ ...rest, model });
}
