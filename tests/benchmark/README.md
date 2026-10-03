# Detection-strategy benchmark

Compares the three classification strategies (`legacy`, `layered`,
`full` — see `extension/content/content-script.js`'s
`classificationStrategy` branch) on the same labeled fixtures, so
picking a default is data-driven rather than guessed. Not part of
`npm test` — needs a real Chrome + the unpacked extension (the
`layered`/`full` strategies call the actual on-device model), is slow,
and its outcome is a report, not a pass/fail gate.

## Running it

```
npm run bench
```

Prints a precision/recall/F1/accuracy table per strategy, then every
individual mismatch (grouped by strategy) so you can see *what* each one
gets wrong, not just the aggregate score. Also writes
`last-run-results.json` (gitignored — it's a snapshot of one run, not a
fixture) with full per-case predictions.

## Fixtures

- **`fixtures/detection-80.json`** — the 80 hand-labeled cases already in
  `tests/detection.test.js`, extracted automatically by
  `record-detection-fixture.js` (re-run it if `detection.test.js` changes)
  rather than hand-transcribed. 14 of the original 80 are intentionally
  excluded — they assert on internal scoring mechanics
  (`scoreText`/`classifyIntent` called directly, matchers like
  `toBeGreaterThan`) rather than a plan/not-plan ground-truth judgment,
  so they don't belong in an accuracy benchmark.
- **`fixtures/root-cause-batch.json`** — 30 fresh hand-authored cases
  targeting the three documented false-negative root causes (bare event
  nouns, "let's + verb" generalization, declarative/announcement
  framing — see
  `docs/superpowers/specs/2026-09-05-detection-false-negative-reduction-design.md`),
  plus a handful of negative controls (habitual/vague statements that
  should *not* trigger). This replaces the original 40-phrase batch from
  that investigation, which was only ever a scratch script and no longer
  exists anywhere in the repo.
- **`fixtures/corpora/`** (gitignored, not yet populated) — reserved for
  a re-fetched CLINC150/MASSIVE corpus (the ~40k-utterance scale
  false-positive check from the original investigation). Deferred for
  now in favor of the two labeled fixtures above, which directly answer
  the question that was actually asked this session (compare the two ML
  strategies' accuracy) — picking this back up is a reasonable next
  step if more statistical confidence is wanted, particularly on the
  false-positive rate at scale.

## Most recent run (2026-10-03, 96 cases)

| Strategy | Accuracy | Precision | Recall | F1 | FP rate |
|---|---|---|---|---|---|
| legacy | 75.0% | 100.0% | 53.8% | 70.0% | 0.0% |
| layered | 83.3% | 78.1% | 96.2% | **86.2%** | 31.8% |
| full | 69.8% | 64.9% | 96.2% | 77.5% | 61.4% |

`layered` wins on F1. The mechanism is visible directly in the mismatch
list: `full`'s extra false positives (vs. `layered`) are almost all
cancellation/past-tense/removal phrasing ("I have to cancel our lunch
tomorrow", "we had dinner last night", "delete lunch with steve on
friday") that `rules.js`'s `HARD_BLOCK_RULES` catches for free in
`layered` but `full` has no equivalent for, since it skips rules.js
entirely. `layered`'s own remaining false positives cluster into
categories the *legacy* engine already has explicit guards for that the
raw model call doesn't inherit when it's reached (questions about an
existing plan, habitual "every weekend" statements, non-English text) —
worth revisiting as a targeted follow-up (e.g. applying those same
guards as a post-filter on the model's verdict) rather than a reason to
discard the layered approach.
