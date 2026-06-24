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
const Groups = window.SupabaseClient.groups;
const Social = window.SupabaseClient.social;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let allEvents = []; // All loaded events
let deadlineEvents = []; // Deadline pseudo-events from tasks
let currentDate = new Date(); // Drives which month/week is shown
let currentView = "month"; // 'month' | 'week'
let selectedDay = null; // Currently open day panel date string 'YYYY-MM-DD'
let editingEvent = null; // Event currently open in modal
let calGroups = []; // Cached groups for filter + share UI
let hiddenGroups = new Set(); // Group IDs currently filtered out
let activeCommentsChannel = null; // Realtime channel for live comments


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  updateTodayDisplay();
  await loadEvents();
  render();
  renderUpcoming();
  wireControls();
  loadGroupsFilter();
  initNotifFeed();
  loadUserInitials();
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

  // Merge in task deadlines as pseudo-events
  try {
    const result = await chrome.storage.local.get("planwiseTasks");
    const tasks = result.planwiseTasks || [];
    deadlineEvents = tasks
      .filter(t => t.date)
      .map(t => ({
        id:            `deadline-${t.id}`,
        title:         t.title,
        event_date:    t.date,
        _isDeadline:   true,
        group_id:      "deadlines",
        group_colour:  "#FF4D00",
      }));
    allEvents = [...allEvents, ...deadlineEvents];
  } catch (_) {
    deadlineEvents = [];
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
  applyGroupFilter();
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

  if (typeof anime !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    anime({
      targets: ".month-cell",
      opacity: [0, 1],
      translateY: [6, 0],
      delay: anime.stagger(12, { start: 40 }),
      duration: 280,
      easing: "easeOutQuart"
    });
  }
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
    pill.textContent = event.title || "Plan";
    if (event.group_id) {
      pill.dataset.groupId = event.group_id;
      pill.style.borderLeft = `3px solid ${event.group_colour || "transparent"}`;
    }
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!event._isDeadline) openModal(event);
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
      if (event.group_id) {
        pill.dataset.groupId = event.group_id;
        pill.style.borderLeft = `3px solid ${event.group_colour || "transparent"}`;
      }
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!event._isDeadline) openModal(event);
      });
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

      if (event._isDeadline) {
        const badge = document.createElement("span");
        badge.className = "ml-1 font-mono text-[8px] font-bold tracking-wider";
        badge.style.color = "#FF4D00";
        badge.textContent = " DEADLINE";
        title.appendChild(badge);
      }

      const time = document.createElement("div");
      time.className = "day-event-time";
      time.textContent = event._isDeadline
        ? "Task deadline"
        : (formatTime(event.event_time || event.time) || "No time set");

      const people = document.createElement("div");
      people.className = "day-event-people";
      const participants = event.participants || [];
      people.textContent = participants.length > 0
        ? `With: ${participants.join(", ")}`
        : "";

      card.appendChild(title);
      card.appendChild(time);
      if (participants.length > 0) card.appendChild(people);

      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("label")) return;
        if (!event._isDeadline) openModal(event);
      });

      // Share button + section (only for real Supabase events)
      if (event.id && !event._isDeadline && calGroups.length > 0) {
        const shareBtn = document.createElement("button");
        shareBtn.className = "mt-2 font-mono text-[9px] tracking-wider uppercase text-on-muted hover:text-on-surface hover:underline";
        shareBtn.textContent = "Share →";

        const shareSection = document.createElement("div");
        shareSection.className = "share-section hidden";

        shareBtn.addEventListener("click", async () => {
          if (shareSection.classList.toggle("hidden")) return;
          await renderShareSection(event, shareSection);
        });

        card.appendChild(shareBtn);
        card.appendChild(shareSection);
      }

      // RSVP & Comments button (only for real Supabase events)
      if (event.id && !event._isDeadline) {
        const detailsBtn = document.createElement("button");
        detailsBtn.className = "mt-2 font-mono text-[9px] tracking-wider uppercase text-on-muted hover:text-on-surface hover:underline";
        detailsBtn.textContent = "RSVP & Comments →";
        const socialContainer = document.createElement("div");

        detailsBtn.addEventListener("click", async () => {
          const isOpen = socialContainer.children.length > 0;
          if (isOpen) {
            socialContainer.innerHTML = "";
            if (activeCommentsChannel) { activeCommentsChannel.unsubscribe(); activeCommentsChannel = null; }
            return;
          }
          await renderSharedEventPanel(event, socialContainer);
        });

        card.appendChild(detailsBtn);
        card.appendChild(socialContainer);
      }

      container.appendChild(card);
    }
  }

  show("day-panel");
}

