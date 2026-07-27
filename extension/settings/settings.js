/**
 * PlanWise Settings Page
 *
 * Loads settings from chrome.storage.local, lets the user edit them,
 * and saves back on "Save Settings".
 * Settings are also synced to Supabase if the user is logged in.
 */

const Auth         = window.SupabaseClient.auth;
const SupaSettings = window.SupabaseClient.settings;
const LocalStorage = window.PlanWiseStorage;

let currentUser = null;

let settings = {
  triggerWords:         [],
  contacts:             [],
  priorityNames:        [],
  activityWords:        [],
  meetingWords:         [],
  items:                [],
  placeWords:           [],
  sensitivity:          2,
  notificationsEnabled: true,
};


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

function showUnauthMessage() {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;font-size:12px;color:#4c4546;letter-spacing:0.1em;text-transform:uppercase;">Sign in via the extension icon.</div>';
  setTimeout(() => window.close(), 1500);
}

async function init() {
  try {
    currentUser = await Auth.getUser();
    if (!currentUser) {
      showUnauthMessage();
      return;
    }
  } catch {
    showUnauthMessage();
    return;
  }

  await loadSettings();
  renderAll();
  wireNav();
  wireControls();
  wireGroupsSection();
  loadAccountInfo();
}


// ─────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────

// Word-list fields where "whichever side has data" should win, rather than
// remote unconditionally overwriting local. Word lists autosave to local
// storage the instant you add one but only reach Supabase when you click
// "Save Settings" - if you add a word and reopen Settings before saving,
// wholesale-replacing `settings` with the (older/emptier) remote copy would
// silently wipe what you just typed.
const MERGE_AS_UNION_IF_LOCAL_EMPTY = [
  'triggerWords', 'contacts', 'priorityNames', 'activityWords',
  'meetingWords', 'items', 'placeWords'
];

async function loadSettings() {
  const local = await LocalStorage.getSettings();
  settings = { ...settings, ...local };

  try {
    if (currentUser) {
      const remote = await SupaSettings.load();
      if (remote) {
        const remoteMapped = {
          triggerWords:         remote.trigger_words         || [],
          contacts:             remote.contacts              || [],
          sensitivity:          remote.sensitivity           ?? 2,
          notificationsEnabled: remote.notifications_enabled ?? true,
          priorityNames:        remote.priority_names        || [],
          activityWords:        remote.activity_words        || [],
          meetingWords:         remote.meeting_words         || [],
          items:                remote.items                 || [],
          placeWords:           remote.place_words           || [],
        };

        for (const key of MERGE_AS_UNION_IF_LOCAL_EMPTY) {
          if (!settings[key]?.length && remoteMapped[key].length) {
            settings[key] = remoteMapped[key];
          }
        }
        settings.sensitivity          = remoteMapped.sensitivity;
        settings.notificationsEnabled = remoteMapped.notificationsEnabled;
      }
    }
  } catch (err) {
    console.warn('[PlanWise] Could not load remote settings:', err.message);
  }
}

async function saveSettings() {
  await LocalStorage.saveSettings(settings);

  try {
    const user = await Auth.getUser();
    if (user) {
      await SupaSettings.save(settings);
    }
  } catch (err) {
    console.warn('[PlanWise] Could not sync settings to Supabase:', err.message);
  }

  showSaveStatus('✓ Saved');
}

function showSaveStatus(msg) {
  const status = el('save-status');
  status.textContent = msg;
  setTimeout(() => { status.textContent = ''; }, 2500);
}


// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function renderAll() {
  renderSensitivity();
  renderTriggerTags();
  renderPriorityNameTags();
  renderActivityWordTags();
  renderItemTags();
  renderPlaceWordTags();
  renderSummaryTable();
  renderNotifications();
}

function renderSensitivity() {
  el('sensitivity-slider').value        = settings.sensitivity;
  el('sensitivity-display').textContent = settings.sensitivity;
}

function renderTriggerTags() {
  const container = el('trigger-tags');
  container.innerHTML = '';
  for (const word of settings.triggerWords) {
    container.appendChild(makeTag(word, () => {
      settings.triggerWords = settings.triggerWords.filter(w => w !== word);
      renderTriggerTags();
      renderSummaryTable();
    }));
  }
}

function renderPriorityNameTags() {
  const container = el('priority-name-tags');
  container.innerHTML = '';
  for (const name of (settings.priorityNames || [])) {
    container.appendChild(makeTag(name, () => {
      settings.priorityNames = settings.priorityNames.filter(n => n !== name);
      renderPriorityNameTags();
      renderSummaryTable();
    }));
  }
}

