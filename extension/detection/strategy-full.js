/**
 * PlanWise Strategy B — "Full replacement"
 *
 * No rules.js involvement at all - the ML classifier decides every
 * message. Simpler mental model than Strategy A, but pays the model's
 * inference cost on every single flush, not just the ambiguous ones.
 * Built specifically to be measured against Strategy A on the same
 * benchmark (see tests/benchmark/) before either becomes the default.
 */

const ML_LABELS = [
  "a plan to meet or do something at a specific time",
  "a personal to-do or reminder, not tied to meeting anyone",
  "neither",
];

async function classify(text, classifyFn) {
  const modelResult = await classifyFn(text, ML_LABELS);
  const intent = modelResult.label === ML_LABELS[0] ? "CONFIRM" : "REJECT";
  return { intent, reason: `model: "${modelResult.label}"`, source: "model", modelResult };
}

if (typeof window !== "undefined") {
  window.PlanWiseStrategyFull = { classify, ML_LABELS };
}
