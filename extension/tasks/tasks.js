/**
 * PlanWise Tasks — Kanban Board
 * Storage: chrome.storage.local under 'planwiseTasks' key
 */

let allTasks = [];
let editingTask = null;
let addingToColumn = null;

const COLS = ['todo', 'inprogress', 'done'];

async function init() {
  await loadTasks();
  render();
  wireControls();
}

// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────

async function loadTasks() {
  try {
    const result = await chrome.storage.local.get('planwiseTasks');
    allTasks = result.planwiseTasks || [];
  } catch {
    allTasks = [];
  }
}

async function saveTasks() {
  try {
    await chrome.storage.local.set({ planwiseTasks: allTasks });
  } catch (err) {
    console.warn('[PlanWise] Failed to save tasks:', err.message);
  }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function render() {
  for (const col of COLS) {
    const cards = allTasks.filter(t => t.column === col);
    el('cards-' + col).innerHTML = '';
    el('count-' + col).textContent = cards.length;
    for (const task of cards) {
      el('cards-' + col).appendChild(makeCard(task));
    }
  }
}

function makeCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card' + (task.priority ? ` priority-${task.priority}` : '');
  card.dataset.id = task.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = task.title;
  card.appendChild(title);

  if (task.date) {
    const dateEl = document.createElement('div');
    dateEl.className = 'card-date';
    dateEl.textContent = new Date(task.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
    card.appendChild(dateEl);
  }

  if (task.priority) {
    const badge = document.createElement('span');
    badge.className = 'card-priority';
    badge.textContent = task.priority.toUpperCase();
    card.appendChild(badge);
  }

  // Move arrows
  const colIdx = COLS.indexOf(task.column);
  const moves = document.createElement('div');
  moves.className = 'card-moves';

  if (colIdx > 0) {
    const prev = document.createElement('button');
    prev.className = 'move-btn';
    prev.textContent = '←';
    prev.title = 'Move left';
    prev.addEventListener('click', (e) => { e.stopPropagation(); moveTask(task.id, COLS[colIdx - 1]); });
    moves.appendChild(prev);
  }

  if (colIdx < COLS.length - 1) {
    const next = document.createElement('button');
    next.className = 'move-btn';
    next.textContent = '→';
    next.title = 'Move right';
    next.addEventListener('click', (e) => { e.stopPropagation(); moveTask(task.id, COLS[colIdx + 1]); });
    moves.appendChild(next);
  }

  if (moves.children.length > 0) card.appendChild(moves);

  card.addEventListener('click', () => openEditModal(task));
  return card;
}

// ─────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────

async function moveTask(id, newCol) {
  const idx = allTasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    allTasks[idx].column = newCol;
    await saveTasks();
    render();
  }
}

async function handleSave() {
  const title = el('task-title').value.trim();
  if (!title) { el('task-title').focus(); return; }

  if (editingTask) {
    const idx = allTasks.findIndex(t => t.id === editingTask.id);
    if (idx !== -1) {
      allTasks[idx] = {
        ...allTasks[idx],
        title,
        date:     el('task-date').value,
        priority: el('task-priority').value,
        notes:    el('task-notes').value.trim(),
      };
    }
  } else {
    allTasks.push({
      id:        crypto.randomUUID(),
      title,
      column:    addingToColumn || 'todo',
      date:      el('task-date').value,
      priority:  el('task-priority').value,
      notes:     el('task-notes').value.trim(),
      createdAt: Date.now(),
    });
  }

  await saveTasks();
  closeModal();
  render();
}

async function handleDelete() {
  if (!editingTask) return;
  if (!confirm(`Delete "${editingTask.title}"?`)) return;
  allTasks = allTasks.filter(t => t.id !== editingTask.id);
  await saveTasks();
  closeModal();
  render();
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function openAddModal(col) {
  addingToColumn = col;
  editingTask = null;
  el('modal-title').textContent = 'ADD TASK';
  el('task-title').value = '';
  el('task-date').value = '';
  el('task-date').min   = todayStr();
  el('task-priority').value = '';
  el('task-notes').value = '';
  hide('modal-delete');
  show('modal-overlay');
  el('task-title').focus();
}

function openEditModal(task) {
  editingTask = task;
  addingToColumn = null;
  el('modal-title').textContent = 'EDIT TASK';
  el('task-title').value    = task.title    || '';
  el('task-date').value     = task.date     || '';
  el('task-date').min       = todayStr();
  el('task-priority').value = task.priority || '';
  el('task-notes').value    = task.notes    || '';
  show('modal-delete');
  show('modal-overlay');
  el('task-title').focus();
}

function closeModal() {
  hide('modal-overlay');
  editingTask = null;
  addingToColumn = null;
}

// ─────────────────────────────────────────────
// CONTROLS
// ─────────────────────────────────────────────

function wireControls() {
  el('btn-add-task').addEventListener('click', () => openAddModal('todo'));

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

  el('task-title').addEventListener('keydown', (e) => {
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
