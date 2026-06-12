/**
 * PlanWise Content Script orchestrator.
 *
 * WhatsApp loads its input element only after a chat is opened,
 * not on the home screen. We use a MutationObserver to watch for
 * the input appearing at any point after the script loads.
 */

(async function init() {
  console.log("[PlanWise] Content script loaded on:", window.location.hostname);

  const platform = window.DOMObserver.detectPlatform();
  if (!platform) {
    console.log("[PlanWise] Platform not recognized. Exiting.");
    return;
  }
  console.log("[PlanWise] Detected platform:", platform.name);

  // Try to find the input element immediately (works if chat already open)
  // or wait up to 30 seconds for it to appear.
  // If it never appears (e.g. user stays on home screen), watch indefinitely.
  attachWhenReady(platform);
})();


/**
 * Attempt to attach to the input element.
 * If not found within 30s, switch to indefinite watching mode -
 * activates the moment the user opens a chat.
 */
async function attachWhenReady(platform) {
  try {
    const inputElement = await window.DOMObserver.waitForElement(
      platform.inputSelector,
      30000
    );
    console.log("[PlanWise] Input element found.");
    attachBuffer(inputElement, platform);
  } catch (err) {
    // Element not found within timeout - watch indefinitely for it.
    // This handles WhatsApp's home screen: input only exists inside a chat.
    console.log("[PlanWise] Input not found yet - watching for chat to open...");
    watchForInput(platform);
  }
}


/**
 * Watch indefinitely for the input element to appear.
 * Disconnects once found so we don't keep watching unnecessarily.
 */
function watchForInput(platform) {
  const selectors = Array.isArray(platform.inputSelector)
    ? platform.inputSelector
    : [platform.inputSelector];

  const observer = new MutationObserver(() => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        console.log("[PlanWise] Input element appeared - attaching.");
        attachBuffer(el, platform);
        return;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}


/**
 * Wire up the text buffer and listeners to the found input element.
 */
function attachBuffer(inputElement, platform) {
  const buffer = new window.TextBuffer({
    maxLength: 500,
    debounceMs: 1500,
    onFlush: (text, fromSend) => {
      analyzeText(text, platform, fromSend).catch((error) => {
        console.warn("[PlanWise] analyzeText failed:", error);
      });
    }
  });

  inputElement.addEventListener("input", () => {
    const text = inputElement.textContent || inputElement.value || "";
    buffer.set(text);
  });

  inputElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      buffer.flushNow();
    }
  });

  if (platform.sendButtonSelector) {
    waitForSendButton(platform.sendButtonSelector, buffer);
  }

  if (platform.messageSelector) {
    watchIncomingMessages(platform, buffer);
  }

  console.log("[PlanWise] Monitoring active on", platform.name);
}

async function analyzeText(text, platform, fromSend = false) {
  const settings = await window.PlanWiseStorage.getSettings();
  const result = window.PlanWiseEngine.analyzeIntent(text, settings);

  console.log(
    `[PlanWise] Score: ${result.score} | Intent: ${result.intent} | Reason: ${result.reason}`,
    result.votes
  );

  try {
    await window.DetectionLogger.log(text, result);
  } catch (err) {
    console.warn('[PlanWise] Logger failed:', err.message);
  }

  if (result.triggered) {
    const event = window.PlanWiseExtractor.extractEvent(text, settings.contacts, settings.priorityNames || []);
    // Merge priority-name note (set by extractEvent) with pattern-based notes
    const patternNotes = window.PlanWiseExtractor.extractNotes(text);
    event.notes = [event.notes, patternNotes].filter(Boolean).join("; ");
    const pending = await window.PlanWiseStorage.enqueuePendingEvent(event);
    if (!pending) return;

    console.log("[PlanWise] Plan detected and queued:", pending);

    chrome.runtime.sendMessage({
      type: "PLAN_DETECTED",
      payload: {
        id: pending.id,
        event,
        platform: platform.name
      }
    });
  }
}

async function waitForSendButton(selector, buffer) {
  try {
    const sendButton = await window.DOMObserver.waitForElement(selector);
    sendButton.addEventListener("click", () => {
      buffer.flushNow();
    });
  } catch (e) {
    // Not critical - Enter key still works.
  }
}

function watchIncomingMessages(platform, buffer) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        const messageElement = node.matches(platform.messageSelector)
          ? node
          : node.querySelector(platform.messageSelector);

        if (messageElement) {
          const text = messageElement.textContent?.trim();
          if (text) {
            buffer.push(text);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