function renderActivityWordTags() {
  const container = el('activity-word-tags');
  container.innerHTML = '';
  for (const word of (settings.activityWords || [])) {
    container.appendChild(makeTag(word, () => {
      settings.activityWords = settings.activityWords.filter(w => w !== word);
      renderActivityWordTags();
      renderSummaryTable();
    }));
  }
}

function renderItemTags() {
  const container = el('item-tags');
  container.innerHTML = '';
  for (const word of (settings.items || [])) {
    container.appendChild(makeTag(word, () => {
      settings.items = settings.items.filter(w => w !== word);
      renderItemTags();
      renderSummaryTable();
    }));
  }
}

function renderPlaceWordTags() {
  const container = el('place-word-tags');
  container.innerHTML = '';
  for (const word of (settings.placeWords || [])) {
    container.appendChild(makeTag(word, () => {
      settings.placeWords = settings.placeWords.filter(w => w !== word);
      renderPlaceWordTags();
      renderSummaryTable();
    }));
  }
}

function renderSummaryTable() {
  // Word-list edits (trigger/name/activity/item/place add-or-remove) all funnel
  // through here as their last step, so persist to local storage immediately
  // instead of requiring "Save Settings" — content-script.js reads storage
  // fresh on every message, so an unsaved word is silently invisible to detection.
  LocalStorage.saveSettings(settings);

  const tbody = el('summary-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = [
    { label: 'Trigger Words',  key: 'triggerWords',  score: '+2 each' },
    { label: 'Custom Names',   key: 'priorityNames', score: 'People field' },
    { label: 'Activity Words', key: 'activityWords', score: '+2 each, title' },
    { label: 'Items',          key: 'items',         score: '+1 each' },
    { label: 'Place Words',    key: 'placeWords',    score: '+1 each, location' },
  ];

  for (const { label, key, score } of rows) {
    const words = settings[key] || [];
    const tr = document.createElement('tr');

    const tdCat = document.createElement('td');
    tdCat.className = 'summary-category';
    tdCat.textContent = label;

    const tdWords = document.createElement('td');
    tdWords.className = 'summary-words';
    if (words.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'summary-empty';
      empty.textContent = 'None added';
      tdWords.appendChild(empty);
    } else {
      tdWords.textContent = words.join(', ');
    }

    const tdScore = document.createElement('td');
    tdScore.className = 'summary-score';
    tdScore.textContent = score;

    const tdCount = document.createElement('td');
    tdCount.className = 'summary-count' + (words.length > 0 ? ' summary-count-nonzero' : '');
    tdCount.textContent = words.length > 0 ? words.length : '—';

    tr.appendChild(tdCat);
    tr.appendChild(tdWords);
    tr.appendChild(tdScore);
    tr.appendChild(tdCount);
    tbody.appendChild(tr);
  }
}

function renderNotifications() {
  el('toggle-notifications').checked = settings.notificationsEnabled;
}


// ─────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────

function makeTag(text, onRemove) {
  const tag = document.createElement('div');
  tag.className = 'tag';

  const label = document.createElement('span');
  label.textContent = text;

  const btn = document.createElement('button');
  btn.className   = 'tag-remove';
  btn.textContent = '✕';
  btn.addEventListener('click', onRemove);

  tag.appendChild(label);
  tag.appendChild(btn);
  return tag;
}

// ─────────────────────────────────────────────
// ACCOUNT
// ─────────────────────────────────────────────

function loadAccountInfo() {
  el('account-email').textContent = currentUser?.email || 'Not signed in';
}


// ─────────────────────────────────────────────
// WIRE CONTROLS
// ─────────────────────────────────────────────

function wireControls() {
  el('sensitivity-slider').addEventListener('input', () => {
    settings.sensitivity = parseInt(el('sensitivity-slider').value);
    el('sensitivity-display').textContent = settings.sensitivity;
  });

  el('btn-add-trigger').addEventListener('click', addTriggerWord);
  el('trigger-word-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTriggerWord();
  });

  el('btn-add-priority-name').addEventListener('click', addPriorityName);
  el('priority-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPriorityName();
  });

  el('btn-add-activity-word').addEventListener('click', addActivityWord);
  el('activity-word-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addActivityWord();
  });

  el('btn-add-item').addEventListener('click', addItem);
  el('item-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });

  el('btn-add-place-word').addEventListener('click', addPlaceWord);
  el('place-word-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlaceWord();
  });

  el('toggle-notifications').addEventListener('change', () => {
    settings.notificationsEnabled = el('toggle-notifications').checked;
  });

  el('btn-save').addEventListener('click', saveSettings);

  el('btn-signout').addEventListener('click', async () => {
    await Auth.signOut();
    window.close();
  });
}

