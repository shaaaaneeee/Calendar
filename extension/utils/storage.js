/**
 * PlanWise Storage Utility
 *
 * Wraps chrome.storage.local with promise-based helpers.
 */

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
      await chrome.storage.local.set({ pendingEvents: existing });
      return entry;
    } catch (err) {
      return null;
    }
  },

  async getPendingEvents() {
    try {
      const result = await chrome.storage.local.get("pendingEvents");
      return result.pendingEvents || [];
    } catch (err) {
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
    const result = await chrome.storage.local.get("confirmedEvents");
    return result.confirmedEvents || [];
  },

  async getSettings() {
    try {
      const result = await chrome.storage.local.get("settings");
      return (
        result.settings || {
          triggerWords: [],
          contacts: [],
          sensitivity: 2,
          notificationsEnabled: true
        }
      );
    } catch (err) {
      return {
        triggerWords: [],
        contacts: [],
        sensitivity: 2,
        notificationsEnabled: true
      };
    }
  },

  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
};

if (typeof window !== "undefined") {
  window.PlanWiseStorage = Storage;
}
