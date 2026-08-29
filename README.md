# PlanWise

A Chrome extension that automatically detects plans in the messages **you write**, saves them to a shared social calendar, and lets you coordinate with groups — all without leaving your chat.

## What it does

PlanWise reads the message you're composing in WhatsApp Web, Telegram Web, or Gmail — as you type it, before you hit send — and checks whether it looks like a plan: dinner at 7pm, a coffee catch-up, a trip next weekend. It never reads messages from other people; it only ever sees text in your own compose box, the same way a spell-checker would. When it spots a plan, a badge appears on the extension icon. Open the popup, review the extracted details, edit if needed, then hit **Add** to save it to your calendar.

From the calendar dashboard you can share events with groups, RSVP, comment in real time, and see other members' shared events alongside your own — all colour-coded by group.

## How detection works

Detection runs as a two-stage pipeline:

1. **Scoring** — the message is scored across five categories: temporal signals (`tomorrow`, `at 7pm`), action words (`dinner`, `gym`), social context (`we`, `together`), confirmation phrases (`sounds good`, `I'm in`), and negation. If the total score clears a threshold, the message is a candidate.

2. **Intent classification** — hard-block phrases (`can't make it`, `something came up`) immediately reject the candidate. Otherwise, creation phrases and cancellation phrases vote, and the majority decides. If neither votes, a structural fallback checks for action + temporal + (location or a named person) and confirms on that combination alone — a candidate with genuinely no signal either way is dropped as ambiguous rather than defaulting to confirmed.

Once a plan is confirmed:
- The **title** comes from a custom Trigger/Activity Word if one matches (these take priority over the built-in list), otherwise from the built-in activity keyword in the message (Dinner, Coffee, Movie, etc.)
- **Date and time** are parsed from natural language (`tomorrow`, `next Friday`, `at 8pm`)
- **Location** comes from a custom Place Word if one matches (also takes priority over the built-in list), otherwise a built-in location keyword (gym, office, pier, etc.)
- **People** are matched against your saved Custom Names first, then a cue-word heuristic (`with Alex`, `meet Sarah and James`) that works even with casually-typed lowercase names
- **Notes** are extracted in a second pass, scanning for reminder phrases like `bring`, `don't forget`, and `remember to`

## Features

- **Auto-detection** — scoring engine reads what you type for dates, times, people, activities, and intent signals across WhatsApp Web, Telegram Web, and Gmail. It only ever reads your own compose box — never other people's messages.
- **Calendar dashboard** — month and week views; task deadlines appear as a separate "Deadlines" category (orange)
- **Groups & sharing** — create groups, invite members by username, share events to groups; members see shared events on their own calendar with colour-coded pills
- **RSVP & comments** — Going / Maybe / Can't with live comment threads (Supabase Realtime)
- **Kanban task board** — Todo / In Progress / Done columns with priority, deadline, and notes; deadlines sync to the calendar automatically
- **Notification feed** — in-app bell with real-time push notifications when events are shared to your groups
- **Configurable** — sensitivity slider, custom trigger words, activity words, place words, custom names, and plan items — all saved to Supabase per user

## Supported platforms

PlanWise only reads text in your own compose box on each platform — never messages sent by other people.

| Platform | Reads what you type |
|---|---|
| WhatsApp Web | Yes |
| Telegram Web | Yes |
| Gmail | Yes |

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

Click the PlanWise icon in the toolbar, then **Sign up** — this opens a dedicated signup page where you choose a username, email, and password. Afterward, sign in from the popup using either your email or your username.

## Project structure

```
extension/
  background/       service worker (badge, notifications)
  content/          DOM observer, text buffer, content script
  detection/        rules, scoring engine, event extractor
  popup/            extension popup (sign in + pending event queue)
  signup/           dedicated signup page (username + email + password)
  dashboard/        full-page calendar app
  tasks/            kanban board
  settings/         detection, groups, notifications, account
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

- **Detection** — sensitivity threshold, custom trigger words, activity words, place words, custom names, and plan items
- **Groups** — create and manage social groups; invite members by username
- **Notifications** — toggle badge notifications on/off
- **Account** — sign out
