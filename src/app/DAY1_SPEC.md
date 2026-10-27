# Day-1 overhaul — shared spec for content and resource agents

The learner: adult American, zero German and zero Hungarian, starting German on 26 Oct 2026 (plan week 1). Hungarian starts later (default plan week 5) and only becomes full-time once a consulate confirms eligibility. 90–120 min weekdays, 3 h+ weekend days. Purpose: German = Ausbildung (skilled-trade apprenticeship) + German bureaucracy, later Switzerland (Hochdeutsch only); Hungarian = in-person consulate interview about his biography and family (formal Ön register).

## Stages (per language, counted from that language's own start date)

| Stage | German (from DE start) | Hungarian (from HU start) |
| --- | --- | --- |
| 0 | — | weeks 1–2: sounds only, NO drills |
| 1 | weeks 1–4: sounds; greetings and introductions; sein, haben, heißen, kommen, wohnen, arbeiten, lernen in the present (ich/du/er-sie/wir/Sie); numbers 0–100, clock time, days; W-questions and yes/no questions; V2 word order; der/die/das + noun chunks (gender-locked) and simple plurals; nominative; kein vs nicht basics; du vs Sie forms | weeks 3–4: greetings and politeness formulas; vagyok/vagy/van/vagyunk/vagytok/vannak and the dropped 3rd-person van in "X tanár."; ez/az, itt/ott; numbers 0–100; question words (ki, mi, hol, hogy, hány, mikor); plural -k; accusative -t with linking vowels on known stems; singular after numerals; yes/no question intonation; family words (anya, apa, testvér, nagyapa, nagymama, dédnagyapa); "X vagyok", "Y-ban/-ben / Y-on/-en lakom" for a few fixed places |
| 2 | weeks 5–8: accusative (den/einen, haben/brauchen/sehen/kaufen); dative basics with mit/zu/bei/nach/aus/von and helfen; two-way prepositions (legen/liegen, stellen/stehen); separable verbs in the present; modal verbs + infinitive; Perfekt with haben/sein (common verbs); weak adjective endings after der/die/das | weeks 5–8: the nine spatial cases on back/front/front-rounded stems; dative -nak/-nek; instrumental -val/-vel; singular possessives; indefinite and definite present conjugation; -lak/-lek; coverbs attached |
| 3 | weeks 9–12: genitive with wegen/trotz/während; strong and mixed adjective endings; weil/dass/ob/wenn; TeKaMoLo; Konjunktiv II politeness; Präteritum of sein/haben/modals; workplace/bureaucracy chunks | weeks 9–12: plural possessives; stem alternations (kezet, lovat …); coverb separation under negation, question words, focus; past tense -t/-tt; irregular verbs (megy, jön, eszik, iszik) full present; postpositions |
| 4 | month 4+: everything (B1 work) | after week 12 |

## Drill items (same schema as /home/claude/content/SCHEMA.md §1) — add one field

`"stage": 1 | 2 | 3 | 4` (Hungarian beginner items use 1 or 2; nothing uses 0).

Rules for beginner (stage 1) items — they are the learner's very first exposure, so:
- One new thing per item. Short sentences (3–7 words). Vocabulary from the first units of a beginner course plus his real life: work (Werkstatt/Arbeit, Schicht, Chef/Chefin), family, origin (USA/Amerika, Illinois), daily life. For Hungarian: family, origin, living in the USA, greetings, numbers.
- `instruction` must teach the move in plain English, e.g. "Answer the question about yourself with ich + the verb in 2nd position." Never assume the learner knows grammar terms without a 3–6-word gloss in brackets.
- `explain` gives the rule plus the English meaning of the answer, e.g. "heißen → ich heiße. ‘My name is …’".
- Include `"gloss"`: the English meaning of the full answer sentence (new optional field; one short line).
- `speedTargetSec`: 6 for stage-1 items (beginners need longer), 4–8 for later stages as in SCHEMA.
- `accepted`: every equally correct variant (word order, du/Sie when the cue allows both, gern/gerne …).
- Use `drillType` response for "answer about yourself" items; the answer uses a neutral placeholder where personal data would go only if the item is about the learner — prefer generic third-person content instead ("Er heißt Lukas.") so no personal data is needed.
- Families: reuse SCHEMA families where they fit; new beginner families allowed: `basics.greet`, `basics.sein`, `basics.haben`, `basics.present`, `basics.numbers`, `basics.time`, `basics.questions`, `basics.neg` (German); `basics.greet`, `basics.van`, `basics.numbers`, `basics.questions`, `basics.demonstr` (ez/az), `basics.family` (Hungarian). Keep the family string short.

## Legend sentence frames (one file per language)

`{ "id": "de-frame-01", "lang": "de", "text": "Ich heiße ___.", "gloss": "My name is ___.", "note": "heißen = to be called", "topic": "identity" }`
German: 15 frames for an apprentice applicant (name, origin, where you live, age, job now, what you want to learn, why Germany, family, hobbies, languages you speak, start date). Sie-register where someone else is addressed.
Hungarian: 15 frames for the consulate biography (name, where/when born, where you live, your parents, grandparents, great-grandfather born in a Hungarian town, why Hungarian citizenship, learning Hungarian, job, family members' names). Use only forms you are certain of; where a case suffix depends on the filled-in word, write the frame so the blank needs no suffix (e.g., "A dédnagyapám neve ___." rather than "___-ban született"), or give the two harmony variants explicitly in `note`.

## Resources (one file: resources.json, array)

`{ "id": "de-nicos-weg", "lang": "de" | "hu" | "both", "name": "Nicos Weg (DW)", "url": "https://…", "what": "Video course with transcripts, A1–B1", "use": "Watch one episode per day in the Input block; then gist it (P-2)", "cost": "free" | "free tier" | "$… /month" | "~$… one-off", "fromStage": 1, "toStage": 3, "priority": "core" | "optional", "protocol": "P-4" , "verified": true | false, "checked": "2026-10-26" }`
- `fromStage`/`toStage` use the stage table above for that language (for "both" use German stages).
- Mark exactly the resources a day-1 learner must open as `core` with `fromStage: 1`; keep that set small (3–5 per language).
- Every URL must be fetched; set `verified: true` only when the page loaded and is the right resource; otherwise keep the item with `verified: false` and a short `"note"`.
