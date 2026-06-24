# Phase A — UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all extension screens with a unified neo-brutalist design system — Tailwind CSS, 0px border-radius, neo-shadow, Geist + JetBrains Mono typography — with no changes to existing JavaScript logic.

**Architecture:** Tailwind Play CDN JS vendored as a local file (`extension/vendor/tailwind.js`) to satisfy MV3 CSP (`script-src 'self'`). Each HTML page loads it with a `<script src>` tag and follows it with an inline `tailwind.config` block. Existing CSS files stripped to a minimal residual containing only classes generated dynamically by JavaScript (calendar grid cells, event chips, week view cells). All JS element IDs and `data-*` attributes preserved without exception.

**Tech Stack:** Tailwind CSS (Play CDN vendored), Geist + JetBrains Mono (Google Fonts), Material Symbols Outlined (Google Fonts)

---

## File map

| Action | File | What changes |
|---|---|---|
| Create | `extension/vendor/tailwind.js` | Downloaded Play CDN — local vendor |
| Rewrite | `extension/dashboard/dashboard.html` | Full Tailwind rewrite |
| Rewrite | `extension/dashboard/dashboard.css` | Minimal residual (JS-generated classes only) |
| Rewrite | `extension/tasks/tasks.html` | Full Tailwind rewrite; modal → right-side drawer |
| Rewrite | `extension/tasks/tasks.css` | Minimal residual |
| Rewrite | `extension/settings/settings.html` | Full Tailwind rewrite (Claude Design reference for layout) |
| Rewrite | `extension/settings/settings.css` | Minimal residual |
| Rewrite | `extension/training/training.html` | Full Tailwind rewrite |
| Rewrite | `extension/training/training.css` | Minimal residual |
| Rewrite | `extension/popup/popup.html` | Full Tailwind rewrite |
| Rewrite | `extension/popup/popup.css` | Minimal residual |

---

## Shared Tailwind config block

Every HTML page includes this inline script **immediately after** the `tailwind.js` `<script>` tag:

```html
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'background':    '#f9f9f9',
        'surface':       '#f9f9f9',
        'surface-low':   '#f4f3f3',
        'surface-mid':   '#eeeeee',
        'surface-high':  '#e8e8e8',
        'surface-top':   '#e2e2e2',
        'on-surface':    '#1a1c1c',
        'on-muted':      '#4c4546',
        'primary':       '#000000',
        'on-primary':    '#ffffff',
        'secondary':     '#5d5f5f',
        'outline':       '#1a1c1c',
        'outline-soft':  '#cfc4c5',
        'error':         '#ba1a1a',
        'error-bg':      '#ffdad6',
        'status-active': '#00D1FF',
        'status-ok':     '#7EFF00',
        'status-crit':   '#FF4D00',
      },
      borderRadius: {
        DEFAULT: '0px', none: '0px', sm: '0px',
        md: '0px', lg: '0px', xl: '0px', full: '9999px',
      },
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'neo':     '4px 4px 0px 0px rgba(0,0,0,1)',
        'neo-sm':  '2px 2px 0px 0px rgba(0,0,0,1)',
        'neo-xs':  '1px 1px 0px 0px rgba(0,0,0,1)',
      },
    },
  },
}
</script>
```

---

## Task 0: Vendor Tailwind Play CDN

**Files:**
- Create: `extension/vendor/tailwind.js`

- [ ] **Step 1: Download the Play CDN as a local vendor file**

Run in PowerShell from the project root:
```powershell
Invoke-WebRequest -Uri "https://cdn.tailwindcss.com" -OutFile "extension/vendor/tailwind.js"
```

- [ ] **Step 2: Verify the file downloaded correctly**

```powershell
(Get-Item "extension/vendor/tailwind.js").Length
```

Expected: file size > 100000 bytes (roughly 350–450 KB).

- [ ] **Step 3: Commit**

```bash
git add extension/vendor/tailwind.js
git commit -m "chore: vendor Tailwind Play CDN for MV3-compatible loading"
```

---

## Task 1: Migrate Dashboard

**Files:**
- Rewrite: `extension/dashboard/dashboard.html`
- Rewrite: `extension/dashboard/dashboard.css`

**JS IDs that must be preserved exactly:**
`app`, `topbar`, `leftnav`, `body`, `main`, `rightpanel`, `btn-prev`, `btn-next`, `cal-title`, `today-display`, `view-month`, `view-week`, `calendar-grid`, `upcoming-section`, `upcoming-list`, `day-panel`, `day-panel-title`, `day-panel-close`, `day-panel-events`, `modal-overlay`, `modal`, `modal-close`, `modal-field-title`, `modal-field-date`, `modal-field-time`, `modal-field-participants`, `modal-field-notes`, `modal-source`, `modal-save`, `modal-delete`, `modal-cancel`

**New IDs added for Phase B/D hooks (wired in later phases):**
`groups-filter` (sidebar placeholder), `btn-notifications`, `notif-badge`, `user-initials`, `btn-add-event`, `notif-panel`, `notif-mark-all`, `notif-list`

- [ ] **Step 1: Write new `dashboard.html`**

Replace the entire file with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PlanWise — Calendar</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=block" />
  <script src="../vendor/tailwind.js"></script>
  <script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'background':'#f9f9f9','surface':'#f9f9f9','surface-low':'#f4f3f3',
          'surface-mid':'#eeeeee','surface-high':'#e8e8e8','surface-top':'#e2e2e2',
          'on-surface':'#1a1c1c','on-muted':'#4c4546','primary':'#000000',
          'on-primary':'#ffffff','secondary':'#5d5f5f','outline':'#1a1c1c',
          'outline-soft':'#cfc4c5','error':'#ba1a1a','error-bg':'#ffdad6',
          'status-active':'#00D1FF','status-ok':'#7EFF00','status-crit':'#FF4D00',
        },
        borderRadius:{ DEFAULT:'0px',none:'0px',sm:'0px',md:'0px',lg:'0px',xl:'0px',full:'9999px' },
        fontFamily:{ sans:['Geist','sans-serif'], mono:['JetBrains Mono','monospace'] },
        boxShadow:{ 'neo':'4px 4px 0px 0px rgba(0,0,0,1)', 'neo-sm':'2px 2px 0px 0px rgba(0,0,0,1)', 'neo-xs':'1px 1px 0px 0px rgba(0,0,0,1)' },
      },
    },
  }
  </script>
  <link rel="stylesheet" href="dashboard.css" />
