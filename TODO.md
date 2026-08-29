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
