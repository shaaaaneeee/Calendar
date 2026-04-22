/**
 * PlanWise Background Service Worker
 *
 * This script runs persistently in the background.
 * It receives detected plans from content scripts and
 * will eventually trigger the Yes/Edit/No popup.
 *
 * For now: it just logs detections so we can verify the pipeline works.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PLAN_DETECTED") {
    console.log("[PlanWise] Plan detected in tab:", sender.tab?.url);
    console.log("[PlanWise] Detection data:", message.payload);

    // Phase 2: this is where we'll trigger the popup
    sendResponse({ received: true });
  }

  if (message.type === "DEBUG_LOG") {
    console.log("[PlanWise Debug]", message.payload);
  }

  // Keep true for possible async responses in future.
  return true;
});

console.log("[PlanWise] Service worker started.");
