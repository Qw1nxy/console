# Engine API — the contract between `engines.js` (parsers/generators) and `console.html` (UI)

`engines.js` is plain browser JavaScript (no imports/exports, no Node APIs) that, when evaluated, defines a single global:

```js
window.OLC_ENGINES = { hu, de, detectLang, version: "1" };
```

It must also work in Node for tests: end the file with
```js
if (typeof module !== "undefined") module.exports = OLC_ENGINES;
```
and define `OLC_ENGINES` as a `const` first, then `if (typeof window !== "undefined") window.OLC_ENGINES = OLC_ENGINES;`.

All functions are pure: they take the lexicon as an argument and never touch localStorage or the DOM.

## Shared types
```ts
type Morpheme = { form: string; role: string; label: string };
type Analysis = {
  lang: "hu" | "de";
  word: string;                 // the input, normalised (trimmed, single spaces)
  kind: string;                 // hu: "noun"; de: "np" | "compound" | "verb" | "noun" | "plural"
  morphemes?: Morpheme[];       // single-word analyses
  tokens?: { morphemes: Morpheme[] }[];  // multi-token (German NP) analyses
  explain: string;              // 1–4 sentences, plain English, naming the harmony class / case / pattern
  entry?: object;               // the lexicon entry of the stem/head
  confidence: number;           // 1 = lexicon-backed; 0.3 = heuristic guess (unknown stem)
  unknown?: boolean;            // true for guessUnknown output
};
```
Roles are exactly those in /home/claude/content/SCHEMA.md (hu: stem, link, pl, poss, poss-pl, case; de: det, adj-stem, adj-end, noun, part, fuge, sep-prefix, insep-prefix, ge, verb-stem, inf-end, part-end, pl-end).

## Hungarian
```ts
hu.generateForms(entry): Map<string, { morphemes: Morpheme[]; chain: Chain }>
// every surface form the generator can build from one lexicon entry (base, pl, acc, sup, possessives,
// plural-possessed, each of those + each case, pl + each case). Key = surface form.

hu.parse(word: string, lexicon: HuEntry[]): Analysis[]
// all (entry, chain) whose generated form equals the word (case-insensitive, trimmed). Lexicon-backed only.
// Sorted: fewer morphemes first. Empty array when nothing matches.

hu.build(entry: HuEntry, opts: {
  plural?: boolean;
  possessor?: "1sg"|"2sg"|"3sg"|"1pl"|"2pl"|"3pl";
  pluralPossessed?: boolean;      // only valid with possessor
  case?: "ban"|"ba"|"ból"|"on"|"ra"|"ról"|"nál"|"hoz"|"tól"|"t"|"nak"|"val"|"ig"|"ért"|"ként";
}): { word: string; morphemes: Morpheme[]; explain: string } | { error: string }
// Case keys name the BACK form; the engine picks the harmony variant (ban/ben, on/en/ön, hoz/hez/höz, t with
// or without linking vowel, val/vel with assimilation). Rules exactly as in SCHEMA.md §3a:
//  - plural and pluralPossessed are mutually exclusive → error.
//  - accusative "t" / superessive "on" with no plural/possessor → use entry.acc / entry.sup explicit forms,
//    split as stem + (link)? + suffix by comparing against entry.obl/base.
//  - "t" after plural → pl + "at"/"et" (házakat, kerteket, könyveket); after possessive → poss form + "t"
//    (házamat, kertjét, házaimat) with final a/e lengthened.
//  - "on" after plural → pl + on/en/ön; after possessive ending in a vowel → "n"; after consonant → on/en/ön.
//  - "val": after vowel → val/vel; after consonant → double the final consonant (digraph: double its first letter).
//  - lengthen final a/e → á/é before any suffix.

hu.guessUnknown(word: string, lexicon: HuEntry[]): Analysis
// heuristic right-to-left peel of known case suffixes, possessives, plural; stem role label "unknown stem";
// explain says it is not in the lexicon and what was assumed; confidence 0.3, unknown: true.

type HuEntry = { base, gloss, harmony: "back"|"front"|"frontRounded", obl, lv: "a"|"e"|"o"|"ö"|"", acc, pl, sup, j3: boolean, ji: boolean, notes? };
```

## German
```ts
de.parse(input: string, lexicon: DeLexicon): Analysis[]
// Runs the NP analyser, compound splitter, verb analyser, bare-noun/plural recogniser; returns every match,
// NP readings each as a separate Analysis with tokens[]; compounds/verbs/plurals as morphemes[].
// Case-insensitive matching on the first letter of nouns (input "krankenhaus" still matches Krankenhaus),
// but output forms keep the input's spelling.

de.build(opts: {
  noun: DeNoun; det: "definite"|"ein"|"none"; case: "nom"|"acc"|"dat"|"gen"; number: "sg"|"pl"; adjective?: DeAdj;
}): { word: string; tokens: {morphemes: Morpheme[]}[]; explain: string }
// Tables: definite der/die/das/die; den/die/das/die; dem/der/dem/den; des/der/des/der (m,f,n,pl).
// ein-words: ein/eine/ein/keine; einen/eine/ein/keine; einem/einer/einem/keinen; eines/einer/eines/keiner.
// Weak endings: nom sg -e (all), acc sg m -en f/n -e, dat sg -en, gen sg -en, pl all -en.
// Strong: m er/en/em/en; f e/e/er/er; n es/es/em/en; pl e/e/en/er.
// Mixed: nom sg m -er, nom/acc sg n -es, else weak.
// Noun: dat pl +n unless pl ends in n or s; gen sg m/n +es if base ends in s, ß, x, z, tz, sch; else +s; feminine unchanged.

de.guessUnknown(word: string, lexicon: DeLexicon): Analysis

type DeLexicon = { nouns: DeNoun[]; parts: {form, gloss, type}[]; adjectives: DeAdj[]; verbs: DeVerb[] };
type DeNoun = { base, gender: "m"|"f"|"n", pl, gloss, parts: string[] };
type DeAdj = { base, gloss };
type DeVerb = { inf, prefix, separable: boolean, stem, part2, part2stem, part2end, gloss };
```

## detectLang(text) → "de" | "hu" | null
HU if it contains ő, ű, or the digraphs gy/ty/ny/sz/zs/cs/ly, or ends with a known Hungarian suffix; DE if it contains ß, ä, or a German determiner token, or a capitalised noun after a determiner; null otherwise.

## Test contract (`/home/claude/app/test_engines.js`, run with node)
For every example in /home/claude/content/hu_decon.json: `hu.parse(word, huLexicon)` contains an analysis whose morpheme `form` sequence equals the example's `morphemes[*].form` sequence AND whose role sequence equals the example's role sequence. For every example in de_decon.json: `de.parse(word, deLexicon)` contains an analysis whose forms match (per token for `tokens` examples, flat for `morphemes` examples) and whose roles match. Plus the build cases listed in APP_SPEC.md §Acceptance tests 7 and 8. Plus unknown-word cases do not throw.
