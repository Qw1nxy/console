// Regression checks for the day-1 beginner walkthrough findings (second QA pass), in a real browser at phone width.
// Each check names the finding it guards. Run: NODE_PATH=$(npm root -g) node test_day1_qa.js
const { chromium } = require("playwright");
const path = require("path");
const FILE = "file://" + path.resolve(__dirname, "console_standalone.html");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
async function at(ctx, isoDate) { await ctx.addInitScript(d => { const real = Date; const fixed = new real(d + "T16:00:00").getTime(); const off = fixed - real.now(); class F extends real { constructor(...a) { if (a.length) super(...a); else super(real.now() + off); } static now() { return real.now() + off; } } window.Date = F; }, isoDate); }
const LEAK = /\bP-\d{1,2}\b|egress|proxy|could not be fetched|permission gate|Data model|stub/;

(async () => {
  const b = await chromium.launch();
  for (const scheme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: 380, height: 800 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    await at(ctx, "2026-10-26");
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(FILE); await p.waitForTimeout(400);
    const tag = " [" + scheme + "]";
    const headerBottom = await p.evaluate(() => { const h = document.querySelector("header, .topbar, .hdr"); return h ? h.getBoundingClientRect().bottom : 56; });

    // Blocker 1: "Start the first block" starts the Sounds block and its title is not under the sticky header
    await p.click("#welcome-start"); await p.waitForTimeout(900);
    const card = await p.evaluate(() => { const c = document.getElementById("timer-card"); const r = c.getBoundingClientRect(); return { shown: !c.hidden, title: document.getElementById("timer-card-title").textContent, top: r.top, running: !!Object.keys(OLC.state.blockTimers).length }; });
    ok(card.shown && /^Sounds — German$/.test(card.title) && card.running, "welcome Start opens the Sounds card and starts its timer" + tag + " (" + card.title + ")");
    ok(card.top >= headerBottom - 2, "Sounds card title lands below the sticky header" + tag + " (top " + Math.round(card.top) + " vs header " + Math.round(headerBottom) + ")");
    const sounds = await p.textContent("#timer-card-body");
    ok(!LEAK.test(sounds + card.title), "Sounds card has no protocol codes" + tag);
    ok(/I come from America\. I’m learning German\./.test(sounds), "Sounds sentence has its English meaning" + tag);
    const sentLinks = await p.$$eval("#timer-card-body .phon-group:last-child a.phon-w", a => a.map(x => x.getAttribute("href")));
    ok(sentLinks.length >= 4 && sentLinks.every(h => /^https:\/\/forvo\.com\/word\/[^/%]+(%[0-9A-F]{2}[^/%]*)*\/#de$/.test(h) && !/%20/.test(h)), "sentence words link to Forvo one word each" + tag + " (" + sentLinks.slice(0, 3).join(" ") + ")");
    // passed tick gives feedback
    await p.click("[data-phon-pass]"); await p.waitForTimeout(150);
    ok(/passed — moved to the bottom/.test(await p.textContent("#toast")), "ticking passed explains what happened" + tag);

    // Blocker 2: "Log a pronunciation mistake" opens the burn-book form and brings it into view
    await p.click("#phon-burn"); await p.waitForTimeout(900);
    const bf = await p.evaluate(() => { const f = document.getElementById("burn-form"); const r = f.getBoundingClientRect(); return { open: f.closest("details").open, inView: r.top >= 0 && r.top < innerHeight, cat: document.getElementById("burn-cat").value, focus: document.activeElement && document.activeElement.id }; });
    ok(bf.open && bf.inView && bf.cat === "mouth" && bf.focus === "burn-produced", "pronunciation-mistake button opens the burn form" + tag + " " + JSON.stringify(bf));

    // Due grid: number and label are separated
    const due = await p.evaluate(() => { const st = document.querySelector("#due-grid .stat"); const bb = st.querySelector("b").getBoundingClientRect(), sp = st.querySelector("span").getBoundingClientRect(); return sp.left - bb.right; });
    ok(due >= 4, "due grid: gap between number and label" + tag + " (" + Math.round(due) + " px)");
    // Today card: Hungarian study time labelled with its start
    ok(/Hungarian \(from Nov 23\)/.test(await p.textContent("#slot-hu-label")), "Hungarian study time shows its start date" + tag);
    ok(/start here/.test(await p.textContent("#today-plan")), "Today card marks one resource “start here”" + tag);
    ok(!/Yojik/.test(await p.textContent("#today-plan")), "Today card: no mirror-site jargon" + tag);
    // Milestones date input fits its card
    const ms = await p.evaluate(() => { const i = document.getElementById("ms-hu-0p"); const pan = i.closest(".panel"); return pan.getBoundingClientRect().right - i.getBoundingClientRect().right; });
    ok(ms >= 0, "milestone date inputs not clipped" + tag + " (" + Math.round(ms) + " px spare)");
    // Keyboard panel hidden on touch
    ok(!(await p.isVisible(".kbd-only")), "keyboard panel hidden on a touch phone" + tag);

    // Each block card: no protocol codes; Input lists media only; Gisting explains not understanding
    for (const i of [2, 3, 4]) {
      await p.click('[data-block-start="' + i + '"]'); await p.waitForTimeout(250);
      const txt = await p.textContent("#timer-card"); const title = await p.textContent("#timer-card-title");
      ok(!LEAK.test(txt), "block " + i + " (" + title + ") has no protocol codes" + tag);
      if (i === 2) {
        const links = await p.$$eval("#timer-card-body ol a", a => a.map(x => x.textContent));
        ok(links[0] && /Nicos Weg/.test(links[0]) && links.every(n => !/FrequencyWords|Klett|Hueber|LEO/.test(n)), "Input card: Nicos Weg first, no word lists or shops" + tag + " (" + links.join(", ") + ")");
        ok(/Hallo!/.test(txt), "Input card points to lesson 1 “Hallo!”" + tag);
      }
      if (i === 3) ok(/won’t understand the words yet/.test(txt), "Gisting card says you won't understand the words yet" + tag);
    }

    // Drill: warm-up fillers are tappable with meanings; first card is a learn card
    await p.evaluate(() => { OLC.show("drill"); }); await p.waitForTimeout(150);
    ok(/New items are shown to you before you are tested/.test(await p.textContent("#drill-setup-msg")), "setup says new items are shown first" + tag);
    await p.click("#drill-start"); await p.waitForTimeout(250);
    const fill = await p.$$eval("#persona-fillers .filler", f => f.map(x => [x.querySelector(".phon-w").tagName, x.querySelector(".muted").textContent]));
    ok(fill.length === 7 && fill.every(f => f[1].length > 1), "warm-up fillers have meanings" + tag + " (" + fill.slice(0, 2).map(f => f[1]).join("; ") + ")");
    ok(await p.$eval('#persona-fillers a[href*="na_ja"]', a => !!a).catch(() => false) || await p.$eval('#persona-fillers [data-say="na ja"]', a => !!a).catch(() => false), "“na ja” links to forvo.com/word/na_ja" + tag);
    await p.evaluate(() => OLC.beginCues()); await p.waitForTimeout(200);
    const c1 = await p.evaluate(() => ({ learn: !OLC.state.drill.queue[0]._learn ? false : true, ans: !document.getElementById("stage-answer-box").hidden, gloss: document.getElementById("stage-gloss").textContent, hear: document.querySelectorAll("#stage-hear a, #stage-hear button").length, banner: !document.getElementById("stage-learn").hidden, next: document.getElementById("stage-next-label").textContent, timer: getComputedStyle(document.querySelector("#drill-stage .timer-row")).display }));
    ok(c1.learn && c1.ans && /^Meaning: /.test(c1.gloss) && c1.hear >= 1 && c1.banner && /3×/.test(c1.next) && c1.timer === "none", "first drill card teaches before testing" + tag + " " + JSON.stringify(c1));
    ok(!(await p.isVisible("#drill-stage .kbd-hint")), "keyboard hints hidden on touch" + tag);
    // walk the three learn cards, then the first test card hides the answer and shows the meaning as a hint where the cue is German
    await p.evaluate(() => { OLC.nextCue(); OLC.nextCue(); OLC.nextCue(); }); await p.waitForTimeout(100);
    const c4 = await p.evaluate(() => ({ after: !!OLC.state.drill.queue[3]._afterLearn, ansHidden: document.getElementById("stage-answer-box").hidden }));
    ok(c4.after && c4.ansHidden, "4th card tests the first item with the answer hidden" + tag);
    await p.click("#stage-reveal"); await p.click("#grade-2"); await p.waitForTimeout(80);
    ok(/Had to think/.test(await p.textContent("#stage-result")), "grade 2 reads “Had to think”" + tag);
    await p.evaluate(() => OLC.endSession()); await p.waitForTimeout(150);
    const sum = await p.evaluate(() => { const t = document.getElementById("summary-families"); const w = t.parentElement; return { over: t.scrollWidth - w.clientWidth, stats: document.getElementById("summary-stats").textContent }; });
    ok(sum.over <= 1, "summary topic table fits the screen" + tag + " (overflow " + sum.over + " px)");
    ok(/Had to think/.test(sum.stats) && /Right but over time/.test(sum.stats), "summary shows Had-to-think and Right-but-over-time counts" + tag);
    // second session the same day: no 60-second wait
    await p.evaluate(() => { OLC.state.drill = null; OLC.show("drill"); }); await p.click("#drill-start"); await p.waitForTimeout(200);
    ok(!(await p.isDisabled("#persona-begin")), "second session today: warm-up can begin at once" + tag);
    await p.evaluate(() => { clearInterval(OLC.state.drill.personaTimer); OLC.state.drill = null; });
    // typed mode says Type
    await p.evaluate(() => { OLC.show("drill"); }); await p.check("#drill-typed"); await p.click("#drill-start"); await p.waitForTimeout(150); await p.evaluate(() => OLC.beginCues()); await p.waitForTimeout(80);
    await p.evaluate(() => { const d = OLC.state.drill; let g = 0; while (d.queue[d.idx] && d.queue[d.idx]._learn && g++ < 10) OLC.nextCue(); });
    ok(!/^Say\b/.test(await p.textContent("#stage-instruction")), "typed mode instruction does not say “Say”" + tag + " (" + (await p.textContent("#stage-instruction")).slice(0, 40) + ")");
    await p.evaluate(() => { OLC.endSession(); OLC.state.drill = null; });

    // Resources: no verification notes, one card per resource in the all-stages view
    await p.evaluate(() => OLC.show("manual")); await p.waitForTimeout(150);
    ok(!LEAK.test(await p.textContent("#res-list")), "Resources show no developer notes or protocol codes" + tag);
    await p.selectOption("#res-filter", "all"); await p.waitForTimeout(100);
    const names = await p.$$eval("#res-list .res-name", x => x.map(n => n.textContent));
    ok(names.length === new Set(names).size && names.length >= 15, "all-stages view lists each resource once" + tag + " (" + names.length + ")");
    await p.selectOption("#res-filter", "now");

    // Deconstructor: chip does not lock the language; sentences get a helpful message; bare adjective parses
    await p.evaluate(() => OLC.show("decon")); await p.waitForTimeout(150);
    ok(/Type one word/.test(await p.textContent("#view-decon")), "Word parts explains what it is for" + tag);
    await p.click("#decon-exlang-hu"); await p.click("#decon-examples [data-ex]"); await p.waitForTimeout(100);
    await p.fill("#decon-input", "Mechaniker"); await p.press("#decon-input", "Enter"); await p.waitForTimeout(100);
    ok(/German/.test(await p.textContent("#decon-detected")) && /mechanic/.test(await p.textContent("#decon-results")), "after a Hungarian example, German words still parse as German" + tag);
    await p.fill("#decon-input", "Ich bin müde"); await p.press("#decon-input", "Enter"); await p.waitForTimeout(100);
    ok(/looks like a sentence/.test(await p.textContent("#decon-results")), "a sentence gets a one-word-at-a-time message" + tag);
    await p.click('#decon-results [data-one="müde"]'); await p.waitForTimeout(100);
    ok(/tired/.test(await p.textContent("#decon-results")), "tapping müde explains it (tired)" + tag);
    await p.fill("#decon-input", "Guten Morgen"); await p.press("#decon-input", "Enter"); await p.waitForTimeout(100);
    ok(/A greeting/.test(await p.textContent("#decon-results")), "Guten Morgen gets the greeting note" + tag);
    ok(!/\b(np|det|adj-end)\b/.test(await p.textContent("#decon-results")), "morpheme roles are in plain English" + tag);

    // Wiretap and Legend: no developer text, labelled fact inputs, Use lands on the new fact
    await p.evaluate(() => OLC.show("wiretap")); await p.waitForTimeout(100);
    ok(!LEAK.test(await p.textContent("#view-wiretap")), "Wiretap: no developer text" + tag);
    await p.evaluate(() => OLC.show("legend")); await p.waitForTimeout(100);
    ok(!LEAK.test(await p.textContent("#view-legend .panel-head")), "Legend: no stub badge" + tag);
    await p.click("#legend-frames [data-frame]"); await p.waitForTimeout(500);
    const lf = await p.evaluate(() => { const a = document.activeElement; return { id: a && a.id, sel: a && a.value ? a.value.slice(a.selectionStart, a.selectionEnd) : "", labels: document.querySelectorAll("#legend-facts label").length }; });
    ok(/^fact-\d+-sentence$/.test(lf.id) && lf.sel === "___" && lf.labels >= 3, "starter sentence Use focuses the blank in the new fact" + tag + " " + JSON.stringify(lf));

    // Settings: plain labels, Download backup is the main button
    await p.evaluate(() => OLC.show("settings")); await p.waitForTimeout(100);
    const st = await p.textContent("#view-settings");
    ok(/Minimum break between a German and a Hungarian session/.test(st) && /Allow skipping the 60-second warm-up/.test(st) && !/slot/.test(st), "Settings labels in plain words" + tag);
    ok(await p.$eval("#export-download", e => e.classList.contains("primary") && /Download backup/.test(e.textContent)), "Download backup is the main backup button" + tag);
    // Tab bar labels fit
    const tabs = await p.$$eval(".tabbar button span", s => s.map(x => [x.textContent, x.scrollWidth - x.clientWidth]));
    ok(tabs.every(t => t[1] <= 1) && tabs.some(t => t[0] === "Words") && tabs.some(t => t[0] === "Items"), "tab labels fit and use plain names" + tag + " (" + tabs.map(t => t[0]).join(" ") + ")");
    ok(errs.length === 0, "no console errors" + tag + " " + errs.join(" | "));
    await ctx.close();
  }

  // Hungarian week 3 (2026-12-07): stage 1, learn-first applies, its resources come from its own stage list
  const ctx = await b.newContext({ viewport: { width: 380, height: 800 } }); await at(ctx, "2026-12-07");
  const p = await ctx.newPage(); await p.goto(FILE); await p.waitForTimeout(300);
  const hu = await p.evaluate(() => { const q = OLC.buildQueue("hu", "due", new Set(), 20); return { stage: OLC.planInfo("hu").stage, first: q[0] && q[0]._learn, n: q.length }; });
  ok(hu.stage === 1 && hu.first && hu.n === 20, "Hungarian week 3: stage 1 queue starts with a learn card (" + JSON.stringify(hu) + ")");
  await p.evaluate(() => { OLC.state.settings.todayLang = "hu"; OLC.show("mission"); }); await p.waitForTimeout(100);
  ok(/FSI Hungarian/.test(await p.textContent("#today-plan")), "Hungarian stage-1 Today card lists the FSI Hungarian course");
  await ctx.close();
  // Second walkthrough (QA3) findings
  {
    const c3 = await b.newContext({ viewport: { width: 380, height: 800 }, hasTouch: true, isMobile: true }); await at(c3, "2026-10-26");
    const p3 = await c3.newPage(); const errs3 = []; p3.on("pageerror", e => errs3.push(e.message));
    await p3.goto(FILE); await p3.waitForTimeout(300);
    // meaning hint is labelled as the answer's meaning
    await p3.evaluate(() => { OLC.state.settings.drillHintSeen = true; OLC.show("drill"); }); await p3.click("#drill-start"); await p3.waitForTimeout(150); await p3.evaluate(() => OLC.beginCues());
    const cg = await p3.evaluate(() => { const d = OLC.state.drill; for (let g = 0; g < 40 && d.phase === "stage"; g++) { const it = d.queue[d.idx]; if (!it._learn && !document.getElementById("stage-cue-gloss").hidden) return document.getElementById("stage-cue-gloss").textContent; if (it._learn) OLC.nextCue(); else { OLC.reveal(); OLC.grade(1); OLC.nextCue(); } } return ""; });
    ok(/^Your answer means: /.test(cg), "cue hint reads “Your answer means: …” (" + cg + ")");
    // leaving and coming back keeps the session
    const before = await p3.evaluate(() => OLC.state.drill.idx);
    await p3.click("#tab-mission"); await p3.waitForTimeout(100); await p3.click("#tab-drill"); await p3.waitForTimeout(150);
    const after = await p3.evaluate(() => ({ idx: OLC.state.drill && OLC.state.drill.idx, stage: !document.getElementById("drill-stage").hidden }));
    ok(after.stage && after.idx === before, "leaving the Drill tab and coming back resumes the same card (" + before + " → " + after.idx + ")");
    // typed: umlaut spelling and the typo override
    ok(await p3.evaluate(() => OLC.normalizeAnswer("ich bin muede", "de") === OLC.normalizeAnswer("Ich bin müde.", "de") && OLC.normalizeAnswer("fuenfunddreissig", "de") === OLC.normalizeAnswer("fünfunddreißig", "de")), "typed German accepts ue/oe/ae/ss spellings");
    await p3.evaluate(() => { OLC.endSession(); OLC.state.drill = null; OLC.show("drill"); }); await p3.check("#drill-typed"); await p3.click("#drill-start"); await p3.waitForTimeout(100); await p3.evaluate(() => OLC.beginCues());
    await p3.evaluate(() => { const d = OLC.state.drill; let g = 0; while (d.queue[d.idx]._learn && g++ < 10) OLC.nextCue(); });
    const errsBefore = await p3.evaluate(() => OLC.state.errors.length);
    await p3.fill("#stage-input", "völlig falsch"); await p3.click("#stage-submit"); await p3.waitForTimeout(80);
    ok(await p3.isVisible("#stage-override"), "typed miss offers “I was right (typo)”");
    await p3.click("#stage-override"); await p3.waitForTimeout(80);
    const ov = await p3.evaluate(() => { const d = OLC.state.drill; return { g: d.results[d.results.length - 1].grade, errs: OLC.state.errors.length, requeue: d.queue.filter(x => x._requeued).length }; });
    ok(ov.g === 1 && ov.errs === errsBefore && ov.requeue === 0, "override counts it right and removes the burn-book line and re-ask " + JSON.stringify(ov));
    await p3.evaluate(() => { OLC.endSession(); OLC.state.drill = null; });
    // Word parts: everyday words, greetings, Hungarian verbs, Budapest
    await p3.evaluate(() => OLC.show("decon"));
    const look = async w => { await p3.fill("#decon-input", w); await p3.press("#decon-input", "Enter"); await p3.waitForTimeout(80); return p3.textContent("#decon-results"); };
    let t = await look("Hallo"); ok(/hello/.test(t) && !/unknown noun/.test(t), "Hallo → hello, no invented noun");
    t = await look("zwanzig"); ok(/— 20(?!\d)/.test(t) && !/unknown stem/.test(t), "zwanzig → 20");
    t = await look("einundzwanzig"); ok(/21: ein-und-zwanzig/.test(t), "einundzwanzig → 21");
    t = await look("vagyok"); ok(/I am/.test(t) && !/plural/.test(t), "vagyok → I am, not a plural guess");
    t = await look("köszönöm"); ok(/thank you/.test(t) && !/possessor/.test(t), "köszönöm → thank you, not a possessive");
    t = await look("Guten Morgen"); ok(/A greeting/.test(t) && !/dative/.test(t), "Guten Morgen shows only the accusative reading");
    t = await look("der Chef"); ok(/article \+ noun/.test(t) && !/adjective \+ noun/.test(t), "der Chef labelled article + noun");
    t = await look("Budapesten"); ok(/Pest/.test(t) && !/last non-neutral/.test(t), "Budapesten explained by Pest");
    // Import: choosing a file does not import by itself; Import restores settings
    await p3.evaluate(() => OLC.show("settings"));
    const backup = await p3.evaluate(() => { const o = OLC.exportObject(); o.settings = JSON.parse(JSON.stringify(o.settings)); o.settings.planStart.hu = "2027-01-04"; return JSON.stringify(o); });
    await p3.setInputFiles("#import-file", { name: "olc-export.json", mimeType: "application/json", buffer: Buffer.from(backup) }); await p3.waitForTimeout(200);
    const mid = await p3.evaluate(() => ({ hu: OLC.planStartOf("hu"), msg: document.getElementById("import-msg").textContent }));
    ok(mid.hu === "2026-11-23" && /File loaded/.test(mid.msg), "choosing a file only loads it (" + mid.msg.slice(0, 40) + ")");
    await p3.click("#import-go"); await p3.waitForTimeout(150);
    ok((await p3.evaluate(() => OLC.planStartOf("hu"))) === "2027-01-04", "Import restores settings from the backup");
    await p3.evaluate(() => { OLC.state.settings.planStart.hu = ""; });
    // Blocks: one timer at a time; done-today mark
    await p3.evaluate(() => OLC.show("mission"));
    await p3.click('[data-block-start="0"]'); await p3.waitForTimeout(100); await p3.click('[data-block-start="2"]'); await p3.waitForTimeout(100);
    const tm = await p3.evaluate(() => Object.values(OLC.state.blockTimers).filter(t => t.running).length);
    ok(tm === 1, "starting a second block pauses the first (" + tm + " running)");
    // Manual A2 fits the phone width
    await p3.evaluate(() => OLC.show("manual")); await p3.click('#manual-toc [data-sec="a2"]'); await p3.waitForTimeout(150);
    const sw = await p3.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 381, "manual section A2 fits 380 px (" + sw + ")");
    // Hungarian sounds pair fixed
    ok(await p3.evaluate(() => { OLC.state.settings.todayLang = "hu"; return true; }), "switch to hu");
    ok(errs3.length === 0, "QA3 checks: no console errors " + errs3.join(" | "));
    await c3.close();
  }
  {
    const c4 = await b.newContext({ viewport: { width: 380, height: 800 } }); await at(c4, "2026-12-07");
    const p4 = await c4.newPage(); await p4.goto(FILE); await p4.waitForTimeout(300);
    await p4.evaluate(() => { OLC.state.settings.todayLang = "hu"; OLC.show("mission"); }); await p4.waitForTimeout(100);
    await p4.click('[data-block-start="4"]'); await p4.waitForTimeout(150);
    const sh = await p4.textContent("#timer-card-body");
    ok(!/Forvo/.test(sh) && /FSI Hungarian|HungarianPod101/.test(sh), "Hungarian shadowing points to a dialogue source, not Forvo");
    await p4.click('[data-block-start="0"]'); await p4.waitForTimeout(150);
    const snd = await p4.textContent("#timer-card-body");
    ok(/hát/.test(snd) && /sók/.test(snd), "Hungarian sounds: a/á pair is hat–hát; sok–sók moved to long vowels");
    await c4.close();
  }

  // Daylight saving: the plan day must not slip by one after the clocks change (US: 1 Nov 2026, 14 Mar 2027)
  for (const [d, day] of [["2026-11-02", 8], ["2027-03-15", 141]]) {
    const c2 = await b.newContext(); await at(c2, d); const p2 = await c2.newPage(); await p2.goto(FILE); await p2.waitForTimeout(200);
    const got = await p2.evaluate(() => OLC.planInfo("de").day);
    ok(got === day, "plan day correct across daylight saving on " + d + " (" + got + ", want " + day + ")");
    await c2.close();
  }
  await b.close();
  console.log(fails ? fails + " FAILED" : "ALL DAY-1 QA CHECKS PASSED"); process.exit(fails ? 1 : 0);
})();
