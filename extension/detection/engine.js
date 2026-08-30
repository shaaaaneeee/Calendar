/**
 * PlanWise Detection Engine
 *
 * Two-stage pipeline:
 *   Stage 1 - scoreText(): Does this text contain plan signals?
 *   Stage 2 - analyzeIntent(): If yes, is speaker creating or rejecting?
 *
 * Depends on: rules.js (must load first)
 */

const PROXIMITY_NEGATION_WORDS = [
  /\bcan'?t\b/i,
  /\bwon'?t\b/i,
  /\bdon'?t\b/i,
  /\bdoesn'?t\b/i,
  /\bnot\b/i,
  /\bnever\b/i,
  /\bunable\b/i,
  /\bsorry\b/i,
  /\bcan\s+not\b/i,
  /\bno\s+way\b/i
];

const PROXIMITY_WINDOW = 60;

const INTENT = {
  CONFIRM: "CONFIRM",
  REJECT: "REJECT",
  AMBIGUOUS: "AMBIGUOUS"
};

const DAY_MONTH_NAMES = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Tomorrow", "Tonight", "Today"
]);

// Words that sit right after a person-cue but are never names themselves -
// mirrors extractor.js's PARTICIPANT_IGNORE, kept as its own small copy
// since engine.js and extractor.js are deliberately standalone/independent.
const PERSON_CUE_IGNORE = new Set([
  "me", "you", "us", "them", "him", "her", "everyone", "everybody", "the",
  "a", "an", "and", "at", "in", "on", "by", "for", "to", "of", "up",
  "my", "your", "his", "our", "their", "its",
]);
// Deliberately just "with"/"meet" - "call"/"text"/"invite"/"join" were tried
// too and reverted: they're common in totally unrelated contexts ("call my
// bank", "text mom", "call gusto pizza about my reservation"), and against
// the full CLINC150 + MASSIVE datasets they added far more false positives
// than the real plan-shaped cases they caught were worth.
const PERSON_CUE_WORDS = ["with", "meet"];

// Cheap heuristic: does the text likely name a specific person? Used only to
// gate the structural-confirm fallback below, not full participant extraction.
function hasLikelyPersonName(text) {
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i].replace(/[^a-zA-Z]/g, "");
    if (word.length > 1 && word[0] === word[0].toUpperCase() && !DAY_MONTH_NAMES.has(word)) {
      return true;
    }
  }

  // A capitalization-only check misses real, casually-typed messages where
  // the name just isn't capitalized ("schedule a meeting with tom for
  // 6pm") - identical in every other way to a capitalized version that DID
  // trigger. extractor.js's ANCHOR_CUES already makes this same allowance
  // deliberately for extraction; this mirrors it for the detection gate.
  for (let i = 0; i < words.length - 1; i += 1) {
    const cue = words[i].toLowerCase().replace(/[^a-z]/g, "");
    if (!PERSON_CUE_WORDS.includes(cue)) continue;
    const next = words[i + 1].replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (next.length > 1 && !PERSON_CUE_IGNORE.has(next) && !DAY_MONTH_NAMES.has(
      next.charAt(0).toUpperCase() + next.slice(1)
    )) {
      return true;
    }
  }
  return false;
}

function isWordAlreadyScored(word, matches) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordPattern = new RegExp(`\\b${escaped}\\b`, "i");
  for (const matchList of Object.values(matches)) {
    if (!Array.isArray(matchList)) continue;
    for (const matchedText of matchList) {
      if (typeof matchedText === "string" && wordPattern.test(matchedText)) return true;
    }
  }
  return false;
}

function applyCustomWords(text, words, weight, matches, label) {
  if (!Array.isArray(words)) return 0;
  let added = 0;
  for (const word of words) {
    if (!word || typeof word !== "string") continue;
    if (isWordAlreadyScored(word, matches)) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      added += weight;
      matches[label] = matches[label] || [];
      matches[label].push(word);
    }
  }
  return added;
}