function closeDayPanel() {
  if (activeCommentsChannel) { activeCommentsChannel.unsubscribe(); activeCommentsChannel = null; }
  hide("day-panel");
  selectedDay = null;
}


// ─────────────────────────────────────────────
// MODAL (EDIT / DELETE)
// ─────────────────────────────────────────────

function openModal(event) {
  editingEvent = event;

  const labelEl = document.querySelector("#modal .modal-label");

  // Group selector: visible in create mode only (edit uses day-panel Share button)
  const groupRow = el("modal-group-row");
  const groupsContainer = el("modal-field-groups");
  groupsContainer.innerHTML = "";

  if (!event && calGroups.length > 0) {
    for (const g of calGroups) {
      const lbl = document.createElement("label");
      lbl.className = "flex items-center gap-2 cursor-pointer text-sm py-0.5";
      lbl.innerHTML = `
        <input type="checkbox" data-group-id="${g.id}" class="modal-group-cb w-3 h-3 cursor-pointer" />
        <span class="w-2 h-2 flex-shrink-0" style="background:${g.colour}"></span>
        <span class="text-on-surface">${g.name}</span>
      `;
      groupsContainer.appendChild(lbl);
    }
    groupRow.classList.remove("hidden");
    groupRow.classList.add("flex");
  } else {
    groupRow.classList.add("hidden");
    groupRow.classList.remove("flex");
  }

  if (!event) {
    // Create mode
    if (labelEl) labelEl.textContent = "ADD EVENT";
    el("modal-field-title").value        = "";
    el("modal-field-date").value         = selectedDay || "";
    el("modal-field-time").value         = "";
    el("modal-field-participants").value = "";
    el("modal-field-notes").value        = "";
    el("modal-source").classList.remove("visible");
    hide("modal-delete");
  } else {
    // Edit mode
    if (labelEl) labelEl.textContent = "EDIT EVENT";
    el("modal-field-title").value        = event.title || "";
    el("modal-field-date").value         = event.event_date || event.date || "";
    el("modal-field-time").value         = event.event_time || event.time || "";
    el("modal-field-participants").value = (event.participants || []).join(", ");
    el("modal-field-notes").value        = event.notes || "";

    const sourceText = event.source_text || event.sourceText || "";
    if (sourceText) {
      el("modal-source").textContent = `"${sourceText}"`;
      el("modal-source").classList.add("visible");
    } else {
      el("modal-source").classList.remove("visible");
    }
    show("modal-delete");
  }

  show("modal-overlay");
}

function closeModal() {
  hide("modal-overlay");
  showModalError("");
  editingEvent = null;
}

function showModalError(msg) {
  const errEl = el("modal-error");
  if (!errEl) return;
  errEl.textContent = msg;
  msg ? errEl.classList.remove("hidden") : errEl.classList.add("hidden");
}

async function handleModalSave() {
  const title = el("modal-field-title").value.trim();
  if (!title) { el("modal-field-title").focus(); return; }

  const payload = {
    title,
    date:         el("modal-field-date").value,
    time:         el("modal-field-time").value,
    participants: el("modal-field-participants").value
      .split(",").map((s) => s.trim()).filter(Boolean),
    notes:        el("modal-field-notes").value.trim(),
  };

  try {
    if (editingEvent) {
      await Events.update(editingEvent.id, payload);
    } else {
      const newEvent = await Events.save(payload);
      const selectedGroupIds = Array.from(
        document.querySelectorAll(".modal-group-cb:checked")
      ).map(cb => cb.dataset.groupId);
      if (selectedGroupIds.length > 0 && newEvent?.id) {
        await Social.shareEvent(newEvent.id, selectedGroupIds);
      }
    }
    closeModal();
    await loadEvents();
    render();
    renderUpcoming();
    if (selectedDay) {
      const dateMap = buildDateMap(allEvents);
      openDayPanel(selectedDay, dateMap[selectedDay] || []);
    }
  } catch (err) {
    console.warn("[PlanWise] Save failed:", err.message);
    showModalError("Save failed — " + err.message);
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
    closeModal();
    closeDayPanel();
    await loadEvents();
    render();
    renderUpcoming();
  } catch (err) {
    console.warn("[PlanWise] Delete failed:", err.message);
    alert("Delete failed: " + err.message);
  }
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
    item.addEventListener("click", () => { if (!event._isDeadline) openModal(event); });
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
    if (currentView === "month") return;
    currentView = "month";
    el("view-month").classList.add("active");
    el("view-week").classList.remove("active");
    render();
  });

  el("view-week").addEventListener("click", () => {
    if (currentView === "week") return;
    currentView = "week";
    el("view-week").classList.add("active");
    el("view-month").classList.remove("active");
    render();
  });

  el("btn-add-event").addEventListener("click", () => openModal(null));

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
// USER INITIALS
// ─────────────────────────────────────────────

