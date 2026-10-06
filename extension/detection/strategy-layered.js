/**
 * PlanWise Strategy A — "Layered"
 *
 * Keeps rules.js's free, instant signals as a fast path and only pays
 * for an ML call on the ambiguous middle - exactly where the measured
 * 87.5% false-negative rate actually lives (see
 * docs/superpowers/specs/2026-09-05-detection-false-negative-reduction-design.md).
 * Also rejects for free when text has zero structural signal at all
 * (a bare name, a one-word aside) rather than asking the model, which
 * can overconfidently say CONFIRM on text with no actual plan content -
 * found via real-world testing, not anticipated up front.
 *
 * `classifyFn` is injected rather than imported directly so this stays
 * Jest-testable with a stub (see tests/strategy-routing.test.js) - the
 * real one is window.PlanWiseML.classify, which touches chrome.runtime/
 * the offscreen document and has no Jest coverage of its own.
 */

const ML_LABELS = [
  "a plan to meet or do something at a specific time",
  "a personal to-do or reminder, not tied to meeting anyone",
  "neither",
];

async function classify(text, customRules, classifyFn) {
  const hardBlocks = window.HARD_BLOCK_RULES || [];
  const creationPhrases = window.CREATION_PHRASES || [];

  // Free, instant reject - no model call. Same hard-block list the
  // legacy engine uses, since these are unambiguous by construction.
  for (const pattern of hardBlocks) {
    const match = text.match(pattern);
    if (match) {
      return { intent: "REJECT", reason: `hard_block: "${match[0]}"`, source: "hard_block" };
    }
  }

  // Fast path - a literal, high-confidence creation phrase plus a score
  // that clears the legacy threshold. Still free, still no model call.
  const scoreResult = window.PlanWiseEngine.scoreText(text, customRules);
  const hasLiteralCreationPhrase = creationPhrases.some((pattern) => pattern.test(text));
  if (hasLiteralCreationPhrase && scoreResult.triggered) {
    return { intent: "CONFIRM", reason: "fast_path_creation_phrase", source: "fast_path" };
  }

  // Free reject - zero structural signal at all (no temporal/action/
  // location/social/confirmation word matched anything in rules.js).
  // Found via real-world testing: a bare name ("weiling") and a vague
  // aside ("hungry bro...") both scored 0 here yet still reached the
  // model, which answered CONFIRM with no actual plan content behind it
  // - the model is a semantic matcher, not a judge of "is there even a
  // plan-shaped claim here," so it shouldn't be asked about text that
  // doesn't contain one. Every real plan case in the benchmark/this
  // session scored above 0, so this costs no recall.
  if (scoreResult.score <= 0) {
    return { intent: "REJECT", reason: "no_structural_signal", source: "no_signal_fast_reject" };
  }

  // Everything else - the ambiguous middle - goes to the model.
  const modelResult = await classifyFn(text, ML_LABELS);
  const intent = modelResult.label === ML_LABELS[0] ? "CONFIRM" : "REJECT";
  return { intent, reason: `model: "${modelResult.label}"`, source: "model", modelResult };
}

if (typeof window !== "undefined") {
  window.PlanWiseStrategyLayered = { classify, ML_LABELS };
}