function scoreText(text, customRules = {}) {
  if (!text || typeof text !== "string" || text.trim().length < 3) {
    return { score: 0, triggered: false, matches: {}, text: "" };
  }

  const rules = window.DETECTION_RULES;
  const threshold = window.DETECTION_THRESHOLD;
  let totalScore = 0;
  const matches = {};

  // Score only positive categories first.
  for (const [category, ruleSet] of Object.entries(rules)) {
    if (category === "negation") {
      continue;
    }

    const categoryMatches = [];
    for (const pattern of ruleSet.patterns) {
      const match = text.match(pattern);
      if (match) {
        categoryMatches.push(match[0]);
      }
    }

    if (categoryMatches.length > 0) {
      totalScore += ruleSet.weight;
      matches[category] = categoryMatches;
    }
  }

  totalScore += applyCustomWords(text, customRules.triggerWords,  2, matches, "custom");
  totalScore += applyCustomWords(text, customRules.activityWords, 2, matches, "activityWords");
  totalScore += applyCustomWords(text, customRules.meetingWords,  2, matches, "meetingWords");
  totalScore += applyCustomWords(text, customRules.items,         1, matches, "items");
  totalScore += applyCustomWords(text, customRules.placeWords,    1, matches, "placeWords");

  // Pass 1: proximity negation check.
  let proximityNegationHit = false;
  for (const negPattern of PROXIMITY_NEGATION_WORDS) {
    const negMatch = negPattern.exec(text);
    if (!negMatch) {
      continue;
    }

    const ahead = text.slice(negMatch.index, negMatch.index + PROXIMITY_WINDOW);
    const nearAction   = rules.action.patterns.some(p => p.test(ahead));
    const nearTemporal = rules.temporal.patterns.some(p => p.test(ahead));

    if (nearAction || nearTemporal) {
      proximityNegationHit = true;
      matches.proximityNegation = matches.proximityNegation || [];
      matches.proximityNegation.push(negMatch[0]);
      break;
    }
  }

  if (proximityNegationHit) {
    if (totalScore >= threshold) {
      totalScore = threshold - 1;
    }
  } else {
    // Pass 2: classic flat negation.
    const flatNegMatches = [];
    for (const pattern of rules.negation.patterns) {
      const match = text.match(pattern);
      if (match) {
        flatNegMatches.push(match[0]);
      }
    }
    if (flatNegMatches.length > 0) {
      totalScore += rules.negation.weight;
      matches.negation = flatNegMatches;
    }
  }

  return {
    score: totalScore,
    triggered: totalScore >= threshold,
    matches,
    text: text.trim()
  };
}

