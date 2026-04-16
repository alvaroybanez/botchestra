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
  "You are writing a post-task self-report in the voice of a specific synthetic persona. Speak strictly as that person in first person (\"I\", \"my\", \"me\") — never as a neutral analyst or observer. Return only valid JSON matching the requested schema, with no markdown fences, no prose outside the JSON, and keys kept exact and verbatim.";

export function buildSelfReportPrompt(
  request: SelfReportPromptRequest,
  result: SelfReportPromptResult,
): string {
  const milestoneSummary = result.milestones.length === 0
    ? "No milestones were captured."
    : result.milestones
      .map(
        (milestone) =>
          `  - step ${milestone.stepIndex + 1}: ${milestone.actionType} on ${milestone.title} (${milestone.url})`,
      )
      .join("\n");

  const behaviorRulesList = request.personaVariant.behaviorRules.length === 0
    ? "  - (no explicit rules)"
    : request.personaVariant.behaviorRules.map((rule) => `  - ${rule}`).join("\n");

  const questionList = request.taskSpec.postTaskQuestions.length === 0
    ? "  (no post-task questions — return answers as an empty object {})"
    : request.taskSpec.postTaskQuestions.map((q) => `  - ${q}`).join("\n");

  const outcome = result.finalOutcome;
  const outcomeGuidance = outcome === "SUCCESS"
    ? "The run SUCCEEDED. perceivedSuccess must be true. Confidence belongs in the 0.6-1.0 range — higher if the flow was smooth, lower if I hit real friction along the way."
    : outcome === "ABANDONED"
      ? "The run was ABANDONED — I gave up before finishing. perceivedSuccess must be false. Confidence belongs in the 0.1-0.4 range. Put my feeling about quitting in hardestPart (my voice and emotion). Put the concrete thing that drove me to quit in confusion (mention upload, form, verification, step, page, or whichever part of the milestones kept tripping me up)."
      : "The run FAILED — something stopped me before I could finish. perceivedSuccess must be false. Confidence belongs in the 0.0-0.3 range. Put my feeling about the failure in hardestPart (my voice and emotion, drawing on bio/tension). Put the symptom in confusion using hedged blocker language (e.g. \"I was blocked\", \"the page stopped responding\", \"I was prevented from continuing\", \"it wouldn't let me finish\", \"something errored out\") — even if no explicit error code is visible, I can still name the symptom from the last milestone or the outcome itself.";

  return [
    "<instructions>",
    "Write a persona-authentic post-task self-report for the completed browser run described below.",
    "Speak strictly in first person AS the persona — use \"I\", \"my\", \"me\" in every free-text field (hardestPart, confusion, suggestedChange, and every answer string). Do not write in third person or as an analyst.",
    "Ground your voice in the persona: echo 2-3 specific words or phrases from the persona bio, behavior rules, or tension seed across your free-text fields. Use the vocabulary this persona would actually use.",
    "Keep it tight: 1-2 sentences per field is ideal, 3 at most.",
    "Key fidelity: every key inside \"answers\" MUST be the exact verbatim question text from <questions> below — do not paraphrase, do not add extra keys, do not drop any.",
    "Output is pure JSON only. No markdown fences, no commentary before or after the JSON.",
    "</instructions>",
    "",
    "<persona>",
    `  <bio>${request.personaVariant.firstPersonBio}</bio>`,
    `  <tension>${request.personaVariant.tensionSeed}</tension>`,
    "  <behavior_rules>",
    behaviorRulesList,
    "  </behavior_rules>",
    "</persona>",
    "",
    "<run>",
    `  <scenario>${request.taskSpec.scenario}</scenario>`,
    `  <goal>${request.taskSpec.goal}</goal>`,
    `  <final_outcome>${outcome}</final_outcome>`,
    `  <step_count>${result.stepCount}</step_count>`,
    `  <duration_seconds>${result.durationSec}</duration_seconds>`,
    `  <frustration_count>${result.frustrationCount}</frustration_count>`,
    "  <milestones>",
    milestoneSummary,
    "  </milestones>",
    `  <outcome_guidance>${outcomeGuidance}</outcome_guidance>`,
    "</run>",
    "",
    "<questions>",
    questionList,
    "</questions>",
    "",
    "<output_schema>",
    "Return a single JSON object with exactly these keys:",
    "  1. perceivedSuccess (boolean) — true if I feel the goal was reached, false otherwise. Must be consistent with <final_outcome> and <outcome_guidance>.",
    "  2. hardestPart (string) — in first person, my emotional take on what was hardest. Speak in my persona voice (draw on bio and tension). This field owns feeling, not mechanics.",
    "  3. confusion (string) — in first person, the concrete physical or system-level symptom I observed. On FAILED/ABANDONED, this is where the blocker language goes (blocked, stopped, prevented, wouldn't load, timed out, errored, page didn't respond). On SUCCESS, a brief sensory/UX observation or leave terse if nothing stood out.",
    "  4. confidence (number between 0 and 1) — how sure I am the goal was reached, calibrated to the outcome band in <outcome_guidance>.",
    "  5. suggestedChange (string) — in first person, one change I would make to this experience.",
    "  6. answers (object) — one entry per question in <questions>, with keys kept exact and verbatim from the list above, and each value a first-person string answer in my voice.",
    "</output_schema>",
  ].join("\n");
}
