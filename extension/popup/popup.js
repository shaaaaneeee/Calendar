/**
 * PlanWise Popup — Phase 3
 *
 * Flow:
 *   1. Check if user is logged in via Supabase session
 *   2. If not → show auth screen
 *   3. If yes → show pending event queue
 *
 * On Add:     saves to Supabase, falls back to local if Supabase fails,
 *             then removes from pending queue
 * On Dismiss: removes from pending queue, nothing saved
 */

const PlanStorage = window.PlanWiseStorage;
const Auth    = window.SupabaseClient.auth;
const Events  = window.SupabaseClient.events;

let currentEvent = null;
let overrideOverlap = false;


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  try {
    // Race the session check against a timeout.
    // If Supabase hangs, we fall through to the auth screen rather
    // than showing "Loading..." forever.
    const user = await Promise.race([
      Auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000)
      )
    ]);

    hide("loading");

    if (!user) {
      showAuthScreen();
      return;
    }

    await showQueue();
  } catch (err) {
    hide("loading");

    if (err.message === "timeout") {
      console.warn("[PlanWise] Session check timed out - showing auth screen.");
    } else {
      console.warn("[PlanWise] Session check failed:", err.message);
    }

    showAuthScreen();
  }
}


// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

function showAuthScreen() {
  show("auth-screen");
  el("header-subtitle").textContent = "Sign in";
}

async function handleSignIn() {
  const email    = el("auth-email").value.trim();
  const password = el("auth-password").value;

  if (!email || !password) {
    setAuthError("Please enter your email and password.");
    return;
  }

  try {
    setAuthError("");
    el("btn-signin").textContent = "Signing in...";
    el("btn-signin").disabled    = true;

    await Auth.signIn(email, password);

    hide("auth-screen");
    el("header-subtitle").textContent = "Plan detected";
    await showQueue();
  } catch (err) {
    setAuthError(err.message);
  } finally {
    el("btn-signin").textContent = "Sign in";
    el("btn-signin").disabled    = false;
  }
}

async function handleSignUp() {
  const email    = el("auth-email").value.trim();
  const password = el("auth-password").value;

  if (!email || !password) {
    setAuthError("Please enter your email and password.");
    return;
  }

  if (password.length < 6) {
    setAuthError("Password must be at least 6 characters.");
    return;
  }

  try {
    setAuthError("");
    el("btn-signup").textContent = "Signing up...";
    el("btn-signup").disabled    = true;

    await Auth.signUp(email, password);
    setAuthSuccess("✓ Check your email to confirm your account, then sign in.");
  } catch (err) {
    setAuthError(err.message);
  } finally {
    el("btn-signup").textContent = "Sign up";
    el("btn-signup").disabled    = false;
  }
}

function setAuthError(msg) {
  const p = el("auth-error");
  p.classList.add("text-error");
  p.classList.remove("text-status-ok");
  p.textContent = msg;
  msg ? show("auth-error") : hide("auth-error");
}

function setAuthSuccess(msg) {
  const p = el("auth-error");
  p.classList.remove("text-error");
  p.classList.add("text-status-ok");
  p.textContent = msg;
  show("auth-error");
}


// ─────────────────────────────────────────────
// EVENT QUEUE
// ─────────────────────────────────────────────

async function showQueue() {
  show("btn-tasks");
  show("footer-sep");
  show("btn-settings");
  show("footer-sep-settings");
  show("footer-sep-training");
  show("btn-training");

  const pending = await PlanStorage.getPendingEvents();

  if (pending.length === 0) {
    show("empty");
    clearBadge();
    return;
  }

  currentEvent = pending[0];
  renderEvent(currentEvent, pending.length);
}

function renderEvent(event, totalPending) {
  show("event-card");
  hide("empty");

  el("source-text").textContent      = `"${event.sourceText || ""}"`;
  el("field-title").value            = event.title || "";
  el("field-date").value             = event.date || "";
  el("field-time").value             = event.time || "";
  el("field-participants").value     = event.participants?.join(", ") || "";
  el("field-notes").value            = event.notes || "";

  el("queue-info").textContent = totalPending > 1
    ? `${totalPending - 1} more plan${totalPending - 1 > 1 ? "s" : ""} waiting`
    : "";
}


