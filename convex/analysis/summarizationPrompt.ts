/**
 * Run summarization prompt builder — extracted for evo optimization.
 * Zero dependencies. Imported by both production code and the benchmark.
 */

export type RunSummaryPromptContext = {
  status: string;
  finalOutcome?: string | null;
  finalUrl?: string | null;
  errorCode?: string | null;
  stepCount?: number | null;
  durationSec?: number | null;
  frustrationCount: number;
  selfReport?: {
    confidence?: number | null;
    hardestPart?: string | null;
    confusion?: string | null;
    suggestedChange?: string | null;
    answers?: Record<string, string | number | boolean>;
  } | null;
  milestones: Array<{
    stepIndex: number;
    actionType: string;
    title: string;
    url: string;
    note?: string | null;
  }>;
};

export const SUMMARIZATION_SYSTEM_PROMPT =
  "Return only valid JSON. Summarize one synthetic usability run using concise evidence-backed language.";

export function buildSummarizationPrompt(run: RunSummaryPromptContext): string {
  return [
    "You are summarizing one synthetic user run for downstream issue clustering.",
    "Return JSON with exactly these keys:",
    JSON.stringify({
      outcomeClassification: "success | failure | abandoned",
      failureSummary: "one sentence",
      failurePoint: "where the run failed or ended",
      lastSuccessfulState: "last clearly successful state before failure",
      blockingText: "blocking copy, error, or obstacle",
      frustrationMarkers: ["short marker"],
      selfReportedConfidence: 0.5,
      representativeQuote: "exact or near-exact participant wording",
    }),
    "Rules:",
    "- Use [] when there are no frustration markers.",
    "- Use null when no self-reported confidence exists.",
    "- Keep representativeQuote grounded in the provided self-report text when available.",
    `Run status: ${run.status}`,
    `Final outcome: ${run.finalOutcome ?? "not captured"}`,
    `Final URL: ${run.finalUrl ?? "not captured"}`,
    `Error code: ${run.errorCode ?? "none"}`,
    `Step count: ${run.stepCount ?? "not captured"}`,
    `Duration seconds: ${run.durationSec ?? "not captured"}`,
    `Frustration count: ${run.frustrationCount}`,
    `Self report: ${JSON.stringify(run.selfReport ?? null)}`,
    `Milestones: ${JSON.stringify(
      run.milestones.map((milestone) => ({
        stepIndex: milestone.stepIndex,
        actionType: milestone.actionType,
        title: milestone.title,
        url: milestone.url,
        note: milestone.note ?? null,
      })),
    )}`,
  ].join("\n");
}
