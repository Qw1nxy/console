#!/usr/bin/env node
/* test_console.js — acceptance tests for console_standalone.html (APP_SPEC.md §Acceptance tests).
   Tests 3, 4, 7, 8 exercise the engines and are SKIPPED when engines.js is absent. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const APP = __dirname;
const HTML = fs.readFileSync(path.join(APP, "console_standalone.html"), "utf8");
const ENGINES_PRESENT = fs.existsSync(path.join(APP, "engines.js"));
const CONTENT = path.resolve(APP, "..", "content");

const results = [];
function record(name, ok, detail, skipped) { results.push({ name, ok, detail, skipped }); console.log((skipped ? "SKIP " : ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : "")); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/* shared localStorage mock (so test 6 can reuse the same store across DOMs) */
function makeStorage(seed) {
  const m = new Map(seed || []);
  return {
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(),
    key: i => [...m.keys()][i] || null, get length() { return m.size; }, _map: m
  };
}
function load(storage) {
  const errors = [];
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.org/",
    beforeParse(window) {
      Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
      window.console.error = (...a) => errors.push("console.error: " + a.map(String).join(" "));
      window.scrollTo = () => {}; // jsdom reports scrollTo as "not implemented" through the virtual console
      window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function () {};
      window.addEventListener("error", e => errors.push("window error: " + (e.message || e.error)));
      // speechSynthesis deliberately absent (jsdom has none)
    }
  });
  dom.virtualConsole.on("jsdomError", e => errors.push("jsdomError: " + (e && e.message || e)));
  return { dom, window: dom.window, document: dom.window.document, errors };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function main() {
  const storage = makeStorage();
  let ctx = load(storage);
  const { window, document } = ctx;

  /* 1. boot */
  try {
    await sleep(50);
    assert(ctx.errors.length === 0, "errors: " + ctx.errors.join(" | "));
    assert(window.OLC && window.OLC.state, "window.OLC missing");
    assert(!document.getElementById("view-mission").hidden, "mission view not shown");
    const badge = document.getElementById("voice-badge-hdr");
    assert(!badge.hidden && /no .*voice/i.test(badge.textContent), "text-fallback badge not shown: " + badge.textContent);
    assert(/no German voice/.test(document.getElementById("voice-badge-de").textContent), "DE voice badge should say there is no German voice");
    assert(storage.getItem("olc.version") === "2", "olc.version not written as 2");
    record("1 boot without errors, text-fallback badge", true);
  } catch (e) { record("1 boot without errors, text-fallback badge", false, e.message); }

  /* 2. seed counts */
  try {
    const O = window.OLC;
    const de = O.drills("de").length, hu = O.drills("hu").length, ded = O.deconExamples("de").length, hud = O.deconExamples("hu").length;
    const huLex = O.huLexicon().length, deLex = O.deLexicon();
    assert(de >= 45, "DE drills " + de); assert(hu >= 45, "HU drills " + hu); assert(ded >= 28, "DE decon " + ded); assert(hud >= 28, "HU decon " + hud);
    assert(huLex > 0 && deLex.nouns.length > 0, "lexicon empty");
    record("2 seed counts", true, "drills de/hu " + de + "/" + hu + ", decon de/hu " + ded + "/" + hud + ", lexicon hu " + huLex + ", de nouns " + deLex.nouns.length + " parts " + deLex.parts.length + " adj " + deLex.adjectives.length + " verbs " + deLex.verbs.length);
  } catch (e) { record("2 seed counts", false, e.message); }

  /* 3. deconstructor parse of every example */
  if (!ENGINES_PRESENT) record("3 deconstructor parses every example", true, "engines.js absent", true);
  else try {
    const O = window.OLC; const E = O.engines;
    const fails = [];
    const forms = a => a.tokens ? a.tokens.map(t => t.morphemes.map(m => m.form)) : (a.morphemes || []).map(m => m.form);
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    O.deconExamples().forEach(ex => {
      const want = ex.tokens ? ex.tokens.map(t => t.morphemes.map(m => m.form)) : ex.morphemes.map(m => m.form);
      let got;
      try { got = ex.lang === "hu" ? E.hu.parse(ex.word, O.huLexicon()) : E.de.parse(ex.word, O.deLexicon()); } catch (e) { fails.push(ex.id + " threw " + e.message); return; }
      if (!Array.isArray(got) || !got.some(a => same(forms(a), want))) fails.push(ex.id + " (" + ex.word + ") got " + JSON.stringify((got || []).map(forms)));
    });
    assert(fails.length === 0, fails.length + " failures:\n   " + fails.join("\n   "));
    record("3 deconstructor parses every example", true, O.deconExamples().length + " examples");
  } catch (e) { record("3 deconstructor parses every example", false, e.message); }

  /* 4. unknown words */
  if (!ENGINES_PRESENT) record("4 unknown words do not throw", true, "engines.js absent", true);
  else try {
    const O = window.OLC; const E = O.engines;
    const known = E.hu.parse("kutyákról", O.huLexicon()); assert(known.length > 0, "kutyákról should parse");
    const u1 = E.hu.parse("zsiráfokban", O.huLexicon()); assert(u1.length === 0, "zsiráfokban should be unknown");
    const g1 = E.hu.guessUnknown("zsiráfokban", O.huLexicon()); assert(g1 && g1.unknown === true, "guessUnknown hu should flag unknown");
    const u2 = E.de.parse("Donaudampfschifffahrt", O.deLexicon()); assert(u2.length === 0, "Donaudampfschifffahrt should be unknown");
    const g2 = E.de.guessUnknown("Donaudampfschifffahrt", O.deLexicon()); assert(g2 && g2.unknown === true, "guessUnknown de should flag unknown");
    // through the UI
    O.show("decon"); O.parseDecon("zsiráfokban", "hu");
    assert(/Not in the app’s dictionary/.test(document.getElementById("decon-results").textContent), "UI should show Not in the app’s dictionary");
    O.parseDecon("Donaudampfschifffahrt", "de");
    assert(/Not in the app’s dictionary/.test(document.getElementById("decon-results").textContent), "UI should show Not in the app’s dictionary (de)");
    record("4 unknown words do not throw", true);
  } catch (e) { record("4 unknown words do not throw", false, e.message); }

  /* 5. drill flow */
  let missedId = null;
  try {
    const O = window.OLC; const S = O.state;
    S.settings.personaSkippable.de = true; S.settings.firstSessionDate.de = "2020-01-01"; S.settings.lastSessionEnd.hu = 0;
    S.settings.learnFirst = false; // the classic test path; learn-first has its own test (5b)
    O.show("drill");
    const fams = new Set(O.drills("de").map(d => d.family));
    O.startDrill({ lang: "de", source: "families", families: fams, length: 5, typed: true, skipPersona: true });
    assert(S.drill && S.drill.phase === "stage", "drill not on stage: " + (S.drill && S.drill.phase));
    assert(!document.getElementById("drill-stage").hidden, "stage hidden");
    assert(S.drill.queue.length === 5, "queue length " + S.drill.queue.length);
    const errorsBefore = S.errors.length;
    // correct answer, in time
    const item1 = S.drill.queue[0];
    document.getElementById("stage-input").value = item1.answer;
    O.submitTyped();
    assert(S.drill.results[0].grade === 1, "expected grade 1, got " + S.drill.results[0].grade);
    assert(S.drill.results[0].inTime === true, "expected in time");
    assert(S.progress[item1.id].due > Date.now(), "due should be in the future");
    O.nextCue();
    // wrong answer
    const item2 = S.drill.queue[1]; missedId = item2.id;
    document.getElementById("stage-input").value = "xyz völlig falsch";
    O.submitTyped();
    assert(S.drill.results[1].grade === 3, "expected grade 3");
    assert(S.errors.length === errorsBefore + 1, "error line not written");
    const line = S.errors[S.errors.length - 1];
    assert(line.itemId === item2.id && line.source === "drill" && line.correct === item2.answer && line.open === true, "error line fields wrong: " + JSON.stringify(line));
    assert(S.progress[item2.id].heat === true, "missed item not in heat set");
    // finish remaining by revealing + grading through the typed path
    let guard = 0;
    while (S.drill && S.drill.phase === "stage" && guard++ < 20) { O.nextCue(); if (S.drill && S.drill.phase === "stage") { document.getElementById("stage-input").value = S.drill.queue[S.drill.idx].answer; O.submitTyped(); } }
    assert(S.drill && S.drill.phase === "summary", "expected summary, got " + (S.drill && S.drill.phase));
    assert(!document.getElementById("drill-summary").hidden, "summary hidden");
    const ses = S.sessions[S.sessions.length - 1];
    assert(ses && ses.module === "drill" && ses.lang === "de" && ses.cues >= 5, "session not saved: " + JSON.stringify(ses));
    assert(ses.wrong >= 1 && ses.correctInTime >= 1, "session counts wrong");
    assert(JSON.parse(storage.getItem("olc.sessions")).length === S.sessions.length, "sessions not persisted");
    const prog = JSON.parse(storage.getItem("olc.progress"));
    assert(prog[item1.id] && prog[item1.id].due > Date.now(), "persisted progress due not in future");
    assert(prog[item2.id].heat === true, "persisted heat flag missing");
    assert(S.settings.lastSessionEnd.de > 0, "lastSessionEnd not set");
    // bridge box and per-family table rendered
    assert(document.getElementById("summary-bridge-list").children.length >= 1, "bridge box empty");
    assert(document.querySelectorAll("#summary-families tbody tr").length >= 1, "family table empty");
    record("5 drill flow", true, "score " + ses.correctInTime + "/" + ses.cues + " in time, " + ses.wrong + " wrong, requeued miss re-asked");
  } catch (e) { record("5 drill flow", false, e.message + (ctx.errors.length ? " | page errors: " + ctx.errors.join("; ") : "")); }

  /* 5b. learn-first: a never-seen item is shown first, then tested; the first right answer comes back tomorrow */
  try {
    const O = window.OLC; const S = O.state;
    S.settings.learnFirst = true; S.drill = null;
    var savedProgress = JSON.parse(JSON.stringify(S.progress)); for (const k of Object.keys(S.progress)) delete S.progress[k];
    const fams = new Set(O.drills("de").map(d => d.family));
    O.startDrill({ lang: "de", source: "families", families: fams, length: 6, typed: true, skipPersona: true });
    const q = S.drill.queue;
    assert(q.length === 6, "learn-first queue length " + q.length);
    assert(q[0]._learn && q[1]._learn && q[2]._learn && q[3]._afterLearn && q[3].id === q[0].id, "expected learn A,B,C then test A: " + q.map(x => (x._learn ? "L:" : x._afterLearn ? "T:" : "") + x.id).join(" "));
    assert(!document.getElementById("stage-answer-box").hidden, "learn card should show the answer");
    assert(!document.getElementById("stage-learn").hidden, "learn banner hidden");
    assert(document.getElementById("stage-answer").textContent === q[0].answer, "learn card answer wrong");
    assert(document.getElementById("stage-hear").querySelectorAll("a,button").length >= 1, "no tap-to-hear words on the learn card");
    assert(S.drill.results.length === 0, "learn cards must not be graded");
    O.nextCue(); O.nextCue(); O.nextCue();
    assert(S.drill.idx === 3 && document.getElementById("stage-answer-box").hidden, "test card should hide the answer");
    assert(document.getElementById("stage-learn").hidden, "learn banner should hide on the test card");
    const it = S.drill.queue[3];
    document.getElementById("stage-input").value = it.answer; O.submitTyped();
    assert(S.drill.results.length === 1 && S.drill.results[0].grade === 1, "after-learn test not graded 1");
    const due = S.progress[it.id].due;
    assert(due > Date.now() && due <= Date.now() + 86400000 + 1000, "first right answer after learning should come back within a day, got +" + Math.round((due - Date.now()) / 3600000) + " h");
    O.endSession(); S.drill = null;
    for (const k of Object.keys(S.progress)) delete S.progress[k]; Object.assign(S.progress, savedProgress); storage.setItem("olc.progress", JSON.stringify(S.progress));
    record("5b learn-first", true, "learn ×3 → test ×3; first pass due in ≤ 1 day");
  } catch (e) { record("5b learn-first", false, e.message + (ctx.errors.length ? " | page errors: " + ctx.errors.join("; ") : "")); }

  /* 6. persistence */
  try {
    const ctx2 = load(storage);
    await sleep(30);
    assert(ctx2.errors.length === 0, "errors on reload: " + ctx2.errors.join(" | "));
    const S2 = ctx2.window.OLC.state;
    assert(S2.sessions.length >= 1 && S2.sessions[S2.sessions.length - 1].module === "drill", "sessions lost");
    assert(missedId && S2.progress[missedId] && S2.progress[missedId].heat === true, "progress/heat lost");
    assert(S2.errors.some(e => e.itemId === missedId), "error log lost");
    assert(S2.settings.lastSessionEnd.de > 0, "settings lost");
    // interference guard should now block a HU session (gap 90 min)
    ctx2.window.OLC.show("drill");
    ctx2.window.OLC.startDrill({ lang: "hu", source: "all", families: new Set(), length: 5, typed: true });
    assert(!ctx2.document.getElementById("drill-guard").hidden, "interference guard not shown");
    assert(/min/.test(ctx2.document.getElementById("guard-text").textContent), "guard text lacks minutes");
    ctx2.window.close();
    record("6 persistence across reload", true);
  } catch (e) { record("6 persistence across reload", false, e.message); }

  /* 7. Hungarian build */
  if (!ENGINES_PRESENT) record("7 Hungarian build", true, "engines.js absent", true);
  else try {
    const O = window.OLC; const E = O.engines; const L = O.huLexicon();
    const ent = b => { const e = L.find(x => x.base === b); assert(e, "lexicon lacks " + b); return e; };
    const cases = [
      [ent("ház"), { possessor: "1sg", pluralPossessed: true, case: "ban" }, "házaimban", 5],
      [ent("kert"), { possessor: "3sg", case: "val" }, "kertjével"],
      [ent("könyv"), { plural: true, case: "on" }, "könyveken"],
      [ent("ló"), { case: "t" }, "lovat"],
      [ent("kutya"), { case: "ban" }, "kutyában"]
    ];
    const fails = [];
    cases.forEach(c => { const r = E.hu.build(c[0], c[1]); if (!r || r.error || r.word !== c[2]) fails.push(c[2] + " got " + JSON.stringify(r && (r.word || r.error))); else if (c[3] && r.morphemes.length !== c[3]) fails.push(c[2] + " expected " + c[3] + " morphemes, got " + r.morphemes.length); });
    const ex = E.hu.build(ent("ház"), { plural: true, possessor: "1sg", pluralPossessed: true }); assert(ex && ex.error, "plural+pluralPossessed should error");
    assert(fails.length === 0, fails.join("; "));
    record("7 Hungarian build", true);
  } catch (e) { record("7 Hungarian build", false, e.message); }

  /* 8. German build */
  if (!ENGINES_PRESENT) record("8 German build", true, "engines.js absent", true);
  else try {
    const O = window.OLC; const E = O.engines; const L = O.deLexicon();
    const noun = b => { const e = L.nouns.find(x => x.base === b); assert(e, "lexicon lacks noun " + b); return e; };
    const adj = b => { const e = L.adjectives.find(x => x.base === b); assert(e, "lexicon lacks adjective " + b); return e; };
    const cases = [
      [{ noun: noun("Mann"), det: "definite", case: "dat", number: "sg", adjective: adj("alt") }, "dem alten Mann"],
      [{ noun: noun("Haus"), det: "ein", case: "nom", number: "sg", adjective: adj("alt") }, "ein altes Haus"],
      [{ noun: noun("Wein"), det: "none", case: "nom", number: "sg", adjective: adj("gut") }, "guter Wein"],
      [{ noun: noun("Mann"), det: "definite", case: "dat", number: "pl", adjective: adj("alt") }, "den alten Männern"]
    ];
    const fails = [];
    cases.forEach(c => { const r = E.de.build(c[0]); if (!r || r.word !== c[1]) fails.push(c[1] + " got " + JSON.stringify(r && (r.word || r.error))); });
    assert(fails.length === 0, fails.join("; "));
    record("8 German build", true);
  } catch (e) { record("8 German build", false, e.message); }

  /* 9. export / import */
  try {
    const O = window.OLC; const S = O.state;
    O.show("settings");
    document.getElementById("export-render").click();
    const txt = document.getElementById("export-text").value;
    const obj = JSON.parse(txt);
    ["version", "exportedAt", "content", "progress", "sessions", "errors", "legends", "scenarios", "wiretap", "settings"].forEach(k => assert(k in obj, "export lacks " + k));
    assert(obj.content.length === S.content.length, "export content count");
    const before = S.content.length;
    // merge a full export object with one new item
    const extra = { id: "de-drill-test-001", lang: "de", module: "drill", drillType: "substitution", family: "case.acc", instruction: "Test", cue: "Ich sehe den Hund. → (die Katze)", answer: "Ich sehe die Katze.", accepted: ["Ich sehe die Katze"], explain: "test", tags: [], difficulty: 1, speedTargetSec: 4, speakCue: false };
    document.getElementById("import-merge").checked = true;
    document.getElementById("import-text").value = JSON.stringify(Object.assign({}, obj, { content: [extra] }));
    document.getElementById("import-go").click();
    assert(S.content.length === before + 1 && O.byId("de-drill-test-001"), "merge did not add the new item: " + document.getElementById("import-msg").textContent);
    assert(S.progress["de-drill-test-001"] && S.progress["de-drill-test-001"].state === "new", "imported item lacks fresh progress");
    // bare array import with unknown family and chat-style id
    const bare = [{ id: "hu-drill-c20261105-01", lang: "hu", module: "drill", drillType: "response", family: "custom.family", instruction: "x", cue: "y", answer: "z" }];
    document.getElementById("import-text").value = JSON.stringify(bare);
    document.getElementById("import-go").click();
    assert(O.byId("hu-drill-c20261105-01"), "bare array import failed");
    assert(O.familyToCategory("custom.family", "hu") === "lex", "unknown family should map to lex");
    assert(O.familyToCategory("verb.separable", "de") === "prefix" && O.familyToCategory("prep.twoway", "de") === "case" && O.familyToCategory("plural", "hu") === "stem" && O.familyToCategory("plural", "de") === "gender" && O.familyToCategory("tekamolo", "de") === "order" && O.familyToCategory("konj2", "de") === "conj", "family prefix mapping wrong");
    assert(JSON.parse(storage.getItem("olc.content")).some(i => i.id === "de-drill-test-001"), "merged content not persisted");
    record("9 export and import", true, "export " + Math.round(txt.length / 1024) + " KB");
  } catch (e) { record("9 export and import", false, e.message); }

  /* extra: no page errors accumulated across the whole run, and every view renders */
  try {
    const O = window.OLC;
    ["mission", "drill", "decon", "wiretap", "legend", "content", "settings"].forEach(v => { O.show(v); });
    document.getElementById("decon-random").click();
    document.getElementById("decon-build-toggle").click();
    O.show("content"); document.querySelector("#cm-table tbody tr").click(); document.getElementById("cm-duplicate").click();
    O.show("legend"); document.getElementById("legend-add-fact").click(); document.getElementById("legend-save").click();
    document.querySelector("#scenario-list [data-scn]").click(); document.getElementById("legend-export").click();
    O.show("wiretap"); document.getElementById("wiretap-text").value = "Achtung, der Zug fährt heute von Gleis 3."; document.getElementById("wiretap-save").click();
    O.show("mission"); document.querySelector("[data-block-start='0']").click();
    assert(ctx.errors.length === 0, "page errors: " + ctx.errors.join(" | "));
    assert(O.state.wiretap.length === 1, "wiretap item not saved");
    record("extra: all views render and interact without errors", true);
  } catch (e) { record("extra: all views render and interact without errors", false, e.message); }

  /* summary */
  const passed = results.filter(r => r.ok && !r.skipped).length, skipped = results.filter(r => r.skipped).length, failed = results.filter(r => !r.ok).length;
  console.log("\n" + passed + " passed, " + failed + " failed, " + skipped + " skipped" + (ENGINES_PRESENT ? " (engines.js present)" : " (engines.js absent: tests 3, 4, 7, 8 skipped)"));
  console.log("console.html size: " + fs.statSync(path.join(APP, "console.html")).size + " bytes");
  try { window.close(); } catch (e) { /* ignore */ }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("test runner crashed:", e); process.exit(2); });
