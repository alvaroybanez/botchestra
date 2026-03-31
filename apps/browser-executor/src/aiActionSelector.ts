import { generateWithModel } from "@botchestra/ai";
import type { ObservationActionHistoryEntry } from "./observationBuilder";
import { createFallbackActionSelector } from "./fallbackActionSelector";
import type { AgentAction, SelectActionInput } from "./runExecutor";

type GenerateActionResult = { text: string } | string;
type GenerateActionOptions = {
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
};

export type CreateAiActionSelectorOptions = {
  generateAction?: (options: GenerateActionOptions) => Promise<GenerateActionResult>;
  timeoutMs?: number;
};

type ParsedAction = Pick<AgentAction, "type" | "url" | "selector" | "text" | "value" | "rationale">;

const ACTION_RESPONSE_SHAPE =
  "{type, url?, selector?, text?, value?, rationale}";

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function toGenerateTextResult(result: GenerateActionResult) {
  return typeof result === "string" ? result : result.text;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function summarizeActionHistory(actionHistory: readonly ObservationActionHistoryEntry[]) {
  if (actionHistory.length === 0) {
    return "No prior actions recorded.";
  }

  return actionHistory
    .map((entry) => {
      const target = entry.target ? ` ${entry.target}` : "";
      const outcome = entry.outcome ? ` -> ${entry.outcome}` : "";
      return `#${entry.stepIndex + 1} ${entry.actionType}${target}${outcome}`;
    })
    .join("\n");
}

function buildSystemPrompt(input: SelectActionInput) {
  const { personaVariant, taskSpec } = input.request;

  return [
    "You are selecting the next browser action for a synthetic persona navigating a web flow.",
    "Stay persona-authentic, goal-directed, and safe.",
    `Return only valid JSON matching exactly ${ACTION_RESPONSE_SHAPE}.`,
    `Allowed actions: ${taskSpec.allowedActions.join(", ")}.`,
    "",
    "Persona context:",
    `- First-person bio: ${personaVariant.firstPersonBio}`,
    `- Behavior rules: ${personaVariant.behaviorRules.join(" | ") || "None provided"}`,
    `- Tension seed: ${personaVariant.tensionSeed}`,
    `- Axis values: ${stringify(personaVariant.axisValues)}`,
    "",
    "Task spec:",
    `- Scenario: ${taskSpec.scenario}`,
    `- Goal: ${taskSpec.goal}`,
    `- Success criteria: ${taskSpec.successCriteria.join(" | ")}`,
    `- Starting URL: ${taskSpec.startingUrl}`,
  ].join("\n");
}

function buildUserPrompt(input: SelectActionInput) {
  const { page, observation, actionHistory, request, stepIndex } = input;
  const interactiveElements = page.interactiveElements.map((element) => ({
    role: element.role,
    label: element.label,
    selector: element.selector ?? null,
    hint: element.hint ?? null,
    disabled: element.disabled ?? false,
  }));

  return [
    "Choose the single best next action.",
    `Step ${stepIndex + 1} of ${request.taskSpec.maxSteps}.`,
    "",
    "Observation bundle:",
    observation.text,
    "",
    "Page state:",
    `- URL: ${page.url}`,
    `- Title: ${page.title}`,
    `- Visible text excerpt: ${observation.visibleTextExcerpt}`,
    `- Interactive elements: ${stringify(interactiveElements)}`,
    "",
    "Action history:",
    summarizeActionHistory(actionHistory),
    "",
    "Step progress:",
    observation.taskProgressSummary,
    "",
    "Respond with JSON only.",
  ].join("\n");
}

function extractJsonCandidate(value: string) {
  const trimmed = value.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return withoutFence.slice(objectStart, objectEnd + 1);
  }

  return withoutFence;
}

function parseActionResponse(text: string): ParsedAction {
  const candidates = [text, extractJsonCandidate(text)];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown> | null;

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed action was not an object");
      }

      const type = normalizeOptionalString(parsed.type);
      if (!type) {
        throw new Error("Action type is required");
      }

      return {
        type,
        url: normalizeOptionalString(parsed.url),
        selector: normalizeOptionalString(parsed.selector),
        text: normalizeOptionalString(parsed.text),
        value: normalizeOptionalString(parsed.value),
        rationale: normalizeOptionalString(parsed.rationale),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`AI action response was not valid JSON: ${String(lastError)}`);
}

