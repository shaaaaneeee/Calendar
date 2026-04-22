/**
 * PlanWise Popup
 *
 * Presents pending events and lets user Add or Dismiss.
 */

const Storage = window.PlanWiseStorage;
let currentEvent = null;

async function init() {
  const pending = await Storage.getPendingEvents();
  hide("loading");

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

  el("source-text").textContent = `"${event.sourceText || ""}"`;
  el("field-title").value = event.title || "";
  el("field-date").value = event.date || "";
  el("field-time").value = event.time || "";
  el("field-participants").value = event.participants?.join(", ") || "";
  el("field-notes").value = event.notes || "";

  el("queue-info").textContent =
    totalPending > 1 ? `${totalPending - 1} more plan${totalPending - 1 > 1 ? "s" : ""} waiting` : "";
}

async function handleYes() {
  if (!currentEvent) return;

  const confirmed = {
    ...currentEvent,
    title: el("field-title").value.trim(),
    date: el("field-date").value,
    time: el("field-time").value,
    participants: el("field-participants")
      .value.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    notes: el("field-notes").value.trim()
  };

  await Storage.saveConfirmedEvent(confirmed);
  await Storage.removePendingEvent(currentEvent.id);
  await reloadOrClose();
}

async function handleNo() {
  if (!currentEvent) return;
  await Storage.removePendingEvent(currentEvent.id);
  await reloadOrClose();
}

async function reloadOrClose() {
  const remaining = await Storage.getPendingEvents();

  if (remaining.length > 0) {
    currentEvent = remaining[0];
    renderEvent(currentEvent, remaining.length);
  } else {
    hide("event-card");
    show("empty");
    clearBadge();
  }
}

function clearBadge() {
  chrome.runtime.sendMessage({ type: "BADGE_CLEAR" });
}

function el(id) {
  return document.getElementById(id);
}

function show(id) {
  el(id).classList.remove("hidden");
}

function hide(id) {
  el(id).classList.add("hidden");
}

document.getElementById("btn-yes").addEventListener("click", handleYes);
document.getElementById("btn-no").addEventListener("click", handleNo);

init();
