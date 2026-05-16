# PlanWise

A Chrome extension that automatically detects plans in your messaging conversations and lets you save them to a calendar with one click.

## What it does

PlanWise monitors WhatsApp Web, Discord, Telegram, and Gmail for messages that look like plans — dinner at 7pm, a coffee catch-up, a trip next weekend. When it spots one, a badge appears on the extension icon. Open the popup, review the extracted details, edit if needed, then hit **Add** to save it.

## How detection works

Detection runs as a two-stage pipeline:

1. **Scoring** — the message is scored across five categories: temporal signals (`tomorrow`, `at 7pm`), action words (`dinner`, `gym`), social context (`we`, `together`), confirmation phrases (`sounds good`, `I'm in`), and negation. If the total score clears a threshold, the message is a candidate.

2. **Intent classification** — hard-block phrases (`can't make it`, `something came up`) immediately reject the candidate. Otherwise, creation phrases and cancellation phrases vote, and the majority decides. A candidate with no rejection evidence defaults to confirmed.

Once a plan is confirmed:
- The **title** is extracted from the activity keyword in the message (Dinner, Coffee, Movie, etc.)
- **Date and time** are parsed from natural language (`tomorrow`, `next Friday`, `at 8pm`)
- **People** are matched against your saved contacts first; uncased proper nouns are used as a fallback
- **Notes** are extracted in a second pass, scanning for reminder phrases like `bring`, `don't forget`, and `remember to`

## Supported platforms

| Platform | Outgoing messages | Incoming messages |
|---|---|---|
| WhatsApp Web | Yes | Yes |
| Discord | Yes | Yes |
| Telegram Web | Yes | Yes |
| Gmail | Yes | Yes |

## Installation

1. Clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `extension/` folder
5. Sign up or sign in via the popup — events are stored in Supabase

## Project structure

```
extension/
  background/       service worker (badge management)
  content/          DOM observer, text buffer, content script
  detection/        rules, scoring engine, event extractor
  popup/            popup UI (review and confirm plans)
  dashboard/        calendar view of confirmed plans
  tasks/            task list view
  settings/         contacts and trigger word configuration
  training/         feedback UI for improving detection
  utils/            storage, logger, Supabase client
  vendor/           bundled Supabase JS
```

## Tech stack

- Vanilla JS, Chrome Extensions Manifest V3
- [Supabase](https://supabase.com) for auth and event storage
- No build step — the extension folder loads directly into Chrome

## Settings

Open the **Settings** page from the popup footer to configure:

- **Contacts** — names (and nicknames) to recognise as participants
- **Trigger words** — custom keywords that add to the detection score
- **Sensitivity** — minimum score threshold (default: 2)
- **Notifications** — toggle badge notifications on/off