function getSafeFallbackAction(input: SelectActionInput, invalidType: string): AgentAction {
  const { allowedActions, startingUrl } = input.request.taskSpec;
  const firstInteractiveSelector = input.page.interactiveElements.find((element) =>
    typeof element.selector === "string" && element.selector.trim().length > 0
  )?.selector;

  if (allowedActions.includes("finish")) {
    return {
      type: "finish",
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback finish action was used.`,
    };
  }

  if (allowedActions.includes("click") && firstInteractiveSelector) {
    return {
      type: "click",
      selector: firstInteractiveSelector,
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback click action was used.`,
    };
  }

  if (allowedActions.includes("goto")) {
    return {
      type: "goto",
      url: startingUrl,
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback navigation was used.`,
    };
  }

  if (allowedActions.includes("wait")) {
    return {
      type: "wait",
      durationMs: 250,
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback wait action was used.`,
    };
  }

  if (allowedActions.includes("scroll")) {
    return {
      type: "scroll",
      durationMs: 300,
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback scroll action was used.`,
    };
  }

  if (allowedActions.includes("back")) {
    return {
      type: "back",
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback back action was used.`,
    };
  }

  if (allowedActions.includes("abort")) {
    return {
      type: "abort",
      rationale: `Model suggested disallowed action "${invalidType}", so a safe fallback abort action was used.`,
    };
  }

  throw new Error(`Action ${invalidType} is not allowed and no safe fallback action is available`);
}

function ensureAllowedAction(input: SelectActionInput, parsed: ParsedAction): AgentAction {
  if (input.request.taskSpec.forbiddenActions.includes(parsed.type as never)) {
    return {
      type: parsed.type,
      ...(parsed.url ? { url: parsed.url } : {}),
      ...(parsed.selector ? { selector: parsed.selector } : {}),
      ...(parsed.text ? { text: parsed.text } : {}),
      ...(parsed.value ? { value: parsed.value } : {}),
      rationale: parsed.rationale ?? `Advance toward the goal with ${parsed.type}.`,
    };
  }

  if (!input.request.taskSpec.allowedActions.includes(parsed.type as never)) {
    return getSafeFallbackAction(input, parsed.type);
  }

  return {
    type: parsed.type,
    ...(parsed.url ? { url: parsed.url } : {}),
    ...(parsed.selector ? { selector: parsed.selector } : {}),
    ...(parsed.text ? { text: parsed.text } : {}),
    ...(parsed.value ? { value: parsed.value } : {}),
    rationale: parsed.rationale ?? `Advance toward the goal with ${parsed.type}.`,
  };
}

function getTimeoutError(timeoutMs: number) {
  return new Error(`AI action selection timed out after ${timeoutMs}ms`);
}

async function generateActionWithTimeout(
  generateAction: (options: GenerateActionOptions) => Promise<GenerateActionResult>,
  options: GenerateActionOptions,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutError = getTimeoutError(timeoutMs);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const generation = generateAction({
      ...options,
      abortSignal: controller.signal,
    });
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });

    return await Promise.race([generation, timeout]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function defaultGenerateAction(options: GenerateActionOptions) {
  return generateWithModel("action", {
    system: options.system,
    prompt: options.prompt,
    abortSignal: options.abortSignal,
  });
}

export function createAiActionSelector(options: CreateAiActionSelectorOptions = {}) {
  const generateAction = options.generateAction ?? defaultGenerateAction;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return async (input: SelectActionInput): Promise<AgentAction> => {
    const system = buildSystemPrompt(input);
    const prompt = buildUserPrompt(input);
    const response = await generateActionWithTimeout(generateAction, { system, prompt }, timeoutMs);
    const parsed = parseActionResponse(toGenerateTextResult(response));

    return ensureAllowedAction(input, parsed);
  };
}

export function createAiActionSelectorWithFallback(options: CreateAiActionSelectorOptions = {}) {
  const aiSelector = createAiActionSelector(options);
  const fallbackSelector = createFallbackActionSelector();

  return async (input: SelectActionInput): Promise<AgentAction> => {
    try {
      return await aiSelector(input);
    } catch {
      return fallbackSelector(input);
    }
  };
}
