#!/usr/bin/env python3 -I
"""Validator for the Day-1 German beginner content:
de_drills_beginner.json, de_stage_map.json, de_frames.json (checked together with de_drills.json)."""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
errors = []
def err(msg): errors.append(msg)

def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)          # raises on invalid JSON

old = load("de_drills.json")
new = load("de_drills_beginner.json")
stage_map = load("de_stage_map.json")
frames = load("de_frames.json")

SCHEMA_FAMILIES = {"case.nom","case.acc","case.dat","case.gen","prep.twoway","prep.government","verb.government",
                   "adj.strong","adj.weak","adj.mixed","verb.separable","verb.inseparable","order.v2","order.subordinate",
                   "order.modal","order.perfekt","tekamolo","konj2","gender.chunk","plural"}
BEGINNER_FAMILIES = {"basics.greet","basics.sein","basics.haben","basics.present","basics.numbers","basics.time",
                     "basics.questions","basics.neg"}
FAMILIES = SCHEMA_FAMILIES | BEGINNER_FAMILIES
DRILLTYPES = {"substitution","transformation","response","expansion"}
REQ = ["id","lang","module","drillType","family","instruction","cue","answer","accepted","explain","tags",
       "difficulty","speedTargetSec","speakCue","stage","gloss"]

# ---------- ids unique across both drill files ----------
old_ids = [d["id"] for d in old]
new_ids = [d["id"] for d in new]
all_ids = old_ids + new_ids
if len(all_ids) != len(set(all_ids)):
    dups = [i for i, c in collections.Counter(all_ids).items() if c > 1]
    err(f"duplicate ids across de_drills.json + de_drills_beginner.json: {dups}")
for i, d in enumerate(new, 1):
    if d["id"] != f"de-drill-b{i:03d}": err(f"{d['id']}: expected de-drill-b{i:03d} (sequential ids)")

# ---------- beginner items ----------
fam_by_stage = collections.defaultdict(collections.Counter)
stage_count = collections.Counter()
types = collections.Counter()
for d in new:
    did = d.get("id", "?")
    for k in REQ:
        if k not in d: err(f"{did}: missing field {k}")
    if any(k not in d for k in REQ): continue
    if d["lang"] != "de" or d["module"] != "drill": err(f"{did}: lang/module")
    if d["drillType"] not in DRILLTYPES: err(f"{did}: drillType {d['drillType']}")
    if d["family"] not in FAMILIES and not d["family"].startswith("register."): err(f"{did}: family {d['family']}")
    if d["stage"] not in (1, 2, 3, 4): err(f"{did}: stage {d['stage']}")
    if d["difficulty"] not in (1, 2, 3): err(f"{did}: difficulty {d['difficulty']}")
    if d["stage"] == 1 and d["speedTargetSec"] != 6: err(f"{did}: stage-1 speedTargetSec must be 6")
    if d["stage"] > 1 and not (4 <= d["speedTargetSec"] <= 8): err(f"{did}: speedTargetSec out of 4–8")
    if not isinstance(d["speakCue"], bool): err(f"{did}: speakCue not bool")
    if not isinstance(d["tags"], list) or not d["tags"]: err(f"{did}: tags")
    if not d["gloss"].strip() or "\n" in d["gloss"]: err(f"{did}: gloss must be one non-empty line")
    if not d["instruction"].strip(): err(f"{did}: empty instruction")
    if len(d["explain"].split()) > 22: err(f"{did}: explain too long ({len(d['explain'].split())} words)")
    if not d["accepted"]: err(f"{did}: accepted empty")
    canon = d["answer"].rstrip(".!?")
    if canon not in d["accepted"]: err(f"{did}: canonical answer missing from accepted")
    if len(set(d["accepted"])) != len(d["accepted"]): err(f"{did}: duplicate accepted")
    for a in d["accepted"]:
        if a and a[-1] in ".!?": err(f"{did}: accepted variant ends with punctuation: {a!r}")
    if d["stage"] == 1 and len(d["answer"].split()) > 12: err(f"{did}: stage-1 answer too long")
    # "___" placeholders belong only to gap-fill cues; answers never contain them
    if "___" in d["answer"]: err(f"{did}: placeholder in answer")
    fam_by_stage[d["stage"]][d["family"]] += 1
    stage_count[d["stage"]] += 1
    types[d["drillType"]] += 1

if len(new) < 70: err(f"only {len(new)} beginner items (need ≥ 70)")

# coverage minimums from the task brief
MIN1 = {"basics.greet":5,"basics.sein":6,"basics.haben":5,"basics.present":8,"basics.questions":6,
        "order.v2":4,"gender.chunk":5,"basics.neg":3}
for f, n in MIN1.items():
    if fam_by_stage[1][f] < n: err(f"stage 1 family {f}: {fam_by_stage[1][f]} < {n}")
if fam_by_stage[1]["basics.numbers"] + fam_by_stage[1]["basics.time"] < 6: err("stage 1 numbers+time < 6")
MIN2 = {"case.acc":6,"case.dat":6,"verb.separable":5,"order.modal":4,"order.perfekt":4}
for f, n in MIN2.items():
    if fam_by_stage[2][f] < n: err(f"stage 2 family {f}: {fam_by_stage[2][f]} < {n}")

# ---------- stage map ----------
for i in old_ids:
    if i not in stage_map: err(f"stage map: missing {i}")
for i, s in stage_map.items():
    if i not in old_ids: err(f"stage map: unknown id {i}")
    if s not in (1, 2, 3, 4): err(f"stage map: {i} has stage {s}")
map_count = collections.Counter(stage_map.values())

# ---------- frames ----------
FREQ = ["id","lang","text","gloss","note","topic"]
fids = [f.get("id") for f in frames]
if len(fids) != len(set(fids)): err("frames: duplicate ids")
if len(frames) != 15: err(f"frames: {len(frames)} != 15")
for f in frames:
    for k in FREQ:
        if k not in f or not str(f[k]).strip(): err(f"frame {f.get('id')}: missing/empty {k}")
    if f.get("lang") != "de": err(f"frame {f.get('id')}: lang")
    if "___" in f.get("text", "") and "___" not in f.get("gloss", ""): err(f"frame {f.get('id')}: blank in text but not in gloss")

# ---------- report ----------
print(f"de_drills.json: {len(old)} items; de_drills_beginner.json: {len(new)} items; ids unique: {len(set(all_ids)) == len(all_ids)}")
print("beginner items per stage:", dict(sorted(stage_count.items())))
for s in sorted(fam_by_stage):
    print(f"  stage {s}:")
    for f in sorted(fam_by_stage[s]): print(f"    {f}: {fam_by_stage[s][f]}")
print("beginner drillTypes:", dict(types))
print("stage map (de_drills.json) per stage:", dict(sorted(map_count.items())))
print("frames:", len(frames))
if errors:
    print("\nERRORS:")
    for e in errors: print(" -", e)
    sys.exit(1)
print("\nALL CHECKS PASSED")
