/**
 * Rolling Text Buffer
 *
 * Maintains a sliding window of recent text and flushes on debounce.
 */

class TextBuffer {
  constructor(options = {}) {
    this.maxLength = options.maxLength || 500;
    this.debounceMs = options.debounceMs || 1500;
    this.buffer = "";
    this.debounceTimer = null;
    this.onFlush = options.onFlush || (() => {});
  }

  push(text) {
    if (!text || typeof text !== "string") return;

    this.buffer = `${this.buffer} ${text}`.trim();
    if (this.buffer.length > this.maxLength) {
      this.buffer = this.buffer.slice(-this.maxLength);
    }

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._flush(), this.debounceMs);
  }

  // Replace the outgoing (typed) portion of the buffer with the current input
  // value. Unlike push(), this prevents partial keystroke states from
  // accumulating when the full input value is pushed on every input event.
  set(text) {
    if (!text || typeof text !== "string") return;

    this.buffer = text.trim().slice(-this.maxLength);

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._flush(), this.debounceMs);
  }

  flushNow() {
    clearTimeout(this.debounceTimer);
    this._flush(true);
  }

  _flush(fromSend = false) {
    const text = this.buffer.trim();
    if (text.length > 0) {
      this.onFlush(text, fromSend);
    }
    this.clear();
  }

  clear() {
    this.buffer = "";
    clearTimeout(this.debounceTimer);
  }
}

if (typeof window !== "undefined") {
  window.TextBuffer = TextBuffer;
}