async function loadUserInitials() {
  try {
    const user = await Auth.getUser();
    if (!user) return;
    const email = user.email || "";
    const initials = email.split("@")[0].slice(0, 2).toUpperCase();
    const el2 = el("user-initials");
    if (el2) el2.textContent = initials;
  } catch (_) {}
}


// ─────────────────────────────────────────────
// GROUPS FILTER
// ─────────────────────────────────────────────

async function loadGroupsFilter() {
  try {
    calGroups = await Groups.listGroups();
  } catch (_) {
    calGroups = [];
  }
  renderGroupsFilter();
}

function renderGroupsFilter() {
  const container = el("groups-filter");
  if (!container) return;

  const hasDeadlines = deadlineEvents.length > 0;
  if (!calGroups.length && !hasDeadlines) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = "";

  const label = document.createElement("div");
  label.className = "groups-filter-label";
  label.textContent = "Categories";
  container.appendChild(label);

  // Deadlines row
  if (hasDeadlines) {
    const row = document.createElement("label");
    row.className = "group-filter-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.className = "accent-primary";
    cb.addEventListener("change", () => {
      if (cb.checked) hiddenGroups.delete("deadlines");
      else hiddenGroups.add("deadlines");
      applyGroupFilter();
    });

    const dot = document.createElement("span");
    dot.className = "group-filter-dot";
    dot.style.background = "#FF4D00";

    const name = document.createElement("span");
    name.textContent = "Deadlines";

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(name);
    container.appendChild(row);
  }

  for (const g of calGroups) {
    const row = document.createElement("label");
    row.className = "group-filter-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.className = "accent-primary";
    cb.addEventListener("change", () => {
      if (cb.checked) hiddenGroups.delete(g.id);
      else hiddenGroups.add(g.id);
      applyGroupFilter();
    });

    const dot = document.createElement("span");
    dot.className = "group-filter-dot";
    dot.style.background = g.colour;

    const name = document.createElement("span");
    name.textContent = g.name;

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(name);
    container.appendChild(row);
  }
}

function applyGroupFilter() {
  document.querySelectorAll(".event-pill[data-group-id]").forEach(pill => {
    const gid = pill.dataset.groupId;
    pill.style.opacity = hiddenGroups.has(gid) ? "0.15" : "1";
    pill.style.pointerEvents = hiddenGroups.has(gid) ? "none" : "";
  });
}


// ─────────────────────────────────────────────
// SHARE EVENT FLOW
// ─────────────────────────────────────────────

async function renderShareSection(event, container) {
  container.innerHTML = '<div class="text-xs text-on-muted font-mono">Loading groups...</div>';

  let sharedGroupIds = [];
  try {
    sharedGroupIds = await Social.getSharedGroups(event.id);
  } catch (_) {}

  if (!calGroups.length) {
    container.innerHTML = '<div class="text-xs text-on-muted">No groups yet — create one in Settings.</div>';
    return;
  }

  container.innerHTML = "";

  for (const g of calGroups) {
    const alreadyShared = sharedGroupIds.includes(g.id);
    const row = document.createElement("label");
    row.className = "share-group-cb-row";
    row.innerHTML = `
      <input type="checkbox" data-group-id="${g.id}" ${alreadyShared ? "checked disabled" : ""} class="share-cb accent-primary w-3 h-3" />
      <span class="share-group-dot" style="background:${g.colour}"></span>
      <span>${g.name}</span>
      ${alreadyShared ? '<span class="share-already-label">Shared</span>' : ""}
    `;
    container.appendChild(row);
  }

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "mt-3 px-3 py-1.5 bg-primary text-on-primary font-mono text-[9px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none";
  confirmBtn.textContent = "Share";
  confirmBtn.addEventListener("click", () => confirmShare(event, container));
  container.appendChild(confirmBtn);
}

async function confirmShare(event, container) {
  const cbs = container.querySelectorAll(".share-cb:not([disabled]):checked");
  const groupIds = Array.from(cbs).map(cb => cb.dataset.groupId);
  if (!groupIds.length) { alert("Select at least one group."); return; }

  try {
    await Social.shareEvent(event.id, groupIds);
    await renderShareSection(event, container);
    render();
  } catch (e) {
    alert("Share failed: " + e.message);
  }
}


// ─────────────────────────────────────────────
// SHARED EVENT PANEL — RSVP + MEMBERS + COMMENTS
// ─────────────────────────────────────────────

