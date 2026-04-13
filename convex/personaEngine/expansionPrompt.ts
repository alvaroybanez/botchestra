/**
 * Expansion prompt builder — extracted for evo optimization.
 * Zero dependencies. Imported by both production code and the benchmark.
 */

function interpretAxisValue(value: number): string {
  if (value <= 0.1) return "extremely low";
  if (value <= 0.2) return "very low";
  if (value < 0.3) return "low";
  if (value <= 0.4) return "moderately low";
  if (value < 0.6) return "moderate";
  if (value <= 0.7) return "moderately high";
  if (value < 0.8) return "high";
  if (value <= 0.9) return "very high";
  return "extremely high";
}

export function buildExpansionPrompt(
  config: { name: string; context: string },
  syntheticUser: { summary: string; evidenceSnippets: string[] },
  axisValues: Record<string, number>,
): string {
  const formattedAxes = Object.entries(axisValues)
    .map(([key, value]) => `  - ${key}: ${value.toFixed(2)} (${interpretAxisValue(value)})`)
    .join("\n");

  const hasModerateAxes = Object.values(axisValues).some(
    (v) => v >= 0.3 && v <= 0.7,
  );

  const moderateGuidance = hasModerateAxes
    ? "\nFor axes with moderate values (0.3-0.7): the persona is NOT simply 'average' — show realistic internal tension and nuanced trade-offs. A moderately-low tech-savvy user might use smartphones but struggle with new apps. A moderately-patient user might usually wait but snap under pressure. Capture this complexity in both the bio and the rules."
    : "";

  return [
    `Config name: ${config.name}`,
    `Config context: ${config.context}`,
    `Synthetic user summary: ${syntheticUser.summary}`,
    `Evidence snippets:\n${syntheticUser.evidenceSnippets.map((s, i) => `  [${i + 1}] ${s}`).join("\n")}`,
    `Axis values (scale 0.0=lowest to 1.0=highest):\n${formattedAxes}`,
    moderateGuidance,
    "Instructions:",
    "- firstPersonBio: Write 113-118 words in first person (aim for 115 words). Ground the bio in the evidence snippets — reference or paraphrase at least 2 snippets naturally in the narrative. Reflect every axis value authentically; the bio should make the persona's position on each axis feel lived-in and real. Be detailed and specific — use concrete examples rather than vague generalities.",
    "- behaviorRules: Write exactly 8 concrete behavioral rules as imperative strings (e.g. 'Ask clarifying questions before submitting forms'). Cover all 8 of these distinct dimensions: (1) navigation style, (2) risk tolerance, (3) patience level, (4) information processing, (5) decision-making speed, (6) frustration triggers, (7) recovery behavior, (8) goal-orientation and success criteria. Rules must be specific, diverse, and not overlap. Each rule must explicitly connect to one of the axis values listed above — name the axis in your reasoning even if not in the rule text itself.",
    "- tensionSeed: Describe a specific internal conflict or behavioral tension in at least 25 words. Name the competing drives and the situational context where this tension surfaces most acutely. Must be consistent with the bio and rules.",
    "- coherenceScore: A number 0.0-1.0. Score 0.97+ if every behavior rule clearly traces to a named axis value and the bio reflects all axis positions. Score 0.93-0.96 if most rules are axis-driven. Score below 0.93 if the persona feels generic.",
    "Return only valid JSON with keys: firstPersonBio, behaviorRules, tensionSeed, coherenceScore.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const EXPANSION_SYSTEM_PROMPT = `You are an expert UX researcher who creates detailed synthetic personas for usability testing. Your personas simulate realistic user behavior in browser-based testing agents.

Quality criteria:
- The bio reads as a real person's self-description, not a clinical profile
- Every behavior rule is specific enough that a testing agent can act on it
- The tension seed reveals a genuine internal conflict rooted in the axis values
- High coherence means bio, rules, and tension all tell the same story about one consistent person

Return only valid JSON. No markdown fences, no code blocks, no extra text.`;
