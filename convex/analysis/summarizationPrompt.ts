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
  "Return only valid JSON. Summarize one synthetic usability run using concise evidence-backed language. Never invent values — use null when data is absent.";

export function buildSummarizationPrompt(run: RunSummaryPromptContext): string {
  const selfReportTextFields = run.selfReport
    ? [
        run.selfReport.hardestPart,
        run.selfReport.confusion,
        run.selfReport.suggestedChange,
        ...Object.values(run.selfReport.answers ?? {}).filter(
          (v): v is string => typeof v === "string",
        ),
      ].filter(Boolean)
    : [];
  const selfReportHasText = selfReportTextFields.length > 0;

  const milestoneNotes = run.milestones
    .map((m) => m.note)
    .filter((n): n is string => n != null && n.length > 0);
  const quoteContextHint =
    !selfReportHasText && run.selfReport !== null
      ? milestoneNotes.length > 0
        ? `Use this context for representativeQuote: "${milestoneNotes[milestoneNotes.length - 1]}"`
        : run.errorCode
          ? `Use this context for representativeQuote: error ${run.errorCode} at ${run.finalUrl ?? "unknown URL"}`
          : `Use this context for representativeQuote: run ended with status '${run.status}' at ${run.finalUrl ?? "unknown URL"}`
      : null;

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
      selfReportedConfidence: null,
      representativeQuote: null,
    }),
    "",
    "OUTCOME CLASSIFICATION — use this mapping exactly, no exceptions:",
    "  - Run status 'success'                         → outcomeClassification = \"success\"",
    "  - Run status 'hard_fail', 'soft_fail',",
    "    'blocked_by_guardrail', or any error status  → outcomeClassification = \"failure\"",
    "  - Run status 'gave_up', 'timeout', or any",
    "    abandoned/timed-out status                   → outcomeClassification = \"abandoned\"",
    "  If the status does not match any of the above, use the finalOutcome field to decide.",
    "",
    "FAILURE SUMMARY RULES (follow precisely):",
    "  - For outcomeClassification = \"success\": failureSummary must state that the run completed successfully (use words like 'completed', 'success', 'no failures', or 'smooth').",
    "  - For outcomeClassification = \"failure\" or \"abandoned\": failureSummary must be 5–25 words referencing concrete context (error codes, URLs, or blocking text).",
    "  - Do not leave failureSummary null for any outcome.",
    "",
    "SELF-REPORTED CONFIDENCE RULES (follow precisely):",
    "  - If selfReport is null or all its fields are null/empty: set selfReportedConfidence = null.",
    "  - If selfReport.confidence is a number: set selfReportedConfidence = that EXACT number, copied verbatim.",
    "  - NEVER invent or guess a confidence value. Only use the value explicitly provided.",
    "  - NEVER default to 0.5 — if unsure, use null.",
    "",
    "REPRESENTATIVE QUOTE RULES (follow precisely):",
    `  - Self report has usable text fields (hardestPart, confusion, suggestedChange, or string answers): ${selfReportHasText ? "YES" : "NO"}.`,
    "  - If self report has usable text (YES above): extract the most revealing phrase verbatim or near-verbatim from those text fields.",
    "  - If self report has NO usable text (NO above) but selfReport object exists: use the provided quote context hint below (MUST NOT be null).",
    "  - If selfReport is completely null (not collected): set representativeQuote = null.",
    "  - NEVER fabricate content that does not appear in selfReport fields, milestone notes, or run context.",
    ...(quoteContextHint ? [`  - QUOTE CONTEXT HINT: ${quoteContextHint}`] : []),
    "",
    "OTHER RULES:",
    "  - Use [] when there are no frustration markers.",
    "  - All fields are required in the JSON output; use null for unknown values.",
    `Run status: ${run.status}`,
    `Final outcome: ${run.finalOutcome ?? "not captured"}`,
    `Final URL: ${run.finalUrl ?? "not captured"}`,
    `Error code: ${run.errorCode ?? "none"}`,
    `Step count: ${run.stepCount ?? "not captured"}`,
    `Duration seconds: ${run.durationSec ?? "not captured"}`,
    `Frustration count: ${run.frustrationCount}`,
    `Self report (null means no self-report was collected): ${JSON.stringify(run.selfReport ?? null)}`,
    `Self report has usable text: ${selfReportHasText}`,
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
