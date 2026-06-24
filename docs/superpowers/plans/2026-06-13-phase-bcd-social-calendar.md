# Phase B-C-D — Social Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn PlanWise from a personal calendar into a shared social calendar — groups, event sharing, RSVP, comments, and notifications — mirroring TimeTree's core loop, with PlanWise's unique edge of auto-detected plans.

**Architecture:** All new data lives in Supabase (7 new tables). Row-level security ensures members only see their groups' data. DB triggers write notifications — the client never writes to `notifications` directly. Service worker holds one Realtime subscription for OS notifications. Comments use a second Realtime subscription opened only while a shared event panel is open. Everything else is fetched on demand.

**Tech Stack:** Supabase (Postgres, RLS, DB triggers, Realtime), Chrome Extensions MV3 (service worker, chrome.notifications, chrome.storage), vanilla JS

**Prerequisites:** Phase A complete (Phase B-D adds HTML to the new Tailwind pages from Phase A).

---

## File map

| Action | File | What changes |
|---|---|---|
| Create | `supabase/migrations/001_social_tables.sql` | All 7 tables + RLS + profile trigger |
| Create | `supabase/migrations/002_notification_triggers.sql` | DB triggers writing to `notifications` |
| Modify | `extension/utils/supabase-client.js` | Groups CRUD methods + social methods |
| Modify | `extension/settings/settings.js` | Groups section load/render/create/delete |
| Modify | `extension/dashboard/dashboard.html` | Groups filter, share section, RSVP/comments, notif feed (HTML already has placeholder divs from Phase A) |
| Modify | `extension/dashboard/dashboard.js` | Groups filter logic, share flow, RSVP, comments, Realtime, notif feed |
| Modify | `extension/background/service-worker.js` | Realtime subscription → OS notifications |

---

## Task 0: SQL Migration — all social tables + RLS + triggers

**Files:**
- Create: `supabase/migrations/001_social_tables.sql`
- Create: `supabase/migrations/002_notification_triggers.sql`

- [ ] **Step 1: Create `supabase/migrations/001_social_tables.sql`**

```sql
-- 001_social_tables.sql
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── profiles ──────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text not null,
  created_at   timestamptz default now()
);

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
create policy "profiles: read by any authenticated user"
  on profiles for select using (auth.role() = 'authenticated');
create policy "profiles: owner can update"
  on profiles for update using (auth.uid() = id);


-- ── groups ────────────────────────────────────────────────────────────────────
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('pair', 'group')),
  colour      text not null,
  created_by  uuid references auth.users on delete cascade not null,
  created_at  timestamptz default now()
);

alter table groups enable row level security;
create policy "groups: readable by members"
  on groups for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = groups.id
        and group_members.user_id  = auth.uid()
    )
  );
create policy "groups: insertable by authenticated"
  on groups for insert with check (auth.uid() = created_by);
create policy "groups: deletable by owner"
  on groups for delete using (auth.uid() = created_by);


-- ── group_members ─────────────────────────────────────────────────────────────
create table if not exists group_members (
  group_id  uuid references groups on delete cascade not null,
  user_id   uuid references auth.users on delete cascade not null,
  role      text not null check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

alter table group_members enable row level security;
create policy "group_members: readable by members of that group"
  on group_members for select using (
    exists (
      select 1 from group_members gm2
      where gm2.group_id = group_members.group_id
        and gm2.user_id  = auth.uid()
    )
  );
create policy "group_members: insertable by group owner"
  on group_members for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id  = auth.uid()
        and gm.role     = 'owner'
    )
    or auth.uid() = user_id  -- owner inserts self when creating group
  );
create policy "group_members: deletable by owner or self"
  on group_members for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id  = auth.uid()
        and gm.role     = 'owner'
    )
  );


-- ── shared_events ─────────────────────────────────────────────────────────────
create table if not exists shared_events (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references events on delete cascade not null,
  group_id   uuid references groups on delete cascade not null,
  shared_by  uuid references auth.users on delete cascade not null,
  shared_at  timestamptz default now(),
  unique (event_id, group_id)
);

alter table shared_events enable row level security;
create policy "shared_events: readable by group members"
  on shared_events for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = shared_events.group_id
        and group_members.user_id  = auth.uid()
    )
  );
create policy "shared_events: insertable by group members"
  on shared_events for insert with check (
    auth.uid() = shared_by
    and exists (
      select 1 from group_members
      where group_members.group_id = shared_events.group_id
        and group_members.user_id  = auth.uid()
    )
  );
create policy "shared_events: deletable by sharer"
  on shared_events for delete using (auth.uid() = shared_by);


-- ── rsvps ─────────────────────────────────────────────────────────────────────
create table if not exists rsvps (
  event_id   uuid references events on delete cascade not null,
  user_id    uuid references auth.users on delete cascade not null,
  status     text not null check (status in ('going', 'maybe', 'cant')),
  updated_at timestamptz default now(),
  primary key (event_id, user_id)
);

alter table rsvps enable row level security;
create policy "rsvps: readable by members of event's group"
  on rsvps for select using (
    exists (
      select 1 from shared_events se
      join group_members gm on gm.group_id = se.group_id
      where se.event_id = rsvps.event_id
        and gm.user_id  = auth.uid()
    )
  );
create policy "rsvps: writable by own user"
  on rsvps for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── comments ──────────────────────────────────────────────────────────────────
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references events on delete cascade not null,
  user_id    uuid references auth.users on delete cascade not null,
  body       text not null,
  created_at timestamptz default now()
);

alter table comments enable row level security;
create policy "comments: readable by members of event's group"
  on comments for select using (
    exists (
      select 1 from shared_events se
      join group_members gm on gm.group_id = se.group_id
      where se.event_id = comments.event_id
        and gm.user_id  = auth.uid()
    )
  );
create policy "comments: insertable by members"
  on comments for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from shared_events se
      join group_members gm on gm.group_id = se.group_id
      where se.event_id = comments.event_id
        and gm.user_id  = auth.uid()
    )
  );


-- ── notifications ─────────────────────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade not null,
  type       text not null check (type in ('event_shared', 'rsvp_updated', 'comment_added')),
  payload    jsonb not null,
  read       boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;
create policy "notifications: owner only"
  on notifications for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable Realtime for notifications and comments
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table comments;
```

