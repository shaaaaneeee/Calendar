/**
 * Crops/scales the chosen promo concept image down to the Chrome Web
 * Store's exact 440x280 spec, flattening to a fully opaque PNG (the Store
 * rejects transparency).
 *
 * Usage: node scripts/finalize-promo-tile.js <path-to-source-image>
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SRC = process.argv[2];
if (!SRC) {
  console.error('Usage: node scripts/finalize-promo-tile.js <path-to-source-image>');
  process.exit(1);
}

const OUT_PATH = path.resolve(__dirname, '../docs/store-assets/promo-tile-440x280.png');

async function main() {
  const srcBuf = fs.readFileSync(path.resolve(SRC));
  const ext = path.extname(SRC).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  const dataUri = `data:${mime};base64,${srcBuf.toString('base64')}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await page.setContent(`
    <!doctype html><html><head><style>
      * { margin:0; padding:0; }
      html, body { width:440px; height:280px; overflow:hidden; background:#f9f9f9; }
      img { width:440px; height:280px; object-fit:cover; object-position:center; display:block; }
    </style></head>
    <body><img src="${dataUri}" /></body></html>
  `);
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT_PATH });
  await browser.close();
  console.log('Final promo tile saved to', OUT_PATH);
}

main().catch((err) => { console.error(err); process.exit(1); });
