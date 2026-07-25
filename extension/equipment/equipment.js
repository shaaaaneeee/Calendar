/**
 * PlanWise Equipment — Kanban Board
 *
 * Columns: in_use / to_prepare / maintenance.
 * Data source: Supabase (via SupabaseClient.equipment), with group sharing
 * via SupabaseClient.social.shareEquipment/getSharedGroupsForEquipment —
 * mirrors the calendar event sharing pattern in dashboard.js.
 */

const Auth      = window.SupabaseClient.auth;
const Equipment  = window.SupabaseClient.equipment;
const Groups     = window.SupabaseClient.groups;
const Social     = window.SupabaseClient.social;

const COLS = ['in_use', 'to_prepare', 'maintenance'];

const DATE_LABELS = {
  in_use:      'USE DATE',
  to_prepare:  'NEEDED BY',
  maintenance: 'PROJECTED FIX DATE',
};

let allItems       = [];
let editingItem     = null;
let addingToColumn  = null;
let calGroups       = [];

async function init() {
  await loadGroups();
  await loadItems();
  render();
  wireControls();
}

// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────

async function loadItems() {
  try {
    const user = await Auth.getUser();
    allItems = user ? await Equipment.getAll() : [];
  } catch (err) {
    console.warn('[PlanWise] Failed to load equipment:', err.message);
    allItems = [];
  }
}