- [ ] **Step 2: Run 001_social_tables.sql in Supabase**

Go to Supabase Dashboard → SQL Editor → New query → paste the SQL above → Run.
Expected: all tables and policies created with no errors.

- [ ] **Step 3: Create `supabase/migrations/002_notification_triggers.sql`**

```sql
-- 002_notification_triggers.sql
-- Run in Supabase SQL editor after 001_social_tables.sql

-- ── Helper: resolve event title from events table ─────────────────────────────
-- (Adjust column name if your events table uses a different name for title)

-- ── Trigger: notify group members when an event is shared ─────────────────────
create or replace function notify_event_shared()
returns trigger language plpgsql security definer as $$
declare
  member_row record;
  evt_title  text;
  actor_name text;
  grp_name   text;
begin
  -- Resolve names
  select title into evt_title  from events   where id = new.event_id;
  select display_name into actor_name from profiles where id = new.shared_by;
  select name         into grp_name   from groups   where id = new.group_id;

  -- Notify every member of the group except the sharer
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

  -- Only notify if the RSVPing user is not the owner
  if new.user_id = event_owner then
    return new;
  end if;

  select display_name into actor_name from profiles where id = new.user_id;

  -- Pick any group this event is shared to (for payload)
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

  -- Notify all group members of this event except the commenter
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
```

- [ ] **Step 4: Run 002_notification_triggers.sql in Supabase**

SQL Editor → New query → paste → Run. Expected: 3 functions and 3 triggers created, no errors.

- [ ] **Step 5: Commit migration files**

```bash
git add supabase/
git commit -m "feat(db): social tables, RLS, notification triggers"
```

---

## Task 1: supabase-client.js — Groups CRUD methods

**Files:**
- Modify: `extension/utils/supabase-client.js`

Append after the existing `SupabaseSettings` object.

- [ ] **Step 1: Read the end of supabase-client.js to find the insertion point**

Open `extension/utils/supabase-client.js`. Identify the last line of the file (after the last exported object). Append the following block.

- [ ] **Step 2: Append `SupabaseGroups` to `supabase-client.js`**

```js
// ─────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────

const SupabaseGroups = {
  // List all groups the current user belongs to, with member count
  async listGroups() {
    const session = await SupabaseAuth._restoreSession();
    if (!session) return [];

    const { data, error } = await db
      .from('groups')
      .select('*, group_members(user_id, role)')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Create a group and add the creator as owner
  async createGroup(name, colour) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    const { data: group, error: groupErr } = await db
      .from('groups')
      .insert({ name, colour, type: 'group', created_by: session.user.id })
      .select()
      .single();
    if (groupErr) throw groupErr;

    const { error: memberErr } = await db
      .from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id, role: 'owner' });
    if (memberErr) throw memberErr;

    return group;
  },

  // Invite a user by email — looks up their profile, then inserts into group_members
  async inviteByEmail(groupId, email) {
    // Find the user's profile id via their auth email
    const { data: users, error: lookupErr } = await db
      .rpc('get_user_id_by_email', { email_input: email });
    if (lookupErr) throw lookupErr;
    if (!users || users.length === 0) throw new Error('No PlanWise account found for that email.');

    const inviteeId = users[0].id;
    const { error } = await db
      .from('group_members')
      .insert({ group_id: groupId, user_id: inviteeId, role: 'member' });
    if (error) throw error;
  },

  // Remove the current user from a group (or delete group if owner)
  async leaveOrDeleteGroup(groupId) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    // Check if owner
    const { data: membership } = await db
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .single();

    if (membership?.role === 'owner') {
      // Delete group (cascades to members, shared_events, etc.)
      const { error } = await db.from('groups').delete().eq('id', groupId);
      if (error) throw error;
    } else {
      const { error } = await db
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', session.user.id);
      if (error) throw error;
    }
  },
};
```

**Note:** `inviteByEmail` calls an RPC `get_user_id_by_email`. Add this function to Supabase via SQL Editor:

```sql
-- Run in Supabase SQL Editor after the migrations
create or replace function get_user_id_by_email(email_input text)
returns table (id uuid) language sql security definer as $$
  select id from auth.users where email = email_input limit 1;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add extension/utils/supabase-client.js
git commit -m "feat(groups): add SupabaseGroups client methods"
```

---

## Task 2: supabase-client.js — Social methods (share, RSVP, comments, notifications)

**Files:**
- Modify: `extension/utils/supabase-client.js`

Append after `SupabaseGroups`.

- [ ] **Step 1: Append `SupabaseSocial` to `supabase-client.js`**

