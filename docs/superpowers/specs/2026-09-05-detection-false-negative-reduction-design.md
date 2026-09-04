# Detection False-Negative Reduction — Design Options

**Status:** Draft for review — decision points are left open as explicit
menus rather than a single recommended path, per request, for the user
and a friend to decide together.

## Problem

A targeted stress test (40 freeform sentences, each unambiguously a real
plan to a human reader, written without reference to the algorithm's
rules) measured a **35/40 (87.5%) false-negative rate** against the
current local regex engine (`extension/detection/rules.js` +
`extension/detection/engine.js`). A broader mixed batch (56 phrases,
plan/ambiguous/unrelated/rejection) showed **zero false positives** —
the engine is conservative, not noisy. The problem is specifically that
it under-triggers, not that it's wrong when it does trigger.

### Root cause, traced in code (not guessed)

Detection is two-stage:

1. **`scoreText()`** (`rules.js`) — regex-matches known signal categories
   (action words, temporal words, location words, custom words) and sums
   a score. `DETECTION_THRESHOLD = 3` (`rules.js:110`). Below threshold,
   `analyzeIntent()` returns immediately with `reason: "below_threshold"`
   — stage 2 never runs.
2. **`classifyIntent()`** (`engine.js:193`) — for text that cleared stage
   1, either an explicit `CREATION_PHRASES` regex matches ("let's meet,"
   "want to," etc. — a hand-maintained list), or a structural fallback
   fires: `hasActionSignal && structuralMatches.temporal &&
   (hasLocationSignal || hasLikelyPersonName(text))` (`engine.js:283-293`).
   If neither, `reason: "no_intent_signal_drop"`.

Both stages under-fire on the same kind of input, for two concrete,
narrow reasons visible in the test data:

