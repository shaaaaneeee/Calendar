# PlanWise — Manual Test Checklist

> **⚠️ Detection algorithm is being completely rewritten next session.**
> Items 6 (recurring events) and 8 (detection false-negative reduction)
> below depend on today's `rules.js`/`engine.js`/`extractor.js` behavior.
> Hold off re-running those until after the rewrite lands — they may
> change shape entirely or become moot. Items 1–5, 7, and 9 are unaffected
> (they're about the content script's DOM handling and app UI, not the
> detection algorithm itself).

Compiled by going through every `.md` file in this repo (`README.md`,
`TODO.md`, `PROJECT_STATUS.md`, `docs/chrome-web-store-listing.md`,
`docs/design-concepts/`, and all 12 files under `docs/superpowers/plans/`
and `docs/superpowers/specs/`) and pulling out every place a doc says
something needs manual/human verification — nothing here is automated by
Jest or Playwright today. Two items (marked below) come from the two most
recent commits instead of a doc, since they're the freshest un-tested
change in the repo and leaving them out would make this list stale on day
one.

Each item says **where it came from**, **whether you can test it right
now**, and gives literal step-by-step instructions. Checkboxes are for you
to tick as you go — nothing here auto-updates.

---

## 🔴 Not yet verified at all — do these first

### 1. Quoted/forwarded email text no longer feeds detection (Gmail)
**Source:** commit `b7d0b91` (this session, not yet in any doc) · **Status:** ready to test now

Fixes a real bug: the content script used to read the *entire* Gmail
compose box, including quoted reply/forward history, and only kept the
*last* 500 characters — so on a long thread, PlanWise could analyze old
quoted content instead of what you just typed.

- [ ] Open Gmail, start a **new, blank** compose (no reply/forward). Type a plan (e.g. "coffee tomorrow at 3pm"). Confirm the popup still detects it — this is the unaffected baseline case, should behave exactly as before.
- [ ] Open an existing thread where an **old message contains a plan** (e.g. "let's meet Tuesday at 5"). Hit Reply. Type something unrelated above the quote, or nothing at all — just let the quoted history sit there. Confirm PlanWise does **NOT** flag a plan from the quoted text.
- [ ] **Forward** an email whose body contains a plan, without adding any new text yourself. Confirm no false detection fires purely from the forwarded content.
- [ ] On a long thread (quoted history alone is over ~500 characters), Reply and type a **new** plan above the quote (e.g. "Actually let's do dinner Friday at 7 instead"). Confirm it **IS** detected correctly — this is the case that was silently broken before the fix.
- [ ] While doing all four, keep the Gmail tab's DevTools console open and confirm no JS errors/exceptions appear.

### 2. Selector-drift warning (Gmail/WhatsApp/Telegram)
**Source:** commit `72f314c` (this session, not yet in any doc) · **Status:** partially testable

Logs a `console.warn` if the *primary* CSS selector for a platform's
compose box ever stops matching and a fallback selector saves it — meant
to catch DOM drift early instead of silently degrading until every
fallback also breaks.

- [ ] Open each of Gmail, WhatsApp Web, and Telegram Web with DevTools console open, reload each page, and confirm you do **NOT** see a `[PlanWise] Selector drift on ...` warning under normal conditions (this just confirms no new noise was introduced).
- [ ] There's no way for you to *force* a real drift without one of those sites actually changing its DOM — so beyond the check above, this one can only be confirmed "for real" the next time Gmail/WhatsApp/Telegram ships a redesign. If you ever do see that warning fire, that's it working as intended, not a bug.

### 3. Popup sign-in gating, dark mode in Settings, paused-DB guard
**Source:** this session, not yet in any doc until now · **Status:** committed (`f728512`), ready to test now

- [ ] Sign out. Open the popup. Confirm the **Calendar/Tasks/Settings** footer links are **not visible** (previously "Calendar" was always shown even when signed out).
- [ ] While signed out, navigate directly to `dashboard.html` (e.g. paste its `chrome-extension://<id>/dashboard/dashboard.html` URL, or open a bookmarked tab from before you signed out). Confirm you see a **"Sign in required"** page, not the calendar (with or without stale local data).
- [ ] Open Settings → Account. Confirm there's a **"Dark mode"** toggle there, and that the dashboard header **no longer has** a dark-mode button at all.
- [ ] Flip the Settings dark-mode toggle on. Confirm the theme changes immediately, **and** that reopening the popup, dashboard, and Tasks all reflect the same dark theme (not just Settings) — this confirms `theme-init.js` is correctly shared across pages now.
- [ ] With Supabase reachable, confirm popup/dashboard/settings all load normally (this guard should be invisible in the healthy case).
- [ ] Hard to simulate without pausing your real Supabase project: if you ever do pause it (or catch it mid-restart, like the incident from earlier this session), confirm the popup shows "Service unavailable" instead of the auth screen, and dashboard/settings show the same instead of any calendar content.

