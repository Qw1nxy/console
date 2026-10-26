# The Operative's Linguistic Console — build spec (MVP)

Single self-contained HTML file: `/home/claude/app/console.html`. Inline CSS, vanilla JS, NO external resources (no CDN, no fonts fetched, no images). Must run offline, open from file:// or https://, no console errors. No backend, no accounts, no keys. Target browsers: current Chrome/Edge/Safari/Firefox, desktop and phone.

## Artifact page contract (MANDATORY — the file is published as a claude.ai artifact)
- Author the file as a FRAGMENT: no `<!DOCTYPE>`, `<html>`, `<head>` or `<body>` tags. The host wraps it. Start the file with `<title>Operative's Linguistic Console</title>` then `<meta name="claude:viewport-fit-sides" content="cover">` then `<style>…</style>`, then the markup, then one `<script>` at the end (the seed JSON `<script type="application/json">` block may sit just before it).
- Theme tokens exactly in this shape (every token first defined on bare `:root`; dark values repeated in both dark blocks):
  `:root{--bg:…;--fg:…;…}` / `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){…;color-scheme:dark}}` / `:root[data-theme="dark"]{…;color-scheme:dark}` / `body{background:var(--bg);color:var(--fg)}`. No literal colors in component rules; use tokens only.
- Side gutter on the outer wrapper: `padding-left:max(16px, env(safe-area-inset-left,0px)); padding-right:max(16px, env(safe-area-inset-right,0px));` vertical padding via `padding-block`. No horizontal page scroll at 400px. Flex/grid children holding text get `min-width:0`. Tables inside `overflow-x:auto` containers.
- Sticky header (if any): `top: env(safe-area-inset-top,0px)`. Bottom tab bar on phone: `bottom:0; padding-bottom: env(safe-area-inset-bottom,0px)`.
- NEVER use `alert()`, `confirm()`, `prompt()` (they are inert in the viewer): build inline confirmations (a "Delete? [Yes][No]" row).
- NEVER rely on `<a download>` or script-triggered downloads (inert in the viewer). EXPORT = render the JSON into a read-only `<textarea>` plus a "Copy" button (`navigator.clipboard.writeText` inside the click handler, with fallback to selecting the textarea text). IMPORT = a `<textarea>` to paste JSON into AND a `<input type="file">` (FileReader works) — both feed the same import routine.
- `window.print()` is inert; no print buttons. No camera/microphone APIs in the MVP (stub text only). No iframes.
- Toggle visibility with `el.hidden = true/false`, not `style.display` (the host reset defines `[hidden]{display:none!important}`); include that reset rule in your own CSS too so the fragment also works standalone.
- Use `font-variant-numeric: tabular-nums` on timers and numbers. Respect `prefers-reduced-motion`. Visible focus states. Every form control has a stable `id`.
- Also write `/home/claude/app/build_standalone.js` (node) that wraps the fragment into a full standalone HTML document (`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>` + fragment + `</body></html>`) as `/home/claude/app/console_standalone.html`. The tests load the standalone file.

Content is seeded from the JSON files in `/home/claude/content/` (de_drills.json, hu_drills.json, de_decon.json, hu_decon.json, de_lexicon.json, hu_lexicon.json). Embed them in the HTML inside `<script id="seed-content" type="application/json">…</script>` and parse at startup. Keep the seed block clearly delimited with comments so content can be regenerated.

## Views (left sidebar on desktop, bottom tab bar on phone)
1. **Mission Control** (home)
2. **Drill Engine**
3. **Deconstructor**
4. **Wiretap** (stub)
5. **Legend** (stub)
6. **Content Manager**
7. **Settings** (can live inside Mission Control as a panel)

Keyboard: Alt+1…Alt+5 modules, Alt+C Content Manager. In drill: Enter = reveal then next; 1/2/3 = grade; Space = replay TTS; T = toggle typed-answer mode; Esc = end session. In deconstructor: Enter = parse; Ctrl+Enter = build.