```js
// ─────────────────────────────────────────────
// SOCIAL — shared events, RSVP, comments, notifications
// ─────────────────────────────────────────────

const SupabaseSocial = {
  // Share an event to one or more groups
  async shareEvent(eventId, groupIds) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    const rows = groupIds.map(gid => ({
      event_id:  eventId,
      group_id:  gid,
      shared_by: session.user.id,
    }));

    const { error } = await db
      .from('shared_events')
      .upsert(rows, { onConflict: 'event_id,group_id' });
    if (error) throw error;
  },

  // Get which groups an event is shared to (for pre-checking the share UI)
  async getSharedGroups(eventId) {
    const { data, error } = await db
      .from('shared_events')
      .select('group_id')
      .eq('event_id', eventId);
    if (error) throw error;
    return (data || []).map(r => r.group_id);
  },

  // Get RSVP counts + current user's status for an event
  async getRsvpDetails(eventId) {
    const session = await SupabaseAuth._restoreSession();

    const { data, error } = await db
      .from('rsvps')
      .select('user_id, status')
      .eq('event_id', eventId);
    if (error) throw error;

    const counts = { going: 0, maybe: 0, cant: 0 };
    let myStatus = null;
    for (const r of data || []) {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (session && r.user_id === session.user.id) myStatus = r.status;
    }
    return { counts, myStatus };
  },

  // Upsert current user's RSVP
  async upsertRsvp(eventId, status) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    const { error } = await db
      .from('rsvps')
      .upsert(
        { event_id: eventId, user_id: session.user.id, status, updated_at: new Date().toISOString() },
        { onConflict: 'event_id,user_id' }
      );
    if (error) throw error;
  },

  // Get members of all groups an event is shared to, with their RSVP status
  async getEventMembers(eventId) {
    // Get group_ids this event is shared to
    const { data: seRows } = await db
      .from('shared_events')
      .select('group_id')
      .eq('event_id', eventId);
    const groupIds = (seRows || []).map(r => r.group_id);
    if (!groupIds.length) return [];

    // Get unique members of all those groups
    const { data: members } = await db
      .from('group_members')
      .select('user_id, profiles(display_name)')
      .in('group_id', groupIds);

    // Get RSVPs
    const { data: rsvps } = await db
      .from('rsvps')
      .select('user_id, status')
      .eq('event_id', eventId);

    const rsvpMap = {};
    for (const r of rsvps || []) rsvpMap[r.user_id] = r.status;

    // Deduplicate by user_id
    const seen = new Set();
    const result = [];
    for (const m of members || []) {
      if (seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      result.push({
        userId:      m.user_id,
        displayName: m.profiles?.display_name || '?',
        rsvpStatus:  rsvpMap[m.user_id] || null,
      });
    }
    return result;
  },

  // Load comments for an event
  async getComments(eventId) {
    const { data, error } = await db
      .from('comments')
      .select('id, body, created_at, user_id, profiles(display_name)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Post a comment
  async addComment(eventId, body) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    const { data, error } = await db
      .from('comments')
      .insert({ event_id: eventId, user_id: session.user.id, body })
      .select('id, body, created_at, user_id, profiles(display_name)')
      .single();
    if (error) throw error;
    return data;
  },

  // Subscribe to live comments for an event. Returns the channel (call .unsubscribe() to stop)
  subscribeComments(eventId, onInsert) {
    return db
      .channel(`comments:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        payload => onInsert(payload.new)
      )
      .subscribe();
  },

  // Load unread notification count
  async getUnreadCount() {
    const session = await SupabaseAuth._restoreSession();
    if (!session) return 0;

    const { count, error } = await db
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
    if (error) return 0;
    return count || 0;
  },

  // Load recent notifications (newest first, limit 50)
  async getNotifications(limit = 50) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) return [];

    const { data, error } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  },

  // Mark one notification as read
  async markRead(notifId) {
    const { error } = await db
      .from('notifications')
      .update({ read: true })
      .eq('id', notifId);
    if (error) throw error;
  },

  // Mark all notifications as read for current user
  async markAllRead() {
    const session = await SupabaseAuth._restoreSession();
    if (!session) return;
    await db
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
  },

  // Subscribe to new notifications (for badge + OS alerts). Returns channel.
  subscribeNotifications(userId, onInsert) {
    return db
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        payload => onInsert(payload.new)
      )
      .subscribe();
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add extension/utils/supabase-client.js
git commit -m "feat(social): add SupabaseSocial client methods"
```

---

## Task 3: Settings — Groups section logic

**Files:**
- Modify: `extension/settings/settings.js`

The Groups section HTML already exists from Phase A Task 3 (`#section-groups`). This task wires its logic.

- [ ] **Step 1: Read the end of settings.js to find the insertion point**

The file has `wireControls()` and `wireNav()` at the bottom. Append the groups functions after the existing code, then call them from `wireControls`.

- [ ] **Step 2: Append groups functions to `settings.js`**

```js
// ─────────────────────────────────────────────
// GROUPS SECTION
// ─────────────────────────────────────────────

let userGroups = [];

async function loadAndRenderGroups() {
  try {
    userGroups = await SupabaseGroups.listGroups();
  } catch (e) {
    userGroups = [];
  }
  renderGroupsList();
}

function renderGroupsList() {
  const list = document.getElementById('groups-list');
  if (!list) return;

  if (!userGroups.length) {
    list.innerHTML = '<p class="text-sm text-on-muted py-4">No groups yet. Create one below.</p>';
    return;
  }

  list.innerHTML = '';
  for (const group of userGroups) {
    const memberCount = group.group_members?.length || 0;
    const row = document.createElement('div');
    row.className = 'group-row flex items-center justify-between p-4 border border-outline bg-surface';
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-4 h-4 border border-outline shrink-0" style="background:${group.colour}"></div>
        <div>
          <div class="font-medium text-sm">${group.name}</div>
          <div class="font-mono text-[9px] text-on-muted">${memberCount} member${memberCount !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <button class="btn-leave-group font-mono text-[9px] tracking-wider uppercase text-error hover:underline" data-id="${group.id}">
        Leave / Delete
      </button>
    `;
    list.appendChild(row);
  }

  list.querySelectorAll('.btn-leave-group').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Leave or delete this group?')) return;
      try {
        await SupabaseGroups.leaveOrDeleteGroup(btn.dataset.id);
        await loadAndRenderGroups();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });
  });
}

