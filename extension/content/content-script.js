/**
 * PlanWise Content Script orchestrator.
 */

(async function init() {
  console.log("[PlanWise] Content script loaded on:", window.location.hostname);

  const platform = window.DOMObserver.detectPlatform();
  if (!platform) {
    console.log("[PlanWise] Platform not recognized. Exiting.");
    return;
  }
  console.log("[PlanWise] Detected platform:", platform.name);

  let inputElement;
  try {
    inputElement = await window.DOMObserver.waitForElement(platform.inputSelector);
    console.log("[PlanWise] Input element found.");
  } catch (err) {
    console.warn("[PlanWise] Could not find input element:", err.message);
    return;
  }

  const buffer = new window.TextBuffer({
    maxLength: 500,
    debounceMs: 1500,
    onFlush: (text) => {
      analyzeText(text, platform).catch((error) => {
        console.warn("[PlanWise] analyzeText failed:", error);
      });
    }
  });

  inputElement.addEventListener("input", () => {
    const text = inputElement.textContent || inputElement.value || "";
    buffer.push(text);
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
})();

async function analyzeText(text, platform) {
  const result = window.PlanWiseEngine.analyzeIntent(text);

  console.log(
    `[PlanWise] Score: ${result.score} | Intent: ${result.intent} | Reason: ${result.reason}`,
    result.votes
  );

  if (result.triggered) {
    const settings = await window.PlanWiseStorage.getSettings();
    const event = window.PlanWiseExtractor.extractEvent(text, settings.contacts);
    const pending = await window.PlanWiseStorage.enqueuePendingEvent(event);

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
    // Button not required on every platform.
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
