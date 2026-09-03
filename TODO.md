# TODO

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