</head>
<body class="bg-background font-sans text-on-surface h-screen overflow-hidden">
<div id="app" class="flex h-screen overflow-hidden">

  <!-- ── Sidebar ── -->
  <nav id="leftnav" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface overflow-hidden">

    <!-- Wordmark -->
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted mb-0.5">Plan</div>
      <div class="font-sans text-2xl font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>

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
      <a href="../training/training.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">model_training</span>Training
      </a>
    </div>

    <!-- Groups filter — populated by Phase B -->
    <div id="groups-filter" class="mt-auto border-t border-outline p-4 hidden"></div>
  </nav>

  <!-- ── Right column ── -->
  <div class="flex flex-col flex-1 min-w-0">

    <!-- Top bar -->
    <header id="topbar" class="flex items-center justify-between h-12 px-4 border-b border-outline bg-surface shrink-0">
      <!-- Nav controls + month title -->
      <div class="flex items-center gap-0.5">
        <button id="btn-prev" class="w-8 h-8 flex items-center justify-center hover:bg-surface-mid active:bg-surface-high transition-colors">
          <span class="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        <h1 id="cal-title" class="font-bold text-sm tracking-tight w-44 text-center select-none"></h1>
        <button id="btn-next" class="w-8 h-8 flex items-center justify-center hover:bg-surface-mid active:bg-surface-high transition-colors">
          <span class="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>

      <!-- Right controls -->
      <div class="flex items-center gap-2">
        <div id="today-display" class="font-mono text-[10px] font-bold tracking-wider text-on-muted uppercase select-none"></div>

        <!-- View toggle -->
        <div class="flex border border-outline overflow-hidden">
          <button id="view-month" class="view-btn px-3 py-1 font-mono text-[10px] font-bold tracking-wider bg-primary text-on-primary">MONTH</button>
          <button id="view-week"  class="view-btn px-3 py-1 font-mono text-[10px] font-bold tracking-wider bg-surface text-on-surface hover:bg-surface-mid">WEEK</button>
        </div>

        <!-- Bell — Phase D wires this -->
        <button id="btn-notifications" class="w-8 h-8 flex items-center justify-center hover:bg-surface-mid relative">
          <span class="material-symbols-outlined text-[18px]">notifications</span>
          <span id="notif-badge" class="absolute top-1 right-1 min-w-[14px] h-3.5 bg-primary text-on-primary font-mono text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 hidden">0</span>
        </button>

        <!-- User avatar — Phase B fills initials -->
        <button id="btn-user-avatar" class="w-7 h-7 rounded-full bg-on-surface text-on-primary flex items-center justify-center font-mono text-[10px] font-bold hover:opacity-80">
          <span id="user-initials">?</span>
        </button>
      </div>
    </header>

    <!-- Body -->
    <div id="body" class="flex flex-1 min-h-0 overflow-hidden relative">

      <!-- Calendar -->
      <main id="main" class="flex-1 min-w-0 overflow-auto">
        <div id="calendar-grid" class="h-full"></div>
      </main>

      <!-- Right panel -->
      <aside id="rightpanel" class="w-64 border-l border-outline flex flex-col shrink-0 bg-surface overflow-hidden relative">

        <!-- Upcoming -->
        <div id="upcoming-section" class="flex flex-col h-full">
          <div class="px-4 pt-3 pb-2 border-b border-outline shrink-0">
            <div class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-on-muted">Upcoming</div>
          </div>
          <div id="upcoming-list" class="flex-1 overflow-y-auto"></div>
        </div>

        <!-- Day panel — shown on day click, overlays upcoming -->
        <div id="day-panel" class="hidden absolute inset-0 bg-surface flex flex-col z-10">
          <div class="day-panel-head flex items-center justify-between px-4 py-3 border-b border-outline shrink-0">
            <div id="day-panel-title" class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-on-muted"></div>
            <button id="day-panel-close" class="w-6 h-6 flex items-center justify-center hover:bg-surface-mid">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          <div id="day-panel-events" class="flex-1 overflow-y-auto p-3 flex flex-col gap-2"></div>
        </div>
      </aside>
    </div>
  </div>

  <!-- Floating add button -->
  <button id="btn-add-event" class="fixed bottom-5 right-5 w-11 h-11 bg-primary text-on-primary flex items-center justify-center shadow-neo hover:shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-neo-xs transition-all z-20">
    <span class="material-symbols-outlined text-[20px]">add</span>
  </button>

</div><!-- /#app -->

<!-- Event edit modal -->
<div id="modal-overlay" class="hidden fixed inset-0 bg-on-surface/30 flex items-center justify-center z-30">
  <div id="modal" class="w-96 bg-surface border border-outline shadow-neo">
    <div class="modal-head flex items-center justify-between px-5 py-3 border-b border-outline">
      <div class="modal-label font-mono text-[10px] font-bold tracking-[0.15em] uppercase">EDIT EVENT</div>
      <button id="modal-close" class="w-6 h-6 flex items-center justify-center hover:bg-surface-mid">
        <span class="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
    <div class="modal-fields px-5 py-4 flex flex-col gap-3">
      <div class="modal-row flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">TITLE</label>
        <input type="text"  id="modal-field-title"        class="row-input border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
      </div>
      <div class="modal-row flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">DATE</label>
        <input type="date"  id="modal-field-date"         class="row-input border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none" />
      </div>
      <div class="modal-row flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">TIME</label>
        <input type="time"  id="modal-field-time"         class="row-input border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none" />
      </div>
      <div class="modal-row flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">PEOPLE</label>
        <input type="text"  id="modal-field-participants" class="row-input border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none" placeholder="comma separated" />
      </div>
      <div class="modal-row flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">NOTES</label>
        <input type="text"  id="modal-field-notes"        class="row-input border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none" placeholder="optional" />
      </div>
    </div>
    <div id="modal-source" class="modal-quote px-5 py-3 border-t border-outline font-mono text-[11px] text-on-muted bg-surface-low italic hidden"></div>
    <div class="modal-foot flex gap-2 px-5 py-3 border-t border-outline">
      <button id="modal-save"   class="flex-1 py-2 font-mono text-[10px] font-bold tracking-wider uppercase bg-primary text-on-primary border border-primary shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Save</button>
      <button id="modal-delete" class="px-4 py-2 font-mono text-[10px] font-bold tracking-wider uppercase border border-error text-error hover:bg-error hover:text-on-primary">Delete</button>
      <button id="modal-cancel" class="px-4 py-2 font-mono text-[10px] font-bold tracking-wider uppercase border border-outline text-on-muted hover:bg-surface-mid">Cancel</button>
    </div>
  </div>
</div>

<!-- Notification feed panel — Phase D populates this -->
<div id="notif-panel" class="hidden fixed right-0 top-12 bottom-0 w-80 bg-surface border-l border-outline z-20 flex flex-col shadow-neo">
  <div class="flex items-center justify-between px-4 py-3 border-b border-outline shrink-0">
    <div class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Notifications</div>
    <button id="notif-mark-all" class="font-mono text-[9px] tracking-wider text-on-muted hover:text-on-surface underline">Mark all read</button>
  </div>
  <div id="notif-list" class="flex-1 overflow-y-auto"></div>
</div>

<script src="../vendor/supabase.js"></script>
<script src="../utils/storage.js"></script>
<script src="../utils/supabase-client.js"></script>
<script src="../vendor/anime.min.js"></script>
<script src="dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write minimal `dashboard.css`**

Replace the entire file with (only JS-generated classes and unavoidable custom styles):

