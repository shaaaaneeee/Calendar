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

let settings = {
  triggerWords:         [],
  contacts:             [],
  sensitivity:          2,
  notificationsEnabled: true,
};


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  // Guard: close tab immediately if not logged in
  try {
    const user = await Auth.getUser();
    if (!user) {
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
  await loadAccountInfo();
}


// ─────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────

async function loadSettings() {
  const local = await LocalStorage.getSettings();
  settings = { ...settings, ...local };

  try {
    const user = await Auth.getUser();
    if (user) {
      const remote = await SupaSettings.load();
      if (remote) {
        settings = {
          triggerWords:         remote.trigger_words         || [],
          contacts:             remote.contacts              || [],
          sensitivity:          remote.sensitivity           ?? 2,
          notificationsEnabled: remote.notifications_enabled ?? true,
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
    }));
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

async function loadAccountInfo() {
  try {
    const user = await Auth.getUser();
    el('account-email').textContent = user?.email || 'Not signed in';
  } catch {
    el('account-email').textContent = 'Not signed in';
  }
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
  if (settings.triggerWords.includes(word)) {
    input.value = '';
    return;
  }
  settings.triggerWords.push(word);
  input.value = '';
  renderTriggerTags();
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
      document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
      el(`section-${target}`).classList.remove('hidden');
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