function addTriggerWord() {
  const input = el('trigger-word-input');
  const word  = input.value.trim().toLowerCase();
  if (!word) return;
  if (settings.triggerWords.includes(word)) { input.value = ''; return; }
  settings.triggerWords.push(word);
  input.value = '';
  renderTriggerTags();
  renderSummaryTable();
}

function addPriorityName() {
  const input = el('priority-name-input');
  const name  = input.value.trim();
  if (!name) return;
  settings.priorityNames = settings.priorityNames || [];
  if (settings.priorityNames.some(n => n.toLowerCase() === name.toLowerCase())) { input.value = ''; return; }
  settings.priorityNames.push(name);
  input.value = '';
  renderPriorityNameTags();
  renderSummaryTable();
}

function addActivityWord() {
  const input = el('activity-word-input');
  const word  = input.value.trim().toLowerCase();
  if (!word) return;
  settings.activityWords = settings.activityWords || [];
  if (settings.activityWords.includes(word)) { input.value = ''; return; }
  settings.activityWords.push(word);
  input.value = '';
  renderActivityWordTags();
  renderSummaryTable();
}

function addItem() {
  const input = el('item-input');
  const word  = input.value.trim().toLowerCase();
  if (!word) return;
  settings.items = settings.items || [];
  if (settings.items.includes(word)) { input.value = ''; return; }
  settings.items.push(word);
  input.value = '';
  renderItemTags();
  renderSummaryTable();
}

function addPlaceWord() {
  const input = el('place-word-input');
  const word  = input.value.trim().toLowerCase();
  if (!word) return;
  settings.placeWords = settings.placeWords || [];
  if (settings.placeWords.includes(word)) { input.value = ''; return; }
  settings.placeWords.push(word);
  input.value = '';
  renderPlaceWordTags();
  renderSummaryTable();
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────

function wireNav() {
  const navItems = document.querySelectorAll('.nav-item');
  for (const item of navItems) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.dataset.section;
      for (const nav of navItems) nav.classList.remove('active');
      item.classList.add('active');
      document.querySelectorAll('.section').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
      const targetSection = el(`section-${target}`);
      targetSection.classList.remove('hidden');
      targetSection.classList.add('active');
      if (target === 'groups') loadAndRenderGroups();
    });
  }
}


// ─────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────

const Groups = window.SupabaseClient.groups;

async function loadAndRenderGroups() {
  const container = el('groups-list');
  container.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">Loading groups...</p>';
  try {
    const groups = await Groups.listGroups();
    renderGroupsList(groups);
  } catch (err) {
    container.innerHTML = `<p style="font-size:12px;color:#ba1a1a">Failed to load groups: ${err.message}</p>`;
  }
}