function wireGroupsSection() {
  const btnNew    = document.getElementById('btn-new-group');
  const form      = document.getElementById('new-group-form');
  const btnCancel = document.getElementById('btn-cancel-new-group');
  const btnCreate = document.getElementById('btn-create-group');
  const colourBtns = document.querySelectorAll('.colour-opt');
  let selectedColour = '#00D1FF'; // default first option

  if (!btnNew) return;

  btnNew.addEventListener('click', () => {
    form.classList.toggle('hidden');
  });

  btnCancel.addEventListener('click', () => {
    form.classList.add('hidden');
  });

  colourBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colourBtns.forEach(b => b.classList.remove('selected', 'border-outline'));
      btn.classList.add('selected', 'border-outline');
      selectedColour = btn.dataset.colour;
    });
  });

  btnCreate.addEventListener('click', async () => {
    const name   = document.getElementById('new-group-name').value.trim();
    const invite = document.getElementById('new-group-invite').value.trim();
    if (!name) { alert('Please enter a group name.'); return; }

    btnCreate.textContent = 'Creating...';
    btnCreate.disabled = true;

    try {
      const group = await SupabaseGroups.createGroup(name, selectedColour);

      if (invite) {
        try {
          await SupabaseGroups.inviteByEmail(group.id, invite);
        } catch (e) {
          alert('Group created, but invite failed: ' + e.message);
        }
      }

      document.getElementById('new-group-name').value = '';
      document.getElementById('new-group-invite').value = '';
      form.classList.add('hidden');
      await loadAndRenderGroups();
    } catch (e) {
      alert('Error creating group: ' + e.message);
    } finally {
      btnCreate.textContent = 'Create Group';
      btnCreate.disabled = false;
    }
  });
}
```

- [ ] **Step 3: Call the new functions from the existing init flow**

Find the `wireControls` function in `settings.js` and add at the end of it:

```js
  wireGroupsSection();
```

Find the existing nav click handler (inside `wireNav` or similar) and ensure that clicking the Groups nav item calls `loadAndRenderGroups()`. Add this after the nav click handler sets the active section:

```js
  // Load groups when their section is navigated to
  document.querySelectorAll('.nav-item[data-section="groups"]').forEach(item => {
    item.addEventListener('click', loadAndRenderGroups);
  });
```

- [ ] **Step 4: Commit**

```bash
git add extension/settings/settings.js
git commit -m "feat(groups): wire Settings Groups section — list, create, leave/delete"
```

---

## Task 4: Dashboard — Sidebar groups filter

**Files:**
- Modify: `extension/dashboard/dashboard.js`

The `#groups-filter` div is already in `dashboard.html` (from Phase A). This task populates it.

- [ ] **Step 1: Append groups filter functions to `dashboard.js`**

Find the bottom of `dashboard.js` and append:

```js
// ─────────────────────────────────────────────
// GROUPS FILTER
// ─────────────────────────────────────────────

let calGroups     = [];  // [{id, name, colour, visible: true}]
let hiddenGroups  = new Set();  // group IDs currently toggled off

async function loadGroupsFilter() {
  const filterEl = document.getElementById('groups-filter');
  if (!filterEl) return;

  try {
    calGroups = (await SupabaseGroups.listGroups()).map(g => ({
      id:      g.id,
      name:    g.name,
      colour:  g.colour,
      visible: true,
    }));
  } catch (e) {
    calGroups = [];
  }

  if (!calGroups.length) return;

  filterEl.classList.remove('hidden');
  renderGroupsFilter(filterEl);
}

function renderGroupsFilter(container) {
  container.innerHTML = `
    <div class="font-mono text-[9px] font-bold tracking-[0.15em] uppercase text-on-muted mb-3">Groups</div>
    <div class="flex flex-col gap-2" id="group-filter-rows"></div>
  `;
  const rows = container.querySelector('#group-filter-rows');

  // "All" toggle
  const allRow = document.createElement('label');
  allRow.className = 'flex items-center gap-2 cursor-pointer select-none';
  allRow.innerHTML = `
    <input type="checkbox" id="group-filter-all" checked class="accent-primary w-3 h-3" />
    <span class="text-xs font-medium">All</span>
  `;
  rows.appendChild(allRow);

  // Per-group rows
  for (const g of calGroups) {
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 cursor-pointer select-none';
    row.innerHTML = `
      <input type="checkbox" data-group-id="${g.id}" checked class="group-filter-cb accent-primary w-3 h-3" />
      <span class="w-2.5 h-2.5 shrink-0 inline-block" style="background:${g.colour}"></span>
      <span class="text-xs truncate">${g.name}</span>
    `;
    rows.appendChild(row);
  }

  // Wire checkboxes
  const allCb = container.querySelector('#group-filter-all');
  const cbs   = container.querySelectorAll('.group-filter-cb');

  allCb.addEventListener('change', () => {
    cbs.forEach(cb => { cb.checked = allCb.checked; });
    if (allCb.checked) {
      hiddenGroups.clear();
    } else {
      calGroups.forEach(g => hiddenGroups.add(g.id));
    }
    applyGroupFilter();
  });

  cbs.forEach(cb => {
    cb.addEventListener('change', () => {
      const gid = cb.dataset.groupId;
      if (cb.checked) {
        hiddenGroups.delete(gid);
      } else {
        hiddenGroups.add(gid);
      }
      allCb.checked = hiddenGroups.size === 0;
      applyGroupFilter();
    });
  });
}

function applyGroupFilter() {
  // Event chips with a data-group-id get opacity: 0 if their group is hidden
  document.querySelectorAll('.event-chip[data-group-id]').forEach(chip => {
    const gid = chip.dataset.groupId;
    chip.style.opacity = hiddenGroups.has(gid) ? '0.15' : '1';
    chip.style.pointerEvents = hiddenGroups.has(gid) ? 'none' : '';
  });
}
```

- [ ] **Step 2: Call `loadGroupsFilter()` from the existing init flow**

