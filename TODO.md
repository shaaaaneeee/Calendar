# TODO

## Detection engine rewrite — Phase 0-3 done, real benchmark results in (2026-10-03)

Plan at `C:\Users\shane\.claude\plans\sleepy-foraging-kettle.md` (dual-
strategy ML classification, built per the user's explicit request to
build both and measure them against each other rather than pick one
upfront). Built and verified against a real loaded unpacked extension,
not assumed:

- **New ML infra** (commit `b8be3a2`): `extension/offscreen/` (model-
  loading/inference, a chrome.offscreen document so it survives service-
  worker suspension), `extension/vendor/transformers/` (Transformers.js
  runtime, esbuild-bundled - an inline or external import map both
  failed inside MV3's CSP, confirmed by testing, not assumed), new
  `manifest.json` permissions/host_permissions/CSP. `@huggingface/
  transformers` + `esbuild` added as dependencies (esbuild is dev-only,
  used solely to resolve two bare-specifier imports at vendor time - does
  not change how the rest of the extension is authored).
- **Two strategies** (commit `d482bd1`): `strategy-layered.js` (rules.js
  fast path + model for the ambiguous middle) and `strategy-full.js`
  (model decides everything, no rules.js). `content-script.js` branches
  on a new `classificationStrategy` setting (`legacy` default, unchanged
  behavior). Both Jest-tested via a stubbed model call
  (`tests/strategy-routing.test.js`).
- **Settings plumbing** (commit `9acff60`): experimental selector in
  Settings → Detection. Migration `023_add_classification_strategy.sql`
  written but **not yet run against the live Supabase project** - no
  DB/MCP access from this environment to apply it; run it in the SQL
  Editor before relying on cross-device sync of this setting.
- **Real benchmark, run and documented** (commit `d5d1f1b`,
  `tests/benchmark/`, `npm run bench`): 96 cases (80 promoted from the
  existing Jest suite + 30 freshly hand-authored targeting the three
  documented root causes). **Results: legacy 70.0% F1 (100% precision,
  53.8% recall), layered 86.2% F1 (best), full 77.5% F1.** `layered` wins
  because it keeps `rules.js`'s free hard-block fast path - `full`'s
  extra false positives are almost all cancellation/past-tense/removal
  phrasing that path catches for free and `full` has no equivalent for.
  Full writeup and the actual mismatch lists in `tests/benchmark/README.md`.

**Not done / deferred, explicitly per the plan's own fallback clauses:**
- GLiNER (location/participant span extraction) spike - deferred, ships
  with the existing regex extractor unchanged for now.
- CLINC150/MASSIVE large-scale (~40k-utterance) re-fetch for a bigger
  false-positive-rate check - the two fixtures already built directly
  answer the strategy-comparison question asked; this is a reasonable
  follow-up for more statistical confidence, not a blocker.
- Manual real-Gmail/WhatsApp/Telegram smoke test of the new strategies
  (only tested via synthetic messages through the real extension, not by
  actually typing into a live chat).
- Choosing a new default. The data points to `layered`, but nobody's
  actually flipped the setting's default yet - `legacy` still ships as
  default pending that decision.

## To-test checklist created (2026-09-30)

Went through every `.md` doc in the repo and pulled every manual-
verification step mentioned anywhere into one file: `TO_TEST.md`. Covers
not-yet-verified items, a regression checklist for already-shipped
features, and items blocked on features not yet built (desktop app,
detection false-negative fix).

## Quoted/forwarded text no longer feeds plan detection (2026-09-30) — done

**Problem:** `content-script.js` read the entire Gmail compose box's
`textContent`, including quoted reply/forward history, and
`text-buffer.js` kept only the *last* 500 characters — so on a long
thread, detection could run on old quoted content instead of what the
user just typed, risking an old plan re-triggering as new.

**Fix:** added a per-platform `quoteSelectors` list in `dom-observer.js`
(Gmail: `.gmail_quote_container`, `.gmail_quote`, `blockquote` — from
Gmail's long-documented compose markup, not verified against a live
account this session; WhatsApp/Telegram left empty with a `TODO`, not
confirmed either). `content-script.js` now clones the compose node,
strips matches from the clone, and reads text from that before it ever
reaches the buffer — the live DOM is never touched. Commit `b7d0b91`.

Also added: selector-drift logging — a `console.warn` naming the
platform, index, and selector string whenever a platform's *primary*
input selector fails and a fallback selector saves it, so DOM drift on
Gmail/WhatsApp/Telegram shows up in the console before every fallback
also breaks. Commit `72f314c`.

**Not yet done:** real Gmail/WhatsApp/Telegram manual verification — see
`TO_TEST.md` items 1–2.

## HF model research for Gmail plan detection (2026-09-30) — research only, no code

Explored replacing/supplementing Gemini Nano with small Hugging Face
models (zero-shot classifiers, GLiNER, small instruct LLMs) for
PlanWise's four detection tasks (plan detection, note detection,
date/time/place extraction, structured event creation). Conclusion: run
everything **on-device** via Transformers.js — never server-side, given
the "drafts never leave the device" privacy stance — staged as rules → a
small zero-shot classifier (only on the rule engine's ambiguous cases) →
GLiNER for location/participant spans → deterministic template assembly
→ a small instruct LLM (SmolLM2-360M or similar) only as a last-resort
field-repair step. Full model comparison, sizing, and MV3/Transformers.js
runtime constraints (bundle the JS/WASM runtime locally to avoid a Chrome
Web Store "remote code" rejection; lazy-downloading model *weights* from
the Hub at runtime is fine, since those are data, not code) live in this
session's conversation, not yet written into a spec file. **No code
changes were made from this research** — superseded in priority by the
full algorithm rewrite noted above, in any case.

## Popup sign-in gating, dark mode moved to Settings, paused-DB guard (2026-09-30) — done

**Three-part ask:** (1) the popup's "Calendar" footer link was visible
and clickable even when signed out, letting someone open the dashboard
with no account. (2) dark mode lived as a one-tap header button on the
dashboard — too easy to hit by accident, and not synced anywhere else.
(3) if the Supabase project is paused/unreachable, the popup and the
full-page app need to show a clear "service unavailable" state rather
than a broken or misleading one.

**Fix:**
- `popup.js`/`popup.html`: Calendar/Tasks/Settings footer links are now
  hidden by default, shown only once `showQueue()` confirms a signed-in
  session. Added a `#service-unavailable` state, checked via a new
  `SupabaseClient.health.isAvailable()` *before* the auth check even
  runs.
- `dashboard.js`: `init()` now checks sign-in (`showSignInRequired()`)
  and DB health (`showServiceUnavailable()`) first — both replace the
  whole page rather than showing a banner, so nothing falls through to
  the local-storage fallback and ends up looking like a half-working
  calendar.
- `settings.js`: same `showServiceUnavailable()` guard added to `init()`.
- Dark mode: removed the header toggle button and `initThemeToggle()`
  from `dashboard.js`/`dashboard.html` entirely. Added a "Dark mode"
  toggle in Settings → Account instead (`wireThemeToggle()`).
  `theme-init.js` (the before-paint theme-apply script) moved from
  `extension/dashboard/` to `extension/utils/` and is now included on
  every page (popup, dashboard, settings, tasks, signup) so the choice
  made in Settings shows up everywhere, even though it can only be
  changed there.
- `supabase-client.js`: added `SupabaseHealth.isAvailable()` — a
  5-second-timeout ping to Supabase's `/auth/v1/health` endpoint.

**Status:** committed as `f728512`, pushed to `origin/main`. Not yet
manually verified — see `TO_TEST.md` item 3.

## Dashboard load time — root cause found and fixed (2026-09-04)

**Reported:** dashboard.html feels slow to open (~half a second) every time.

**First pass (small win):** `loadEvents()` was awaiting
`Events.materializeRecurrences()` before fetching events at all - a full
extra sequential network round-trip blocking first paint for a call that
only matters near the 1-year materialization horizon. Made fire-and-forget.

**Real bottleneck, found via a HAR capture of an actual dashboard load in
the real extension:** 4 separate `POST /auth/v1/token?grant_type=refresh_token`
calls, almost entirely sequential, totaling ~1.3s of the page's ~1.85s total
load time - by far the largest cost. `db.auth.setSession()` (called inside
`_restoreSession()`) is a real network round-trip every time, not a cached
local operation, and `loadEvents`, `loadGroupsFilter`, `initNotifFeed`, and
`loadUserInitials` each independently restore their own session on every
load. Fixed by memoizing the session promise per page load in
`supabase-client.js` - every caller now shares one round-trip. Benefits
every page (popup/dashboard/settings/tasks/signup), not just the dashboard.

**Checked and ruled out:** suspected `SupabaseEvents.getAll()`'s unbounded
query (no date filtering, fetches every event ever) might be the bigger
cost. Checked directly against the live database (read-only, via the
Supabase connector): 94 rows in `events`, zero performance advisories.
Its ~360ms is essentially pure network RTT to the Tokyo region, not query
cost - not the bottleneck at this data size. Still worth bounding by date
range eventually as the account grows and for general hygiene, but not
urgent - not treating it as a live problem anymore.

**Also not urgent anymore:** parallelizing `init()`'s independent loaders
(groups filter, tasks preview, notifications, user initials) so they start
alongside `loadEvents()` instead of after it. Most of what made that
ordering costly was the redundant session-restore calls each one made,
which the memoization fix above already eliminates - revisit only if a
future load-time check shows it's still worth the complexity (one of the
loaders has a real data-ordering dependency on `loadEvents()`'s result that
would need care, not a blind reorder).

