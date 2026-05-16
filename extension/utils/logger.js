/**
 * PlanWise Detection Logger
 *
 * Saves every detection result to chrome.storage.local for later review.
 * Only stores the text and engine output — no metadata, no user info.
 *
 * Storage key: detectionLog
 * Max entries: 500 (rolls over oldest when full)
 */

const DetectionLogger = {

  MAX_ENTRIES: 500,

  async log(text, result) {
    const entry = {
      id:        crypto.randomUUID(),
      text:      text.trim(),
      score:     result.score,
      intent:    result.intent,
      reason:    result.reason,
      triggered: result.triggered,
      matches:   result.matches,
      label:     null,   // null = unlabelled, 'correct', 'false_positive', 'false_negative'
      notes:     '',
      loggedAt:  Date.now(),
    };

    const existing = await this.getLog();
    existing.push(entry);

    const trimmed = existing.length > this.MAX_ENTRIES
      ? existing.slice(-this.MAX_ENTRIES)
      : existing;

    await chrome.storage.local.set({ detectionLog: trimmed });
    return entry;
  },

  async getLog() {
    const result = await chrome.storage.local.get('detectionLog');
    return result.detectionLog || [];
  },

  async updateLabel(id, label, notes = '') {
    const log = await this.getLog();
    const updated = log.map(entry =>
      entry.id === id ? { ...entry, label, notes } : entry
    );
    await chrome.storage.local.set({ detectionLog: updated });
  },

  async clearLog() {
    await chrome.storage.local.set({ detectionLog: [] });
  },

  async exportAsJSON() {
    const log = await this.getLog();
    return JSON.stringify(log, null, 2);
  },
};

if (typeof window !== 'undefined') {
  window.DetectionLogger = DetectionLogger;
}