### 4. Landing page Terms/Contact links
**Source:** `docs/superpowers/specs/2026-09-01-landing-redesign.md` line 68 — explicitly logged as *"needs the user's input, not addressed here"* · **Status:** ready to check now

- [ ] Open the live site: https://planwise-eosin.vercel.app
- [ ] Find the footer/nav "Terms" link (if one exists) — click it, confirm it resolves to a real page, not a 404 or placeholder.
- [ ] Find the "Contact" link/email — confirm it's a real, monitored address (the privacy policy already uses `planwisecalendar@gmail.com` — confirm this matches).
- [ ] If a Terms page doesn't exist yet, decide whether to write one or remove the link before Chrome Web Store submission — reviewers do check that linked policy pages actually resolve.

### 5. Data Store Live Sync — real-extension verification
**Source:** `docs/superpowers/plans/2026-09-04-data-store-live-sync.md`, Step 3 — literally labeled *"(needs the user)"* and *"hand these steps to the user"* in the plan · **Status:** ready to test now (feature is shipped — `extension/utils/data-store.js` exists)

- [ ] Reload the unpacked extension at `chrome://extensions`.
- [ ] Open the dashboard. In DevTools → Network tab, set throttling to "Slow 3G", then reload. Confirm the calendar/sidebar render **immediately** (from local cache) rather than showing blank/loading for the throttled duration.
- [ ] Open the dashboard in **two separate browser windows**, signed into the same account in both. In one window, edit an event (or add a Settings trigger word). Confirm the **other** window updates live, with no manual reload.
- [ ] Sign out, then sign in as a **different** test account in the same browser profile. Confirm you do **not** see a flash of the previous account's events/groups/notifications before the new account's data loads.
- [ ] With a page already cached once, turn off your network entirely, then reload. Confirm the cached data still renders (not a blank/broken page), and that a `[PlanWise:DataStore] ... refresh failed`-style warning appears in the console instead.

---

## 🔁 Regression checklist — already shipped, re-run if this area ever changes

These were manual-verification steps for features `PROJECT_STATUS.md`
already lists as shipped and working. Presumably passed when originally
built — kept here as a ready-made checklist for the next time anyone
touches these areas, not because they're known-broken today.

### 6. Dashboard visual refresh (borders, shadows, hover/selection, mini calendar)
**Source:** `docs/superpowers/plans/2026-09-02-dashboard-visual-refresh.md`, Steps 5/7 and `docs/superpowers/specs/2026-09-02-dashboard-visual-refresh.md`

- [ ] Load the unpacked extension, open Dashboard, Settings, and Tasks in turn. Confirm sidebar/topbar dividers (and, on Tasks, kanban column borders) are visibly thicker (2px) on all three pages, nothing is misaligned/overlapping, and page-specific content is unaffected.
- [ ] On the Dashboard's month grid, confirm grid lines are visibly bolder and a faint graph-paper texture shows in empty cell space. Switch to Week view, confirm the same.
- [ ] Hover an empty day cell — confirm a bold border + hard shadow appears and disappears cleanly on mouse-leave.
- [ ] Click a day cell — confirm it opens the day panel **and** keeps the bold border/shadow persistently (not just on hover).
- [ ] Click that same cell again — confirm it closes the day panel and removes the persisted highlight.
- [ ] Click a different cell — confirm the highlight moves there and the panel closes/reopens for the new date.
- [ ] Confirm "today"'s subtle background tint is unaffected by any of the above, in every combination (today+hovered, today+selected, today alone). Repeat in Week view.
- [ ] Confirm a mini calendar appears in the sidebar, showing the same month as the main grid; its prev/next chevrons move both calendars together.
- [ ] Click a date in the mini calendar — confirm it opens that day's panel and shows selected in **both** the mini calendar and main grid. Click it again — confirm both clear together.
- [ ] Confirm today's date is visually distinct (solid fill) in the mini calendar regardless of selection state, and that navigating the main grid's prev/next also moves the mini calendar.

### 7. Recurring events (materialization, save flow, edit/delete scopes)
**Source:** `docs/superpowers/plans/2026-08-30-recurring-events.md`, Steps 3/2/4/5 (across different tasks)

- [ ] In the Supabase SQL Editor, run:
  ```sql
  insert into recurrences (user_id, day_of_week, interval_weeks, title)
  values ('<your-user-id>', 2, 1, 'Test Gym') returning id;
  select materialize_recurrences();
  select event_date, title, recurrence_id, is_exception from events
    where recurrence_id = '<the-id-returned-above>' order by event_date;
  ```
  Confirm a row for every Tuesday from the nearest upcoming one through the 12-week horizon, each `is_exception = false`. Run `select materialize_recurrences();` again — confirm identical row count (no duplicates). Clean up with `delete from recurrences where title = 'Test Gym';`.
