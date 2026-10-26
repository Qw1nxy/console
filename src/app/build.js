#!/usr/bin/env node
/* build.js — assembles console.html (artifact fragment) and console_standalone.html (full document)
   from console_src.html + engines.js (or engines_stub.js) + /home/claude/content/*.json + SEED_SCENARIOS.json. */
const fs = require("fs");
const path = require("path");

const APP = __dirname;
const CONTENT = path.resolve(APP, "..", "content");
const SRC = path.join(APP, "console_src.html");
const OUT_FRAGMENT = path.join(APP, "console.html");
const OUT_STANDALONE = path.join(APP, "console_standalone.html");

function readJSON(file, fallback, label) {
  try {
    if (!fs.existsSync(file)) { console.warn("[build] missing " + label + " (" + file + ") — using empty"); return fallback; }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { console.warn("[build] could not parse " + label + ": " + e.message + " — using empty"); return fallback; }
}

let src = fs.readFileSync(SRC, "utf8");
if (!src.includes("/*__ENGINES__*/")) throw new Error("console_src.html lacks the /*__ENGINES__*/ marker");
if (!src.includes("__SEED__")) throw new Error("console_src.html lacks the __SEED__ marker");

// engines
let enginesPath = path.join(APP, "engines.js");
let usingStub = false;
if (!fs.existsSync(enginesPath)) { enginesPath = path.join(APP, "engines_stub.js"); usingStub = true; console.warn("[build] engines.js not found — inlining engines_stub.js (empty analyses)"); }
let engines = fs.readFileSync(enginesPath, "utf8");
engines = engines.replace(/<\/script/gi, "<\\/script");

// seed
const deDrills = readJSON(path.join(CONTENT, "de_drills.json"), [], "de_drills.json");
const huDrills = readJSON(path.join(CONTENT, "hu_drills.json"), [], "hu_drills.json");
const deDecon = readJSON(path.join(CONTENT, "de_decon.json"), [], "de_decon.json");
const huDecon = readJSON(path.join(CONTENT, "hu_decon.json"), [], "hu_decon.json");
const huLex = readJSON(path.join(CONTENT, "hu_lexicon.json"), [], "hu_lexicon.json");
const deLex = readJSON(path.join(CONTENT, "de_lexicon.json"), { nouns: [], parts: [], adjectives: [], verbs: [] }, "de_lexicon.json");
const scenarios = readJSON(path.join(APP, "SEED_SCENARIOS.json"), [], "SEED_SCENARIOS.json");

const arr = x => (Array.isArray(x) ? x : (x && Array.isArray(x.items) ? x.items : []));
const seed = {
  drills: [...arr(deDrills), ...arr(huDrills)],
  decon: [...arr(deDecon), ...arr(huDecon)],
  lexicon: {
    hu: arr(huLex),
    de: { nouns: arr(deLex.nouns), parts: arr(deLex.parts), adjectives: arr(deLex.adjectives), verbs: arr(deLex.verbs) }
  },
  scenarios: arr(scenarios),
  manual: arr(readJSON(path.join(__dirname, "..", "pwa", "manual.json"), [], "manual"))
};
let seedJSON = JSON.stringify(seed).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

let out = src.replace("/*__ENGINES__*/", () => engines).replace("__SEED__", () => seedJSON);
fs.writeFileSync(OUT_FRAGMENT, out);

const standalone = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + out + "</body></html>";
fs.writeFileSync(OUT_STANDALONE, standalone);

// PWA build: the same page with manifest, icons, iOS meta and a service-worker registration, written to ../pwa/dist/.
const PWA_DIR = path.join(__dirname, "..", "pwa", "dist");
fs.mkdirSync(PWA_DIR, { recursive: true });
const buildStamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const buildId = Date.now().toString(36);
const pwaHead = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<meta name="theme-color" content="#0e1216" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#f4f6f8" media="(prefers-color-scheme: light)">' +
  '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Console">' +
  '<meta name="description" content="German and Hungarian training console: timed reflex drills, case and suffix deconstructor, daily plan, burn book, field manual.">' +
  '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png" type="image/png"><link rel="apple-touch-icon" href="apple-touch-icon.png">' +
  '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const swReg = '<script>window.OLC_BUILD="' + buildId + '";if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").then(function(r){r.addEventListener("updatefound",function(){var w=r.installing;w&&w.addEventListener("statechange",function(){if(w.state==="installed"&&navigator.serviceWorker.controller){var t=document.getElementById("toast");if(t){t.textContent="Update ready: close and reopen the app.";t.hidden=false;}}});});}).catch(function(){});});}</script>';
fs.writeFileSync(path.join(PWA_DIR, "index.html"), pwaHead + out.replace("</script>\n", "</script>\n") + swReg + "</body></html>");
fs.writeFileSync(path.join(PWA_DIR, "manifest.webmanifest"), JSON.stringify({
  name: "Operative's Linguistic Console", short_name: "Console", description: "German and Hungarian training console",
  start_url: "./", scope: "./", display: "standalone", orientation: "any", background_color: "#0e1216", theme_color: "#0e1216",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }]
}, null, 2));
const SW = `/* Offline cache for the Console. Cache-first for the app shell; the shell updates in the background when online. */
const CACHE = "olc-${buildId}";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const fetched = fetch(e.request).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; }).catch(() => hit);
    return hit || fetched;
  }));
});
`;
fs.writeFileSync(path.join(PWA_DIR, "sw.js"), SW);
fs.writeFileSync(path.join(PWA_DIR, ".nojekyll"), "");
fs.writeFileSync(path.join(PWA_DIR, "404.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./"><title>Console</title>');
console.log("[build] wrote PWA to " + PWA_DIR + " (build " + buildId + ", " + buildStamp + ")");

console.log("[build] engines: " + (usingStub ? "STUB" : "engines.js") + " | drills de/hu " + arr(deDrills).length + "/" + arr(huDrills).length + " | decon de/hu " + arr(deDecon).length + "/" + arr(huDecon).length + " | lexicon hu " + arr(huLex).length + ", de nouns " + arr(deLex.nouns).length + " | scenarios " + arr(scenarios).length);
console.log("[build] wrote " + OUT_FRAGMENT + " (" + fs.statSync(OUT_FRAGMENT).size + " bytes) and " + OUT_STANDALONE + " (" + fs.statSync(OUT_STANDALONE).size + " bytes)");
