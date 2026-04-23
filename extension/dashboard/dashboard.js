/**
 * PlanWise Calendar Dashboard
 *
 * Views: Month, Week
 * Features: navigate months/weeks, click day to see events,
 *           click event to edit or delete.
 *
 * Data source: Supabase (via SupabaseClient.events.getAll())
 * Falls back to chrome.storage.local confirmed events if not logged in.
 */

const Auth = window.SupabaseClient.auth;
const Events = window.SupabaseClient.events;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let allEvents = []; // All loaded events
let currentDate = new Date(); // Drives which month/week is shown
let currentView = "month"; // 'month' | 'week'
let selectedDay = null; // Currently open day panel date string 'YYYY-MM-DD'
let editingEvent = null; // Event currently open in modal


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  updateTodayDisplay();
  await loadEvents();
  render();
  renderUpcoming();
  wireControls();
}


// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────

async function loadEvents() {
  try {
    const user = await Auth.getUser();
    if (user) {
      allEvents = await Events.getAll();
    } else {
      // Not logged in - fall back to local confirmed events
      const result = await chrome.storage.local.get("confirmedEvents");
      allEvents = result.confirmedEvents || [];
    }
  } catch (err) {
    console.warn("[PlanWise] Failed to load events:", err.message);
    allEvents = [];
  }
}


/**
 * Map events to a lookup object keyed by 'YYYY-MM-DD' for fast calendar rendering.
 * Handles both Supabase column names (event_date) and local storage names (date).
 */
function buildDateMap(events) {
  const map = {};
  for (const event of events) {
    const dateKey = event.event_date || event.date;
    if (!dateKey) continue;
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push(event);
  }
  return map;
}


// ─────────────────────────────────────────────
// RENDER ROUTER
// ─────────────────────────────────────────────

function render() {
  if (currentView === "month") renderMonth();
  else renderWeek();
}


// ─────────────────────────────────────────────
// MONTH VIEW
// ─────────────────────────────────────────────

function renderMonth() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  el("cal-title").textContent = currentDate.toLocaleDateString("en-US", {
    month: "long", year: "numeric"
  });

  const dateMap = buildDateMap(allEvents);
  const today = toDateString(new Date());
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const grid = document.createElement("div");
  grid.className = "month-grid";

  // Day name headers
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const name of DAY_NAMES) {
    const cell = document.createElement("div");
    cell.className = "month-day-name";
    cell.textContent = name;
    grid.appendChild(cell);
  }

  // Leading cells from previous month
  for (let i = 0; i < firstDay; i++) {
    const cell = makeMonthCell(
      year, month - 1, daysInPrev - firstDay + i + 1,
      dateMap, today, true
    );
    grid.appendChild(cell);
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = makeMonthCell(year, month, d, dateMap, today, false);
    grid.appendChild(cell);
  }

  // Trailing cells to fill the grid to a multiple of 7
  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= trailing; d++) {
    const cell = makeMonthCell(year, month + 1, d, dateMap, today, true);
    grid.appendChild(cell);
  }

  const container = el("calendar-grid");
  container.innerHTML = "";
  container.appendChild(grid);
}


function makeMonthCell(year, month, day, dateMap, today, isOtherMonth) {
  // Normalise month overflow (JS Date handles it)
  const cellDate = new Date(year, month, day);
  const dateKey = toDateString(cellDate);
  const events = dateMap[dateKey] || [];

  const cell = document.createElement("div");
  cell.className = "month-cell" +
    (isOtherMonth ? " other-month" : "") +
    (dateKey === today ? " today" : "");

  // Day number
  const num = document.createElement("div");
  num.className = "day-number";
  num.textContent = day;
  cell.appendChild(num);

  // Event pills (max 3 visible)
  const visible = events.slice(0, 3);
  for (const event of visible) {
    const pill = document.createElement("div");
    pill.className = "event-pill";
    pill.textContent = event.title || event.title || "Plan";
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal(event);
    });
    cell.appendChild(pill);
  }

  if (events.length > 3) {
    const more = document.createElement("div");
    more.className = "event-pill";
    more.textContent = `+${events.length - 3} more`;
    more.style.background = "transparent";
    more.style.color = "var(--text-muted)";
    cell.appendChild(more);
  }

  // Click cell to open day panel
  cell.addEventListener("click", () => openDayPanel(dateKey, events));

  return cell;
}


