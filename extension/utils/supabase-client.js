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

const SUPABASE_URL  = 'https://zblizqtjdzcybhllljja.supabase.co';   // e.g. https://xxxx.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibGl6cXRqZHpjeWJobGxsamphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTYzNzMsImV4cCI6MjA5MjQ3MjM3M30.8-VRaHrB6KyTT_OSr0uKC4GMRH4XNjCcvuGddr0DM6g';      // the long JWT from Settings → API

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

  /**
   * Load events within a date range.
   * @param {string} from — 'YYYY-MM-DD'
   * @param {string} to   — 'YYYY-MM-DD'
   */
  async getRange(from, to) {
    const { data, error } = await db
      .from('events')
      .select('*')
      .gte('event_date', from)
      .lte('event_date', to)
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
      });

    if (error) throw error;
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
  };
}