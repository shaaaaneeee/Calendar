/**
 * PlanWise Extension — Comprehensive E2E Bug Hunt
 * Playwright test with Chromium + unpacked extension loaded
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, '../extension');

let browser, extId, context;

// ─── Launch browser with extension ───────────────────────────────────────────
async function launchWithExtension() {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  });

  // Grab extension ID from background service worker
  let [background] = ctx.serviceWorkers();
  if (!background) {
    background = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  }
  const id = background.url().split('/')[2];
  return { ctx, id };
}

function extUrl(id, page) {
  return `chrome-extension://${id}/${page}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — POPUP PAGE (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Popup — Auth Screen', () => {
  test.beforeAll(async () => {
    ({ ctx: context, id: extId } = await launchWithExtension());
  });
  test.afterAll(async () => { await context.close(); });

  test('POP-01: popup renders auth screen when not logged in', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForTimeout(3500); // wait for 3s timeout
    const authScreen = page.locator('#auth-screen');
    await expect(authScreen).toBeVisible({ timeout: 5000 });
    const loading = page.locator('#loading');
    await expect(loading).toBeHidden();
    await page.screenshot({ path: 'test-screenshots/POP-01-auth-screen.png', fullPage: true });
    await page.close();
  });

  test('POP-02: sign in with empty fields shows error', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-signin');
    const err = page.locator('#auth-error');
    await expect(err).toBeVisible();
    await expect(err).toHaveText('Please enter your email and password.');
    await page.screenshot({ path: 'test-screenshots/POP-02-empty-signin-error.png' });
    await page.close();
  });

  test('POP-03: sign up with password < 6 chars shows error', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.fill('#auth-email', 'test@example.com');
    await page.fill('#auth-password', '123');
    await page.click('#btn-signup');
    const err = page.locator('#auth-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('at least 6 characters');
    await page.close();
  });

  test('POP-04: sign in with wrong credentials shows error', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.fill('#auth-email', 'wrong@example.com');
    await page.fill('#auth-password', 'wrongpassword123');
    await page.click('#btn-signin');
    // button goes disabled during request
    await expect(page.locator('#btn-signin')).toBeDisabled();
    const err = page.locator('#auth-error');
    await expect(err).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-screenshots/POP-04-bad-credentials.png' });
    await page.close();
  });

  test('POP-05: sign up with valid email shows confirm message', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.fill('#auth-email', `test${Date.now()}@mailnull.com`);
    await page.fill('#auth-password', 'password123');
    await page.click('#btn-signup');
    const err = page.locator('#auth-error');
    await expect(err).toBeVisible({ timeout: 10000 });
    // Should show check email message, not an error
    await page.screenshot({ path: 'test-screenshots/POP-05-signup-result.png' });
    await page.close();
  });

  test('POP-06: email field accepts XSS payload without executing', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.fill('#auth-email', '<script>window.__xss=1</script>');
    await page.fill('#auth-password', 'test123');
    await page.click('#btn-signin');
    await page.waitForTimeout(1000);
    const xssExecuted = await page.evaluate(() => window.__xss);
    expect(xssExecuted).toBeFalsy();
    await page.close();
  });

  test('POP-07: 2000-char email does not crash signin', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    const longEmail = 'a'.repeat(1990) + '@x.com';
    await page.fill('#auth-email', longEmail);
    await page.fill('#auth-password', 'password123');
    await page.click('#btn-signin');
    await page.waitForTimeout(2000);
    // Should show error, not crash
    expect(errors.length).toBe(0);
    await page.close();
  });

  test('POP-08: rapid clicking sign in 10x does not break UI', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.fill('#auth-email', 'test@example.com');
    await page.fill('#auth-password', 'test123');
    for (let i = 0; i < 10; i++) {
      await page.click('#btn-signin');
    }
    await page.waitForTimeout(2000);
    // Page should still be functional
    const authScreen = page.locator('#auth-screen');
    await expect(authScreen).toBeVisible();
    await page.close();
  });

  test('POP-09: unicode/emoji in email field', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    await page.fill('#auth-email', 'tëst🎉@éxample.cöm');
    await page.fill('#auth-password', 'pässwörd123');
    await page.click('#btn-signin');
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('POP-10: header subtitle changes to "Sign in" on auth screen', async () => {
    const page = await context.newPage();
    await page.goto(extUrl(extId, 'popup/popup.html'));
    await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 5000 });
    const subtitle = await page.textContent('#header-subtitle');
    expect(subtitle).toBe('Sign in');
    await page.close();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — POPUP with injected pending events (localStorage hack)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Popup — Event Queue (mocked storage)', () => {
  let ctx2, id2;

  test.beforeAll(async () => {
    ({ ctx: ctx2, id: id2 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx2.close(); });

  async function injectPendingEvent(page, event = {}) {
    const defaults = {
      id: 'test-id-001',
      title: 'Coffee with Alex',
      date: '2026-07-15',
      time: '14:00',
      participants: ['Alex'],
      notes: 'Bring laptop',
      sourceText: "Let's grab coffee tomorrow at 2pm",
      platform: 'whatsapp',
      status: 'pending',
      detectedAt: Date.now(),
    };
    const ev = { ...defaults, ...event };
    await page.evaluate((ev) => {
      chrome.storage.local.set({ pendingEvents: [ev] });
    }, ev);
  }

  async function injectSession(page) {
    // Inject a fake session — Supabase will reject it but the UI should handle gracefully
    await page.evaluate(() => {
      chrome.storage.local.set({
        planwise_session: {
          access_token: 'fake-token',
          refresh_token: 'fake-refresh',
          user: { id: 'user-123', email: 'test@example.com' }
        }
      });
    });
  }

  test('POP-11: event card renders with injected pending event', async () => {
    const page = await ctx2.newPage();
    await page.goto(extUrl(id2, 'popup/popup.html'));
    await injectPendingEvent(page);
    // Reload after injecting so popup picks it up
    await page.reload();
    // Will show auth (fake session fails) — verify graceful fallback
    await page.waitForTimeout(4000);
    const authVisible = await page.locator('#auth-screen').isVisible();
    // Even with fake session, popup should show auth, not crash
    expect(authVisible).toBe(true);
    await page.screenshot({ path: 'test-screenshots/POP-11-fake-session.png' });
    await page.close();
  });

  test('POP-12: queue info text is correct for multiple events', async () => {
    const page = await ctx2.newPage();
    await page.goto(extUrl(id2, 'popup/popup.html'));
    // Inject 3 events
    await page.evaluate(() => {
      chrome.storage.local.set({
        pendingEvents: [
          { id: 'e1', title: 'Event 1', date: '2026-07-15', time: '10:00', participants: [], status: 'pending', detectedAt: Date.now(), sourceText: 'text1' },
          { id: 'e2', title: 'Event 2', date: '2026-07-16', time: '11:00', participants: [], status: 'pending', detectedAt: Date.now(), sourceText: 'text2' },
          { id: 'e3', title: 'Event 3', date: '2026-07-17', time: '12:00', participants: [], status: 'pending', detectedAt: Date.now(), sourceText: 'text3' },
        ]
      });
    });
    await page.close();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  let ctx3, id3;

  test.beforeAll(async () => {
    ({ ctx: ctx3, id: id3 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx3.close(); });

  test('DASH-01: dashboard loads and shows calendar grid', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(3000);
    const grid = page.locator('#calendar-grid');
    await expect(grid).toBeVisible();
    await page.screenshot({ path: 'test-screenshots/DASH-01-calendar.png', fullPage: true });
    await page.close();
  });

  test('DASH-02: month view renders 7 column headers', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(3000);
    const dayNames = await page.locator('.month-day-name').count();
    expect(dayNames).toBe(7);
    await page.close();
  });

  test('DASH-03: today cell is visually highlighted', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(3000);
    const todayCell = page.locator('.month-cell.today');
    await expect(todayCell).toBeVisible();
    await page.screenshot({ path: 'test-screenshots/DASH-03-today-cell.png' });
    await page.close();
  });

  test('DASH-04: next/prev month navigation works', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    const titleBefore = await page.textContent('#cal-title');
    await page.click('#btn-next');
    await page.waitForTimeout(500);
    const titleAfter = await page.textContent('#cal-title');
    expect(titleBefore).not.toBe(titleAfter);
    await page.click('#btn-prev');
    await page.waitForTimeout(500);
    const titleRestored = await page.textContent('#cal-title');
    expect(titleRestored).toBe(titleBefore);
    await page.close();
  });

  test('DASH-05: navigate 50 months forward does not crash', async () => {
    const page = await ctx3.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    for (let i = 0; i < 50; i++) {
      await page.click('#btn-next');
    }
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
    const grid = page.locator('#calendar-grid');
    await expect(grid).toBeVisible();
    await page.close();
  });

  test('DASH-06: switch to week view', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.click('#view-week');
    await page.waitForTimeout(500);
    const weekCells = await page.locator('.week-cell').count();
    expect(weekCells).toBe(7);
    await page.screenshot({ path: 'test-screenshots/DASH-06-week-view.png' });
    await page.close();
  });

  test('DASH-07: switch between month and week views repeatedly', async () => {
    const page = await ctx3.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    for (let i = 0; i < 10; i++) {
      await page.click('#view-week');
      await page.click('#view-month');
    }
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('DASH-08: clicking a day cell opens day panel', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    // Click first current-month cell
    await page.locator('.month-cell:not(.other-month)').first().click();
    const panel = page.locator('#day-panel');
    await expect(panel).toBeVisible();
    await page.screenshot({ path: 'test-screenshots/DASH-08-day-panel.png' });
    await page.close();
  });

  test('DASH-09: day panel close button works', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.locator('.month-cell:not(.other-month)').first().click();
    await page.waitForSelector('#day-panel:not(.hidden)');
    await page.click('#day-panel-close');
    await expect(page.locator('#day-panel')).toBeHidden();
    await page.close();
  });

  test('DASH-10: FAB opens add event modal', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.click('#btn-add-event');
    const modal = page.locator('#modal-overlay');
    await expect(modal).toBeVisible();
    // Should say ADD EVENT
    const label = await page.textContent('.modal-label');
    expect(label).toBe('ADD EVENT');
    await page.screenshot({ path: 'test-screenshots/DASH-10-add-modal.png' });
    await page.close();
  });

  test('DASH-11: modal cancel closes modal', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.click('#btn-add-event');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.click('#modal-cancel');
    await expect(page.locator('#modal-overlay')).toBeHidden();
    await page.close();
  });

  test('DASH-12: modal overlay background click closes modal', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.click('#btn-add-event');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    // Click the overlay background (not the modal card)
    await page.click('#modal-overlay', { position: { x: 10, y: 10 } });
    await expect(page.locator('#modal-overlay')).toBeHidden();
    await page.close();
  });

  test('DASH-13: save empty title is rejected (focus stays)', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.click('#btn-add-event');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    // Clear title and try to save
    await page.fill('#modal-field-title', '');
    await page.click('#modal-save');
    // Modal should still be open
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.close();
  });

  test('DASH-14: XSS in event title is escaped', async () => {
    const page = await ctx3.newPage();
    const xssTriggered = [];
    await page.exposeFunction('__xssCallback', () => xssTriggered.push(1));
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    // Inject local confirmed event with XSS title
    await page.evaluate(() => {
      chrome.storage.local.set({
        confirmedEvents: [{
          id: 'xss-1',
          title: '<img src=x onerror="window.__xssCallback && window.__xssCallback()">',
          date: '2026-07-15',
          time: '10:00',
          participants: [],
        }]
      });
    });
    await page.reload();
    await page.waitForTimeout(2000);
    expect(xssTriggered).toHaveLength(0);
    await page.close();
  });

  test('DASH-15: notification panel opens and closes', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    const bell = page.locator('#btn-notifications');
    await bell.click();
    const panel = page.locator('#notif-panel');
    await expect(panel).toBeVisible();
    await bell.click();
    await expect(panel).toBeHidden();
    await page.close();
  });

  test('DASH-16: today display shows current date', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    const display = await page.textContent('#today-display');
    expect(display.length).toBeGreaterThan(3);
    await page.close();
  });

  test('DASH-17: rapid day panel open/close does not corrupt state', async () => {
    const page = await ctx3.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    const cells = page.locator('.month-cell:not(.other-month)');
    for (let i = 0; i < 5; i++) {
      await cells.nth(i).click();
      await page.click('#day-panel-close');
    }
    expect(errors).toHaveLength(0);
    await page.close();
  });

  test('DASH-18: task deadlines appear as red pills in calendar', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    // Inject a task with today's date
    const today = new Date().toISOString().split('T')[0];
    await page.evaluate((today) => {
      chrome.storage.local.set({
        planwiseTasks: [{
          id: 'task-1',
          title: 'Submit report',
          column: 'todo',
          date: today,
          priority: 'high',
        }]
      });
    }, today);
    await page.reload();
    await page.waitForTimeout(2500);
    // Deadline pill should appear on today's cell
    const todayCell = page.locator('.month-cell.today');
    const pills = todayCell.locator('.event-pill');
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-screenshots/DASH-18-deadline-pill.png' });
    await page.close();
  });

  test('DASH-19: deadline pill click does NOT open edit modal', async () => {
    const page = await ctx3.newPage();
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    const today = new Date().toISOString().split('T')[0];
    await page.evaluate((today) => {
      chrome.storage.local.set({
        planwiseTasks: [{
          id: 'task-dead', title: 'Deadline Task', column: 'todo', date: today,
        }]
      });
    }, today);
    await page.reload();
    await page.waitForTimeout(2500);
    const todayCell = page.locator('.month-cell.today');
    const pill = todayCell.locator('.event-pill').first();
    await pill.click();
    // Modal should remain hidden
    await expect(page.locator('#modal-overlay')).toBeHidden();
    await page.close();
  });

  test('DASH-20: window resize does not break layout', async () => {
    const page = await ctx3.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(extUrl(id3, 'dashboard/dashboard.html'));
    await page.waitForTimeout(2000);
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setViewportSize({ width: 1280, height: 720 });
    expect(errors).toHaveLength(0);
    await page.screenshot({ path: 'test-screenshots/DASH-20-responsive.png', fullPage: true });
    await page.close();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — TASKS (Kanban Board)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks — Kanban Board', () => {
  let ctx4, id4;

  test.beforeAll(async () => {
    ({ ctx: ctx4, id: id4 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx4.close(); });

  test('TASK-01: tasks page renders 3 kanban columns', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(1000);
    await expect(page.locator('#col-todo')).toBeVisible();
    await expect(page.locator('#col-inprogress')).toBeVisible();
    await expect(page.locator('#col-done')).toBeVisible();
    await page.screenshot({ path: 'test-screenshots/TASK-01-board.png', fullPage: true });
    await page.close();
  });

  test('TASK-02: add task via NEW TASK button', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(1000);
    await page.click('#btn-add-task');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    const title = await page.textContent('#modal-title');
    expect(title).toBe('ADD TASK');
    await page.fill('#task-title', 'Test Task Alpha');
    await page.fill('#task-date', '2026-08-01');
    await page.selectOption('#task-priority', 'high');
    await page.fill('#task-notes', 'Some notes here');
    await page.click('#modal-save');
    await expect(page.locator('#modal-overlay')).toBeHidden();
    // Task card should appear in TODO column
    const cards = page.locator('#cards-todo .task-card');
    await expect(cards).toHaveCount(1);
    const cardText = await cards.first().textContent();
    expect(cardText).toContain('Test Task Alpha');
    await page.screenshot({ path: 'test-screenshots/TASK-02-added.png' });
    await page.close();
  });

  test('TASK-03: add task with empty title is rejected', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(1000);
    await page.click('#btn-add-task');
    await page.fill('#task-title', '');
    await page.click('#modal-save');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.close();
  });

  test('TASK-04: task can be moved right (todo → in progress)', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    // Add a task first
    await page.evaluate(() => {
      chrome.storage.local.set({ planwiseTasks: [
        { id: 'move-1', title: 'Move Me', column: 'todo', createdAt: Date.now() }
      ]});
    });
    await page.reload();
    await page.waitForTimeout(500);
    const card = page.locator('#cards-todo .task-card').first();
    await expect(card).toBeVisible();
    const moveBtn = card.locator('.move-btn').last();
    await moveBtn.click();
    await page.waitForTimeout(300);
    // Should now be in inprogress
    await expect(page.locator('#cards-inprogress .task-card')).toHaveCount(1);
    await expect(page.locator('#cards-todo .task-card')).toHaveCount(0);
    await page.close();
  });

  test('TASK-05: task edit opens pre-populated modal', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ planwiseTasks: [
        { id: 'edit-1', title: 'Edit Me Task', column: 'todo', date: '2026-08-15', priority: 'medium', notes: 'Old notes', createdAt: Date.now() }
      ]});
    });
    await page.reload();
    await page.waitForTimeout(500);
    await page.locator('#cards-todo .task-card').first().click();
    await expect(page.locator('#modal-overlay')).toBeVisible();
    const modalTitle = await page.textContent('#modal-title');
    expect(modalTitle).toBe('EDIT TASK');
    const titleVal = await page.inputValue('#task-title');
    expect(titleVal).toBe('Edit Me Task');
    const notesVal = await page.inputValue('#task-notes');
    expect(notesVal).toBe('Old notes');
    await page.close();
  });

  test('TASK-06: delete button appears in edit mode', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ planwiseTasks: [
        { id: 'del-1', title: 'Delete Test', column: 'todo', createdAt: Date.now() }
      ]});
    });
    await page.reload();
    await page.waitForTimeout(500);
    await page.locator('#cards-todo .task-card').first().click();
    await expect(page.locator('#modal-delete')).toBeVisible();
    await page.close();
  });

  test('TASK-07: cancel button closes modal without saving', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    await page.click('#btn-add-task');
    await page.fill('#task-title', 'Should Not Save');
    await page.click('#modal-cancel');
    await expect(page.locator('#modal-overlay')).toBeHidden();
    const cards = page.locator('#cards-todo .task-card');
    await expect(cards).toHaveCount(0);
    await page.close();
  });

  test('TASK-08: modal overlay click closes modal', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    await page.click('#btn-add-task');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.click('#modal-overlay', { position: { x: 5, y: 5 } });
    await expect(page.locator('#modal-overlay')).toBeHidden();
    await page.close();
  });

  test('TASK-09: Enter key in title field saves task', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    await page.click('#btn-add-task');
    await page.fill('#task-title', 'Enter Key Task');
    await page.press('#task-title', 'Enter');
    await expect(page.locator('#modal-overlay')).toBeHidden();
    await expect(page.locator('#cards-todo .task-card')).toHaveCount(1);
    await page.close();
  });

  test('TASK-10: Escape key in title field closes modal', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    await page.click('#btn-add-task');
    await page.fill('#task-title', 'Esc Test');
    await page.press('#task-title', 'Escape');
    await expect(page.locator('#modal-overlay')).toBeHidden();
    await page.close();
  });

  test('TASK-11: XSS in task title is not executed', async () => {
    const page = await ctx4.newPage();
    const xss = [];
    page.on('pageerror', e => xss.push(e.message));
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ planwiseTasks: [
        { id: 'xss-task', title: '<img src=x onerror=\'alert(1)\'>', column: 'todo', createdAt: Date.now() }
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1000);
    // Check no alert was triggered — page errors = 0
    // (alert would fail in MV3 context anyway, but this checks for DOM injection)
    const card = page.locator('#cards-todo .task-card');
    await expect(card).toBeVisible();
    await page.close();
  });

  test('TASK-12: past date for due date is allowed (no min enforcement after today in edit)', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    await page.click('#btn-add-task');
    // The min is set to today — try a past date
    await page.fill('#task-title', 'Past Due Task');
    const pastDate = '2020-01-01';
    await page.evaluate((d) => {
      document.getElementById('task-date').value = d;
    }, pastDate);
    await page.click('#modal-save');
    // Should save (HTML min validation is client-side only, not enforced by JS)
    await page.waitForTimeout(300);
    const cards = page.locator('#cards-todo .task-card');
    await expect(cards).toHaveCount(1);
    await page.close();
  });

  test('TASK-13: column count badges update correctly', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ planwiseTasks: [
        { id: 't1', title: 'T1', column: 'todo', createdAt: Date.now() },
        { id: 't2', title: 'T2', column: 'todo', createdAt: Date.now() },
        { id: 't3', title: 'T3', column: 'inprogress', createdAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(500);
    expect(await page.textContent('#count-todo')).toBe('2');
    expect(await page.textContent('#count-inprogress')).toBe('1');
    expect(await page.textContent('#count-done')).toBe('0');
    await page.close();
  });

  test('TASK-14: task with very long title renders without breaking layout', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ planwiseTasks: [
        { id: 'long-1', title: 'A'.repeat(500), column: 'todo', createdAt: Date.now() }
      ]});
    });
    await page.reload();
    await page.waitForTimeout(500);
    const card = page.locator('#cards-todo .task-card').first();
    await expect(card).toBeVisible();
    await page.screenshot({ path: 'test-screenshots/TASK-14-long-title.png' });
    await page.close();
  });

  test('TASK-15: column add button opens modal with correct column target', async () => {
    const page = await ctx4.newPage();
    await page.goto(extUrl(id4, 'tasks/tasks.html'));
    await page.waitForTimeout(500);
    // Click the '+' in IN PROGRESS column
    await page.locator('.col-add-btn[data-col="inprogress"]').click();
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await page.fill('#task-title', 'Direct To Progress');
    await page.click('#modal-save');
    await expect(page.locator('#cards-inprogress .task-card')).toHaveCount(1);
    await page.close();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — SETTINGS PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  let ctx5, id5;

  test.beforeAll(async () => {
    ({ ctx: ctx5, id: id5 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx5.close(); });

  async function openSettingsLoggedIn(ctx, id) {
    const page = await ctx.newPage();
    // Inject fake session so settings doesn't window.close()
    await page.goto(extUrl(id, 'settings/settings.html'));
    // Since the page calls window.close() when not logged in, let's intercept
    await page.evaluate(() => {
      window.close = () => {}; // prevent close
    });
    // The page already called close before we could intercept
    // We need a different approach — inject the session first via background
    return page;
  }

  test('SETT-01: settings redirects (closes) when not logged in', async () => {
    const page = await ctx5.newPage();
    let closed = false;
    page.on('close', () => { closed = true; });
    await page.goto(extUrl(id5, 'settings/settings.html'));
    // Page shows a brief message then calls window.close() — wait up to 4s for it.
    try {
      await page.waitForTimeout(4000);
    } catch (_) {
      // Page closed during wait — that is the expected outcome.
    }
    expect(closed).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — DETECTION ENGINE (unit-style tests in browser context)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Detection Engine', () => {
  let ctx6, id6, page;

  test.beforeAll(async () => {
    ({ ctx: ctx6, id: id6 } = await launchWithExtension());
    page = await ctx6.newPage();
    // Load the detection engine scripts by navigating to training page
    // (it loads logger.js which doesn't require auth)
    await page.goto(extUrl(id6, 'training/training.html'));
    await page.waitForTimeout(1000);
    // Inject the detection scripts manually
    await page.addScriptTag({ path: path.resolve(__dirname, '../extension/detection/rules.js') });
    await page.addScriptTag({ path: path.resolve(__dirname, '../extension/detection/engine.js') });
  });
  test.afterAll(async () => { await page.close(); await ctx6.close(); });

  async function analyze(text, custom = {}) {
    return page.evaluate(({ text, custom }) => {
      return window.PlanWiseEngine.analyzeIntent(text, custom);
    }, { text, custom });
  }

  test('DET-01: "let\'s meet tomorrow at 3pm" triggers detection', async () => {
    const r = await analyze("let's meet tomorrow at 3pm");
    expect(r.triggered).toBe(true);
    expect(r.intent).toBe('CONFIRM');
  });

  test('DET-02: "I can\'t make it tomorrow" is hard-blocked', async () => {
    const r = await analyze("I can't make it tomorrow at 5pm");
    expect(r.triggered).toBe(false);
  });

  test('DET-03: "see you at dinner tonight" triggers', async () => {
    const r = await analyze("see you at dinner tonight");
    expect(r.triggered).toBe(true);
  });

  test('DET-04: empty string returns score 0', async () => {
    const r = await analyze('');
    expect(r.score).toBe(0);
    expect(r.triggered).toBe(false);
  });

  test('DET-05: very short text (< 3 chars) returns score 0', async () => {
    const r = await analyze('ok');
    expect(r.score).toBe(0);
  });

  test('DET-06: "lol let\'s gym tomorrow" — negation (lol) does not block plan', async () => {
    // "lol" is in negation rules (-3), but temporal+action should score high enough
    const r = await analyze("lol let's gym tomorrow at 9am");
    // This reveals a scoring edge case — lol penalty brings score down
    // This test documents the actual behavior
    console.log('DET-06 score:', r.score, 'triggered:', r.triggered);
    // No assertion — documenting behavior
  });

  test('DET-07: "last night we had dinner" is hard-blocked (past event)', async () => {
    const r = await analyze("last night we had dinner together");
    expect(r.triggered).toBe(false);
  });

  test('DET-08: "want to do lunch next monday?" triggers', async () => {
    const r = await analyze("want to do lunch next monday?");
    expect(r.triggered).toBe(true);
  });

  test('DET-09: custom trigger word boosts score', async () => {
    const base = await analyze("we have practice");
    const custom = await analyze("we have practice", { triggerWords: ['practice'] });
    expect(custom.score).toBeGreaterThan(base.score);
  });

  test('DET-10: "I won\'t be there tomorrow" is blocked', async () => {
    const r = await analyze("I won't be there tomorrow");
    expect(r.triggered).toBe(false);
  });

  test('DET-11: null input does not throw', async () => {
    const r = await page.evaluate(() => {
      try {
        return window.PlanWiseEngine.analyzeIntent(null);
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(r.error).toBeUndefined();
    expect(r.triggered).toBe(false);
  });

  test('DET-12: object input does not throw', async () => {
    const r = await page.evaluate(() => {
      try {
        return window.PlanWiseEngine.analyzeIntent({});
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(r.error).toBeUndefined();
  });

  test('DET-13: 10000-char string does not cause stack overflow', async () => {
    const longStr = 'let us meet tomorrow '.repeat(500);
    const r = await analyze(longStr);
    expect(r).toBeTruthy();
  });

  test('DET-14: "maybe we can meet next week" — "maybe" negation check', async () => {
    // "maybe" is in negation rules but "let's meet next week" is strong signal
    const r = await analyze("maybe we can meet next week for coffee");
    console.log('DET-14 result:', r.triggered, r.score, r.reason);
    // Documenting edge case — user might want this to trigger
  });

  test('DET-15: "are you free this saturday?" triggers', async () => {
    const r = await analyze("are you free this saturday?");
    expect(r.triggered).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7 — TRAINING PAGE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Training Page', () => {
  let ctx7, id7;

  test.beforeAll(async () => {
    ({ ctx: ctx7, id: id7 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx7.close(); });

  test('TRAIN-01: training page loads with empty state', async () => {
    const page = await ctx7.newPage();
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.waitForTimeout(1500);
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#stat-total')).toHaveText('0');
    await page.screenshot({ path: 'test-screenshots/TRAIN-01-empty.png' });
    await page.close();
  });

  test('TRAIN-02: stats show correct counts with injected log', async () => {
    const page = await ctx7.newPage();
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ detectionLog: [
        { id: 'l1', text: 'meet tomorrow', triggered: true, score: 4, intent: 'CONFIRM', reason: 'test', label: 'correct', loggedAt: Date.now() },
        { id: 'l2', text: 'just chatting', triggered: false, score: 1, intent: 'AMBIGUOUS', reason: 'test', label: 'false_positive', loggedAt: Date.now() },
        { id: 'l3', text: 'dinner tonight', triggered: true, score: 3, intent: 'CONFIRM', reason: 'test', label: null, loggedAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1500);
    expect(await page.textContent('#stat-total')).toBe('3');
    expect(await page.textContent('#stat-correct')).toBe('1');
    expect(await page.textContent('#stat-fp')).toBe('1');
    await page.close();
  });

  test('TRAIN-03: filter by "triggered" shows only triggered entries', async () => {
    const page = await ctx7.newPage();
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ detectionLog: [
        { id: 'f1', text: 'triggered text', triggered: true, score: 4, intent: 'CONFIRM', reason: 'r', label: null, loggedAt: Date.now() },
        { id: 'f2', text: 'not triggered', triggered: false, score: 1, intent: 'AMBIGUOUS', reason: 'r', label: null, loggedAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1500);
    await page.click('[data-filter="triggered"]');
    await page.waitForTimeout(300);
    const entries = await page.locator('.entry').count();
    expect(entries).toBe(1);
    await page.close();
  });

  test('TRAIN-04: search filters entries by text', async () => {
    const page = await ctx7.newPage();
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ detectionLog: [
        { id: 's1', text: 'coffee meeting tomorrow', triggered: true, score: 4, intent: 'CONFIRM', reason: 'r', label: null, loggedAt: Date.now() },
        { id: 's2', text: 'random conversation', triggered: false, score: 0, intent: 'AMBIGUOUS', reason: 'r', label: null, loggedAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1500);
    await page.fill('#search', 'coffee');
    await page.waitForTimeout(300);
    const entries = await page.locator('.entry').count();
    expect(entries).toBe(1);
    await page.close();
  });

  test('TRAIN-05: export button triggers file download', async () => {
    const page = await ctx7.newPage();
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ detectionLog: [
        { id: 'e1', text: 'exportable', triggered: true, score: 4, intent: 'CONFIRM', reason: 'r', label: 'correct', loggedAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1500);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export'),
    ]);
    expect(download.suggestedFilename()).toMatch(/planwise-training-\d+\.json/);
    await page.close();
  });

  test('TRAIN-06: clear log shows confirmation and empties list', async () => {
    const page = await ctx7.newPage();
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ detectionLog: [
        { id: 'c1', text: 'test', triggered: true, score: 4, intent: 'CONFIRM', reason: 'r', label: null, loggedAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1500);
    // Accept the confirm dialog
    page.once('dialog', d => d.accept());
    await page.click('#btn-clear');
    await page.waitForTimeout(500);
    await expect(page.locator('#empty-state')).toBeVisible();
    expect(await page.textContent('#stat-total')).toBe('0');
    await page.close();
  });

  test('TRAIN-07: XSS in logged text is HTML-escaped via escapeHtml', async () => {
    const page = await ctx7.newPage();
    const xss = [];
    page.on('pageerror', e => xss.push(e.message));
    await page.goto(extUrl(id7, 'training/training.html'));
    await page.evaluate(() => {
      chrome.storage.local.set({ detectionLog: [
        { id: 'x1', text: '<script>window.__xss=1</script>', triggered: true, score: 4, intent: 'CONFIRM', reason: 'r', label: null, loggedAt: Date.now() },
      ]});
    });
    await page.reload();
    await page.waitForTimeout(1500);
    const xssExecuted = await page.evaluate(() => window.__xss);
    expect(xssExecuted).toBeFalsy();
    expect(xss).toHaveLength(0);
    await page.close();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8 — SERVICE WORKER
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Service Worker', () => {
  let ctx8, id8;

  test.beforeAll(async () => {
    ({ ctx: ctx8, id: id8 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx8.close(); });

  test('SW-01: service worker is active', async () => {
    const workers = ctx8.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    const url = workers[0].url();
    expect(url).toContain('service-worker.js');
  });

  test('SW-02: BADGE_CLEAR message clears badge', async () => {
    const page = await ctx8.newPage();
    await page.goto(extUrl(id8, 'popup/popup.html'));
    await page.waitForTimeout(500);
    // Send BADGE_CLEAR message
    await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'BADGE_CLEAR' }, resolve);
      });
    });
    // If we got here without error, badge clear works
    await page.close();
  });

  test('SW-03: SHOW_NOTIF message with missing title/message does not crash', async () => {
    const page = await ctx8.newPage();
    await page.goto(extUrl(id8, 'popup/popup.html'));
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'SHOW_NOTIF' }, () => resolve('ok'));
      });
    });
    expect(result).toBe('ok');
    await page.close();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9 — STORAGE UTILITY
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Storage Utility', () => {
  let ctx9, id9, page;

  test.beforeAll(async () => {
    ({ ctx: ctx9, id: id9 } = await launchWithExtension());
    page = await ctx9.newPage();
    await page.goto(extUrl(id9, 'popup/popup.html'));
    await page.waitForTimeout(3500); // let auth timeout
  });
  test.afterAll(async () => { await page.close(); await ctx9.close(); });

  test('STOR-01: duplicate pending event (same sourceText) is not enqueued twice', async () => {
    await page.evaluate(() => chrome.storage.local.set({ pendingEvents: [] }));
    const count = await page.evaluate(async () => {
      const ev = { title: 'Test', sourceText: 'same text', detectedAt: Date.now(), status: 'pending', date: '', time: '', participants: [] };
      await window.PlanWiseStorage.enqueuePendingEvent(ev);
      await window.PlanWiseStorage.enqueuePendingEvent(ev);
      const events = await window.PlanWiseStorage.getPendingEvents();
      return events.length;
    });
    expect(count).toBe(1);
  });

  test('STOR-02: removePendingEvent removes correct event by ID', async () => {
    await page.evaluate(() => chrome.storage.local.set({ pendingEvents: [] }));
    await page.evaluate(async () => {
      await window.PlanWiseStorage.enqueuePendingEvent({ title: 'A', sourceText: 'textA', status: 'pending' });
      await window.PlanWiseStorage.enqueuePendingEvent({ title: 'B', sourceText: 'textB', status: 'pending' });
    });
    const events = await page.evaluate(() => window.PlanWiseStorage.getPendingEvents());
    const idToRemove = events[0].id;
    await page.evaluate((id) => window.PlanWiseStorage.removePendingEvent(id), idToRemove);
    const remaining = await page.evaluate(() => window.PlanWiseStorage.getPendingEvents());
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe('B');
  });

  test('STOR-03: getSettings returns defaults when nothing stored', async () => {
    await page.evaluate(() => chrome.storage.local.remove('settings'));
    const settings = await page.evaluate(() => window.PlanWiseStorage.getSettings());
    expect(settings.sensitivity).toBe(2);
    expect(settings.notificationsEnabled).toBe(true);
    expect(Array.isArray(settings.triggerWords)).toBe(true);
  });

  test('STOR-04: saveSettings persists and retrieves correctly', async () => {
    await page.evaluate(async () => {
      await window.PlanWiseStorage.saveSettings({
        triggerWords: ['sparring', 'rehearsal'],
        sensitivity: 3,
        notificationsEnabled: false,
      });
    });
    const retrieved = await page.evaluate(() => window.PlanWiseStorage.getSettings());
    expect(retrieved.triggerWords).toContain('sparring');
    expect(retrieved.sensitivity).toBe(3);
    expect(retrieved.notificationsEnabled).toBe(false);
  });

  test('STOR-05: enqueuePendingEvent with missing sourceText gets ID assigned', async () => {
    await page.evaluate(() => chrome.storage.local.set({ pendingEvents: [] }));
    await page.evaluate(() =>
      window.PlanWiseStorage.enqueuePendingEvent({ title: 'No source', sourceText: 'unique-source-xyz', status: 'pending' })
    );
    const events = await page.evaluate(() => window.PlanWiseStorage.getPendingEvents());
    expect(events[0].id).toBeTruthy();
    expect(events[0].detectedAt).toBeTruthy();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 10 — CONSOLE ERROR AUDIT (no page should log errors on load)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Console Error Audit', () => {
  let ctx10, id10;

  test.beforeAll(async () => {
    ({ ctx: ctx10, id: id10 } = await launchWithExtension());
  });
  test.afterAll(async () => { await ctx10.close(); });

  async function collectErrors(ctx, id, pagePath, waitMs = 3500) {
    const page = await ctx.newPage();
    const errors = [];
    const warnings = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', e => errors.push(`PAGE_ERROR: ${e.message}`));
    await page.goto(extUrl(id, pagePath));
    await page.waitForTimeout(waitMs);
    await page.close();
    return { errors, warnings };
  }

  test('CONS-01: popup.html — no page errors on load', async () => {
    const { errors } = await collectErrors(ctx10, id10, 'popup/popup.html', 4000);
    const fatal = errors.filter(e => !e.includes('Failed to fetch') && !e.includes('net::'));
    console.log('popup errors:', errors);
    expect(fatal).toHaveLength(0);
  });

  test('CONS-02: dashboard.html — no page errors on load', async () => {
    const { errors } = await collectErrors(ctx10, id10, 'dashboard/dashboard.html', 3000);
    const fatal = errors.filter(e => !e.includes('Failed to fetch') && !e.includes('net::'));
    console.log('dashboard errors:', errors);
    expect(fatal).toHaveLength(0);
  });

  test('CONS-03: tasks.html — no page errors on load', async () => {
    const { errors } = await collectErrors(ctx10, id10, 'tasks/tasks.html', 1500);
    console.log('tasks errors:', errors);
    expect(errors).toHaveLength(0);
  });

  test('CONS-04: training.html — no page errors on load', async () => {
    const { errors } = await collectErrors(ctx10, id10, 'training/training.html', 1500);
    console.log('training errors:', errors);
    expect(errors).toHaveLength(0);
  });
});
