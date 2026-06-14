/**
 * PlanWise Supabase Client
 *
 * All Supabase communication lives here:
 *   - Auth  (sign up, sign in, sign out, session)
 *   - Events (save, load, update, delete)
 *   - Settings (load, save)
 *
 * Nothing else in the codebase imports Supabase directly.
 * Swapping backends means changing only this file.
 *
 * Depends on: vendor/supabase.js (must load first in popup.html)
 */

const SUPABASE_URL  = 'https://jxdykrgztffzddhzkkxs.supabase.co';   // e.g. https://xxxx.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZHlrcmd6dGZmemRkaHpra3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NzA5NTAsImV4cCI6MjA5MzM0Njk1MH0.pU8PV8Uhhj7KBKixoc3u8PV2F9yfbdCHsIxkshxKQZM';
const { createClient } = supabase;

const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     false,
    autoRefreshToken:   false,
    detectSessionInUrl: false,
  }
});


// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

const SESSION_KEY = 'planwise_session';

const SupabaseAuth = {
  // Save session to chrome.storage.local after sign in
  async _saveSession(session) {
    if (session) {
      await chrome.storage.local.set({ [SESSION_KEY]: session });
    } else {
      await chrome.storage.local.remove(SESSION_KEY);
    }
  },

  // Load session from chrome.storage.local and restore it into Supabase
  async _restoreSession() {
    const result = await chrome.storage.local.get(SESSION_KEY);
    const session = result[SESSION_KEY];
    if (!session) return null;

    // Tell the Supabase client about this session
    const { data, error } = await db.auth.setSession({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error) {
      // Session expired or invalid - clear it
      await this._saveSession(null);
      return null;
    }

    return data.session;
  },

  async signUp(email, password) {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this._saveSession(data.session);
    return data;
  },

  async signOut() {
    const { error } = await db.auth.signOut();
    await this._saveSession(null);
    if (error) throw error;
  },

  async getSession() {
    return await this._restoreSession();
  },

  async getUser() {
    const session = await this._restoreSession();
    return session?.user ?? null;
  },
};


// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────

const SupabaseEvents = {

  /**
   * Save a confirmed event to Supabase.
   * Maps our internal camelCase fields to database snake_case columns.
   */
  async save(event) {
    const user = await SupabaseAuth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await db
      .from('events')
      .insert({
        user_id:      user.id,
        title:        event.title        || 'Plan',
        event_date:   event.date         || null,
        event_time:   event.time         || null,
        participants: event.participants || [],
        notes:        event.notes        || '',
        source_text:  event.sourceText   || '',
        platform:     event.platform     || '',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Load all events for the current user, sorted by date then time.
   * Used by the calendar dashboard in Phase 4.
   */
  async getAll() {
    const { data, error } = await db
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true });

    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await db
      .from('events')
      .update({
        title:        updates.title,
        event_date:   updates.date,
        event_time:   updates.time,
        participants: updates.participants,
        notes:        updates.notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await db
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};


// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

const SupabaseSettings = {

  async load() {
    const { data, error } = await db
      .from('settings')
      .select('*')
      .single();

    // PGRST116 = no rows found = first login, return null and let caller use defaults
    if (error?.code === 'PGRST116') return null;
    if (error) throw error;
    return data;
  },

  async save(settings) {
    const user = await SupabaseAuth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await db
      .from('settings')
      .upsert({
        user_id:               user.id,
        trigger_words:         settings.triggerWords         || [],
        contacts:              settings.contacts             || [],
        sensitivity:           settings.sensitivity          ?? 2,
        notifications_enabled: settings.notificationsEnabled ?? true,
        priority_names:        settings.priorityNames        || [],
        activity_words:        settings.activityWords        || [],
        meeting_words:         settings.meetingWords         || [],
        items:                 settings.items                || [],
      });

    if (error) throw error;
  },
};


// ─────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────

const SupabaseGroups = {
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

  async inviteByEmail(groupId, email) {
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

  async leaveOrDeleteGroup(groupId) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    const { data: membership } = await db
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .single();

    if (membership?.role === 'owner') {
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


// ─────────────────────────────────────────────
// SOCIAL — shared events, RSVP, comments, notifications
// ─────────────────────────────────────────────

const SupabaseSocial = {
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

  async getSharedGroups(eventId) {
    const { data, error } = await db
      .from('shared_events')
      .select('group_id')
      .eq('event_id', eventId);
    if (error) throw error;
    return (data || []).map(r => r.group_id);
  },

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

  async getEventMembers(eventId) {
    const { data: seRows } = await db
      .from('shared_events')
      .select('group_id')
      .eq('event_id', eventId);
    const groupIds = (seRows || []).map(r => r.group_id);
    if (!groupIds.length) return [];

    const { data: members } = await db
      .from('group_members')
      .select('user_id, profiles(display_name)')
      .in('group_id', groupIds);

    const { data: rsvps } = await db
      .from('rsvps')
      .select('user_id, status')
      .eq('event_id', eventId);

    const rsvpMap = {};
    for (const r of rsvps || []) rsvpMap[r.user_id] = r.status;

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

  async getComments(eventId) {
    const { data, error } = await db
      .from('comments')
      .select('id, body, created_at, user_id, profiles(display_name)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addComment(eventId, body) {
    const session = await SupabaseAuth._restoreSession();
    if (!session) throw new Error('Not signed in');

    const { error } = await db
      .from('comments')
      .insert({ event_id: eventId, user_id: session.user.id, body });
    if (error) throw error;
  },

  subscribeComments(eventId, onInsert) {
    return db
      .channel(`comments:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        (payload) => onInsert(payload.new)
      )
      .subscribe();
  },

  async getUnreadCount() {
    const { count, error } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);
    if (error) throw error;
    return count || 0;
  },

  async getNotifications(limit = 30) {
    const { data, error } = await db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async markRead(notifId) {
    const { error } = await db
      .from('notifications')
      .update({ read: true })
      .eq('id', notifId);
    if (error) throw error;
  },

  async markAllRead() {
    const { error } = await db
      .from('notifications')
      .update({ read: true })
      .eq('read', false);
    if (error) throw error;
  },

  subscribeNotifications(userId, onInsert) {
    return db
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => onInsert(payload.new)
      )
      .subscribe();
  },
};


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.SupabaseClient = {
    db,
    auth:     SupabaseAuth,
    events:   SupabaseEvents,
    settings: SupabaseSettings,
    groups:   SupabaseGroups,
    social:   SupabaseSocial,
  };
}