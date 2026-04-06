import { generateWithModel } from "@botchestra/ai";
import type { ObservationActionHistoryEntry } from "./observationBuilder";
import { createFallbackActionSelector } from "./fallbackActionSelector";
import type { AgentAction, SelectActionInput } from "./runExecutor";
import {
  getErrorMessage,
  logStructured,
  truncateForLog,
} from "./structuredLogger";

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

type ParsedAction = Pick<AgentAction, "type" | "ref" | "url" | "selector" | "text" | "value" | "rationale">;
type AllowedActionResult = {
  action: AgentAction;
  recoveryReason?: string;
};

const ACTION_RESPONSE_SHAPE =
  "{type, ref?, url?, selector?, text?, value?, rationale}";
const ACTION_MODEL_CATEGORY = "action";

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
    "When interactive elements include a ref like @e1, prefer returning ref instead of selector.",
    "Only return one targeting field for element actions: prefer ref; otherwise use selector.",
    "IMPORTANT: If your action history shows you tried the same action and the outcome was no visible change, you MUST try a completely different action or selector. Never repeat a failed action.",
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
    ref: element.ref ?? null,
    role: element.role,
    label: element.label,
    selector: element.selector ?? null,
    href: element.href ?? null,
    value: element.value ?? null,
    placeholder: element.placeholder ?? null,
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
    "Prefer refs like @e1 when available in the current snapshot.",
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
        ref: normalizeOptionalString(parsed.ref),
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

function buildAction(parsed: ParsedAction): AgentAction {
  return {
    type: parsed.type,
    ...(parsed.ref ? { ref: parsed.ref } : {}),
    ...(parsed.url ? { url: parsed.url } : {}),
    ...(parsed.selector ? { selector: parsed.selector } : {}),
    ...(parsed.text ? { text: parsed.text } : {}),
    ...(parsed.value ? { value: parsed.value } : {}),
    rationale: parsed.rationale ?? `Advance toward the goal with ${parsed.type}.`,
  };
}

function getRecoveryAction(input: SelectActionInput, reason: string): AgentAction {
  const { allowedActions } = input.request.taskSpec;

  if (allowedActions.includes("wait")) {
    return {
      type: "wait",
      durationMs: 250,
      rationale: `${reason}, so a safe fallback wait action was used.`,
    };
  }

  if (allowedActions.includes("scroll")) {
    return {
      type: "scroll",
      durationMs: 300,
      rationale: `${reason}, so a safe fallback scroll action was used.`,
    };
  }

  if (allowedActions.includes("finish")) {
    return {
      type: "finish",
      rationale: `${reason}, so a safe fallback finish action was used.`,
    };
  }

  if (allowedActions.includes("abort")) {
    return {
      type: "abort",
      rationale: `${reason}, so a safe fallback abort action was used.`,
    };
  }

  return {
    type: "abort",
    rationale: `${reason}, so the selector aborted because no safe allowed action was available.`,
  };
}

function getStructuralValidationError(parsed: ParsedAction) {
  switch (parsed.type) {
    case "goto":
      return parsed.url ? null : 'Model suggested "goto" but the required "url" field was missing';
    case "click":
      return parsed.ref || parsed.selector
        ? null
        : 'Model suggested "click" but the required "ref" or "selector" field was missing';
    case "type":
      if (!parsed.ref && !parsed.selector) {
        return 'Model suggested "type" but the required "ref" or "selector" field was missing';
      }

      return parsed.text ? null : 'Model suggested "type" but the required "text" field was missing';
    case "select":
      if (!parsed.ref && !parsed.selector) {
        return 'Model suggested "select" but the required "ref" or "selector" field was missing';
      }

      return parsed.value ? null : 'Model suggested "select" but the required "value" field was missing';
    default:
      return null;
  }
}

function ensureAllowedAction(input: SelectActionInput, parsed: ParsedAction): AllowedActionResult {
  const structuralValidationError = getStructuralValidationError(parsed);
  if (structuralValidationError) {
    return {
      action: getRecoveryAction(input, structuralValidationError),
      recoveryReason: structuralValidationError,
    };
  }

  if (input.request.taskSpec.forbiddenActions.includes(parsed.type as never)) {
    return { action: buildAction(parsed) };
  }

  if (!input.request.taskSpec.allowedActions.includes(parsed.type as never)) {
    const recoveryReason = `Model suggested disallowed action "${parsed.type}"`;
    return {
      action: getRecoveryAction(input, recoveryReason),
      recoveryReason,
    };
  }

  return { action: buildAction(parsed) };
}

function getTimeoutError(timeoutMs: number) {
  return new Error(`AI action selection timed out after ${timeoutMs}ms`);
}

function isTimeoutError(error: unknown, timeoutMs: number) {
  return error instanceof Error && error.message === getTimeoutError(timeoutMs).message;
}

function toLoggedAction(action: AgentAction) {
  return {
    type: action.type,
    ref: action.ref,
    selector: action.selector,
    rationale: action.rationale,
  };
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
  return generateWithModel(ACTION_MODEL_CATEGORY, {
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
    logStructured("ai.select", input.request.runId, {
      step: input.stepIndex,
      systemPromptLen: system.length,
      userPromptLen: prompt.length,
      model: ACTION_MODEL_CATEGORY,
    });

    const startedAt = Date.now();
    let response: GenerateActionResult;

    try {
      response = await generateActionWithTimeout(generateAction, { system, prompt }, timeoutMs);
    } catch (error) {
      if (isTimeoutError(error, timeoutMs)) {
        logStructured("ai.timeout", input.request.runId, {
          step: input.stepIndex,
        });
      }

      throw error;
    }

    const responseText = toGenerateTextResult(response);
    const durationMs = Date.now() - startedAt;
    let parsed: ParsedAction;

    try {
      parsed = parseActionResponse(responseText);
    } catch (error) {
      const recoveryAction = getRecoveryAction(input, "Model response was malformed JSON");
      logStructured("ai.recovery", input.request.runId, {
        step: input.stepIndex,
        reason: getErrorMessage(error),
        recoveryAction: toLoggedAction(recoveryAction),
      });
      return recoveryAction;
    }

    const allowedAction = ensureAllowedAction(input, parsed);

    if (allowedAction.recoveryReason) {
      logStructured("ai.recovery", input.request.runId, {
        step: input.stepIndex,
        reason: allowedAction.recoveryReason,
        recoveryAction: toLoggedAction(allowedAction.action),
      });
      return allowedAction.action;
    }

    logStructured("ai.response", input.request.runId, {
      step: input.stepIndex,
      rawResponseLen: responseText.length,
      rawResponsePreview: truncateForLog(responseText),
      parsedAction: toLoggedAction(allowedAction.action),
      durationMs,
    });

    return allowedAction.action;
  };
}

export function createAiActionSelectorWithFallback(options: CreateAiActionSelectorOptions = {}) {
  const aiSelector = createAiActionSelector(options);
  const fallbackSelector = createFallbackActionSelector();

  return async (input: SelectActionInput): Promise<AgentAction> => {
    try {
      return await aiSelector(input);
    } catch (error) {
      logStructured("ai.fallback", input.request.runId, {
        step: input.stepIndex,
        reason: getErrorMessage(error),
      });
      return fallbackSelector(input);
    }
  };
}
