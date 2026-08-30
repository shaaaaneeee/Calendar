/**
 * Generates the 440x280 Chrome Web Store promo tile. Pure static HTML/CSS —
 * no live app data, no sign-in needed — rendered and screenshotted at exact
 * spec size with Playwright.
 *
 * Usage: node scripts/generate-promo-tile.js
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/store-assets');
const OUT_PATH = path.join(OUT_DIR, 'promo-tile-440x280.png');

const HTML = `
<!doctype html><html><head><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    width:440px; height:280px; overflow:hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body {
    position:relative;
    background:
      radial-gradient(620px 460px at 96% 6%, rgba(255,77,0,0.24), transparent 62%),
      #0b0b0c;
  }
  .watermark {
    position:absolute; top:-46px; right:-54px;
    width:340px; height:340px;
    transform: rotate(8deg);
    opacity:0.85;
  }
  .tick {
    position:absolute; width:9px; height:9px;
    border-color:rgba(255,255,255,0.22); border-style:solid; border-width:0;
  }
  .tick.tl { top:14px; left:14px; border-top-width:1px; border-left-width:1px; }
  .tick.tr { top:14px; right:14px; border-top-width:1px; border-right-width:1px; }
  .tick.bl { bottom:14px; left:14px; border-bottom-width:1px; border-left-width:1px; }
  .tick.br { bottom:14px; right:14px; border-bottom-width:1px; border-right-width:1px; }
  .content {
    position:relative; height:100%;
    display:flex; flex-direction:column; justify-content:space-between;
    padding:32px 34px 26px;
  }
  .wordmark-label {
    font-family:"Courier New",monospace;
    font-size:10px; font-weight:700; letter-spacing:0.34em; text-transform:uppercase;
    color:#8a8a8e; margin-bottom:3px;
  }
  .wordmark {
    font-size:48px; font-weight:900; letter-spacing:-0.03em; line-height:0.9;
    color:#f5f5f4;
  }
  .wordmark .accent { color:#FF4D00; }
  .sub {
    margin-top:12px; max-width:230px;
    font-size:13px; line-height:1.45; font-weight:500;
    color:#b9b9bd;
  }
  .tagline {
    font-family:"Courier New",monospace;
    font-size:10.5px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
    color:#6f6f74;
  }
  .tagline .dot { color:#FF4D00; }
</style></head>
<body>
  <svg class="watermark" viewBox="0 0 100 100" fill="none">
    <rect x="14" y="20" width="72" height="64" rx="6" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2"/>
    <path d="M14 38h72" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2"/>
    <path d="M32 12v16M68 12v16" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2" stroke-linecap="round"/>
    <path d="M36 60l10 10 20-22" stroke="#FF4D00" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>
  <div class="content">
    <div>
      <div class="wordmark-label">Plan</div>
      <div class="wordmark">Wise<span class="accent">.</span></div>
      <div class="sub">Detects plans in the messages you're typing and adds them to your calendar.</div>
    </div>
    <div class="tagline">Never reads anyone else's messages<span class="dot">.</span></div>
  </div>
</body></html>
`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await page.setContent(HTML);
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT_PATH });
  await browser.close();
  console.log('Promo tile saved to', OUT_PATH);
}

main().catch((err) => { console.error(err); process.exit(1); });
