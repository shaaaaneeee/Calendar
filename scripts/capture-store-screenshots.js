/**
 * Chrome Web Store screenshot capture for PlanWise.
 *
 * Launches the unpacked extension in a real Chrome window, waits for you to
 * sign in once, seeds a few realistic sample events/tasks/group through the
 * in-page Supabase client, captures the 5 store screenshots, then deletes
 * everything it created so your account is left exactly as it was.
 *
 * Usage: node scripts/capture-store-screenshots.js
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '../extension');
const OUT_DIR = path.resolve(__dirname, '../docs/store-assets/screenshots');

function extUrl(id, page) {
  return `chrome-extension://${id}/${page}`;
}

// Local-date string, matching dashboard.js's toDateString() (never UTC).
function fmtDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function launchWithExtension() {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  });
  let [background] = ctx.serviceWorkers();
  if (!background) background = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = background.url().split('/')[2];
  return { ctx, id };
}

async function waitForLogin(page) {
  console.log('\n>>> A Chrome window is open with PlanWise loaded.');
  console.log('>>> Sign in with your real account in the popup — this script continues automatically once you do.\n');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const session = await page.evaluate(() =>
      chrome.storage.local.get('planwise_session').then(r => r.planwise_session || null)
    );
    if (session) return session;
    await page.waitForTimeout(1500);
  }
  throw new Error('Timed out waiting for sign-in (10 min).');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { ctx, id } = await launchWithExtension();

  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 400, height: 640 });
  await popup.goto(extUrl(id, 'popup/popup.html'));
  await popup.waitForSelector('#auth-screen:not(.hidden), #loading.hidden', { timeout: 15000 }).catch(() => {});

  await waitForLogin(popup);
  console.log('Signed in. Seeding sample data...');

  // Dashboard page loads the full SupabaseClient (groups/events/social).
  const seed = await ctx.newPage();
  await seed.goto(extUrl(id, 'dashboard/dashboard.html'));
  await seed.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.db, { timeout: 15000 });

  const today = new Date();
  const inTwoDays = new Date(today); inTwoDays.setDate(inTwoDays.getDate() + 2);
  const inFiveDays = new Date(today); inFiveDays.setDate(inFiveDays.getDate() + 5);
  const threeDaysAgo = new Date(today); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const seeded = await seed.evaluate(async ({ todayStr, d2, d5, dm3 }) => {
    const { groups, events, social } = window.SupabaseClient;

    const group = await groups.createGroup('Weekend Crew', '#FF4D00');

    const trivia = await events.save({
      title: 'Trivia Night', date: todayStr, time: '19:00',
      location: 'The Fox', participants: ['Jordan', 'Priya'],
      notes: 'Team name: Quiztopher Nolan', sourceText: 'trivia night at the fox tonight at 7?',
    });
    const run = await events.save({
      title: 'Morning Run', date: dm3, time: '07:00',
      location: 'Riverside Park', participants: ['Alex'],
    });
    const dentist = await events.save({
      title: 'Dentist Appointment', date: d2, time: '10:30', location: 'Smile Clinic',
    });
    const dinner = await events.save({
      title: 'Dinner with Sam', date: d5, time: '20:00',
      location: 'Nomad Bistro', participants: ['Sam'],
    });

    await social.shareEvent(trivia.id, [group.id]);
    await social.upsertRsvp(trivia.id, 'going');

    return { groupId: group.id, eventIds: [trivia.id, run.id, dentist.id, dinner.id] };
  }, {
    todayStr: fmtDate(today),
    d2: fmtDate(inTwoDays),
    d5: fmtDate(inFiveDays),
    dm3: fmtDate(threeDaysAgo),
  });

  // Local-only data: pending detection (popup) + kanban tasks.
  await seed.evaluate(async () => {
    await chrome.storage.local.set({
      pendingEvents: [{
        id: crypto.randomUUID(),
        sourceText: "hey are we still good for coffee tmrw 10am near the office?",
        title: 'Coffee catch-up',
        date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        time: '10:00',
        location: 'the office',
        participants: ['Jamie'],
        notes: '',
        detectedAt: Date.now(),
        status: 'pending',
      }],
    });

    await chrome.storage.local.set({
      planwiseTasks: [
        { id: crypto.randomUUID(), column: 'todo', title: 'Book venue for trivia night', date: null, priority: 'high' },
        { id: crypto.randomUUID(), column: 'todo', title: 'Send group invites', date: null, priority: 'medium' },
        { id: crypto.randomUUID(), column: 'inprogress', title: 'Confirm catering', date: null, priority: null },
        { id: crypto.randomUUID(), column: 'inprogress', title: 'Pick playlist', date: null, priority: 'low' },
        { id: crypto.randomUUID(), column: 'done', title: 'Pick a date', date: null, priority: null },
      ],
    });
  });

  console.log('Seed data created:', seeded);

  // Everything from here on is best-effort screenshot capture — whatever
  // happens, the finally block below must still remove the seeded data.
  let settingsPage;
  try {
  // ── 1. Popup — detected plan card (captured raw, composited below) ──
  await popup.reload();
  await popup.waitForSelector('#event-card:not(.hidden)', { timeout: 10000 });
  const popupRawPath = path.join(OUT_DIR, '_popup-raw.png');
  // Element screenshot, not page/fullPage — the popup's actual content is
  // shorter than the viewport we opened it at, and neither a plain nor a
  // fullPage screenshot crops to it, leaving dead white space below the
  // footer. Cropping to #app gets the real content box.
  await popup.locator('#app').screenshot({ path: popupRawPath });

  // ── 2. Settings — Detection tab ──
  settingsPage = await ctx.newPage();
  await settingsPage.setViewportSize({ width: 1280, height: 800 });
  await settingsPage.goto(extUrl(id, 'settings/settings.html'));
  // #section-detection already has class="active" in the static HTML, so
  // waiting on it resolves immediately — before settings.js's async init()
  // has run wireControls() and attached the Enter-key listeners. Wait for
  // #account-email instead: it's the last thing init() populates, so its
  // presence guarantees the listeners are live. It starts as a literal "—"
  // placeholder (non-empty!), so require it to differ from that too.
  await settingsPage.waitForFunction(
    () => {
      const t = document.getElementById('account-email')?.textContent?.trim();
      return t && t !== '—';
    },
    { timeout: 15000 }
  );
  await settingsPage.fill('#trigger-word-input', 'rehearsal');
  await settingsPage.press('#trigger-word-input', 'Enter');
  await settingsPage.fill('#activity-word-input', 'climbing');
  await settingsPage.press('#activity-word-input', 'Enter');
  await settingsPage.fill('#place-word-input', 'the boulder gym');
  await settingsPage.press('#place-word-input', 'Enter');
  // #main (not window/body) is the overflow-y-auto container, and it drifts
  // down as each input gets focused in turn — reset it or the shot crops
  // out both the page header and the lower sections.
  await settingsPage.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await settingsPage.waitForTimeout(500);
  await settingsPage.screenshot({ path: path.join(OUT_DIR, '2-settings-detection.png') });

  // ── 3. Dashboard — month view ──
  const dash = await ctx.newPage();
  await dash.setViewportSize({ width: 1280, height: 800 });
  await dash.goto(extUrl(id, 'dashboard/dashboard.html'));
  await dash.waitForSelector('.month-cell', { timeout: 10000 });
  await dash.waitForTimeout(500);
  await dash.screenshot({ path: path.join(OUT_DIR, '3-dashboard-month-view.png') });

  // ── 4. Dashboard — RSVP panel on the shared event ──
  // Click the day-number, not the cell itself — event pills inside the cell
  // call stopPropagation() on click, so a blind cell click can silently hit
  // a pill and open the edit modal instead of the day panel when the day
  // already has other events on it.
  await dash.click('.month-cell.today .day-number');
  await dash.waitForSelector('.day-event-card', { timeout: 10000 });
  await dash.click('.day-event-card:has-text("Trivia Night") button:has-text("RSVP")');
  await dash.waitForSelector('.member-list .member-row', { timeout: 10000 });
  await dash.waitForTimeout(300);
  await dash.screenshot({ path: path.join(OUT_DIR, '4-groups-rsvp.png') });

  // ── 5. Tasks — kanban board ──
  const tasks = await ctx.newPage();
  await tasks.setViewportSize({ width: 1280, height: 800 });
  await tasks.goto(extUrl(id, 'tasks/tasks.html'));
  await tasks.waitForSelector('.task-card', { timeout: 10000 });
  await tasks.waitForTimeout(300);
  await tasks.screenshot({ path: path.join(OUT_DIR, '5-tasks-kanban.png') });

  // ── Composite the popup screenshot onto a branded 1280x800 canvas ──
  const popupBuf = fs.readFileSync(popupRawPath);
  const popupDataUri = `data:image/png;base64,${popupBuf.toString('base64')}`;

  const composite = await ctx.newPage();
  await composite.setViewportSize({ width: 1280, height: 800 });
  await composite.setContent(`
    <!doctype html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        width:1280px; height:800px; overflow:hidden;
        background:
          radial-gradient(ellipse 900px 600px at 50% 38%, rgba(255,77,0,0.16), transparent 60%),
          #0b0b0c;
        display:flex; align-items:center; justify-content:center;
        font-family:-apple-system,Segoe UI,sans-serif;
      }
      .stage { display:flex; flex-direction:column; align-items:center; }
      .browser-chrome {
        width:420px; background:#1c1c1e; border-radius:12px 12px 0 0;
        padding:10px 14px; display:flex; align-items:center; gap:8px;
        box-shadow: 0 40px 90px -20px rgba(0,0,0,0.7);
      }
      .dot { width:9px; height:9px; border-radius:50%; }
      .addr {
        flex:1; margin-left:8px; background:#2c2c2e; border-radius:6px;
        padding:6px 10px; color:#8e8e93; font-size:11px; font-family:monospace;
      }
      .ext-icon {
        width:22px; height:22px; border-radius:6px; background:#FF4D00;
        display:flex; align-items:center; justify-content:center;
        color:#fff; font-weight:900; font-size:11px; font-family:monospace;
      }
      .popup-frame {
        box-shadow: 0 40px 90px -15px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06);
        border-radius: 0 0 10px 10px;
        overflow:hidden;
      }
      .caption {
        margin-top:34px; color:#f2f2f2; font-family:monospace;
        font-size:13px; letter-spacing:0.14em; text-transform:uppercase;
        text-align:center; opacity:0.55;
      }
    </style></head>
    <body>
      <div class="stage">
        <div class="browser-chrome">
          <span class="dot" style="background:#ff5f57"></span>
          <span class="dot" style="background:#febc2e"></span>
          <span class="dot" style="background:#28c840"></span>
          <div class="addr">web.whatsapp.com</div>
          <div class="ext-icon">P</div>
        </div>
        <div class="popup-frame"><img src="${popupDataUri}" width="400" /></div>
        <div class="caption">PlanWise detects the plan — you confirm it</div>
      </div>
    </body></html>
  `);
  await composite.waitForTimeout(200);
  await composite.screenshot({ path: path.join(OUT_DIR, '1-popup-detected-plan.png') });
  fs.unlinkSync(popupRawPath);

  console.log('\nScreenshots saved to', OUT_DIR);
  } finally {
    // ── Cleanup: remove everything seeded, however the capture went ──
    console.log('Cleaning up seeded data...');
    const cleanupErrors = await seed.evaluate(async ({ groupId, eventIds }) => {
      const { db, events } = window.SupabaseClient;
      const errors = [];
      try { const { error } = await db.from('rsvps').delete().in('event_id', eventIds); if (error) errors.push(error.message); } catch (e) { errors.push(e.message); }
      try { const { error } = await db.from('shared_events').delete().in('event_id', eventIds); if (error) errors.push(error.message); } catch (e) { errors.push(e.message); }
      for (const id of eventIds) { try { await events.delete(id); } catch (e) { errors.push(e.message); } }
      try { const { error } = await db.from('group_members').delete().eq('group_id', groupId); if (error) errors.push(error.message); } catch (e) { errors.push(e.message); }
      try { const { error } = await db.from('groups').delete().eq('id', groupId); if (error) errors.push(error.message); } catch (e) { errors.push(e.message); }
      return errors;
    }, seeded);

    await seed.evaluate(async () => {
      await chrome.storage.local.set({ pendingEvents: [], planwiseTasks: [] });
    });

    if (settingsPage) {
      await settingsPage.evaluate(async () => {
        settings.triggerWords  = settings.triggerWords.filter(w => w !== 'rehearsal');
        settings.activityWords = settings.activityWords.filter(w => w !== 'climbing');
        settings.placeWords    = settings.placeWords.filter(w => w !== 'the boulder gym');
        window.PlanWiseStorage.saveSettings(settings);
        await syncToCloud();
      }).catch(() => {});
    }

    if (cleanupErrors.length) {
      console.warn('Cleanup had errors (you may want to check Supabase manually):', cleanupErrors);
    } else {
      console.log('Cleanup done — account restored to its original state.');
    }
  }

  await ctx.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
