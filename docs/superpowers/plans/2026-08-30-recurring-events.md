# Recurring Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize "every Tuesday" / "every other Friday" style phrases during detection, and let PlanWise save, materialize, render, and edit/delete real weekly recurring events end-to-end.

**Architecture:** A new `recurrences` table stores one row per series (day-of-week + interval + template fields). A Postgres function `materialize_recurrences()`, called via RPC from the client, turns each series into real `events` rows up to a 12-week horizon — so every occurrence is an ordinary event row that Phase B-D's sharing/RSVP/comments already work with unmodified. `extractor.js` gains two new fields so detection can flag a recurring phrase without changing any existing return values.

**Tech Stack:** Supabase (Postgres, RLS, RPC functions), Chrome Extension MV3 (vanilla JS), Jest for extraction unit tests.

**Spec:** `docs/superpowers/specs/2026-08-30-recurring-events-design.md`

## Global Constraints

- Weekly recurrence only for v1: a day-of-week (0–6, `Date.getDay()`/Postgres `extract(dow ...)` convention, both 0=Sunday) plus an interval of `1` (every week) or `2` (every other week). No monthly/custom-interval/RRULE support.
- Every schema change is additive/nullable — existing one-off events and existing `extractEvent()` callers must keep working unchanged.
- `events.participants` is `text[]` (confirmed via `information_schema.columns` against the live `planwise` Supabase project) — not `jsonb`. `events.event_time` is Postgres `time`, not `text`. Match these exactly in the new `recurrences` table and in `materialize_recurrences()`.
- Two edit/delete granularities only: "this occurrence" or "entire series" — no third "this and following" tier.
- "Delete whole series" removes every occurrence including detached exceptions (no partial survival).

---

## Task 0: SQL migration — `recurrences` table, `events` columns, materialize function

**Files:**
- Create: `supabase/migrations/016_recurring_events.sql`

**Interfaces:**
- Produces: table `recurrences` (columns: `id`, `user_id`, `day_of_week`, `interval_weeks`, `title`, `location`, `event_time`, `participants`, `notes`, `source_text`, `platform`, `materialized_until`, `created_at`); new `events` columns `recurrence_id` (nullable uuid FK) and `is_exception` (boolean, default false); Postgres function `materialize_recurrences()` callable via `db.rpc('materialize_recurrences')`.

- [ ] **Step 1: Write `supabase/migrations/016_recurring_events.sql`**

```sql
-- 016_recurring_events.sql
-- Run in the Supabase SQL Editor after 015_invite_by_username.sql.
--
-- Adds weekly recurring events. A "series" is a row in `recurrences`;
-- each occurrence is materialized as a normal row in `events` (tagged with
-- recurrence_id) so Phase B-D's shared_events/rsvps/comments — which all
-- FK to events.id — work per-occurrence with zero changes.

-- ── recurrences ──────────────────────────────────────────────────────────────
create table if not exists recurrences (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users on delete cascade not null,
  day_of_week        int not null check (day_of_week between 0 and 6),
  interval_weeks     int not null check (interval_weeks in (1, 2)),
  title              text not null,
  location           text,
  event_time         time,
  participants       text[] default '{}',
  notes              text default '',
  source_text        text default '',
  platform           text default '',
  materialized_until date,
  created_at         timestamptz default now()
);

alter table recurrences enable row level security;

create policy "recurrences: owner can select"
  on recurrences for select using (auth.uid() = user_id);
create policy "recurrences: owner can insert"
  on recurrences for insert with check (auth.uid() = user_id);
create policy "recurrences: owner can update"
  on recurrences for update using (auth.uid() = user_id);
create policy "recurrences: owner can delete"
  on recurrences for delete using (auth.uid() = user_id);


-- ── events: link occurrences back to their series ──────────────────────────
alter table events add column if not exists recurrence_id uuid references recurrences(id) on delete cascade;
alter table events add column if not exists is_exception boolean not null default false;

-- Partial unique index (only meaningful for materialized occurrences) —
-- this is the arbiter that makes materialize_recurrences()'s
-- "on conflict ... do nothing" safe to call repeatedly without duplicating rows.
create unique index if not exists events_recurrence_occurrence_uniq
  on events (recurrence_id, event_date)
  where recurrence_id is not null;


-- ── materialize_recurrences() ───────────────────────────────────────────────
-- Extends every one of the calling user's series up to a 12-week horizon by
-- inserting real `events` rows for any missing occurrence dates. Safe to call
-- repeatedly/concurrently: the unique index + "on conflict do nothing" means
-- a date that already has a row is silently skipped, and materialized_until
-- never moves backward, so a deleted single occurrence stays deleted.
create or replace function materialize_recurrences()
returns void language plpgsql security definer as $$
declare
  rec        record;
  first_occ  date;
  step_days  int;
  horizon    date := current_date + interval '12 weeks';
  start_from date;
  occ_date   date;
begin
  for rec in select * from recurrences where user_id = auth.uid() loop
    if rec.materialized_until is not null and rec.materialized_until >= horizon then
      continue; -- already covered through the current horizon
    end if;

    step_days := rec.interval_weeks * 7;
    -- First occurrence: the nearest day_of_week on/after the series was
    -- created. Deterministic and stable across repeated calls since it's
    -- anchored to created_at, not "today" at call time.
    first_occ := rec.created_at::date
      + ((rec.day_of_week - extract(dow from rec.created_at::date)::int + 7) % 7);
    start_from := coalesce(rec.materialized_until, first_occ - 1) + 1;

    occ_date := first_occ;
    while occ_date <= horizon loop
      if occ_date >= start_from then
        insert into events (
          user_id, title, event_date, event_time, location,
          participants, notes, source_text, platform,
          recurrence_id, is_exception
        )
        values (
          rec.user_id, rec.title, occ_date, rec.event_time, rec.location,
          rec.participants, rec.notes, rec.source_text, rec.platform,
          rec.id, false
        )
        on conflict (recurrence_id, event_date) where recurrence_id is not null do nothing;
      end if;
      occ_date := occ_date + step_days;
    end loop;

    update recurrences set materialized_until = horizon where id = rec.id;
  end loop;
end;
$$;

grant execute on function materialize_recurrences() to authenticated;
```

