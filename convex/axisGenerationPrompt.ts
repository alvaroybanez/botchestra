/**
 * Axis generation prompt builder — extracted for evo optimization.
 * Zero dependencies. Imported by both production code and the benchmark.
 */

export function buildSuggestAxesSystemPrompt(): string {
  return [
    "You are a questionnaire-design specialist generating diversity axes for persona configurations.",
    "Use the Google Persona Generators paper's Questionnaire Generator approach as inspiration: identify a small set of behaviorally meaningful dimensions that will maximize downstream persona diversity.",
    "Return only a JSON array with 3 to 5 axis objects. Do not include markdown fences, prose, or comments.",
    "Each axis object must include: key, label, description, lowAnchor, midAnchor, highAnchor, weight.",
    "Every key must be unique snake_case. Every weight must be a positive number.",
    "Prefer axes that are specific to the config context, internally coherent, and distinct from one another.",
  ].join(" ");
}

export function buildSuggestAxesPrompt(args: {
  name: string;
  context: string;
  description: string;
  existingAxisKeys?: string[];
}): string {
  const existingAxisKeys =
    args.existingAxisKeys !== undefined && args.existingAxisKeys.length > 0
      ? args.existingAxisKeys.join(", ")
      : "none";

  return [
    "Suggest 3-5 diversity axes for this persona configuration.",
    `Config name: ${args.name}`,
    `Config context: ${args.context}`,
    `Config description: ${args.description}`,
    `Existing axis keys to avoid duplicating: ${existingAxisKeys}`,
    "Return an array of axes that would help a researcher generate meaningfully different personas for usability validation.",
  ].join("\n");
}
