/**
 * PlanWise ML Client
 *
 * Content-script-side wrapper around the ML_CLASSIFY message relay
 * (content script -> background service worker -> offscreen document).
 * Every call has an explicit timeout so a stuck/slow model never hangs
 * the content script - callers must fail open (fall back to the legacy
 * rule engine) rather than drop a real plan on a timeout.
 */

const ML_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ML call timed out")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function classify(text, labels) {
  const response = await withTimeout(
    chrome.runtime.sendMessage({ type: "ML_CLASSIFY", text, labels }),
    ML_TIMEOUT_MS
  );
  if (!response || !response.ok) {
    throw new Error(response?.error || "ML_CLASSIFY failed with no error detail");
  }
  return response.result;
}

async function ping() {
  return chrome.runtime.sendMessage({ type: "ML_PING" });
}

if (typeof window !== "undefined") {
  window.PlanWiseML = { classify, ping };
}
