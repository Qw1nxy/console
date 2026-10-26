#!/usr/bin/env node
/* test_engines.js — contract tests for engines.js (ENGINE_API.md "Test contract").
   Run: node test_engines.js   → PASS/FAIL per group, summary, exit 1 on any failure. */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require(path.join(__dirname, "engines.js"));

const CONTENT = "/home/claude/content";
const read = (f) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), "utf8"));
const huLex = read("hu_lexicon.json");
const deLex = read("de_lexicon.json");
const huDecon = read("hu_decon.json");
const deDecon = read("de_decon.json");

let failures = 0, total = 0;
const groups = [];
function group(name) { const g = { name, pass: 0, fail: 0, notes: [] }; groups.push(g); return g; }
function check(g, ok, note) {
  total++;
  if (ok) g.pass++; else { g.fail++; failures++; g.notes.push(note); }
}
const seq = (ms, key) => ms.map((m) => m[key]).join(" + ");
const flat = (a) => (a.tokens ? a.tokens.flatMap((t) => t.morphemes) : a.morphemes || []);
const show = (a) => (a.tokens ? a.tokens.map((t) => t.morphemes.map((m) => m.form + ":" + m.role).join("+")).join(" || ") : (a.morphemes || []).map((m) => m.form + ":" + m.role).join("+"));

// ── 1. Hungarian decon examples ──────────────────────────────────────────────
{
  const g = group("hu_decon parse (forms AND roles match)");
  for (const ex of huDecon) {
    const wantF = seq(ex.morphemes, "form"), wantR = seq(ex.morphemes, "role");
    let analyses = [];
    try { analyses = E.hu.parse(ex.word, huLex); } catch (e) { check(g, false, `${ex.id} ${ex.word}: threw ${e.message}`); continue; }
    const hit = analyses.find((a) => seq(a.morphemes, "form") === wantF && seq(a.morphemes, "role") === wantR);
    check(g, !!hit, `${ex.id} ${ex.word}: want ${ex.morphemes.map((m) => m.form + ":" + m.role).join("+")} got [${analyses.map(show).join(" | ")}]`);
    if (hit) {
      check(g, hit.morphemes.map((m) => m.form).join("") === ex.word, `${ex.id}: forms do not concatenate to the word`);
      check(g, typeof hit.explain === "string" && hit.explain.length > 20 && hit.confidence === 1 && hit.lang === "hu" && hit.kind === "noun", `${ex.id}: explain/confidence/lang/kind`);
      check(g, hit.morphemes.every((m) => m.label && m.label.length), `${ex.id}: empty label`);
    }
  }
}

// ── 2. German decon examples ─────────────────────────────────────────────────
{
  const g = group("de_decon parse (forms AND roles match, per token)");
  for (const ex of deDecon) {
    let analyses = [];
    try { analyses = E.de.parse(ex.word, deLex); } catch (e) { check(g, false, `${ex.id} ${ex.word}: threw ${e.message}`); continue; }
    let hit;
    if (ex.tokens) {
      const want = ex.tokens.map((t) => t.morphemes.map((m) => m.form + "/" + m.role).join("+")).join(" ");
      hit = analyses.find((a) => a.tokens && a.tokens.map((t) => t.morphemes.map((m) => m.form + "/" + m.role).join("+")).join(" ") === want);
    } else {
      const wantF = seq(ex.morphemes, "form"), wantR = seq(ex.morphemes, "role");
      hit = analyses.find((a) => a.morphemes && seq(a.morphemes, "form") === wantF && seq(a.morphemes, "role") === wantR);
    }
    check(g, !!hit, `${ex.id} ${ex.word}: got [${analyses.map(show).join(" | ")}]`);
    if (hit) {
      const rebuilt = hit.tokens ? hit.tokens.map((t) => t.morphemes.map((m) => m.form).join("")).join(" ") : hit.morphemes.map((m) => m.form).join("");
      check(g, rebuilt === ex.word, `${ex.id}: forms do not concatenate to the word (${rebuilt})`);
      check(g, typeof hit.explain === "string" && hit.explain.length > 20 && hit.confidence === 1 && hit.lang === "de", `${ex.id}: explain/confidence/lang`);
      check(g, flat(hit).every((m) => m.label && m.label.length), `${ex.id}: empty label`);
    }
  }
}

