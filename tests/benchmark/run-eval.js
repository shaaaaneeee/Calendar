/**
 * PlanWise detection-strategy benchmark.
 *
 * Runs the real production strategy code (not a reimplementation)
 * against the fixtures in tests/benchmark/fixtures/ for all three
 * strategies, and reports precision/recall/F1/accuracy for each so a
 * decision on which becomes the default can be data-driven rather than
 * guessed. Not part of `npm test` - needs a real Chrome + the unpacked
 * extension loaded (for the 'layered'/'full' strategies' actual model
 * calls), is slow, and its outcome is a report, not a pass/fail gate.
 *
 * Usage: npm run bench
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

global.window = global;
require('../../extension/detection/rules.js');
require('../../extension/detection/engine.js');
require('../../extension/detection/strategy-layered.js');
require('../../extension/detection/strategy-full.js');

const EXT_PATH = path.resolve(__dirname, '../../extension');
const STRATEGIES = ['legacy', 'layered', 'full'];

function loadFixtures() {
  const dir = path.join(__dirname, 'fixtures');
  const files = ['detection-80.json', 'root-cause-batch.json'];
  let combined = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Fixture not found, skipping: ${filePath}`);
      continue;
    }
    const cases = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    combined = combined.concat(cases.map((c) => ({ ...c, source: file })));
  }
  return combined;
}

function computeMetrics(predictions) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const { expected, predicted } of predictions) {
    if (predicted && expected) tp++;
    else if (predicted && !expected) fp++;
    else if (!predicted && expected) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && (precision + recall) > 0
    ? (2 * precision * recall) / (precision + recall)
    : null;
  const accuracy = predictions.length > 0 ? (tp + tn) / predictions.length : null;
  return { tp, fp, fn, tn, precision, recall, f1, accuracy, falsePositiveRate: fp + tn > 0 ? fp / (fp + tn) : null };
}

function fmt(n) {
  return n === null ? 'n/a' : (n * 100).toFixed(1) + '%';
}

async function runStrategy(strategyName, fixtures, classifyFn) {
  const predictions = [];
  const errors = [];
  const start = Date.now();

  for (const caseEntry of fixtures) {
    let triggered;
    try {
      if (strategyName === 'legacy') {
        triggered = window.PlanWiseEngine.analyzeIntent(caseEntry.text, {}).triggered;
      } else if (strategyName === 'layered') {
        const result = await window.PlanWiseStrategyLayered.classify(caseEntry.text, {}, classifyFn);
        triggered = result.intent === 'CONFIRM';
      } else {
        const result = await window.PlanWiseStrategyFull.classify(caseEntry.text, classifyFn);
        triggered = result.intent === 'CONFIRM';
      }
    } catch (err) {
      errors.push({ text: caseEntry.text, error: err.message });
      continue;
    }
    predictions.push({ text: caseEntry.text, expected: caseEntry.expectedTriggered, predicted: triggered, source: caseEntry.source });
  }

  const elapsedMs = Date.now() - start;
  return { strategyName, metrics: computeMetrics(predictions), predictions, errors, elapsedMs, caseCount: fixtures.length };
}

(async () => {
  const fixtures = loadFixtures();
  console.log(`Loaded ${fixtures.length} benchmark cases.\n`);

  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  });

  let background = ctx.serviceWorkers()[0];
  if (!background) background = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = background.url().split('/')[2];

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup/popup.html`);

  async function classifyFn(text, labels) {
    const response = await page.evaluate(
      ({ text, labels }) => chrome.runtime.sendMessage({ type: 'ML_CLASSIFY', text, labels }),
      { text, labels }
    );
    if (!response || !response.ok) throw new Error(response?.error || 'ML_CLASSIFY failed');
    return response.result;
  }

  const allResults = [];
  for (const strategyName of STRATEGIES) {
    console.log(`Running strategy: ${strategyName}...`);
    const result = await runStrategy(strategyName, fixtures, classifyFn);
    allResults.push(result);
    console.log(`  done in ${result.elapsedMs}ms, ${result.errors.length} errors\n`);
  }

  await ctx.close();

  console.log('='.repeat(100));
  console.log('RESULTS');
  console.log('='.repeat(100));
  console.log(
    'Strategy'.padEnd(10),
    'Accuracy'.padEnd(10), 'Precision'.padEnd(10), 'Recall'.padEnd(10), 'F1'.padEnd(10), 'FP Rate'.padEnd(10),
    'TP/FP/FN/TN'.padEnd(16), 'Time(ms)'
  );
  for (const { strategyName, metrics, elapsedMs, errors } of allResults) {
    console.log(
      strategyName.padEnd(10),
      fmt(metrics.accuracy).padEnd(10), fmt(metrics.precision).padEnd(10), fmt(metrics.recall).padEnd(10), fmt(metrics.f1).padEnd(10), fmt(metrics.falsePositiveRate).padEnd(10),
      `${metrics.tp}/${metrics.fp}/${metrics.fn}/${metrics.tn}`.padEnd(16), elapsedMs,
      errors.length > 0 ? `  (${errors.length} errors)` : ''
    );
  }
  console.log('='.repeat(100));

  // Dump mismatches per strategy for manual inspection - the aggregate
  // table says *whether* one strategy wins, this says *on what*.
  for (const { strategyName, predictions } of allResults) {
    const mismatches = predictions.filter((p) => p.expected !== p.predicted);
    if (mismatches.length === 0) continue;
    console.log(`\n--- ${strategyName}: ${mismatches.length} mismatches ---`);
    for (const m of mismatches) {
      console.log(`  expected=${m.expected} predicted=${m.predicted} [${m.source}] "${m.text}"`);
    }
  }

  const outPath = path.join(__dirname, 'last-run-results.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nFull results written to ${outPath}`);
})().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
