# Operative's Linguistic Console — content schema (shared by all agents)

All content lives in JSON. One item type per module. IDs: `<lang>-<module>-<nnn>` (e.g. `de-drill-001`, `hu-decon-007`). `lang` is `de` or `hu`. All strings UTF-8 with correct diacritics (ä ö ü ß; á é í ó ö ő ú ü ű). No placeholders. No uncertain forms — if unsure, pick a different high-confidence example.

## 1. Drill item (module = "drill")

```json
{
  "id": "de-drill-001",
  "lang": "de",
  "module": "drill",
  "drillType": "substitution",
  "family": "case.acc",
  "instruction": "Put the cued noun in as the direct object.",
  "cue": "Ich sehe den Hund. → (die Katze)",
  "answer": "Ich sehe die Katze.",
  "accepted": ["Ich sehe die Katze"],
  "explain": "Direct object → accusative. Feminine accusative = die (no change).",
  "tags": ["accusative", "feminine", "sehen"],
  "difficulty": 1,
  "speedTargetSec": 4,
  "speakCue": true
}
```

- `drillType`: `substitution` | `transformation` | `response` | `expansion`.
- `family`: dotted tag used for grouping and for the error log. Controlled vocabulary below.
- `instruction`: one short imperative line shown above the cue (what to do with the cue).
- `cue`: what the learner sees and hears. Use `→ (…)` to mark the substitution cue; use `→ weil…` style hints for transformations when needed.
- `answer`: the canonical full-sentence answer.
- `accepted`: alternative correct answers (string array). Always include the canonical answer without final punctuation. Matching in the app is case-insensitive, strips punctuation and extra spaces, and treats ß/ss as equal; so do NOT list trivial punctuation variants, only real alternatives (e.g. different but equally correct word order).
- `explain`: one line, max ~20 words, the rule that produced the answer.
- `difficulty`: 1 (single-feature), 2 (two features), 3 (three or more / long).
- `speedTargetSec`: target seconds from cue to answer (1: 3–4 s, 2: 5–6 s, 3: 7–8 s).
- `speakCue`: whether the app should TTS the cue (false for cues with notation that TTS would mangle).

### German `family` vocabulary (use exactly these)
`case.nom`, `case.acc`, `case.dat`, `case.gen`, `prep.twoway`, `prep.government`, `verb.government`, `adj.strong`, `adj.weak`, `adj.mixed`, `verb.separable`, `verb.inseparable`, `order.v2`, `order.subordinate`, `order.modal`, `order.perfekt`, `tekamolo`, `konj2`, `gender.chunk`, `plural`.

### Hungarian `family` vocabulary (use exactly these)
`harmony.2form`, `harmony.3form`, `case.interior` (-ban/-ben, -ba/-be, -ból/-ből), `case.surface` (-n/-on/-en/-ön, -ra/-re, -ról/-ről), `case.proximity` (-nál/-nél, -hoz/-hez/-höz, -tól/-től), `case.acc`, `case.dat`, `case.instr`, `plural`, `poss.sg`, `poss.pl`, `conj.indef`, `conj.def`, `conj.lak`, `coverb.attached`, `coverb.separated`, `focus.order`, `stem.alternation`, `numeral.singular`, `verb.irregular`.

## 2. Deconstructor example (module = "decon")

```json
{
  "id": "hu-decon-001",
  "lang": "hu",
  "module": "decon",
  "word": "házaimban",
  "gloss": "in my houses",
  "morphemes": [
    {"form": "ház",  "role": "stem",    "label": "house (back-vowel stem)"},
    {"form": "a",    "role": "link",    "label": "linking vowel (low stem: a, not o)"},
    {"form": "i",    "role": "poss-pl", "label": "plural of the possessed thing"},
    {"form": "m",    "role": "poss",    "label": "1SG possessor — my"},
    {"form": "ban",  "role": "case",    "label": "inessive — in (back form of -ban/-ben)"}
  ],
  "explain": "Order is always stem → (linking vowel) → number/possessive → case. ház is a back stem, so every two-form suffix takes its back form.",
  "tags": ["case.interior", "poss.pl", "stem.low"]
}
```