## Storage (localStorage, namespace `olc.`)
- `olc.version` (number)
- `olc.content` — array of ALL content items (drills, decon examples) AND lexicon entries stored as items `{id, lang, module:"lexicon", kind:"noun"|"part"|"adjective"|"verb", ...fields}`. Seeded on first run (when key missing). After seeding the learner owns it.
- `olc.progress` — `{ [itemId]: {due, stability, difficulty, reps, lapses, lastGrade, lastSeen, state} }`
- `olc.sessions` — array `{id, date, lang, module, cues, correctInTime, correctLate, wrong, maxStreak, durationSec, byFamily:{family:{n,ok}}}`
- `olc.errors` — array `{id, date, lang, produced, correct, category, source, itemId, open:true, passes:[]}`
- `olc.legends`, `olc.scenarios`, `olc.wiretap` — arrays (stubs store/edit basic records)
- `olc.settings` — `{slots:{de:"15:15",hu:"19:00"}, planLength:45|90|150, gapMinutes:90, tts:{de:true,hu:true}, examDates:{de:"",hu:""}, startDate, lastSessionEnd:{de:ts,hu:ts}, personaSkippable:{de:bool,hu:bool}}`
Wrap every localStorage read/write in try/catch; if storage is unavailable, keep state in memory and show a one-line banner.

Export: one JSON document `{version, exportedAt, content, progress, sessions, errors, legends, scenarios, wiretap, settings}` rendered into a textarea with a Copy button (see contract — no downloads). Import: paste into a textarea OR choose a file (FileReader) → JSON → options: **Merge content by id** (default; adds new, overwrites same-id content, leaves progress) / **Replace all** (everything) / checkbox **import progress**. Also "Reset content to built-in" (re-seed content only; progress kept).

## Module 1 — Drill Engine (fully working)
Setup panel: language (DE/HU), source: `Due (SRS)` / `Heat set` / `Families` (multi-select chips showing counts) / `All`; length 20/30/40; toggle typed mode; Start.
Before the first cue: **Persona switch card** — language name, the filler words (DE: also, na ja, genau, halt, eben, tja, ähm; HU: hát, szóval, na, ugye, tehát, izé, ööö), a 60-second countdown, button "Begin" (enabled immediately if settings.personaSkippable[lang] else after countdown; default false; a Settings toggle sets it).
**Interference guard**: if settings.lastSessionEnd[otherLang] is within gapMinutes, show a block screen with remaining minutes and an "Override (logged)" button that appends an error-log line category `xfer`, produced "override", correct "wait", source "guard".
Queue building: due items first (progress.due ≤ now, state ≠ retired), then heat-set items (open error-derived items flagged `heat:true` in progress), then fresh (state new) by ascending difficulty; then interleave so no family occurs >3 times consecutively and every selected family appears in the first 10 when possible. Length truncates.
Cue screen: family chip, instruction, cue (large), TTS auto-plays if item.speakCue && settings.tts[lang] && a voice exists for the lang; else show a small badge "no <lang> voice on this device — read the cue". Timer counts up (mm:ss.t) with the target window shown; the timer turns amber when past target. Typed mode: input box; Enter submits → auto-grade by tolerant matching: lowercase, trim, collapse spaces, strip all punctuation `.,!?;:"'„“”‚‘’()–—-`, ß→ss, compare to answer and each accepted; in-time if elapsed ≤ speedTargetSec. Spoken mode: Enter reveals answer + explain; then keys 1/2/3 or on-screen buttons (big, bottom). After grading: show grade, streak; Enter/next.
FSRS update per grade (see below). Grade 3 → write error line {produced:"(miss)", correct:item.answer, category: familyToCategory(item.family), source:"drill", itemId}; and progress[item].heat = true. Grade 2 → if progress.lastGrade was also 2 → same as grade 3 (write line + heat) else just record.
End (after last item or Esc): **Summary** — score % (grade1/total), in-time % (grade1 count where elapsed ≤ target / total), correct-late count, wrong count, longest streak, duration, per-family table, misses list with checkbox "keep in heat set" (checked), and a **Bridge** box: three random cues' answers from this session with "say each one in a real sentence now". Save session record. Button "Back to Mission Control".
Heat set = items with progress.heat === true; cleared from heat after 2 consecutive grade-1 reviews.
Retire rule: a drill item is `retired` after two consecutive sessions in which its grade was 1 — approximate with: reps ≥ 2 and last two grades both 1 and stability ≥ 7 → state "retired" (still exportable; excluded from queues except `All`).

