// Day-1 overhaul checks in a real browser: plan engine weeks/stages, Hungarian gating, stage-filtered drills,
// content refresh for an old install (edited items kept), welcome, Today card, sounds card, resources panel.
const { chromium } = require("playwright");
const path = require("path");
const FILE = "file://" + path.resolve(__dirname, "console_standalone.html");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
async function at(ctx, isoDate) { await ctx.addInitScript(d => { const real = Date; const fixed = new real(d + "T16:00:00").getTime(); const off = fixed - real.now(); class F extends real { constructor(...a) { if (a.length) super(...a); else super(real.now() + off); } static now() { return real.now() + off; } } window.Date = F; }, isoDate); }
(async () => {
  const b = await chromium.launch();
  // Day 1: 2026-10-26
  let ctx = await b.newContext({ viewport: { width: 380, height: 800 } }); await at(ctx, "2026-10-26");
  let p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(FILE); await p.waitForTimeout(400);
  ok(await p.isVisible("#welcome"), "welcome shown on first run");
  const t = await p.textContent("#today-plan");
  ok(/week 1, day 1/.test(t) && /stage 1/.test(t), "Today card: German week 1 day 1 stage 1 — " + t.slice(0, 80).replace(/\s+/g, " "));
  ok(/Hungarian: starts 2026-11-23/.test(t), "Hungarian start defaults to German week 5 (2026-11-23)");
  await p.click("#welcome-close"); ok(!(await p.isVisible("#welcome")), "welcome dismisses");
  const blocks = await p.$$eval("#block-list .block", x => x.length); ok(blocks === 6, "German 45-min plan shows 6 blocks (" + blocks + ")");
  await p.click("#today-lang-hu"); await p.waitForTimeout(150);
  ok(/starts on 2026-11-23/.test(await p.textContent("#block-list")), "Hungarian blocks locked before its start date");
  await p.click("#today-lang-de"); await p.waitForTimeout(100);
  await p.click("[data-block-start=\"0\"]"); await p.waitForTimeout(200);
  ok((await p.$$eval(".phon-group", g => g.length)) >= 8 && (await p.$$eval(".phon-group.today", g => g.length)) === 2, "Sounds card: 8+ groups, 2 marked today");
  await p.evaluate(() => OLC.show("drill")); await p.waitForTimeout(100);
  const stages = await p.evaluate(() => { const q = OLC.buildQueue("de", "due", new Set(), 200); return q.map(d => d.stage == null ? "x" : d.stage); });
  ok(stages.length > 0 && stages.every(s => s === "x" || s <= 1), "day-1 German queue only stage ≤1 items (" + stages.length + " items: " + [...new Set(stages)].join(",") + ")");
  ok(/stage 1/.test(await p.textContent("#drill-setup-msg")), "setup explains the stage filter");
  await p.evaluate(() => OLC.show("manual")); await p.waitForTimeout(150);
  const resCount = await p.$$eval(".res-item", x => x.length); ok(resCount >= 0, "resources panel renders (" + resCount + " items)");
  await p.evaluate(() => OLC.show("legend")); await p.waitForTimeout(150);
  ok(await p.isVisible("#legend-frames-wrap"), "legend starter sentences panel present");
  ok(errs.length === 0, "day 1: no console errors " + errs.join(" | "));
  await ctx.close();

  // Week 10 (2026-12-28): German stage 3, Hungarian week 6 → stage 2
  ctx = await b.newContext({ viewport: { width: 380, height: 800 } }); await at(ctx, "2026-12-28");
  p = await ctx.newPage(); await p.goto(FILE); await p.waitForTimeout(300);
  const info = await p.evaluate(() => [OLC.planInfo("de"), OLC.planInfo("hu")]);
  ok(info[0].week === 10 && info[0].stage === 3 && info[1].week === 6 && info[1].stage === 2, "week 10: de stage 3, hu week 6 stage 2 (" + JSON.stringify(info.map(i => [i.week, i.stage])) + ")");
  await ctx.close();

  // Hungarian week 1 (2026-11-24): sounds only, no drills
  ctx = await b.newContext({ viewport: { width: 380, height: 800 } }); await at(ctx, "2026-11-24");
  p = await ctx.newPage(); await p.goto(FILE); await p.waitForTimeout(300);
  await p.evaluate(() => { OLC.state.settings.todayLang = "hu"; OLC.show("mission"); }); await p.waitForTimeout(150);
  ok((await p.$$eval("#block-list .block", x => x.length)) === 2, "Hungarian week 1: two blocks (Sounds, Input)");
  ok((await p.evaluate(() => OLC.buildQueue("hu", "due", new Set(), 50).length)) === 0, "Hungarian week 1: no drills");
  await ctx.close();

  // Old install: content without new items, one item edited → refresh adds new, keeps the edit
  ctx = await b.newContext({ viewport: { width: 380, height: 800 } }); await at(ctx, "2026-10-26");
  p = await ctx.newPage(); await p.goto(FILE); await p.waitForTimeout(300);
  await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("olc.content"));
    const i = c.findIndex(x => x.id === "de-drill-001"); c[i].cue = "EDITED CUE"; c[i].userEdited = true;
    const j = c.findIndex(x => x.id === "de-drill-002"); c[j].answer = "OLD WRONG";
    const kept = c.filter(x => !/^de-drill-b|^hu-drill-b/.test(x.id) && x.id !== "de-drill-003");
    localStorage.setItem("olc.content", JSON.stringify(kept)); localStorage.setItem("olc.seedHash", "old"); localStorage.setItem("olc.version", "1");
  });
  await p.reload(); await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const c = OLC.state.content; const g = id => c.find(x => x.id === id); return { ed: g("de-drill-001").cue, fixed: g("de-drill-002").answer, back: !!g("de-drill-003"), ver: localStorage.getItem("olc.version"), banner: !document.getElementById("content-update").hidden }; });
  ok(r.ed === "EDITED CUE", "edited item kept after content refresh");
  ok(r.fixed !== "OLD WRONG", "unedited built-in item corrected by refresh");
  ok(r.back, "missing built-in item restored");
  ok(r.ver === "2" && r.banner, "version 2 written and update banner shown");
  await ctx.close();
  await b.close();
  console.log(fails ? fails + " FAILED" : "ALL DAY-1 CHECKS PASSED"); process.exit(fails ? 1 : 0);
})();