Concatenating `morphemes[*].form` in order MUST reproduce `word` exactly (letters only; for German phrases, a space is written as its own morpheme `{"form": " ", "role": "space", "label": ""}` — or simpler: German examples may be single words OR phrases; for phrases the forms concatenate with single spaces between tokens, where each token's morphemes concatenate with no space. Use the `tokens` layout for phrases:

```json
{
  "id": "de-decon-003",
  "lang": "de",
  "module": "decon",
  "word": "dem alten Mann",
  "gloss": "to the old man (dative)",
  "tokens": [
    {"morphemes": [{"form": "dem", "role": "det", "label": "definite article — dative, masculine/neuter singular"}]},
    {"morphemes": [{"form": "alt", "role": "adj-stem", "label": "old"}, {"form": "en", "role": "adj-end", "label": "weak ending (after definite article, dative)"}]},
    {"morphemes": [{"form": "Mann", "role": "noun", "label": "man — der Mann, masculine; resolves dem to dative masc."}]}
  ],
  "explain": "After a definite article the adjective takes the weak ending: -e in nom sg (and fem/neut acc), -en everywhere else.",
  "tags": ["case.dat", "adj.weak"]
}
```

Single-word examples use `morphemes` at top level; phrase examples use `tokens`. Never both.

### Hungarian morpheme roles (exact strings)
`stem` (citation stem or oblique stem — label says which), `link` (linking vowel), `pl` (plural -k), `poss` (possessive person suffix: m, d, a/e, ja/je, nk, unk/ünk, tok/tek/tök, uk/ük, juk/jük), `poss-pl` (the -i of plural possessed), `case` (any case suffix), `lengthen` (NOT a morpheme — instead write the lengthened vowel inside the preceding morpheme form and note it in the label, e.g. form "kutyá" label "dog — final a lengthens to á before a suffix").

For stem alternations write the surface stem: `{"form":"kez","role":"stem","label":"hand — kéz shortens to kez- before a linking-vowel suffix"}`; `{"form":"lov","role":"stem","label":"horse — ló becomes lov- before linking-vowel suffixes"}`.

For -val/-vel assimilation: `{"form":"zal","role":"case","label":"instrumental -val: v assimilates to the final consonant (ház + val → házzal)"}` after stem `ház` — i.e. split as ház + zal so forms concatenate to házzal.

### German morpheme roles (exact strings)
`det` (article/determiner), `adj-stem`, `adj-end`, `noun`, `part` (compound part), `fuge` (linking element -s/-es/-n/-en/-er/-e/-ens), `sep-prefix`, `insep-prefix`, `ge` (participle ge-), `verb-stem`, `inf-end` (-en/-n), `part-end` (-t/-et/-en), `pl-end` (plural ending), `umlaut` (NOT a morpheme — write umlauted stem and note in label).

Compound example: Krankenversicherungskarte → `kranken` (part: krank + en, "sick (adjective, declined)"), `versicherung` (part: "insurance — die Versicherung"), `s` (fuge: "linking -s after -ung"), `karte` (noun: "card — die Karte; last part sets gender: die"). Write parts in lowercase except the final head noun, which keeps its capital as in the word; the concatenation must still equal the word exactly — so for Krankenversicherungskarte write parts "Kranken", "versicherung", "s", "karte".

## 3. Lexicon

### 3a. Hungarian noun lexicon (`hu_lexicon.json`, array)
Each entry gives explicit inflected forms so the generator never guesses:

```json
{
  "base": "ház", "gloss": "house", "harmony": "back",
  "obl": "ház", "lv": "a",
  "acc": "házat", "pl": "házak", "sup": "házon",
  "j3": false, "ji": false,
  "notes": "low (nyitó) stem: linking vowel a instead of o"
}
```

- `harmony`: `back` | `front` | `frontRounded`, determined by the last vowel (frontRounded = last vowel ö/ő/ü/ű). Mixed stems (back + front vowels) usually follow the LAST vowel, but i/í/e/é in the last syllable after a back vowel keep back harmony (kávé → kávéban, kávénak; papír → papírban; Budapest is an exception → Budapesten). Include only mixed stems whose forms you are certain of; otherwise leave the stem out.
- `obl`: oblique stem used before linking-vowel suffixes (plural, accusative when it has a linking vowel, possessives): `kéz`→`kez`, `ló`→`lov`, `madár`→`madar`, `út`→`ut`, `tűz`→`tüz`, `víz`→`viz`, `kő`→`köv`. Otherwise same as base.
- `lv`: linking vowel used in plural / 1SG / 2SG / 2PL possessive: `a`, `e`, `o`, `ö`, or `""` for vowel-final stems (autó, kutya).
- `acc`, `pl`, `sup` (superessive -n/-on/-en/-ön): explicit full forms.
- `j3`: 3SG/3PL possessive takes j (kertje/kertjük, barátja/barátjuk, autója). Vowel-final stems: j3 must be true.
- `ji`: plural-possessed takes j before i (kertjeim ✓, barátaim ✗ → ji false for barát).
- Generator rules the app will apply (so your explicit forms must agree with them):
  - final a/e of the base lengthens to á/é before any suffix (kutya → kutyát, kutyák, kutyám, kutyában).
  - 2-form cases attach to the base: ban/ben, ba/be, ból/ből, ra/re, ról/ről, nál/nél, tól/től, nak/nek; invariant: ig, ért, ként.
  - hoz/hez/höz attaches to the base (3-form by `harmony`).
  - val/vel: after a vowel `val/vel`; after a consonant the v becomes a copy of that consonant (ház → házzal, kert → kerttel, könyv → könyvvel, digraphs double their first letter: gy → ggy, sz → ssz: hegy → heggyel, busz → busszal).
  - possessive singular-possessed: 1SG obl+lv+m, 2SG obl+lv+d, 3SG obl+(j if j3)+a/e, 1PL obl+unk/ünk (after vowel: nk), 2PL obl+lv+tok/tek/tök, 3PL obl+(j if j3)+uk/ük.
  - plural-possessed: obl + (ji ? j + a/e : (lv === "" ? "" : a/e)) + i + {m, d, "", nk, tok/tek, k}.
  - after any possessive or plural: a case suffix may follow; a final a/e lengthens first (háza → házában, kertje → kertjével); superessive after a vowel is just -n (házán), after a consonant on/en/ön by harmony.
  - plural + case: házakban, házakon, házakhoz, házakkal.

### 3b. German lexicon (`de_lexicon.json`, object with arrays)

```json
{
  "nouns": [
    {"base": "Mann", "gender": "m", "pl": "Männer", "gloss": "man", "parts": ["mann", "männer"]},
    {"base": "Versicherung", "gender": "f", "pl": "Versicherungen", "gloss": "insurance", "parts": ["versicherung"]}
  ],
  "parts": [
    {"form": "kranken", "gloss": "sick — adjective krank with declension -en, as in Krankenhaus", "type": "adj-part"},
    {"form": "wasch", "gloss": "wash — verb stem of waschen", "type": "verb-part"}
  ],
  "adjectives": [
    {"base": "alt", "gloss": "old"}, {"base": "neu", "gloss": "new"}
  ],
  "verbs": [
    {"inf": "ankommen", "prefix": "an", "separable": true, "stem": "komm", "part2": "angekommen", "part2stem": "komm", "part2end": "en", "gloss": "arrive"},
    {"inf": "verstehen", "prefix": "ver", "separable": false, "stem": "steh", "part2": "verstanden", "part2stem": "stand", "part2end": "en", "gloss": "understand"},
    {"inf": "machen", "prefix": "", "separable": false, "stem": "mach", "part2": "gemacht", "part2stem": "mach", "part2end": "t", "gloss": "make, do"}
  ]
}
```

- `parts` on a noun: lowercase strings that can appear as a non-final compound part (singular or plural stem forms).
- Fugenelemente the app recognises between parts: `s`, `es`, `n`, `en`, `er`, `e`, `ens`.
- Determiners and adjective-ending tables are built into the app (not in the lexicon).

## 4. Minimum counts
- German drills ≥ 45; Hungarian drills ≥ 45.
- German deconstructor examples ≥ 28; Hungarian deconstructor examples ≥ 28.
- Lexicon large enough that every deconstructor example is covered AND at least 20 extra stems/nouns per language so new words from the same families parse.
