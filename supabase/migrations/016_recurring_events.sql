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