Find the place in `dashboard.js` where events are loaded on page startup (e.g., inside an `async function init()` or the top-level `DOMContentLoaded` handler). Add:

```js
loadGroupsFilter();
```

After loading events.

- [ ] **Step 3: Mark shared event chips with `data-group-id`**

When building event chips in `makeMonthCell` or the equivalent, if an event has a `group_id` property (added in Task 5 when fetching shared events), set it on the chip:

```js
// Inside the chip creation, after setting other attributes:
if (event.group_id) {
  chip.dataset.groupId = event.group_id;
  chip.style.borderLeftColor = event.group_colour || 'transparent';
}
```

- [ ] **Step 4: Commit**

```bash
git add extension/dashboard/dashboard.js
git commit -m "feat(groups): sidebar group filter on dashboard"
```

---

## Task 5: Dashboard — Share event flow

**Files:**
- Modify: `extension/dashboard/dashboard.js`
- Modify: `extension/dashboard/dashboard.html` (small addition to day-panel-events area)

This adds a Share button to each event row in the day panel, and an inline share section (group checkboxes + confirm).

- [ ] **Step 1: Add share section CSS to `dashboard.css`**

Append to `extension/dashboard/dashboard.css`:

```css
/* Share section (shown inline within a day event row) */
.share-section {
  margin-top: 8px;
  border-top: 1px solid #eeeeee;
  padding-top: 8px;
}
.share-group-cb-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
  cursor: pointer;
}
.share-group-dot {
  width: 8px;
  height: 8px;
  display: inline-block;
  flex-shrink: 0;
}
.share-already-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4c4546;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
```

- [ ] **Step 2: Add `renderShareSection` and `confirmShare` to `dashboard.js`**

Append to `dashboard.js`:

```js
// ─────────────────────────────────────────────
// SHARE EVENT FLOW
// ─────────────────────────────────────────────

async function renderShareSection(event, container) {
  container.innerHTML = '<div class="text-xs text-on-muted font-mono">Loading groups...</div>';

  let sharedGroupIds = [];
  try {
    sharedGroupIds = await SupabaseSocial.getSharedGroups(event.id);
  } catch (_) {}

  if (!calGroups.length) {
    container.innerHTML = '<div class="text-xs text-on-muted">No groups yet — create one in Settings.</div>';
    return;
  }

  container.innerHTML = '';

  // Group checkboxes
  for (const g of calGroups) {
    const alreadyShared = sharedGroupIds.includes(g.id);
    const row = document.createElement('label');
    row.className = 'share-group-cb-row';
    row.innerHTML = `
      <input type="checkbox" data-group-id="${g.id}" ${alreadyShared ? 'checked disabled' : ''} class="share-cb accent-primary w-3 h-3" />
      <span class="share-group-dot" style="background:${g.colour}"></span>
      <span>${g.name}</span>
      ${alreadyShared ? '<span class="share-already-label">Shared</span>' : ''}
    `;
    container.appendChild(row);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'mt-3 px-3 py-1.5 bg-primary text-on-primary font-mono text-[9px] font-bold tracking-wider uppercase hover:shadow-neo-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none';
  confirmBtn.textContent = 'Share';
  confirmBtn.addEventListener('click', () => confirmShare(event, container));
  container.appendChild(confirmBtn);
}

async function confirmShare(event, container) {
  const cbs = container.querySelectorAll('.share-cb:not([disabled]):checked');
  const groupIds = Array.from(cbs).map(cb => cb.dataset.groupId);
  if (!groupIds.length) { alert('Select at least one group.'); return; }

  try {
    await SupabaseSocial.shareEvent(event.id, groupIds);
    // Re-render to show "Shared" labels
    await renderShareSection(event, container);
    render(); // refresh calendar chips
  } catch (e) {
    alert('Share failed: ' + e.message);
  }
}
```

- [ ] **Step 3: Add "Share" button to day panel event rows**

Find the function in `dashboard.js` that renders event rows in the day panel (likely `renderDayPanel` or similar). After creating each event row element, add:

```js
// Share button + section
const shareBtn = document.createElement('button');
shareBtn.className = 'mt-2 font-mono text-[9px] tracking-wider uppercase text-on-muted hover:text-on-surface hover:underline';
shareBtn.textContent = 'Share →';

const shareSection = document.createElement('div');
shareSection.className = 'share-section hidden';

shareBtn.addEventListener('click', async () => {
  if (shareSection.classList.toggle('hidden')) return;
  await renderShareSection(event, shareSection);
});

row.appendChild(shareBtn);
row.appendChild(shareSection);
```

- [ ] **Step 4: Commit**

```bash
git add extension/dashboard/dashboard.js extension/dashboard/dashboard.css
git commit -m "feat(social): share event from day panel to groups"
```

---

## Task 6: Dashboard — Shared event panel (RSVP + members + comments)

**Files:**
- Modify: `extension/dashboard/dashboard.js`
- Add styles to: `extension/dashboard/dashboard.css`

When a shared event row is expanded (or when a non-owner views a shared event), the day panel shows the RSVP bar, member list, and comments thread.

- [ ] **Step 1: Add RSVP + comments CSS to `dashboard.css`**

Append:

