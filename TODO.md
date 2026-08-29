# TODO

## Custom SMTP for auth emails

**Why:** Supabase's default (non-custom-SMTP) email sender has a strict
rate limit on the shared/free infrastructure — we've been hitting it
during signup testing. It also sends from a generic
`noreply@mail.app.supabase.io` address, not a PlanWise one.

**Decisions already made:**
- Provider: **Resend** (generous free tier, official Supabase integration guide, easiest setup of the options considered).
- No custom domain yet — start with Resend's default shared sending address (`onboarding@resend.dev`-style); upgrading to a real `noreply@planwise.app`-style address later is just adding DNS records, no config rework needed.

**Steps, in order:**
1. **Link the `landing/` site to Vercel via GitHub** (in progress as of this note) — Add New Project on vercel.com → import `shaaaaneeee/Calendar` → set **Root Directory to `landing`** → deploy. Gives every push to `main` an auto-deploy, and a stable URL.
2. Once that URL exists, update **Supabase Dashboard → Authentication → URL Configuration → Site URL** (currently wrong — defaults to `http://localhost:3000`, which is why the "Confirm your mail" email link led nowhere useful).
3. Sign up for Resend, get an API key.
4. In Supabase Dashboard → Authentication → Settings → SMTP Settings: enable custom SMTP, plug in Resend's SMTP host/port/credentials.
5. Send a test signup through `extension/signup/signup.html` and confirm the email arrives from Resend, not Supabase's default sender.
6. (Later, once a domain exists) verify the domain in Resend (SPF/DKIM DNS records) and switch the sending address to something like `noreply@planwise.app`.

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