async function renderSharedEventPanel(event, container) {
  container.innerHTML = '<div class="text-xs text-on-muted font-mono mt-3">Loading...</div>';

  if (activeCommentsChannel) { activeCommentsChannel.unsubscribe(); activeCommentsChannel = null; }

  let rsvpData, members, comments;
  try {
    [rsvpData, members, comments] = await Promise.all([
      Social.getRsvpDetails(event.id),
      Social.getEventMembers(event.id),
      Social.getComments(event.id),
    ]);
  } catch (e) {
    container.innerHTML = '<div class="text-xs text-error font-mono mt-3">Failed to load social data.</div>';
    return;
  }

  container.innerHTML = "";

  // ── RSVP bar ──
  const rsvpBar = document.createElement("div");
  rsvpBar.className = "rsvp-bar";
  const statuses = [
    { key: "going", label: "Going" },
    { key: "maybe", label: "Maybe" },
    { key: "cant",  label: "Can't" },
  ];
  const countsEl = document.createElement("div");
  countsEl.className = "rsvp-counts";
  countsEl.textContent = `${rsvpData.counts.going} Going · ${rsvpData.counts.maybe} Maybe · ${rsvpData.counts.cant} Can't`;

  for (const s of statuses) {
    const btn = document.createElement("button");
    btn.className = "rsvp-btn" + (rsvpData.myStatus === s.key ? " selected" : "");
    btn.textContent = s.label;
    btn.addEventListener("click", async () => {
      try {
        await Social.upsertRsvp(event.id, s.key);
        rsvpData.myStatus = s.key;
        rsvpBar.querySelectorAll(".rsvp-btn").forEach((b, i) => {
          b.classList.toggle("selected", statuses[i].key === s.key);
        });
        const fresh = await Social.getRsvpDetails(event.id);
        countsEl.textContent = `${fresh.counts.going} Going · ${fresh.counts.maybe} Maybe · ${fresh.counts.cant} Can't`;
      } catch (err) {
        alert("Could not save RSVP: " + err.message);
      }
    });
    rsvpBar.appendChild(btn);
  }
  container.appendChild(rsvpBar);
  container.appendChild(countsEl);

  // ── Members list ──
  if (members.length) {
    const memberList = document.createElement("div");
    memberList.className = "member-list";
    const memberLabel = document.createElement("div");
    memberLabel.className = "comments-label";
    memberLabel.textContent = "Members";
    memberList.appendChild(memberLabel);

    for (const m of members) {
      const row = document.createElement("div");
      row.className = "member-row";
      const initials2 = m.displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const rsvpLabel = m.rsvpStatus ? m.rsvpStatus.charAt(0).toUpperCase() + m.rsvpStatus.slice(1) : "—";
      row.innerHTML = `
        <div class="comment-avatar">${initials2}</div>
        <span>${m.displayName}</span>
        <span class="member-rsvp">${rsvpLabel}</span>
      `;
      memberList.appendChild(row);
    }
    container.appendChild(memberList);
  }

  // ── Comments ──
  const commentsSection = document.createElement("div");
  commentsSection.className = "comments-section";

  const commentsLabel = document.createElement("div");
  commentsLabel.className = "comments-label";
  commentsLabel.textContent = "Comments";
  commentsSection.appendChild(commentsLabel);

  const commentsList = document.createElement("div");
  commentsList.id = `comments-list-${event.id}`;
  commentsSection.appendChild(commentsList);

  function appendComment(c) {
    const initials3 = (c.profiles?.display_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const time = new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const row = document.createElement("div");
    row.className = "comment-row";
    row.innerHTML = `
      <div class="comment-meta">
        <div class="comment-avatar">${initials3}</div>
        <span>${c.profiles?.display_name || "?"}</span>
        <span>${time}</span>
      </div>
      <div class="comment-body">${c.body.replace(/</g, "&lt;")}</div>
    `;
    commentsList.appendChild(row);
  }

  if (!comments.length) {
    commentsList.innerHTML = '<div class="text-xs text-on-muted font-mono">No comments yet — be the first.</div>';
  } else {
    comments.forEach(appendComment);
  }

  const inputRow = document.createElement("div");
  inputRow.className = "comment-input-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "comment-input";
  input.placeholder = "Add a comment...";
  const sendBtn = document.createElement("button");
  sendBtn.className = "comment-send";
  sendBtn.textContent = "Send";
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  commentsSection.appendChild(inputRow);

  async function sendComment() {
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    try {
      await Social.addComment(event.id, body);
    } catch (e) {
      alert("Could not post comment: " + e.message);
    }
  }
  sendBtn.addEventListener("click", sendComment);
  input.addEventListener("keydown", e => { if (e.key === "Enter") sendComment(); });

  container.appendChild(commentsSection);

  activeCommentsChannel = Social.subscribeComments(event.id, (newComment) => {
    const placeholder = commentsList.querySelector(".text-xs.text-on-muted");
    if (placeholder) placeholder.remove();
    appendComment(newComment);
  });
}


// ─────────────────────────────────────────────
// IN-APP NOTIFICATION FEED
// ─────────────────────────────────────────────

async function initNotifFeed() {
  // Wire the bell unconditionally — it must never be a dead button.
  const bell = el("btn-notifications");
  const panel = el("notif-panel");
  if (bell && panel) {
    bell.addEventListener("click", async () => {
      const isOpen = !panel.classList.contains("hidden");
      if (isOpen) {
        panel.classList.add("hidden");
        return;
      }
      panel.classList.remove("hidden");
      const s = await Auth.getSession().catch(() => null);
      if (!s) {
        el("notif-list").innerHTML =
          '<div class="px-4 py-8 text-center font-mono text-xs text-on-muted tracking-wider">Sign in to view notifications.</div>';
        return;
      }
      await renderNotifFeed();
    });
  }

  const markAllBtn = el("notif-mark-all");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async () => {
      await Social.markAllRead();
      updateNotifBadge();
      await renderNotifFeed();
    });
  }

  // Subscriptions and badge require an active session.
  const session = await Auth.getSession().catch(() => null);
  if (!session) return;

  updateNotifBadge();

  Social.subscribeNotifications(session.user.id, (notif) => {
    updateNotifBadge();
    if (notif.type === "event_shared") {
      const p = notif.payload || {};
      chrome.runtime.sendMessage({
        type:    "SHOW_NOTIF",
        title:   "New shared plan",
        message: `${p.actor_name || "Someone"} shared "${p.preview || "an event"}" to ${p.group_name || "a group"}`,
      }).catch(() => {});
    }
  });
}

