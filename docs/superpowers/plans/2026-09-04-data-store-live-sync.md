# Shared Data Store & Live Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dashboard's and Settings' always-refetch-from-Supabase pattern with a shared cache-then-render-then-live-Realtime data layer, so both pages render instantly from a local cache and update live when data changes, without a manual reload.

**Architecture:** A new `extension/utils/data-store.js` sits on top of the existing `supabase-client.js`. It exposes one object per domain (`events`, `groups`, `notifications`, `settings`), each with the same `ready()`/`subscribe()`/`refresh()` interface, backed by a `chrome.storage.local` cache and a live Supabase Realtime subscription. `dashboard.js` and `settings.js` are rewired to consume this instead of calling `supabase-client.js` directly for their initial loads.

**Tech Stack:** Vanilla JS (no bundler, no framework), Chrome MV3 extension pages, `chrome.storage.local`, Supabase JS SDK (`@supabase/supabase-js`, vendored at `extension/vendor/supabase.js`) including its Realtime (`postgres_changes`) subscriptions, Jest for the one genuinely pure/unit-testable piece.

**Spec:** `docs/superpowers/specs/2026-09-04-data-store-live-sync-design.md`

## Global Constraints

- Every domain object exposes exactly the same three-function interface: `ready()` (returns a Promise resolving to cached/fresh data, never blocks on network), `subscribe(callback)` (returns an unsubscribe function), `refresh()` (forces a network re-fetch).
- `data-store.js` calls into `supabase-client.js`'s existing exports (`Events`, `Groups`, `Social`, `Settings` under `window.SupabaseClient`) — it never talks to Supabase directly, and no existing export of `supabase-client.js` changes shape.
- Loaded only on `dashboard.html` and `settings.html`, after `../vendor/supabase.js`, `../utils/storage.js`, and `../utils/supabase-client.js`, before the page's own script (`dashboard.js`/`settings.js`).
- Realtime subscriptions for `events`/`shared_events`/`groups`/`group_members` trigger a full `refresh()` on any change rather than patching the cache from the partial payload (see spec's Realtime section for why).
- `DataStore.clearAll()` must be called from `SupabaseAuth.signOut()` and from `_restoreSession()`'s session-invalid cleanup branch in `supabase-client.js`.
- No Jest coverage is expected for chrome-API-dependent code (matches the existing project pattern — only the detection engine has unit tests). The one exception is `createNotifier()`, which is pure and gets a real Jest test in Task 1.

---

### Task 1: Pure notifier utility, unit tested

**Files:**
- Create: `extension/utils/data-store.js`
- Test: `tests/data-store-notifier.test.js`

**Interfaces:**
- Produces: `createNotifier()` → `{ subscribe(cb): unsubscribeFn, notify(data): void, listenerCount(): number }`. Later tasks use this internally inside `createDomainStore` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `tests/data-store-notifier.test.js`:

```js
require("../extension/utils/data-store.js");

describe("createNotifier", () => {
  test("notifies every subscribed callback with the given data", () => {
    const notifier = window.DataStore._internal.createNotifier();
    const received = [];
    notifier.subscribe((data) => received.push(data));
    notifier.subscribe((data) => received.push(data));

    notifier.notify("hello");

    expect(received).toEqual(["hello", "hello"]);
  });

  test("unsubscribe stops that callback from receiving future notifications", () => {
    const notifier = window.DataStore._internal.createNotifier();
    const received = [];
    const unsubscribe = notifier.subscribe((data) => received.push(data));

    notifier.notify("first");
    unsubscribe();
    notifier.notify("second");

    expect(received).toEqual(["first"]);
  });

  test("listenerCount reflects current subscriber count", () => {
    const notifier = window.DataStore._internal.createNotifier();
    expect(notifier.listenerCount()).toBe(0);

    const unsubscribe = notifier.subscribe(() => {});
    expect(notifier.listenerCount()).toBe(1);

    unsubscribe();
    expect(notifier.listenerCount()).toBe(0);
  });

  test("each call to createNotifier() returns an independent notifier", () => {
    const a = window.DataStore._internal.createNotifier();
    const b = window.DataStore._internal.createNotifier();
    const receivedByA = [];

    a.subscribe((data) => receivedByA.push(data));
    b.notify("only for b");

    expect(receivedByA).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/data-store-notifier.test.js`
Expected: FAIL — `Cannot find module '../extension/utils/data-store.js'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `extension/utils/data-store.js`:

```js
/**
 * PlanWise Data Store
 *
 * Shared cache + live-sync layer sitting on top of supabase-client.js.
 * Loaded on dashboard.html and settings.html only.
 *
 * Every domain (events, groups, notifications, settings) exposes the same
 * interface: ready(), subscribe(callback), refresh(). See
 * docs/superpowers/specs/2026-09-04-data-store-live-sync-design.md.
 *
 * Depends on: supabase-client.js (must load first).
 */

// ─────────────────────────────────────────────
// NOTIFIER
// ─────────────────────────────────────────────
// Pure - no chrome/DOM/network dependency. Fans a notify() out to every
// subscribed callback. Each domain store owns one of these internally.

function createNotifier() {
  const listeners = new Set();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    notify(data) {
      for (const cb of listeners) cb(data);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

if (typeof window !== "undefined") {
  window.DataStore = window.DataStore || {};
  window.DataStore._internal = { createNotifier };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/data-store-notifier.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add extension/utils/data-store.js tests/data-store-notifier.test.js
git commit -m "feat(data-store): add pure notifier utility with tests"
```

---

### Task 2: Generic cache-backed domain store factory

**Files:**
- Modify: `extension/utils/data-store.js`

**Interfaces:**
- Consumes: `createNotifier()` from Task 1.
- Produces: `createDomainStore(domain, fetchFn)` → `{ ready(): Promise<any>, subscribe(cb): unsubscribeFn, refresh(): Promise<any>, _registerRealtimeChannel(channel): void, _reset(): void }`. `domain` is a string cache key (`"events"`, `"groups"`, `"notifications"`). `fetchFn` is `async () => data`. Task 4 wires real domains through this. Task 7 calls `_reset()` via `clearAll()`.

- [ ] **Step 1: Add the cache I/O helpers and the factory to `data-store.js`**

Append to `extension/utils/data-store.js`, above the `if (typeof window !== "undefined")` block at the bottom:

```js
// ─────────────────────────────────────────────
// CACHE I/O
// ─────────────────────────────────────────────
// One chrome.storage.local key holds every domain's cached data, keyed by
// domain name. Separate from confirmedEvents/planwiseTasks/planwise_session
// (existing keys, untouched) and from `settings` (handled differently -
// see Task 6, it already has its own local-storage mechanism).

const CACHE_KEY = "planwise_data_cache";

async function readCache(domain) {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY] || {};
  return cache[domain]?.data ?? null;
}

async function writeCache(domain, data) {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY] || {};
  cache[domain] = { data, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

async function clearDataCache() {
  await chrome.storage.local.remove(CACHE_KEY);
}

// ─────────────────────────────────────────────
// GENERIC DOMAIN STORE FACTORY
// ─────────────────────────────────────────────

function createDomainStore(domain, fetchFn) {
  const notifier = createNotifier();
  let current = null;
  let readyPromise = null;
  let realtimeChannels = [];

  async function refresh() {
    try {
      const fresh = await fetchFn();
      current = fresh;
      await writeCache(domain, fresh);
      notifier.notify(fresh);
    } catch (err) {
      console.warn(`[PlanWise:DataStore] ${domain} refresh failed:`, err.message);
    }
    return current;
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const cached = await readCache(domain);
      current = cached ?? [];
      refresh(); // fire-and-forget background refresh + realtime-driven updates land via subscribe()
      return current;
    })();
    return readyPromise;
  }

  function subscribe(cb) {
    return notifier.subscribe(cb);
  }

  function _registerRealtimeChannel(channel) {
    realtimeChannels.push(channel);
  }

  function _reset() {
    for (const ch of realtimeChannels) {
      try { ch.unsubscribe(); } catch (_) {}
    }
    realtimeChannels = [];
    current = null;
    readyPromise = null;
  }

  return { ready, subscribe, refresh, _registerRealtimeChannel, _reset };
}
```

- [ ] **Step 2: Add unit tests for the factory's cache/notify behavior**

These don't need real `chrome.storage` - stub it. Append to `tests/data-store-notifier.test.js` (rename the describe block's neighbor, same file - it's still small):

```js
describe("createDomainStore", () => {
  beforeEach(() => {
    const store = {};
    global.chrome = {
      storage: {
        local: {
          get: (key) => Promise.resolve({ [key]: store[key] }),
          set: (obj) => { Object.assign(store, obj); return Promise.resolve(); },
          remove: (key) => { delete store[key]; return Promise.resolve(); },
        },
      },
    };
  });

  test("ready() resolves with an empty array when there's no cache yet", async () => {
    const fetchFn = () => Promise.resolve([{ id: 1 }]);
    const store = window.DataStore._internal.createDomainStore("events", fetchFn);

    const result = await store.ready();

    expect(result).toEqual([]);
  });

  test("ready() triggers a background refresh that notifies subscribers", async () => {
    const fetchFn = () => Promise.resolve([{ id: 1 }]);
    const store = window.DataStore._internal.createDomainStore("events", fetchFn);
    const received = [];
    store.subscribe((data) => received.push(data));

    await store.ready();
    await store.refresh(); // ready()'s own background refresh already ran; call again for a deterministic await

    expect(received[received.length - 1]).toEqual([{ id: 1 }]);
  });

  test("a failed refresh does not throw and leaves current data in place", async () => {
    const fetchFn = () => Promise.reject(new Error("network down"));
    const store = window.DataStore._internal.createDomainStore("events", fetchFn);

    await expect(store.refresh()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Export `createDomainStore` for tests, run the tests**

Update the bottom of `extension/utils/data-store.js`:

```js
if (typeof window !== "undefined") {
  window.DataStore = window.DataStore || {};
  window.DataStore._internal = { createNotifier, createDomainStore };
}
```

Run: `npx jest tests/data-store-notifier.test.js`
Expected: PASS (7 tests total)

- [ ] **Step 4: Commit**

```bash
git add extension/utils/data-store.js tests/data-store-notifier.test.js
git commit -m "feat(data-store): add generic cache-backed domain store factory"
```

---

### Task 3: Wire the `events`, `groups`, `notifications` domains

**Files:**
- Modify: `extension/utils/data-store.js`

**Interfaces:**
- Consumes: `createDomainStore` (Task 2); `window.SupabaseClient.events.getAll()`, `window.SupabaseClient.groups.listGroups()`, `window.SupabaseClient.social.getNotifications()` (all pre-existing, unchanged, from `supabase-client.js`).
- Produces: `window.DataStore.events`, `window.DataStore.groups`, `window.DataStore.notifications` — each the `{ ready, subscribe, refresh }` object from Task 2. Task 5 consumes these from `dashboard.js`.

- [ ] **Step 1: Wire the three domains**

Append to `extension/utils/data-store.js`, above the exports block:

```js
// ─────────────────────────────────────────────
// DOMAINS: events, groups, notifications
// ─────────────────────────────────────────────

const eventsStore = createDomainStore("events", () => window.SupabaseClient.events.getAll());
const groupsStore = createDomainStore("groups", () => window.SupabaseClient.groups.listGroups());
const notificationsStore = createDomainStore("notifications", () => window.SupabaseClient.social.getNotifications());
```

- [ ] **Step 2: Export them**

Update the exports block:

```js
if (typeof window !== "undefined") {
  window.DataStore = {
    events: eventsStore,
    groups: groupsStore,
    notifications: notificationsStore,
    _internal: { createNotifier, createDomainStore },
  };
}
```

- [ ] **Step 3: Verify syntax and existing tests still pass**

Run: `node --check extension/utils/data-store.js && npx jest`
Expected: syntax OK, all Jest suites still pass (the events/groups/notifications wiring isn't unit tested directly - it's a thin call into `SupabaseClient`, verified in Task 5's manual/browser check instead).

- [ ] **Step 4: Commit**

```bash
git add extension/utils/data-store.js
git commit -m "feat(data-store): wire events, groups, and notifications domains"
```

---

### Task 4: Realtime for events, shared_events, groups, group_members, notifications

**Files:**
- Modify: `extension/utils/data-store.js`

**Interfaces:**
- Consumes: `window.SupabaseClient.db` (the raw Supabase client, already exported from `supabase-client.js`), `window.SupabaseClient.auth.getUser()`, `eventsStore._registerRealtimeChannel`, `groupsStore._registerRealtimeChannel`, `notificationsStore._registerRealtimeChannel`, `window.SupabaseClient.social.subscribeNotifications` (pre-existing).
- Produces: `startRealtimeSync()` — call once per page after the first `ready()` calls. Task 5 calls this from `dashboard.js`.

- [ ] **Step 1: Add the realtime wiring function**

Append to `extension/utils/data-store.js`, above the exports block:

```js
// ─────────────────────────────────────────────
// REALTIME
// ─────────────────────────────────────────────
// Realtime's filter syntax only supports simple column equality - it can't
// express the OR/join logic events' RLS uses for group-shared events. So
// events/shared_events/groups/group_members all just trigger a full
// refresh() on any change rather than patching the cache from the partial
// payload - the underlying query costs <1ms server-side (measured against
// the live database), so this is cheap and simpler than partial patching.

let _realtimeStarted = false;

async function startRealtimeSync() {
  if (_realtimeStarted) return;
  _realtimeStarted = true;

  const user = await window.SupabaseClient.auth.getUser();
  if (!user) return;

  const db = window.SupabaseClient.db;

  const eventsChannel = db
    .channel("data-store:events")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "events", filter: `user_id=eq.${user.id}` },
      () => eventsStore.refresh())
    .subscribe();
  eventsStore._registerRealtimeChannel(eventsChannel);

  const sharedEventsChannel = db
    .channel("data-store:shared_events")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "shared_events" },
      () => eventsStore.refresh())
    .subscribe();
  eventsStore._registerRealtimeChannel(sharedEventsChannel);

  const groupsChannel = db
    .channel("data-store:groups")
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => groupsStore.refresh())
    .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => groupsStore.refresh())
    .subscribe();
  groupsStore._registerRealtimeChannel(groupsChannel);

  const notificationsChannel = window.SupabaseClient.social.subscribeNotifications(
    user.id,
    () => notificationsStore.refresh()
  );
  notificationsStore._registerRealtimeChannel(notificationsChannel);
}
```

- [ ] **Step 2: Export `startRealtimeSync`**

Update the exports block:

```js
if (typeof window !== "undefined") {
  window.DataStore = {
    events: eventsStore,
    groups: groupsStore,
    notifications: notificationsStore,
    startRealtimeSync,
    _internal: { createNotifier, createDomainStore },
  };
}
```

- [ ] **Step 3: Verify syntax and existing tests still pass**

Run: `node --check extension/utils/data-store.js && npx jest`
Expected: syntax OK, all Jest suites still pass.

- [ ] **Step 4: Commit**

```bash
git add extension/utils/data-store.js
git commit -m "feat(data-store): add realtime sync for events, groups, notifications"
```

---

### Task 5: Wire `dashboard.js` to consume the data store

**Files:**
- Modify: `extension/dashboard/dashboard.html:12-13` (add script tag)
- Modify: `extension/dashboard/dashboard.js` (`loadEvents`, `loadGroupsFilter`, `initNotifFeed`, `init`)

**Interfaces:**
- Consumes: `window.DataStore.events.ready()`, `.subscribe()`, `window.DataStore.groups.ready()`, `.subscribe()`, `window.DataStore.notifications.ready()`, `.subscribe()`, `window.DataStore.startRealtimeSync()` (all from Tasks 3-4).

- [ ] **Step 1: Add the script tag**

In `extension/dashboard/dashboard.html`, after `<script src="../utils/dom-helpers.js"></script>` and before `<link rel="stylesheet" href="../vendor/theme.css" />`, the page already loads `../vendor/supabase.js`, `../utils/storage.js`, `../utils/supabase-client.js` further down before `dashboard.js` (lines ~214-217). Add the new script right after `../utils/supabase-client.js`:

```html
<script src="../vendor/supabase.js"></script>
<script src="../utils/storage.js"></script>
<script src="../utils/supabase-client.js"></script>
<script src="../utils/data-store.js"></script>
<script src="../vendor/anime.min.js"></script>
<script src="dashboard.js"></script>
```

- [ ] **Step 2: Rewire `loadEvents()` to read from the store instead of calling `Events.getAll()` directly**

In `extension/dashboard/dashboard.js`, replace the body of `loadEvents()` (the signed-in branch) so it uses `DataStore.events` instead of `Events.getAll()`/`Events.materializeRecurrences()` directly. The materialize-recurrences fire-and-forget call stays exactly as-is (it's orthogonal to the cache/realtime work — still just extends the horizon in the background):

```js
async function loadEvents() {
  try {
    const user = await Auth.getUser();
    currentUserId = user?.id || null;
    if (user) {
      Events.materializeRecurrences().catch(err => {
        console.warn("[PlanWise] Failed to materialize recurring events:", err.message);
      });
      allEvents = await DataStore.events.ready();
      DataStore.events.subscribe((fresh) => {
        allEvents = mergeEventsWithDeadlines(fresh, deadlineEvents);
        render();
        renderUpcoming();
      });
    } else {
      const result = await chrome.storage.local.get("confirmedEvents");
      allEvents = result.confirmedEvents || [];
    }
  } catch (err) {
    console.warn("[PlanWise] Failed to load events, falling back to local cache:", err.message);
    try {
      const result = await chrome.storage.local.get("confirmedEvents");
      allEvents = result.confirmedEvents || [];
    } catch (fallbackErr) {
      console.error("[PlanWise] Local event fallback also failed:", fallbackErr);
      allEvents = [];
    }
  }

  try {
    const result = await chrome.storage.local.get("planwiseTasks");
    const tasks = result.planwiseTasks || [];
    deadlineEvents = tasks
      .filter(t => t.date)
      .map(t => ({
        id:            `deadline-${t.id}`,
        title:         t.title,
        event_date:    t.date,
        _isDeadline:   true,
        group_id:      "deadlines",
        group_colour:  DEADLINE_PRIORITY_COLOURS[t.priority] || DEADLINE_PRIORITY_COLOURS.none,
      }));
    allEvents = mergeEventsWithDeadlines(allEvents, deadlineEvents);
  } catch (_) {
    deadlineEvents = [];
  }
}

// Extracted so both the initial load and the live-update subscriber can
// build the same shape without duplicating the merge logic.
function mergeEventsWithDeadlines(events, deadlines) {
  const withoutOldDeadlines = events.filter(e => !e._isDeadline);
  return [...withoutOldDeadlines, ...deadlines];
}
```

- [ ] **Step 3: Rewire `loadGroupsFilter()`**

Replace its body:

```js
async function loadGroupsFilter() {
  try {
    calGroups = await DataStore.groups.ready();
  } catch (_) {
    calGroups = [];
  }
  renderGroupsFilter();

  DataStore.groups.subscribe((fresh) => {
    calGroups = fresh;
    renderGroupsFilter();
  });
}
```

- [ ] **Step 4: Rewire the notification list loading inside `initNotifFeed()`**

`initNotifFeed()` currently wires the bell click handler (calls `renderNotifFeed()` on open, which itself calls `Social.getNotifications()` directly) and a separate `Social.subscribeNotifications()` call for the OS-notification relay. Change `renderNotifFeed()` to read from the store, and add a subscription that keeps the badge count live even while the panel is closed. Find `async function renderNotifFeed()` and replace its data-fetching lines:

```js
async function renderNotifFeed() {
  const list = el("notif-list");
  if (!list) return;

  list.innerHTML = '<div class="px-4 py-3 font-mono text-xs text-on-muted">Loading...</div>';

  let notifs;
  try {
    notifs = await DataStore.notifications.ready();
  } catch (_) {
    list.innerHTML = '<div class="px-4 py-3 font-mono text-xs text-error">Failed to load.</div>';
    return;
  }
  // ...rest of the function (the `if (!notifs.length)` block onward) is unchanged
```

At the end of `initNotifFeed()` (after the existing `Social.subscribeNotifications(session.user.id, (notif) => {...})` block that relays OS notifications), add:

```js
  DataStore.notifications.subscribe(() => {
    updateNotifBadge();
    if (!panel.classList.contains("hidden")) renderNotifFeed();
  });

  DataStore.startRealtimeSync();
```

- [ ] **Step 5: Verify syntax**

Run: `node --check extension/dashboard/dashboard.js && node --check extension/dashboard/dashboard.html 2>/dev/null; echo "html has no --check, verified by opening it in step 6"`

- [ ] **Step 6: Manual browser verification**

Start a local static server and load the page (no real chrome APIs, so this only verifies the page parses, `DataStore` wires in without throwing, and the pre-existing "chrome undefined" fallback path still works cleanly - matches the verification pattern used throughout this project's session history):

```bash
cd "extension" && python -m http.server 8747 &
```

Then navigate to `http://localhost:8747/dashboard/dashboard.html`, open DevTools console, and confirm:
- No new errors beyond the expected `chrome.storage` undefined ones (same as before this change).
- `window.DataStore` is defined and has `events`, `groups`, `notifications`, `startRealtimeSync`.

Kill the server after: `pkill -f "http.server 8747"`.

This step cannot verify real caching or Realtime behavior (both need `chrome.storage` and a live signed-in Supabase session, neither available outside the real loaded extension) - that's covered in Task 8's end-to-end pass, which needs the user's real extension.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all suites pass (this change doesn't touch the detection engine).

- [ ] **Step 8: Commit**

```bash
git add extension/dashboard/dashboard.html extension/dashboard/dashboard.js
git commit -m "feat(dashboard): consume DataStore for events, groups, notifications"
```

---

### Task 6: Settings domain - reorder render, add Realtime

**Files:**
- Modify: `extension/utils/supabase-client.js` (add `subscribeSettings`)
- Modify: `extension/settings/settings.html` (add script tag)
- Modify: `extension/settings/settings.js` (`loadSettings`, `init`)

**Interfaces:**
- Produces: `window.SupabaseClient.social`... no - `subscribeSettings` belongs on `SupabaseSettings`, i.e. `window.SupabaseClient.settings.subscribeSettings(userId, onChange)`, matching the existing `social.subscribeComments`/`social.subscribeNotifications` shape (`db.channel(...).on("postgres_changes", ...).subscribe()`, returns the channel).
- Consumes: nothing new from `data-store.js` - Settings' "cache" is the pre-existing `PlanWiseStorage.getSettings()`/`saveSettings()` mechanism (see spec's Settings section for why this domain is handled differently), so this task doesn't touch `data-store.js` at all.

- [ ] **Step 1: Add `subscribeSettings` to `supabase-client.js`**

In `extension/utils/supabase-client.js`, inside the `SupabaseSettings` object (after its existing `save()` method), add:

```js
  subscribeSettings(userId, onChange) {
    return db
      .channel(`settings:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${userId}` },
        (payload) => onChange(payload.new)
      )
      .subscribe();
  },
```

- [ ] **Step 2: Verify syntax and tests**

Run: `node --check extension/utils/supabase-client.js && npm test`
Expected: syntax OK, all suites pass.

- [ ] **Step 3: Commit**

```bash
git add extension/utils/supabase-client.js
git commit -m "feat(supabase-client): add subscribeSettings realtime helper"
```

- [ ] **Step 4: Add the data-store script tag to settings.html**

Even though this task doesn't use `data-store.js`'s domain stores, load it anyway for consistency with dashboard.html and so Phase 2 (SPA merge) has it already wired everywhere it'll eventually be needed. In `extension/settings/settings.html`, after `<script src="../utils/supabase-client.js"></script>` (around line 235-236) and before `<script src="settings.js"></script>`:

```html
<script src="../vendor/supabase.js"></script>
<script src="../utils/storage.js"></script>
<script src="../utils/supabase-client.js"></script>
<script src="../utils/data-store.js"></script>
<script src="settings.js"></script>
```

- [ ] **Step 5: Reorder `loadSettings()` to render from local before waiting on the remote merge**

In `extension/settings/settings.js`, `loadSettings()` currently does the local read, then awaits the remote merge, all before returning - and `init()` calls `renderAll()` only after `loadSettings()` fully resolves. Split it: extract the remote-merge logic into its own function, call `renderAll()` right after the local read, then run the remote merge in the background and call `renderAll()` again only if it changed anything.

Replace `loadSettings()`:

```js
async function loadSettings() {
  const local = await LocalStorage.getSettings();
  settings = { ...settings, ...local };
}

async function syncRemoteSettings() {
  if (!currentUser) return;
  try {
    const remote = await SupaSettings.load();
    if (!remote) return;

    const remoteMapped = {
      triggerWords:         remote.trigger_words         || [],
      contacts:             remote.contacts              || [],
      sensitivity:          remote.sensitivity           ?? 2,
      notificationsEnabled: remote.notifications_enabled ?? true,
      priorityNames:        remote.priority_names        || [],
      activityWords:        remote.activity_words        || [],
      meetingWords:         remote.meeting_words         || [],
      items:                remote.items                 || [],
      placeWords:           remote.place_words           || [],
    };

    let changed = false;
    for (const key of MERGE_AS_UNION_IF_LOCAL_EMPTY) {
      if (!settings[key]?.length && remoteMapped[key].length) {
        settings[key] = remoteMapped[key];
        changed = true;
      }
    }
    if (settings.sensitivity !== remoteMapped.sensitivity) {
      settings.sensitivity = remoteMapped.sensitivity;
      changed = true;
    }
    if (settings.notificationsEnabled !== remoteMapped.notificationsEnabled) {
      settings.notificationsEnabled = remoteMapped.notificationsEnabled;
      changed = true;
    }

    if (changed) renderAll();
  } catch (err) {
    console.warn('[PlanWise] Could not load remote settings:', err.message);
  }
}
```

- [ ] **Step 6: Update `init()` to render immediately, sync in the background, and subscribe to live changes**

Replace the relevant block inside `init()`:

```js
  try {
    await loadSettings();
    renderAll();
    wireNav();
    wireControls();
    wireGroupsSection();
    syncRemoteSettings();
    SupaSettings.subscribeSettings(currentUser.id, () => syncRemoteSettings());
    await loadAccountInfo();
  } catch (err) {
    console.error("[PlanWise] Settings page failed to initialize:", err);
  }
```

(`syncRemoteSettings()` is intentionally not awaited here - it renders again on its own if it changes anything, matching the fire-and-forget pattern used elsewhere in this codebase, e.g. `Events.materializeRecurrences()` in `dashboard.js`.)

- [ ] **Step 7: Verify syntax and manual browser check**

Run: `node --check extension/settings/settings.js`

Then:

```bash
cd extension && python -m http.server 8747 &
```

Navigate to `http://localhost:8747/settings/settings.html` and confirm no new console errors beyond the expected `chrome`-undefined ones (this page shows "Sign in via the extension icon" and closes itself outside a real session, which is correct, existing behavior - confirmed earlier this session). Kill the server after: `pkill -f "http.server 8747"`.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 9: Commit**

```bash
git add extension/settings/settings.html extension/settings/settings.js
git commit -m "feat(settings): render from local cache immediately, sync + live-update in background"
```

---

### Task 7: Sign-out cache clearing

**Files:**
- Modify: `extension/utils/data-store.js` (add `clearAll`)
- Modify: `extension/utils/supabase-client.js` (`_saveSession`)

**Interfaces:**
- Produces: `window.DataStore.clearAll()` — clears the `planwise_data_cache` chrome.storage.local key and resets every domain store (unsubscribing its Realtime channels).
- Consumes (from `supabase-client.js`): called from inside `_saveSession(null)`, which already runs on sign-out and on session-invalid cleanup (see `extension/utils/supabase-client.js`'s `_restoreSession()` error branch) - both call `_saveSession(null)` already, so hooking there covers both cases with one change.

- [ ] **Step 1: Add `clearAll` to `data-store.js`**

Append inside the file, above the exports block:

```js
function clearAll() {
  eventsStore._reset();
  groupsStore._reset();
  notificationsStore._reset();
  _realtimeStarted = false;
  return clearDataCache();
}
```

Update the exports block:

```js
if (typeof window !== "undefined") {
  window.DataStore = {
    events: eventsStore,
    groups: groupsStore,
    notifications: notificationsStore,
    startRealtimeSync,
    clearAll,
    _internal: { createNotifier, createDomainStore },
  };
}
```

- [ ] **Step 2: Call it from `_saveSession(null)` in `supabase-client.js`**

In `extension/utils/supabase-client.js`, find `_saveSession(session)` and update the `else` branch (the `session` falsy / sign-out path):

```js
  async _saveSession(session) {
    if (session) {
      await chrome.storage.local.set({ [SESSION_KEY]: session });
      _sessionPromise = Promise.resolve(session);
    } else {
      await chrome.storage.local.remove(SESSION_KEY);
      _sessionPromise = Promise.resolve(null);
      if (typeof window !== "undefined" && window.DataStore) {
        window.DataStore.clearAll();
      }
    }
  },
```

(Guarded by `window.DataStore` existing, since `supabase-client.js` also loads on `popup.html`/`signup.html`, which never load `data-store.js`.)

- [ ] **Step 3: Verify syntax and tests**

Run: `node --check extension/utils/data-store.js && node --check extension/utils/supabase-client.js && npm test`
Expected: syntax OK, all suites pass.

- [ ] **Step 4: Commit**

```bash
git add extension/utils/data-store.js extension/utils/supabase-client.js
git commit -m "feat(data-store): clear cache and realtime subscriptions on sign-out"
```

---

### Task 8: End-to-end verification and push

**Files:** none (verification only)

- [ ] **Step 1: Full syntax + test sweep**

```bash
node --check extension/utils/data-store.js
node --check extension/utils/supabase-client.js
node --check extension/dashboard/dashboard.js
node --check extension/settings/settings.js
npm test
```

Expected: all clean, all tests pass.

- [ ] **Step 2: Local server smoke test (what's verifiable without a real signed-in session)**

```bash
cd extension && python -m http.server 8747 &
```

Navigate to `dashboard.html` and `settings.html`; confirm both still render their existing (already-verified-correct-earlier-this-session) logged-out states with no new console errors. Kill the server after: `pkill -f "http.server 8747"`.

- [ ] **Step 3: Real-extension verification (needs the user)**

This is the part that genuinely needs a real signed-in session and cannot be faked locally - hand these steps to the user:

1. Reload the unpacked extension in `chrome://extensions`.
2. Open the dashboard. Throttle network to "Slow 3G" in DevTools, reload: confirm the calendar/sidebar render immediately (from cache) rather than showing a blank/loading state for the throttled duration.
3. Open the dashboard in two separate windows, signed into the same account. In one, edit an event (or add a Settings trigger word, if testing Settings instead). Confirm the other window updates without a manual reload.
4. Sign out, sign in as a different test account (same browser profile). Confirm no flash of the previous account's events/groups/notifications.
5. Turn off network after a page has cached data once, then reload: confirm cached data still renders, with a `[PlanWise:DataStore] ... refresh failed` warning in console rather than a broken page.

- [ ] **Step 4: Push**

```bash
git push origin main
```