// ── 3. Hungarian build (APP_SPEC §7) ─────────────────────────────────────────
{
  const g = group("hu.build (APP_SPEC acceptance 7 + API edge cases)");
  const entry = (b) => huLex.find((e) => e.base === b);
  const b = (base, opts) => E.hu.build(entry(base), opts);
  let r = b("ház", { possessor: "1sg", pluralPossessed: true, case: "ban" });
  check(g, r.word === "házaimban", `házaimban: got ${JSON.stringify(r)}`);
  check(g, r.morphemes && r.morphemes.length === 5, `házaimban: expected 5 morphemes, got ${r.morphemes && r.morphemes.length}`);
  check(g, r.morphemes && seq(r.morphemes, "role") === "stem + link + poss-pl + poss + case", `házaimban roles: ${r.morphemes && seq(r.morphemes, "role")}`);
  r = b("kert", { possessor: "3sg", case: "val" }); check(g, r.word === "kertjével", `kertjével: ${r.word || r.error}`);
  r = b("könyv", { plural: true, case: "on" }); check(g, r.word === "könyveken", `könyveken: ${r.word || r.error}`);
  r = b("ló", { case: "t" }); check(g, r.word === "lovat", `lovat: ${r.word || r.error}`);
  r = b("kutya", { case: "ban" }); check(g, r.word === "kutyában", `kutyában: ${r.word || r.error}`);
  // ENGINE_API extra cases
  const cases = [
    ["ház", { plural: true, case: "t" }, "házakat"], ["kert", { plural: true, case: "t" }, "kerteket"], ["könyv", { plural: true, case: "t" }, "könyveket"],
    ["ház", { possessor: "1sg", case: "t" }, "házamat"], ["kert", { possessor: "3sg", case: "t" }, "kertjét"], ["ház", { possessor: "1sg", pluralPossessed: true, case: "t" }, "házaimat"],
    ["ház", { possessor: "3sg", case: "on" }, "házán"], ["kert", { possessor: "1pl", case: "on" }, "kertünkön"], ["kert", { possessor: "1pl", case: "hoz" }, "kertünkhöz"],
    ["ház", { case: "val" }, "házzal"], ["kert", { case: "val" }, "kerttel"], ["busz", { case: "val" }, "busszal"], ["hegy", { case: "val" }, "heggyel"],
    ["autó", { possessor: "1pl", case: "val" }, "autónkkal"], ["kutya", { case: "t" }, "kutyát"], ["kutya", { plural: true }, "kutyák"], ["kutya", { possessor: "3sg" }, "kutyája"],
    ["ház", { case: "on" }, "házon"], ["ház", { case: "hoz" }, "házhoz"], ["könyv", { case: "hoz" }, "könyvhöz"], ["könyv", { possessor: "2pl" }, "könyvetek"],
    ["út", { case: "t" }, "utat"], ["út", { possessor: "3sg" }, "útja"], ["ház", {}, "ház"], ["ház", { case: "ig" }, "házig"], ["ház", { case: "ként" }, "házként"],
    ["sör", { plural: true, case: "t" }, "söröket"], ["kéz", { case: "t" }, "kezet"], ["ló", { case: "val" }, "lóval"]
  ];
  for (const [base, opts, want] of cases) {
    if (!entry(base)) { check(g, false, `${base}: not in lexicon`); continue; }
    r = b(base, opts);
    check(g, r.word === want, `${want}: got ${r.word || r.error}`);
    if (r.word) check(g, r.morphemes.map((m) => m.form).join("") === r.word && r.explain.length > 20, `${want}: morphemes/explain`);
  }
  r = b("ház", { plural: true, possessor: "1sg", pluralPossessed: true });
  check(g, !!r.error, "plural + pluralPossessed must return an error");
  r = b("ház", { pluralPossessed: true });
  check(g, !!r.error, "pluralPossessed without possessor must return an error");
  // every build result must round-trip through parse
  let rt = 0, rtBad = [];
  for (const [base, opts, want] of cases) {
    const built = b(base, opts);
    if (!built.word) continue;
    const back = E.hu.parse(built.word, huLex);
    const ok = back.some((a) => seq(a.morphemes, "form") === seq(built.morphemes, "form") && seq(a.morphemes, "role") === seq(built.morphemes, "role"));
    if (ok) rt++; else rtBad.push(want);
  }
  check(g, rtBad.length === 0, `build→parse round trip failed for ${rtBad.join(", ")}`);
}