- [ ] **Step 2: Run the migration in Supabase**

Dashboard → SQL Editor → New query → paste the SQL above → Run. Expected: `recurrences` table created, `events` gains `recurrence_id`/`is_exception`, the partial unique index and `materialize_recurrences()` function are created, with no errors.

- [ ] **Step 3: Manually verify `materialize_recurrences()`**

In the SQL Editor, run (replacing the `user_id` with your own, found via `select id from auth.users limit 1;`):

```sql
insert into recurrences (user_id, day_of_week, interval_weeks, title)
values ('<your-user-id>', 2, 1, 'Test Gym') -- 2 = Tuesday
returning id;

select materialize_recurrences();

select event_date, title, recurrence_id, is_exception
from events
where recurrence_id = '<the-id-returned-above>'
order by event_date;
```

Expected: a row for every Tuesday from the nearest upcoming Tuesday through the 12-week horizon, each with `is_exception = false`. Run `select materialize_recurrences();` a second time and re-run the `select` — expected: identical row count (no duplicates).

Then clean up the test data:

```sql
delete from recurrences where title = 'Test Gym';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_recurring_events.sql
git commit -m "feat(db): recurring event series, occurrence materialization"
```

---

## Task 1: Extraction — recognize "every [other] [weekday]"

**Files:**
- Modify: `extension/detection/extractor.js`
- Test: `tests/extractor.test.js`

**Interfaces:**
- Consumes: nothing new (extractor.js is fully standalone per its own header comment).
- Produces: `extractEvent(text, ...)` return object gains `recurrenceDayOfWeek` (`0`-`6` or `null`) and `recurrenceIntervalWeeks` (`1`, `2`, or `null`). All existing fields (`title`, `date`, `time`, `location`, `participants`, `notes`, `rawDate`, `rawTime`, `sourceText`) are unchanged.

- [ ] **Step 1: Write the failing tests**

Open `tests/extractor.test.js`. Replace the entire `describe('Recurring / range extraction — documented gaps', ...)` block (currently lines 170–187) with:

```js
describe('Recurring extraction', () => {

  test('"every Tuesday" sets recurrenceDayOfWeek and a weekly interval', () => {
    const r = extractEvent("gym every Tuesday");
    expect(r.date).not.toBeNull(); // next Tuesday's date
    expect(r.recurrenceDayOfWeek).toBe(2); // Tuesday
    expect(r.recurrenceIntervalWeeks).toBe(1);
    expect(r.title).toBe('Gym');
  });

  test('"every other Friday" sets a bi-weekly interval', () => {
    const r = extractEvent("board game night every other Friday");
    expect(r.date).not.toBeNull(); // resolves to next Friday
    expect(r.recurrenceDayOfWeek).toBe(5); // Friday
    expect(r.recurrenceIntervalWeeks).toBe(2);
  });

  test('a bare weekday with no "every" is not treated as recurring', () => {
    const r = extractEvent("lunch tuesday");
    expect(r.date).not.toBeNull();
    expect(r.recurrenceDayOfWeek).toBeNull();
    expect(r.recurrenceIntervalWeeks).toBeNull();
  });

});
```

