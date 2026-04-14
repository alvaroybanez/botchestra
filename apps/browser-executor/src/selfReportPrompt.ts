/**
 * Self-report prompt builder — extracted for evo optimization.
 * Zero dependencies. Imported by both production code and the benchmark.
 */

export type SelfReportPromptRequest = {
  taskSpec: {
    scenario: string;
    goal: string;
    postTaskQuestions: readonly string[];
  };
  personaVariant: {
    firstPersonBio: string;
    behaviorRules: readonly string[];
    tensionSeed: string;
  };
};

export type SelfReportPromptMilestone = {
  stepIndex: number;
  actionType: string;
  title: string;
  url: string;
};

export type SelfReportPromptResult = {
  finalOutcome: string;
  stepCount: number;
  durationSec: number;
  frustrationCount: number;
  milestones: readonly SelfReportPromptMilestone[];
};

export const SELF_REPORT_SYSTEM_PROMPT =
  "You are generating a concise post-task self-report for a synthetic persona. Return only valid JSON with no markdown fences.";

export function buildSelfReportPrompt(
  request: SelfReportPromptRequest,
  result: SelfReportPromptResult,
): string {
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