**Confirmed with a second HAR capture from the real extension (2026-09-04):**
`/auth/v1/token` calls went from 4 to 1, total requests from 8 to 5,
critical-path load time from ~1854ms to ~1037ms - a measured 44%
reduction. Temporary diagnostic instrumentation removed from
`dashboard.js` now that the investigation is done.

## Review desktop app design spec — done (2026-09-03)

Reviewed `docs/superpowers/specs/2026-09-03-desktop-app-design.md` and
flagged two things directly in the spec before moving to an implementation
plan: every Electron `BrowserWindow` needs `contextIsolation`/
`nodeIntegration`/`sandbox` set correctly (these renderers load the same
pages that already had one stored-XSS bug this session - a DOM bug that's
sandboxed in the Chrome extension becomes full desktop RCE in a
misconfigured Electron renderer), and password/PIN fields in allowlisted
apps need a manual-verification step confirming the UIA Watcher doesn't
see them (expected to be a non-issue via `IsPassword`, not yet confirmed).
Implementation plan not started yet.

## Custom SMTP for auth emails — done for now

**Resolved:** switched to Gmail SMTP relay (`smtp.gmail.com:587`, App
Password) sending as `planwisecalendar@gmail.com` — Resend was ruled out
for now since it requires a verified domain we don't have yet, and there's
no sandbox fallback for sending to arbitrary recipients. Confirmed working
end-to-end: signup -> email arrives -> confirm link -> lands on
`confirmed.html`. Site URL is also correctly set to
`https://planwise-eosin.vercel.app/confirmed.html`.

