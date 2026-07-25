-- 011_equipment.sql
-- Equipment List: drone equipment tracking with group sharing.
-- Mirrors the events / shared_events / notify_event_shared pattern from
-- 001_social_tables.sql, 002_notification_triggers.sql, 007_shared_events_readable.sql.
--
-- Safe to re-run from scratch: the RESET block below drops anything this
-- migration creates (in dependency order) before recreating it, so a
-- previous partial/failed run won't cause "already exists" errors.

-- ── RESET ───────────────────────────────────────────────────────────────────
-- CASCADE drops any dependent triggers/policies along with the tables, so we
-- don't need to (and can't safely, if the tables don't exist yet) drop them
-- individually first.

drop table if exists shared_equipment cascade;
drop table if exists equipment cascade;
drop function if exists notify_equipment_shared() cascade;


-- ── TABLES ──────────────────────────────────────────────────────────────────

create table equipment (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users on delete cascade not null,
  name         text not null,
  status       text not null check (status in ('in_use', 'to_prepare', 'maintenance')),
  target_date  date,
  notes        text default '',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table shared_equipment (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment on delete cascade not null,
  group_id     uuid references groups on delete cascade not null,
  shared_by    uuid references auth.users on delete cascade not null,
  shared_at    timestamptz default now(),
  unique (equipment_id, group_id)
);


-- ── RLS: equipment ──────────────────────────────────────────────────────────

alter table equipment enable row level security;

create policy "equipment: owner full access"
  on equipment for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "equipment: readable if shared to my group"
  on equipment for select using (
    exists (
      select 1
      from   shared_equipment
      where  shared_equipment.equipment_id = equipment.id
        and  shared_equipment.group_id     = any(select get_my_group_ids())
    )
  );


-- ── RLS: shared_equipment ───────────────────────────────────────────────────

alter table shared_equipment enable row level security;

create policy "shared_equipment: readable by group members"
  on shared_equipment for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = shared_equipment.group_id
        and group_members.user_id  = auth.uid()
    )
  );

create policy "shared_equipment: insertable by group members"
  on shared_equipment for insert with check (
    auth.uid() = shared_by
    and exists (
      select 1 from group_members
      where group_members.group_id = shared_equipment.group_id
        and group_members.user_id  = auth.uid()
    )
  );

create policy "shared_equipment: deletable by sharer"
  on shared_equipment for delete using (auth.uid() = shared_by);


-- ── notifications: allow 'equipment_shared' type ────────────────────────────

-- Must include every type ever added, not just the original 001 list —
-- 008_cleanup.sql already added 'group_invite' for real, live group-invite
-- notifications. Dropping it here would silently break that feature.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('event_shared', 'rsvp_updated', 'comment_added', 'group_invite', 'equipment_shared'));


-- ── Trigger: notify group members when equipment is shared ─────────────────

create or replace function notify_equipment_shared()
returns trigger language plpgsql security definer as $$
declare
  member_row  record;
  equip_name  text;
  actor_name  text;
  grp_name    text;
begin
  select name         into equip_name from equipment where id = new.equipment_id;
  select display_name into actor_name from profiles  where id = new.shared_by;
  select name         into grp_name   from groups    where id = new.group_id;

  for member_row in
    select user_id from group_members
    where group_id = new.group_id
      and user_id <> new.shared_by
  loop
    insert into notifications (user_id, type, payload)
    values (
      member_row.user_id,
      'equipment_shared',
      jsonb_build_object(
        'equipment_id', new.equipment_id,
        'group_id',     new.group_id,
        'actor_id',     new.shared_by,
        'actor_name',   coalesce(actor_name, 'Someone'),
        'preview',      coalesce(equip_name, 'a piece of equipment'),
        'group_name',   coalesce(grp_name, 'a group')
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_equipment_shared on shared_equipment;
create trigger trg_notify_equipment_shared
  after insert on shared_equipment
  for each row execute function notify_equipment_shared();
