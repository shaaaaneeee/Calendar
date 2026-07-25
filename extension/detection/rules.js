/**
 * Detection Rules
 *
 * These are the scoring rules for the detection engine.
 * Each category has a weight (how many points it contributes).
 *
 * Design note: This file is intentionally just data - no logic here.
 * That makes it easy to edit, test, and eventually replace with
 * ML-generated weights.
 */

const DETECTION_RULES = {
  temporal: {
    weight: 2,
    patterns: [
      /\btomorrow\b/i,
      /\btmrw\b/i,
      /\btonight\b/i,
      /\bnext\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\bthis\s+(weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
      /\b\d{1,2}\/\d{1,2}\b/,
      /\bin\s+\d+\s+(hours?|days?|weeks?)\b/i,
      /\bat\s+\d{1,2}\b/i,
      /\bnoon\b/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    ]
  },
  action: {
    weight: 2,
    patterns: [
      /\bgym\b/i,
      /\bdinner\b/i,
      /\blunch\b/i,
      /\bbreakfast\b/i,
      /\bcoffee\b/i,
      /\bmeet(ing|up)?\b/i,
      /\bstudy\b/i,
      /\bwatch\b/i,
      /\bmovie\b/i,
      /\bhang\s*(out)?\b/i,
      /\bcall\b/i,
      /\bcatch\s*up\b/i,
      /\bparty\b/i,
      /\btrip\b/i,
      /\bvisit\b/i
    ]
  },
  social: {
    weight: 1,
    patterns: [/\btogether\b/i, /\bjoin\b/i]
  },
  location: {
    weight: 1,
    patterns: [
      /\bgym\b/i,
      /\bpier\b/i,
      /\boffice\b/i,
      /\bhome\b/i,
      /\bschool\b/i,
      /\bmall\b/i,
      /\bbeach\b/i,
      /\bpark\b/i,
      /\brestaurant\b/i,
      /\bbar\b/i,
      /\bcaf[eé]\b/i,
      /\bairport\b/i,
      /\bstation\b/i,
      /\bdowntown\b/i,
      /\bcampus\b/i,
      /\bhouse\b/i
    ]
  },
  confirmation: {
    weight: 1,
    patterns: [
      /\bsounds good\b/i,
      /\bdeal\b/i,
      /\blet'?s\s+do\s+it\b/i,
      /\bworks for me\b/i,
      /\bi'?m\s+(in|down)\b/i
    ]
  },
  negation: {
    weight: -3,
    patterns: [
      /\bnot\b/i,
      /\bcan'?t\b/i,
      /\bwon'?t\b/i,
      /\bprobably\s+not\b/i,
      /\bnever\b/i,
      /\bno\s+way\b/i,
      /\bjust\s+kidding\b/i,
      /\bjk\b/i
    ]
  }
};

const DETECTION_THRESHOLD = 3;

/**
 * HARD BLOCK RULES
 *
 * These patterns immediately classify a detection as REJECTED.
 * They are checked before any intent scoring and override everything.
 *
 * Use these for phrases that are NEVER plan creation in any context.
 * Keep this list short and high-confidence only.
 */
const HARD_BLOCK_RULES = [
  /\bcan'?t\s+make\s+it\b/i,
  /\bwon'?t\s+be\s+(able|there)\b/i,
  /\bhave\s+to\s+cancel\b/i,
  /\bneed\s+to\s+cancel\b/i,
  /\bcan'?t\s+come\b/i,
  /\bcan'?t\s+attend\b/i,
  /\bnot\s+going\s+to\s+make\s+it\b/i,
  /\bsomething\s+came\s+up\b/i,
  /\brain\s+check\b/i,
  /\bnext\s+time\b/i,
  /\bcan'?t\s+do\b/i,
  /\bnot\s+available\b/i,
  /\bunavailable\b/i,
  /\bhad\s+.+?\s+(at|tonight|tomorrow)\b/i,
  /\blast\s+(night|week|month)\b/i,
  /\byesterday\b/i,
  /\bwas\s+supposed\s+to\b/i,

  // Past activity + past time marker
  /\b(had|ate|went|saw|was\s+at|were\s+at|watched|caught|visited)\b.{0,60}\b(yesterday|last\s+night|last\s+week|last\s+weekend|this\s+morning|earlier|already)\b/i,

  // "just finished / just got back" pattern
  /\bjust\s+(had|went|saw|finished|got\s+back|left|ate|watched|came\s+from)\b/i,

  // Perfect tense
  /\b(i've|we've|i\s+have|we\s+have)\s+(just|already|been|had|gone)\b/i,

  // Sentiment recap
  /\b(it\s+was|that\s+was|what\s+a)\s+(great|amazing|fun|good|nice|wild|crazy)\b/i,
  /\bamazing\s+(dinner|lunch|coffee|breakfast|brunch|night|evening|time|day)\b/i,

  // Vague future with no specific time anchor
  /\bwe\s+should\s+(really\s+|definitely\s+|totally\s+|probably\s+)?(hang\s+out|meet\s+up|catch\s+up|get\s+together)\b(?!.{0,30}\b(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|this\s+week|\d+\s*(am|pm))\b)/i,
  /\bsometime\s+(soon|maybe|hopefully)\b/i,
  /\bit\s+would\s+be\s+(nice|fun|great)\s+(to|if\s+we)\b/i,
];

/**
 * CANCELLATION CONTEXT PHRASES
 *
 * These are softer signals than hard blocks - they suggest rejection
 * but need a plan signal nearby to be meaningful.
 *
 * The intent classifier uses these for its REJECT vote.
 */
const CANCELLATION_PHRASES = [
  /\bsorry\b/i,
  /\bapologi[sz]e\b/i,
  /\bafraid\s+i\b/i,
  /\bdon'?t\s+think\s+i\b/i,
  /\bnot\s+sure\s+i\s+can\b/i,
  /\bwish\s+i\s+could\b/i,
  /\bother\s+plans\b/i,
  /\balready\s+have\b/i,
  /\bbusy\b/i,
  /\btied\s+up\b/i
];

/**
 * CREATION INTENT PHRASES
 *
 * These are strong signals that someone is PROPOSING or CONFIRMING a plan.
 * The intent classifier uses these for its CONFIRM vote.
 */
const CREATION_PHRASES = [
  /\blet'?s\b/i,
  /\bwant\s+to\b/i,
  /\bwanna\b/i,
  /\bshould\s+we\b/i,
  /\bare\s+you\s+(free|available|around|down|up)\b/i,
  /\bdo\s+you\s+want\s+to\b/i,
  /\bcan\s+you\s+make\s+it\b/i,
  /\bdown\s+for\b/i,
  /\bup\s+for\b/i,
  /\bsounds good\b/i,
  /\bworks for me\b/i,
  /\bi'?m\s+(in|down|free|available)\b/i,
  /\bcount\s+me\s+in\b/i,
  /\bsee\s+you\s+(there|then|at)\b/i,
  /\bmeet\s+(me|us|at|with)\b/i,
  /\bbe\s+there\b/i,
  /\bjoin\s+me\s+at\b/i,
  /\bi'?ll\s+be\s+at\b/i,
  /\bi'?ll\s+join\s+you\b/i,
  /\bcome\s+to\b/i,
  /\bcome\s+at\b/i,
  /\bhead\s+over\s+to\b/i,
  /\blet'?s\s+(sync|connect|meet|catch\s+up)\b/i,
  /\byou\s+in\b/i,
  /\b(coffee|lunch|dinner|drinks|brunch|breakfast|gym|movie)\b.{0,60}\?$/i,
];

if (typeof window !== "undefined") {
  window.DETECTION_RULES = DETECTION_RULES;
  window.DETECTION_THRESHOLD = DETECTION_THRESHOLD;
  window.HARD_BLOCK_RULES = HARD_BLOCK_RULES;
  window.CANCELLATION_PHRASES = CANCELLATION_PHRASES;
  window.CREATION_PHRASES = CREATION_PHRASES;
}
