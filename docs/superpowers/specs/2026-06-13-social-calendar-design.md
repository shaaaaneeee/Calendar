# PlanWise — Social Calendar & UI Redesign
**Date:** 2026-06-13  
**Status:** Approved for implementation planning

---

## Overview

Two parallel workstreams that ship together as a single release:

1. **UI Redesign** — apply the neo-brutalist design system (from AI design tool outputs) uniformly across all screens, replacing the three inconsistent design languages that exist today.
2. **Social Calendar** — add groups, shared events, RSVP, comments, and notifications, turning PlanWise from a personal calendar into a shared social one.

PlanWise's unique edge over TimeTree: plans are auto-detected from messaging apps. The social layer amplifies this — detection becomes a shared act, not a solo one.

---

## Part 1 — UI Redesign

### Design system

All screens adopt a single neo-brutalist token set implemented via Tailwind CSS (replacing the current per-page custom CSS):

| Token | Value |
|---|---|
| Background | `#f9f9f9` |
| Surface | `#f9f9f9` |
| Surface container low | `#f4f3f3` |
| Surface container | `#eeeeee` |
| Surface container highest | `#e2e2e2` |
| Primary | `#000000` |
| On-primary | `#ffffff` |
| Secondary text | `#5d5f5f` |
| Border / on-surface | `#1a1c1c` |
| Error | `#ba1a1a` |
| Status active (cyan) | `#00D1FF` |
| Status critical (orange) | `#FF4D00` |
| Status success (green) | `#7EFF00` |
| Border radius | `0px` everywhere |
| Neo-shadow | `4px 4px 0px 0px rgba(0,0,0,1)` |

**Typography:**
- `Geist` — all body, headings, names, UI text
- `JetBrains Mono` — all metadata: timestamps, counts, scores, badges, labels, keyboard shortcuts

**Rules:**
- No border radius (except `full` for avatars only)
- No box shadows — `neo-shadow` only on interactive cards and buttons
- No gradients
- Hover: `bg-surface-container-low`; active: `translate(2px, 2px)` with reduced neo-shadow
- Group colours are the only accent colour — everything else is monochrome

### Screen-by-screen changes

**Reference for implementation:** Claude Design output for Settings. Blend of Claude Design + Google Stitch for Dashboard and Tasks.

#### Dashboard (Calendar)
- Wide left sidebar: PlanWise wordmark (display-lg, uppercase, tracking-tighter), nav items (icon + mono-label uppercase), Groups filter section below nav
- Top bar: month/year + view toggle left, Today button + notification bell + user initials avatar right
- Calendar grid: `1px solid #1a1c1c` borders, event chips with coloured left border (4px) for group events, black background chip for today's events
- Right panel: UPCOMING list with mono timestamps, day panel replaces it on day click
- Floating + button bottom-right

#### Tasks
- Same sidebar and top bar as Dashboard
- Kanban: TODO / IN PROGRESS / DONE columns, each with mono-label header + black count badge
- Cards: neo-shadow, priority dot (critical/active/success colour), task ID in mono, overdue badge in error-container
- New task: slide-in drawer from right (not modal), priority as three-button toggle, due date, notes

#### Settings
- Same sidebar and top bar as Dashboard (replaces current isolated sidebar-logo layout)
- Secondary nav: horizontal tab strip — Detection · Overview · Contacts · Groups · Notifications · Account
- Detection: sensitivity slider + 5 tag-input groups (Trigger Words, Custom Names, Activity Words, Meeting Words, Items)
- Groups: new section (see Part 2)
- All other sections: same content, new visual treatment

#### Training
- Same sidebar and top bar as Dashboard (replaces current isolated sidebar-logo layout)
- Filter bar + search input in top area
- Entry list in main, stats strip in right panel

#### Popup
- Neo-brutalist aesthetic matching the rest of the product
- Auth state: email/password, Sign In / Sign Up as two distinct buttons
- Event card: source text in a quoted block, editable fields, Add (black) / Dismiss (ghost) buttons
- Empty state: intentional typography treatment, not a plain paragraph

---

## Part 2 — Social Calendar

