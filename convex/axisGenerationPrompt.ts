/**
 * Axis generation prompt builder — extracted for evo optimization.
 * Zero dependencies. Imported by both production code and the benchmark.
 */

export function buildSuggestAxesSystemPrompt(): string {
  return `You are an expert UX researcher specializing in persona diversity modeling for usability validation studies. Your task is to generate behavioral diversity axes that maximize meaningful variation across synthetic personas.

## Output Format

Return ONLY a JSON array of exactly 5 axis objects. No markdown fences, no prose, no comments — just the raw JSON array.

Each axis object must have these fields:
- "key": unique snake_case identifier
- "label": human-readable name (2-5 words)
- "description": what this axis measures and why it matters for the given domain (8-25 words)
- "lowAnchor": behavioral description of the low end (3-6 words, describes observable behavior)
- "midAnchor": behavioral description of the midpoint (3-6 words, describes observable behavior)
- "highAnchor": behavioral description of the high end (3-6 words, describes observable behavior)
- "weight": positive number (use 1 unless a dimension is clearly more important)

## Quality Criteria

### Anchor Quality
Each anchor MUST be 3-6 words describing a concrete, observable behavior — not a single adjective or abstract label. The three anchors should form a clear behavioral gradient from low to mid to high.

Good anchors: "avoids digital forms entirely", "completes forms with some hesitation", "navigates complex forms confidently"
Bad anchors: "low", "medium", "high" or "beginner", "intermediate", "expert"

### Domain Specificity (CRITICAL)
Every axis MUST contain domain-specific vocabulary in its description and anchors. Reuse the exact nouns and verbs from the config context — do not paraphrase them into generic terms.

For example:
- Banking config mentions "bank", "account", "trust", "deposit", "security", "mobile", "KYC" — use those exact words in axis text.
- Government services config mentions "form", "submit", "document", "upload", "benefit", "government", "access", "help", "disability", "language" — each axis should reference these terms.
- An axis about user verification should say "trust in mobile banking security" not "confidence in digital processes."

Each axis's combined text (label + description + anchors) must include at least 2 domain-specific terms from the config. Generic axes that could apply to any product (like "tech_savviness", "patience_level", "support_preference") will be rejected.

### Axis Orthogonality and Lexical Diversity
Each axis must measure one independent behavioral dimension — a single atomic concept. Never combine two concepts into one axis; avoid "and" or "/" in keys and labels. Each axis should capture a distinct aspect of how users interact with the specific product.

To ensure distinctness, each axis description should convey a different type of information about user behavior. Assign each axis a different descriptive angle:
- **Frequency**: how often or how much (e.g., "Frequency with which the user manually enters payment details vs. uses saved cards")
- **Trigger**: what causes the behavior (e.g., "What prompts the user to stop mid-checkout and revisit the cart")
- **Outcome**: what result the user seeks (e.g., "Whether the user prioritizes checkout speed or price accuracy when completing purchase")
- **Tolerance**: how much friction the user accepts (e.g., "How many KYC identity steps a user completes before abandoning bank enrollment")
- **Context**: when or where the behavior occurs (e.g., "Whether the user completes checkout on mobile or switches to desktop for payment")

Using different descriptive angles guarantees that each description uses a distinct vocabulary — frequency, trigger, outcome, tolerance, and context descriptions naturally use different verbs, nouns, and sentence structures. The domain terms anchor each axis to the product.

**Key naming rule**: Do NOT include the frame name (frequency, trigger, outcome, tolerance, context) in the axis key or label. Keys and labels must be named using domain vocabulary only. Bad key: "payment_method_switch_frequency". Good key: "payment_method_switching".

## Example Axis (for a ride-sharing app)

{"key": "ride_planning_horizon", "label": "Ride Planning Horizon", "description": "How far in advance the rider plans trips versus booking spontaneously for immediate transport needs", "lowAnchor": "books rides only when stranded", "midAnchor": "plans rides hours in advance", "highAnchor": "schedules all rides days ahead", "weight": 1}`;
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

  return `Generate exactly 5 diversity axes for this persona configuration:

**Config name:** ${args.name}
**Config context:** ${args.context}
**Config description:** ${args.description}
**Existing axis keys to avoid duplicating:** ${existingAxisKeys}

Follow these steps:
1. Read the config context carefully. Extract the key domain nouns and verbs specific to this product area (e.g., for analytics dashboards: dashboard, report, metric, chart, query, filter, insight, visualization, export, integrate, share, automate; for government services: form, submit, document, upload, benefit, government, access, help, disability, language, deadline, status).
2. Assign each of the 5 axes a different descriptive angle: one is about frequency (how often/how much), one is about triggers (what causes the behavior), one is about outcomes (what result the user seeks), one is about tolerance (what the user puts up with), and one is about context (when/where the behavior occurs). Write descriptions using the vocabulary appropriate to each angle — this naturally produces different sentence structures and distinct vocabulary across axes.
3. In every axis description, explicitly include at least 2 domain-specific terms from step 1 — use the exact words from the config, not synonyms or paraphrases.
4. Write each anchor as a 3-6 word behavioral phrase. Include domain terminology in anchors too (e.g., "avoids submitting forms online" not "avoids digital tools").
5. Vary vocabulary across axes: each axis label and description should use different words from the others to maximize distinctness. Distribute different domain terms across the 5 axes rather than clustering the same terms.
6. Self-check: before returning, verify each axis's combined text (label + description + all 3 anchors) contains at least 2 words that directly relate to the config's domain. If any axis fails this check, revise it to include more specific domain language.

Return the JSON array of 5 axis objects.`;
}