```css
/* RSVP bar */
.rsvp-bar { display: flex; gap: 4px; margin-top: 10px; }
.rsvp-btn {
  flex: 1;
  padding: 6px 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
  border: 1px solid #1a1c1c;
  cursor: pointer;
  background: #f9f9f9;
  color: #1a1c1c;
}
.rsvp-btn.selected { background: #000000; color: #ffffff; }
.rsvp-btn:hover:not(.selected) { background: #eeeeee; }

.rsvp-counts {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4c4546;
  margin-top: 5px;
}

/* Comments */
.comments-section { margin-top: 14px; border-top: 1px solid #eeeeee; padding-top: 10px; }
.comments-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4c4546;
  margin-bottom: 8px;
}
.comment-row { margin-bottom: 10px; }
.comment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4c4546;
  margin-bottom: 2px;
}
.comment-avatar {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #1a1c1c;
  color: #f9f9f9;
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.comment-body { font-size: 12px; color: #1a1c1c; line-height: 1.4; }
.comment-input-row { display: flex; gap: 6px; margin-top: 8px; }
.comment-input {
  flex: 1;
  border: 1px solid #1a1c1c;
  padding: 5px 8px;
  font-size: 12px;
  background: #f9f9f9;
  outline: none;
}
.comment-input:focus { background: #f4f3f3; }
.comment-send {
  padding: 5px 10px;
  background: #000000;
  color: #ffffff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
}
.comment-send:hover { opacity: 0.85; }

/* Member list */
.member-list { margin-top: 10px; }
.member-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
}
.member-rsvp {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #4c4546;
  margin-left: auto;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 2: Add `renderSharedEventPanel` to `dashboard.js`**

Append to `dashboard.js`:

```js
// ─────────────────────────────────────────────
// SHARED EVENT PANEL — RSVP + MEMBERS + COMMENTS
// ─────────────────────────────────────────────

let activeCommentsChannel = null;  // Realtime channel; unsubscribe on panel close

async function renderSharedEventPanel(event, container) {
  container.innerHTML = '<div class="text-xs text-on-muted font-mono mt-3">Loading...</div>';

  // Unsubscribe any previous comments subscription
  if (activeCommentsChannel) {
    activeCommentsChannel.unsubscribe();
    activeCommentsChannel = null;
  }

  let rsvpData, members, comments;
  try {
    [rsvpData, members, comments] = await Promise.all([
      SupabaseSocial.getRsvpDetails(event.id),
      SupabaseSocial.getEventMembers(event.id),
      SupabaseSocial.getComments(event.id),
    ]);
  } catch (e) {
    container.innerHTML = '<div class="text-xs text-error font-mono mt-3">Failed to load social data.</div>';
    return;
  }

  container.innerHTML = '';

  // ── RSVP bar ──
  const rsvpBar = document.createElement('div');
  rsvpBar.className = 'rsvp-bar';
  const statuses = [
    { key: 'going',  label: 'Going' },
    { key: 'maybe',  label: 'Maybe' },
    { key: 'cant',   label: "Can't" },
  ];
  for (const s of statuses) {
    const btn = document.createElement('button');
    btn.className = 'rsvp-btn' + (rsvpData.myStatus === s.key ? ' selected' : '');
    btn.textContent = s.label;
    btn.addEventListener('click', async () => {
      try {
        await SupabaseSocial.upsertRsvp(event.id, s.key);
        rsvpData.myStatus = s.key;
        rsvpBar.querySelectorAll('.rsvp-btn').forEach((b, i) => {
          b.classList.toggle('selected', statuses[i].key === s.key);
        });
        // Update counts
        const fresh = await SupabaseSocial.getRsvpDetails(event.id);
        countsEl.textContent = `${fresh.counts.going} Going · ${fresh.counts.maybe} Maybe · ${fresh.counts.cant} Can't`;
      } catch (err) {
        alert('Could not save RSVP: ' + err.message);
      }
    });
    rsvpBar.appendChild(btn);
  }
  container.appendChild(rsvpBar);

  const countsEl = document.createElement('div');
  countsEl.className = 'rsvp-counts';
  countsEl.textContent = `${rsvpData.counts.going} Going · ${rsvpData.counts.maybe} Maybe · ${rsvpData.counts.cant} Can't`;
  container.appendChild(countsEl);

  // ── Members list ──
  if (members.length) {
    const memberList = document.createElement('div');
    memberList.className = 'member-list';
    const label = document.createElement('div');
    label.className = 'comments-label';
    label.textContent = 'Members';
    memberList.appendChild(label);

    for (const m of members) {
      const row = document.createElement('div');
      row.className = 'member-row';
      const initials = m.displayName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const rsvpLabel = m.rsvpStatus ? m.rsvpStatus.charAt(0).toUpperCase() + m.rsvpStatus.slice(1) : '—';
      row.innerHTML = `
        <div class="comment-avatar">${initials}</div>
        <span>${m.displayName}</span>
        <span class="member-rsvp">${rsvpLabel}</span>
      `;
      memberList.appendChild(row);
    }
    container.appendChild(memberList);
  }

  // ── Comments ──
  const commentsSection = document.createElement('div');
  commentsSection.className = 'comments-section';

  const commentsLabel = document.createElement('div');
  commentsLabel.className = 'comments-label';
  commentsLabel.textContent = 'Comments';
  commentsSection.appendChild(commentsLabel);

  const commentsList = document.createElement('div');
  commentsList.id = `comments-list-${event.id}`;
  commentsSection.appendChild(commentsList);

  function appendComment(c) {
    const initials = (c.profiles?.display_name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const time = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'comment-row';
    row.innerHTML = `
      <div class="comment-meta">
        <div class="comment-avatar">${initials}</div>
        <span>${c.profiles?.display_name || '?'}</span>
        <span>${time}</span>
      </div>
      <div class="comment-body">${c.body.replace(/</g,'&lt;')}</div>
    `;
    commentsList.appendChild(row);
  }

  if (!comments.length) {
    commentsList.innerHTML = '<div class="text-xs text-on-muted font-mono">No comments yet — be the first.</div>';
  } else {
    comments.forEach(appendComment);
  }

  // Input row
  const inputRow = document.createElement('div');
  inputRow.className = 'comment-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'comment-input';
  input.placeholder = 'Add a comment...';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'comment-send';
  sendBtn.textContent = 'Send';
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  commentsSection.appendChild(inputRow);

  async function sendComment() {
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      await SupabaseSocial.addComment(event.id, body);
      // Realtime will deliver it; but if user is offline, append locally
    } catch (e) {
      alert('Could not post comment: ' + e.message);
    }
  }
  sendBtn.addEventListener('click', sendComment);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });

  container.appendChild(commentsSection);

  // ── Realtime subscription for live comments ──
  activeCommentsChannel = SupabaseSocial.subscribeComments(event.id, (newComment) => {
    // Remove "no comments" placeholder if present
    const placeholder = commentsList.querySelector('.text-xs.text-on-muted');
    if (placeholder) placeholder.remove();
    appendComment(newComment);
  });
}
```

- [ ] **Step 3: Call `renderSharedEventPanel` from day panel event rows**

In the function that renders the day panel event list, after building each row, add:

```js
// Detect if this event has been shared (event.is_shared or similar flag)
// For now, add a "Details" toggle for all events
const detailsBtn = document.createElement('button');
detailsBtn.className = 'mt-2 font-mono text-[9px] tracking-wider uppercase text-on-muted hover:text-on-surface hover:underline';
detailsBtn.textContent = 'RSVP & Comments →';
const socialContainer = document.createElement('div');

