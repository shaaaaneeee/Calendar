/**
 * Redo just the two screenshots that came out wrong the first time:
 *  1. Popup — had dead white space below the content (fixed viewport height
 *     taller than the actual popup, now uses fullPage instead).
 *  2. Settings — words were typed before wireControls() had attached its
 *     keydown listeners, so they never actually got added (still race-prone
 *     without a proper ready signal — now waits for #account-email to be
 *     populated, which is the last thing init() does).
 *
 * Leaves the good 3-dashboard/4-groups-rsvp/5-tasks-kanban screenshots alone.
 * Cleans up everything it adds (pendingEvents locally, and the 3 detection
 * words both locally and in the synced Supabase settings row).
 *
 * Usage: node scripts/recapture-popup-and-settings.js
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '../extension');
const OUT_DIR = path.resolve(__dirname, '../docs/store-assets/screenshots');

function extUrl(id, page) {
  return `chrome-extension://${id}/${page}`;
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
  console.log('\n>>> Sign in with the same clean test account as last time.\n');
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
  await popup.setViewportSize({ width: 400, height: 700 });
  await popup.goto(extUrl(id, 'popup/popup.html'));
  await popup.waitForSelector('#auth-screen:not(.hidden), #loading.hidden', { timeout: 15000 }).catch(() => {});
  await waitForLogin(popup);
  console.log('Signed in.');

  try {
    // ── 1. Popup — detected plan card ──
    await popup.evaluate(async () => {
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
    });
    await popup.reload();
    await popup.waitForSelector('#event-card:not(.hidden)', { timeout: 10000 });
    const popupRawPath = path.join(OUT_DIR, '_popup-raw.png');
    // Element screenshot, not page/fullPage — #app doesn't actually stretch
    // to the forced viewport height, but the page's <body> apparently does
    // (still leaves dead space either way), so crop to the real content box.
    await popup.locator('#app').screenshot({ path: popupRawPath });

    // Composite onto the same branded 1280x800 canvas as before.
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
        .popup-frame img { display:block; width:400px; }
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
          <div class="popup-frame"><img src="${popupDataUri}" /></div>
          <div class="caption">PlanWise detects the plan — you confirm it</div>
        </div>
      </body></html>
    `);
    await composite.waitForTimeout(200);
    await composite.screenshot({ path: path.join(OUT_DIR, '1-popup-detected-plan.png') });
    fs.unlinkSync(popupRawPath);
    console.log('Popup screenshot done.');

    // ── 2. Settings — Detection tab ──
    const settings = await ctx.newPage();
    await settings.setViewportSize({ width: 1280, height: 800 });
    await settings.goto(extUrl(id, 'settings/settings.html'));
    // #account-email is the last thing init() populates, after wireControls()
    // has attached the Enter-key listeners — waiting for it avoids the race
    // that silently dropped every typed word last time.
    // #account-email starts as a literal "—" placeholder in the static HTML
    // (non-empty!) and only gets the real address once init() finishes, so
    // a plain non-empty check resolves instantly and doesn't actually wait
    // for wireControls() at all. Require it to differ from the placeholder.
    await settings.waitForFunction(
      () => {
        const t = document.getElementById('account-email')?.textContent?.trim();
        return t && t !== '—';
      },
      { timeout: 15000 }
    );
    await settings.fill('#trigger-word-input', 'rehearsal');
    await settings.press('#trigger-word-input', 'Enter');
    await settings.fill('#activity-word-input', 'climbing');
    await settings.press('#activity-word-input', 'Enter');
    await settings.fill('#place-word-input', 'the boulder gym');
    await settings.press('#place-word-input', 'Enter');
    await settings.waitForSelector('#trigger-word-input', { timeout: 5000 });
    // Confirm the words actually landed before trusting the screenshot.
    const added = await settings.evaluate(() => ({
      trigger: settings.triggerWords,
      activity: settings.activityWords,
      place: settings.placeWords,
    }));
    console.log('Words added:', added);
    // The page itself doesn't scroll — #main (not window/body) is the
    // overflow-y-auto container, and it had drifted down as each input got
    // focused in turn, cropping both the top and bottom sections out of
    // the shot.
    await settings.evaluate(() => { document.getElementById('main').scrollTop = 0; });
    await settings.waitForTimeout(400);
    await settings.screenshot({ path: path.join(OUT_DIR, '2-settings-detection.png') });
    console.log('Settings screenshot done.');

    // ── Cleanup: remove the 3 words locally + push the clean state to Supabase ──
    await settings.evaluate(async () => {
      settings.triggerWords  = settings.triggerWords.filter(w => w !== 'rehearsal');
      settings.activityWords = settings.activityWords.filter(w => w !== 'climbing');
      settings.placeWords    = settings.placeWords.filter(w => w !== 'the boulder gym');
      window.PlanWiseStorage.saveSettings(settings);
      await syncToCloud();
    });
    console.log('Detection words cleaned up (local + cloud).');
  } finally {
    await popup.evaluate(async () => {
      await chrome.storage.local.set({ pendingEvents: [] });
    }).catch(() => {});
  }

  console.log('\nDone. Re-check', OUT_DIR);
  await ctx.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
