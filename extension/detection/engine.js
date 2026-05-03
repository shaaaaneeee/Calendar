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

  // Apply any user-defined custom trigger words.
  if (customRules.triggerWords && Array.isArray(customRules.triggerWords)) {
    for (const word of customRules.triggerWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "i");
      if (pattern.test(text)) {
        totalScore += 2;
        matches.custom = matches.custom || [];
        matches.custom.push(word);
      }
    }
  }

  // Pass 1: proximity negation check.
  let proximityNegationHit = false;
  for (const negPattern of PROXIMITY_NEGATION_WORDS) {
    const regex = new RegExp(negPattern.source, negPattern.flags);
    const negMatch = regex.exec(text);
    if (!negMatch) {
      continue;
    }

    const ahead = text.slice(negMatch.index, negMatch.index + PROXIMITY_WINDOW);
    const nearAction = rules.action.patterns.some((pattern) => {
      const localPattern = new RegExp(pattern.source, pattern.flags);
      return localPattern.test(ahead);
    });
    const nearTemporal = rules.temporal.patterns.some((pattern) => {
      const localPattern = new RegExp(pattern.source, pattern.flags);
      return localPattern.test(ahead);
    });

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

function classifyIntent(text) {
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

  const intentResult = classifyIntent(text);

  // If classifyIntent found no signals but score passed threshold,
  // default to CONFIRM (no rejection evidence = assume intent).
  let intent = intentResult.intent;
  let reason = intentResult.reason;
  if (intentResult.intent === INTENT.AMBIGUOUS &&
      intentResult.reason === "no_intent_signal") {
    intent = INTENT.CONFIRM;
    reason = "default_confirm_no_signals";
  }

  return {
    triggered: intent === INTENT.CONFIRM,
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
