"""Consistency check for the Hungarian content set.  Run:  python3 -I check_hu.py

Checks
* all three JSON files load; ids unique; required fields present
* drill counts per family / drillType; accepted contains canonical answer w/o punctuation
* decon: concatenated morpheme forms == word; roles valid
* decon: word is produced by hu_generate.parse() from hu_lexicon.json AND the parser's
  morpheme split (forms + roles, in order) matches the example's split exactly
* lexicon: every explicit acc/pl/sup is reproduced by the generator's own split rules
"""
from __future__ import annotations
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hu_generate as g  # noqa: E402

DRILL_FAMILIES = {
    "harmony.2form", "harmony.3form", "case.interior", "case.surface", "case.proximity",
    "case.acc", "case.dat", "case.instr", "plural", "poss.sg", "poss.pl", "conj.indef",
    "conj.def", "conj.lak", "coverb.attached", "coverb.separated", "focus.order",
    "stem.alternation", "numeral.singular", "verb.irregular",
}
DRILL_TYPES = {"substitution", "transformation", "response", "expansion"}
DRILL_REQ = ["id", "lang", "module", "drillType", "family", "instruction", "cue", "answer",
             "accepted", "explain", "tags", "difficulty", "speedTargetSec", "speakCue"]
DECON_ROLES = {"stem", "link", "pl", "poss", "poss-pl", "case"}
LEX_REQ = ["base", "gloss", "harmony", "obl", "lv", "acc", "pl", "sup", "j3", "ji", "notes"]

problems: list[str] = []


def bad(msg: str) -> None:
    problems.append(msg)
    print("PROBLEM:", msg)


def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as fh:
        return json.load(fh)


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[.!?,;:…\"“”„]", "", s)
    return re.sub(r"\s+", " ", s).strip()


# ----------------------------------------------------------------------------
drills = load("hu_drills.json")
decon = load("hu_decon.json")
lexicon = load("hu_lexicon.json")

# ids
for name, items in (("drills", drills), ("decon", decon)):
    ids = [x["id"] for x in items]
    dup = [k for k, v in Counter(ids).items() if v > 1]
    if dup:
        bad(f"{name}: duplicate ids {dup}")
    for i in ids:
        if not re.fullmatch(r"hu-(drill|decon)-\d{3}", i):
            bad(f"{name}: malformed id {i}")
bases = [e["base"] for e in lexicon]
dup = [k for k, v in Counter(bases).items() if v > 1]
if dup:
    bad(f"lexicon: duplicate bases {dup}")

# ----------------------------------------------------------------------------
# drills
fam_count = Counter()
type_count = Counter()
for d in drills:
    for k in DRILL_REQ:
        if k not in d:
            bad(f"{d.get('id')}: missing field {k}")
    if d["lang"] != "hu" or d["module"] != "drill":
        bad(f"{d['id']}: lang/module wrong")
    if d["family"] not in DRILL_FAMILIES:
        bad(f"{d['id']}: unknown family {d['family']}")
    if d["drillType"] not in DRILL_TYPES:
        bad(f"{d['id']}: unknown drillType {d['drillType']}")
    if d["difficulty"] not in (1, 2, 3):
        bad(f"{d['id']}: difficulty must be 1..3")
    want = {1: (3, 4), 2: (5, 6), 3: (7, 8)}[d["difficulty"]]
    if not (want[0] <= d["speedTargetSec"] <= want[1]):
        bad(f"{d['id']}: speedTargetSec {d['speedTargetSec']} outside {want} for difficulty {d['difficulty']}")
    if len(d["explain"].split()) > 22:
        bad(f"{d['id']}: explain longer than ~20 words ({len(d['explain'].split())})")
    canon = norm(d["answer"])
    if not any(norm(a) == canon for a in d["accepted"]):
        bad(f"{d['id']}: accepted lacks the canonical answer")
    if not isinstance(d["speakCue"], bool):
        bad(f"{d['id']}: speakCue must be boolean")
    if "→" in d["cue"] and d["speakCue"]:
        pass  # allowed; the app reads the arrow as a pause
    fam_count[d["family"]] += 1
    type_count[d["drillType"]] += 1