**Known limitation, not urgent:** emails land in spam for new recipients.
Root cause is the branded-name/personal-gmail-address mismatch
(`"PlanWise" <planwisecalendar@gmail.com>`) plus zero sender reputation -
not something fixable without a real domain. **Revisit before real users
depend on this**: buy a domain, verify it in Resend, switch SMTP sender to
`noreply@planwise.app`. Not needed for solo testing.

**Small free win — done (2026-09-01):** the email Subject line in
Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup
was the default "Confirm Your Signup" (generic, phishing-pattern-y) -
only the HTML body had been updated to the branded template, not the
subject. Changed to "Confirm your PlanWise account".

## Detection engine — review findings (2026-08-30)

Found by running the full CLINC150 (github.com/clinc/oos-eval) and MASSIVE
(github.com/alexa/massive) datasets through `analyzeIntent()`/`extractEvent()`
as a bulk stress test (~40,000 utterances) — a mix of real bugs already
fixed this session and some reviewed-and-accepted gaps. Recorded here so the
review isn't lost, not because they're all urgent.

**Recurring events — done (2026-08-31):** weekly/biweekly recurrence
("every Tuesday" / "every other Friday") shipped end-to-end — extraction
in `extractor.js`, a `recurrences` table + `materialize_recurrences()` RPC
in `supabase/migrations/016`/`017`, a Repeats toggle in the popup, and
this-event/entire-series edit-delete in the dashboard. Design at
`docs/superpowers/specs/2026-08-30-recurring-events-design.md`, plan at
`docs/superpowers/plans/2026-08-30-recurring-events.md`. Materialization
horizon is 1 year (rolling, extended on each dashboard load).

**"mark X down for Y" false positive — done (2026-09-01):** `"mark my
budget meeting down for every friday at two"` was false-triggering
because `down for` (a CREATION_PHRASES entry meaning "I'm
available/willing") also matched inside the unrelated phrasal verb "mark
it down for [date]" (meaning "note it"). Fixed in `rules.js` with a
negative lookbehind excluding that specific phrasing, rather than
narrowing the legitimate "down for" match — see the "down for gym
tonight" test in `tests/detection.test.js` for the case that must keep
working.

**Reviewed and accepted, no action planned:**
- Meta-questions about translation ("in spanish, meet me tomorrow is said how") misread as the plan they're quoting — fine to miss.
- Proper-noun venue names ("Chili's", "Ruth's Steaks") aren't recognized as locations (`PLACE_LABELS` only has generic words) — fine, users can fill in location themselves before saving.
- Location extraction has no recency/proximity preference architecturally (first match in the text wins) — same reasoning, not worth hardening since it's user-editable.
- Flat negation anywhere in a long message can suppress an otherwise-real plan (a benign "not sure if..." aside far from the actual plan signal still applies a -3 penalty) — not considered a problem.
- Bare "at 1-4" with no am/pm stays `null` rather than guessing — intentional (Phase 1a decision), same tradeoff as above.
- No non-English support — the whole engine is English-regex-based, fails silently rather than wrong. Known, not planned.
- A handful of dataset "false positives" that are actually defensible real plan-shaped content even in odd framing (e.g. "send chris an email say...want to go to dinner") — accepted as fine to trigger.

## Password requirements — done

**Client-side:** `extension/signup/signup.js` requires 8+ characters, at
least one uppercase letter, and at least one number (standard-shape
policy). Specific, combined error message names exactly what's missing.

**Server-side (2026-08-31):** Supabase Dashboard minimum password length
set to 8, with uppercase and digit character-class requirements enabled.
Lowercase/symbol requirements deliberately left off since the client-side
check doesn't require them either — matching exactly, not exceeding,
avoids a password that passes client-side validation getting rejected
server-side.
