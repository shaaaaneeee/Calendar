/**
 * DOM Observer helpers per platform.
 */

const PLATFORM_SELECTORS = {
  "web.whatsapp.com": {
    inputSelector: [
      'div[aria-placeholder="Type a message"]',
      '#main footer div[contenteditable="true"][role="textbox"]',
      'footer div[contenteditable="true"][role="textbox"]',
      'div[role="textbox"][data-lexical-editor="true"]',
      'div[role="textbox"][data-tab="10"]',
      '#main div[contenteditable="true"][role="textbox"]',
    ],
    sendButtonSelector: 'button[data-testid="send"], button[aria-label="Send"], span[data-icon="send"]',
    // TODO: WhatsApp Web's quoted-reply preview (the small snippet shown
    // above the input when replying to a specific message) uses obfuscated,
    // frequently-changing class names. Not confirmed against a live DOM -
    // left empty (no stripping) rather than guess. Confirm from an actual
    // reply-preview element before filling this in.
    quoteSelectors: [],
    name: "WhatsApp"
  },
  "web.telegram.org": {
    inputSelector: [
      'div.input-message-input[contenteditable="true"]',
      "div[contenteditable=\"true\"].input-message-input",
      "div[data-peer-id] div[contenteditable=\"true\"]",
      "div.composer-wrapper div[contenteditable=\"true\"]",
    ],
    sendButtonSelector: "button.send",
    // TODO: same situation as WhatsApp above - Telegram Web's reply-preview
    // markup hasn't been confirmed against a live DOM. Left empty until
    // real selectors are captured from an actual reply preview.
    quoteSelectors: [],
    name: "Telegram"
  },
  "mail.google.com": {
    inputSelector: [
      'div[role="textbox"][aria-label="Message Body"]',
      'div.Am.aiL.editable',
    ],
    sendButtonSelector: null,
    // Gmail wraps quoted reply history AND forwarded messages in the same
    // markup: an outer .gmail_quote_container (current Gmail) or .gmail_quote
    // holding the "On ... wrote:" / "---------- Forwarded message ----------"
    // line, plus a nested <blockquote class="gmail_quote"> with the actual
    // quoted content. This is Gmail's long-standing, widely-documented
    // compose markup (the same convention email-parsing tools rely on) -
    // not something inspected live in this session, since that needs a
    // real signed-in Gmail draft. Verify against a real reply and forward
    // (see manual test plan) and adjust here if it doesn't match.
    quoteSelectors: [".gmail_quote_container", ".gmail_quote", "blockquote"],
    name: "Gmail"
  }
};

function detectPlatform() {
  const hostname = window.location.hostname;
  for (const [domain, config] of Object.entries(PLATFORM_SELECTORS)) {
    if (hostname.includes(domain)) {
      return { domain, ...config };
    }
  }
  return null;
}

function waitForElement(selectorOrList, timeout = 10000, platformName = null) {
  // Normalise to array so the rest of the logic is the same
  const selectors = Array.isArray(selectorOrList) ? selectorOrList : [selectorOrList];

  // Only warns when a platformName is given, so the send-button caller
  // below (a single comma-joined selector, not an ordered fallback list)
  // doesn't log noise it was never meant to.
  function warnIfDrifted(selector) {
    const index = selectors.indexOf(selector);
    if (platformName && index > 0) {
      console.warn(
        `[PlanWise] Selector drift on ${platformName}: selectors[0] ` +
        `("${selectors[0]}") did not match - fell back to selectors[${index}] ("${selector}"). ` +
        `If ${platformName} changed its DOM, consider promoting this selector.`
      );
    }
  }

  return new Promise((resolve, reject) => {
    // Check if any selector already matches
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        warnIfDrifted(selector);
        resolve(el);
        return;
      }
    }

    // Watch for any of the selectors to appear
    const observer = new MutationObserver(() => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          warnIfDrifted(selector);
          resolve(el);
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element not found: ${selectors.join(" | ")}`));
    }, timeout);
  });
}

if (typeof window !== "undefined") {
  window.DOMObserver = { detectPlatform, waitForElement, PLATFORM_SELECTORS };
}