Leave the section header comment above it (the `// ─── RECURRING EXTRACTION ───` banner) in place — update its text since "documented gap" is no longer accurate:

```js
// ─────────────────────────────────────────────
// RECURRING EXTRACTION — weekly/bi-weekly only (Phase 1d). See
// docs/superpowers/specs/2026-08-30-recurring-events-design.md for the
// full data model this feeds into.
// ─────────────────────────────────────────────
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- extractor.test.js`
Expected: the three new tests FAIL — `recurrenceDayOfWeek`/`recurrenceIntervalWeeks` are `undefined`, not the expected values, because `extractEvent()` doesn't return those fields yet.

- [ ] **Step 3: Add a day-name-to-index lookup**

In `extension/detection/extractor.js`, right after the existing `WEEKDAY_PATTERN` constant (line 36), add:

```js
// 0=Sunday..6=Saturday — matches both JS Date.getDay() and Postgres
// extract(dow from ...), so no conversion is needed at the Supabase layer.
const DAY_INDEX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};
```

- [ ] **Step 4: Initialize the new fields in `extractDateTime()`**

Find (around line 84-89):

```js
function extractDateTime(text) {
  const now = new Date();
  let date = null;
  let time = null;
  let rawDate = null;
  let rawTime = null;
```

Replace with:

```js
function extractDateTime(text) {
  const now = new Date();
  let date = null;
  let time = null;
  let rawDate = null;
  let rawTime = null;
  let recurrenceDayOfWeek = null;
  let recurrenceIntervalWeeks = null;
```

- [ ] **Step 5: Add the "every [other] [weekday]" check before the standalone-weekday check**

Find the start of the `else` block (around line 110):

```js
  } else {
    // next/this [weekday] — also matches the start of an abbreviated
    // weekday range ("next Fri-Sun" resolves to next Friday; the "-Sun"
    // half is picked up separately by extractNotes() below since this
    // function only returns a single date, not a range).
    const qualifiedDay = text.match(
      new RegExp(`\\b(next|this)\\s+(${WEEKDAY_PATTERN})\\b`, "i")
    );
```

Insert immediately after `} else {`, before the `qualifiedDay` check:

```js
  } else {
    // every [other] [weekday] → recurring weekly/bi-weekly plan. Must run
    // before the standalone-weekday check below, which would otherwise
    // silently swallow "every Tuesday" down to just "tuesday" and lose
    // the recurrence entirely (the documented gap this task closes).
    const everyDay = text.match(
      new RegExp(`\\bevery\\s+(other\\s+)?(${WEEKDAY_PATTERN})\\b`, "i")
    );
    if (everyDay) {
      const dayName = fullDayName(everyDay[2]);
      date = resolveStandaloneDay(dayName);
      rawDate = everyDay[0];
      recurrenceDayOfWeek = DAY_INDEX[dayName];
      recurrenceIntervalWeeks = everyDay[1] ? 2 : 1;
    }

    // next/this [weekday] — also matches the start of an abbreviated
    // weekday range ("next Fri-Sun" resolves to next Friday; the "-Sun"
    // half is picked up separately by extractNotes() below since this
    // function only returns a single date, not a range).
    const qualifiedDay = text.match(
      new RegExp(`\\b(next|this)\\s+(${WEEKDAY_PATTERN})\\b`, "i")
    );
```

Note: `resolveStandaloneDay` is defined later in the file (line 385) but this works fine — function declarations are hoisted, and `extractDateTime` isn't invoked until after the whole module has loaded.

- [ ] **Step 6: Return the new fields from `extractDateTime()`**

Find (around line 372):

```js
  return { date, time, rawDate, rawTime };
```

Replace with:

```js
  return { date, time, rawDate, rawTime, recurrenceDayOfWeek, recurrenceIntervalWeeks };
```

- [ ] **Step 7: Thread the new fields through `extractEvent()`**

Find (around line 652-671):

