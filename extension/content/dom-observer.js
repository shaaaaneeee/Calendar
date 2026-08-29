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
    name: "Telegram"
  },
  "mail.google.com": {
    inputSelector: [
      'div[role="textbox"][aria-label="Message Body"]',
      'div.Am.aiL.editable',
    ],
    sendButtonSelector: null,
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

function waitForElement(selectorOrList, timeout = 10000) {
  // Normalise to array so the rest of the logic is the same
  const selectors = Array.isArray(selectorOrList) ? selectorOrList : [selectorOrList];

  return new Promise((resolve, reject) => {
    // Check if any selector already matches
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
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