### FSRS-style scheduler (implement this; keep it in one function block)
Use FSRS v4 default weights w = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]. Ratings: Again=1, Hard=2, Good=3, Easy=4. Mapping from grades: grade 3 → Again; grade 2 → Hard; grade 1 → Good, or Easy when elapsed ≤ speedTargetSec/2.
- First review: S = w[r-1]; D = w[4] - (r-3)*w[5], clamp 1..10.
- Later: elapsedDays = (now - lastSeen)/day; R = (1 + elapsedDays/(9*S))^-1.
  - D' = D - w[6]*(r-3); D' = w[7]*(w[4]) + (1-w[7])*D' (mean reversion toward w[4]... simpler acceptable: D' = w[7]*w[4] + (1-w[7])*D'); clamp 1..10.
  - if r == Again: S' = w[11] * D'^(-w[12]) * ((S+1)^w[13] - 1) * exp(w[14]*(1-R)); lapses++.
  - else: hardPenalty = (r==Hard)? w[15] : 1; easyBonus = (r==Easy)? w[16] : 1; S' = S * (1 + exp(w[8]) * (11 - D') * S^(-w[9]) * (exp(w[10]*(1-R)) - 1) * hardPenalty * easyBonus).
- interval days = max(1, round(9*S'*(1/0.9 - 1))) → that equals round(S'). Use interval = max(1, round(S')) and for Again interval = 1 day (next day) but ALSO, since this is a drill app, an Again item stays in today's queue (re-asked at the end of the session).
- state: new → learning (S<1 day... treat: after first review state="learning"; when S ≥ 1 → "review").
- due = now + interval days. Store S, D, reps, lapses, lastGrade, lastSeen.

## Module 2 — Deconstructor (fully working)
UI: text input (word or short phrase), language auto-detect (chars ő ű or digraphs gy/ty/ny/sz/zs/cs → HU; ß ä ö ü with capitalised noun or words like der/die/das/dem/den/des/ein → DE; else default to last used) with a DE/HU toggle override; buttons Parse, Random example, Build; a list of preloaded examples as chips (filterable).
Result: morpheme chips in order (form large, role small, label below), then an explanation paragraph assembled from the chain; multiple analyses stacked with "Analysis 1 / 2".
Unknown word: card "Not in lexicon" + best-effort suffix strip (HU: peel known case suffixes/plural/possessive right-to-left using harmony-agnostic matching; DE: try compound split with unknown head, prefix/participle pattern) showing stem as `unknown`, and an inline form to add the stem to the lexicon (HU fields: base, gloss, harmony, obl, lv, acc, pl, sup, j3, ji; DE noun: base, gender, plural, gloss, parts; DE verb: inf, prefix, separable, stem, part2, part2stem, part2end). Saving re-parses.
Build (HU): choose stem (searchable select), toggles: plural; possessor (none/1sg/2sg/3sg/1pl/2pl/3pl); plural-possessed (checkbox, only with a possessor); case (none / ban-ben / ba-be / ból-ből / on-en-ön / ra-re / ról-ről / nál-nél / hoz-hez-höz / tól-től / t (acc) / nak-nek / val-vel / ig / ért / ként). Output word + morphemes + explanation. Enforce: plural and plural-possessed exclusive; accusative/superessive explicit forms used when no possessor/plural; etc.
Build (DE): choose noun, determiner type (definite / ein-word / none), case (nom/acc/dat/gen), number (sg/pl), optional adjective → phrase with endings and labels (e.g. "einem alten Mann": ein+em, alt+en, Mann). Use the standard tables: definite der/die/das; ein-words: ein, eine, ein / einen, eine, ein / einem, einer, einem / eines, einer, eines; plural ein-words: keine/keine/keinen/keiner (use "keine" for plural when det type ein-word). Adjective endings: weak: nom sg all -e; acc sg m -en, f/n -e; dat/gen all -en; pl all -en. Strong: m: er/en/em/en; f: e/e/er/er; n: es/es/em/en; pl: e/e/en/er. Mixed: nom m -er, nom/acc n -es, otherwise weak. Noun: dative plural +n unless plural ends in -n or -s; genitive m/n +s or +es (use lexicon `gen` if present, else: +es for monosyllables ending in s/ß/z/sch/st or one-syllable nouns? Keep simple: +es if noun ends in s, ß, x, z, tz, sch; else +s).

### Hungarian generator (port exactly from /home/claude/content/hu_generate.py which the content agent wrote — read it and port faithfully; then run a Node test comparing against every hu_decon.json example)
### German analysers
1. NP analyser: tokens = input split on spaces. Determiner table → candidate readings {case, gender, number, detType}. Final token: noun lookup (case-insensitive on base; also accept plural form, dative plural +n, genitive +s/+es). Middle tokens: adjective = lexicon adjective base + ending; ending must equal predicted ending for the reading. Output all consistent readings. Also support bare noun (just gender/plural info) and det + noun.
2. Compound: recursive split; parts = lexicon noun `parts` (lowercase) + lexicon `parts` entries + adjective bases; Fugen = ["", "s", "es", "n", "en", "er", "e", "ens"]; head must be a lexicon noun (match on base, case-insensitive); prefer fewest parts, then fewest Fugen. Also recognise plural forms as the whole input (e.g. "Männer" → Männ + er with umlaut note — use lexicon `pl` match: if input equals a noun's plural, split as stem + ending by common suffix detection: endings e, en, n, er, s, nen, else zero).
3. Verb: infinitive = (sep or insep prefix +) stem + "en"/"n"; participle: (sep prefix +) "ge" + part2stem + part2end, or insep prefix + part2stem + part2end; match against lexicon verbs' `inf` and `part2` first (exact), then split by the entry's fields. Also accept zu-infinitive "aufzustehen" = auf + zu + steh + en.
Explanations: templated sentences per role (e.g., "dem: dative, masculine/neuter singular — after 'mit', 'zu', 'helfen'…", "weak ending -en because the article already shows the case").

## Module 3 — Wiretap (stub)
A page with: the module description (2 sentences), the data model, a "Paste text to create an intercept item" textarea that saves `{id, lang, module:"wiretap", title, text, rung:1, key:{who:[],what:[],where:[],when:[],intent:[]}}` to olc.wiretap and lists existing items; note "timed reveal, scoring and audio arrive in the next build".

## Module 4 — Legend (stub)
A page with: legend editor per language (name, age, town, job; facts list with text/anchor/sentence; add/remove rows; saved to olc.legends), scenario card list (seeded: border check, landlord, job interview, police stop, doctor's office, consulate biography interview; each with city Berlin/Budapest, register, 5 seed questions in the target language — ONLY use the seed questions provided in /home/claude/app/SEED_SCENARIOS.json if it exists; otherwise keep the questions in English and say "questions to be written"), and an **Export for chat** button that copies a prompt block (legend + chosen scenario + rules: 15 questions random order, natural speed, follow-up probes, one deliberate misunderstanding, target language only, report faults) to the clipboard with a fallback textarea. Note "timer, fault counter and shadowing recorder arrive in the next build".

## Module 5 — Mission Control (working)
Today card: date; two language slots (times editable in Settings); plan length selector 45/90/150; block list per the doctrine table below with minutes and a Start button per block that navigates (Phonology → opens Drill Engine with families filtered to tags "phonology" if any, else shows a card with P-11 steps and a timer; Drills → Drill Engine setup with language preset; Input → a timer card with "open your input source" and the P-4 log fields (source, minutes, new chunks → stored in session record module:"input"); Gisting → Wiretap stub with timer; Shadowing/Legend → Legend stub with timer; Review → Drill Engine with source Due+Heat; Writing (150 only) → timer card). Each block has its own countdown timer; when it ends, a sound-free visual flash and "log line" prompt.
Block minutes: 45-plan: 5/12/10/8/7/3; 90-plan: 8/20/20/15/15/12; 150-plan: 10/30/35/20/30/15/10 (writing).
Panels: Due counts per language (SRS due, heat, open errors); Weekly totals (minutes from sessions, cues, score, in-time %); Milestones table (ILR 0+/1/1+/2 × DE/HU with a date input "passed on"); Burn book (list with filters by lang/category, add-line form with the 15 categories: mouth, ear, case, gender, adj, order, conj, coverb, prefix, harmony, stem, lex, xfer, legend, spell; buttons: "Add to drills" (creates a drill item: lang, drillType "substitution", family mapped from category, instruction "Produce the correct form.", cue = produced-with-note, answer = correct; progress due now, heat true), "Retire"); Category histogram (this month, simple CSS bars); Settings panel (slots, gapMinutes, tts toggles, personaSkippable, exam dates, export/import/reset buttons).
Banner: if examDates.de within 56 days → "Ratio shift: 70/30 German"; if examDates.hu within 42 days → "70/30 Hungarian".

## Additional rules (added after the builder/sessions skills were reviewed — implement all)
- Import accepts EITHER the full export object OR a bare JSON array of content items (drills / decon / lexicon entries written in chat, e.g. ids like `de-drill-c20261105-01`), merging by id. Items without `srs` get a fresh progress record. Unknown `family` strings are allowed (they become their own group in the family chips); the burn-book category is derived from the family PREFIX: case.* → case; order.* → order; coverb.* → coverb; conj.* → conj; adj.* → adj; harmony.* → harmony; stem.* → stem; verb.separable/verb.inseparable → prefix; verb.* (other) → conj; gender.* → gender; prep.* → case; tekamolo → order; konj2 → conj; focus.* → order; numeral.* → lex; plural → stem (hu) / gender (de); anything else → lex.
- Export: textarea + Copy button (always works) AND a "Download JSON" button (`<a download>` built from a Blob; works in the standalone/local file; harmless if inert in the artifact viewer). Put a one-line note under it: "If download does nothing here, use Copy."
- Session summary: for any family scoring under 70% in the session, show a "Open the deconstructor explanation for this family" link that jumps to the Deconstructor with a matching preloaded example (by tag/family prefix) selected.
- Persona switch card is unskippable during a language's first 14 days (settings.firstSessionDate[lang], set at that language's first session); afterwards skippable via Settings toggle (default: skippable after day 14).
- Burn-book health: show a banner when a language has > 40 open lines ("Intake is outrunning consolidation: halve vocabulary intake (P-4) for two weeks") and a softer note when any open line is older than 30 days.
- Interference gap configurable 60–180 min in Settings.
- Phone test width is 380 px (not 400): no horizontal scroll, controls reachable.
- Versioning: write `olc.version = 1`; on load, if a stored version is lower than the app's, run a (currently empty) migration function and bump — never wipe progress or content.

## Content Manager
Table/list of items filtered by lang/module/search; click → edit form with every field (arrays as comma-separated or one-per-line); Save validates (required fields, unique id), Duplicate, Delete (confirm), Add new (module-specific form). Lexicon entries editable too; Hungarian lexicon save runs the generator and warns when acc/pl/sup typed differ from what the generator's base rules would produce ONLY for regular stems (just warn, never block). Import/Export buttons (same as Settings).

## TTS
`window.speechSynthesis`; on load and on `voiceschanged`, collect voices; pick `de-DE` (fallback any `de`), `hu-HU` (fallback any `hu`). Badge per language in Settings: voice name or "none". Speak with rate 0.95. Never throw if speechSynthesis missing.

## Design (load the `artifact-design` and `frontend-design` skills first and follow them)
Dark "operations console" look is fine but readable: high contrast, monospace only for cues/morphemes, a sans for everything else (system font stack — no font fetch). Colors as CSS variables on :root with a light theme under prefers-color-scheme: light. 16px side gutter on phone, no horizontal scroll. Grade buttons ≥ 48px tall on phone. Timer legible from a metre away (large).

## Acceptance tests (write /home/claude/app/test_console.js, run with `node test_console.js` — jsdom is already installed in /home/claude/app/node_modules)
1. Load the standalone HTML in jsdom (runScripts "dangerously", a localStorage mock if jsdom's is unavailable); no uncaught errors and nothing written to console.error; with speechSynthesis absent → app still boots and shows the text-fallback badge.
2. Seed loads: counts — DE drills ≥ 45, HU drills ≥ 45, DE decon ≥ 28, HU decon ≥ 28; lexicon counts.
3. Deconstructor: for EVERY decon example (both languages) call the parser and assert that at least one analysis's morpheme forms equal the example's forms in order (for tokens layout: per token). Report per-example failures.
4. Unknown word ("kutyákról" is known; test "zsiráfokban" and "Donaudampfschifffahrt" as unknown) → returns not-in-lexicon result without throwing.
5. Drill flow: start a session (DE, families all, 5 cues, typed mode); submit a correct answer within time → grade 1; submit a wrong one → grade 3 → error line written; end → session saved; progress updated with due dates in the future; heat set contains the missed item.
6. Persistence: re-create the DOM from the same HTML with the same localStorage mock → sessions and progress still there.
7. Hungarian build: build(ház, {possessor:"1sg", pluralPossessed:true, case:"ban"}) === "házaimban" with 5 morphemes; build(kert, {possessor:"3sg", case:"val"}) === "kertjével"; build(könyv, {plural:true, case:"on"}) === "könyveken"; build(ló, {case:"t"}) === "lovat"; build(kutya, {case:"ban"}) === "kutyában".
8. German build: build(Mann, definite, dat, sg, alt) === "dem alten Mann"; build(Haus, ein, nom, sg, alt) === "ein altes Haus"; build(Wein, none, nom, sg, gut) === "guter Wein"; build(Mann, definite, dat, pl, alt) === "den alten Männern".
9. Export → JSON parses and contains all keys; import merge adds a new item.
All tests must pass before the file is declared done. Print a summary.
