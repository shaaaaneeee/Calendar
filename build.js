// build.js
const fs   = require('fs');
const path = require('path');

const src  = path.join(
  __dirname,
  'node_modules/@supabase/supabase-js/dist/umd/supabase.js'
);
const dest = path.join(__dirname, 'extension/vendor/supabase.js');

fs.mkdirSync(path.join(__dirname, 'extension/vendor'), { recursive: true });
fs.copyFileSync(src, dest);
console.log('✓ Supabase bundled to extension/vendor/supabase.js');