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
  sensitivity:          2,
  notificationsEnabled: true,
};


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  try {
    currentUser = await Auth.getUser();
    if (!currentUser) {
      window.close();
      return;
    }
  } catch {
    window.close();
    return;
  }

  await loadSettings();
  renderAll();
  wireNav();
  wireControls();
  loadAccountInfo();
}


// ─────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────

async function loadSettings() {
  const local = await LocalStorage.getSettings();
  settings = { ...settings, ...local };

  try {
    if (currentUser) {
      const remote = await SupaSettings.load();
      if (remote) {
        settings = {
          triggerWords:         remote.trigger_words         || [],
          contacts:             remote.contacts              || [],
          sensitivity:          remote.sensitivity           ?? 2,
          notificationsEnabled: remote.notifications_enabled ?? true,
          priorityNames:        remote.priority_names        || [],
          activityWords:        remote.activity_words        || [],
          meetingWords:         remote.meeting_words         || [],
          items:                remote.items                 || [],
        };
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
  renderMeetingWordTags();
  renderItemTags();
  renderSummaryTable();
  renderContacts();
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

function renderMeetingWordTags() {
  const container = el('meeting-word-tags');
  container.innerHTML = '';
  for (const word of (settings.meetingWords || [])) {
    container.appendChild(makeTag(word, () => {
      settings.meetingWords = settings.meetingWords.filter(w => w !== word);
      renderMeetingWordTags();
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

function renderSummaryTable() {
  const tbody = el('summary-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = [
    { label: 'Trigger Words',  key: 'triggerWords',  score: '+2 each' },
    { label: 'Custom Names',   key: 'priorityNames', score: 'Title & Notes' },
    { label: 'Activity Words', key: 'activityWords', score: '+2 each' },
    { label: 'Meeting Words',  key: 'meetingWords',  score: '+2 each' },
    { label: 'Items',          key: 'items',         score: '+1 each' },
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

function renderContacts() {
  const container = el('contact-list');
  container.innerHTML = '';

  if (settings.contacts.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:12px;color:var(--text-muted);';
    empty.textContent   = 'No contacts added yet.';
    container.appendChild(empty);
    return;
  }

  for (const contact of settings.contacts) {
    container.appendChild(makeContactItem(contact));
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

function makeContactItem(contact) {
  const item = document.createElement('div');
  item.className = 'contact-item';

  const info = document.createElement('div');
  info.className = 'contact-item-info';

  const name = document.createElement('div');
  name.className   = 'contact-item-name';
  name.textContent = contact.name;

  info.appendChild(name);

  if (contact.nicknames?.length > 0) {
    const nicks = document.createElement('div');
    nicks.className   = 'contact-item-nicknames';
    nicks.textContent = `aka: ${contact.nicknames.join(', ')}`;
    info.appendChild(nicks);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className   = 'contact-remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    settings.contacts = settings.contacts.filter(c => c.name !== contact.name);
    renderContacts();
  });

  item.appendChild(info);
  item.appendChild(removeBtn);
  return item;
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

  el('btn-add-meeting-word').addEventListener('click', addMeetingWord);
  el('meeting-word-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addMeetingWord();
  });

  el('btn-add-item').addEventListener('click', addItem);
  el('item-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });

  el('btn-add-contact').addEventListener('click', addContact);
  el('contact-nickname-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addContact();
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
  if (settings.priorityNames.includes(name)) { input.value = ''; return; }
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

function addMeetingWord() {
  const input = el('meeting-word-input');
  const word  = input.value.trim().toLowerCase();
  if (!word) return;
  settings.meetingWords = settings.meetingWords || [];
  if (settings.meetingWords.includes(word)) { input.value = ''; return; }
  settings.meetingWords.push(word);
  input.value = '';
  renderMeetingWordTags();
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

function addContact() {
  const nameInput = el('contact-name-input');
  const nickInput = el('contact-nickname-input');
  const name      = nameInput.value.trim();
  if (!name) return;

  const nicknames = nickInput.value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (settings.contacts.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    nameInput.value = '';
    nickInput.value = '';
    return;
  }

  settings.contacts.push({ name, nicknames });
  nameInput.value = '';
  nickInput.value = '';
  renderContacts();
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
    });
  }
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function el(id) { return document.getElementById(id); }


// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

init();
