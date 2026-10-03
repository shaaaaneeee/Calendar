/**
 * One-off script (not part of npm test) that extracts the 80 existing
 * hand-labeled cases in tests/detection.test.js into a flat JSON fixture,
 * by running that file through fake describe/test/expect globals instead
 * of real Jest - this avoids manually re-transcribing 80 cases by hand
 * (error-prone) while staying byte-faithful to the actual source of
 * truth. Run once with `node tests/benchmark/record-detection-fixture.js`;
 * re-run any time detection.test.js gains/changes cases.
 */
global.window = global;
require('../../extension/detection/rules.js');
require('../../extension/detection/engine.js');

const results = [];
let currentCategory = null;

global.describe = (name, fn) => { currentCategory = name; fn(); };
global.test = (name, fn) => {
  const record = { category: currentCategory, name, calls: [], expectations: [] };
  results.push(record);
  try {
    fn();
  } catch (e) {
    record.threw = e.message;
  }
};

const realAnalyzeIntent = window.PlanWiseEngine.analyzeIntent;
window.PlanWiseEngine.analyzeIntent = function (text, customRules) {
  const result = realAnalyzeIntent(text, customRules);
  results[results.length - 1].calls.push({ text, result });
  return result;
};

function recordExpectation(actual, expected) {
  if (results.length === 0) return;
  results[results.length - 1].expectations.push({ actual, expected });
}
const noop = () => {};
global.expect = (actual) => ({
  toBe: (expected) => recordExpectation(actual, expected),
  toEqual: (expected) => recordExpectation(actual, expected),
  toContain: noop,
  toBeNull: noop,
  toBeTruthy: noop,
  toBeFalsy: noop,
  toHaveLength: noop,
  not: { toBe: noop, toEqual: noop, toContain: noop },
});

require('../detection.test.js');

// Post-process: for each test with exactly one detect() call, figure out
// the ground-truth triggered/intent the test author asserted by matching
// each expectation's `actual` value against that call's result fields
// (boolean vs INTENT string disambiguate cleanly - no collision risk).
const fixture = [];
for (const record of results) {
  if (record.threw) {
    console.warn(`SKIPPED (threw): "${record.name}": ${record.threw}`);
    continue;
  }
  if (record.calls.length !== 1) {
    console.warn(`SKIPPED (${record.calls.length} calls, expected 1): "${record.name}"`);
    continue;
  }
  const { text, result } = record.calls[0];
  const entry = { text, category: record.category, name: record.name };
  for (const { actual, expected } of record.expectations) {
    if (actual === result.triggered) entry.expectedTriggered = expected;
    else if (actual === result.intent) entry.expectedIntent = expected;
    else if (actual === result.reason) entry.expectedReason = expected;
  }
  if (entry.expectedTriggered === undefined) {
    console.warn(`SKIPPED (no triggered assertion found): "${record.name}"`);
    continue;
  }
  fixture.push(entry);
}

const outPath = require('path').join(__dirname, 'fixtures', 'detection-80.json');
require('fs').writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
console.log(`Wrote ${fixture.length} cases to ${outPath} (${results.length} test() calls seen total)`);
