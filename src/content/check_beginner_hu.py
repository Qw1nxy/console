"""Consistency check for the Hungarian Day-1 beginner content.  Run:  python3 -I check_beginner_hu.py

Checks
* hu_drills_beginner.json, hu_stage_map.json, hu_frames.json (and hu_drills.json) load as JSON
* drill ids unique across hu_drills.json + hu_drills_beginner.json; beginner ids are hu-drill-bNNN
* every beginner item has all SCHEMA fields + stage + gloss; types/values valid
* family in the SCHEMA Hungarian vocabulary or the DAY1 beginner families
* stage 1 → speedTargetSec 6; stage 2 → speedTargetSec inside the SCHEMA band for its difficulty
* accepted contains the canonical answer; explain ≤ ~20 words
* counts per stage, per family and per family×stage; DAY1 coverage targets
* hu_stage_map.json maps EVERY id of hu_drills.json to an int 1–4 and nothing else
* hu_frames.json: 15 frames, ids hu-frame-NN unique, all fields; a blank that carries a suffix
  (___-xx/-yy) must have both harmony variants in the note
* every Hungarian string uses only Hungarian letters / ordinary punctuation
"""
from __future__ import annotations
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))

SCHEMA_FAMILIES = {
    "harmony.2form", "harmony.3form", "case.interior", "case.surface", "case.proximity",
    "case.acc", "case.dat", "case.instr", "plural", "poss.sg", "poss.pl", "conj.indef",
    "conj.def", "conj.lak", "coverb.attached", "coverb.separated", "focus.order",
    "stem.alternation", "numeral.singular", "verb.irregular",
}
BEGINNER_FAMILIES = {"basics.greet", "basics.van", "basics.numbers", "basics.questions",
                     "basics.demonstr", "basics.family"}
FAMILIES = SCHEMA_FAMILIES | BEGINNER_FAMILIES
DRILL_TYPES = {"substitution", "transformation", "response", "expansion"}
REQ = ["id", "lang", "module", "drillType", "family", "instruction", "cue", "answer",
       "accepted", "explain", "tags", "difficulty", "speedTargetSec", "speakCue", "stage", "gloss"]
FRAME_REQ = ["id", "lang", "text", "gloss", "note", "topic"]

# DAY1 coverage targets: family → (minimum count, stage)
TARGETS = {
    1: {"basics.greet": 5, "basics.van": 7, "basics.demonstr": 4, "basics.numbers": 5,
        "basics.questions": 5, "plural": 3, "case.acc": 3, "basics.family": 3},
    2: {"case.interior": 3, "case.surface": 3, "case.dat": 2, "case.instr": 2, "poss.sg": 4,
        "conj.indef": 2, "conj.def": 2, "coverb.attached": 2},
}

HU_CHARS = re.compile(r"^[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9 .,!?…:;'’‘\"“”„()\-–—→+/]*$")

problems: list[str] = []


def bad(msg: str) -> None:
    problems.append(msg)
    print("PROBLEM:", msg)


