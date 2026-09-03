# PlanWise — Shared Data Store & Live Sync (Phase 1 of 2)

**Date:** 2026-09-04
**Status:** Approved for implementation planning

---

## Overview

Dashboard and Settings currently refetch everything from Supabase, from
scratch, on every single page load — including navigating away and back
via the left sidebar, which is a full page reload in this multi-page
extension (see "Known constraint" below). There is no local cache and no
live-update mechanism: a change made anywhere only shows up the next time
a page happens to reload itself.

This causes two distinct, reported problems:

1. **Perceived slowness on every open/switch.** Settings' detection
   sensitivity and custom word lists visibly take a moment to appear, even
   though `settings.js` already has the data locally — it just doesn't use
   it to paint first (see Settings section below).
2. **No live updates.** A change (an event edited, a word added, a group
   membership change) is invisible on any other open page or device until
   that page is manually reloaded. The user has been explicit this needs
   to exist, not just "feel faster."

**This is Phase 1 of 2.** It builds a shared caching + live-sync data layer
across the extension's three existing separate pages (Dashboard, Settings;
Tasks is excluded — see Out of Scope). Phase 2, a **separate future spec**,
merges Dashboard/Tasks/Settings into a single-page app on top of this same
data layer, once it exists and is proven. The two were deliberately not
combined into one project: the data layer is the higher-value, lower-risk
piece, and bundling it with a full page-structure rewrite would make one
large, harder-to-review, harder-to-debug change instead of two focused
ones.

**Known constraint carried over from the current architecture:** Dashboard
and Settings are separate HTML documents. Navigating between them (via the
left sidebar) is a full page navigation — the entire JS context is torn
down and a new one starts. Nothing held only in memory survives that. This
spec's cache therefore lives in `chrome.storage.local`, the only thing
that persists across that boundary, not in an in-memory JS variable. Phase
2 (the SPA merge) is what removes the page-navigation boundary itself;
this spec makes each individual page-load fast and live-updating within
that constraint.

---

## Architecture

A new file, `extension/utils/data-store.js`, loaded via `<script>` after
`supabase-client.js` in `dashboard.html` and `settings.html` only (not
`popup.html`, `tasks.html`, or `signup.html` — see Out of Scope for why).

It sits **on top of** the existing `supabase-client.js`, not in place of
it — internally it still calls `Events.getAll()`, `Groups.listGroups()`,
etc. `supabase-client.js` itself is unchanged except for one addition (a
`settings` Realtime subscription helper, matching the existing
`subscribeComments`/`subscribeNotifications` pattern, which doesn't exist
yet).

Exposes `window.DataStore` with one object per domain: `events`, `groups`,
`notifications`, `settings`. Each domain object has the same shape:

```js
DataStore.events.ready()      // Promise<Array> - resolves from chrome.storage.local
                               // cache almost instantly (no network wait). Empty
                               // array on a genuine first-ever run.
DataStore.events.subscribe(cb) // cb(freshData) fires whenever the cached data
                               // changes - from the background network refresh
                               // landing, or a live Realtime push. Returns an
                               // unsubscribe function.
DataStore.events.refresh()     // Explicit re-fetch from Supabase. Called
                               // automatically once per ready(); exposed in case
                               // a page ever wants to force one (e.g. a manual
                               // pull-to-refresh, not built in this phase).
```

`settings` follows the same interface shape for consistency, but its
internal implementation is different — see the Settings section below.

---

## Data flow

Per page load, per domain the page needs:

1. Page calls `await DataStore.X.ready()` and renders immediately with
   whatever comes back — the last cached copy, or an empty state on a true
   first-ever run. This step never waits on the network.
2. The store has already kicked off a background `refresh()` in parallel.
   When it resolves, if the data actually changed, the store updates the
   `chrome.storage.local` cache and calls every subscriber registered via
   `subscribe()`. The page's subscriber callback re-renders.
3. The store opens a Realtime subscription for that domain (subscribing
   again on a repeat `ready()` call is a no-op if already subscribed) and
   keeps it live for as long as the page stays open. Any change — from
   this device, another browser tab, or (later) the desktop app — updates
   the cache and notifies subscribers the same way as step 2.
