# PlanWise — Project Status

_Last updated: 2026-09-30 (reflects repo state as of commit `a5effbd`, pushed to `origin/main`)_

## What this is

PlanWise is a Chrome MV3 extension (vanilla JS, no bundler) that detects
plan-making language typed into WhatsApp Web, Telegram Web, and Gmail
compose boxes, and offers to add the detected plan to a calendar backed
by Supabase (Postgres + RLS + Realtime). It also ships a full dashboard
(month/week calendar, groups, sharing, comments, notifications, tasks)
and a marketing landing page.

## Repo state

- Branch `main`, clean working tree, fully pushed to `origin/main`
  (was 24 commits ahead; now in sync).
- Tests: 185/185 passing (`npm test`, Jest).

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

## Known gaps / open items

- **Detection false-negative rate is high (~87.5% on a targeted test
  batch)** — root-caused and written up as a design spec with five
  candidate solutions (rule expansion, on-device classifier, cloud AI
  fallback with cost/privacy controls, bring-your-own-key, personal
  feedback loop). See
  `docs/superpowers/specs/2026-09-05-detection-false-negative-reduction-design.md`.
  **Not yet implemented — no direction chosen yet.**
- **2 pairs of duplicate test events** in the live `events` table
  (from retried saves during the RLS recursion bug) — left untouched
  pending an explicit decision (never-delete rule in effect).
- **Desktop app design** (Electron, UIA-based detection) — spec
  reviewed and flagged (contextIsolation/sandbox requirements, password
  field exclusion needs manual verification) but implementation not
  started.
- **Email deliverability** — spam-folder issue until a real domain is
  purchased and verified with a transactional email provider.
- Full change history and fix-by-fix detail: see `TODO.md`.

## Data safety

Supabase project `jxdykrgztffzddhzkkxs` — standing rule in effect:
never delete/drop/truncate; connector access is read/verify-only unless
explicitly authorized per action.