### Core decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Group model | Hybrid: auto-pairs (1-on-1) + manual named groups |
| Calendar view | Unified with toggleable group layer filters (Google Maps style) |
| Sharing flow | User shares from their own calendar to a chosen group — not automatic |
| Member interaction | RSVP (Going / Maybe / Can't) + comments on shared events |
| Notifications | System (OS) notifications for new shared events + in-app feed for RSVPs and comments |

### Data model (Supabase)

#### New tables

**`profiles`**
```sql
id          uuid references auth.users primary key
display_name text not null
created_at  timestamptz default now()
```
Auto-created on first sign-in via a Postgres trigger on `auth.users`. Used for display names and initials throughout the UI.

**`groups`**
```sql
id          uuid primary key default gen_random_uuid()
name        text not null
type        text not null check (type in ('pair', 'group'))
colour      text not null  -- hex string, one of 6 preset options
created_by  uuid references auth.users not null
created_at  timestamptz default now()
```

**`group_members`**
```sql
group_id    uuid references groups not null
user_id     uuid references auth.users not null
role        text not null check (role in ('owner', 'member'))
joined_at   timestamptz default now()
primary key (group_id, user_id)
```

**`shared_events`**
```sql
id          uuid primary key default gen_random_uuid()
event_id    uuid references events not null
group_id    uuid references groups not null
shared_by   uuid references auth.users not null
shared_at   timestamptz default now()
unique (event_id, group_id)
```

**`rsvps`**
```sql
event_id    uuid references events not null
user_id     uuid references auth.users not null
status      text not null check (status in ('going', 'maybe', 'cant'))
updated_at  timestamptz default now()
primary key (event_id, user_id)
```

**`comments`**
```sql
id          uuid primary key default gen_random_uuid()
event_id    uuid references events not null
user_id     uuid references auth.users not null
body        text not null
created_at  timestamptz default now()
```

**`notifications`**
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users not null
type        text not null check (type in ('event_shared', 'rsvp_updated', 'comment_added'))
payload     jsonb not null  -- { event_id, actor_id, actor_name, preview, group_id }
read        boolean default false
created_at  timestamptz default now()
```

Notifications are written by database triggers on `shared_events`, `rsvps`, and `comments` inserts — never by the client.

#### Row-level security
- `profiles`: readable by all authenticated users, writable only by owner
- `groups`: readable by members only (via `group_members`), writable by owner
- `group_members`: readable by members of that group, insertable by group owner
- `shared_events`: readable by members of the group
- `rsvps`: readable by members of the event's group, writable by the RSVPing user
- `comments`: readable by members of the event's group, insertable by members
- `notifications`: readable and writable only by the recipient

#### Realtime subscriptions
- `notifications` — drives the live bell dot and feed
- `comments` — drives live comment thread updates when a shared event panel is open

Everything else (RSVP counts, group membership) is fetched on panel open, not subscribed.

### Feature flows

#### Groups

**Auto-pair creation:**  
When a detected plan is confirmed and a `custom name` from settings matches a contact who has a PlanWise account (looked up by email in `profiles`), a `pair` group is automatically created between the two users if one doesn't already exist.

**Manual group creation:**  
Settings → Groups → "New Group" button. Form: group name + colour picker (6 options) + invite by email. Invitees receive an email (Supabase email trigger) with an accept link. On accept they are added to `group_members` with role `member`.

**Group display in sidebar:**  
Groups filter section below main nav. Each row: coloured square dot + group name + member count. Checkbox to toggle visibility. "All" master toggle at top. Unchecked groups: their events hidden on the calendar grid (CSS opacity toggle, no re-fetch needed).

#### Sharing an event

From the day panel or upcoming list, every event has a "Share" button (icon only on compact view, labelled on expanded). Clicking opens an inline section within the panel — not a modal:

- List of the user's groups with checkbox per group
- Groups the event is already shared to are pre-checked and labelled "Shared"
- Confirm button: writes to `shared_events`, triggers notification DB trigger for all other group members
- On confirm: event chip on the calendar gains a coloured left border matching the group colour

An event can be shared to multiple groups.

#### Shared event panel

When a member (not the creator) views a shared event, the day panel shows:

**RSVP bar:**  
Three buttons — Going · Maybe · Can't make it. Current user's selection is filled black. Below: "3 Going · 1 Maybe · 0 Can't" in mono-data. Clicking upserts to `rsvps`, triggers notification for event owner.

**Members list:**  
Compact rows — monochrome circle avatar with initials (mono-data) · display name · RSVP status label. Fetched from `group_members` + `rsvps` joined.

**Comments:**  
Chronological thread. Each entry: avatar + name + mono timestamp. Body text below. Input field + send button at bottom. Sends insert to `comments`, triggers notification for all other members who have commented or RSVPed. Empty state: "No comments yet — be the first."  
Live via Supabase Realtime subscription while panel is open.

#### Notification system

**System (OS) notifications:**  
Triggered for `event_shared` type only. Service worker (`background/service-worker.js`) subscribes to the user's `notifications` row via Supabase Realtime. On new `event_shared` notification, fires `chrome.notifications.create` with event title and group name. Requires `notifications` permission added to `manifest.json`.

**In-app notification feed:**  
Bell icon in top bar. Unread count shown as a small black badge. Clicking opens a slide-in panel from the right (same drawer pattern as Tasks). Feed items:
- `event_shared`: "[Name] shared [Event] to [Group]"
- `rsvp_updated`: "[Name] is Going to [Event]"
- `comment_added`: "[Name] commented on [Event]: "[first 60 chars]""

Each item: coloured group dot · description · mono timestamp · unread dot (filled if unread). Clicking marks as read (updates `notifications.read = true`) and navigates to the event. "Mark all read" link in feed header.

---

## Implementation phasing

Given scope, implementation follows four sequential phases. Each phase is independently shippable.

### Phase A — UI Redesign
Migrate all screens to the unified neo-brutalist Tailwind design system. No new features — purely visual. Includes: Dashboard, Tasks, Settings, Training, Popup.

### Phase B — Groups foundation
Supabase migrations (all new tables + RLS + triggers). Groups UI in Settings. Sidebar group filter panel in Dashboard. Supabase client methods for groups CRUD. No sharing yet — just the plumbing.

### Phase C — Shared events + RSVP + Comments  
Share button on event panel. Shared event visual treatment on calendar (coloured borders). RSVP bar. Comments thread with Realtime. Supabase client methods for shared_events, rsvps, comments.

### Phase D — Notifications
Database triggers for notification writes. Service worker Realtime subscription for OS notifications. In-app notification feed in dashboard. Mark as read.

---

## Out of scope (explicitly excluded)

- Mobile app — this remains a Chrome extension
- Dark mode — monochrome system doesn't need it
- Event editing by non-owners — shared events are read-only for members (RSVP + comments only)
- File attachments on events or comments
- Group video/chat features
- Public calendar sharing (link-based, no auth)
