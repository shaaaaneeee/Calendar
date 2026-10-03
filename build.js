// build.js
const fs      = require('fs');
const path    = require('path');
const esbuild = require('esbuild');

const src  = path.join(
  __dirname,
  'node_modules/@supabase/supabase-js/dist/umd/supabase.js'
);
const dest = path.join(__dirname, 'extension/vendor/supabase.js');

fs.mkdirSync(path.join(__dirname, 'extension/vendor'), { recursive: true });
fs.copyFileSync(src, dest);
console.log('✓ Supabase bundled to extension/vendor/supabase.js');

// Transformers.js runtime for the offscreen document. Only the pieces
// actually exercised by a real browser load are vendored - not the
// whole onnxruntime-web dist (hundreds of MB across unused WebGL/WebGPU
// bundles and every WASM threading variant).
//
// transformers.web.min.js imports two bare specifiers ("onnxruntime-web/
// webgpu", "onnxruntime-common") that only resolve via Node-style module
// resolution - they do NOT resolve in a plain browser <script type=
// module>. An inline <script type="importmap"> is blocked by MV3's CSP
// (script-src 'self' has no 'unsafe-inline', confirmed by hitting this
// exact CSP violation in a real loaded extension - works fine on a bare
// http page with no CSP at all, which is why this looked fine at first).
// An external import map (<script type="importmap" src="...">) silently
// isn't supported either - no fetch was ever attempted for it. esbuild
// resolves both bare specifiers at build time instead, producing one
// file with no unresolved specifiers left for the browser to choke on.
const transformersVendorDir = path.join(__dirname, 'extension/vendor/transformers');
fs.mkdirSync(transformersVendorDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'node_modules/@huggingface/transformers/dist/transformers.web.min.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outfile: path.join(transformersVendorDir, 'transformers-bundle.js'),
});

// The WASM binary itself is NOT a static import - it's fetched at
// runtime via a URL built from env.backends.onnx.wasm.wasmPaths, so
// esbuild has nothing to resolve here; these are plain copies.
const wasmFiles = [
  // The single WASM variant actually requested by a real Chrome load
  // this session (confirmed by watching live network requests, not
  // guessed) - onnxruntime-web picks this one in environments without
  // cross-origin-isolation/SharedArrayBuffer. If Chrome ever requests a
  // different variant, add its .mjs+.wasm pair here the same way.
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.wasm'],
];
for (const [from, name] of wasmFiles) {
  fs.copyFileSync(path.join(__dirname, from), path.join(transformersVendorDir, name));
}
console.log('✓ Transformers.js runtime bundled to extension/vendor/transformers/');