// ─────────────────────────────────────────────
// YES / NO
// ─────────────────────────────────────────────

async function handleYes() {
  if (!currentEvent) return;

  const confirmed = {
    ...currentEvent,
    title:        el("field-title").value.trim(),
    date:         el("field-date").value,
    time:         el("field-time").value,
    participants: el("field-participants").value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    notes:        el("field-notes").value.trim(),
  };

  if (!overrideOverlap) {
    const conflicts = await checkOverlap(confirmed);
    if (conflicts.length) {
      showOverlapWarning(conflicts);
      overrideOverlap = true;
      return;
    }
  }
  overrideOverlap = false;
  hideOverlapWarning();

  try {
    await Events.save(confirmed);
  } catch (err) {
    // Supabase failed — save locally so the event isn't lost
    console.warn("[PlanWise] Supabase save failed, saving locally:", err.message);
    await PlanStorage.saveConfirmedEvent(confirmed);
  }

  await PlanStorage.removePendingEvent(currentEvent.id);
  await reloadOrClose();
}

async function checkOverlap(newEvent) {
  if (!newEvent.date) return [];

  const ONE_HOUR = 60 * 60 * 1000;
  const newStart = newEvent.time ? new Date(`${newEvent.date}T${newEvent.time}`) : null;

  let allEvents = [];
  try {
    allEvents = await Events.getAll();
  } catch (e) {
    allEvents = await PlanStorage.getConfirmedEvents();
  }

  const conflicts = [];
  for (const existing of allEvents) {
    const existDate = existing.event_date || existing.date;
    const existTime = existing.event_time || existing.time;
    if (!existDate) continue;

    if (newStart && existTime) {
      // Both events have times — check within-hour overlap
      const existStart = new Date(`${existDate}T${existTime}`);
      if (Math.abs(newStart - existStart) < ONE_HOUR) {
        conflicts.push(existing);
      }
    } else if (!newStart && !existTime && existDate === newEvent.date) {
      // Neither event has a time — same date = conflict
      conflicts.push(existing);
    }
  }
  return conflicts;
}

function showOverlapWarning(conflicts) {
  const lines = conflicts.map((conflict) => {
    const title = conflict.title || "another plan";
    const date  = conflict.event_date || conflict.date || "";
    const time  = conflict.event_time || conflict.time || "";
    const when  = date && time ? ` on ${date} at ${time}` : date ? ` on ${date}` : "";
    return `"${title}"${when}`;
  });
  const summary = lines.length === 1
    ? `You already have ${lines[0]} within the hour.`
    : `Conflicts with: ${lines.join(", ")}.`;
  el("overlap-warning").textContent = `${summary} Add anyway?`;
  show("overlap-warning");
  el("btn-yes").textContent = "Add anyway";
}

function hideOverlapWarning() {
  hide("overlap-warning");
  el("btn-yes").textContent = "Add";
}

async function handleNo() {
  if (!currentEvent) return;
  overrideOverlap = false;
  hideOverlapWarning();
  await PlanStorage.removePendingEvent(currentEvent.id);
  await reloadOrClose();
}

async function reloadOrClose() {
  const remaining = await PlanStorage.getPendingEvents();

  if (remaining.length > 0) {
    currentEvent = remaining[0];
    renderEvent(currentEvent, remaining.length);
  } else {
    hide("event-card");
    show("empty");
    clearBadge();
  }
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function clearBadge() {
  chrome.runtime.sendMessage({ type: "BADGE_CLEAR" });
}

function el(id)   { return document.getElementById(id); }
function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }


// ─────────────────────────────────────────────
// WIRE UP
// ─────────────────────────────────────────────

el("btn-signin").addEventListener("click", handleSignIn);
el("btn-signup").addEventListener("click", handleSignUp);
el("btn-yes").addEventListener("click", handleYes);
el("btn-no").addEventListener("click", handleNo);
el("btn-dashboard").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});
el("btn-settings").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
});
el("btn-tasks").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("tasks/tasks.html") });
});
el("btn-training").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("training/training.html") });
});

init();