4. When the page unloads, its Realtime channels close (browser tears down
   the page's WebSocket connections automatically). The cache in
   `chrome.storage.local` persists for the next page load to read
   instantly in step 1.

This deliberately doesn't try to distinguish "cold start" from "switching
back to a page I just had open" — every load does the same three steps.
Cache-then-render is always safe (worst case, briefly shows the last known
state before reconciling), so there's no need for a separate cold-start
code path.

---

## Cache storage

One new `chrome.storage.local` key, `planwise_data_cache`, shaped as:

```js
{
  events:        { data: [...],  updatedAt: "2026-09-04T12:00:00Z" },
  groups:        { data: [...],  updatedAt: "..." },
  notifications: { data: [...],  updatedAt: "..." },
}
```

`settings` is deliberately **not** duplicated into this structure — see
below. `updatedAt` is informational only in this phase (useful for
debugging, not used for any expiry/staleness logic — Realtime is what
keeps it fresh, not a TTL).

This is a new key, separate from the existing `confirmedEvents` (the
logged-out fallback), `planwiseTasks` (the Tasks board, untouched by this
spec), and `planwise_session` (auth) keys already in use — no collision,
no migration of existing data needed.

---

## Settings: a smaller, different fix

`events`/`groups`/`notifications` have no local cache today — always a
full network fetch. `settings` is different: `chrome.storage.local` (via
`PlanWiseStorage`/`LocalStorage.getSettings()`) is already the primary
local copy — the detection content scripts read settings from there
directly, live. The actual bug in `settings.js`'s `loadSettings()` is
ordering: it awaits the Supabase merge *before* `renderAll()` is called,
even though the local data was ready first.

The fix here is narrower than the other three domains:

1. Call `renderAll()` right after the local read, before the remote fetch.
2. Do the remote fetch + merge in the background (already exists as code,
   just needs to stop blocking the render), calling `renderAll()` again
   only if the merge actually changed something.
3. Add a `settings` Realtime subscription (new — extends the existing
   `subscribeComments`/`subscribeNotifications` pattern in
   `supabase-client.js`) so a settings change made elsewhere (another
   device, the future desktop app) reflects live, the same as the other
   three domains.

`DataStore.settings` wraps this behavior behind the same
`ready()`/`subscribe()`/`refresh()` interface as the other domains for
consistency, even though its internals lean on the existing local-storage
mechanism rather than introducing a new cache key.

---

## Realtime subscriptions

Extends the existing `postgres_changes` pattern already used for
`comments` and `notifications` in `supabase-client.js`.

**Real constraint worth being explicit about:** Realtime's `filter` option
only supports simple column equality (e.g. `user_id=eq.<uuid>`) — it can't
express the OR/join logic the `events` RLS policies use for events shared
via group membership. A single Realtime filter can't cleanly say "my own
events OR events shared to a group I'm in."

Pragmatic resolution, not a fully granular one:

- Subscribe to `events` filtered on `user_id=eq.<my-id>` — catches edits
  to events you own precisely.
- Subscribe to `shared_events` (any INSERT/DELETE, unfiltered by user,
  since RLS on the underlying `SELECT` already scopes what the payload can
  contain) — catches a group-mate sharing or unsharing an event with you.
  On any event here, call `DataStore.events.refresh()` (a full `getAll()`
  re-fetch) rather than trying to patch the cache from the partial
  Realtime payload. This is deliberately not micro-optimized: the query
  costs 0.7ms server-side (measured against the live database), so a full
  reconciliation is cheap and correctness is simpler than partial patching.
- `groups`: subscribe to `groups` and `group_members`, both filtered where
  practical (`group_members` on membership rows involving you), same
  full-`refresh()`-on-change approach.
- `notifications`: reuse the existing `subscribeNotifications` helper —
  already filtered `user_id=eq.<my-id>`, already proven.
- `settings`: new subscription, filtered `user_id=eq.<my-id>`.

---

## Sign-out / account-switch correctness

`DataStore` exposes `clearAll()`, called from `SupabaseAuth.signOut()`
(and from the session-invalid cleanup path inside `_restoreSession()`'s
error branch). It clears the `planwise_data_cache` key and unsubscribes
every active Realtime channel.

This matters on a shared machine: without it, signing out and back in as
a different account could briefly flash the *previous* account's cached
events/groups/notifications before the fresh fetch overwrites them —
Settings is unaffected here since its "cache" is the per-account
`chrome.storage.local` settings object already scoped correctly today.

---

## Error handling

- `chrome.storage.local` read failure on `ready()`: falls back to an
  empty array/object and proceeds to the network fetch — identical to
  today's behavior, no new failure mode introduced.
- Background `refresh()` failure (offline, Supabase down): cached data
  stays on screen, a `console.warn` is logged (matching the existing
  `[PlanWise] Failed to load events, falling back to local cache` style),
  no user-facing error unless there's neither a cache nor network — same
  as today.
- Realtime disconnect: not specially handled in this phase — the
  Supabase JS client has its own reconnect logic, and even if a
  reconnect is missed, the next full page load's `refresh()` reconciles
  everything. Not treating this as a gap worth solving now; revisit only
  if it turns out to matter in practice.

---

## Integration changes to existing files

- **`extension/utils/data-store.js`** (new) — the module described above.
- **`extension/dashboard/dashboard.js`** — `loadEvents()`,
  `loadGroupsFilter()`, and `initNotifFeed()` change from calling
  `Events.getAll()` / `Groups.listGroups()` / notification RPCs directly
  to reading `DataStore.X.ready()` + `subscribe()`. The Supabase calls
  themselves move into `data-store.js`, not removed.
- **`extension/settings/settings.js`** — `loadSettings()` reordered per
  the Settings section above; a new Realtime subscription added.
- **`extension/utils/supabase-client.js`** — one addition: a
  `subscribeSettings(userId, onChange)` helper, matching
  `subscribeComments`/`subscribeNotifications`. No existing exports
  change shape.
- **`extension/dashboard/dashboard.html`**,
  **`extension/settings/settings.html`** — add
  `<script src="../utils/data-store.js">`, loaded after
  `supabase-client.js`.

---

## Testing

No Jest coverage change — this doesn't touch the detection engine, which
is the only part of the codebase with unit test coverage by design.

Manual verification (mirrors the existing project pattern of no
Jest coverage for DOM/network/UI-heavy code, verified manually instead —
same approach the desktop app spec uses):

- Throttle network in DevTools, confirm the dashboard/settings render
  immediately from cache before the throttled fetch completes.
- Open the dashboard in two windows signed into the same account; edit an
  event / add a settings word in one; confirm it appears in the other
  without a manual reload.
- Sign out, sign in as a different test account on the same browser
  profile; confirm no flash of the previous account's cached data.
- Turn off network entirely after a page has cached data once; reload;
  confirm cached data still renders and a background-refresh-failed
  warning appears in console rather than a broken/empty page.

---

## Out of scope

- **Tasks board.** 100% local (`chrome.storage.local`, key
  `planwiseTasks`), no Supabase call for the board itself — not part of
  the reported slowness, not touched.
- **`popup.html`, `signup.html`.** Neither has the repeat-load pattern
  this spec addresses (popup is a lightweight one-shot surface; signup
  happens before there's an account to cache anything for).
- **Phase 2: the single-page-app merge** of Dashboard/Tasks/Settings.
  Separate future spec, builds on this data layer once proven.
- **Desktop app sync.** The desktop app spec
  (`2026-09-03-desktop-app-design.md`) already establishes it shares the
  same Supabase backend unmodified — this data layer's Realtime
  subscriptions will incidentally make the extension reflect desktop-app
  changes live too, once that ships, but no desktop-specific work is in
  scope here.
- **Cache TTL/expiry logic.** Not needed — Realtime keeps it fresh while
  a page is open, and every page load does a full background refresh
  regardless of cache age.

---

## Self-review

**Placeholder scan:** none — every new file/function is named with its
exact interface; the one genuinely open implementation detail (whether
`groups`/`group_members` Realtime filtering is worth the complexity vs.
just refreshing on any change) is named as a deliberate simplification,
not left vague.

**Internal consistency:** the "every domain has the same
`ready()`/`subscribe()`/`refresh()` shape" decision (Architecture) is
carried through even where the internals differ (Settings section
explicitly reuses the existing local-storage mechanism rather than
introducing a redundant cache key, but still exposes the same interface)
— so a page consuming `DataStore` never needs to know which domain works
which way internally.

**Scope check:** contained to `data-store.js` (new) plus targeted changes
to `dashboard.js`, `settings.js`, `supabase-client.js`, and two `<script>`
tags. No schema/RLS changes. No changes to Tasks, popup, or signup. Single
spec, single implementation plan.

**Ambiguity check:** "live update without a manual refresh" (the user's
core requirement) is made concrete as "a Realtime subscription stays open
for as long as the page is open, and any change triggers a
subscriber-notified re-render" — not "polls on an interval," which was
never proposed and is explicitly not what's being built.