// ── 4. Hungarian generateForms ───────────────────────────────────────────────
{
  const g = group("hu.generateForms");
  const haz = huLex.find((e) => e.base === "ház");
  const m = E.hu.generateForms(haz);
  check(g, m instanceof Map && m.size > 100, `ház paradigm size ${m.size}`);
  for (const w of ["ház", "házat", "házak", "házon", "házzal", "házaimban", "házunkhoz", "házatokat", "házaikról"]) check(g, m.has(w), `ház paradigm lacks ${w}`);
  const v = m.get("házaimban");
  check(g, v && Array.isArray(v.morphemes) && v.chain && v.chain.possessor === "1SG" && v.chain.pluralPossessed && v.chain.case === "ine", "házaimban chain");
  for (const [k, val] of m) check(g, val.morphemes.map((x) => x.form).join("") === k, `generateForms key ≠ concat for ${k}`);
  // every entry's explicit forms are generated
  for (const e of huLex) {
    const f = E.hu.generateForms(e);
    for (const key of ["acc", "pl", "sup"]) check(g, f.has(e[key]), `${e.base}: explicit ${key} ${e[key]} not generated`);
  }
  // parse is sorted by morpheme count and empty for nonsense
  const p = E.hu.parse("házak", huLex);
  check(g, p.length >= 1 && p.every((a, i) => i === 0 || a.morphemes.length >= p[i - 1].morphemes.length), "parse sort order");
  check(g, E.hu.parse("", huLex).length === 0 && E.hu.parse("qqqq", huLex).length === 0, "parse empty / nonsense → []");
  check(g, E.hu.parse("  Házak  ", huLex).length >= 1, "parse is case-insensitive and trims");
}

