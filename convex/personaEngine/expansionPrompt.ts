/**
 * Expansion prompt builder — extracted for evo optimization.
 * Zero dependencies. Imported by both production code and the benchmark.
 */

export function buildExpansionPrompt(
  config: { name: string; context: string },
  syntheticUser: { summary: string; evidenceSnippets: string[] },
  axisValues: Record<string, number>,
): string {
  return [
    `Config name: ${config.name}`,
    `Config context: ${config.context}`,
    `Synthetic user summary: ${syntheticUser.summary}`,
    `Evidence snippets: ${syntheticUser.evidenceSnippets.join(" | ")}`,
    `Axis values: ${JSON.stringify(axisValues)}`,
    "Return JSON with keys firstPersonBio, behaviorRules, tensionSeed, coherenceScore.",
    "The bio must be 80-150 words, behaviorRules must contain 5-8 strings, tensionSeed must be non-empty, and coherenceScore must be between 0 and 1.",
  ].join("\n");
}

export const EXPANSION_SYSTEM_PROMPT =
  "Return only valid JSON for a synthetic persona variant. Do not include markdown fences.";
