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

  if (
    votes.reject === 0 &&
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
