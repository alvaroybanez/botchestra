import { generateWithModel } from "@botchestra/ai";
import {
  SelfReportSchema,
  type ExecuteRunRequest,
  type SelfReport,
  type SelfReportAnswer,
} from "@botchestra/shared";
import type { RunExecutionResult } from "./runExecutor";

type SelfReportTextGenerator = (prompt: string) => Promise<{ text: string } | string>;

type GenerateSelfReportOptions = {
  request: ExecuteRunRequest;
  result: RunExecutionResult;
  generateText?: SelfReportTextGenerator;
};

type SelfReportWithAnswers = SelfReport & {
  answers: Record<string, SelfReportAnswer>;
};

const SELF_REPORT_SYSTEM_PROMPT =
  "You are generating a concise post-task self-report for a synthetic persona. Return only valid JSON with no markdown fences.";

async function defaultGenerateText(prompt: string) {
  return generateWithModel("summarization", {
    system: SELF_REPORT_SYSTEM_PROMPT,
    prompt,
  });
}

function stripMarkdownCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
}

function inferPerceivedSuccess(result: RunExecutionResult) {
  return result.ok && result.finalOutcome === "SUCCESS";
}

function inferConfidence(result: RunExecutionResult) {
  if (result.ok && result.finalOutcome === "SUCCESS") {
    return 0.9;
  }

  if (result.ok && result.finalOutcome === "ABANDONED") {
    return 0.35;
  }

  return 0.15;
}

function inferHardestPart(result: RunExecutionResult) {
  if (!result.ok) {
    return result.message;
  }

  const lastMilestone = result.milestones.at(-1);

  if (lastMilestone) {
    return `Reaching ${lastMilestone.title} after ${lastMilestone.actionType}.`;
  }

  return "Deciding on the next step.";
}

function inferConfusion(result: RunExecutionResult) {
  if (!result.ok) {
    return result.message;
  }

  if (result.finalOutcome === "ABANDONED") {
    return "Repeated friction and uncertainty caused the task to be abandoned.";
  }

  return "No major confusion remained by the end of the task.";
}

function inferSuggestedChange(result: RunExecutionResult) {
  if (!result.ok) {
    return "Make failure states easier to recover from and clarify the next action.";
  }

  if (result.finalOutcome === "ABANDONED") {
    return "Reduce repeated friction and make the recovery path clearer.";
  }

  return "Keep the next action obvious and reduce ambiguity in the flow.";
}

function createFallbackAnswer(
  question: string,
  result: RunExecutionResult,
  report: Omit<SelfReportWithAnswers, "answers">,
) {
  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes("complete")) {
    return report.perceivedSuccess;
  }

  if (normalizedQuestion.includes("hardest")) {
    return report.hardestPart ?? inferHardestPart(result);
  }

  if (
    normalizedQuestion.includes("confus")
    || normalizedQuestion.includes("frustrat")
  ) {
    return report.confusion ?? inferConfusion(result);
  }

  if (normalizedQuestion.includes("confident")) {
    return report.confidence ?? inferConfidence(result);
  }

  if (normalizedQuestion.includes("change")) {
    return report.suggestedChange ?? inferSuggestedChange(result);
  }

  if (!result.ok) {
    return `${result.finalOutcome}: ${result.message}`;
  }

  return result.finalOutcome === "SUCCESS"
    ? "The task reached a successful end state."
    : "The task ended before completion.";
}

function createFallbackSelfReport(
  request: ExecuteRunRequest,
  result: RunExecutionResult,
): SelfReportWithAnswers {
  const baseReport: Omit<SelfReportWithAnswers, "answers"> = {
    perceivedSuccess: inferPerceivedSuccess(result),
    hardestPart: inferHardestPart(result),
    confusion: inferConfusion(result),
    confidence: inferConfidence(result),
    suggestedChange: inferSuggestedChange(result),
  };

  return {
    ...baseReport,
    answers: buildAnswersMap(
      request.taskSpec.postTaskQuestions,
      (question) => createFallbackAnswer(question, result, baseReport),
    ),
  };
}

function buildSelfReportPrompt(
  request: ExecuteRunRequest,
  result: RunExecutionResult,
) {
  const milestoneSummary = result.milestones.length === 0
    ? "No milestones were captured."
    : result.milestones
      .map(
        (milestone) =>
          `step ${milestone.stepIndex + 1}: ${milestone.actionType} on ${milestone.title} (${milestone.url})`,
      )
      .join("\n");

  return [
    "Generate a persona-authentic post-task self-report for the completed browser run.",
    `Scenario: ${request.taskSpec.scenario}`,
    `Goal: ${request.taskSpec.goal}`,
    `Persona bio: ${request.personaVariant.firstPersonBio}`,
    `Behavior rules: ${request.personaVariant.behaviorRules.join(" | ")}`,
    `Tension seed: ${request.personaVariant.tensionSeed}`,
    `Final outcome: ${result.finalOutcome}`,
    `Step count: ${result.stepCount}`,
    `Duration seconds: ${result.durationSec}`,
    `Frustration count: ${result.frustrationCount}`,
    "Milestones:",
    milestoneSummary,
    `Questions (answer every question using the exact question text as the key): ${JSON.stringify(
      request.taskSpec.postTaskQuestions,
    )}`,
    'Return JSON with keys: perceivedSuccess (boolean), hardestPart (string), confusion (string), confidence (number from 0 to 1), suggestedChange (string), answers (object keyed by the exact question strings).',
  ].join("\n");
}

function buildAnswersMap(
  questions: readonly string[],
  resolveAnswer: (question: string) => SelfReportAnswer,
) {
  return questions.reduce<Record<string, SelfReportAnswer>>((answers, question) => {
    answers[question] = resolveAnswer(question);
    return answers;
  }, {});
}

function normalizeSelfReport(
  parsed: SelfReport,
  fallback: SelfReportWithAnswers,
  questions: readonly string[],
) {
  return {
    perceivedSuccess: parsed.perceivedSuccess,
    hardestPart: parsed.hardestPart ?? fallback.hardestPart,
    confusion: parsed.confusion ?? fallback.confusion,
    confidence: parsed.confidence ?? fallback.confidence,
    suggestedChange: parsed.suggestedChange ?? fallback.suggestedChange,
    answers: buildAnswersMap(
      questions,
      (question) => parsed.answers?.[question] ?? fallback.answers[question] ?? "",
    ),
  } satisfies SelfReportWithAnswers;
}

export async function generateSelfReport(
  options: GenerateSelfReportOptions,
): Promise<SelfReportWithAnswers> {
  const fallback = createFallbackSelfReport(options.request, options.result);
  const generateText = options.generateText ?? defaultGenerateText;

  try {
    const generated = await generateText(
      buildSelfReportPrompt(options.request, options.result),
    );
    const rawText = typeof generated === "string" ? generated : generated.text;
    const parsed = SelfReportSchema.safeParse(
      JSON.parse(stripMarkdownCodeFence(rawText)),
    );

    if (!parsed.success) {
      return fallback;
    }

    return normalizeSelfReport(
      parsed.data,
      fallback,
      options.request.taskSpec.postTaskQuestions,
    );
  } catch {
    return fallback;
  }
}