async function updateNotifBadge() {
  const badge = el("notif-badge");
  if (!badge) return;
  try {
    const count = await Social.getUnreadCount();
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (_) {
    badge.classList.add("hidden");
  }
}

function formatNotifTime(isoString) {
  const d = new Date(isoString);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return timeStr;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + timeStr;
}

async function renderNotifFeed() {
  const list = el("notif-list");
  if (!list) return;

  list.innerHTML = '<div class="px-4 py-3 font-mono text-xs text-on-muted">Loading...</div>';

  let notifs;
  try {
    notifs = await Social.getNotifications();
  } catch (_) {
    list.innerHTML = '<div class="px-4 py-3 font-mono text-xs text-error">Failed to load.</div>';
    return;
  }

  if (!notifs.length) {
    list.innerHTML = '<div class="px-4 py-8 text-center font-mono text-xs text-on-muted tracking-wider">No notifications yet.</div>';
    return;
  }

  list.innerHTML = "";
  for (const n of notifs) {
    const p = n.payload || {};
    let description = "";
    if (n.type === "event_shared") {
      description = `${p.actor_name || "Someone"} shared "${p.preview || "an event"}" to ${p.group_name || "a group"}`;
    } else if (n.type === "rsvp_updated") {
      description = `${p.actor_name || "Someone"} is ${p.status || "going"} to "${p.preview || "an event"}"`;
    } else if (n.type === "comment_added") {
      description = `${p.actor_name || "Someone"} commented on "${p.preview || "an event"}": "${p.comment || ""}"`;
    }

    const time = formatNotifTime(n.created_at);

    const item = document.createElement("div");
    item.className = `flex items-start gap-3 px-4 py-3 border-b border-outline-soft cursor-pointer hover:bg-surface-low ${n.read ? "opacity-60" : ""}`;
    item.innerHTML = `
      <div class="w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? "bg-transparent" : "bg-primary"}"></div>
      <div class="flex-1 min-w-0">
        <div class="text-xs leading-relaxed">${description}</div>
        <div class="font-mono text-[9px] text-on-muted mt-0.5">${time}</div>
      </div>
    `;
    item.addEventListener("click", async () => {
      if (!n.read) {
        await Social.markRead(n.id);
        n.read = true;
        item.classList.add("opacity-60");
        item.querySelector(".rounded-full").className = "w-2 h-2 rounded-full mt-1.5 shrink-0 bg-transparent";
        updateNotifBadge();
      }
      if (p.event_id) {
        el("notif-panel")?.classList.add("hidden");
      }
    });
    list.appendChild(item);
  }
}


// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

init();
