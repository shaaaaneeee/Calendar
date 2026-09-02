/**
 * PlanWise DOM Helpers
 *
 * Small helpers shared by the extension's own pages (popup, dashboard,
 * settings, tasks, signup). Pure functions only - safe to load early,
 * nothing here touches the DOM until called.
 *
 * Not used by the detection engine / content scripts - those stay
 * standalone by design (see extension/detection/extractor.js).
 */

function el(id) { return document.getElementById(id); }
function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }

function toDateString(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day   = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Requires #toast / #toast-msg elements in the page's HTML (dashboard, settings).
let _toastTimer = null;

function showToast(msg, type = "error") {
  const toast = el("toast");
  const msgEl = el("toast-msg");
  msgEl.textContent = msg;
  toast.classList.toggle("bg-error-bg",    type === "error");
  toast.classList.toggle("border-error",   type === "error");
  toast.classList.toggle("bg-surface",     type !== "error");
  toast.classList.toggle("border-outline", type !== "error");
  msgEl.classList.toggle("text-error",      type === "error");
  msgEl.classList.toggle("text-on-surface", type !== "error");
  toast.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}