```js
function extractEvent(text, priorityNames = [], activityWords = [], placeWords = [], triggerWords = []) {
  const { date, time, rawDate, rawTime } = extractDateTime(text);
  const title = extractTitle(text, activityWords, triggerWords);
  const location = extractLocation(text, placeWords);
  const matchedNames = extractMatchedPriorityNames(text, priorityNames);
  const participants = [...new Set([...extractParticipants(text), ...matchedNames])];

  const notes = extractNotes(text);

  return {
    title,
    date,
    time,
    location,
    participants,
    notes,
    rawDate,
    rawTime,
    sourceText: text.trim()
  };
}
```

Replace with:

```js
function extractEvent(text, priorityNames = [], activityWords = [], placeWords = [], triggerWords = []) {
  const { date, time, rawDate, rawTime, recurrenceDayOfWeek, recurrenceIntervalWeeks } = extractDateTime(text);
  const title = extractTitle(text, activityWords, triggerWords);
  const location = extractLocation(text, placeWords);
  const matchedNames = extractMatchedPriorityNames(text, priorityNames);
  const participants = [...new Set([...extractParticipants(text), ...matchedNames])];

  const notes = extractNotes(text);

  return {
    title,
    date,
    time,
    location,
    participants,
    notes,
    rawDate,
    rawTime,
    recurrenceDayOfWeek,
    recurrenceIntervalWeeks,
    sourceText: text.trim()
  };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- extractor.test.js`
Expected: all tests PASS, including the 3 new recurring-extraction tests and every pre-existing test in the file (confirming `date`/`title`/etc. behavior is unchanged for non-recurring phrases).

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS. `tests/detection.test.js` doesn't touch recurrence, but confirms nothing else broke.

- [ ] **Step 10: Commit**

```bash
git add extension/detection/extractor.js tests/extractor.test.js
git commit -m "feat(detection): recognize \"every [other] weekday\" recurrence phrases"
```

---

## Task 2: Supabase client — recurring series CRUD

**Files:**
- Modify: `extension/utils/supabase-client.js`

