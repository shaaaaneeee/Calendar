# PlanWise — Recurring Events

**Date:** 2026-08-30
**Status:** Approved for implementation planning

---

## Overview

`extractDateTime()` in `extension/detection/extractor.js` currently resolves phrases like "every Tuesday" or "every other Friday" to a single next-occurrence date with no recurrence information preserved anywhere — a documented gap, tracked in `TODO.md` and pinned as baseline behavior in `tests/extractor.test.js`'s "Recurring / range extraction — documented gaps" block.

This spec adds real recurring-event support across both layers that need it:

1. **Detection/extraction** — recognize "every [weekday]" and "every other [weekday]" and return recurrence fields instead of silently discarding the qualifier.
2. **App/data layer** — store a repeating series, materialize real per-occurrence rows into Supabase, render them (no rendering changes needed — see below), and support single-occurrence vs whole-series edit/delete.

**Scope for v1:** weekly recurrence only — a day-of-week plus an interval of 1 (every week) or 2 (every other week). No monthly/custom-interval/RRULE support. This matches what the detection engine can realistically recognize from natural language, and covers the overwhelming majority of real recurring plans (gym, standing meetings, game night).

**Constraint that shaped this design:** Phase B-D (groups, shared events, RSVP, comments — already shipped, see `supabase/migrations/001` through `015`) has `shared_events`, `rsvps`, and `comments` all foreign-keying to a single `events.id` row. Any recurrence model that only stores a template and expands "virtual" occurrences at render time would break the ability to RSVP/comment/share an individual occurrence, since virtual occurrences have no real row to attach to. This spec avoids that by materializing real `events` rows for every occurrence.

---

## Data model

### New table: `recurrences`

