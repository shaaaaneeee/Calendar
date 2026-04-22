/**
 * DOM Observer helpers per platform.
 */

const PLATFORM_SELECTORS = {
  "web.whatsapp.com": {
    inputSelector: 'div[contenteditable="true"][data-tab="10"]',
    messageSelector: ".message-in .copyable-text, .message-out .copyable-text",
    sendButtonSelector: 'button[data-testid="send"]',
    name: "WhatsApp"
  },
  "discord.com": {
    inputSelector: 'div[role="textbox"][data-slate-editor="true"]',
    messageSelector: ".messageContent-2t3eCI",
    sendButtonSelector: null,
    name: "Discord"
  },
  "web.telegram.org": {
    inputSelector: 'div.input-message-input[contenteditable="true"]',
    messageSelector: ".text-content",
    sendButtonSelector: "button.send",
    name: "Telegram"
  },
  "mail.google.com": {
    inputSelector: 'div[role="textbox"][aria-label="Message Body"]',
    messageSelector: null,
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

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element not found: ${selector}`));
    }, timeout);
  });
}

if (typeof window !== "undefined") {
  window.DOMObserver = { detectPlatform, waitForElement, PLATFORM_SELECTORS };
}
