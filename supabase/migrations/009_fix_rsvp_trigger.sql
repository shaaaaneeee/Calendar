-- 009_fix_rsvp_trigger.sql
-- Fix notify_rsvp_updated: events table uses user_id (not created_by) as owner

create or replace function notify_rsvp_updated()
returns trigger language plpgsql security definer as $$
declare
  event_owner uuid;
  actor_name  text;
  evt_title   text;
  grp_id      uuid;
begin
  select user_id, title into event_owner, evt_title
    from public.events where id = new.event_id;

  -- Skip if the RSVPing user is the event owner, or owner not found
  if event_owner is null or new.user_id = event_owner then
    return new;
  end if;

  select display_name into actor_name from public.profiles where id = new.user_id;

  select group_id into grp_id from public.shared_events
    where event_id = new.event_id limit 1;

  insert into public.notifications (user_id, type, payload)
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
exception when others then
  return new;
end;
$$;