One row per repeating series. Owner-only RLS, matching the existing private-data pattern (recurring events are not shared by default — sharing continues to work the same way it does for one-off events, via `shared_events` referencing the materialized occurrence's `event_id`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | `default gen_random_uuid()` |
| `user_id` | `uuid` | `references auth.users on delete cascade not null` |
| `day_of_week` | `int` | `0`–`6`, `check (day_of_week between 0 and 6)` |
| `interval_weeks` | `int` | `check (interval_weeks in (1, 2))` — `1` = every week, `2` = every other week |
| `title` | `text` | template field, copied onto each occurrence |
| `location` | `text` | template field |
| `event_time` | `text` | template field, same `HH:MM` format as `events.event_time` |
| `participants` | `jsonb` | template field, `default '[]'` |
| `notes` | `text` | template field, `default ''` |
| `source_text` | `text` | template field, `default ''` |
| `platform` | `text` | template field, `default ''` |
| `materialized_until` | `date` | watermark — occurrence rows exist up through this date |
| `created_at` | `timestamptz` | `default now()` |

RLS: `select`/`update`/`delete` restricted to `auth.uid() = user_id`, same shape as other owner-only tables in this project.

### Changes to existing `events` table

Two new nullable columns:

| Column | Type | Notes |
|---|---|---|
| `recurrence_id` | `uuid` | `references recurrences(id) on delete cascade`, nullable — `null` means an ordinary one-off event (today's default, unchanged) |
| `is_exception` | `boolean` | `not null default false` — `true` means this occurrence was individually edited and is detached from whole-series edits |

Plus a unique constraint: `unique (recurrence_id, event_date)` — enforced only meaningfully when `recurrence_id is not null`, and is what makes materialization idempotent (see below).

**Why this shape works:** a materialized occurrence is a completely normal `events` row — same columns, same RLS, same everything — just tagged with `recurrence_id`. `shared_events`, `rsvps`, and `comments` need zero schema or code changes to work per-occurrence, because they already just reference `events.id`. `dashboard.js`'s `buildDateMap()` needs zero changes either, since it already buckets whatever rows exist in `allEvents` by `event_date` — it has no idea whether a row came from a recurrence or not, and doesn't need to.

---

## Materialization

A single Postgres function, `materialize_recurrences()`, does all the work of turning series definitions into real rows:

- For every `recurrences` row where `materialized_until < today + 12 weeks`:
  - Compute the missing occurrence dates from `materialized_until + 1` (or the series' start date, if never materialized) up through the new 12-week horizon, stepping by `day_of_week` / `interval_weeks`.
  - Insert one `events` row per missing date, copying the template fields (`title`, `location`, `event_time`, `participants`, `notes`, `source_text`, `platform`) from the `recurrences` row, with `recurrence_id` set and `is_exception = false`.
  - Insert uses `on conflict (recurrence_id, event_date) do nothing`, so calling this function repeatedly or concurrently is always safe and never duplicates rows.
  - Update `materialized_until` to the new horizon.
- Exposed to the client as a Postgres RPC (`supabase.rpc('materialize_recurrences')`).

**Trigger points (client-driven, no new infra):**
1. On dashboard load (cheap no-op on every call after the first in a given window).
2. Immediately after creating a new recurring series, so the next several weeks of occurrences appear right away rather than waiting for the next load.

**Why this stays durable long-term:** the entire materialization decision — dates, template copy, idempotency — lives inside one Postgres function. The client is just a trigger mechanism. If a fully server-driven schedule is ever wanted (so occurrences keep materializing even while the extension is closed for a long stretch), the addition is `select cron.schedule('materialize-recurrences', '0 3 * * *', $$select materialize_recurrences()$$)` — a one-line addition to Supabase, calling the exact same function. No schema change, no function rewrite, no client change required to add that later.

---

## Edit / delete semantics

Two granularities, matching what a recurring occurrence actually needs:

- **Delete one occurrence** → `DELETE` that single `events` row (existing `SupabaseEvents.delete()`, unchanged). Since `materialized_until` never rewinds, this date won't be regenerated by a later materialization pass.
- **Delete whole series** → `DELETE` the `recurrences` row. Cascades to every `events` row with that `recurrence_id`, including any detached exceptions — deleting the series removes everything, including customized occurrences.
- **Edit one occurrence** → update that `events` row's fields directly and set `is_exception = true`. It's now permanently detached from series-wide edits (but stays attached to the series for filtering/display purposes via `recurrence_id`).
- **Edit whole series** → update the `recurrences` template row, then bulk-update every `events` row under that `recurrence_id` where `is_exception = false` (rows already detached are skipped). Applies to past and future occurrences alike — there is no "this and following" third tier for v1.

**UI touchpoint:** the dashboard's event-detail view, when opening an occurrence that has a non-null `recurrence_id`, offers "This event" vs "Entire series" as a choice on both edit and delete, instead of today's single-target action.

---

## Extraction changes (`extractor.js`)

Add an "every [weekday]" / "every other [weekday]" check that runs **before** the existing standalone-weekday match, which today silently consumes "every Tuesday" down to just "tuesday" with the qualifier discarded.

`extractEvent()` gains two new fields, additive so nothing downstream breaks:

- `recurrenceDayOfWeek` — `0`–`6`, or `null` when the phrase isn't recurring.
- `recurrenceIntervalWeeks` — `1` or `2`, or `null` when not recurring.

`date` keeps resolving to the next occurrence exactly as it does today (unchanged), so any caller not yet aware of recurrence continues to work.

---

## Save flow

When extraction returns non-null recurrence fields, the confirm-plan UI shows a pre-checked, editable toggle: "Repeats every Tuesday" (or "every other Friday"). On save:

- **Recurring** (toggle checked) → new `SupabaseEvents.createRecurring(seriesData)`:
  1. Inserts the `recurrences` row.
  2. Immediately calls `materialize_recurrences()` via RPC so upcoming occurrences appear without waiting for a reload.
- **Not recurring** (toggle unchecked, or extraction found no recurrence) → existing `SupabaseEvents.save()` path, completely unchanged.

---

## Testing

- **`tests/extractor.test.js`**: replace the two tests in the "Recurring / range extraction — documented gaps" block with real assertions:
  - `"gym every Tuesday"` → `recurrenceDayOfWeek` = Tuesday's index, `recurrenceIntervalWeeks` = `1`.
  - `"board game night every other Friday"` → `recurrenceDayOfWeek` = Friday's index, `recurrenceIntervalWeeks` = `2`.
  - A bare `"Tuesday"` (no "every") still resolves `date` as today, with both new recurrence fields `null` — confirms ordinary one-off extraction is unaffected.
- **`materialize_recurrences()`**: verified manually via the Supabase SQL editor (insert a test `recurrences` row, run the function, confirm the right dates appear and `materialized_until` advances correctly, and confirm a second call is a no-op). Not a JS unit test, since it's a DB-side function.
- **Dashboard rendering**: no new tests required — `buildDateMap()` and `makeMonthCell()` are unchanged and already covered by existing behavior, since materialized occurrences are indistinguishable from one-off events at the rendering layer.

---

## Self-review

**Placeholder scan:** no TBDs remaining — materialization horizon (12 weeks), interval values (1/2 only), and the single-vs-series edit boundary are all fully specified.

**Internal consistency:** `events.recurrence_id` nullability matches "one-off events unaffected"; `is_exception` default `false` matches "freshly materialized rows are never exceptions"; the unique constraint `(recurrence_id, event_date)` is what makes the `on conflict do nothing` idempotency claim in Materialization actually hold.

**Scope check:** focused enough for a single implementation plan — one new table, two new columns on an existing table, one Postgres function, extraction changes in one file, save/edit/delete UI changes in the dashboard.

**Ambiguity check:** "whole series edit" explicitly excludes a third "this and following" tier per the approved design; "delete whole series" explicitly includes exceptions (no partial survival) — both stated outright rather than left implicit.
