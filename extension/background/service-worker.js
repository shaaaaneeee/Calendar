chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PLAN_DETECTED") {
    console.log("[PlanWise] Plan queued:", message.payload, "from", sender.tab?.url);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#a29bfe" });
    sendResponse({ received: true });
  }

  if (message.type === "BADGE_CLEAR") {
    chrome.action.setBadgeText({ text: "" });
  }

  return true;
});

console.log("[PlanWise] Service worker started.");
