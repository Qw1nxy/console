// Serve dist/ over localhost, check: SW registers, page works offline after first load, manifest valid, no console errors.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const DIST = path.join(__dirname, "dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" }); res.end(fs.readFileSync(f));
});
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
srv.listen(0, async () => {
  const port = srv.address().port; const base = "http://127.0.0.1:" + port + "/";
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 380, height: 800 }, serviceWorkers: "allow" });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(base); await page.waitForTimeout(800);
  const man = await (await ctx.request.get(base + "manifest.webmanifest")).json();
  ok(man.display === "standalone" && man.icons.length === 3 && man.start_url === "./", "manifest valid (standalone, 3 icons)");
  for (const ic of man.icons) { const r = await ctx.request.get(base + ic.src); ok(r.status() === 200, "icon served " + ic.src); }
  const swState = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active ? r.active.state : "none"; });
  ok(swState === "activated", "service worker activated (" + swState + ")");
  await page.waitForTimeout(500);
  const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]); const ks = await c.keys(); return { n: keys.length, items: ks.map(k => new URL(k.url).pathname) }; });
  ok(cached.items.some(x => x.endsWith("/index.html")) && cached.items.some(x => x.endsWith("/manifest.webmanifest")), "shell cached: " + cached.items.join(", "));
  // do a drill grade so there is state, then go offline and reload
  await page.evaluate(() => { OLC.show("drill"); }); await page.click("#drill-start"); await page.waitForTimeout(100); await page.evaluate(() => OLC.beginCues()); for (let g = 0; g < 6 && await page.evaluate(() => { const d = OLC.state.drill; return !!(d && d.queue[d.idx] && d.queue[d.idx]._learn); }); g++) await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await page.keyboard.press("1"); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(500);
  const title = await page.title(); const sessions = await page.evaluate(() => window.OLC ? window.OLC.state.sessions.length : -1);
  ok(title.includes("Console") && sessions === 1, "works offline after reload, state kept (sessions=" + sessions + ")");
  await page.evaluate(() => OLC.show("manual")); await page.waitForTimeout(100);
  ok((await page.textContent("#manual-count")).includes("18"), "manual available offline");
  await ctx.setOffline(false);
  ok(errs.length === 0, "no console errors: " + errs.join(" | "));
  await browser.close(); srv.close();
  console.log(fails ? fails + " FAILED" : "ALL PWA CHECKS PASSED"); process.exit(fails ? 1 : 0);
});