// ── 5. German build (APP_SPEC §8) ────────────────────────────────────────────
{
  const g = group("de.build (APP_SPEC acceptance 8 + tables)");
  const noun = (b) => deLex.nouns.find((n) => n.base === b);
  const adj = (b) => deLex.adjectives.find((a) => a.base === b);
  const b = (n, det, cas, num, a) => E.de.build({ noun: noun(n), det, case: cas, number: num, adjective: a ? adj(a) : undefined });
  let r = b("Mann", "definite", "dat", "sg", "alt");
  check(g, r.word === "dem alten Mann", `dem alten Mann: ${r.word}`);
  check(g, r.tokens && r.tokens.length === 3 && r.tokens[1].morphemes.map((m) => m.form + ":" + m.role).join("+") === "alt:adj-stem+en:adj-end", "dem alten Mann tokens");
  r = b("Haus", "ein", "nom", "sg", "alt"); check(g, r.word === "ein altes Haus", `ein altes Haus: ${r.word}`);
  r = b("Wein", "none", "nom", "sg", "gut");
  if (!noun("Wein") || !adj("gut")) {
    // §8 names Wein/gut; the lexicon may not carry them — fall back to an equivalent masculine case
    r = E.de.build({ noun: { base: "Wein", gender: "m", pl: "Weine", gloss: "wine", parts: ["wein"] }, det: "none", case: "nom", number: "sg", adjective: { base: "gut", gloss: "good" } });
    g.notes.push("note: Wein/gut not in de_lexicon.json — tested with ad-hoc entries");
  }
  check(g, r.word === "guter Wein", `guter Wein: ${r.word}`);
  r = b("Mann", "definite", "dat", "pl", "alt"); check(g, r.word === "den alten Männern", `den alten Männern: ${r.word}`);
  const cases = [
    ["Mann", "definite", "nom", "sg", "alt", "der alte Mann"], ["Mann", "definite", "acc", "sg", "alt", "den alten Mann"], ["Mann", "definite", "gen", "sg", "alt", "des alten Mannes"],
    ["Frau", "definite", "dat", "sg", null, null], ["Schicht", "definite", "gen", "sg", "lang", "der langen Schicht"], ["Büro", "definite", "nom", "sg", "klein", "das kleine Büro"],
    ["Mann", "ein", "nom", "sg", "alt", "ein alter Mann"], ["Mann", "ein", "acc", "sg", "alt", "einen alten Mann"], ["Mann", "ein", "dat", "sg", "alt", "einem alten Mann"],
    ["Werkzeug", "ein", "acc", "sg", "neu", "ein neues Werkzeug"], ["Wohnung", "ein", "acc", "sg", "günstig", "eine günstige Wohnung"], ["Chefin", "ein", "dat", "sg", "neu", "einer neuen Chefin"],
    ["Mann", "ein", "nom", "pl", "alt", "keine alten Männer"], ["Mann", "ein", "dat", "pl", "alt", "keinen alten Männern"], ["Mann", "ein", "gen", "pl", "alt", "keiner alten Männer"],
    ["Schuh", "none", "acc", "pl", "sicher", "sichere Schuhe"], ["Kollege", "none", "dat", "pl", "nett", "netten Kollegen"], ["Werkzeug", "none", "nom", "sg", "neu", "neues Werkzeug"],
    ["Werkzeug", "none", "dat", "sg", "neu", "neuem Werkzeug"], ["Werkzeug", "none", "gen", "sg", "neu", "neuen Werkzeugs"], ["Schicht", "none", "dat", "sg", "lang", "langer Schicht"],
    ["Haus", "definite", "gen", "sg", null, "des Hauses"], ["Platz", "definite", "gen", "sg", null, "des Platzes"], ["Bus", "definite", "gen", "sg", null, "des Busses"],
    ["Chef", "definite", "dat", "pl", null, "den Chefs"], ["Maschine", "definite", "dat", "pl", null, "den Maschinen"], ["Kollege", "definite", "dat", "pl", "neu", "den neuen Kollegen"],
    ["Titel", "definite", "nom", "pl", null, "die Titel"], ["Titel", "definite", "dat", "pl", null, "den Titeln"]
  ];
  for (const [n, det, cas, num, a, want] of cases) {
    if (!noun(n) || (a && !adj(a))) { if (want) check(g, false, `${want}: lexicon lacks ${n}/${a}`); continue; }
    r = b(n, det, cas, num, a);
    check(g, r.word === want, `${want}: got ${r.word}`);
    check(g, r.tokens.map((t) => t.morphemes.map((m) => m.form).join("")).join(" ") === r.word && r.explain.length > 20, `${want}: tokens/explain`);
    // every built phrase with a determiner or adjective must parse back to the same reading
    if (det !== "none" || a) {
      const back = E.de.parse(r.word, deLex);
      const same = back.some((x) => x.tokens && x.tokens.map((t) => t.morphemes.map((m) => m.form + "/" + m.role).join("+")).join(" ") === r.tokens.map((t) => t.morphemes.map((m) => m.form + "/" + m.role).join("+")).join(" ") && x.reading.case === cas);
      check(g, same, `${want}: build→parse round trip (got ${back.map(show).join(" | ")})`);
    }
  }
  r = E.de.build({ noun: null }); check(g, r && typeof r.word === "string" && r.tokens, "build without noun does not throw");
}

