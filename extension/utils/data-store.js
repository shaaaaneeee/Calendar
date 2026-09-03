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