# ----------------------------------------------------------------------------
# decon
decon_tag_count = Counter()
for ex in decon:
    if "tokens" in ex:
        bad(f"{ex['id']}: Hungarian examples must use single-word morphemes layout")
        continue
    ms = ex["morphemes"]
    cat = "".join(m["form"] for m in ms)
    if cat != ex["word"]:
        bad(f"{ex['id']}: morphemes concatenate to {cat!r}, word is {ex['word']!r}")
    for m in ms:
        if m["role"] not in DECON_ROLES:
            bad(f"{ex['id']}: bad role {m['role']}")
        if not m["label"]:
            bad(f"{ex['id']}: empty label on {m['form']}")
    if ms[0]["role"] != "stem":
        bad(f"{ex['id']}: first morpheme must be the stem")
    for t in ex["tags"]:
        decon_tag_count[t] += 1
    hits = g.parse(ex["word"], lexicon)
    if not hits:
        bad(f"{ex['id']}: {ex['word']} not produced by the generator from the lexicon")
        continue
    want = [(m["form"], m["role"]) for m in ms]
    got_splits = [[(m["form"], m["role"]) for m in pm] for _e, pm in hits]
    if want not in got_splits:
        shown = ["+".join(f"{f}:{r}" for f, r in s) for s in got_splits]
        bad(f"{ex['id']}: split mismatch for {ex['word']}: example {'+'.join(f'{f}:{r}' for f, r in want)} ; parser {shown}")

# ----------------------------------------------------------------------------
# lexicon self-consistency
for e in lexicon:
    for k in LEX_REQ:
        if k not in e:
            bad(f"lexicon {e.get('base')}: missing {k}")
    if e["harmony"] not in ("back", "front", "frontRounded"):
        bad(f"lexicon {e['base']}: bad harmony")
    if e["lv"] not in ("", "a", "e", "o", "ö"):
        bad(f"lexicon {e['base']}: bad lv {e['lv']!r}")
    if e["lv"] == "" and not e["j3"]:
        bad(f"lexicon {e['base']}: vowel-final stem must have j3 true")
    f = g.forms(e)
    for key in ("acc", "pl", "sup"):
        if e[key] not in f:
            bad(f"lexicon {e['base']}: explicit {key}={e[key]} is not among generated forms")
    for fn, key in ((g._split_acc, "acc"), (g._split_plural, "pl"), (g._split_sup, "sup")):
        ms, ok = fn(e)
        if not ok:
            bad(f"lexicon {e['base']}: {key}={e[key]} cannot be split by the generator rules (obl/lv wrong?)")
    # lv must be consistent with pl
    lobl = g.lengthen(e["obl"])
    if e["pl"] != lobl + e["lv"] + "k":
        bad(f"lexicon {e['base']}: pl {e['pl']} != obl+lv+k ({lobl}{e['lv']}k)")

# decon coverage of lexicon
stems_in_decon = set()
for ex in decon:
    for e, _ in g.parse(ex["word"], lexicon):
        stems_in_decon.add(e["base"])
extra = len(lexicon) - len(stems_in_decon)

# ----------------------------------------------------------------------------
print()
print(f"drills: {len(drills)}  (min 48)")
for k in sorted(fam_count):
    print(f"  {k:18s} {fam_count[k]}")
print("  by type:", dict(type_count))
print(f"decon: {len(decon)}  (min 30)")
for k in sorted(decon_tag_count):
    print(f"  {k:18s} {decon_tag_count[k]}")
print(f"lexicon: {len(lexicon)} entries; {len(stems_in_decon)} used by decon examples; {extra} extra stems")
print()
if problems:
    print(f"{len(problems)} problem(s)")
    sys.exit(1)
print("ALL CHECKS PASSED")