// ── 6. German parse details ──────────────────────────────────────────────────
{
  const g = group("de.parse readings, determiner table, case-insensitivity");
  const readings = (w) => E.de.parse(w, deLex).filter((a) => a.kind === "np").map((a) => a.reading.case).sort().join(",");
  check(g, readings("die Schicht") === "acc,nom", `die Schicht → nom+acc, got ${readings("die Schicht")}`);
  check(g, readings("der Schicht") === "dat,gen", `der Schicht → dat+gen, got ${readings("der Schicht")}`);
  check(g, readings("das Büro") === "acc,nom", `das Büro → nom+acc`);
  check(g, readings("dem Büro") === "dat", `dem Büro → dat`);
  check(g, readings("des Büros") === "gen", `des Büros → gen, got ${readings("des Büros")}`);
  check(g, readings("des Hauses") === "gen", `des Hauses → gen, got ${readings("des Hauses")}`);
  check(g, readings("den Männern") === "dat", `den Männern → dat pl, got ${readings("den Männern")}`);
  check(g, readings("der Männer") === "gen", `der Männer → gen pl, got ${readings("der Männer")}`);
  check(g, readings("die Männer") === "acc,nom", `die Männer → nom/acc pl`);
  check(g, readings("eure Schuhe") === "acc,nom", `eure Schuhe (euer → eur-), got ${readings("eure Schuhe")}`);
  check(g, readings("eurem Mann") === "dat", `eurem Mann → dat`);
  check(g, readings("unserem Chef") === "dat", `unserem Chef → dat`);
  check(g, readings("dieser Mann") === "nom", `dieser Mann → nom, got ${readings("dieser Mann")}`);
  check(g, readings("dieser Schicht") === "dat,gen", `dieser Schicht → dat/gen`);
  check(g, readings("jedem Mann") === "dat", `jedem Mann → dat`);
  check(g, readings("diese neuen Maschinen") === "acc,nom", `diese neuen Maschinen (weak after der-word), got ${readings("diese neuen Maschinen")}`);
  check(g, readings("ihrem alten Mann") === "dat", `ihrem alten Mann → dat`);
  check(g, readings("seinen alten Mann") === "acc", `seinen alten Mann → acc`);
  check(g, readings("den alten Mann") === "acc", `den alten Mann → acc only`);
  check(g, readings("den alte Mann") === "", `den alte Mann → rejected (wrong weak ending)`);
  check(g, readings("ein alte Mann") === "", `ein alte Mann → rejected (mixed needs -er)`);
  check(g, readings("eine alte Schicht") === "acc,nom", `eine alte Schicht`);
  check(g, readings("keiner alten Männer") === "gen", `keiner alten Männer → gen pl`);
  check(g, readings("teure Schuhe") === "acc,nom", `teure Schuhe (e-elision teuer → teur-), got ${readings("teure Schuhe")}`);
  // case-insensitive noun matching, spelling preserved
  const kh = E.de.parse("krankenhaus", deLex).find((a) => a.kind === "compound");
  check(g, kh && kh.morphemes.map((m) => m.form).join("") === "krankenhaus", "krankenhaus parses, keeps lowercase spelling");
  const kv = E.de.parse("Krankenversicherungskarte", deLex).filter((a) => a.kind === "compound");
  check(g, kv.length && kv[0].morphemes.length === 4, `preferred compound split has fewest parts/Fugen: ${kv[0] && show(kv[0])}`);
  const zero = E.de.parse("Titel", deLex).find((a) => a.kind === "plural");
  check(g, zero && zero.morphemes.length === 1 && zero.morphemes[0].role === "noun" && /zero plural/.test(zero.morphemes[0].label), "zero-ending plural → one noun morpheme labelled zero plural");
  const um = E.de.parse("Häuser", deLex).find((a) => a.kind === "plural");
  check(g, um && um.morphemes[0].form === "Häus" && /umlaut/.test(um.morphemes[0].label), "Häuser → Häus + er with umlaut note");
  const zu = E.de.parse("aufzustehen", deLex).find((a) => a.kind === "verb");
  check(g, zu && zu.morphemes.map((m) => m.form).join("+") === "auf+zu+steh+en", `aufzustehen: ${zu && show(zu)}`);
  const inf = E.de.parse("machen", deLex).find((a) => a.kind === "verb");
  check(g, inf && show(inf) === "mach:verb-stem+en:inf-end", `machen: ${inf && show(inf)}`);
  const gem = E.de.parse("gemacht", deLex).find((a) => a.kind === "verb");
  check(g, gem && show(gem) === "ge:ge+mach:verb-stem+t:part-end", `gemacht: ${gem && show(gem)}`);
  const bek = E.de.parse("bekommen", deLex).filter((a) => a.kind === "verb");
  check(g, bek.length === 2, `bekommen → infinitive and participle (${bek.length})`);
  const bare = E.de.parse("Mann", deLex).find((a) => a.kind === "noun");
  check(g, bare && bare.morphemes.length === 1, "bare noun Mann");
}