def load(name):
    path = os.path.join(HERE, name)
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:  # noqa: BLE001
        bad(f"{name}: not valid JSON / unreadable: {exc}")
        return None


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[.!?,;:…\"“”„]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def words(s: str) -> int:
    return len(s.split())


# ----------------------------------------------------------------------------
base = load("hu_drills.json")
beg = load("hu_drills_beginner.json")
smap = load("hu_stage_map.json")
frames = load("hu_frames.json")
if base is None or beg is None or smap is None or frames is None:
    print(f"{len(problems)} problem(s)")
    sys.exit(1)

if not isinstance(beg, list):
    bad("hu_drills_beginner.json must be an array")
    beg = []
if not isinstance(smap, dict):
    bad("hu_stage_map.json must be an object {id: stage}")
    smap = {}
if not isinstance(frames, list):
    bad("hu_frames.json must be an array")
    frames = []

# ---- ids ---------------------------------------------------------------------
all_ids = [d["id"] for d in base] + [d.get("id") for d in beg]
for k, v in Counter(all_ids).items():
    if v > 1:
        bad(f"duplicate drill id across files: {k}")
for d in beg:
    if not re.fullmatch(r"hu-drill-b\d{3}", str(d.get("id"))):
        bad(f"beginner: malformed id {d.get('id')!r}")

# ---- beginner items ---------------------------------------------------------
stage_count = Counter()
fam_count = Counter()
fam_stage = defaultdict(Counter)
type_count = Counter()
for d in beg:
    did = d.get("id", "?")
    for k in REQ:
        if k not in d:
            bad(f"{did}: missing field {k}")
    extra = set(d) - set(REQ)
    if extra:
        bad(f"{did}: unexpected fields {sorted(extra)}")
    if d.get("lang") != "hu" or d.get("module") != "drill":
        bad(f"{did}: lang/module wrong")
    if d.get("drillType") not in DRILL_TYPES:
        bad(f"{did}: unknown drillType {d.get('drillType')}")
    if d.get("family") not in FAMILIES:
        bad(f"{did}: unknown family {d.get('family')}")
    if d.get("stage") not in (1, 2):
        bad(f"{did}: beginner stage must be 1 or 2, got {d.get('stage')!r}")
    if d.get("difficulty") not in (1, 2, 3):
        bad(f"{did}: difficulty must be 1..3")
    sp = d.get("speedTargetSec")
    if d.get("stage") == 1:
        if sp != 6:
            bad(f"{did}: stage-1 item must have speedTargetSec 6, got {sp}")
    elif d.get("difficulty") in (1, 2, 3):
        lo, hi = {1: (3, 4), 2: (5, 6), 3: (7, 8)}[d["difficulty"]]
        if not (isinstance(sp, int) and lo <= sp <= hi):
            bad(f"{did}: speedTargetSec {sp} outside {(lo, hi)} for difficulty {d['difficulty']}")
    if not isinstance(d.get("speakCue"), bool):
        bad(f"{did}: speakCue must be boolean")
    if not isinstance(d.get("accepted"), list) or not d["accepted"]:
        bad(f"{did}: accepted must be a non-empty list")
    else:
        canon = norm(d.get("answer", ""))
        if not any(norm(a) == canon for a in d["accepted"]):
            bad(f"{did}: accepted lacks the canonical answer")
        for a in d["accepted"]:
            if re.search(r"[.!?]$", a):
                bad(f"{did}: accepted variant ends with punctuation: {a!r}")
    if not isinstance(d.get("tags"), list) or not d["tags"]:
        bad(f"{did}: tags must be a non-empty list")
    for k in ("instruction", "cue", "answer", "explain", "gloss"):
        v = d.get(k)
        if not isinstance(v, str) or not v.strip():
            bad(f"{did}: {k} must be a non-empty string")
    if words(d.get("explain", "")) > 22:
        bad(f"{did}: explain longer than ~20 words ({words(d['explain'])})")
    if words(d.get("gloss", "")) > 14:
        bad(f"{did}: gloss should be one short line ({words(d['gloss'])} words)")
    # Hungarian strings: answer + accepted use only Hungarian letters/punctuation
    for s in [d.get("answer", "")] + list(d.get("accepted", [])):
        if not HU_CHARS.match(s):
            bad(f"{did}: non-Hungarian character in {s!r}")
    # beginner rule: short sentences (3–7 words) — warn only for stage 1 answers longer than 7
    if d.get("stage") == 1 and words(re.sub(r"[^\w\s'’]", " ", d.get("answer", ""))) > 7:
        bad(f"{did}: stage-1 answer longer than 7 words: {d['answer']!r}")
    stage_count[d.get("stage")] += 1
    fam_count[d.get("family")] += 1
    fam_stage[d.get("stage")][d.get("family")] += 1
    type_count[d.get("drillType")] += 1

for st, fams in TARGETS.items():
    for fam, need in fams.items():
        got = fam_stage[st][fam]
        if got < need:
            bad(f"coverage: stage {st} family {fam}: {got} < {need}")
if len(beg) != 55:
    bad(f"beginner: expected 55 items, got {len(beg)}")
if not (33 <= stage_count[1] <= 37):
    bad(f"beginner: stage-1 count {stage_count[1]} not ≈35")
if not (18 <= stage_count[2] <= 22):
    bad(f"beginner: stage-2 count {stage_count[2]} not ≈20")

# ---- stage map -----------------------------------------------------------------
base_ids = {d["id"] for d in base}
for i in sorted(base_ids):
    if i not in smap:
        bad(f"stage map: missing {i}")
    elif smap[i] not in (1, 2, 3, 4) or isinstance(smap[i], bool):
        bad(f"stage map: {i} has invalid stage {smap[i]!r}")
for i in smap:
    if i not in base_ids:
        bad(f"stage map: unknown id {i}")
map_count = Counter(v for v in smap.values())

# ---- frames --------------------------------------------------------------------
if len(frames) != 15:
    bad(f"frames: expected 15, got {len(frames)}")
fids = [f.get("id") for f in frames]
for k, v in Counter(fids).items():
    if v > 1:
        bad(f"frames: duplicate id {k}")
topic_count = Counter()
for f in frames:
    fid = f.get("id", "?")
    if not re.fullmatch(r"hu-frame-\d{2}", str(fid)):
        bad(f"frames: malformed id {fid!r}")
    for k in FRAME_REQ:
        if k not in f or not isinstance(f[k], str) or not f[k].strip():
            bad(f"{fid}: missing/empty field {k}")
    if f.get("lang") != "hu":
        bad(f"{fid}: lang must be hu")
    text = f.get("text", "")
    if not HU_CHARS.match(text.replace("___", "")):
        bad(f"{fid}: non-Hungarian character in text {text!r}")
    # a blank carrying a suffix must list both harmony variants in the note
    for m in re.finditer(r"___-([a-záéíóöőúüű]+)/-([a-záéíóöőúüű]+)", text):
        a, b = m.group(1), m.group(2)
        note = f.get("note", "")
        if a not in note or b not in note:
            bad(f"{fid}: blank takes -{a}/-{b} but note does not give both variants")
    if re.search(r"___-[a-záéíóöőúüű]+(?!/)", text) and "/" not in text:
        bad(f"{fid}: blank takes a single suffix without the alternative harmony form")
    topic_count[f.get("topic")] += 1

# ----------------------------------------------------------------------------
print()
print(f"beginner drills: {len(beg)}")
print("  by stage:", dict(sorted(stage_count.items())))
for st in sorted(fam_stage):
    print(f"  stage {st}:")
    for fam in sorted(fam_stage[st]):
        print(f"    {fam:18s} {fam_stage[st][fam]}")
print("  by family (all):", dict(sorted(fam_count.items())))
print("  by type:", dict(sorted(type_count.items())))
print(f"stage map: {len(smap)} ids (hu_drills.json has {len(base_ids)}); by stage: {dict(sorted(map_count.items()))}")
print(f"frames: {len(frames)}; topics: {dict(sorted(topic_count.items()))}")
print()
if problems:
    print(f"{len(problems)} problem(s)")
    sys.exit(1)
print("ALL CHECKS PASSED")
