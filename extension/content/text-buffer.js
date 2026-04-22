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
    if (!text || typeof text !== "string") {
      return;
    }

    this.buffer = `${this.buffer} ${text}`.trim();
    if (this.buffer.length > this.maxLength) {
      this.buffer = this.buffer.slice(-this.maxLength);
    }

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this._flush();
    }, this.debounceMs);
  }

  flushNow() {
    clearTimeout(this.debounceTimer);
    this._flush();
  }

  _flush() {
    const text = this.buffer.trim();
    if (text.length > 0) {
      this.onFlush(text);
    }
    this.clear();
  }

  clear() {
    this.buffer = "";
    clearTimeout(this.debounceTimer);
  }

  getBuffer() {
    return this.buffer;
  }
}

if (typeof window !== "undefined") {
  window.TextBuffer = TextBuffer;
}
