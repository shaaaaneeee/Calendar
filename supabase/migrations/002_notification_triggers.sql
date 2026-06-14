-- 002_notification_triggers.sql
-- Run in Supabase SQL editor after 001_social_tables.sql

-- ── Helper RPC: resolve user id by email (used by inviteByEmail in client) ────
create or replace function get_user_id_by_email(email_input text)
returns table (id uuid) language sql security definer as $$
  select id from auth.users where email = email_input limit 1;
$$;

-- ── Trigger: notify group members when an event is shared ─────────────────────
create or replace function notify_event_shared()
returns trigger language plpgsql security definer as $$
declare
  member_row record;
  evt_title  text;
  actor_name text;
  grp_name   text;
begin
  select title into evt_title  from events   where id = new.event_id;
  select display_name into actor_name from profiles where id = new.shared_by;
  select name         into grp_name   from groups   where id = new.group_id;

  for member_row in
    select user_id from group_members
    where group_id = new.group_id
      and user_id <> new.shared_by
  loop
    insert into notifications (user_id, type, payload)
    values (
      member_row.user_id,
      'event_shared',
      jsonb_build_object(
        'event_id',   new.event_id,
        'group_id',   new.group_id,
        'actor_id',   new.shared_by,
        'actor_name', coalesce(actor_name, 'Someone'),
        'preview',    coalesce(evt_title, 'an event'),
        'group_name', coalesce(grp_name, 'a group')
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_event_shared on shared_events;
create trigger trg_notify_event_shared
  after insert on shared_events
  for each row execute function notify_event_shared();


-- ── Trigger: notify event owner when someone RSVPs ───────────────────────────
create or replace function notify_rsvp_updated()
returns trigger language plpgsql security definer as $$
declare
  event_owner uuid;
  actor_name  text;
  evt_title   text;
  grp_id      uuid;
begin
  select created_by, title into event_owner, evt_title
    from events where id = new.event_id;

  if new.user_id = event_owner then
    return new;
  end if;

  select display_name into actor_name from profiles where id = new.user_id;

  select group_id into grp_id from shared_events
  where event_id = new.event_id limit 1;

  insert into notifications (user_id, type, payload)
  values (
    event_owner,
    'rsvp_updated',
    jsonb_build_object(
      'event_id',   new.event_id,
      'group_id',   grp_id,
      'actor_id',   new.user_id,
      'actor_name', coalesce(actor_name, 'Someone'),
      'preview',    coalesce(evt_title, 'an event'),
      'status',     new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_rsvp on rsvps;
create trigger trg_notify_rsvp
  after insert or update on rsvps
  for each row execute function notify_rsvp_updated();


-- ── Trigger: notify all active participants when a comment is added ───────────
create or replace function notify_comment_added()
returns trigger language plpgsql security definer as $$
declare
  member_row  record;
  actor_name  text;
  evt_title   text;
  grp_id      uuid;
  preview     text;
begin
  select display_name into actor_name from profiles where id = new.user_id;
  select title        into evt_title  from events   where id = new.event_id;
  select group_id     into grp_id     from shared_events
  where event_id = new.event_id limit 1;

  preview := left(new.body, 60);

  for member_row in
    select distinct gm.user_id
    from shared_events se
    join group_members gm on gm.group_id = se.group_id
    where se.event_id = new.event_id
      and gm.user_id  <> new.user_id
  loop
    insert into notifications (user_id, type, payload)
    values (
      member_row.user_id,
      'comment_added',
      jsonb_build_object(
        'event_id',   new.event_id,
        'group_id',   grp_id,
        'actor_id',   new.user_id,
        'actor_name', coalesce(actor_name, 'Someone'),
        'preview',    coalesce(evt_title, 'an event'),
        'comment',    preview
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_comment on comments;
create trigger trg_notify_comment
  after insert on comments
  for each row execute function notify_comment_added();
