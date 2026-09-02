# PlanWise — Dashboard Visual Refresh (Stitch Brand Identity)

**Date:** 2026-09-02
**Status:** Approved for implementation planning

---

## Overview

The extension's main UI (dashboard, and — per this session's scope decision — Settings and Tasks too, for consistency) currently reads as visually flat: 1px borders everywhere, zero use of the hard-offset shadow the design system already defines (`shadow-neo`/`shadow-neo-sm`/`shadow-neo-xs` in `extension/vendor/tailwind-config.js`), and no decorative texture. A Google Stitch export (`docs/design-concepts/stitch-brand-identity/`) proposed a bolder direction using the *same* underlying design tokens (confirmed by diffing `DESIGN.md` against the live `tailwind-config.js` — same colors, same neo-brutalist principles) — this spec closes the gap between the two, verified against actual code rather than assumption throughout.

A live-rendered mockup (`scratchpad/dashboard-mockup.html`, screenshotted and shown to the user) validated the direction before this spec was written.

---

## Scope decisions (from brainstorming)

1. **All three pages** — Dashboard, Settings, and Tasks all get the visual refresh, not just the calendar view.
2. **Mini calendar included** — built now, not deferred, since it's the most functionally useful piece of the reference and was a deliberate part of what was uploaded.
3. **Wordmark stays in the sidebar** — the current stacked "Plan / Wise" treatment is kept as-is (not moved to the top bar), to avoid redesigning the header layout across all three pages.
4. **No fake categorization** — personal/ungrouped events do **not** get an invented color accent. The existing group-color mechanism (`pill.style.borderLeft = "3px solid " + event.group_colour`, applied only `if (event.group_id)`) is left exactly as it is; only genuinely shared/grouped events show a color bar.

---

## 1. Visual system: 2px borders + hard shadows + grid texture

Applies to all three pages (`dashboard.html`/`.css`, `settings.html`/`.css`, `tasks.html`/`.css`).

**Borders:** every structural 1px divider becomes 2px — sidebar/topbar edges, section separators, the calendar grid (`.month-grid`, `.month-cell`, `.month-day-name`, `.week-grid`, `.week-cell`), and page-specific dividers in Settings/Tasks that use the same `border-outline`/1px pattern. Static shell markup (sidebar, topbar) gets its Tailwind classes bumped (`border` → `border-2`, `border-b` → `border-b-2`, `border-r` → `border-r-2`, `border-l` → `border-l-2`) in each page's HTML. The calendar grid, built dynamically by `dashboard.js`, gets its CSS updated directly in `dashboard.css` (border widths already hardcoded there as `1px solid #1a1c1c`, becoming `2px`).

**Hard shadows:** `shadow-neo-sm` (`2px 2px 0px 0px rgba(0,0,0,1)`) already exists as a token and is already used on buttons/modals — it's just never applied to the calendar grid. New CSS in `dashboard.css` adds it to the interactive-selection state (see Section 3) rather than to every cell — indiscriminate shadows on every cell would be visual noise, not polish.

**Grid-paper texture:** a new CSS rule on the calendar's main scroll container (`#calendar-grid`'s parent, `main#main` in `dashboard.html`) — faint 20px grid lines using the existing `surface-top`/`#e2e2e2` token, matching Stitch's `.grid-bg`. Purely decorative, additive, zero interaction risk.

---

## 2. Event chips — no change beyond border weight

`.event-pill` keeps its current logic exactly (plain for personal events, `border-left: 3px solid <group_colour>` for shared events) per scope decision 4. Only its border width changes from 1px to 1.5–2px for consistency with the rest of the bolder system.

---

## 3. Cell highlight: "today" vs. interactive "selected"

These are two separate, previously-conflated concerns:

**"Today" marker** — stays exactly as it is today: a subtle, always-on, non-interactive indicator (current `.month-cell.today`/`.week-cell.today` treatment — background/text tint). Purely informational; not tied to hover or click.