// ─────────────────────────────────────────────
// WEEK VIEW
// ─────────────────────────────────────────────

function renderWeek() {
  // Find the Sunday of the current week
  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDate.getDay());

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  el("cal-title").textContent =
    weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " - " +
    weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const dateMap = buildDateMap(allEvents);
  const today = toDateString(new Date());

  const grid = document.createElement("div");
  grid.className = "week-grid";

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dateKey = toDateString(day);
    const events = dateMap[dateKey] || [];

    const cell = document.createElement("div");
    cell.className = "week-cell" + (dateKey === today ? " today" : "");

    const header = document.createElement("div");
    header.className = "week-cell-header";
    header.textContent = DAY_NAMES[i];

    const dateNum = document.createElement("div");
    dateNum.className = "week-cell-date";
    dateNum.textContent = day.getDate();

    cell.appendChild(header);
    cell.appendChild(dateNum);

    for (const event of events) {
      const pill = document.createElement("div");
      pill.className = "event-pill";
      pill.textContent = formatTime(event.event_time || event.time)
        ? `${formatTime(event.event_time || event.time)} ${event.title}`
        : event.title;
      pill.addEventListener("click", () => openModal(event));
      cell.appendChild(pill);
    }

    cell.addEventListener("click", () => openDayPanel(dateKey, events));
    grid.appendChild(cell);
  }

  const container = el("calendar-grid");
  container.innerHTML = "";
  container.appendChild(grid);
}


// ─────────────────────────────────────────────
// DAY PANEL
// ─────────────────────────────────────────────

function openDayPanel(dateKey, events) {
  selectedDay = dateKey;

  const date = new Date(dateKey + "T00:00:00");
  el("day-panel-title").textContent = date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric"
  });

  const container = el("day-panel-events");
  container.innerHTML = "";

  if (events.length === 0) {
    const empty = document.createElement("p");
    empty.className = "day-empty";
    empty.textContent = "No plans this day.";
    container.appendChild(empty);
  } else {
    for (const event of events) {
      const card = document.createElement("div");
      card.className = "day-event-card";

      const title = document.createElement("div");
      title.className = "day-event-title";
      title.textContent = event.title;

      const time = document.createElement("div");
      time.className = "day-event-time";
      time.textContent = formatTime(event.event_time || event.time) || "No time set";

      const people = document.createElement("div");
      people.className = "day-event-people";
      const participants = event.participants || [];
      people.textContent = participants.length > 0
        ? `With: ${participants.join(", ")}`
        : "";

      card.appendChild(title);
      card.appendChild(time);
      if (participants.length > 0) card.appendChild(people);

      card.addEventListener("click", () => openModal(event));
      container.appendChild(card);
    }
  }

  show("day-panel");
}

function closeDayPanel() {
  hide("day-panel");
  selectedDay = null;
}


// ─────────────────────────────────────────────
// MODAL (EDIT / DELETE)
// ─────────────────────────────────────────────

function openModal(event) {
  editingEvent = event;

  el("modal-field-title").value = event.title || "";
  el("modal-field-date").value = event.event_date || event.date || "";
  el("modal-field-time").value = event.event_time || event.time || "";
  el("modal-field-participants").value = (event.participants || []).join(", ");
  el("modal-field-notes").value = event.notes || "";

  const sourceText = event.source_text || event.sourceText || "";
  if (sourceText) {
    el("modal-source").textContent = `"${sourceText}"`;
    el("modal-source").classList.add("visible");
  } else {
    el("modal-source").classList.remove("visible");
  }

  show("modal-overlay");
}

