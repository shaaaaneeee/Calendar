# Chrome Web Store listing prep

Working notes for submitting PlanWise. Everything here is grounded in what
the code actually does as of `extension/manifest.json` version `0.2.0` —
update this doc if that drifts.

## Single purpose

> PlanWise detects when you're describing a plan in a message you're typing
> (on WhatsApp Web, Telegram Web, or Gmail) and offers to add it to your
> calendar.

## Permission justifications

Paste these into the "Permission justification" fields in the Developer
Dashboard's Privacy tab.

| Permission | Why it's needed |
|---|---|
| `storage` | Stores the local detection log, pending (unconfirmed) detected plans, and user settings on-device via `chrome.storage.local`. |
| `notifications` | Shows a system notification when an event is shared to a group the user belongs to (real-time collaboration feature). |
| `tabs` | Opens the calendar dashboard, settings, tasks, and training pages in a new tab from the popup (`chrome.tabs.create`). |
| `host_permissions: web.whatsapp.com` | Reads the text in your own WhatsApp Web compose box as you type, to detect plans before you send them. Never reads messages from other people. |
| `host_permissions: web.telegram.org` | Same, for Telegram Web's compose box. |
| `host_permissions: mail.google.com` | Same, for Gmail's compose window — reads only what you're actively drafting, the same scope Grammarly's Gmail integration uses. |
| `host_permissions: *.supabase.co` | Backend API calls (auth, confirmed events, settings sync, groups/RSVP/comments) to our Supabase project. |

**Note:** the manifest previously also requested `alarms`, which was never
actually used anywhere in the codebase — removed in this pass. Don't re-add
permissions without a real, currently-shipping feature that needs them;
unused/unjustifiable permissions are a common rejection reason.

## Data usage disclosure (Privacy practices tab)

This should mirror [privacy.html](../landing/public/privacy.html) exactly —
fill out the Web Store's data disclosure form to match:

- **Personally identifiable info**: collected (email, for account creation via Supabase Auth).
- **User activity**: collected (text you type is analyzed locally; confirmed event text is stored server-side, tied to your account).
- **Website content**: *not* collected in the sense the Store means it (reading other pages/other users' content) — clarify in the free-text field that only the user's own compose-box input is read, never page content generally.
- Certify: data is **not sold to third parties**, **not used for purposes unrelated to the extension's single purpose**, **not used to determine creditworthiness or for lending**.

## Store listing copy

**Short description** (132 char max — reuse or lightly adapt the manifest description):
> Detects plans in messages you type and adds them to your calendar. Only reads your own compose box - never other people's messages.

**Detailed description** — draft, expand/adjust before submitting:
> PlanWise reads the message you're typing in WhatsApp Web, Telegram Web, or Gmail — before you hit send — and checks whether it looks like you're proposing a plan: a time, a place, a person, an activity. When it spots one, review the extracted details in a popup and add it to your calendar with one click.
>
> PlanWise never reads messages from other people. It only ever sees your own compose box, the same way a spell-checker does.
>
> From the calendar dashboard, share plans with groups, RSVP, comment in real time, and track task deadlines alongside your events.

**Category**: Productivity.

## Screenshots

Web Store requires 1-5 screenshots, 1280×800 or 640×400. Suggested set (none
captured yet):
1. Popup showing a detected plan card with fields filled in.
2. Settings → Detection tab (custom trigger/activity/place words).
3. Calendar dashboard, month view, with a few events.
4. Groups / shared event with RSVPs.
5. Tasks kanban board.

Also needed: a 440×280 (or 1400×560) promotional tile image — not yet made.

## Outstanding before this is actually submission-ready

- [ ] Fill in the `[DATE]` and `[CONTACT EMAIL]` placeholders in `landing/public/privacy.html`.
- [ ] Deploy the landing site so `privacy.html` resolves at a real public URL (needed — the Store requires a live privacy policy link, not a repo file).
- [ ] Capture the 5 screenshots above from a real signed-in session.
- [ ] Make the 440×280 promo tile.
- [ ] Chrome Web Store developer account (one-time $5 registration fee) if not already set up.
- [ ] Finish the Phase 0 reliability sweep (silent-failure pattern) — a buggy first impression is worse than a slightly later submission.