**Interfaces:**
- Consumes: `db` (existing Supabase client instance in this file), `SupabaseAuth.getUser()` (existing).
- Produces on `SupabaseEvents`:
  - `createRecurring(series)` — `series: { dayOfWeek, intervalWeeks, title, time, location, participants, notes, sourceText, platform }` → inserts the `recurrences` row, immediately materializes, returns the created recurrence row.
  - `materializeRecurrences()` — no args, calls the RPC, throws on error.
  - `updateOccurrence(id, updates)` — `updates: { title, date, time, location, participants, notes }`, same shape as the existing `update()` — updates one occurrence and sets `is_exception = true`.
  - `updateSeries(recurrenceId, updates)` — same `updates` shape (minus `date`, which doesn't apply series-wide) — updates the template and every non-detached occurrence.
  - `deleteSeries(recurrenceId)` — deletes the `recurrences` row (cascades to all its occurrences).

- [ ] **Step 1: Append the new methods to `SupabaseEvents`**

Open `extension/utils/supabase-client.js`. Find the end of the `SupabaseEvents` object — the existing `delete()` method (lines 227-235):

```js
  async delete(id) {
    const { error } = await db
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
```

Insert the new methods immediately before that closing `};`, after the existing `delete()` method:

```js
  async delete(id) {
    const { error } = await db
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Create a new recurring series and immediately materialize its first
   * batch of occurrences, so upcoming dates appear without waiting for
   * the next dashboard load.
   */
  async createRecurring(series) {
    const user = await SupabaseAuth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await db
      .from('recurrences')
      .insert({
        user_id:        user.id,
        day_of_week:    series.dayOfWeek,
        interval_weeks: series.intervalWeeks,
        title:          series.title        || 'Plan',
        event_time:     series.time         || null,
        location:       series.location     || null,
        participants:   series.participants || [],
        notes:          series.notes        || '',
        source_text:    series.sourceText   || '',
        platform:       series.platform     || '',
      })
      .select()
      .single();

    if (error) throw error;

    await SupabaseEvents.materializeRecurrences();
    return data;
  },

  /** Extend the current user's recurring series to the materialization horizon. */
  async materializeRecurrences() {
    const { error } = await db.rpc('materialize_recurrences');
    if (error) throw error;
  },

  /**
   * Edit a single occurrence without affecting the rest of its series.
   * Detaches it (is_exception = true) so a later whole-series edit skips it.
   */
  async updateOccurrence(id, updates) {
    const { data, error } = await db
      .from('events')
      .update({
        title:        updates.title,
        event_date:   updates.date,
        event_time:   updates.time,
        location:     updates.location,
        participants: updates.participants,
        notes:        updates.notes,
        is_exception: true,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Edit every non-detached occurrence of a series: updates the series
   * template (so future materialization uses the new values) and
   * bulk-updates existing occurrence rows, skipping ones already detached
   * via updateOccurrence().
   */
  async updateSeries(recurrenceId, updates) {
    const { error: seriesErr } = await db
      .from('recurrences')
      .update({
        title:        updates.title,
        event_time:   updates.time,
        location:     updates.location,
        participants: updates.participants,
        notes:        updates.notes,
      })
      .eq('id', recurrenceId);
    if (seriesErr) throw seriesErr;

    const { error: occErr } = await db
      .from('events')
      .update({
        title:        updates.title,
        event_time:   updates.time,
        location:     updates.location,
        participants: updates.participants,
        notes:        updates.notes,
      })
      .eq('recurrence_id', recurrenceId)
      .eq('is_exception', false);
    if (occErr) throw occErr;
  },

  /** Delete an entire recurring series — cascades to every occurrence, including detached ones. */
  async deleteSeries(recurrenceId) {
    const { error } = await db.from('recurrences').delete().eq('id', recurrenceId);
    if (error) throw error;
  },
};
```

- [ ] **Step 2: Manually verify in the browser console**

There's no Jest coverage for this file (it talks to a live Supabase client and `chrome.storage`). Load the unpacked extension, open the dashboard page, open its DevTools console, and run:

```js
const series = await window.SupabaseClient.events.createRecurring({
  dayOfWeek: 2, intervalWeeks: 1, title: 'Console Test Gym',
});
console.log(series); // should log the new recurrences row with an id

const all = await window.SupabaseClient.events.getAll();
console.log(all.filter(e => e.recurrence_id === series.id)); // should log ~12 weeks of Tuesday rows

await window.SupabaseClient.events.deleteSeries(series.id); // cleanup
```

Expected: the series row is created, `getAll()` includes several materialized Tuesday occurrences tagged with `recurrence_id`, and `deleteSeries` removes them all.

- [ ] **Step 3: Commit**

```bash
git add extension/utils/supabase-client.js
git commit -m "feat(events): add recurring series CRUD to SupabaseEvents"
```

---

## Task 3: Popup — "Repeats" toggle on the confirm-plan screen

**Files:**
- Modify: `extension/popup/popup.html`
- Modify: `extension/popup/popup.js`

**Interfaces:**
- Consumes: `event.recurrenceDayOfWeek` / `event.recurrenceIntervalWeeks` (from Task 1, present on the `event` object stored by `enqueuePendingEvent()` since it stores whatever `extractEvent()` returned), `Events.createRecurring()` (from Task 2).

- [ ] **Step 1: Add the repeat toggle to `popup.html`**

Open `extension/popup/popup.html`. Find the NOTES field row (around line 78-81):

```html
      <div class="flex flex-col gap-0.5">
        <label class="font-mono text-[8px] font-bold tracking-[0.18em] uppercase text-on-muted">NOTES</label>
        <input type="text" id="field-notes" placeholder="Optional notes" class="border border-outline px-2.5 py-1.5 text-sm bg-surface focus:outline-none focus:bg-surface-low" />
      </div>
```

Insert immediately after that closing `</div>`:

```html
      <div id="repeat-row" class="hidden flex items-center gap-2">
        <input type="checkbox" id="field-repeats" class="w-3.5 h-3.5 cursor-pointer" />
        <label for="field-repeats" id="repeat-label" class="font-mono text-[9px] tracking-wider uppercase text-on-muted cursor-pointer"></label>
      </div>
```

- [ ] **Step 2: Populate and toggle the repeat row in `renderEvent()`**

Open `extension/popup/popup.js`. Find `renderEvent()` (around line 135-150):

```js
function renderEvent(event, totalPending) {
  show("event-card");
  hide("empty");

  el("source-text").textContent      = `"${event.sourceText || ""}"`;
  el("field-title").value            = event.title || "";
  el("field-date").value             = event.date || "";
  el("field-time").value             = event.time || "";
  el("field-location").value         = event.location || "";
  el("field-participants").value     = event.participants?.join(", ") || "";
  el("field-notes").value            = event.notes || "";

  el("queue-info").textContent = totalPending > 1
    ? `${totalPending - 1} more plan${totalPending - 1 > 1 ? "s" : ""} waiting`
    : "";
}
```

Replace with:

```js
const REPEAT_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function renderEvent(event, totalPending) {
  show("event-card");
  hide("empty");

  el("source-text").textContent      = `"${event.sourceText || ""}"`;
  el("field-title").value            = event.title || "";
  el("field-date").value             = event.date || "";
  el("field-time").value             = event.time || "";
  el("field-location").value         = event.location || "";
  el("field-participants").value     = event.participants?.join(", ") || "";
  el("field-notes").value            = event.notes || "";

  if (event.recurrenceDayOfWeek != null) {
    const dayName = REPEAT_DAY_NAMES[event.recurrenceDayOfWeek];
    const cadence = event.recurrenceIntervalWeeks === 2 ? "every other" : "every";
    el("repeat-label").textContent = `Repeats ${cadence} ${dayName}`;
    el("field-repeats").checked = true;
    show("repeat-row");
  } else {
    hide("repeat-row");
  }

  el("queue-info").textContent = totalPending > 1
    ? `${totalPending - 1} more plan${totalPending - 1 > 1 ? "s" : ""} waiting`
    : "";
}
```

- [ ] **Step 3: Branch to `createRecurring` in `handleYes()`**

Find `handleYes()` (around line 157-194):

```js
async function handleYes() {
  if (!currentEvent) return;

  const confirmed = {
    ...currentEvent,
    title:        el("field-title").value.trim(),
    date:         el("field-date").value,
    time:         el("field-time").value,
    location:     el("field-location").value.trim(),
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
```

Replace the `try` block with:

```js
  const repeats = currentEvent.recurrenceDayOfWeek != null && el("field-repeats").checked;

  try {
    if (repeats) {
      await Events.createRecurring({
        dayOfWeek:     currentEvent.recurrenceDayOfWeek,
        intervalWeeks: currentEvent.recurrenceIntervalWeeks,
        title:         confirmed.title,
        time:          confirmed.time,
        location:      confirmed.location,
        participants:  confirmed.participants,
        notes:         confirmed.notes,
        sourceText:    confirmed.sourceText,
      });
    } else {
      await Events.save(confirmed);
    }
  } catch (err) {
    // Supabase failed — save locally so the event isn't lost. Local fallback
    // storage has no concept of a recurring series, so a failed recurring
    // save degrades to one local one-off event for today's date, same as
    // the existing non-recurring fallback.
    console.warn("[PlanWise] Supabase save failed, saving locally:", err.message);
    await PlanStorage.saveConfirmedEvent(confirmed);
  }
```

(Insert this new `const repeats = ...` line right before the existing `if (!overrideOverlap) {` block, not after it — the full function body order is: build `confirmed`, compute `repeats`, check overlap, then the `try` block above.)

- [ ] **Step 4: Manually verify in the extension**

Load the unpacked extension, trigger a detection with recurring phrasing (e.g. type "gym every tuesday at 6pm" in a monitored chat input and send it, or manually queue one via the console using `PlanWiseStorage.enqueuePendingEvent(window.PlanWiseExtractor.extractEvent("gym every tuesday at 6pm"))`), open the popup, and confirm:
- The popup shows a checked "Repeats every Tuesday" row.
- Clicking "Add" creates a series (verify via the dashboard — several upcoming Tuesdays should appear on the calendar).
- Unchecking the box before clicking "Add" saves a single one-off event instead (verify only one date appears).

- [ ] **Step 5: Commit**

```bash
git add extension/popup/popup.html extension/popup/popup.js
git commit -m "feat(popup): add Repeats toggle for recurring plan confirmation"
```

---

## Task 4: Dashboard — materialize on load

**Files:**
- Modify: `extension/dashboard/dashboard.js`

**Interfaces:**
- Consumes: `Events.materializeRecurrences()` (from Task 2).

- [ ] **Step 1: Call `materializeRecurrences()` before loading events**

Open `extension/dashboard/dashboard.js`. Find `loadEvents()` (around line 52-61):

```js
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
```

Replace the `if (user)` branch:

```js
async function loadEvents() {
  try {
    const user = await Auth.getUser();
    if (user) {
      try {
        await Events.materializeRecurrences();
      } catch (err) {
        console.warn("[PlanWise] Failed to materialize recurring events:", err.message);
      }
      allEvents = await Events.getAll();
    } else {
      // Not logged in - fall back to local confirmed events
      const result = await chrome.storage.local.get("confirmedEvents");
      allEvents = result.confirmedEvents || [];
    }
  } catch (err) {
```

A materialization failure is non-fatal — it's logged and the dashboard still loads whatever occurrences already exist, same fallback philosophy as the surrounding code.

- [ ] **Step 2: Manually verify**

Create a recurring series (via Task 3's popup flow, or the console snippet from Task 2 Step 2), then reload the dashboard page. Expected: the console shows no materialization warning, and the calendar renders the upcoming occurrences without any dashboard code changes needed for rendering — `buildDateMap()`/`makeMonthCell()` already bucket by `event_date` regardless of `recurrence_id`.

- [ ] **Step 3: Commit**

```bash
git add extension/dashboard/dashboard.js
git commit -m "feat(dashboard): materialize recurring events on load"
```

---

## Task 5: Dashboard — "This event" vs "Entire series" edit/delete

**Files:**
- Modify: `extension/dashboard/dashboard.html`
- Modify: `extension/dashboard/dashboard.js`

**Interfaces:**
- Consumes: `Events.updateOccurrence()`, `Events.updateSeries()`, `Events.deleteSeries()` (from Task 2), `editingEvent.recurrence_id` (present on any materialized occurrence, since `Events.getAll()` already does `select('*', ...)`).

- [ ] **Step 1: Add the scope radio group to the modal**

Open `extension/dashboard/dashboard.html`. Find the modal's source-quote and error elements (around line 159-160):

```html
    <div id="modal-source" class="modal-quote px-5 py-3 border-t border-outline font-mono text-[11px] text-on-muted bg-surface-low italic hidden"></div>
    <p id="modal-error" class="hidden px-5 py-2 font-mono text-[10px] text-error bg-error-bg border-t border-error/30"></p>
```

Insert a new row between them:

```html
    <div id="modal-source" class="modal-quote px-5 py-3 border-t border-outline font-mono text-[11px] text-on-muted bg-surface-low italic hidden"></div>
    <div id="modal-recurrence-scope" class="hidden px-5 py-2 border-t border-outline flex gap-4 items-center">
      <span class="font-mono text-[9px] font-bold tracking-[0.14em] uppercase text-on-muted">Applies to</span>
      <label class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="radio" name="recurrence-scope" id="modal-scope-occurrence" value="occurrence" checked class="cursor-pointer" />
        This event
      </label>
      <label class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="radio" name="recurrence-scope" id="modal-scope-series" value="series" class="cursor-pointer" />
        Entire series
      </label>
    </div>
    <p id="modal-error" class="hidden px-5 py-2 font-mono text-[10px] text-error bg-error-bg border-t border-error/30"></p>
```

- [ ] **Step 2: Show/hide and reset the scope row in `openModal()`**

Open `extension/dashboard/dashboard.js`. Find the create-mode / edit-mode branch inside `openModal()` (around line 487-516):

```js
  if (!event) {
    // Create mode
    if (labelEl) labelEl.textContent = "ADD EVENT";
    el("modal-field-title").value        = "";
    el("modal-field-date").value         = selectedDay || "";
    el("modal-field-time").value         = "";
    el("modal-field-participants").value = "";
    el("modal-field-location").value     = "";
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
    el("modal-field-location").value     = event.location || "";
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
```

Replace with:

```js
  if (!event) {
    // Create mode
    if (labelEl) labelEl.textContent = "ADD EVENT";
    el("modal-field-title").value        = "";
    el("modal-field-date").value         = selectedDay || "";
    el("modal-field-time").value         = "";
    el("modal-field-participants").value = "";
    el("modal-field-location").value     = "";
    el("modal-field-notes").value        = "";
    el("modal-source").classList.remove("visible");
    hide("modal-delete");
    hide("modal-recurrence-scope");
  } else {
    // Edit mode
    if (labelEl) labelEl.textContent = "EDIT EVENT";
    el("modal-field-title").value        = event.title || "";
    el("modal-field-date").value         = event.event_date || event.date || "";
    el("modal-field-time").value         = event.event_time || event.time || "";
    el("modal-field-participants").value = (event.participants || []).join(", ");
    el("modal-field-location").value     = event.location || "";
    el("modal-field-notes").value        = event.notes || "";

    const sourceText = event.source_text || event.sourceText || "";
    if (sourceText) {
      el("modal-source").textContent = `"${sourceText}"`;
      el("modal-source").classList.add("visible");
    } else {
      el("modal-source").classList.remove("visible");
    }
    show("modal-delete");

    if (event.recurrence_id) {
      el("modal-scope-occurrence").checked = true;
      show("modal-recurrence-scope");
    } else {
      hide("modal-recurrence-scope");
    }
  }
```

- [ ] **Step 3: Branch `handleModalSave()` on scope**

Find `handleModalSave()`'s save/update branch (around line 564-572):

```js
  try {
    let savedId;
    if (editingEvent) {
      await Events.update(editingEvent.id, payload);
      savedId = editingEvent.id;
    } else {
      const newEvent = await Events.save(payload);
      savedId = newEvent?.id;
    }
```

Replace with:

```js
  try {
    let savedId;
    if (editingEvent) {
      if (editingEvent.recurrence_id && el("modal-scope-series").checked) {
        await Events.updateSeries(editingEvent.recurrence_id, payload);
      } else if (editingEvent.recurrence_id) {
        await Events.updateOccurrence(editingEvent.id, payload);
      } else {
        await Events.update(editingEvent.id, payload);
      }
      savedId = editingEvent.id;
    } else {
      const newEvent = await Events.save(payload);
      savedId = newEvent?.id;
    }
```

- [ ] **Step 4: Branch `handleModalDelete()` on scope**

Find `handleModalDelete()` (around line 590-609):

```js
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
    showToast("Delete failed: " + err.message);
  }
}
```

Replace with:

```js
async function handleModalDelete() {
  if (!editingEvent) return;

  const deleteSeries = editingEvent.recurrence_id && el("modal-scope-series").checked;
  const confirmed = window.confirm(
    deleteSeries
      ? `Delete the entire "${editingEvent.title}" series? This cannot be undone.`
      : `Delete "${editingEvent.title}"? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    if (deleteSeries) {
      await Events.deleteSeries(editingEvent.recurrence_id);
    } else {
      await Events.delete(editingEvent.id);
    }
    closeModal();
    closeDayPanel();
    await loadEvents();
    render();
    renderUpcoming();
  } catch (err) {
    console.warn("[PlanWise] Delete failed:", err.message);
    showToast("Delete failed: " + err.message);
  }
}
```

- [ ] **Step 5: Manually verify all four scope combinations**

Using a recurring series created earlier:
1. Open one occurrence, edit its title, leave "This event" selected, save → only that occurrence's title changes; reopen another occurrence from the same series and confirm its title is unchanged.
2. Open a (different) occurrence, edit its title, select "Entire series", save → every occurrence's title changes except the one detached in step 1.
3. Open an occurrence, select "This event", delete → only that date disappears from the calendar.
4. Open any remaining occurrence, select "Entire series", delete → every occurrence of that series disappears, including the one detached in step 1.

- [ ] **Step 6: Commit**

```bash
git add extension/dashboard/dashboard.html extension/dashboard/dashboard.js
git commit -m "feat(dashboard): this-event vs entire-series edit/delete for recurring events"
```

---

## Self-review

**Spec coverage:**
- ✅ `recurrences` table + owner-only RLS — Task 0
- ✅ `events.recurrence_id` / `events.is_exception`, partial unique index — Task 0
- ✅ `materialize_recurrences()`, 12-week horizon, idempotent via unique index + `on conflict do nothing` — Task 0
- ✅ Extraction: `recurrenceDayOfWeek` / `recurrenceIntervalWeeks`, "every"/"every other", standalone weekday unaffected — Task 1
- ✅ `createRecurring`, `materializeRecurrences`, `updateOccurrence`, `updateSeries`, `deleteSeries` — Task 2
- ✅ Save flow: pre-checked "Repeats" toggle, `createRecurring` vs `save` branch — Task 3
- ✅ Materialize on dashboard load — Task 4
- ✅ This-event vs entire-series edit/delete UI — Task 5
- ✅ No rendering changes needed (`buildDateMap`/`makeMonthCell` already work off `event_date`) — confirmed in Task 4 Step 2, not a separate task

**Placeholder scan:** none — every SQL statement, regex, and JS diff is complete and copy-pasteable. The one caveat left inline (Task 2 Step 1's note about checking `delete()`'s exact current destructuring before appending) is a verification instruction, not an unresolved requirement.

**Type consistency:** `recurrenceDayOfWeek`/`recurrenceIntervalWeeks` (Task 1) flow unchanged in name and shape into `SupabaseEvents.createRecurring()`'s `series.dayOfWeek`/`series.intervalWeeks` params (Task 2) via Task 3's explicit mapping; `editingEvent.recurrence_id` (Task 5) matches the column name created in Task 0 and returned by `Events.getAll()`'s `select('*', ...)` unchanged; `updates` shape passed to `updateOccurrence`/`updateSeries` (Task 2) matches the existing `payload` object built in `handleModalSave()` (Task 5) — same keys as the pre-existing `Events.update()` call it replaces.
