/**
 * Tests for the routing LOGIC of the two new classification strategies -
 * not the ML model itself, which has no Jest coverage (it needs
 * chrome.offscreen/real fetch/ONNX Runtime Web, none of which exist in
 * this Node test environment). classifyFn is stubbed so these tests
 * only verify: does the strategy call the model when it should, and
 * skip it when a free signal already answered the question.
 */

require('../extension/detection/rules.js');
require('../extension/detection/engine.js');
require('../extension/detection/strategy-layered.js');
require('../extension/detection/strategy-full.js');

const StrategyLayered = window.PlanWiseStrategyLayered;
const StrategyFull = window.PlanWiseStrategyFull;

function mockClassify(returnLabel) {
  const calls = [];
  const fn = async (text, labels) => {
    calls.push({ text, labels });
    return { label: returnLabel, scores: [1, 0, 0], labels };
  };
  fn.calls = calls;
  return fn;
}

describe('Strategy A (layered) routing', () => {
  test('hard-block text never invokes the model', async () => {
    const mock = mockClassify(StrategyLayered.ML_LABELS[0]);
    const result = await StrategyLayered.classify("can't make it tonight, something came up", {}, mock);
    expect(mock.calls.length).toBe(0);
    expect(result.intent).toBe('REJECT');
    expect(result.source).toBe('hard_block');
  });

  test('a clear, literal creation phrase with a triggering score fast-paths without the model', async () => {
    const mock = mockClassify(StrategyLayered.ML_LABELS[0]);
    const result = await StrategyLayered.classify("let's meet for dinner tomorrow at 7pm", {}, mock);
    expect(mock.calls.length).toBe(0);
    expect(result.intent).toBe('CONFIRM');
    expect(result.source).toBe('fast_path');
  });

  test('ambiguous text (no hard-block, no literal creation phrase) invokes the model exactly once', async () => {
    const mock = mockClassify(StrategyLayered.ML_LABELS[0]);
    const result = await StrategyLayered.classify("coffee tomorrow at 10am at the usual place", {}, mock);
    expect(mock.calls.length).toBe(1);
    expect(result.source).toBe('model');
    expect(result.intent).toBe('CONFIRM');
  });

  test('a model verdict of "neither" or the note label maps to REJECT', async () => {
    const mock = mockClassify(StrategyLayered.ML_LABELS[2]); // "neither"
    const result = await StrategyLayered.classify("coffee tomorrow at 10am at the usual place", {}, mock);
    expect(result.intent).toBe('REJECT');
  });

  // Real-world false positives (a bare name, a one-word aside) both
  // scored 0 across every DETECTION_RULES category yet reached the
  // model, which answered CONFIRM anyway - mock is rigged to answer
  // CONFIRM here specifically to prove the gate stops it from ever
  // being asked, not just that these particular inputs happen to score
  // low with a well-behaved model.
  test.each([
    ['a bare name with no other content', 'weiling'],
    ['a vague aside with no structural signal', 'hungry bro...'],
  ])('%s never reaches the model and is rejected for free', async (_label, text) => {
    const mock = mockClassify(StrategyLayered.ML_LABELS[0]); // rigged to wrongly say CONFIRM
    const result = await StrategyLayered.classify(text, {}, mock);
    expect(mock.calls.length).toBe(0);
    expect(result.intent).toBe('REJECT');
    expect(result.source).toBe('no_signal_fast_reject');
  });
});

describe('Strategy B (full replacement) routing', () => {
  test('always invokes the model, even for text that would hard-block under Strategy A', async () => {
    const mock = mockClassify(StrategyFull.ML_LABELS[1]); // "note-or-reminder"
    const result = await StrategyFull.classify("can't make it tonight, something came up", mock);
    expect(mock.calls.length).toBe(1);
    expect(result.intent).toBe('REJECT');
  });

  test('always invokes the model, even for a clear literal creation phrase', async () => {
    const mock = mockClassify(StrategyFull.ML_LABELS[0]);
    const result = await StrategyFull.classify("let's meet for dinner tomorrow at 7pm", mock);
    expect(mock.calls.length).toBe(1);
    expect(result.intent).toBe('CONFIRM');
  });
});
