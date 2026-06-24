/**
 * PlanWise Detection Engine — Test Suite
 *
 * Tests the full two-stage pipeline:
 *   Stage 1: scoreText()    — does this text contain plan signals?
 *   Stage 2: analyzeIntent() — is the speaker creating or rejecting?
 *
 * How to run: npm test
 */

// Load dependencies in the correct order (mirrors manifest.json load order)
require('../extension/detection/rules.js');
require('../extension/detection/engine.js');

const { analyzeIntent, scoreText, classifyIntent, INTENT } = window.PlanWiseEngine;


// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────

/**
 * Shorthand to check if a string triggers a detection.
 * Returns the full analyzeIntent result for inspection.
 */
function detect(text) {
  return analyzeIntent(text);
}


// ─────────────────────────────────────────────
// CLEAR PLAN CREATION — should trigger
// ─────────────────────────────────────────────

describe('Clear plan creation — should trigger', () => {

  test('classic plan proposal', () => {
    const r = detect("let's grab dinner tomorrow at 7");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('gym plan with time', () => {
    const r = detect("gym tomorrow at 6");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('coffee plan with confirmation', () => {
    const r = detect("sounds good, coffee at 10am");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('dinner with multiple signals', () => {
    const r = detect("dinner tonight with alex sounds good");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('meeting next week', () => {
    const r = detect("let's meet next Monday at 3pm");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('movie plan', () => {
    const r = detect("want to watch a movie this weekend?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('study session', () => {
    const r = detect("should we study together tomorrow?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('lunch plan with date', () => {
    const r = detect("lunch on 12/25 works for me");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('relative time plan', () => {
    const r = detect("let's catch up in 2 days");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('plan using tmrw abbreviation', () => {
    const r = detect("gym tmrw at 6pm, you in?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('informal confirmation', () => {
    const r = detect("ok sure dinner at 8 tonight");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('come to plan', () => {
    const r = detect("come to my place tonight at 9");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

});


// ─────────────────────────────────────────────
// CLEAR CANCELLATIONS — should NOT trigger
// ─────────────────────────────────────────────

describe('Clear cancellations — should NOT trigger', () => {

  test('classic cancellation', () => {
    const r = detect("about tomorrow's dinner at 9pm, I can't make it");
    expect(r.triggered).toBe(false);
  });

  test('something came up', () => {
    const r = detect("sorry something came up, can't do dinner tonight");
    expect(r.triggered).toBe(false);
  });

  test('won\'t be there', () => {
    const r = detect("I won't be there for the movie tonight");
    expect(r.triggered).toBe(false);
  });

  test('have to cancel', () => {
    const r = detect("I have to cancel our lunch tomorrow");
    expect(r.triggered).toBe(false);
  });

  test('rain check', () => {
    const r = detect("can we take a rain check on dinner?");
    expect(r.triggered).toBe(false);
  });

  test('not available', () => {
    const r = detect("I'm not available tomorrow night");
    expect(r.triggered).toBe(false);
  });

  test('busy signal', () => {
    const r = detect("I'm busy this weekend, wish I could make it");
    expect(r.triggered).toBe(false);
  });

  test('can\'t attend', () => {
    const r = detect("unfortunately I can't attend the meeting tomorrow");
    expect(r.triggered).toBe(false);
  });

  test('won\'t be able', () => {
    const r = detect("I won't be able to make dinner at 7");
    expect(r.triggered).toBe(false);
  });

});


// ─────────────────────────────────────────────
// SARCASM AND EDGE CASES — should NOT trigger
// ─────────────────────────────────────────────

describe('Sarcasm and edge cases — should NOT trigger', () => {

  test('jk cancels plan signal', () => {
    const r = detect("yeah right let's hang out tomorrow jk");
    expect(r.triggered).toBe(false);
  });

  test('past-tense movie comment — not a plan', () => {
    const r = detect("lol we saw a movie last night");
    expect(r.triggered).toBe(false);
  });

  test('single word — too short', () => {
    const r = detect("ok");
    expect(r.triggered).toBe(false);
  });

  test('empty string', () => {
    const r = detect("");
    expect(r.triggered).toBe(false);
  });

  test('explicit rejection — won\'t make it', () => {
    const r = detect("won't make it to dinner tomorrow");
    expect(r.triggered).toBe(false);
  });

  test('past tense reference — not a future plan', () => {
    const r = detect("we had dinner last night at 7");
    expect(r.triggered).toBe(false);
  });

  test('general statement with no plan intent', () => {
    const r = detect("I love watching movies on weekends");
    expect(r.triggered).toBe(false);
  });

});


// ─────────────────────────────────────────────
// SCORING — verify score values directly
// ─────────────────────────────────────────────

describe('Score values', () => {

  test('temporal + action should score at least 4', () => {
    const r = scoreText("dinner tomorrow");
    expect(r.score).toBeGreaterThanOrEqual(4);
  });

  test('negation should reduce score', () => {
    const withNeg    = scoreText("jk dinner tomorrow");
    const withoutNeg = scoreText("dinner tomorrow");
    expect(withNeg.score).toBeLessThan(withoutNeg.score);
  });

  test('proximity negation hard-suppresses score below threshold', () => {
    const r = scoreText("can't make dinner tomorrow");
    expect(r.triggered).toBe(false);
  });

  test('custom trigger word adds +2', () => {
    const without = scoreText("rehearsal tomorrow");
    const with_   = scoreText("rehearsal tomorrow", { triggerWords: ['rehearsal'] });
    expect(with_.score).toBe(without.score + 2);
  });

  test('threshold is respected', () => {
    const r = scoreText("ok");
    expect(r.triggered).toBe(false);
    expect(r.score).toBeLessThan(window.DETECTION_THRESHOLD);
  });

});


// ─────────────────────────────────────────────
// INTENT CLASSIFICATION — direct classifyIntent tests
// ─────────────────────────────────────────────

describe('Intent classification', () => {

  test('hard block returns REJECT immediately', () => {
    const r = classifyIntent("I can't make it to dinner");
    expect(r.intent).toBe(INTENT.REJECT);
    expect(r.reason).toMatch(/hard_block/);
  });

  test('creation phrase returns CONFIRM', () => {
    const r = classifyIntent("let's grab coffee tomorrow");
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('cancellation phrase returns REJECT', () => {
    const r = classifyIntent("I'm busy and tied up all day");
    expect(r.intent).toBe(INTENT.REJECT);
  });

  test('no signal returns AMBIGUOUS', () => {
    const r = classifyIntent("the weather is nice today");
    expect(r.intent).toBe(INTENT.AMBIGUOUS);
  });

  test('confirm votes beat reject votes', () => {
    const r = classifyIntent("let's meet up, sounds good, I'm in");
    expect(r.intent).toBe(INTENT.CONFIRM);
    expect(r.votes.confirm).toBeGreaterThan(r.votes.reject);
  });

});