function classifyIntent(text, structuralMatches = {}) {
  const hardBlocks = window.HARD_BLOCK_RULES || [];
  const cancellationPhrases = window.CANCELLATION_PHRASES || [];
  const creationPhrases = window.CREATION_PHRASES || [];

  const votes = { confirm: 0, reject: 0, reasons: [] };

  for (const pattern of hardBlocks) {
    const match = text.match(pattern);
    if (match) {
      return {
        intent: INTENT.REJECT,
        reason: `hard_block: "${match[0]}"`,
        votes
      };
    }
  }

  for (const pattern of cancellationPhrases) {
    const match = text.match(pattern);
    if (match) {
      votes.reject += 1;
      votes.reasons.push(`cancel: "${match[0]}"`);
    }
  }

  for (const pattern of creationPhrases) {
    const match = text.match(pattern);
    if (match) {
      votes.confirm += 1;
      votes.reasons.push(`create: "${match[0]}"`);
    }
  }

  if (votes.confirm > votes.reject) {
    return { intent: INTENT.CONFIRM, reason: "creation_votes_win", votes };
  }

  if (votes.reject > votes.confirm) {
    return { intent: INTENT.REJECT, reason: "cancellation_votes_win", votes };
  }

  if (votes.confirm > 0) {
    return { intent: INTENT.CONFIRM, reason: "default_confirm_on_tie", votes };
  }

  // No literal creation/cancellation phrase matched. Rather than dropping a
  // message that already carries strong structural plan signals (an action
  // word, a time anchor, and a named place or person), treat that combination
  // as an implicit creation signal. Phrase lists can never enumerate every way
  // of saying "let's meet" - structural signals (what/when/where-or-who) are
  // the reliable core. Action+temporal alone isn't enough: habitual statements
  // ("I watch movies every Sunday") and vague asks ("call me tonight") also
  // carry those two but aren't actually plans.
  //
  // scoreText() stores custom-word matches under their own keys (custom,
  // activityWords, meetingWords, placeWords) rather than folding them into
  // the built-in "action"/"location" keys, so a custom Trigger/Activity word
  // is just as valid a "what" signal as a built-in one, and a custom Place
  // Word is just as valid a "where" signal as a built-in location - both are
  // treated as equivalent here rather than only recognizing the hardcoded set.
  const hasActionSignal = Boolean(
    structuralMatches.action ||
    structuralMatches.custom ||
    structuralMatches.activityWords ||
    structuralMatches.meetingWords
  );
  const hasLocationSignal = Boolean(structuralMatches.location || structuralMatches.placeWords);

  // "gym" (and words like it) match BOTH the action and location categories,
  // so a habitual statement like "gym every Tuesday at 6" was slipping past
  // the habitual-statement guard this comment already describes above - it
  // has action+temporal+location, same shape as a real one-time plan, and
  // "every" was never actually checked for here. An explicit "let's do gym
  // every Tuesday" still triggers fine via the CREATION_PHRASES vote path
  // above; this only removes the *implicit* fallback's willingness to infer
  // a specific plan from a stated routine.
  const isHabitual = /\bevery\b/i.test(text);

  // A question about an existing plan ("do I have a meeting with steve this
  // week", "is my meeting with bob tomorrow at 3pm") has the exact same
  // action+temporal+person shape as a real proposal, but it's asking, not
  // proposing - found once hasLikelyPersonName started allowing lowercase
  // names (needed for "schedule a meeting with tom at 6pm" to work), which
  // also let these through since they say "meeting with <name>" too.
  // Deliberately excludes can/could/would/will - those commonly prefix a
  // genuine casual proposal ("can we meet at the gym tomorrow") that should
  // still reach structural_confirm, not just a query about an existing plan.
  const isQuestion = /^(do|does|did|is|are|was|were|have|has|when|what|who|how)\b/i.test(text.trim());

  if (
    votes.reject === 0 &&
    !isHabitual &&
    !isQuestion &&
    hasActionSignal &&
    structuralMatches.temporal &&
    (hasLocationSignal || hasLikelyPersonName(text))
  ) {
    votes.confirm += 1;
    votes.reasons.push("structural: action+temporal+(location|person)");
    return { intent: INTENT.CONFIRM, reason: "structural_confirm", votes };
  }

  return { intent: INTENT.AMBIGUOUS, reason: "no_intent_signal", votes };
}

function analyzeIntent(text, customRules = {}) {
  const scoreResult = scoreText(text, customRules);

  if (!scoreResult.triggered) {
    return {
      triggered: false,
      score: scoreResult.score,
      intent: INTENT.AMBIGUOUS,
      reason: "below_threshold",
      matches: scoreResult.matches,
      votes: {},
      text: scoreResult.text
    };
  }

  const intentResult = classifyIntent(text, scoreResult.matches);

  let intent = intentResult.intent;
  let reason = intentResult.reason;

  // No creation or cancellation signals found — drop rather than default-confirm.
  if (intentResult.intent === INTENT.AMBIGUOUS &&
      intentResult.reason === "no_intent_signal") {
    return {
      triggered: false,
      score: scoreResult.score,
      intent: INTENT.AMBIGUOUS,
      reason: "no_intent_signal_drop",
      matches: scoreResult.matches,
      votes: intentResult.votes,
      text: scoreResult.text
    };
  }

  // classifyIntent voted CONFIRM via tie-breaking but found zero actual creation
  // phrases — treat as not triggered.
  const triggered = intent === INTENT.CONFIRM && intentResult.votes.confirm >= 1;

  return {
    triggered,
    score: scoreResult.score,
    intent: intent,
    reason: reason,
    matches: scoreResult.matches,
    votes: intentResult.votes,
    text: scoreResult.text
  };
}

if (typeof window !== "undefined") {
  window.PlanWiseEngine = {
    analyzeIntent,
    scoreText,
    classifyIntent,
    INTENT
  };
}