function closeModal() {
  hide("modal-overlay");
  editingEvent = null;
}

async function handleModalSave() {
  if (!editingEvent) return;

  const updates = {
    title: el("modal-field-title").value.trim(),
    date: el("modal-field-date").value,
    time: el("modal-field-time").value,
    participants: el("modal-field-participants").value
      .split(",").map((s) => s.trim()).filter(Boolean),
    notes: el("modal-field-notes").value.trim(),
  };

  try {
    await Events.update(editingEvent.id, updates);
  } catch (err) {
    console.warn("[PlanWise] Update failed:", err.message);
  }

  closeModal();
  await loadEvents();
  render();
  renderUpcoming();

  // Refresh day panel if it's open
  if (selectedDay) {
    const dateMap = buildDateMap(allEvents);
    openDayPanel(selectedDay, dateMap[selectedDay] || []);
  }
}

async function handleModalDelete() {
  if (!editingEvent) return;

  const confirmed = window.confirm(
    `Delete "${editingEvent.title}"? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    await Events.delete(editingEvent.id);
  } catch (err) {
    console.warn("[PlanWise] Delete failed:", err.message);
  }

  closeModal();
  closeDayPanel();
  await loadEvents();
  render();
  renderUpcoming();
}


// ─────────────────────────────────────────────
// SIDEBAR - UPCOMING EVENTS
// ─────────────────────────────────────────────

function renderUpcoming() {
  const today = toDateString(new Date());
  const upcoming = allEvents
    .filter((e) => (e.event_date || e.date) >= today)
    .slice(0, 8);

  const container = el("upcoming-list");
  container.innerHTML = "";

  if (upcoming.length === 0) {
    const empty = document.createElement("p");
    empty.className = "upcoming-empty";
    empty.textContent = "No upcoming plans.";
    container.appendChild(empty);
    return;
  }

  for (const event of upcoming) {
    const item = document.createElement("div");
    item.className = "upcoming-item";

    const title = document.createElement("div");
    title.className = "upcoming-item-title";
    title.textContent = event.title;

    const date = document.createElement("div");
    date.className = "upcoming-item-date";
    const dateKey = event.event_date || event.date;
    date.textContent = dateKey
      ? new Date(dateKey + "T00:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric"
      })
      : "No date";

    item.appendChild(title);
    item.appendChild(date);
    item.addEventListener("click", () => openModal(event));
    container.appendChild(item);
  }
}


// ─────────────────────────────────────────────
// CONTROLS
// ─────────────────────────────────────────────

function wireControls() {
  el("btn-prev").addEventListener("click", () => {
    if (currentView === "month") {
      currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
      currentDate.setDate(currentDate.getDate() - 7);
    }
    render();
  });

  el("btn-next").addEventListener("click", () => {
    if (currentView === "month") {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 7);
    }
    render();
  });

  el("view-month").addEventListener("click", () => {
    currentView = "month";
    el("view-month").classList.add("active");
    el("view-week").classList.remove("active");
    render();
  });

  el("view-week").addEventListener("click", () => {
    currentView = "week";
    el("view-week").classList.add("active");
    el("view-month").classList.remove("active");
    render();
  });

  el("day-panel-close").addEventListener("click", closeDayPanel);
  el("modal-close").addEventListener("click", closeModal);
  el("modal-cancel").addEventListener("click", closeModal);
  el("modal-save").addEventListener("click", handleModalSave);
  el("modal-delete").addEventListener("click", handleModalDelete);

  el("modal-overlay").addEventListener("click", (e) => {
    if (e.target === el("modal-overlay")) closeModal();
  });
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function updateTodayDisplay() {
  el("today-display").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric"
  });
}

function toDateString(date) {
  return date.toISOString().split("T")[0];
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function el(id) { return document.getElementById(id); }
function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }


// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

init();