```css
/* dashboard.css — residual: only classes generated dynamically by dashboard.js */

/* ── Month grid (created by renderMonth) ── */
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
.month-cell:hover { background: #f4f3f3; }
.month-cell.today  { background: #000000; color: #ffffff; }
.month-cell.dimmed { background: #eeeeee; color: #4c4546; }

.month-cell-date {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 2px;
  line-height: 1.2;
}

/* ── Week grid (created by renderWeek) ── */
.week-grid {
  display: grid;
  grid-template-columns: 44px repeat(7, 1fr);
  border-top: 1px solid #1a1c1c;
  border-left: 1px solid #1a1c1c;
  min-height: 100%;
}

.week-time-col {
  border-right: 1px solid #1a1c1c;
  border-bottom: 1px solid #1a1c1c;
}

.week-day-header {
  border-right: 1px solid #1a1c1c;
  border-bottom: 1px solid #1a1c1c;
  padding: 6px 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4c4546;
  background: #eeeeee;
  text-align: center;
}

.week-cell {
  border-right: 1px solid #1a1c1c;
  border-bottom: 1px solid #1a1c1c;
  min-height: 32px;
  padding: 2px;
  background: #f9f9f9;
  cursor: pointer;
}
.week-cell:hover  { background: #f4f3f3; }
.week-cell.today  { background: #000000; }

/* ── Event chips (created by makeMonthCell / renderWeek) ── */
.event-chip {
  font-size: 10px;
  font-family: 'Geist', sans-serif;
  padding: 1px 5px;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #1a1c1c;
  color: #f9f9f9;
  cursor: pointer;
  border-left: 3px solid transparent;
  display: block;
}
.event-chip:hover { background: #2e3131; }

/* ── Upcoming list items (created by renderUpcoming) ── */
.upcoming-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 16px;
  border-bottom: 1px solid #eeeeee;
  cursor: pointer;
}
.upcoming-item:hover { background: #f4f3f3; }
.upcoming-date { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: #4c4546; text-transform: uppercase; letter-spacing: 0.1em; }
.upcoming-title { font-size: 13px; font-weight: 500; color: #1a1c1c; }

/* ── Day panel event rows (created by renderDayPanel) ── */
.day-event-row {
  padding: 10px 12px;
  border: 1px solid #1a1c1c;
  cursor: pointer;
  background: #f9f9f9;
}
.day-event-row:hover { background: #f4f3f3; }
.day-event-title { font-size: 13px; font-weight: 600; color: #1a1c1c; }
.day-event-meta  { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #4c4546; margin-top: 2px; }

/* ── Scrollbar ── */
::-webkit-scrollbar       { width: 3px; height: 3px; }
::-webkit-scrollbar-thumb { background: #1a1c1c; }
::-webkit-scrollbar-track { background: #f9f9f9; }

/* ── View toggle active state (managed by dashboard.js toggling classes) ── */
.view-btn.active {
  background: #000000 !important;
  color: #ffffff !important;
}

/* ── modal-source visible state ── */
#modal-source.visible { display: block; }
```

- [ ] **Step 3: Open the extension in Chrome and verify visually**

1. Open `chrome://extensions` → Load unpacked → select `extension/` folder.
2. Click the PlanWise icon → click "Calendar" link to open dashboard.
3. Verify: sidebar visible left with wordmark, topbar with prev/next + view toggle, calendar grid renders with 1px borders on cells, upcoming list visible on right, event chips appear if any events exist, modal opens on event chip click.

- [ ] **Step 4: Commit**

```bash
git add extension/dashboard/dashboard.html extension/dashboard/dashboard.css
git commit -m "feat(ui): migrate dashboard to Tailwind neo-brutalist design"
```

---

## Task 2: Migrate Tasks (modal → drawer)

**Files:**
- Rewrite: `extension/tasks/tasks.html`
- Rewrite: `extension/tasks/tasks.css`

**JS IDs that must be preserved exactly:**
`app`, `topbar`, `leftnav`, `body`, `main`, `board`, `col-todo`, `col-inprogress`, `col-done`, `cards-todo`, `cards-inprogress`, `cards-done`, `count-todo`, `count-inprogress`, `count-done`, `btn-add-task`, `modal-overlay`, `modal`, `modal-title`, `modal-close`, `task-title`, `task-date`, `task-priority`, `task-notes`, `modal-save`, `modal-delete`, `modal-cancel`

**Design note:** The task form changes from a centered modal overlay to a right-side slide-in drawer. `tasks.js` only toggles `.hidden` on `#modal-overlay` and reads `#task-*` input values — no JS changes needed.

- [ ] **Step 1: Write new `tasks.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PlanWise — Tasks</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=block" />
  <script src="../vendor/tailwind.js"></script>
  <script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'background':'#f9f9f9','surface':'#f9f9f9','surface-low':'#f4f3f3',
          'surface-mid':'#eeeeee','surface-high':'#e8e8e8','surface-top':'#e2e2e2',
          'on-surface':'#1a1c1c','on-muted':'#4c4546','primary':'#000000',
          'on-primary':'#ffffff','secondary':'#5d5f5f','outline':'#1a1c1c',
          'outline-soft':'#cfc4c5','error':'#ba1a1a',
          'status-active':'#00D1FF','status-ok':'#7EFF00','status-crit':'#FF4D00',
        },
        borderRadius:{ DEFAULT:'0px',none:'0px',sm:'0px',md:'0px',lg:'0px',xl:'0px',full:'9999px' },
        fontFamily:{ sans:['Geist','sans-serif'], mono:['JetBrains Mono','monospace'] },
        boxShadow:{ 'neo':'4px 4px 0px 0px rgba(0,0,0,1)', 'neo-sm':'2px 2px 0px 0px rgba(0,0,0,1)', 'neo-xs':'1px 1px 0px 0px rgba(0,0,0,1)' },
      },
    },
  }
  </script>
  <link rel="stylesheet" href="tasks.css" />
</head>
<body class="bg-background font-sans text-on-surface h-screen overflow-hidden">
<div id="app" class="flex h-screen overflow-hidden">

  <!-- Sidebar -->
  <nav id="leftnav" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted mb-0.5">Plan</div>
      <div class="font-sans text-2xl font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>
    <div class="flex flex-col pt-2">
      <a href="../dashboard/dashboard.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">calendar_today</span>Calendar
      </a>
      <a href="tasks.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-surface border-l-2 border-primary bg-surface-mid">
        <span class="material-symbols-outlined text-[18px]">task_alt</span>Tasks
      </a>
      <a href="../settings/settings.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">settings</span>Settings
      </a>
      <a href="../training/training.html" class="leftnav-item flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined text-[18px]">model_training</span>Training
      </a>
    </div>
  </nav>

  <!-- Right column -->
  <div class="flex flex-col flex-1 min-w-0">

    <!-- Top bar -->
    <header id="topbar" class="flex items-center justify-between h-12 px-5 border-b border-outline bg-surface shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted">Tasks</div>
      <button id="btn-add-task" class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase shadow-neo-xs hover:shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">
        <span class="material-symbols-outlined text-[14px]">add</span>NEW TASK
      </button>
    </header>

    <!-- Body -->
    <div id="body" class="flex flex-1 min-h-0 overflow-hidden">
      <main id="main" class="flex-1 overflow-auto p-5">
        <div id="board" class="flex gap-4 h-full">

          <!-- TODO column -->
          <div class="column flex flex-col w-72 shrink-0" id="col-todo">
            <div class="col-head flex items-center justify-between px-3 py-2 border border-outline border-b-0 bg-surface-mid">
              <span class="font-mono text-[10px] font-bold tracking-wider uppercase">TODO</span>
              <div class="flex items-center gap-2">
                <span id="count-todo" class="font-mono text-[9px] font-bold bg-primary text-on-primary px-1.5 py-0.5">0</span>
                <button class="col-add-btn w-5 h-5 flex items-center justify-center hover:bg-surface-high" data-col="todo">
                  <span class="material-symbols-outlined text-[14px]">add</span>
                </button>
              </div>
            </div>
            <div id="cards-todo" class="cards flex flex-col gap-2 p-2 border border-outline flex-1 overflow-y-auto bg-surface-low"></div>
          </div>

          <!-- IN PROGRESS column -->
          <div class="column flex flex-col w-72 shrink-0" id="col-inprogress">
            <div class="col-head flex items-center justify-between px-3 py-2 border border-outline border-b-0 bg-surface-mid">
              <span class="font-mono text-[10px] font-bold tracking-wider uppercase">In Progress</span>
              <div class="flex items-center gap-2">
                <span id="count-inprogress" class="font-mono text-[9px] font-bold bg-primary text-on-primary px-1.5 py-0.5">0</span>
                <button class="col-add-btn w-5 h-5 flex items-center justify-center hover:bg-surface-high" data-col="inprogress">
                  <span class="material-symbols-outlined text-[14px]">add</span>
                </button>
              </div>
            </div>
            <div id="cards-inprogress" class="cards flex flex-col gap-2 p-2 border border-outline flex-1 overflow-y-auto bg-surface-low"></div>
          </div>

          <!-- DONE column -->
          <div class="column flex flex-col w-72 shrink-0" id="col-done">
            <div class="col-head flex items-center justify-between px-3 py-2 border border-outline border-b-0 bg-surface-mid">
              <span class="font-mono text-[10px] font-bold tracking-wider uppercase">Done</span>
              <div class="flex items-center gap-2">
                <span id="count-done" class="font-mono text-[9px] font-bold bg-primary text-on-primary px-1.5 py-0.5">0</span>
                <button class="col-add-btn w-5 h-5 flex items-center justify-center hover:bg-surface-high" data-col="done">
                  <span class="material-symbols-outlined text-[14px]">add</span>
                </button>
              </div>
            </div>
            <div id="cards-done" class="cards flex flex-col gap-2 p-2 border border-outline flex-1 overflow-y-auto bg-surface-low"></div>
          </div>

        </div>
      </main>
    </div>
  </div>
</div><!-- /#app -->

<!-- Task add/edit — right-side drawer (tasks.js only toggles .hidden on #modal-overlay) -->
<div id="modal-overlay" class="hidden fixed inset-0 bg-on-surface/20 z-30">
  <div id="modal" class="absolute right-0 inset-y-0 w-80 bg-surface border-l border-outline shadow-neo flex flex-col">

    <div class="modal-head flex items-center justify-between px-5 py-3 border-b border-outline shrink-0">
      <div id="modal-title" class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">ADD TASK</div>
      <button id="modal-close" class="w-6 h-6 flex items-center justify-center hover:bg-surface-mid">
        <span class="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>

    <div class="modal-fields px-5 py-4 flex flex-col gap-3 flex-1 overflow-y-auto">
      <div class="flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">TITLE</label>
        <input type="text" id="task-title" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" placeholder="What needs doing?" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">DUE DATE</label>
        <input type="date" id="task-date" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">PRIORITY</label>
        <select id="task-priority" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none appearance-none">
          <option value="">None</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted">NOTES</label>
        <textarea id="task-notes" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none resize-none" rows="4" placeholder="Optional notes..."></textarea>
      </div>
    </div>

    <div class="modal-foot flex gap-2 px-5 py-3 border-t border-outline shrink-0">
      <button id="modal-save"   class="flex-1 py-2 font-mono text-[10px] font-bold tracking-wider uppercase bg-primary text-on-primary shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Save</button>
      <button id="modal-delete" class="hidden px-4 py-2 font-mono text-[10px] font-bold tracking-wider uppercase border border-error text-error hover:bg-error hover:text-on-primary">Delete</button>
      <button id="modal-cancel" class="px-4 py-2 font-mono text-[10px] font-bold tracking-wider uppercase border border-outline text-on-muted hover:bg-surface-mid">Cancel</button>
    </div>
  </div>
</div>

<script src="tasks.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write minimal `tasks.css`**

```css
/* tasks.css — residual: only classes generated dynamically by tasks.js */

