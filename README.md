# PlanWise

A Chrome extension that automatically detects plans in your messaging conversations, saves them to a shared social calendar, and lets you coordinate with groups — all without leaving your chat.

## What it does

PlanWise monitors WhatsApp Web, Discord, Telegram, and Gmail for messages that look like plans — dinner at 7pm, a coffee catch-up, a trip next weekend. When it spots one, a badge appears on the extension icon. Open the popup, review the extracted details, edit if needed, then hit **Add** to save it to your calendar.

From the calendar dashboard you can share events with groups, RSVP, comment in real time, and see other members' shared events alongside your own — all colour-coded by group.

## How detection works

Detection runs as a two-stage pipeline:

1. **Scoring** — the message is scored across five categories: temporal signals (`tomorrow`, `at 7pm`), action words (`dinner`, `gym`), social context (`we`, `together`), confirmation phrases (`sounds good`, `I'm in`), and negation. If the total score clears a threshold, the message is a candidate.

2. **Intent classification** — hard-block phrases (`can't make it`, `something came up`) immediately reject the candidate. Otherwise, creation phrases and cancellation phrases vote, and the majority decides. A candidate with no rejection evidence defaults to confirmed.

Once a plan is confirmed:
- The **title** is extracted from the activity keyword in the message (Dinner, Coffee, Movie, etc.)
- **Date and time** are parsed from natural language (`tomorrow`, `next Friday`, `at 8pm`)
- **People** are matched against your saved contacts first; uncased proper nouns are used as a fallback
- **Notes** are extracted in a second pass, scanning for reminder phrases like `bring`, `don't forget`, and `remember to`

## Features

- **Auto-detection** — scoring engine reads conversation text for dates, times, people, activities, and intent signals across WhatsApp, Discord, Telegram, and Gmail
- **Calendar dashboard** — month and week views; task deadlines appear as a separate "Deadlines" category (orange)
- **Groups & sharing** — create groups, invite members by email, share events to groups; members see shared events on their own calendar with colour-coded pills
- **RSVP & comments** — Going / Maybe / Can't with live comment threads (Supabase Realtime)
- **Kanban task board** — Todo / In Progress / Done columns with priority, deadline, and notes; deadlines sync to the calendar automatically
- **Notification feed** — in-app bell with real-time push notifications when events are shared to your groups
- **Training mode** — label detected snippets to improve the engine over time; export training data as JSON
- **Configurable** — sensitivity slider, custom trigger words, activity words, meeting words, contacts, and plan items — all saved to Supabase per user

## Supported platforms

| Platform | Outgoing messages | Incoming messages |
|---|---|---|
| WhatsApp Web | Yes | Yes |
| Discord | Yes | Yes |
| Telegram Web | Yes | Yes |
| Gmail | Yes | Yes |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome MV3 (vanilla JS, no bundler) |
| Styling | Tailwind Play CDN (vendored, CSP-compliant) |
| Backend | Supabase (Postgres + RLS + Realtime) |
| Auth | Supabase Auth (email/password) |
| Animation | Anime.js |
| Fonts | Geist + JetBrains Mono |
| Tests | Jest (unit) + Playwright (E2E) |

## Installation

### 1. Set up Supabase

Create a project at [supabase.com](https://supabase.com). In the SQL Editor, run each file in `supabase/migrations/` in numerical order (001 → 007).

### 2. Add your credentials

Open `extension/utils/supabase-client.js` and replace the placeholders:

```js
const SUPABASE_URL  = 'https://your-project.supabase.co';
const SUPABASE_ANON = 'your-anon-key';
```

### 3. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder

### 4. Sign up

Click the PlanWise icon in the toolbar, create an account, and open the dashboard.

## Project structure

```
extension/
  background/       service worker (badge, notifications)
  content/          DOM observer, text buffer, content script
  detection/        rules, scoring engine, event extractor
  popup/            extension popup (auth + pending event queue)
  dashboard/        full-page calendar app
  tasks/            kanban board
  settings/         detection, contacts, groups, account
  training/         training data labeller + JSON export
  utils/            shared storage helpers + Supabase client
  vendor/           bundled dependencies (supabase.js, tailwind, anime)

supabase/
  migrations/       SQL files — run in order in the Supabase SQL Editor

tests/
  detection.test.js       Jest unit tests for detection engine + extractor
  extension-e2e.spec.js   Playwright E2E tests for the full extension flow
```

## Running tests

```bash
npm install

# Unit tests
npm test

# E2E tests (requires extension loaded in Chrome)
npx playwright test
```

## Database migrations

Run in order in the Supabase SQL Editor:

| File | Purpose |
|------|---------|
| `001_social_tables.sql` | Core tables: events, groups, group_members, shared_events, rsvps, comments, notifications |
| `002_profiles.sql` | User profiles |
| `003_fix_rls_recursion.sql` | Non-recursive RLS via `get_my_group_ids()` security definer function |
| `004_fix_groups_create.sql` | Allow group creator to read their own group immediately after insert |
| `005_fix_rls_comprehensive.sql` | Rewrites `get_my_group_ids()` in plpgsql to prevent optimizer inlining |
| `006_fix_rls_all_policies.sql` | Fixes INSERT/DELETE policies on group_members to remove self-referential subqueries |
| `007_shared_events_readable.sql` | Allows reading events shared to your groups by other members |

## Settings

Open the **Settings** page from the dashboard sidebar to configure:

- **Detection** — sensitivity threshold, custom trigger words, activity words, meeting words, and plan items
- **Contacts** — names (and nicknames) to recognise as participants
- **Groups** — create and manage social groups; invite members by email
- **Notifications** — toggle badge notifications on/off
- **Account** — sign out