// ── 7. Unknown words never throw ─────────────────────────────────────────────
{
  const g = group("unknown words (no throw, unknown flag)");
  const tryHu = (w) => { try { const p = E.hu.parse(w, huLex); const u = E.hu.guessUnknown(w, huLex); return { p, u }; } catch (e) { return { err: e }; } };
  const tryDe = (w) => { try { const p = E.de.parse(w, deLex); const u = E.de.guessUnknown(w, deLex); return { p, u }; } catch (e) { return { err: e }; } };
  let r = tryHu("zsiráfokban");
  check(g, !r.err && r.p.length === 0 && r.u.unknown === true && r.u.confidence === 0.3, `zsiráfokban: ${r.err ? r.err.message : JSON.stringify(r.u)}`);
  check(g, !r.err && r.u.morphemes.map((m) => m.form).join("") === "zsiráfokban" && r.u.morphemes[0].role === "stem" && r.u.morphemes[0].label === "unknown stem", `zsiráfokban split: ${r.u && show(r.u)}`);
  check(g, !r.err && show(r.u) === "zsiráf:stem+o:link+k:pl+ban:case", `zsiráfokban peel: ${r.u && show(r.u)}`);
  r = tryDe("Donaudampfschifffahrt");
  check(g, !r.err && r.p.length === 0 && r.u.unknown === true && r.u.morphemes.map((m) => m.form).join("") === "Donaudampfschifffahrt", `Donaudampfschifffahrt: ${r.err ? r.err.message : show(r.u)}`);
  r = tryDe("xyzzy"); check(g, !r.err && r.p.length === 0 && r.u.unknown, `xyzzy de: ${r.err && r.err.message}`);
  r = tryHu("xyzzy"); check(g, !r.err && r.p.length === 0 && r.u.unknown, `xyzzy hu: ${r.err && r.err.message}`);
  for (const w of ["", "   ", "a", "Ä", "der", "ge", "zu", "sz", "házak házak", "123", "zsiráf", "t", "n", "kutyákról"]) {
    const a = tryHu(w), b = tryDe(w);
    check(g, !a.err && !b.err, `"${w}" threw: ${(a.err || b.err) && (a.err || b.err).message}`);
  }
  check(g, E.hu.parse("kutyákról", huLex).length >= 1, "kutyákról is known");
  const dg = E.de.guessUnknown("abgewaschen", deLex);
  check(g, show(dg) === "ab:sep-prefix+ge:ge+wasch:verb-stem+en:part-end", `abgewaschen heuristic: ${show(dg)}`);
  const dc = E.de.guessUnknown("Arbeitsmarkt", deLex);
  check(g, show(dc) === "Arbeit:part+s:fuge+markt:noun", `unknown-head compound: ${show(dc)}`);
  const dc2 = E.de.guessUnknown("Donauhaus", deLex);
  check(g, dc2.morphemes[dc2.morphemes.length - 1].form === "haus" && dc2.morphemes[0].label === "unknown first part", `unknown-first-part compound: ${show(dc2)}`);
  check(g, E.de.parse("des Mannes", deLex).some((a) => a.kind === "np" && a.reading.case === "gen"), "des Mannes also parses as genitive");
  // malformed lexica
  let ok = true;
  try { E.hu.parse("ház", [{ base: "x" }, null, {}]); E.de.parse("Mann", {}); E.de.parse("Mann", null); E.hu.parse("ház", null); E.hu.build(null, {}); E.hu.generateForms(null); } catch (e) { ok = false; g.notes.push("malformed lexicon threw: " + e.message); }
  check(g, ok, "malformed lexicon input does not throw");
}