/* Task cards created by renderCard() */
.task-card {
  padding: 10px 12px;
  border: 1px solid #1a1c1c;
  background: #f9f9f9;
  cursor: pointer;
  box-shadow: 2px 2px 0px 0px rgba(0,0,0,1);
  position: relative;
}
.task-card:hover { background: #f4f3f3; }
.task-card:active { transform: translate(1px, 1px); box-shadow: none; }

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1c1c;
  margin-bottom: 4px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4c4546;
}

.priority-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.priority-dot.high   { background: #FF4D00; }
.priority-dot.medium { background: #00D1FF; }
.priority-dot.low    { background: #7EFF00; }

.overdue-badge {
  display: inline-block;
  padding: 0 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: #ffdad6;
  color: #93000a;
}

/* Scrollbar */
::-webkit-scrollbar       { width: 3px; height: 3px; }
::-webkit-scrollbar-thumb { background: #1a1c1c; }
::-webkit-scrollbar-track { background: #f9f9f9; }
```

- [ ] **Step 3: Visual test**

Open `tasks.html` in extension context. Verify: kanban columns render with mono headers and count badges, "NEW TASK" opens a right-side drawer (not a centered overlay), task cards render with priority dots.

- [ ] **Step 4: Commit**

```bash
git add extension/tasks/tasks.html extension/tasks/tasks.css
git commit -m "feat(ui): migrate tasks to Tailwind, convert modal to right-side drawer"
```

---

## Task 3: Migrate Settings

**Files:**
- Rewrite: `extension/settings/settings.html`
- Rewrite: `extension/settings/settings.css`

**JS IDs that must be preserved exactly:**
`app`, `main`, `sidebar` (sidebar class), nav items with `data-section` attributes, `section-detection`, `section-overview`, `section-contacts`, `section-notifications`, `section-account`, `sensitivity-slider`, `sensitivity-display`, `trigger-word-input`, `btn-add-trigger`, `trigger-tags`, `priority-name-input`, `btn-add-priority-name`, `priority-name-tags`, `activity-word-input`, `btn-add-activity-word`, `activity-word-tags`, `meeting-word-input`, `btn-add-meeting-word`, `meeting-word-tags`, `item-input`, `btn-add-item`, `item-tags`, `summary-tbody`, `contact-name-input`, `contact-nickname-input`, `btn-add-contact`, `contact-list`, `toggle-notifications`, `account-email`, `btn-signout`, `save-bar`, `save-status`, `btn-save`

**Design reference:** Claude Design output for Settings (tab-strip nav, wide left sidebar with wordmark + section nav, main content area).

**New ID added for Phase B:** `section-groups`, nav item `data-section="groups"`

- [ ] **Step 1: Write new `settings.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PlanWise — Settings</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="../vendor/tailwind.js"></script>
  <script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'background':'#f9f9f9','surface':'#f9f9f9','surface-low':'#f4f3f3',
          'surface-mid':'#eeeeee','surface-high':'#e8e8e8','surface-top':'#e2e2e2',
          'on-surface':'#1a1c1c','on-muted':'#4c4546','primary':'#000000',
          'on-primary':'#ffffff','secondary':'#5d5f5f','outline':'#1a1c1c',
          'outline-soft':'#cfc4c5','error':'#ba1a1a',
          'status-active':'#00D1FF','status-ok':'#7EFF00','status-crit':'#FF4D00',
        },
        borderRadius:{ DEFAULT:'0px',none:'0px',sm:'0px',md:'0px',lg:'0px',xl:'0px',full:'9999px' },
        fontFamily:{ sans:['Geist','sans-serif'], mono:['JetBrains Mono','monospace'] },
        boxShadow:{ 'neo':'4px 4px 0px 0px rgba(0,0,0,1)', 'neo-sm':'2px 2px 0px 0px rgba(0,0,0,1)', 'neo-xs':'1px 1px 0px 0px rgba(0,0,0,1)' },
      },
    },
  }
  </script>
  <link rel="stylesheet" href="settings.css" />
</head>
<body class="bg-background font-sans text-on-surface h-screen overflow-hidden">

<div id="app" class="flex h-screen overflow-hidden">

  <!-- Sidebar (same structure as dashboard/tasks) -->
  <aside id="sidebar" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted mb-0.5">Plan</div>
      <div class="font-sans text-2xl font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>

    <!-- Section nav -->
    <nav class="sidebar-nav flex flex-col pt-2 flex-1 overflow-y-auto">
      <a href="#" class="nav-item flex items-center px-5 py-2.5 text-sm font-medium text-on-surface border-l-2 border-primary bg-surface-mid" data-section="detection">Detection</a>
      <a href="#" class="nav-item flex items-center px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface" data-section="overview">Overview</a>
      <a href="#" class="nav-item flex items-center px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface" data-section="contacts">Contacts</a>
      <a href="#" class="nav-item flex items-center px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface" data-section="groups">Groups</a>
      <a href="#" class="nav-item flex items-center px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface" data-section="notifications">Notifications</a>
      <a href="#" class="nav-item flex items-center px-5 py-2.5 text-sm font-medium text-on-muted border-l-2 border-transparent hover:bg-surface-low hover:text-on-surface" data-section="account">Account</a>
    </nav>

    <!-- Cross-page links -->
    <div class="flex flex-col gap-0 border-t border-outline shrink-0">
      <a href="../dashboard/dashboard.html" class="flex items-center px-5 py-2.5 text-sm text-on-muted hover:bg-surface-low hover:text-on-surface">← Calendar</a>
      <a href="../tasks/tasks.html"         class="flex items-center px-5 py-2.5 text-sm text-on-muted hover:bg-surface-low hover:text-on-surface">Tasks</a>
      <a href="../training/training.html"   class="flex items-center px-5 py-2.5 text-sm text-on-muted hover:bg-surface-low hover:text-on-surface">Training</a>
    </div>
  </aside>

  <!-- Main content -->
  <main id="main" class="flex-1 min-w-0 overflow-y-auto relative">

    <!-- Detection -->
    <section id="section-detection" class="section active p-8 max-w-2xl">
      <h1 class="text-xl font-bold tracking-tight mb-1">Detection</h1>
      <p class="text-sm text-on-muted mb-6">Control how PlanWise detects plans in your conversations.</p>

      <div class="setting-group flex flex-col gap-4 mb-8 pb-8 border-b border-outline-soft">
        <label class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Detection Sensitivity</label>
        <p class="text-sm text-on-muted -mt-2">Lower = catches more plans (more false positives). Higher = only catches obvious plans.</p>
        <div class="flex items-center gap-4">
          <span class="font-mono text-[10px] font-bold tracking-wider text-on-muted uppercase">Low</span>
          <input type="range" id="sensitivity-slider" min="1" max="4" step="1" class="flex-1 accent-primary" />
          <span class="font-mono text-[10px] font-bold tracking-wider text-on-muted uppercase">High</span>
        </div>
        <div class="font-mono text-xs text-on-muted">Threshold: <strong id="sensitivity-display" class="text-on-surface">2</strong></div>
      </div>

      <!-- Trigger Words -->
      <div class="setting-group flex flex-col gap-3 mb-8 pb-8 border-b border-outline-soft">
        <label class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Custom Trigger Words</label>
        <p class="text-sm text-on-muted -mt-1">Words that strongly suggest a plan. Each match adds +2 to detection score.</p>
        <div class="flex gap-2">
          <input type="text" id="trigger-word-input" placeholder="e.g. rehearsal, training..." class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
          <button id="btn-add-trigger" class="px-4 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px]">Add</button>
        </div>
        <div id="trigger-tags" class="tag-list flex flex-wrap gap-1.5"></div>
      </div>

      <!-- Custom Names -->
      <div class="setting-group flex flex-col gap-3 mb-8 pb-8 border-b border-outline-soft">
        <label class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Custom Names</label>
        <p class="text-sm text-on-muted -mt-1">People or places you frequently make plans with. Name is added to the event title and notes — does not affect detection score.</p>
        <div class="flex gap-2">
          <input type="text" id="priority-name-input" placeholder="e.g. Coach Kim, Studio B..." class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
          <button id="btn-add-priority-name" class="px-4 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px]">Add</button>
        </div>
        <div id="priority-name-tags" class="tag-list flex flex-wrap gap-1.5"></div>
      </div>

      <!-- Activity Words -->
      <div class="setting-group flex flex-col gap-3 mb-8 pb-8 border-b border-outline-soft">
        <label class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Custom Activity Words</label>
        <p class="text-sm text-on-muted -mt-1">Activities PlanWise doesn't recognise by default. Each match adds +2.</p>
        <div class="flex gap-2">
          <input type="text" id="activity-word-input" placeholder="e.g. rehearsal, sparring, recital..." class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
          <button id="btn-add-activity-word" class="px-4 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px]">Add</button>
        </div>
        <div id="activity-word-tags" class="tag-list flex flex-wrap gap-1.5"></div>
      </div>

      <!-- Meeting Words -->
      <div class="setting-group flex flex-col gap-3 mb-8 pb-8 border-b border-outline-soft">
        <label class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Custom Meeting Words</label>
        <p class="text-sm text-on-muted -mt-1">Work or group meeting types specific to your context. Each match adds +2.</p>
        <div class="flex gap-2">
          <input type="text" id="meeting-word-input" placeholder="e.g. standup, retrospective, sync..." class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
          <button id="btn-add-meeting-word" class="px-4 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px]">Add</button>
        </div>
        <div id="meeting-word-tags" class="tag-list flex flex-wrap gap-1.5"></div>
      </div>

      <!-- Plan Items -->
      <div class="setting-group flex flex-col gap-3">
        <label class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase">Plan Items</label>
        <p class="text-sm text-on-muted -mt-1">Things that appear in plans — items to bring, gear, supplies. Each match adds +1.</p>
        <div class="flex gap-2">
          <input type="text" id="item-input" placeholder="e.g. cleats, racket, passport..." class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
          <button id="btn-add-item" class="px-4 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px]">Add</button>
        </div>
        <div id="item-tags" class="tag-list flex flex-wrap gap-1.5"></div>
      </div>
    </section>

    <!-- Overview -->
    <section id="section-overview" class="section hidden p-8 max-w-2xl">
      <h1 class="text-xl font-bold tracking-tight mb-1">Overview</h1>
      <p class="text-sm text-on-muted mb-6">All custom detection words at a glance.</p>
      <div class="border border-outline">
        <table class="summary-table w-full text-sm border-collapse">
          <thead>
            <tr class="bg-surface-mid border-b border-outline">
              <th class="text-left px-4 py-2 font-mono text-[9px] font-bold tracking-[0.15em] uppercase text-on-muted">Category</th>
              <th class="text-left px-4 py-2 font-mono text-[9px] font-bold tracking-[0.15em] uppercase text-on-muted">Entries</th>
              <th class="text-left px-4 py-2 font-mono text-[9px] font-bold tracking-[0.15em] uppercase text-on-muted">Score</th>
              <th class="text-left px-4 py-2 font-mono text-[9px] font-bold tracking-[0.15em] uppercase text-on-muted">Count</th>
            </tr>
          </thead>
          <tbody id="summary-tbody"></tbody>
        </table>
      </div>
    </section>

    <!-- Contacts -->
    <section id="section-contacts" class="section hidden p-8 max-w-2xl">
      <h1 class="text-xl font-bold tracking-tight mb-1">Contacts</h1>
      <p class="text-sm text-on-muted mb-6">People PlanWise should recognise in conversations.</p>
      <div class="flex gap-2 mb-4">
        <input type="text" id="contact-name-input"     placeholder="Name (e.g. Alex)"              class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
        <input type="text" id="contact-nickname-input" placeholder="Nicknames (comma separated)"    class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
        <button id="btn-add-contact" class="px-4 py-1.5 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase hover:shadow-neo-xs">Add</button>
      </div>
      <div id="contact-list" class="contact-list flex flex-col gap-2"></div>
    </section>

    <!-- Groups — Phase B populates this section -->
    <section id="section-groups" class="section hidden p-8 max-w-2xl">
      <h1 class="text-xl font-bold tracking-tight mb-1">Groups</h1>
      <p class="text-sm text-on-muted mb-6">Share events with people you plan with. Groups let you post events and see RSVPs and comments.</p>
      <div id="groups-list" class="flex flex-col gap-3 mb-6"></div>
      <button id="btn-new-group" class="flex items-center gap-2 px-4 py-2 border border-outline font-mono text-[10px] font-bold tracking-wider uppercase hover:bg-surface-mid hover:shadow-neo-xs">
        <span>+ New Group</span>
      </button>
      <!-- New group form — hidden until btn-new-group clicked -->
      <div id="new-group-form" class="hidden mt-4 border border-outline p-5 flex flex-col gap-4">
        <div class="font-mono text-[10px] font-bold tracking-[0.15em] uppercase border-b border-outline pb-3">Create Group</div>
        <div class="flex flex-col gap-1">
          <label class="font-mono text-[9px] font-bold tracking-wider uppercase text-on-muted">Name</label>
          <input type="text" id="new-group-name" class="border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none" placeholder="e.g. Family, Football crew..." />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-mono text-[9px] font-bold tracking-wider uppercase text-on-muted">Colour</label>
          <div id="group-colour-picker" class="flex gap-2">
            <button class="colour-opt w-7 h-7 border-2 border-transparent hover:border-outline selected" data-colour="#00D1FF" style="background:#00D1FF"></button>
            <button class="colour-opt w-7 h-7 border-2 border-transparent hover:border-outline" data-colour="#7EFF00" style="background:#7EFF00"></button>
            <button class="colour-opt w-7 h-7 border-2 border-transparent hover:border-outline" data-colour="#FF4D00" style="background:#FF4D00"></button>
            <button class="colour-opt w-7 h-7 border-2 border-transparent hover:border-outline" data-colour="#A855F7" style="background:#A855F7"></button>
            <button class="colour-opt w-7 h-7 border-2 border-transparent hover:border-outline" data-colour="#F59E0B" style="background:#F59E0B"></button>
            <button class="colour-opt w-7 h-7 border-2 border-transparent hover:border-outline" data-colour="#EC4899" style="background:#EC4899"></button>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-mono text-[9px] font-bold tracking-wider uppercase text-on-muted">Invite by email</label>
          <input type="email" id="new-group-invite" class="border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none" placeholder="friend@example.com" />
        </div>
        <div class="flex gap-2">
          <button id="btn-create-group" class="flex-1 py-2 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Create Group</button>
          <button id="btn-cancel-new-group" class="px-4 py-2 border border-outline font-mono text-[10px] font-bold tracking-wider uppercase text-on-muted hover:bg-surface-mid">Cancel</button>
        </div>
      </div>
    </section>

    <!-- Notifications -->
    <section id="section-notifications" class="section hidden p-8 max-w-2xl">
      <h1 class="text-xl font-bold tracking-tight mb-1">Notifications</h1>
      <p class="text-sm text-on-muted mb-6">Control how PlanWise alerts you when a plan is detected.</p>
      <div class="flex items-center justify-between py-4 border-b border-outline-soft">
        <div>
          <div class="font-medium text-sm mb-0.5">Badge icon</div>
          <div class="text-sm text-on-muted">Show a badge on the extension icon when a plan is detected.</div>
        </div>
        <label class="toggle relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="toggle-notifications" class="sr-only peer" />
          <div class="w-9 h-5 bg-surface-top border border-outline peer-checked:bg-primary peer-checked:border-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:w-4 after:h-4 after:border after:border-outline after:transition-all peer-checked:after:translate-x-4 after:peer-checked:border-white"></div>
        </label>
      </div>
    </section>

    <!-- Account -->
    <section id="section-account" class="section hidden p-8 max-w-2xl">
      <h1 class="text-xl font-bold tracking-tight mb-1">Account</h1>
      <p class="text-sm text-on-muted mb-6">Manage your PlanWise account.</p>
      <div class="border border-outline p-5 flex flex-col gap-4">
        <div>
          <div class="font-mono text-[9px] font-bold tracking-[0.15em] uppercase text-on-muted mb-1">Signed in as</div>
          <div id="account-email" class="text-sm font-medium">—</div>
        </div>
        <button id="btn-signout" class="self-start px-4 py-2 border border-error text-error font-mono text-[10px] font-bold tracking-wider uppercase hover:bg-error hover:text-on-primary">Sign out</button>
      </div>
    </section>

    <!-- Save bar -->
    <div id="save-bar" class="fixed bottom-0 left-56 right-0 flex items-center justify-between px-8 py-3 bg-surface border-t border-outline z-10">
      <span id="save-status" class="font-mono text-xs text-on-muted"></span>
      <button id="btn-save" class="px-5 py-2 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Save Settings</button>
    </div>
  </main>
</div>

<script src="../vendor/supabase.js"></script>
<script src="../utils/storage.js"></script>
<script src="../utils/supabase-client.js"></script>
<script src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write minimal `settings.css`**

```css
/* settings.css — residual */

/* Section show/hide — controlled by settings.js toggling .active / .hidden */
.section        { display: none; padding-bottom: 80px; }
.section.active { display: block; }
.section.hidden { display: none !important; }

/* Nav item active — controlled by settings.js */
.nav-item.active {
  color: #1a1c1c !important;
  border-left-color: #000000 !important;
  background: #eeeeee !important;
}

/* Tag chips (created dynamically by settings.js) */
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 10px;
  border: 1px solid #1a1c1c;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: #f9f9f9;
}
.tag-chip button {
  display: flex;
  align-items: center;
  color: #4c4546;
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
  background: none;
  border: none;
}
.tag-chip button:hover { color: #ba1a1a; }

/* Contact list rows (created dynamically) */
.contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid #cfc4c5;
  background: #f9f9f9;
}
.contact-name     { font-weight: 600; font-size: 13px; }
.contact-nicknames { font-size: 11px; color: #4c4546; margin-top: 1px; }
.contact-remove { background: none; border: none; cursor: pointer; color: #4c4546; font-size: 16px; padding: 2px 4px; }
.contact-remove:hover { color: #ba1a1a; }

/* Summary table rows */
.summary-table td {
  padding: 10px 16px;
  font-size: 13px;
  border-bottom: 1px solid #eeeeee;
}
.summary-table tbody tr:last-child td { border-bottom: none; }

/* Colour option selected state */
.colour-opt.selected { border-color: #1a1c1c !important; }

/* Scrollbar */
::-webkit-scrollbar       { width: 3px; }
::-webkit-scrollbar-thumb { background: #1a1c1c; }
::-webkit-scrollbar-track { background: #f9f9f9; }
```

- [ ] **Step 3: Verify settings.js nav wiring still works**

Open settings page, click each nav item (Detection, Overview, Contacts, Groups, Notifications, Account). Each section should show and others hide. Save Settings button should still function.

- [ ] **Step 4: Commit**

```bash
git add extension/settings/settings.html extension/settings/settings.css
git commit -m "feat(ui): migrate settings to Tailwind, add Groups section placeholder"
```

---

## Task 4: Migrate Training

**Files:**
- Rewrite: `extension/training/training.html`
- Rewrite: `extension/training/training.css`

**JS IDs preserved:** `stat-total`, `stat-labelled`, `stat-correct`, `stat-fp`, `stat-fn`, `search`, `entry-list`, `empty-state`, `btn-export`, `btn-clear`, filter buttons with `data-filter`

- [ ] **Step 1: Write new `training.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PlanWise — Training Data</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="../vendor/tailwind.js"></script>
  <script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'background':'#f9f9f9','surface':'#f9f9f9','surface-low':'#f4f3f3',
          'surface-mid':'#eeeeee','on-surface':'#1a1c1c','on-muted':'#4c4546',
          'primary':'#000000','on-primary':'#ffffff','outline':'#1a1c1c',
          'outline-soft':'#cfc4c5','error':'#ba1a1a',
          'status-active':'#00D1FF','status-ok':'#7EFF00','status-crit':'#FF4D00',
        },
        borderRadius:{ DEFAULT:'0px',none:'0px',sm:'0px',md:'0px',lg:'0px',xl:'0px',full:'9999px' },
        fontFamily:{ sans:['Geist','sans-serif'], mono:['JetBrains Mono','monospace'] },
        boxShadow:{ 'neo':'4px 4px 0px 0px rgba(0,0,0,1)', 'neo-xs':'1px 1px 0px 0px rgba(0,0,0,1)' },
      },
    },
  }
  </script>
  <link rel="stylesheet" href="training.css" />
</head>
<body class="bg-background font-sans text-on-surface h-screen overflow-hidden">
<div id="app" class="flex h-screen overflow-hidden">

  <!-- Sidebar -->
  <aside id="sidebar" class="w-56 border-r border-outline flex flex-col shrink-0 bg-surface">
    <div class="px-5 pt-5 pb-4 border-b border-outline shrink-0">
      <div class="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-on-muted mb-0.5">Plan</div>
      <div class="font-sans text-2xl font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>

    <!-- Stats -->
    <div class="px-5 py-4 border-b border-outline shrink-0">
      <div class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted mb-3">Stats</div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between"><span class="text-xs text-on-muted">Total logged</span><strong id="stat-total"   class="font-mono text-xs">—</strong></div>
        <div class="flex items-center justify-between"><span class="text-xs text-on-muted">Labelled</span>    <strong id="stat-labelled" class="font-mono text-xs">—</strong></div>
        <div class="flex items-center justify-between"><span class="text-xs text-on-muted">Correct</span>    <strong id="stat-correct"  class="font-mono text-xs">—</strong></div>
        <div class="flex items-center justify-between"><span class="text-xs text-on-muted">False pos.</span>  <strong id="stat-fp"       class="font-mono text-xs">—</strong></div>
        <div class="flex items-center justify-between"><span class="text-xs text-on-muted">False neg.</span>  <strong id="stat-fn"       class="font-mono text-xs">—</strong></div>
      </div>
    </div>

    <!-- Cross-page links -->
    <div class="flex flex-col border-t border-outline mt-auto shrink-0">
      <a href="../dashboard/dashboard.html" class="px-5 py-2.5 text-sm text-on-muted hover:bg-surface-low">← Calendar</a>
      <a href="../tasks/tasks.html"         class="px-5 py-2.5 text-sm text-on-muted hover:bg-surface-low">Tasks</a>
      <a href="../settings/settings.html"   class="px-5 py-2.5 text-sm text-on-muted hover:bg-surface-low">Settings</a>
    </div>

    <!-- Actions -->
    <div class="flex flex-col gap-2 p-4 border-t border-outline shrink-0">
      <button id="btn-export" class="py-2 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Export JSON</button>
      <button id="btn-clear"  class="py-2 border border-error text-error font-mono text-[10px] font-bold tracking-wider uppercase hover:bg-error hover:text-on-primary">Clear Log</button>
    </div>
  </aside>

  <!-- Main -->
  <main id="main" class="flex-1 min-w-0 flex flex-col overflow-hidden">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 px-5 py-3 border-b border-outline bg-surface shrink-0">
      <div class="flex border border-outline overflow-hidden">
        <button class="filter-btn px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider uppercase bg-primary text-on-primary" data-filter="all">All</button>
        <button class="filter-btn px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider uppercase hover:bg-surface-mid" data-filter="unlabelled">Unlabelled</button>
        <button class="filter-btn px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider uppercase hover:bg-surface-mid" data-filter="triggered">Triggered</button>
        <button class="filter-btn px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider uppercase hover:bg-surface-mid" data-filter="not-triggered">Not triggered</button>
      </div>
      <input type="text" id="search" placeholder="Search text..." class="flex-1 border border-outline px-3 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
    </div>

    <!-- Entry list -->
    <div id="entry-list" class="flex-1 overflow-y-auto"></div>

    <div id="empty-state" class="hidden flex flex-col items-center justify-center flex-1 gap-2 text-center p-12">
      <div class="font-bold text-base">No detections logged yet.</div>
      <div class="text-sm text-on-muted">Use PlanWise on WhatsApp or Discord and entries will appear here.</div>
    </div>
  </main>

</div>

<script src="../utils/logger.js"></script>
<script src="../vendor/anime.min.js"></script>
<script src="training.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write minimal `training.css`**

```css
/* training.css — residual: dynamically-generated entry rows */

.entry-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 20px;
  border-bottom: 1px solid #eeeeee;
  cursor: pointer;
}
.entry-row:hover { background: #f4f3f3; }

.entry-text {
  font-size: 13px;
  color: #1a1c1c;
  line-height: 1.4;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4c4546;
}

.entry-badge {
  display: inline-block;
  padding: 1px 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.entry-badge.triggered     { background: #1a1c1c; color: #f9f9f9; }
.entry-badge.not-triggered { background: #eeeeee; color: #4c4546; }
.entry-badge.unlabelled    { background: #f4f3f3; color: #4c4546; border: 1px solid #cfc4c5; }

/* Filter button active state */
.filter-btn.active {
  background: #000000 !important;
  color: #ffffff !important;
}

/* Scrollbar */
::-webkit-scrollbar       { width: 3px; }
::-webkit-scrollbar-thumb { background: #1a1c1c; }
::-webkit-scrollbar-track { background: #f9f9f9; }
```

- [ ] **Step 3: Commit**

```bash
git add extension/training/training.html extension/training/training.css
git commit -m "feat(ui): migrate training to Tailwind neo-brutalist design"
```

---

## Task 5: Migrate Popup

**Files:**
- Rewrite: `extension/popup/popup.html`
- Rewrite: `extension/popup/popup.css`

**JS IDs preserved:** `app`, `auth-screen`, `auth-email`, `auth-password`, `btn-signin`, `btn-signup`, `auth-error`, `loading`, `empty`, `event-card`, `source-text`, `field-title`, `field-date`, `field-time`, `field-participants`, `field-notes`, `overlap-warning`, `btn-yes`, `btn-no`, `queue-info`, `btn-dashboard`, `footer-sep`, `btn-tasks`, `footer-sep-settings`, `btn-settings`, `footer-sep-training`, `btn-training`, `header-subtitle`

- [ ] **Step 1: Write new `popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PlanWise</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="../vendor/tailwind.js"></script>
  <script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'background':'#f9f9f9','surface':'#f9f9f9','surface-low':'#f4f3f3',
          'surface-mid':'#eeeeee','on-surface':'#1a1c1c','on-muted':'#4c4546',
          'primary':'#000000','on-primary':'#ffffff','outline':'#1a1c1c',
          'outline-soft':'#cfc4c5','error':'#ba1a1a',
        },
        borderRadius:{ DEFAULT:'0px',none:'0px',sm:'0px',md:'0px',lg:'0px',xl:'0px',full:'9999px' },
        fontFamily:{ sans:['Geist','sans-serif'], mono:['JetBrains Mono','monospace'] },
        boxShadow:{ 'neo':'4px 4px 0px 0px rgba(0,0,0,1)', 'neo-xs':'1px 1px 0px 0px rgba(0,0,0,1)' },
      },
    },
  }
  </script>
  <link rel="stylesheet" href="popup.css" />
</head>
<body class="bg-background font-sans text-on-surface w-80 min-h-48">
<div id="app" class="flex flex-col min-h-48">

  <!-- Header -->
  <div class="header flex items-center justify-between px-4 py-3 border-b border-outline bg-surface">
    <div>
      <div class="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-on-muted leading-none mb-0.5">Plan</div>
      <div class="font-sans text-lg font-black uppercase tracking-tighter text-on-surface leading-none">Wise</div>
    </div>
    <span id="header-subtitle" class="font-mono text-[9px] font-bold tracking-[0.12em] uppercase text-on-muted">Plan detected</span>
  </div>

  <!-- Auth screen -->
  <div id="auth-screen" class="hidden px-4 py-5 flex flex-col gap-3">
    <p class="text-sm text-on-muted">Sign in to save your plans.</p>
    <input type="email"    id="auth-email"    placeholder="Email"    autocomplete="email"             class="border border-outline px-3 py-2 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
    <input type="password" id="auth-password" placeholder="Password" autocomplete="current-password"  class="border border-outline px-3 py-2 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
    <div class="flex gap-2">
      <button id="btn-signin" class="flex-1 py-2 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Sign in</button>
      <button id="btn-signup" class="flex-1 py-2 border border-outline font-mono text-[10px] font-bold tracking-wider uppercase text-on-muted hover:bg-surface-mid">Sign up</button>
    </div>
    <p id="auth-error" class="hidden text-xs text-error font-mono"></p>
  </div>

  <!-- Loading -->
  <div id="loading" class="state px-4 py-6 flex items-center justify-center">
    <span class="font-mono text-xs text-on-muted tracking-wider">Loading...</span>
  </div>

  <!-- Empty state -->
  <div id="empty" class="state hidden px-4 py-8 flex flex-col items-center gap-2 text-center">
    <div class="font-bold text-sm">No pending plans.</div>
    <div class="text-xs text-on-muted font-mono tracking-wide">PlanWise is watching your conversations.</div>
  </div>

  <!-- Event card -->
  <div id="event-card" class="hidden">
    <!-- Source text quote -->
    <div id="source-text" class="px-4 py-3 bg-surface-mid border-b border-outline font-mono text-[11px] text-on-muted italic leading-relaxed"></div>

    <!-- Editable fields -->
    <div class="fields px-4 py-3 flex flex-col gap-2.5">
      <div class="flex flex-col gap-0.5">
        <label class="font-mono text-[8px] font-bold tracking-[0.18em] uppercase text-on-muted">TITLE</label>
        <input type="text"  id="field-title"        class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
      </div>
      <div class="flex gap-2">
        <div class="flex flex-col gap-0.5 flex-1">
          <label class="font-mono text-[8px] font-bold tracking-[0.18em] uppercase text-on-muted">DATE</label>
          <input type="date"  id="field-date"  class="border border-outline px-2 py-1.5 text-sm bg-surface focus:outline-none w-full" />
        </div>
        <div class="flex flex-col gap-0.5 flex-1">
          <label class="font-mono text-[8px] font-bold tracking-[0.18em] uppercase text-on-muted">TIME</label>
          <input type="time"  id="field-time"  class="border border-outline px-2 py-1.5 text-sm bg-surface focus:outline-none w-full" />
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        <label class="font-mono text-[8px] font-bold tracking-[0.18em] uppercase text-on-muted">PEOPLE</label>
        <input type="text"  id="field-participants" placeholder="Names, comma separated" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
      </div>
      <div class="flex flex-col gap-0.5">
        <label class="font-mono text-[8px] font-bold tracking-[0.18em] uppercase text-on-muted">NOTES</label>
        <input type="text"  id="field-notes" placeholder="Optional notes" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
      </div>
    </div>

    <div id="overlap-warning" class="overlap-warning hidden px-4 py-2 bg-error-bg font-mono text-[10px] text-error border-t border-error/30"></div>

    <div class="flex gap-2 px-4 py-3 border-t border-outline">
      <button id="btn-yes" class="flex-1 py-2 bg-primary text-on-primary font-mono text-[10px] font-bold tracking-wider uppercase shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">Add</button>
      <button id="btn-no"  class="flex-1 py-2 border border-outline font-mono text-[10px] font-bold tracking-wider uppercase text-on-muted hover:bg-surface-mid">Dismiss</button>
    </div>
    <div id="queue-info" class="px-4 pb-2 font-mono text-[9px] text-on-muted tracking-wide text-center"></div>
  </div>

  <!-- Footer links -->
  <div class="footer-links flex items-center justify-center gap-2 px-4 py-2 border-t border-outline mt-auto">
    <a id="btn-dashboard" href="#" class="font-mono text-[9px] text-on-muted hover:text-on-surface tracking-wider uppercase">Calendar</a>
    <span id="footer-sep"          class="hidden text-on-muted font-mono text-[9px]">·</span>
    <a    id="btn-tasks"   href="#" class="hidden font-mono text-[9px] text-on-muted hover:text-on-surface tracking-wider uppercase">Tasks</a>
    <span id="footer-sep-settings" class="hidden text-on-muted font-mono text-[9px]">·</span>
    <a    id="btn-settings" href="#" class="hidden font-mono text-[9px] text-on-muted hover:text-on-surface tracking-wider uppercase">Settings</a>
    <span id="footer-sep-training" class="hidden text-on-muted font-mono text-[9px]">·</span>
    <a    id="btn-training" href="#" class="hidden font-mono text-[9px] text-on-muted hover:text-on-surface tracking-wider uppercase">Training</a>
  </div>
</div>

<script src="../vendor/supabase.js"></script>
<script src="../utils/storage.js"></script>
<script src="../utils/supabase-client.js"></script>
<script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write minimal `popup.css`**

```css
/* popup.css — residual */

/* Body width constraint for popup */
body { width: 320px; }

::-webkit-scrollbar       { width: 3px; }
::-webkit-scrollbar-thumb { background: #1a1c1c; }
::-webkit-scrollbar-track { background: #f9f9f9; }
```

- [ ] **Step 3: Visual test**

Click the PlanWise extension icon. Verify: header shows wordmark, auth screen renders if not signed in, event card renders with source text quote block + editable fields + Add/Dismiss buttons, footer links appear.

- [ ] **Step 4: Commit**

```bash
git add extension/popup/popup.html extension/popup/popup.css
git commit -m "feat(ui): migrate popup to Tailwind neo-brutalist design"
```

---

## Self-review

**Spec coverage:**
- ✅ Neo-brutalist token set (colours, 0px radius, neo-shadow) — applied via Tailwind config in all pages
- ✅ Geist + JetBrains Mono — Google Fonts links in all pages
- ✅ Dashboard: sidebar, topbar, calendar grid, right panel, floating +, bell + avatar placeholders
- ✅ Tasks: kanban layout, right-side drawer, priority dots
- ✅ Settings: consistent sidebar/topbar layout, all section IDs preserved, Groups placeholder section
- ✅ Training: sidebar with stats, filter bar, entry list
- ✅ Popup: neo-brutalist auth + event card layout
- ✅ Tailwind vendored locally (MV3 CSP compliant)
- ✅ All JS element IDs preserved across every page

**Placeholder scan:** No TBDs found. Every code block is complete.

**Type consistency:** No types; HTML/CSS plan only.
