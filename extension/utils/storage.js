/**
 * PlanWise Storage Utility
 *
 * Wraps chrome.storage.local with promise-based helpers.
 */

// chrome.storage.local enforces an ~8KB per-item quota. pendingEvents lives
// under a single key, so an unbounded queue can eventually make the write
// throw - previously that failure was swallowed silently (see the catch
// below), so a plan could be "detected" but never actually persisted with no
// visible sign why. Capping it keeps that from ever happening again.
const MAX_PENDING_EVENTS = 25;

const DEFAULT_SETTINGS = {
  triggerWords: [],
  contacts: [],
  priorityNames: [],
  activityWords: [],
  meetingWords: [],
  items: [],
  placeWords: [],
  sensitivity: 2,
  notificationsEnabled: true
};

const Storage = {
  async enqueuePendingEvent(event) {
    try {
      const existing = await this.getPendingEvents();
      if (existing.some(e => e.sourceText === event.sourceText)) return null;
      const entry = {
        ...event,
        id: crypto.randomUUID(),
        detectedAt: Date.now(),
        status: "pending"
      };
      existing.push(entry);
      while (existing.length > MAX_PENDING_EVENTS) existing.shift();
      await chrome.storage.local.set({ pendingEvents: existing });
      return entry;
    } catch (err) {
      console.error("[PlanWise] enqueuePendingEvent failed:", err);
      return null;
    }
  },

  async getPendingEvents() {
    try {
      const result = await chrome.storage.local.get("pendingEvents");
      return result.pendingEvents || [];
    } catch (err) {
      console.error("[PlanWise] getPendingEvents failed:", err);
      return [];
    }
  },

  async removePendingEvent(id) {
    const existing = await this.getPendingEvents();
    const filtered = existing.filter((event) => event.id !== id);
    await chrome.storage.local.set({ pendingEvents: filtered });
  },

  async updatePendingEvent(id, updates) {
    const existing = await this.getPendingEvents();
    const updated = existing.map((event) => (event.id === id ? { ...event, ...updates } : event));
    await chrome.storage.local.set({ pendingEvents: updated });
  },

  async saveConfirmedEvent(event) {
    const existing = await this.getConfirmedEvents();
    existing.push({ ...event, confirmedAt: Date.now() });
    await chrome.storage.local.set({ confirmedEvents: existing });
  },

  async getConfirmedEvents() {
    try {
      const result = await chrome.storage.local.get("confirmedEvents");
      return result.confirmedEvents || [];
    } catch (err) {
      console.error("[PlanWise] getConfirmedEvents failed:", err);
      return [];
    }
  },

  async getSettings() {
    try {
      const result = await chrome.storage.local.get("settings");
      return result.settings || { ...DEFAULT_SETTINGS };
    } catch (err) {
      console.error("[PlanWise] getSettings failed:", err);
      return { ...DEFAULT_SETTINGS };
    }
  },

  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
};

if (typeof window !== "undefined") {
  window.PlanWiseStorage = Storage;
}
