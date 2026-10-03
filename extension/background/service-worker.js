// ─────────────────────────────────────────────
// ML OFFSCREEN DOCUMENT
// ─────────────────────────────────────────────
//
// Content scripts can't talk to an offscreen document directly - Chrome
// only allows the extension's own privileged contexts (this service
// worker) to create one and relay messages both ways. MV3 allows only
// one offscreen document per extension at a time, and WhatsApp/Telegram/
// Gmail tabs can all be open simultaneously, so creation must be
// idempotent and race-safe rather than "create on first message."
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["WORKERS"],
    justification: "Runs on-device ONNX text classification for plan detection.",
  });

  try {
    await creatingOffscreen;
    // createDocument() resolving only means the document was created, NOT
    // that its module script has finished loading and registered its
    // onMessage listener - sending real work immediately after is a race
    // that fails with "Could not establish connection" (confirmed by
    // hitting this exact race in manual testing). Poll with a lightweight
    // ping until the listener actually answers.
    await waitForOffscreenReady();
  } finally {
    creatingOffscreen = null;
  }
}

async function waitForOffscreenReady(maxAttempts = 40, delayMs = 50) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await chrome.runtime.sendMessage({ type: "OFFSCREEN_ML_PING" });
      return;
    } catch (_err) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Offscreen document did not become ready in time");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ML_CLASSIFY") {
    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({ type: "OFFSCREEN_ML_CLASSIFY", text: message.text, labels: message.labels }))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response - keep the channel open
  }

  if (message.type === "PLAN_DETECTED") {
    console.log("[PlanWise] Plan queued:", message.payload, "from", sender.tab?.url);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#a29bfe" });
    sendResponse({ received: true });
    return;
  }

  if (message.type === "BADGE_CLEAR") {
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ received: true });
    return;
  }

  // Dashboard page relays event_shared notifications here for OS alert
  if (message.type === "SHOW_NOTIF") {
    chrome.notifications.create({
      type:    "basic",
      iconUrl: "assets/icon-48.png",
      title:   message.title   || "PlanWise",
      message: message.message || "",
    });
    sendResponse({ received: true });
  }
});

console.log("[PlanWise] Service worker started.");