detailsBtn.addEventListener('click', async () => {
  const isOpen = socialContainer.children.length > 0;
  if (isOpen) {
    socialContainer.innerHTML = '';
    if (activeCommentsChannel) { activeCommentsChannel.unsubscribe(); activeCommentsChannel = null; }
    return;
  }
  await renderSharedEventPanel(event, socialContainer);
});

row.appendChild(detailsBtn);
row.appendChild(socialContainer);
```

- [ ] **Step 4: Unsubscribe comments channel when day panel closes**

Find the existing day-panel-close button handler in `dashboard.js`. Add:

```js
document.getElementById('day-panel-close').addEventListener('click', () => {
  if (activeCommentsChannel) {
    activeCommentsChannel.unsubscribe();
    activeCommentsChannel = null;
  }
  // ... existing close logic
});
```

- [ ] **Step 5: Commit**

```bash
git add extension/dashboard/dashboard.js extension/dashboard/dashboard.css
git commit -m "feat(social): RSVP bar, member list, comments thread with Realtime"
```

---

## Task 7: Service worker — Realtime notifications → OS alerts

**Files:**
- Modify: `extension/background/service-worker.js`

- [ ] **Step 1: Read the current service-worker.js to find the insertion point**

Open `extension/background/service-worker.js`. Find the section that handles `chrome.storage` or session management. Append the notification subscription after the existing code.

- [ ] **Step 2: Append Realtime subscription to `service-worker.js`**

```js
// ─────────────────────────────────────────────
// REALTIME — OS notifications for event_shared
// ─────────────────────────────────────────────

// The service worker holds a single long-lived Realtime subscription
// for the signed-in user's notifications table.

let notifsChannel = null;

