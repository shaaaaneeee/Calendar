# TODO

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
