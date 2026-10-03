// Runs the actual ONNX inference for PlanWise's ML classification/
// extraction strategies. Lives in a chrome.offscreen document (not the
// background service worker) because MV3 service workers suspend after
// ~30s idle, which would force a multi-second model reload on every
// burst of typing - an offscreen document stays warm for as long as the
// extension needs it instead.
//
// Imports from the esbuild-produced bundle (see build.js), not the raw
// package file - transformers.web.min.js has two bare-specifier imports
// that don't resolve in a plain browser module and can't be fixed via
// an import map inside an MV3 extension page (verified empirically, not
// assumed - see build.js's comment for what was actually tried and why
// each attempt failed). wasmPaths below must be an ABSOLUTE URL - the
// ort-wasm-simd-threaded*.mjs loaders resolve their sibling .wasm binary
// against the PAGE's URL, not the importing script's, so a relative
// path resolves against the wrong directory depending on which file in
// the chain is doing the resolving.
import { pipeline, env } from "../vendor/transformers/transformers-bundle.js";

env.allowRemoteModels = true; // model WEIGHTS lazy-download from the Hub - that's data, not code, fine under the Chrome Web Store's remote-code policy
env.backends.onnx.wasm.wasmPaths = new URL("../vendor/transformers/", import.meta.url).href;

let classifierPromise = null;
function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = pipeline(
      "zero-shot-classification",
      "MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33",
      { device: "wasm" }
    );
  }
  return classifierPromise;
}

// Serializes every inference call through one chain so concurrent
// requests (e.g. WhatsApp + Telegram + Gmail tabs open at once) never
// call the same ONNX session concurrently.
let chain = Promise.resolve();
function enqueue(fn) {
  const result = chain.then(fn);
  chain = result.catch(() => {}); // a rejected call must not wedge the queue for later calls
  return result;
}

async function handleClassify({ text, labels }) {
  const classify = await getClassifier();
  const result = await classify(text, labels);
  return { label: result.labels[0], scores: result.scores, labels: result.labels };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OFFSCREEN_ML_PING") {
    sendResponse({ ready: classifierPromise !== null });
    return;
  }

  if (message.type === "OFFSCREEN_ML_CLASSIFY") {
    enqueue(() => handleClassify(message))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});
