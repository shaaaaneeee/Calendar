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
        setTimeout(() => reject(new Error("timeout")), 3000)
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
    setAuthError("✓ Check your email to confirm your account, then sign in.");
  } catch (err) {
    setAuthError(err.message);
  } finally {
    el("btn-signup").textContent = "Sign up";
    el("btn-signup").disabled    = false;
  }
}

function setAuthError(msg) {
  el("auth-error").textContent = msg;
  msg ? show("auth-error") : hide("auth-error");
}


// ─────────────────────────────────────────────
// EVENT QUEUE
// ─────────────────────────────────────────────

async function showQueue() {
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

async function handleNo() {
  if (!currentEvent) return;
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

init();