function renderGroupsList(groups) {
  const container = el('groups-list');
  container.innerHTML = '';

  if (!groups.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:12px;color:var(--text-muted)';
    empty.textContent = 'No groups yet. Create one below.';
    container.appendChild(empty);
    return;
  }

  for (const group of groups) {
    const memberCount = group.group_members?.length ?? 0;
    const isOwner = group.created_by === currentUser?.id;

    const card = document.createElement('div');
    card.className = 'border border-outline p-4 flex items-center justify-between gap-4';

    const left = document.createElement('div');
    left.className = 'flex items-center gap-3 min-w-0';

    const dot = document.createElement('span');
    dot.className = 'w-3 h-3 shrink-0 border border-outline';
    dot.style.background = group.colour;
    left.appendChild(dot);

    const info = document.createElement('div');
    info.className = 'min-w-0';

    const name = document.createElement('div');
    name.className = 'text-sm font-medium truncate';
    name.textContent = group.name;

    const meta = document.createElement('div');
    meta.className = 'font-mono text-[9px] text-on-muted uppercase tracking-wider mt-0.5';
    meta.textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''} · ${isOwner ? 'Owner' : 'Member'}`;

    info.appendChild(name);
    info.appendChild(meta);
    left.appendChild(info);
    card.appendChild(left);

    // Invite form (owner only)
    if (isOwner) {
      const inviteWrap = document.createElement('div');
      inviteWrap.className = 'flex gap-1 shrink-0';

      const inviteInput = document.createElement('input');
      inviteInput.type = 'email';
      inviteInput.placeholder = 'Invite email';
      inviteInput.className = 'border border-outline px-2 py-1 text-xs bg-surface focus:outline-none w-36';

      const inviteBtn = document.createElement('button');
      inviteBtn.className = 'px-3 py-1 border border-outline font-mono text-[9px] font-bold tracking-wider uppercase hover:bg-surface-mid';
      inviteBtn.textContent = 'Invite';
      inviteBtn.addEventListener('click', async () => {
        const email = inviteInput.value.trim();
        if (!email) return;
        inviteBtn.textContent = '...';
        try {
          await Groups.sendGroupInvite(group.id, email);
          inviteInput.value = '';
          inviteBtn.textContent = 'Invited!';
          setTimeout(() => { inviteBtn.textContent = 'Invite'; }, 2000);
        } catch (err) {
          inviteBtn.textContent = 'Error';
          showToast(friendlyError(err.message));
          setTimeout(() => { inviteBtn.textContent = 'Invite'; }, 2000);
        }
      });
      inviteWrap.appendChild(inviteInput);
      inviteWrap.appendChild(inviteBtn);
      card.appendChild(inviteWrap);
    }

    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'shrink-0 px-3 py-1 border border-error text-error font-mono text-[9px] font-bold tracking-wider uppercase hover:bg-error hover:text-on-primary';
    leaveBtn.textContent = isOwner ? 'Delete' : 'Leave';
    leaveBtn.addEventListener('click', async () => {
      const action = isOwner ? 'delete' : 'leave';
      if (!confirm(`${isOwner ? 'Delete' : 'Leave'} group "${group.name}"?`)) return;
      try {
        await Groups.leaveOrDeleteGroup(group.id);
        loadAndRenderGroups();
      } catch (err) {
        showToast(`Failed to ${action} group: ${friendlyError(err.message)}`);
      }
    });
    card.appendChild(leaveBtn);

    container.appendChild(card);
  }
}

function wireGroupsSection() {
  let selectedColour = '#00D1FF';

  el('btn-new-group').addEventListener('click', () => {
    el('new-group-form').classList.remove('hidden');
  });

  el('btn-cancel-new-group').addEventListener('click', () => {
    el('new-group-form').classList.add('hidden');
    el('new-group-name').value = '';
    el('new-group-invite').value = '';
  });

  document.querySelectorAll('.colour-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.colour-opt').forEach(b => b.classList.remove('selected', 'border-outline'));
      btn.classList.add('selected', 'border-outline');
      selectedColour = btn.dataset.colour;
    });
  });

  el('btn-create-group').addEventListener('click', async () => {
    const name = el('new-group-name').value.trim();
    if (!name) { showToast('Group name is required.'); return; }

    const createBtn = el('btn-create-group');
    createBtn.textContent = 'Creating...';
    try {
      const group = await Groups.createGroup(name, selectedColour);

      const email = el('new-group-invite').value.trim();
      if (email) {
        try {
          await Groups.sendGroupInvite(group.id, email);
        } catch (err) {
          showToast(`Group created, but invite failed: ${friendlyError(err.message)}`);
        }
      }

      el('new-group-form').classList.add('hidden');
      el('new-group-name').value = '';
      el('new-group-invite').value = '';
      createBtn.textContent = 'Create Group';
      loadAndRenderGroups();
    } catch (err) {
      alert('Failed to create group: ' + err.message);
      createBtn.textContent = 'Create Group';
    }
  });
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, type = 'error') {
  const toast  = el('toast');
  const msgEl  = el('toast-msg');
  msgEl.textContent = msg;
  toast.classList.toggle('bg-error-bg',    type === 'error');
  toast.classList.toggle('border-error',   type === 'error');
  toast.classList.toggle('bg-surface',     type !== 'error');
  toast.classList.toggle('border-outline', type !== 'error');
  msgEl.classList.toggle('text-error',      type === 'error');
  msgEl.classList.toggle('text-on-surface', type !== 'error');
  toast.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}

el('toast-close').addEventListener('click', () => {
  clearTimeout(_toastTimer);
  el('toast').classList.add('hidden');
});

function friendlyError(msg) {
  if (!msg) return 'Something went wrong.';
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) return 'That person is already in this group.';
  if (msg.includes('violates foreign key')) return 'Invalid group or user.';
  if (msg.includes('not-null') || msg.includes('null value')) return 'Missing required information.';
  return msg;
}


// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

init();