// ── 8. detectLang ────────────────────────────────────────────────────────────
{
  const g = group("detectLang");
  const cases = [["házaimban", "hu"], ["Krankenversicherungskarte", "de"], ["dem alten Mann", "de"], ["die Frau", "de"], ["gyümölcs", "hu"], ["Straße", "de"], ["Ausbildungszentrum", "de"], ["Werkzeugkasten", "de"], ["gyümölcsöt", "hu"], ["asztalon", "hu"], ["kertben", "hu"], ["ein Haus", "de"], ["", null], ["xyzzy", null], ["aufgestanden", null], ["kutyákról", "hu"]];
  for (const [t, want] of cases) {
    let got; try { got = E.detectLang(t); } catch (e) { got = "THREW " + e.message; }
    // "aufgestanden" has no German-only signal; null or "de" both acceptable
    const ok = want === null && t === "aufgestanden" ? got === null || got === "de" : got === want;
    check(g, ok, `detectLang(${JSON.stringify(t)}) = ${got}, want ${want}`);
  }
}

// ── 9. Module shape ──────────────────────────────────────────────────────────
{
  const g = group("module shape (ENGINE_API)");
  check(g, E.version === "1", "version");
  for (const k of ["generateForms", "parse", "build", "guessUnknown"]) check(g, typeof E.hu[k] === "function", `hu.${k}`);
  for (const k of ["parse", "build", "guessUnknown"]) check(g, typeof E.de[k] === "function", `de.${k}`);
  const src = fs.readFileSync(path.join(__dirname, "engines.js"), "utf8");
  check(g, /^const OLC_ENGINES = /m.test(src), "defines const OLC_ENGINES");
  check(g, src.includes('if (typeof window !== "undefined") window.OLC_ENGINES = OLC_ENGINES;'), "window tail");
  check(g, src.trimEnd().endsWith('if (typeof module !== "undefined") module.exports = OLC_ENGINES;'), "module.exports tail");
  check(g, !/\b(localStorage|document\.|require\(|import )/.test(src), "no DOM / storage / imports");
  const ROLES = new Set(["stem", "link", "pl", "poss", "poss-pl", "case", "det", "adj-stem", "adj-end", "noun", "part", "fuge", "sep-prefix", "insep-prefix", "ge", "verb-stem", "inf-end", "part-end", "pl-end", "zu"]);
  let badRole = null;
  for (const ex of huDecon.concat(deDecon)) for (const a of (ex.lang === "hu" ? E.hu.parse(ex.word, huLex) : E.de.parse(ex.word, deLex))) for (const m of flat(a)) if (!ROLES.has(m.role)) badRole = m.role;
  check(g, badRole === null, `unexpected role ${badRole}`);
}

// ── report ───────────────────────────────────────────────────────────────────
for (const g of groups) {
  console.log(`${g.fail ? "FAIL" : "PASS"}  ${g.name}  (${g.pass}/${g.pass + g.fail})`);
  for (const n of g.notes) console.log("      - " + n);
}
console.log(`\n${failures ? "FAILED" : "ALL PASSED"}: ${total - failures}/${total} checks, ${huDecon.length} hu + ${deDecon.length} de decon examples`);
process.exit(failures ? 1 : 0);
