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

if (typeof window !== "undefined") {
  window.DataStore = window.DataStore || {};
  window.DataStore._internal = { createNotifier, createDomainStore };
}
