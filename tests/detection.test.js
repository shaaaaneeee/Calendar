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
    // No literal creation phrase, but action+temporal+location (gym is both) is
    // strong enough structural evidence on its own — see "structural_confirm".
    expect(r.triggered).toBe(true);
    expect(r.reason).toBe('structural_confirm');
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
    // ok/sure removed from confirmation patterns; no creation phrase → dropped
    const r = detect("ok sure dinner at 8 tonight");
    expect(r.triggered).toBe(false);
  });

  test('come to plan', () => {
    // only temporal signal — score < threshold
    const r = detect("come to my place tonight at 9");
    expect(r.triggered).toBe(false);
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


// ─────────────────────────────────────────────
// FALSE POSITIVES — hardened rules should block these
// ─────────────────────────────────────────────

describe('False positives — should NOT trigger after hardening', () => {

  test('past-tense dinner recap', () => {
    // hard block: last night
    const r = detect("dinner was amazing last night");
    expect(r.triggered).toBe(false);
  });

  test('just got back — activity recap', () => {
    // hard block: just got back
    const r = detect("just got back from the gym");
    expect(r.triggered).toBe(false);
  });

  test('habitual statement — no creation phrase', () => {
    // score passes but no intent signal → no_intent_signal_drop
    const r = detect("I watch movies every Sunday");
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_intent_signal_drop');
  });

  test('call me tonight — no creation phrase', () => {
    // score passes but no creation phrase → no_intent_signal_drop
    const r = detect("call me tonight");
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_intent_signal_drop');
  });

  test('vague future hang out — no time anchor', () => {
    // hard block: we should hang out with no specific time
    const r = detect("we should hang out sometime");
    expect(r.triggered).toBe(false);
  });

  test('ok sure whatever — score below threshold', () => {
    // ok/sure removed; score < 3
    const r = detect("ok sure whatever");
    expect(r.triggered).toBe(false);
    expect(r.score).toBeLessThan(window.DETECTION_THRESHOLD);
  });

  test('it was a great dinner — sentiment recap', () => {
    // hard block: it was great
    const r = detect("it was a great dinner, loved it");
    expect(r.triggered).toBe(false);
  });

  test('we have already had lunch — perfect tense', () => {
    // hard block: we have already
    const r = detect("we have already had lunch");
    expect(r.triggered).toBe(false);
  });

  test('sometime soon — vague future', () => {
    const r = detect("we should catch up sometime soon");
    expect(r.triggered).toBe(false);
  });

  // Found by running the full CLINC150 (github.com/clinc/oos-eval) and
  // MASSIVE (github.com/alexa/massive) datasets through analyzeIntent() as
  // a bulk false-positive sweep — both independently surfaced this exact
  // failure mode: removing an existing plan was misread as proposing a new
  // one, because "down for"/other creation-phrase votes don't know the verb
  // is "remove", not "confirm".
  test('"take X off my calendar" is a cancellation, not a new plan (found via CLINC150)', () => {
    const r = detect("i want to take the 8am meeting with sam on monday the 5th off my calendar");
    expect(r.triggered).toBe(false);
    expect(r.intent).toBe(INTENT.REJECT);
  });

  test('"remove my ... meeting/event" is a cancellation, not a new plan (found via MASSIVE)', () => {
    const r = detect("remove my office meeting event for next week");
    expect(r.triggered).toBe(false);
    expect(r.intent).toBe(INTENT.REJECT);
  });

  // The two patterns above only covered "remove" and only "off/from
  // calendar" - re-sweeping the datasets after the lowercase-name fix below
  // surfaced these two closely-related gaps in the same investigation.
  test('"delete lunch with X" is a cancellation (found via CLINC150 re-sweep)', () => {
    const r = detect("delete lunch with steve on friday please");
    expect(r.triggered).toBe(false);
    expect(r.intent).toBe(INTENT.REJECT);
  });

  test('"remove ... that is on my calendar" is a cancellation ("on", not just "from")', () => {
    const r = detect("please remove lunch with sally that is on my calendar on tuesday the 8th");
    expect(r.triggered).toBe(false);
    expect(r.intent).toBe(INTENT.REJECT);
  });

});


// ─────────────────────────────────────────────
// STRUCTURAL CONFIRM — action+temporal+(location|person) with no literal
// creation phrase must still actually trigger, not just report intent CONFIRM
// ─────────────────────────────────────────────

describe('Structural confirm — no literal creation phrase, but a real plan', () => {

  test('"meet X at Y at Z" triggers even without a creation phrase', () => {
    const r = detect("tomorrow please meet Esmond and Seth at the office at 10am, we are going out for ops bring the m3e drone");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
    expect(r.reason).toBe('structural_confirm');
  });

  test('action+temporal+location with a name, no creation phrase', () => {
    const r = detect("tomorrow i need you to meet Esmond at the office at 9pm for night ops");
    expect(r.triggered).toBe(true);
    expect(r.reason).toBe('structural_confirm');
  });

  test('custom trigger word + custom place word count as action/location signals', () => {
    // Neither "rehearsal" nor "Studio B" exist in the built-in rules, so this
    // only scores via customRules.triggerWords/placeWords. Without treating
    // those as action/location equivalents, this used to pass the score gate
    // and still get dropped as no_intent_signal_drop.
    const customRules = { triggerWords: ['rehearsal'], placeWords: ['studio b'] };
    const r = analyzeIntent('rehearsal tomorrow at Studio B', customRules);
    expect(r.triggered).toBe(true);
    expect(r.reason).toBe('structural_confirm');
  });

  test('custom activity word alone (no location) still needs a person or location', () => {
    const customRules = { activityWords: ['rehearsal'] };
    const r = analyzeIntent('rehearsal tomorrow', customRules);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_intent_signal_drop');
  });

  // Found by running the full CLINC150 + MASSIVE datasets through
  // analyzeIntent(): hasLikelyPersonName() only recognized capitalized
  // names, so "schedule a meeting with tom for 6pm" silently didn't
  // trigger while the identical sentence with "Tom" did. First attempt at
  // fixing this (allowing a lowercase word after ANY of
  // with/meet/join/call/text/invite) caused a much bigger regression -
  // "call"/"text" are common in totally unrelated contexts ("call my
  // bank") - so this only allows it after with/meet specifically.
  test('lowercase name after "with"/"meet" still triggers structural_confirm', () => {
    const r = detect("schedule a meeting with tom for 6pm");
    expect(r.triggered).toBe(true);
    expect(r.reason).toBe('structural_confirm');
  });

  test('"call my mother" does not falsely gain a person signal from "my"', () => {
    // Regression guard for the fix above - "call" is not a person-cue word,
    // and even if it were, "my" must not be treated as the name.
    const r = detect("remind me to call my mother saturday morning");
    expect(r.triggered).toBe(false);
  });

});


// ─────────────────────────────────────────────
// QUESTIONS ABOUT AN EXISTING PLAN — must not read as proposing a new one
// ─────────────────────────────────────────────

describe('Questions about an existing plan are not a new proposal', () => {

  // Same investigation as above: once lowercase names could satisfy
  // structural_confirm, questions like these (found in MASSIVE's
  // calendar_query intent) started matching too, since "meeting with
  // <name>" appears in both a proposal AND a question about one.
  test('"do I have a meeting with X" does not trigger', () => {
    const r = detect("do i have meeting with steve this week");
    expect(r.triggered).toBe(false);
  });

  test('"is my meeting with X at Y" does not trigger', () => {
    const r = detect("is my meeting with bob tomorrow at three pm");
    expect(r.triggered).toBe(false);
  });

  test('"when is the meeting with X" does not trigger', () => {
    const r = detect("when is that meeting with my boss next week");
    expect(r.triggered).toBe(false);
  });

  test('a genuine casual proposal starting with "can" still triggers (not treated as a question)', () => {
    const r = detect("can we meet at the gym tomorrow");
    expect(r.triggered).toBe(true);
  });

});


// ─────────────────────────────────────────────
// MUST-TRIGGER — hardened rules must not break these
// ─────────────────────────────────────────────

describe('Must-trigger — should still trigger after hardening', () => {

  test('classic plan proposal', () => {
    const r = detect("let's grab dinner tomorrow at 7");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('implicit activity invitation with day and time', () => {
    // activity-question creation phrase + temporal + action
    const r = detect("Coffee Thursday at noon?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('wanna hang — slang invitation', () => {
    // wanna (creation phrase) + Saturday (temporal) + hang (action)
    const r = detect("I'm free Saturday, wanna hang?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('sounds good confirmation with day', () => {
    // sounds good (creation phrase + confirmation score) + Friday (temporal)
    const r = detect("sounds good, see you Friday");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('down for gym tonight', () => {
    // down for (creation phrase) + gym (action) + tonight (temporal)
    const r = detect("down for gym tonight");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  // Found in the 2026-08-30 CLINC150/MASSIVE stress-test review (see
  // TODO.md): the "down for" creation phrase also matches inside the
  // unrelated phrasal verb "mark it down for [date]" ("note it"), not just
  // its "I'm available/willing" sense — a false CONFIRM vote either way,
  // since "mark X down for Y" isn't someone proposing or agreeing to a plan.
  test('"mark X down for Y" does not fire the "down for" creation-phrase vote', () => {
    const r = classifyIntent("mark my budget meeting down for every friday at two");
    expect(r.votes.reasons).not.toContain('create: "down for"');
  });

  test('tmrw invitation with you in', () => {
    // you in (creation phrase) + gym (action) + tmrw + time (temporal)
    const r = detect("gym tmrw at 6pm, you in?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

});


// ─────────────────────────────────────────────
// MULTI-DAY / DATE-RANGE PLANS
// ─────────────────────────────────────────────

describe('Multi-day / date-range plans', () => {

  test('road trip with a weekday range still triggers', () => {
    // "you in" (creation phrase) + trip (action) + "next Fri-Sun" (temporal) —
    // extractor.js only pulls the start date out of the range, but detection
    // itself doesn't depend on extraction, so this should trigger the same
    // as a single-day plan.
    const r = detect("road trip next Fri-Sun, you in?");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('month-day range with a creation phrase still triggers', () => {
    const r = detect("let's meet up March 3-5");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

});


// ─────────────────────────────────────────────
// GROUP PLANS (3+ people)
// ─────────────────────────────────────────────

describe('Group plans (3+ people)', () => {

  test('a long comma-chained participant list does not prevent triggering', () => {
    const r = detect("dinner tomorrow at 7 with Sarah, James, Priya, and Alex");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

  test('KNOWN GAP — an unrelated negation aside anywhere in a longer message tanks the score', () => {
    // Real plan, real creation phrase ("let's"), but the flat-negation fallback
    // in scoreText() (engine.js) applies its -3 penalty to ANY "not" in the
    // text, not just one near the actual plan signals — proximity negation
    // (the "smart" check) only kicks in when a negation word IS near a
    // signal; when it isn't, this "dumb" fallback still fires unconditionally.
    // Documenting current (arguably wrong) behavior rather than reworking
    // engine.js's negation system here — see the detection-improvement plan,
    // Phase 2 note on this exact case.
    const r = detect(
      "let's do dinner tomorrow at 7 with Sarah, James, Priya, and Alex - not sure if everyone's free though, we'll see"
    );
    expect(r.triggered).toBe(false);
    expect(r.score).toBeLessThan(window.DETECTION_THRESHOLD);
  });

});


// ─────────────────────────────────────────────
// RECURRING LANGUAGE — habitual statements should not read as one-time plans
// ─────────────────────────────────────────────

describe('Recurring language', () => {

  test('"every weekend" — below threshold, no action/location signal', () => {
    const r = detect("we hang out every weekend");
    expect(r.triggered).toBe(false);
  });

  test('"every Thursday night" — below threshold', () => {
    const r = detect("class every Thursday night");
    expect(r.triggered).toBe(false);
  });

  test('"gym every Tuesday at 6" — has action+temporal+location, but "every" blocks the implicit structural-confirm fallback', () => {
    const r = detect("gym every Tuesday at 6");
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_intent_signal_drop');
  });

  test('an explicit creation phrase still overrides the habitual guard', () => {
    // "every" only suppresses the *implicit* structural_confirm fallback —
    // an actual creation phrase should still win normally.
    const r = detect("let's do gym every Tuesday at 6");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

});


// ─────────────────────────────────────────────
// NON-ENGLISH AND EMOJI TEXT — should fail safe (no crash, no false-positive)
// ─────────────────────────────────────────────

describe('Non-English and emoji text', () => {

  test('non-English text does not crash and does not false-positive', () => {
    // None of the engine's patterns are English-aware enough to match this —
    // that's correct silent non-detection, not a bug, just undocumented
    // until now. See the detection-improvement plan, Phase 4, on the ceiling
    // of a pure-regex engine with non-English text.
    const r = detect("cena mañana a las 8");
    expect(r.triggered).toBe(false);
  });

  test('emoji-heavy excitement does not break or falsely suppress detection', () => {
    // Score correctly reaches threshold (action+temporal), but with no
    // creation phrase and no location/person for structural_confirm, this
    // correctly does not trigger — same shape as any other bare
    // action+temporal message, emoji doesn't change that.
    const r = detect("dinner tomorrow 🎉🎉🎉");
    expect(r.score).toBeGreaterThanOrEqual(window.DETECTION_THRESHOLD);
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_intent_signal_drop');
  });

});


// ─────────────────────────────────────────────
// VERY SHORT VALID TEXTS — documented expected-misses, not regressions
// ─────────────────────────────────────────────

describe('Very short valid texts', () => {

  test('"7pm?" alone has no action/location signal — correctly does not trigger', () => {
    // In a real chat thread this could be a reply continuing an earlier
    // plan conversation PlanWise has no visibility into (compose-box-only,
    // no thread history) — a bare time with nothing else is genuinely not
    // enough signal on its own. Documented so a future contributor doesn't
    // "fix" this into a regression by loosening the threshold.
    const r = detect("7pm?");
    expect(r.triggered).toBe(false);
  });

});


// ─────────────────────────────────────────────
// PLAN BURIED IN A LONG NOISY MESSAGE
// ─────────────────────────────────────────────

describe('Plan buried in a long noisy message', () => {

  test('a real plan sentence still triggers despite unrelated surrounding chatter', () => {
    const r = detect(
      "omg guess what happened today, work was crazy busy, anyway are you free tomorrow at 7 for dinner? lmk!"
    );
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe(INTENT.CONFIRM);
  });

});