**"Selected" (the bold-border + hard-shadow "pop")** — becomes purely interaction-driven, per the user's explicit spec:
- **Hover:** `.month-cell:hover`/`.week-cell:hover` gets `border: 2px solid var(--outline); box-shadow: var(--shadow-neo-sm-token)` as a live preview — CSS-only, no JS needed.
- **Click:** persists that same border+shadow treatment on the clicked cell via a new `.selected` class, driven by the existing `selectedDay` state in `dashboard.js` (already tracks "which day's panel is open" — line 25, set in `openDayPanel()`, cleared in `closeDayPanel()`). `makeMonthCell`/the week-view equivalent gains a `selectedDay` parameter (alongside the existing `today` parameter) and applies `.selected` when `dateKey === selectedDay`.
- **Toggle off:** clicking an already-selected day closes it (calls `closeDayPanel()` instead of `openDayPanel()`) rather than re-opening the same panel — a real behavior change to the two existing `cell.addEventListener("click", ...)` handlers (month view line 243, week view line 311).
- **Move selection:** clicking a *different* day calls `openDayPanel()` as it already does, which reassigns `selectedDay` — the previous cell's `.selected` class and the new cell's both need the grid re-rendered to reflect the change, so `openDayPanel()`/`closeDayPanel()` gain a `render()` call (they don't currently trigger one — today, only the day-panel overlay updates, not the grid underneath).

---

## 4. Mini calendar (new component)

A new sidebar section (`extension/dashboard/dashboard.html`, between the nav links and the groups filter), rendered by a new `renderMiniCalendar()` function in `dashboard.js`.

**State model (per brainstorming discussion):** no independent navigation state. The mini calendar always mirrors whatever month `currentDate` (the same state the main grid's prev/next arrows already drive) is showing — its own chevrons call the exact same month-change function the top bar's arrows call, rather than introducing a second parallel "which month is the mini-cal showing" state that could drift out of sync with the main grid. This is simpler than Stitch's literal mockup (which implied independent mini-cal navigation) and avoids a whole class of "why do these two calendars disagree" bugs.

**Interaction:** clicking a date in the mini calendar calls the same `openDayPanel()` used by the main grid (jumps to and opens that day), and the mini calendar's own rendering reads the same `today`/`selectedDay` state as the main grid for its highlight treatment — one source of truth, reused, not duplicated.

**Rendering:** re-rendered on every `render()` call (same trigger as the main grid), so date navigation, event creation/deletion, and day selection all stay in sync automatically without new event-listener plumbing beyond what already exists.

---

## Testing

No existing Jest coverage for `dashboard.js`'s rendering functions (DOM/UI-heavy, consistent with the rest of this file). Verification is manual: load the unpacked extension, confirm border/shadow/texture rendering across all three pages, confirm hover previews the shadow without persisting it, confirm click persists selection until toggled off or moved to another day, confirm the mini calendar stays in sync with the main grid through month navigation and day selection in both directions (main grid → mini-cal, mini-cal → main grid).

---

## Self-review

**Placeholder scan:** none — every file, class name, and existing code hook (`selectedDay`, `openDayPanel`, `closeDayPanel`, line numbers) is named explicitly, verified by reading the actual current source rather than assumed.

**Internal consistency:** Section 3's "today vs. selected" split is consistent with Section 1's "shadows only on the interactive-selection state, not every cell" — the same design decision stated at two levels of detail.

**Scope check:** contained to the extension's UI layer (`extension/dashboard/`, `extension/settings/`, `extension/tasks/`) — no backend, no Supabase schema, no detection-engine changes. Single implementation pass across three pages plus one new component; no decomposition needed.

**Ambiguity check:** "unclicked" (from the user's phrasing) is made explicit as "clicking the already-selected day again closes its panel," not a separate deselect-only gesture — the simplest reading consistent with `closeDayPanel()` already existing as the toggle target.