async function loadGroups() {
  try {
    calGroups = await Groups.listGroups();
  } catch {
    calGroups = [];
  }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function render() {
  for (const col of COLS) {
    const cards = allItems.filter(item => item.status === col);
    el('cards-' + col).innerHTML = '';
    el('count-' + col).textContent = cards.length;
    for (const item of cards) {
      el('cards-' + col).appendChild(makeCard(item));
    }
  }
}

function makeCard(item) {
  const card = document.createElement('div');
  card.className = 'equipment-card';
  card.dataset.id = item.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = item.name;
  card.appendChild(title);

  if (item.target_date) {
    const dateEl = document.createElement('div');
    dateEl.className = 'card-date';
    dateEl.textContent = `${DATE_LABELS[item.status]}: ` + new Date(item.target_date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
    card.appendChild(dateEl);
  }

  if (item.group_name) {
    const shared = document.createElement('div');
    shared.className = 'card-shared';
    shared.innerHTML = `<span class="card-shared-dot" style="background:${item.group_colour || '#4c4546'}"></span>${item.group_name}`;
    card.appendChild(shared);
  }

  // Move arrows
  const colIdx = COLS.indexOf(item.status);
  const moves = document.createElement('div');
  moves.className = 'card-moves';

  if (colIdx > 0) {
    const prev = document.createElement('button');
    prev.className = 'move-btn';
    prev.textContent = '←';
    prev.title = 'Move left';
    prev.addEventListener('click', (e) => { e.stopPropagation(); moveItem(item.id, COLS[colIdx - 1]); });
    moves.appendChild(prev);
  }

  if (colIdx < COLS.length - 1) {
    const next = document.createElement('button');
    next.className = 'move-btn';
    next.textContent = '→';
    next.title = 'Move right';
    next.addEventListener('click', (e) => { e.stopPropagation(); moveItem(item.id, COLS[colIdx + 1]); });
    moves.appendChild(next);
  }

  if (moves.children.length > 0) card.appendChild(moves);

  card.addEventListener('click', () => openEditModal(item));
  return card;
}

// ─────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────

async function moveItem(id, newStatus) {
  try {
    await Equipment.update(id, { status: newStatus });
    await loadItems();
    render();
  } catch (err) {
    console.warn('[PlanWise] Move failed:', err.message);
  }
}

async function handleSave() {
  const name = el('equipment-name').value.trim();
  if (!name) { el('equipment-name').focus(); return; }

  const payload = {
    name,
    status:     editingItem ? editingItem.status : addingToColumn,
    targetDate: el('equipment-date').value,
    notes:      el('equipment-notes').value.trim(),
  };

  const selectedGroupIds = Array.from(
    document.querySelectorAll('.equipment-group-cb:checked:not([disabled])')
  ).map(cb => cb.dataset.groupId);

  try {
    let savedId;
    if (editingItem) {
      await Equipment.update(editingItem.id, payload);
      savedId = editingItem.id;
    } else {
      const saved = await Equipment.create(payload);
      savedId = saved?.id;
    }
    if (selectedGroupIds.length > 0 && savedId) {
      await Social.shareEquipment(savedId, selectedGroupIds);
    }
    closeModal();
    await loadItems();
    render();
  } catch (err) {
    console.warn('[PlanWise] Save failed:', err.message);
    showModalError('Save failed — ' + err.message);
  }
}

async function handleDelete() {
  if (!editingItem) return;
  if (!confirm(`Delete "${editingItem.name}"?`)) return;

  try {
    await Equipment.delete(editingItem.id);
    closeModal();
    await loadItems();
    render();
  } catch (err) {
    console.warn('[PlanWise] Delete failed:', err.message);
    showModalError('Delete failed — ' + err.message);
  }
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────

function renderGroupPicker(existingItem) {
  const row       = el('equipment-group-row');
  const container = el('equipment-field-groups');
  container.innerHTML = '';

  if (calGroups.length === 0) {
    row.classList.add('hidden');
    row.classList.remove('flex');
    return;
  }

  row.classList.remove('hidden');
  row.classList.add('flex');

  if (existingItem?.id) {
    container.innerHTML = '<div class="font-mono text-[9px] text-on-muted tracking-wider">Loading...</div>';
    Social.getSharedGroupsForEquipment(existingItem.id).then(sharedIds => {
      container.innerHTML = '';
      for (const g of calGroups) {
        container.appendChild(makeGroupCheckbox(g, sharedIds.includes(g.id)));
      }
    }).catch(() => {
      container.innerHTML = '<div class="font-mono text-[9px] text-on-muted">Could not load groups.</div>';
    });
  } else {
    for (const g of calGroups) {
      container.appendChild(makeGroupCheckbox(g, false));
    }
  }
}

function makeGroupCheckbox(group, alreadyShared) {
  const label = document.createElement('label');
  label.className = 'flex items-center gap-2 cursor-pointer text-sm py-0.5';
  label.innerHTML = `
    <input type="checkbox" data-group-id="${group.id}" ${alreadyShared ? 'checked disabled' : ''} class="equipment-group-cb w-3 h-3 cursor-pointer" />
    <span class="w-2 h-2 flex-shrink-0" style="background:${group.colour}"></span>
    <span class="text-on-surface">${group.name}</span>
    ${alreadyShared ? '<span class="font-mono text-[8px] text-on-muted ml-auto">Shared</span>' : ''}
  `;
  return label;
}

function openAddModal(col) {
  addingToColumn = col;
  editingItem = null;
  el('modal-title').textContent = 'ADD EQUIPMENT';
  el('equipment-date-label').textContent = DATE_LABELS[col];
  el('equipment-name').value  = '';
  el('equipment-date').value  = '';
  el('equipment-notes').value = '';
  showModalError('');
  hide('modal-delete');
  renderGroupPicker(null);
  show('modal-overlay');
  el('equipment-name').focus();
}

function openEditModal(item) {
  editingItem = item;
  addingToColumn = null;
  el('modal-title').textContent = 'EDIT EQUIPMENT';
  el('equipment-date-label').textContent = DATE_LABELS[item.status];
  el('equipment-name').value  = item.name        || '';
  el('equipment-date').value  = item.target_date || '';
  el('equipment-notes').value = item.notes       || '';
  showModalError('');
  show('modal-delete');
  renderGroupPicker(item);
  show('modal-overlay');
  el('equipment-name').focus();
}

function closeModal() {
  hide('modal-overlay');
  editingItem = null;
  addingToColumn = null;
}

function showModalError(msg) {
  let errEl = el('modal-error');
  if (!errEl) return;
  errEl.textContent = msg;
  msg ? errEl.classList.remove('hidden') : errEl.classList.add('hidden');
}

// ─────────────────────────────────────────────
// CONTROLS
// ─────────────────────────────────────────────

function wireControls() {
  el('btn-add-equipment').addEventListener('click', () => openAddModal('in_use'));

  document.querySelectorAll('.col-add-btn').forEach(btn => {
    btn.addEventListener('click', () => openAddModal(btn.dataset.col));
  });

  el('modal-close').addEventListener('click', closeModal);
  el('modal-cancel').addEventListener('click', closeModal);
  el('modal-save').addEventListener('click', handleSave);
  el('modal-delete').addEventListener('click', handleDelete);

  el('modal-overlay').addEventListener('click', (e) => {
    if (e.target === el('modal-overlay')) closeModal();
  });

  el('equipment-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') closeModal();
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function el(id)   { return document.getElementById(id); }
function show(id) { el(id).classList.remove('hidden'); }
function hide(id) { el(id).classList.add('hidden'); }

init();
