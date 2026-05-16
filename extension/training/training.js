/**
 * PlanWise Training Data Labeller
 *
 * Loads logged detections, lets you label each one, and exports
 * the labelled dataset as JSON for Phase 7 ML training.
 */

const Logger = window.DetectionLogger;

let allEntries    = [];
let currentFilter = 'all';
let searchQuery   = '';


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

async function init() {
  allEntries = await Logger.getLog();
  allEntries = allEntries.reverse();

  renderStats();
  renderList();
  wireControls();
}


// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────

function renderStats() {
  const total    = allEntries.length;
  const labelled = allEntries.filter(e => e.label !== null).length;
  const correct  = allEntries.filter(e => e.label === 'correct').length;
  const fp       = allEntries.filter(e => e.label === 'false_positive').length;
  const fn       = allEntries.filter(e => e.label === 'false_negative').length;

  el('stat-total').textContent    = total;
  el('stat-labelled').textContent = `${labelled} / ${total}`;
  el('stat-correct').textContent  = correct;
  el('stat-fp').textContent       = fp;
  el('stat-fn').textContent       = fn;
}


// ─────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────

function getFilteredEntries() {
  return allEntries.filter(entry => {
    if (currentFilter === 'unlabelled'    && entry.label !== null) return false;
    if (currentFilter === 'triggered'     && !entry.triggered)     return false;
    if (currentFilter === 'not-triggered' && entry.triggered)      return false;

    if (searchQuery) {
      return entry.text.toLowerCase().includes(searchQuery.toLowerCase());
    }

    return true;
  });
}

function renderList() {
  const entries   = getFilteredEntries();
  const container = el('entry-list');
  container.innerHTML = '';

  if (entries.length === 0) {
    show('empty-state');
    return;
  }

  hide('empty-state');

  for (const entry of entries) {
    container.appendChild(makeEntryCard(entry));
  }

  if (typeof anime !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    anime({
      targets: "#entry-list .entry",
      opacity: [0, 1],
      translateY: [10, 0],
      delay: anime.stagger(50, { start: 60 }),
      duration: 320,
      easing: "easeOutQuart"
    });
  }
}

function makeEntryCard(entry) {
  const card = document.createElement('div');
  card.className = `entry${entry.label ? ` labelled-${entry.label}` : ''}`;
  card.dataset.id = entry.id;

  const date = new Date(entry.loggedAt).toLocaleString();

  card.innerHTML = `
    <div class="entry-header">
      <div class="entry-text">"${escapeHtml(entry.text)}"</div>
      <div class="entry-meta">
        <span class="badge ${entry.triggered ? 'badge-triggered' : 'badge-not-triggered'}">
          ${entry.triggered ? 'Triggered' : 'Not triggered'}
        </span>
      </div>
    </div>

    <div class="entry-scores">
      <span>Score: <strong>${entry.score}</strong></span>
      <span>Intent: <strong>${entry.intent}</strong></span>
      <span>Reason: <strong>${entry.reason}</strong></span>
      <span style="color:#555">${date}</span>
    </div>

    <div class="label-row">
      <span style="font-size:11px;color:var(--text-muted);margin-right:4px;">Label:</span>
      <button class="label-btn ${entry.label === 'correct'        ? 'active-correct'        : ''}"
              data-label="correct">✓ Correct</button>
      <button class="label-btn ${entry.label === 'false_positive' ? 'active-false_positive' : ''}"
              data-label="false_positive">✗ False positive</button>
      <button class="label-btn ${entry.label === 'false_negative' ? 'active-false_negative' : ''}"
              data-label="false_negative">? False negative</button>
    </div>

    <textarea class="entry-notes" placeholder="Optional notes (e.g. why this was wrong)..."
              rows="1">${entry.notes || ''}</textarea>
  `;

  card.querySelectorAll('.label-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const label = btn.dataset.label;
      await Logger.updateLabel(entry.id, label, card.querySelector('.entry-notes').value);

      const idx = allEntries.findIndex(e => e.id === entry.id);
      if (idx !== -1) allEntries[idx].label = label;

      const fresh = allEntries.find(e => e.id === entry.id);
      const newCard = makeEntryCard(fresh);
      card.replaceWith(newCard);

      renderStats();
    });
  });

  const notesEl = card.querySelector('.entry-notes');
  notesEl.addEventListener('blur', async () => {
    const idx = allEntries.findIndex(e => e.id === entry.id);
    if (idx !== -1) {
      allEntries[idx].notes = notesEl.value;
      await Logger.updateLabel(entry.id, allEntries[idx].label, notesEl.value);
    }
  });

  return card;
}


// ─────────────────────────────────────────────
// CONTROLS
// ─────────────────────────────────────────────

function wireControls() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });

  el('search').addEventListener('input', () => {
    searchQuery = el('search').value;
    renderList();
  });

  el('btn-export').addEventListener('click', async () => {
    const json = await Logger.exportAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `planwise-training-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  el('btn-clear').addEventListener('click', async () => {
    if (!confirm('Clear all logged detections? This cannot be undone.')) return;
    await Logger.clearLog();
    allEntries = [];
    renderStats();
    renderList();
  });
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(id)   { return document.getElementById(id); }
function show(id) { el(id).classList.remove('hidden'); }
function hide(id) { el(id).classList.add('hidden'); }


init();