- **Bare event nouns aren't action signals.** "coffee," "dinner,"
  "poker night," "book club," "brunch" alone don't match the built-in
  action-word list, so `hasActionSignal` is false and the structural
  fallback never reaches its temporal/location check — even when the
  temporal and location signals are both clearly present ("coffee
  tomorrow at 10am at the usual place").
- **`CREATION_PHRASES` is a verb-specific list, not a pattern.** "let's
  meet" and "let's get together" match; "let's do sushi" and "let's grab
  drinks" don't — same construction, different verb, no generalized
  "let's + verb" rule.
- **Declarative/announcement framing never votes creation at all.**
  "the wedding is on June 12th," "our anniversary dinner is booked for
  saturday night," "the interview is scheduled for tuesday" carry a full
  date + clear event, but nothing in `CREATION_PHRASES` or the
  structural fallback recognizes "X is scheduled/booked/happening" as a
  creation signal — only first/second-person invitation phrasing is
  covered.

This matters for scoping any fix: the gap is narrow and mechanical, not
"the whole approach is wrong." That's directly relevant to whether an AI
API is even necessary, see Option A below.

## Goals

- Materially cut the false-negative rate below the current 87.5%.
- Keep the zero-false-positive property from the mixed-batch test — a
  fix that trades false negatives for false positives isn't a win, it's
  the same problem in the other direction, and false positives are more
  annoying (the user has to dismiss a wrong prompt) than a missed catch
  (the user just adds the event manually, same as today).
- Whatever ships must not surprise users on cost or privacy grounds.

## Non-Goals

- Multi-language support (the whole engine is English-regex-based today;
  out of scope here).
- Rewriting the extraction pipeline (`extractor.js`) — spot-checked
  below on 5 of the 35 missed phrases and it already handles
  dates/times/titles fine on all 5; the gap looks like it's in the
  *classification* stage, not extraction, but this isn't exhaustively
  verified across all 35.

---

## Option A — Expand the local rule set (no ongoing cost, no privacy change)

Directly targets the three root causes above:

1. Add an `EVENT_NOUN_WORDS` category (coffee, dinner, lunch, brunch,
   drinks, game night, poker night, book club, bbq, movie night, date
   night, etc.) folded into `hasActionSignal` alongside the existing
   action/custom/activityWords/meetingWords check.
2. Generalize `CREATION_PHRASES`' "let's" handling from an enumerated
   verb list to a pattern (`/\blet'?s\s+\w+/i`-shaped, tuned to avoid
   false positives like "let's see" / "let's talk" without a
   plan-shaped context).
3. Add an `ANNOUNCEMENT_PHRASES` category recognizing declarative plan
   statements ("is scheduled for," "is booked for," "is happening on,"
   "I booked us," "I scheduled") as creation votes, not just invitation
   phrasing.

**Validation is cheap and already set up:** the CLINC150 + MASSIVE
datasets are already sitting untracked in the repo from the August bulk
stress test (~40,000 utterances) — re-running that same harness after
any rule change is a real regression test for "did this reintroduce
false positives," not just a vibe check. The 40-phrase and 56-phrase
batches from this conversation should also become permanent test cases
in `tests/detection.test.js` (they currently exist only as throwaway
scratch scripts).

**Trade-off:** regex rule lists have a ceiling — they will always miss
phrasings nobody thought to enumerate. But given the two specific,
narrow patterns found, this could plausibly close most of the 87.5% gap
for zero ongoing cost, zero latency, and zero privacy exposure. This is
the recommended *first* move regardless of what else gets built,
because it's nearly free to try and the ceiling on a cloud AI fallback
is much easier to reason about once the "should be free" cases are
actually free.

---

## Option B — On-device classifier (no per-call cost, real one-time cost)

Train a small local intent classifier (not a cloud API) on the CLINC150
+ MASSIVE datasets plus PlanWise-specific plan/no-plan labeled examples,
ship the model weights with the extension, run inference fully
client-side (e.g. via `transformers.js`/ONNX Runtime Web).

- **Cost:** $0 marginal per call, forever. Real one-time cost: labeling
  effort, training, and a runtime library added to a content script
  (extension bundle size grows; inference must not noticeably slow down
  typing in WhatsApp/Gmail/Telegram — needs to run in a Web Worker to
  avoid blocking the page).
- **Privacy:** nothing ever leaves the device — the strongest privacy
  story of any option here, matching the extension's existing "never
  reads other people's messages" promise without adding a caveat.
- **Maintenance:** improving it later means retraining and re-shipping a
  new model file, not editing a prompt.

---

## Option C — Cloud AI API fallback

This is the option that needs active cost/privacy management. Laid out
as sub-decisions since each one materially changes the cost profile.

### Non-negotiable architecture piece

A real AI provider API key (Anthropic/OpenAI/etc.) **cannot ship inside
the extension** the way the Supabase anon key does — Supabase's anon key
is safe by design because Supabase enforces authorization server-side
via RLS; an AI provider key has no equivalent client-side safety net, so
anyone who unpacks the `.crx` gets a key that spends on your account.

This means the call must go through a small server-side proxy holding
the real key — and since the project already runs on Supabase with
auth already wired up, a **Supabase Edge Function** is the natural
choice: no new host_permission entry needed in `manifest.json` (the
extension already has `https://*.supabase.co/*`), the existing Supabase
JWT can attribute each call to a signed-in user, and the budget-cap
logic below lives naturally next to the auth check, server-side where it
can't be bypassed by editing a local copy of the extension.

Flow: content script → `chrome.runtime.sendMessage` → background service
worker → Supabase Edge Function (holds the real key as a Supabase
secret, never shipped to the client) → AI provider → same path back.

The AI's job is scoped to **classification only** (a yes/no plus maybe a
confidence score), not extraction — spot-checked above that
`extractor.js`'s local field extraction already works fine on 5 of the
missed phrases (dates, times, titles all parse correctly; only the
CONFIRM/AMBIGUOUS gate was wrong). Once the AI confirms a plan, the
existing local `extractEvent()` still does field parsing. This keeps the
prompt and response both tiny (cheap) and reuses already-proven code
instead of asking the AI to also do date math.

### Decision: when does the AI get called? (biggest cost lever)

| Option | Coverage | Cost |
|---|---|---|
| **Near-miss fallback only** — call AI only when the local engine reached stage-1 threshold but stage-2 dropped it (`reason: "no_intent_signal_drop"`), or scored within ~1-2 points of threshold | Targets exactly the measured failure zone | Lowest — most unrelated chatter (score 0-1) never reaches the API |
| **Fallback for every local miss** | Catches more (local engine misses 87% of true plans today) | High — API runs on most composed messages |
| **AI double-checks every local decision** (flagged and unflagged) | Also catches local false positives, not just negatives (though the mixed-batch test found none yet) | Highest — runs on effectively every message |
| **AI replaces the local engine** | Simplest architecture | Cost scales directly with typing activity, no cheap pre-filter |

### Decision: cost controls (needed regardless of trigger strategy)

- **Cache by exact flushed text** — the compose-box buffer flushes on a
  1.5s typing pause *and* on Enter/send (`content-script.js:84`,
  `:97-100`), so a single message being composed can flush 2-4+ times
  before it's sent, each with the full current text. Caching by exact
  text string avoids re-calling the API for text that hasn't changed
  since the last flush.
- **Only call on the send-triggered flush, not intermediate pauses** —
  an even simpler cut: skip the AI tier entirely for pause-triggered
  flushes (`fromSend === false`) and only consider it on the flush that
  fires from Enter/send-button click. Trades "catch it while still
  typing" for a large reduction in call volume, since most
  pause-triggered flushes never lead anywhere.
