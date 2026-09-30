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

  // Replace the buffer with the current input value on every keystroke -
  // this is the only way text enters the buffer, so it only ever reflects
  // what the user is actively typing into their own compose box. Callers
  // must strip quoted/forwarded content before calling this (see
  // content-script.js's getComposedText()) - the slice below keeps the
  // TAIL of whatever string it's given, so unstripped quoted text sitting
  // after the user's new text would win the slice instead of the new text.
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
