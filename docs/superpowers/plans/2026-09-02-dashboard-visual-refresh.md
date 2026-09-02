# Dashboard Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between the current extension UI and the approved Stitch design concept — bolder 2px borders and hard shadows across all three pages, a grid-paper texture behind the calendar, a hover-preview/click-to-persist interaction model for day-cell selection (kept separate from the existing "today" marker), and a new sidebar mini calendar synced to the main grid.

**Architecture:** Pure CSS/HTML/vanilla-JS changes to existing files — no new dependencies, no build step (this extension has none). The interaction model and mini calendar both build directly on `dashboard.js`'s existing `selectedDay`/`currentDate` state and `openDayPanel`/`closeDayPanel`/`render` functions rather than introducing parallel state.

**Tech Stack:** Vanilla JS, Tailwind (local runtime via `extension/vendor/tailwind.js` + `tailwind-config.js`), hand-written CSS per page.

**Spec:** `docs/superpowers/specs/2026-09-02-dashboard-visual-refresh.md`

## Global Constraints

- No fake categorization: personal/ungrouped events do not get an invented color accent. The existing `pill.style.borderLeft` logic (only `if (event.group_id)`) is untouched.
- The "today" marker (`.month-cell.today` / `.week-cell.today`) stays exactly as its current always-on, non-interactive treatment — the new hover/selected shadow-pop treatment is additive and separate, not a replacement.
- The mini calendar has no independent navigation state — it mirrors `currentDate` (the same state the top bar's existing prev/next buttons drive) and its own chevrons mutate that same variable.
- Shadow values reuse the existing `shadow-neo-sm` token value (`2px 2px 0px 0px rgba(0,0,0,1)`) already defined in `extension/vendor/tailwind-config.js` — hardcoded to match in raw CSS where needed (dashboard.css already hardcodes hex colors directly rather than referencing Tailwind classes for JS-generated content, so this follows the file's existing convention).

---

## Task 0: Dashboard visual system — CSS (borders, shadow tokens, grid texture)

**Files:**
- Modify: `extension/dashboard/dashboard.css`

**Interfaces:**
- Produces: no new classes consumed elsewhere in this task; `.month-cell`/`.week-cell`/`.month-grid`/`.week-grid`/`.month-day-name`/`.event-pill` selectors keep their existing names, just updated border widths. `#main`'s new background is purely decorative (no JS reads it).

- [ ] **Step 1: Bump the month-grid border widths from 1px to 2px**

Open `extension/dashboard/dashboard.css`. Find (lines 4-24):

```css
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 1px solid #1a1c1c;
  border-left: 1px solid #1a1c1c;
  min-height: 100%;
}

.month-day-name {
  padding: 6px 8px 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4c4546;
  border-right: 1px solid #1a1c1c;
  border-bottom: 1px solid #1a1c1c;
  background: #eeeeee;
  user-select: none;
}

.month-cell {
  border-right: 1px solid #1a1c1c;
  border-bottom: 1px solid #1a1c1c;
  padding: 4px;
  min-height: 80px;
  cursor: pointer;
  background: #f9f9f9;
  vertical-align: top;
  overflow: hidden;
}
```

Replace with:

```css
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 2px solid #1a1c1c;
  border-left: 2px solid #1a1c1c;
  min-height: 100%;
}

.month-day-name {
  padding: 6px 8px 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4c4546;
  border-right: 2px solid #1a1c1c;
  border-bottom: 2px solid #1a1c1c;
  background: #eeeeee;
  user-select: none;
}

.month-cell {
  border-right: 2px solid #1a1c1c;
  border-bottom: 2px solid #1a1c1c;
  padding: 4px;
  min-height: 80px;
  cursor: pointer;
  background: #f9f9f9;
  vertical-align: top;
  overflow: hidden;
}
```

(`.month-cell.today`'s existing `border-top: 2px solid #1a1c1c` is already 2px — leave it exactly as it is, per the Global Constraints note that the today marker is untouched.)

- [ ] **Step 2: Bump the week-grid border widths from 1px to 2px**

Find (lines 51-64):

```css
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 1px solid #1a1c1c;
  border-left: 1px solid #1a1c1c;
  min-height: 100%;
}

.week-cell {
  border-right: 1px solid #1a1c1c;
  border-bottom: 1px solid #1a1c1c;
  padding: 8px;
  min-height: 80px;
  background: #f9f9f9;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
```

Replace with:

```css
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 2px solid #1a1c1c;
  border-left: 2px solid #1a1c1c;
  min-height: 100%;
}

.week-cell {
  border-right: 2px solid #1a1c1c;
  border-bottom: 2px solid #1a1c1c;
  padding: 8px;
  min-height: 80px;
  background: #f9f9f9;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
```

(`.week-cell.today`'s existing `border-top: 2px solid #1a1c1c` stays as it is, same reasoning as Step 1.)

- [ ] **Step 3: Bump the event-pill border width**

Find (lines 95-108):

```css
.event-pill {
  font-size: 10px;
  font-family: 'Geist', sans-serif;
  padding: 1px 5px;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #ffffff;
  color: #1a1c1c;
  border: 1px solid #1a1c1c;
  cursor: pointer;
  display: block;
}
.event-pill:hover { background: #f4f3f3; }
```

Replace with:

```css
.event-pill {
  font-size: 10px;
  font-family: 'Geist', sans-serif;
  padding: 1px 5px;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #ffffff;
  color: #1a1c1c;
  border: 2px solid #1a1c1c;
  cursor: pointer;
  display: block;
}
.event-pill:hover { background: #f4f3f3; }
```

- [ ] **Step 4: Add the grid-paper texture behind the calendar**

Add this new rule anywhere in `dashboard.css` (e.g., right after the `.month-grid` block):

```css
/* ── Grid-paper texture behind the calendar (purely decorative) ── */
#main {
  background-image:
    linear-gradient(to right, #e2e2e2 1px, transparent 1px),
    linear-gradient(to bottom, #e2e2e2 1px, transparent 1px);
  background-size: 20px 20px;
}
```

- [ ] **Step 5: Manually verify**

Load the unpacked extension, open the dashboard. Expected: month grid lines are visibly thicker/bolder, event chips have a slightly heavier border, and a faint graph-paper grid texture is visible in empty cell space. Switch to Week view and confirm the same border weight applies there. Nothing else should look different yet (no shadows, no mini calendar — those are later tasks).

- [ ] **Step 6: Commit**

```bash
git add extension/dashboard/dashboard.css
git commit -m "feat(dashboard): bolder grid borders, thicker event chips, grid-paper texture"
```

---

## Task 1: Shell visual system — HTML border weight across all three pages

**Files:**
- Modify: `extension/dashboard/dashboard.html`
- Modify: `extension/settings/settings.html`
- Modify: `extension/tasks/tasks.html`

**Interfaces:**
- Produces: no behavioral change, purely Tailwind class swaps (`border` → `border-2`, `border-b` → `border-b-2`, `border-r` → `border-r-2`, `border-l` → `border-l-2`) on structural shell elements. No IDs, classes used by JS, or event listeners are touched.

- [ ] **Step 1: Bump dashboard.html's sidebar and topbar borders**

Open `extension/dashboard/dashboard.html`. Make these exact replacements (each is a single distinct line in the file):

Find:
```html
  <nav id="leftnav" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface overflow-hidden">
```
Replace with:
```html
  <nav id="leftnav" class="w-56 border-r-2 border-outline flex flex-col shrink-0 bg-surface overflow-hidden">
```

Find:
```html
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted mb-0.5">Plan</div>
      <div class="font-sans text-2xl font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>
```
Replace with:
```html
    <div class="px-5 pt-5 pb-4 border-b-2 border-outline shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted mb-0.5">Plan</div>
      <div class="font-sans text-2xl font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>
```

Find:
```html
    <header id="topbar" class="flex items-center justify-between h-12 px-4 border-b border-outline bg-surface shrink-0">
```
Replace with:
```html
    <header id="topbar" class="flex items-center justify-between h-12 px-4 border-b-2 border-outline bg-surface shrink-0">
```

Find:
```html
        <div class="flex border border-outline overflow-hidden">
```
Replace with:
```html
        <div class="flex border-2 border-outline overflow-hidden">
```

Find:
```html
      <aside id="rightpanel" class="w-64 border-l border-outline flex flex-col shrink-0 bg-surface overflow-hidden relative">
```
Replace with:
```html
      <aside id="rightpanel" class="w-64 border-l-2 border-outline flex flex-col shrink-0 bg-surface overflow-hidden relative">
```

Find:
```html
          <div class="px-4 pt-3 pb-2 border-b border-outline shrink-0">
            <div class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-on-muted">Upcoming</div>
          </div>
```
Replace with:
```html
          <div class="px-4 pt-3 pb-2 border-b-2 border-outline shrink-0">
            <div class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-on-muted">Upcoming</div>
          </div>
```

- [ ] **Step 2: Bump settings.html's sidebar, topbar, and tab strip borders**

Open `extension/settings/settings.html`.

Find:
```html
  <aside id="sidebar" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
```
Replace with:
```html
  <aside id="sidebar" class="w-56 border-r-2 border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b-2 border-outline shrink-0">
```

Find:
```html
    <header id="topbar" class="flex items-center h-12 px-4 border-b border-outline bg-surface shrink-0">
```
Replace with:
```html
    <header id="topbar" class="flex items-center h-12 px-4 border-b-2 border-outline bg-surface shrink-0">
```

Find:
```html
    <div class="flex border-b border-outline bg-surface shrink-0 overflow-x-auto">
```
Replace with:
```html
    <div class="flex border-b-2 border-outline bg-surface shrink-0 overflow-x-auto">
```

- [ ] **Step 3: Bump tasks.html's sidebar, topbar, and kanban column borders**

Open `extension/tasks/tasks.html`.

Find:
```html
  <nav id="leftnav" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
```
Replace with:
```html
  <nav id="leftnav" class="w-56 border-r-2 border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b-2 border-outline shrink-0">
```

Find:
```html
    <header id="topbar" class="flex items-center justify-between h-12 px-4 border-b border-outline bg-surface shrink-0">
```
Replace with:
```html
    <header id="topbar" class="flex items-center justify-between h-12 px-4 border-b-2 border-outline bg-surface shrink-0">
```

There are three kanban columns (TODO, IN PROGRESS, DONE) — each has one `.col-head` div and one `#cards-*` div using the same 1px pattern. Find each of these three (they appear once each in the file) and apply the same swap:

```html
            <div class="col-head flex items-center justify-between px-3 py-2 border border-outline border-b-0 bg-surface-mid">
```
→
```html
            <div class="col-head flex items-center justify-between px-3 py-2 border-2 border-outline border-b-0 bg-surface-mid">
```

(this exact line appears three times — once for `col-todo`, once for `col-inprogress`, once for `col-done` — apply the identical swap to all three occurrences)

```html
            <div id="cards-todo" class="cards flex flex-col gap-2 p-2 border border-outline flex-1 overflow-y-auto bg-surface-low"></div>
```
→
```html
            <div id="cards-todo" class="cards flex flex-col gap-2 p-2 border-2 border-outline flex-1 overflow-y-auto bg-surface-low"></div>
```

```html
            <div id="cards-inprogress" class="cards flex flex-col gap-2 p-2 border border-outline flex-1 overflow-y-auto bg-surface-low"></div>
```
→
```html
            <div id="cards-inprogress" class="cards flex flex-col gap-2 p-2 border-2 border-outline flex-1 overflow-y-auto bg-surface-low"></div>
```

```html
            <div id="cards-done" class="cards flex flex-col gap-2 p-2 border border-outline flex-1 overflow-y-auto bg-surface-low"></div>
```
→
```html
            <div id="cards-done" class="cards flex flex-col gap-2 p-2 border-2 border-outline flex-1 overflow-y-auto bg-surface-low"></div>
```

Leave the task-creation form's input field borders (the `border border-outline` occurrences further down the file, around the title/date/notes inputs and the cancel button) at 1px — those are form-content details, not shell structure, consistent with leaving Settings' input fields untouched too.

- [ ] **Step 4: Manually verify across all three pages**

Load the unpacked extension. Open Dashboard, Settings, and Tasks in turn. Expected: sidebar/topbar dividers and (on Tasks) kanban column borders are visibly thicker on all three pages; nothing is misaligned or overlapping; page-specific content below the shell (settings groups, task cards) is unaffected.

- [ ] **Step 5: Commit**

```bash
git add extension/dashboard/dashboard.html extension/settings/settings.html extension/tasks/tasks.html
git commit -m "feat(ui): bolder 2px shell borders across dashboard, settings, and tasks"
```

---

## Task 2: Cell highlight interaction model (hover preview + click-to-persist)

**Files:**
- Modify: `extension/dashboard/dashboard.js`
- Modify: `extension/dashboard/dashboard.css`

**Interfaces:**
- Consumes: existing module-level `selectedDay` variable (dashboard.js line 25), existing `openDayPanel(dateKey, events)` / `closeDayPanel()` functions, existing `render()` function.
- Produces: `makeMonthCell(year, month, day, dateMap, today, isOtherMonth, selectedDay)` — new 7th parameter. `renderWeek()`'s inline cell-building gains the same `selectedDay` comparison inline (no separate function exists for week cells to change the signature of). Both `openDayPanel`/`closeDayPanel` now call `render()` as their first/last side effect respectively — later tasks (Task 3's mini calendar) rely on this to stay in sync automatically.

- [ ] **Step 1: Add the hover-preview and persisted-selected CSS**

Open `extension/dashboard/dashboard.css`. Add this immediately after the `.month-cell.other-month` block (which follows `.month-cell.today` — search for `.month-cell.other-month .day-number`):

```css
.month-cell:hover,
.month-cell.selected {
  border: 2px solid #1a1c1c;
  box-shadow: 2px 2px 0px 0px rgba(0,0,0,1);
  position: relative;
  z-index: 2;
}
```

And immediately after the `.week-cell.today` block:

```css
.week-cell:hover,
.week-cell.selected {
  border: 2px solid #1a1c1c;
  box-shadow: 2px 2px 0px 0px rgba(0,0,0,1);
  position: relative;
  z-index: 2;
}
```

This is intentionally the same visual treatment for both hover and the persisted `.selected` state — the only difference is what triggers it and how long it lasts, not what it looks like. It also intentionally does not touch `.month-cell.today`/`.week-cell.today`, which keeps its current subtle background-tint treatment untouched; if a cell happens to be both today and selected, the two rules combine (background from `.today`, border+shadow from `.selected`) without conflict since they set different properties.

- [ ] **Step 2: Thread `selectedDay` into `makeMonthCell` and apply the `.selected` class**

Open `extension/dashboard/dashboard.js`. Find (around line 199-209):

```js
function makeMonthCell(year, month, day, dateMap, today, isOtherMonth) {
  // Normalise month overflow (JS Date handles it)
  const cellDate = new Date(year, month, day);
  const dateKey = toDateString(cellDate);
  const events = dateMap[dateKey] || [];

  const cell = document.createElement("div");
  cell.className = "month-cell" +
    (isOtherMonth ? " other-month" : "") +
    (dateKey === today ? " today" : "");
```

Replace with:

```js
function makeMonthCell(year, month, day, dateMap, today, isOtherMonth, selectedDay) {
  // Normalise month overflow (JS Date handles it)
  const cellDate = new Date(year, month, day);
  const dateKey = toDateString(cellDate);
  const events = dateMap[dateKey] || [];

  const cell = document.createElement("div");
  cell.className = "month-cell" +
    (isOtherMonth ? " other-month" : "") +
    (dateKey === today ? " today" : "") +
    (dateKey === selectedDay ? " selected" : "");
```

- [ ] **Step 3: Toggle selection instead of always opening on click, in `makeMonthCell`**

In the same function, find (around line 243):

```js
  // Click cell to open day panel
  cell.addEventListener("click", () => openDayPanel(dateKey, events));

  return cell;
}
```

Replace with:

```js
  // Click cell to open day panel — clicking the already-selected day closes
  // it instead (toggle), so the persisted highlight matches "this cell is
  // currently open" rather than accumulating clicks with no way back.
  cell.addEventListener("click", () => {
    if (dateKey === selectedDay) {
      closeDayPanel();
    } else {
      openDayPanel(dateKey, events);
    }
  });

  return cell;
}
```

- [ ] **Step 4: Pass `selectedDay` at both `makeMonthCell` call sites in `renderMonth`**

Find (around line 159-180):

```js
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
```

Replace with:

```js
  // Leading cells from previous month
  for (let i = 0; i < firstDay; i++) {
    const cell = makeMonthCell(
      year, month - 1, daysInPrev - firstDay + i + 1,
      dateMap, today, true, selectedDay
    );
    grid.appendChild(cell);
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = makeMonthCell(year, month, d, dateMap, today, false, selectedDay);
    grid.appendChild(cell);
  }

  // Trailing cells to fill the grid to a multiple of 7
  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= trailing; d++) {
    const cell = makeMonthCell(year, month + 1, d, dateMap, today, true, selectedDay);
    grid.appendChild(cell);
  }
```

(`selectedDay` here refers to the module-level state variable declared at the top of the file — `renderMonth` doesn't currently take it as a parameter, and doesn't need to; it's read directly, the same way `renderMonth` already reads `allEvents` and `currentDate` directly.)

- [ ] **Step 5: Apply the same `selected` class and click-toggle in `renderWeek`**

Find (around line 280-311):

```js
    const cell = document.createElement("div");
    cell.className = "week-cell" + (dateKey === today ? " today" : "");
```

Replace with:

```js
    const cell = document.createElement("div");
    cell.className = "week-cell" +
      (dateKey === today ? " today" : "") +
      (dateKey === selectedDay ? " selected" : "");
```

Find (around line 311):

```js
    cell.addEventListener("click", () => openDayPanel(dateKey, events));
    grid.appendChild(cell);
```

Replace with:

```js
    cell.addEventListener("click", () => {
      if (dateKey === selectedDay) {
        closeDayPanel();
      } else {
        openDayPanel(dateKey, events);
      }
    });
    grid.appendChild(cell);
```

- [ ] **Step 6: Re-render the grid when a day is selected or deselected**

Find `openDayPanel` (around line 325-327):

```js
function openDayPanel(dateKey, events) {
  selectedDay = dateKey;

  const date = new Date(dateKey + "T00:00:00");
```

Replace with:

```js
function openDayPanel(dateKey, events) {
  selectedDay = dateKey;
  render();

  const date = new Date(dateKey + "T00:00:00");
```

Find `closeDayPanel` (around line 429-433):

```js
function closeDayPanel() {
  if (activeCommentsChannel) { activeCommentsChannel.unsubscribe(); activeCommentsChannel = null; }
  hide("day-panel");
  selectedDay = null;
}
```

Replace with:

```js
function closeDayPanel() {
  if (activeCommentsChannel) { activeCommentsChannel.unsubscribe(); activeCommentsChannel = null; }
  hide("day-panel");
  selectedDay = null;
  render();
}
```

(`render()` rebuilds the grid from scratch, which is safe to call here — it doesn't touch `events`/`dateKey`, the local parameters `openDayPanel` still uses for the rest of its body to populate the day-panel content.)

- [ ] **Step 7: Manually verify**

Load the unpacked extension, open the dashboard. Expected:
- Hovering any empty day cell shows a bold border + hard shadow that disappears when the mouse leaves.
- Clicking a day cell opens its day panel and the cell keeps the bold border + shadow persistently (not just on hover).
- Clicking that same cell again closes the day panel and removes the persisted highlight.
- Clicking a different cell moves the persisted highlight there and closes/reopens the day panel for the new date.
- The existing "today" cell's subtle background tint is unaffected by any of the above, in every combination (today + hovered, today + selected, today alone).
- Repeat in Week view.

- [ ] **Step 8: Commit**

```bash
git add extension/dashboard/dashboard.js extension/dashboard/dashboard.css
git commit -m "feat(dashboard): hover-preview and click-to-persist day cell selection"
```

---

## Task 3: Mini calendar in the sidebar

**Files:**
- Modify: `extension/dashboard/dashboard.html`
- Modify: `extension/dashboard/dashboard.js`
- Modify: `extension/dashboard/dashboard.css`

**Interfaces:**
- Consumes: `currentDate`, `selectedDay`, `allEvents` (module state), `buildDateMap(events)`, `toDateString(date)`, `openDayPanel(dateKey, events)`, `closeDayPanel()`, `render()`, `el(id)` (all pre-existing).
- Produces: `renderMiniCalendar()` — new function, called from inside `render()` so every existing trigger of a re-render (month/week navigation, view toggle, day selection, event save/delete) keeps the mini calendar in sync automatically, with no new call sites needed anywhere else.

- [ ] **Step 1: Add the mini calendar container to the sidebar**

Open `extension/dashboard/dashboard.html`. Find (around lines 27-40):

```html
    <!-- Nav -->
    <div class="flex flex-col pt-2 shrink-0">
      <a href="dashboard.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-surface border-l-2 border-primary bg-surface-mid">
        <span class="material-symbols-outlined text-[18px]">calendar_today</span>Calendar
      </a>
      <a href="../tasks/tasks.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">task_alt</span>Tasks
      </a>
      <a href="../settings/settings.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">settings</span>Settings
      </a>
    </div>

    <div id="groups-filter" class="mt-auto border-t border-outline p-4 hidden"></div>
```

Replace with:

```html
    <!-- Nav -->
    <div class="flex flex-col pt-2 shrink-0">
      <a href="dashboard.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-surface border-l-2 border-primary bg-surface-mid">
        <span class="material-symbols-outlined text-[18px]">calendar_today</span>Calendar
      </a>
      <a href="../tasks/tasks.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">task_alt</span>Tasks
      </a>
      <a href="../settings/settings.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">settings</span>Settings
      </a>
    </div>

    <div id="mini-cal" class="px-5 py-5 mt-3 border-t-2 border-outline shrink-0"></div>

    <div id="groups-filter" class="mt-auto border-t border-outline p-4 hidden"></div>
```

(`#mini-cal` has no `mt-auto`, so it sits directly under the nav; `#groups-filter` keeps its existing `mt-auto`, which pushes it to the bottom of the sidebar as it already does today — this reproduces the layout already validated in the approved mockup screenshot.)

- [ ] **Step 2: Add `renderMiniCalendar()` to dashboard.js**

Open `extension/dashboard/dashboard.js`. Find the `render()` function (around line 122-126):

```js
function render() {
  if (currentView === "month") renderMonth();
  else renderWeek();
  applyGroupFilter();
}
```

Replace with:

```js
function render() {
  if (currentView === "month") renderMonth();
  else renderWeek();
  applyGroupFilter();
  renderMiniCalendar();
}
```

Then add the new function itself. A good spot is right after `makeMonthCell` (after its closing `}`, before the `// WEEK VIEW` section comment):

```js
// ─────────────────────────────────────────────
// MINI CALENDAR (sidebar)
// ─────────────────────────────────────────────

// Mirrors currentDate — no independent navigation state of its own, so it
// can never disagree with what month the main grid is showing. Its own
// chevrons mutate the same currentDate the top bar's prev/next buttons do.
function renderMiniCalendar() {
  const container = el("mini-cal");
  if (!container) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthLabel = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = toDateString(new Date());
  const dateMap = buildDateMap(allEvents);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  container.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <span class="font-mono text-[10px] font-bold tracking-[0.1em] uppercase">${monthLabel}</span>
      <div class="flex gap-1">
        <button id="mini-cal-prev" class="w-5 h-5 flex items-center justify-center hover:bg-surface-mid">
          <span class="material-symbols-outlined text-[14px]">chevron_left</span>
        </button>
        <button id="mini-cal-next" class="w-5 h-5 flex items-center justify-center hover:bg-surface-mid">
          <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        </button>
      </div>
    </div>
    <div class="grid grid-cols-7 gap-0.5 text-center mb-1">
      ${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span class="font-mono text-[8px] text-on-muted">${d}</span>`).join("")}
    </div>
    <div class="grid grid-cols-7 gap-0.5" id="mini-cal-days"></div>
  `;

  const daysEl = el("mini-cal-days");

  const addDay = (dateKey, label, isOtherMonth) => {
    const day = document.createElement("span");
    day.className = "mini-cal-day" +
      (isOtherMonth ? " other-month" : "") +
      (dateKey === today ? " today" : "") +
      (dateKey === selectedDay ? " selected" : "");
    day.textContent = label;
    day.addEventListener("click", () => {
      if (dateKey === selectedDay) {
        closeDayPanel();
      } else {
        openDayPanel(dateKey, dateMap[dateKey] || []);
      }
    });
    daysEl.appendChild(day);
  };

  for (let i = 0; i < firstDay; i++) {
    const d = daysInPrev - firstDay + i + 1;
    addDay(toDateString(new Date(year, month - 1, d)), d, true);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    addDay(toDateString(new Date(year, month, d)), d, false);
  }
  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= trailing; d++) {
    addDay(toDateString(new Date(year, month + 1, d)), d, true);
  }

  el("mini-cal-prev").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    render();
  });
  el("mini-cal-next").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    render();
  });
}
```

Note: `renderMiniCalendar()` calling `render()` from its own prev/next handlers, and `render()` in turn calling `renderMiniCalendar()`, is not infinite recursion — the handlers are only invoked on a user click, not during the render itself; each click triggers exactly one full `render()` pass which rebuilds the mini calendar's DOM (including fresh listeners) once.

- [ ] **Step 3: Style the mini calendar days**

Add to `extension/dashboard/dashboard.css` (anywhere; e.g., at the end of the file):

```css
/* ── Mini calendar (sidebar) ── */
.mini-cal-day {
  padding: 3px 0;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  cursor: pointer;
  border: 1px solid transparent;
}
.mini-cal-day:hover { border-color: #1a1c1c; background: #f4f3f3; }
.mini-cal-day.today { background: #1a1c1c; color: #f9f9f9; font-weight: 700; }
.mini-cal-day.selected { border-color: #00D1FF; color: #00D1FF; font-weight: 700; }
.mini-cal-day.other-month { color: #cfc4c5; }
```

- [ ] **Step 4: Manually verify**

Load the unpacked extension, open the dashboard. Expected:
- A mini calendar appears in the sidebar below the nav links, showing the same month as the main grid.
- Its prev/next chevrons move both the mini calendar *and* the main grid together (same month, always).
- Clicking a date in the mini calendar opens that day's panel (same as clicking it in the main grid), and that date now shows selected in both the mini calendar and the main grid.
- Clicking the mini calendar's already-selected date closes the panel and clears the highlight in both places.
- Today's date is visually distinct (solid fill) in the mini calendar regardless of whether it's also selected.
- Navigating the main grid's own prev/next buttons updates the mini calendar to match.

- [ ] **Step 5: Commit**

```bash
git add extension/dashboard/dashboard.html extension/dashboard/dashboard.js extension/dashboard/dashboard.css
git commit -m "feat(dashboard): add sidebar mini calendar synced to the main grid"
```

---

## Self-review

**Spec coverage:**
- ✅ 2px borders across dashboard/settings/tasks shells — Task 1
- ✅ 2px borders on the calendar grid itself, event chip border bump — Task 0
- ✅ Hard shadow (reusing `shadow-neo-sm`'s value) applied to the interactive-selection state, not indiscriminately — Task 2
- ✅ Grid-paper texture behind the calendar — Task 0
- ✅ No color accent added to personal/ungrouped events (explicitly left alone) — Task 0 Step 3 only touches border width
- ✅ "Today" marker stays untouched, separate from the new hover/selected treatment — Task 2 Step 1 note
- ✅ Hover preview + click-to-persist + toggle-off + move-on-different-click — Task 2
- ✅ Mini calendar, no independent nav state, synced via `currentDate` — Task 3

**Placeholder scan:** none — every CSS rule, HTML find/replace, and JS diff is complete and verified against the actual current file contents read during planning.

**Type consistency:** `makeMonthCell`'s new `selectedDay` parameter (Task 2 Step 2) is passed identically at all three call sites in `renderMonth` (Task 2 Step 4); `renderMiniCalendar`'s use of `selectedDay`/`openDayPanel`/`closeDayPanel`/`render`/`buildDateMap`/`toDateString` (Task 3 Step 2) all match the exact names and signatures already established in the current file and confirmed by Task 2's edits to the same names.