- **Per-user daily/monthly call cap**, enforced in the Edge Function (a
  `ai_classify_usage` table keyed by user_id + date, atomic increment,
  reject with a "budget exceeded" status once over) — client-side caps
  alone aren't trustworthy since a modified local copy of the extension
  could ignore them, but a client-side cap is still worth adding too, as
  a first line of defense that avoids even sending the request.
- **Global spend circuit breaker** — a second cap on aggregate
  spend/day across all users, independent of per-user caps, protecting
  against a bug causing runaway calls across many sessions at once. Once
  tripped, the Edge Function returns "unavailable" and the client
  silently falls back to local-only classification for the rest of the
  period — never blocks the user from sending their message either way.
- **Cheapest capable model** — a fast/cheap tier (e.g. Claude Haiku) is
  almost certainly sufficient for a binary plan/no-plan classification
  task; no reason to reach for a frontier model here.
- **Settings toggle** — an explicit on/off switch for the AI tier,
  independent of the per-user cap, so a user (or you, globally) can
  disable it without a code change.

### Decision: privacy & consent

The current manifest description promises: *"Only reads your own compose
box — never other people's messages."* It says nothing about sending
that text to a third party. Introducing a cloud AI call changes that
promise's scope even though it doesn't violate the "own compose box"
part literally — worth deciding deliberately rather than by omission:

| Option | Trade-off |
|---|---|
| **Opt-in, default OFF** | Most conservative — respects the existing privacy framing, but most users never discover/enable it, limiting the fix's real-world impact |
| **Opt-in, prompted once** (a one-time "want smarter detection?" prompt explaining the trade-off) | Higher adoption than silent opt-in, still consent-based |
| **Default ON, disclosed in the description/permissions and settings** | Maximizes coverage immediately, but is a real promise change users didn't ask for |

Whichever is chosen, the manifest description and any privacy-facing
copy needs updating to mention it — this isn't optional once any text
leaves the device.

### Decision: provider/model

Anthropic (Claude Haiku 4.5) is the natural default given this project's
existing tooling context, but OpenAI/Gemini are viable alternatives with
similar cheap-tier pricing. Worth comparing actual per-call pricing at
decision time rather than assuming — pricing changes.

---

## Option D — Bring-your-own-key

Let users who want the AI fallback paste their own provider API key in
settings (stored locally via `chrome.storage`), calls go straight from
their browser to the provider — no shared backend, no spend risk to you
at all.

**Trade-off:** only benefits users willing to get their own key (a real
adoption ceiling), and re-introduces the "key must never be exposed"
problem in reverse — now it's the *user's* key sitting in extension
storage, readable by anything with access to that profile's extension
data. Simpler to build than Option C's Edge Function proxy, but shifts
both cost and a security question onto the user instead of solving it.

---

## Option E — Personal feedback loop (free, slow, personalizes)

When a user manually creates an event from a message the engine didn't
flag (or dismisses one it wrongly did), log that correction locally and
nudge that user's own score threshold / keyword weights over time.
Costs nothing, never leaves the device, but only helps the individual
user's own repeat patterns — doesn't generalize, and takes many
corrections before it visibly helps. Best framed as a complement to
whichever other option ships, not a replacement.

---

## Suggested sequencing (not a decision — just an ordering observation)

Option A costs nothing to attempt and is already validated as targeting
the actual measured failure modes — trying it first, then re-running
both stress-test batches, tells you the *real* residual gap before
committing to anything with ongoing cost or privacy trade-offs. Whatever
gap remains after A is the honest input to deciding among B/C/D/E, not
the current 87.5% number.

## Validation plan (applies to any option chosen)

1. Promote the 40-phrase false-negative batch and the 56-phrase mixed
   batch from this conversation into permanent `tests/detection.test.js`
   cases (currently only scratch scripts).
2. Re-run the full CLINC150 + MASSIVE bulk stress test after any rule or
   model change — regression-checks the zero-false-positive property,
   not just the false-negative rate.
3. For Option C specifically: a synthetic "rapid typing" test (simulate
   a buffer flushing every 1.5s across a 30-second composition) to
   confirm the caching/trigger-strategy choice actually caps call volume
   the way the design assumes, before it's live.

## Open decisions

- Option A vs. B vs. C vs. D vs. E, or some combination (A + C as a
  tiered fallback is the shape the sequencing note above implies, but
  isn't decided here).
- If C: trigger strategy, cost caps (exact numbers), privacy default,
  provider/model.
- If B: labeling/training approach and bundle-size budget.
- If D: whether it ships alongside or instead of C.