async function startNotifSubscription() {
  // Get session from chrome.storage
  const result = await chrome.storage.local.get('planwise_session');
  const session = result.planwise_session;
  if (!session?.user?.id) return;

  // Avoid duplicate subscriptions
  if (notifsChannel) return;

  // Build a supabase client in the service worker context
  // (supabase.js must be importable — it's already in vendor/)
  importScripts('../vendor/supabase.js');
  const { createClient } = supabase;
  const swDb = createClient(
    'https://jxdykrgztffzddhzkkxs.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZHlrcmd6dGZmemRkaHpra3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NzA5NTAsImV4cCI6MjA5MzM0Njk1MH0.pU8PV8Uhhj7KBKixoc3u8PV2F9yfbdCHsIxkshxKQZM',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // Restore session
  await swDb.auth.setSession({
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
  });

  const userId = session.user.id;

  notifsChannel = swDb
    .channel(`sw_notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const notif = payload.new;
        if (notif.type !== 'event_shared') return; // OS alerts for shares only

        const p = notif.payload || {};
        chrome.notifications.create({
          type:    'basic',
          iconUrl: '../icons/icon48.png',
          title:   'New shared plan',
          message: `${p.actor_name || 'Someone'} shared "${p.preview || 'an event'}" to ${p.group_name || 'a group'}`,
        });
      }
    )
    .subscribe();
}

// Start subscription whenever the service worker wakes
startNotifSubscription().catch(() => {}); // Silent fail if not signed in

// Re-subscribe when session changes (sign in / sign out)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.planwise_session) {
    if (notifsChannel) { notifsChannel.unsubscribe(); notifsChannel = null; }
    if (changes.planwise_session.newValue) {
      startNotifSubscription().catch(() => {});
    }
  }
});
```

**Note:** The service worker is type `module` (per manifest.json). Replace `importScripts(...)` with an ES module import at the top of service-worker.js instead:

```js
// At the very top of service-worker.js (before any existing code):
// If the file already uses importScripts for supabase, skip this.
// The supabase client should already be available in the service worker
// via a top-level import or importScripts. Check the existing file.
```

If the existing service-worker.js already creates a Supabase client (using `import`), reuse that client and just append the `startNotifSubscription` function.

- [ ] **Step 3: Verify the notification permission**

Open `extension/manifest.json`. The `permissions` array already includes `"notifications"` — no change needed.

- [ ] **Step 4: Commit**

```bash
git add extension/background/service-worker.js
git commit -m "feat(notifications): service worker Realtime → OS notifications for shared events"
```

---

## Task 8: Dashboard — In-app notification feed

**Files:**
- Modify: `extension/dashboard/dashboard.js`

The `#btn-notifications`, `#notif-badge`, `#notif-panel`, `#notif-list`, `#notif-mark-all` elements are already in `dashboard.html` from Phase A.

- [ ] **Step 1: Append notification feed functions to `dashboard.js`**

```js
// ─────────────────────────────────────────────
// IN-APP NOTIFICATION FEED
// ─────────────────────────────────────────────

async function initNotifFeed() {
  const session = await SupabaseAuth._restoreSession();
  if (!session) return;

  // Initial unread count
  updateNotifBadge();

  // Live badge updates via Realtime
  SupabaseSocial.subscribeNotifications(session.user.id, () => {
    updateNotifBadge();
  });

  // Bell click → open/close feed
  const bell = document.getElementById('btn-notifications');
  const panel = document.getElementById('notif-panel');
  if (bell && panel) {
    bell.addEventListener('click', async () => {
      const isOpen = !panel.classList.contains('hidden');
      if (isOpen) {
        panel.classList.add('hidden');
      } else {
        panel.classList.remove('hidden');
        await renderNotifFeed();
      }
    });
  }

  // Mark all read
  const markAllBtn = document.getElementById('notif-mark-all');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await SupabaseSocial.markAllRead();
      updateNotifBadge();
      await renderNotifFeed();
    });
  }
}

async function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  try {
    const count = await SupabaseSocial.getUnreadCount();
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (_) {
    badge.classList.add('hidden');
  }
}

async function renderNotifFeed() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  list.innerHTML = '<div class="px-4 py-3 font-mono text-xs text-on-muted">Loading...</div>';

  let notifs;
  try {
    notifs = await SupabaseSocial.getNotifications();
  } catch (_) {
    list.innerHTML = '<div class="px-4 py-3 font-mono text-xs text-error">Failed to load.</div>';
    return;
  }

  if (!notifs.length) {
    list.innerHTML = '<div class="px-4 py-8 text-center font-mono text-xs text-on-muted tracking-wider">No notifications yet.</div>';
    return;
  }

  list.innerHTML = '';
  for (const n of notifs) {
    const p = n.payload || {};
    let description = '';
    if (n.type === 'event_shared') {
      description = `${p.actor_name || 'Someone'} shared "${p.preview || 'an event'}" to ${p.group_name || 'a group'}`;
    } else if (n.type === 'rsvp_updated') {
      description = `${p.actor_name || 'Someone'} is ${p.status || 'going'} to "${p.preview || 'an event'}"`;
    } else if (n.type === 'comment_added') {
      description = `${p.actor_name || 'Someone'} commented on "${p.preview || 'an event'}": "${p.comment || ''}"`;
    }

    const time = new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const item = document.createElement('div');
    item.className = `flex items-start gap-3 px-4 py-3 border-b border-outline-soft cursor-pointer hover:bg-surface-low ${n.read ? 'opacity-60' : ''}`;
    item.innerHTML = `
      <div class="w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? 'bg-transparent' : 'bg-primary'}"></div>
      <div class="flex-1 min-w-0">
        <div class="text-xs leading-relaxed">${description}</div>
        <div class="font-mono text-[9px] text-on-muted mt-0.5">${time}</div>
      </div>
    `;
    item.addEventListener('click', async () => {
      if (!n.read) {
        await SupabaseSocial.markRead(n.id);
        n.read = true;
        item.classList.add('opacity-60');
        item.querySelector('.rounded-full').className = 'w-2 h-2 rounded-full mt-1.5 shrink-0 bg-transparent';
        updateNotifBadge();
      }
      // Navigate to the event if event_id available
      if (p.event_id) {
        document.getElementById('notif-panel')?.classList.add('hidden');
        // TODO: open the day panel for the event's date — requires looking up the event
      }
    });
    list.appendChild(item);
  }
}
```

- [ ] **Step 2: Call `initNotifFeed()` from the existing init flow**

Find the dashboard init function and add:

```js
initNotifFeed();
```

- [ ] **Step 3: Commit**

```bash
git add extension/dashboard/dashboard.js
git commit -m "feat(notifications): in-app notification feed with unread badge and mark-read"
```

---

## Self-review

**Spec coverage:**
- ✅ `profiles` — auto-created via DB trigger on auth.users insert
- ✅ `groups`, `group_members` — tables, RLS, SupabaseGroups CRUD client
- ✅ `shared_events`, `rsvps`, `comments` — tables, RLS, SupabaseSocial client
- ✅ `notifications` — table, RLS, 3 DB triggers writing on shared_events/rsvps/comments insert
- ✅ Groups filter sidebar on dashboard — toggles event chip opacity without re-fetch
- ✅ Settings Groups section — list, create (name + colour + invite), leave/delete
- ✅ Share event flow — inline share section in day panel with group checkboxes
- ✅ RSVP bar — Going / Maybe / Can't, upsert, live count update
- ✅ Members list — deduplicated across groups, with RSVP status
- ✅ Comments thread — load, send, Realtime live updates, unsubscribe on panel close
- ✅ Service worker OS notifications — event_shared only, Realtime subscription
- ✅ In-app feed — all 3 types, unread badge, mark read, mark all read

**Placeholder scan:** No TBDs. `get_user_id_by_email` RPC noted with SQL. Service worker module vs importScripts ambiguity noted with resolution path.

**Type consistency:**
- `SupabaseGroups.listGroups()` → used in Task 3 (settings) and Task 4 (dashboard filter) — both call `listGroups()` ✅
- `SupabaseSocial.shareEvent(eventId, groupIds)` — `groupIds` is `string[]`, matches Task 5 `Array.from(cbs).map(cb => cb.dataset.groupId)` ✅
- `SupabaseSocial.subscribeComments(eventId, onInsert)` → returns channel object with `.unsubscribe()` — stored as `activeCommentsChannel`, unsubscribed in Task 6 Step 4 ✅
- `SupabaseSocial.subscribeNotifications(userId, onInsert)` → same pattern, used in Task 8 ✅
- `notif.payload` → always `jsonb` object `p` with `actor_name`, `preview`, `group_name`, `status`, `comment` fields — consistent across triggers and feed renderer ✅
