# PlanWise — Project Status

_Last updated: 2026-10-03 (reflects repo state as of commit `d5d1f1b`,
**local only — 4 commits ahead of `origin/main`, not yet pushed**)_

## Detection engine rewrite — built, benchmarked, not yet the default

Two new ML-based classification strategies (`layered`, `full`) were
built alongside the existing rules engine (now called `legacy`),
specifically so they could be measured against each other on real data
rather than committing to one upfront. **Real benchmark result: `layered`
wins (86.2% F1) vs. `legacy` (70.0%, the known under-triggering problem)
and `full` (77.5%)** — see `tests/benchmark/README.md` for the full
writeup and `TODO.md` for the build details. `legacy` still ships as the
default pending an explicit decision to switch it; the
`detection-false-negative-reduction-design.md` spec's 5-option menu is
superseded by this (it was the incremental path, this is the actual
rewrite).

## What this is

PlanWise is a Chrome MV3 extension (vanilla JS, no bundler) that detects
plan-making language typed into WhatsApp Web, Telegram Web, and Gmail
compose boxes, and offers to add the detected plan to a calendar backed
by Supabase (Postgres + RLS + Realtime). It also ships a full dashboard
(month/week calendar, groups, sharing, comments, notifications, tasks)
and a marketing landing page.

## Repo state

- Branch `main`, clean working tree, fully pushed to `origin/main`.
- Tests: 185/185 passing (`npm test`, Jest) — unaffected by this
  session's commits, since none of them touch `detection/` or are
  covered by Jest.

## Shipped and working

- **Detection pipeline** (`extension/detection/`): two-stage regex
  engine (`scoreText()` → `classifyIntent()`) + field extractor
  (dates/times/titles/recurrence). Runs client-side in the content
  script on the user's own compose box only.
- **Calendar dashboard** (`extension/dashboard/`): month/week views,
  independent mini-calendar for jumping dates without losing the main
  view, a month/year picker dropdown, multi-group event pills (stacked
  colour-segment bar with divider, same structure for 1 and 2+ groups),
  live entrance animation now skipped on cache-warm page loads.
- **Data layer** (`extension/utils/data-store.js`): shared cache-then-render
  store for events/groups/notifications, Supabase Realtime live sync
  (no manual refresh needed), sign-out cache clearing across tabs.
- **Social features**: groups, event sharing to groups, comments,
  notifications — all live-synced.
- **Auth**: Supabase auth with Gmail SMTP relay for confirmation emails
  (known limitation: lands in spam for new recipients until a real
  domain is set up — see TODO.md).
- **Security**: RLS IDOR and stored-XSS bugs fixed and verified this
  project cycle; circular RLS recursion bug (shared_events ↔ events)
  fixed via a SECURITY DEFINER helper function, live in production DB.
- **Content-script hardening** (2026-09-30, commits `b7d0b91`/`72f314c`):
  quoted/forwarded Gmail text is stripped before detection runs, instead
  of potentially being analyzed as if newly typed; selector-drift
  logging added so DOM changes on Gmail/WhatsApp/Telegram surface in the
  console before every fallback selector also breaks. Not yet manually
  verified against real Gmail/WhatsApp/Telegram — see `TO_TEST.md`.
- **Popup sign-in gating, dark mode → Settings, paused-DB guard**
  (2026-09-30, commit `f728512`): the popup's Calendar/Tasks/Settings
  links are now hidden until signed in; dark mode is now a toggle in
  Settings → Account instead of a one-tap dashboard-header button;
  popup/dashboard/settings all show a "Service unavailable" page instead
  of a broken one when Supabase is unreachable, and dashboard also shows
  "Sign in required" when opened directly while signed out. Not yet
  manually verified — see `TO_TEST.md` item 3.
- **ML-based detection strategies, experimental, opt-in** (2026-10-03,
  commits `b8be3a2`/`d482bd1`/`9acff60`/`d5d1f1b`): on-device Transformers.js
  classification (`extension/offscreen/`), two new strategies
  (`layered`/`full`) selectable in Settings → Detection, a benchmark
  harness (`npm run bench`) proving `layered` beats both alternatives.
  `legacy` (today's rules engine) remains the default. Migration
  `023_add_classification_strategy.sql` written but **not yet run
  against the live Supabase project** — no DB access from this
  environment to apply it.

## Known gaps / open items

- **Decide whether to switch the default detection strategy** from
  `legacy` to `layered` given the benchmark result above — the data
  points one way but nobody's flipped the switch yet. `layered`'s own
  remaining false positives (questions about an existing plan, habitual
  "every weekend" statements, non-English text) mirror guards `legacy`
  already has that the model call doesn't inherit — a likely-valuable,
  not-yet-built follow-up.
- **GLiNER span-extraction spike** (location/participant enhancement)
  deliberately deferred — both new strategies ship with the existing
  regex extractor unchanged for now.
- **Migration 023 not yet run** against the live Supabase project (see
  above) — `classificationStrategy` works locally but won't sync across
  devices until this is applied.
- Original `docs/superpowers/specs/2026-09-05-detection-false-negative-reduction-design.md`
  (5-option menu) is now superseded reference material, not an active
  plan.
- **2 pairs of duplicate test events** in the live `events` table
  (from retried saves during the RLS recursion bug) — left untouched
  pending an explicit decision (never-delete rule in effect).
- **Desktop app design** (Electron, UIA-based detection) — spec
  reviewed and flagged (contextIsolation/sandbox requirements, password
  field exclusion needs manual verification) but implementation not
  started.
- **Email deliverability** — spam-folder issue until a real domain is
  purchased and verified with a transactional email provider.
- **"Phase 0 reliability sweep (silent-failure pattern)"** — referenced
  as outstanding in `docs/chrome-web-store-listing.md` but no spec/plan
  anywhere defines its scope. Needs the user to define what it covers.
- Full change history and fix-by-fix detail: see `TODO.md`. Full manual
  test checklist, organized by status: see `TO_TEST.md`.

## Data safety

Supabase project `jxdykrgztffzddhzkkxs` — standing rule in effect:
never delete/drop/truncate; connector access is read/verify-only unless
explicitly authorized per action.
