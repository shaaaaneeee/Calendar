-- 017_recurring_events_one_year_horizon.sql
-- Run in the Supabase SQL Editor after 016_recurring_events.sql.
--
-- Bumps materialize_recurrences()'s horizon from 12 weeks to 1 year, so a
-- recurring series stays materialized much further out between dashboard
-- opens. No schema change — just replaces the function body.

create or replace function materialize_recurrences()
returns void language plpgsql security definer as $$
declare
  rec        record;
  first_occ  date;
  step_days  int;
  horizon    date := current_date + interval '1 year';
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