- [ ] Load the unpacked extension, open the dashboard's DevTools console, and run:
  ```js
  const series = await window.SupabaseClient.events.createRecurring({ dayOfWeek: 2, intervalWeeks: 1, title: 'Console Test Gym' });
  const all = await window.SupabaseClient.events.getAll();
  console.log(all.filter(e => e.recurrence_id === series.id)); // ~12 weeks of Tuesday rows
  await window.SupabaseClient.events.deleteSeries(series.id); // cleanup
  ```
- [ ] Type "gym every tuesday at 6pm" into a monitored chat input and send it. Open the popup — confirm a checked **"Repeats every Tuesday"** row appears. Click **Add** — confirm several upcoming Tuesdays appear on the dashboard. Try again but **uncheck** the repeat box before Add — confirm only one date is created.
- [ ] Using a recurring series: open one occurrence, edit its title, select **"This event"**, save → confirm only that occurrence changed. Open a different occurrence, edit its title, select **"Entire series"**, save → confirm every occurrence changed except the one you detached. Delete one occurrence with **"This event"** → confirm only that date disappears. Delete the rest with **"Entire series"** → confirm the whole series (including the detached one) disappears.

---

## 🚧 Blocked — can't be tested yet (not implemented)

Included per "every doc, all things" even though there's nothing to click
yet — so this list doesn't go stale the moment either feature ships.

### 8. Desktop app (Windows, UIA-based detection)
**Source:** `docs/superpowers/specs/2026-09-03-desktop-app-design.md`, "Testing" section · **Status:** spec approved, implementation not started (`PROJECT_STATUS.md`)

Once built:
- [ ] Run the UIA Watcher standalone against each allowlisted app (`whatsapp.exe`, `telegram.exe`, `outlook.exe`, `teams.exe`, `slack.exe`, `discord.exe`); confirm live text is captured as you type.
- [ ] Confirm a **non**-allowlisted app's focus produces no events at all.
- [ ] Confirm a detected plan reaches the Notification/Confirm UI, and that confirming it makes the event appear on **both** the desktop dashboard and, on the same account, the Chrome extension's calendar.
- [ ] **Specifically called out as unconfirmed in the spec:** focus a password/PIN field in an allowlisted app (e.g. a Teams re-auth prompt) — confirm it produces **no** `focus-text` event, or an empty one. The spec's own expectation is that Windows' `IsPassword` flag prevents this at the OS level, but says outright this "is not yet confirmed."

### 9. Detection false-negative reduction (whichever option gets chosen)
**Source:** `docs/superpowers/specs/2026-09-05-detection-false-negative-reduction-design.md` · **Status:** superseded — the detection algorithm is getting a full rewrite next session (see banner at top of this file), not just "no direction chosen" among these 5 options anymore. Kept below as reference in case the rewrite reuses any of this validation approach.

Once a direction is picked:
- [ ] Promote the 40-phrase false-negative batch and the 56-phrase mixed batch (currently only scratch scripts from that investigation) into permanent `tests/detection.test.js` cases.
- [ ] Re-run the full CLINC150 + MASSIVE bulk stress test (~40,000 utterances) after the change — this regression-checks the **zero-false-positive** property, not just whether the false-negative rate improved.
- [ ] If Option C (cloud AI fallback) is chosen specifically: run a synthetic "rapid typing" test — simulate the compose buffer flushing every 1.5s across a 30-second composition — and confirm the caching/trigger strategy actually caps call volume the way the design assumes, before it goes live.

---

## Also flagged, but not really "tests" — decisions/admin, listed for completeness

- **Chrome Web Store developer account** — one-time $5 registration, unchecked in `docs/chrome-web-store-listing.md`'s submission checklist. An account action, not a test.
- **"Finish the Phase 0 reliability sweep (silent-failure pattern)"** — `docs/chrome-web-store-listing.md` line 102 references this as outstanding before submission, but I could not find any spec, plan, or other doc anywhere in the repo that defines what this sweep actually covers. I can't respons­ibly turn this into test steps without knowing its scope — flagging it back to you rather than guessing.
- **2 pairs of duplicate test events** in the live `events` table (`PROJECT_STATUS.md`) — explicitly "left untouched pending an explicit decision" under the never-delete rule. A cleanup decision for you to make, not something to test.
- **Store screenshot 4** (`4-groups-rsvp.png`) shows a real username (`davefromrussia`) — swap to a throwaway test account before submitting, per `docs/chrome-web-store-listing.md`'s own note.

---

## Not included, and why

- The three oldest implementation plans (`2026-06-13-phase-a-ui-redesign.md`, `2026-06-13-phase-bcd-social-calendar.md`, and most of the social-calendar spec) have their own "manually verify" steps, but they're for the original UI migration and social features from June, since superseded by the September visual refresh. One of them (`phase-a`) even has a full task for migrating a "Training" page that **no longer exists** in the codebase (`extension/training/` isn't there) — re-testing those exact steps today would partly be testing something that's gone. If you want the social/groups/RSVP/sharing flow re-verified specifically, say so and I'll pull those steps out separately.
