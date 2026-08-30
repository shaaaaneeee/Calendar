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

**Small free win still on the table:** the email Subject line in
Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup
is still the default "Confirm Your Signup" (generic, phishing-pattern-y) -
only the HTML body got updated to the branded template, not the subject.
Changing it to "Confirm your PlanWise account" is free and may help
marginally with spam placement.

## Detection engine — review findings (2026-08-30)

Found by running the full CLINC150 (github.com/clinc/oos-eval) and MASSIVE
(github.com/alexa/massive) datasets through `analyzeIntent()`/`extractEvent()`
as a bulk stress test (~40,000 utterances) — a mix of real bugs already
fixed this session and some reviewed-and-accepted gaps. Recorded here so the
review isn't lost, not because they're all urgent.

**Worth doing later — recurring events (real feature, not just a detection
fix):** `extractDateTime()` currently resolves "every Tuesday" to just the
next occurrence with no recurrence info at all — `extension/detection/extractor.js`,
see the `Recurring / range extraction — documented gaps` block in
`tests/extractor.test.js` for the current baseline behavior. This needs
support in **both** places to be useful: the detection/extraction side (a
recurrence field, not just a single date) and the app side (calendar
save/dashboard would need to actually understand and render a repeating
event, not just a one-off `events` row). Bigger design question than a
regex tweak — decide the data model before touching the regex.

**Worth doing later — small, bounded fix:** `"mark my budget meeting down
for every friday at two"` false-triggers because `down for` (a
CREATION_PHRASES entry meaning "I'm available/willing") also matches inside
the unrelated phrasal verb "mark it down for [date]" (meaning "note it").
Narrow, low-frequency, but a real false positive in `rules.js`.

**Reviewed and accepted, no action planned:**
- Meta-questions about translation ("in spanish, meet me tomorrow is said how") misread as the plan they're quoting — fine to miss.
- Proper-noun venue names ("Chili's", "Ruth's Steaks") aren't recognized as locations (`PLACE_LABELS` only has generic words) — fine, users can fill in location themselves before saving.
- Location extraction has no recency/proximity preference architecturally (first match in the text wins) — same reasoning, not worth hardening since it's user-editable.
- Flat negation anywhere in a long message can suppress an otherwise-real plan (a benign "not sure if..." aside far from the actual plan signal still applies a -3 penalty) — not considered a problem.
- Bare "at 1-4" with no am/pm stays `null` rather than guessing — intentional (Phase 1a decision), same tradeoff as above.
- No non-English support — the whole engine is English-regex-based, fails silently rather than wrong. Known, not planned.
- A handful of dataset "false positives" that are actually defensible real plan-shaped content even in odd framing (e.g. "send chris an email say...want to go to dinner") — accepted as fine to trigger.

## Password requirements

**Client-side: done.** `extension/signup/signup.js` now requires 8+
characters, at least one uppercase letter, and at least one number
(standard-shape policy). Specific, combined error message names exactly
what's missing.

**Still outstanding — server-side enforcement:** the client-side check is
UX-only. Supabase's own server-side minimum password length is still
whatever the dashboard default is (typically 6), so someone hitting the
API directly can bypass the client rule entirely. Need to raise
**Supabase Dashboard → Authentication → minimum password length** to 8+ to
match. Location wasn't found in the dashboard last session — try the
dashboard's search bar (top of page) for "password", or check
Authentication → Providers → Email. Note: Supabase's dashboard-level
policy only supports a minimum length + character-class toggles (e.g.
"require lowercase/uppercase/digits/symbols") — it won't perfectly mirror
the client-side wording, but should be set to at least require length 8 +
uppercase + digit to close the gap.
