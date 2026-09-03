/**
 * PlanWise Data Store
 *
 * Shared cache + live-sync layer sitting on top of supabase-client.js.
 * Loaded on dashboard.html and settings.html only.
 *
 * Every domain (events, groups, notifications) exposes the same interface:
 * ready(), subscribe(callback), refresh(). Settings is handled separately
 * (see settings.js's own local-storage + subscribeSettings mechanism)
 * since it already had a working local-cache pattern before this file
 * existed. See docs/superpowers/specs/2026-09-04-data-store-live-sync-design.md.
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
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (err) {
          console.warn("[PlanWise:DataStore] subscriber threw:", err);
        }
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

// ─────────────────────────────────────────────
// CACHE I/O
// ─────────────────────────────────────────────
// One chrome.storage.local key holds every domain's cached data, keyed by
// domain name. Separate from confirmedEvents/planwiseTasks/planwise_session
// (existing keys, untouched) and from `settings` (handled differently -
// see Task 6, it already has its own local-storage mechanism).
//
// All cache I/O is serialized through _cacheChain to prevent read-modify-write
// races when multiple domain stores refresh concurrently. Without this, store A
// and store B reading/writing around the same time can cause A's stale snapshot
// to overwrite B's write, silently dropping data.

const CACHE_KEY = "planwise_data_cache";
let _cacheChain = Promise.resolve();

// Bumped by clearAll() to invalidate any refresh() already in flight at the
// moment of sign-out. Without this, a refresh() started just before
// clearAll() runs (fire-and-forget from ready() or a realtime callback) can
// still be awaiting its network response when clearAll() clears the cache -
// and its writeCache()/notify() would land afterward, writing the previous
// account's data back into the cache post-clear. Shared across all domain
// stores (not per-store) so one clearAll() invalidates in-flight work for
// events/groups/notifications at once.
let _generation = 0;

function _enqueueCacheOp(fn) {
  _cacheChain = _cacheChain.then(fn, fn); // Chain on both resolve and reject paths
  return _cacheChain;
}

async function readCache(domain) {
  return _enqueueCacheOp(async () => {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cache = result[CACHE_KEY] || {};
    return cache[domain]?.data ?? null;
  });
}

async function writeCache(domain, data) {
  return _enqueueCacheOp(async () => {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cache = result[CACHE_KEY] || {};
    cache[domain] = { data, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  });
}

async function clearDataCache() {
  return _enqueueCacheOp(async () => {
    await chrome.storage.local.remove(CACHE_KEY);
  });
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
    const startGeneration = _generation;
    try {
      const fresh = await fetchFn();
      if (_generation !== startGeneration) {
        // clearAll() ran while this fetch was in flight - discard the
        // stale result rather than writing a previous account's data back
        // into the cache after sign-out.
        return current;
      }
      current = fresh;
      await writeCache(domain, fresh);
      notifier.notify(fresh);
    } catch (err) {
      console.warn(`[PlanWise:DataStore] ${domain} refresh failed:`, err.message);
    }
    return current;
  }

  function ready() {
    if (readyPromise) return readyPromise.then(() => current ?? []);
    readyPromise = (async () => {
      try {
        const cached = await readCache(domain);
        current = cached ?? [];
      } catch (err) {
        console.warn(`[PlanWise:DataStore] ${domain} cache read failed:`, err.message);
        current = [];
      }
      refresh(); // fire-and-forget background refresh + realtime-driven updates land via subscribe()
      return current;
    })();
    return readyPromise.then(() => current ?? []);
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

function _resetCacheChain() {
  _cacheChain = Promise.resolve();
}

// ─────────────────────────────────────────────
// DOMAINS: events, groups, notifications
// ─────────────────────────────────────────────

const eventsStore = createDomainStore("events", () => window.SupabaseClient.events.getAll());
const groupsStore = createDomainStore("groups", () => window.SupabaseClient.groups.listGroups());
const notificationsStore = createDomainStore("notifications", () => window.SupabaseClient.social.getNotifications());

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

  const user = await window.SupabaseClient.auth.getUser();
  if (!user) return;

  _realtimeStarted = true;

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

function clearAll() {
  _generation++;
  eventsStore._reset();
  groupsStore._reset();
  notificationsStore._reset();
  _realtimeStarted = false;
  return clearDataCache();
}

if (typeof window !== "undefined") {
  window.DataStore = {
    events: eventsStore,
    groups: groupsStore,
    notifications: notificationsStore,
    startRealtimeSync,
    clearAll,
    _internal: { createNotifier, createDomainStore, _resetCacheChain },
  };
}
