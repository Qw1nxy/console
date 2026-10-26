#!/usr/bin/env python3 -I
"""Validator for the German content files (de_drills.json, de_decon.json, de_lexicon.json)."""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
errors = []
def err(msg): errors.append(msg)

def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)

drills = load("de_drills.json")
decon = load("de_decon.json")
lex = load("de_lexicon.json")

# ---------- drills ----------
FAMILIES = {"case.nom","case.acc","case.dat","case.gen","prep.twoway","prep.government","verb.government",
            "adj.strong","adj.weak","adj.mixed","verb.separable","verb.inseparable","order.v2","order.subordinate",
            "order.modal","order.perfekt","tekamolo","konj2","gender.chunk","plural"}
DRILLTYPES = {"substitution","transformation","response","expansion"}
REQ_DRILL = ["id","lang","module","drillType","family","instruction","cue","answer","accepted","explain","tags",
             "difficulty","speedTargetSec","speakCue"]
ids = [d["id"] for d in drills]
if len(ids) != len(set(ids)): err("duplicate drill ids")
fam = collections.Counter()
for d in drills:
    for k in REQ_DRILL:
        if k not in d: err(f"{d.get('id')}: missing {k}")
    if d["lang"] != "de" or d["module"] != "drill": err(f"{d['id']}: lang/module")
    if d["drillType"] not in DRILLTYPES: err(f"{d['id']}: drillType {d['drillType']}")
    if d["family"] not in FAMILIES and not (d["family"] == "transformation"):
        err(f"{d['id']}: family {d['family']}")
    if d["difficulty"] not in (1,2,3): err(f"{d['id']}: difficulty")
    if len(d["explain"].split()) > 22: err(f"{d['id']}: explain too long ({len(d['explain'].split())} words)")
    if not d["accepted"]: err(f"{d['id']}: accepted empty")
    canon = d["answer"].rstrip(".!?")
    if canon not in d["accepted"]: err(f"{d['id']}: canonical answer missing from accepted")
    if len(set(d["accepted"])) != len(d["accepted"]): err(f"{d['id']}: duplicate accepted")
    fam[d["family"]] += 1

MIN = {"case.nom":3,"case.acc":5,"case.dat":5,"case.gen":3,"prep.twoway":6,"adj.strong":3,"adj.weak":3,"adj.mixed":3,
       "verb.separable":6,"verb.inseparable":2,"order.subordinate":6,"order.modal":3,"order.perfekt":3,"tekamolo":3,
       "konj2":3,"transformation":2,"plural":3,"gender.chunk":3}
for f, n in MIN.items():
    if fam[f] < n: err(f"family {f}: {fam[f]} < {n}")
if len(drills) < 48: err(f"only {len(drills)} drills")
types = collections.Counter(d["drillType"] for d in drills)
if types["response"] < 1 or types["expansion"] < 1: err("need response and expansion drills")

# ---------- lexicon ----------
nouns = {n["base"]: n for n in lex["nouns"]}
noun_parts = {}
for n in lex["nouns"]:
    noun_parts[n["base"].lower()] = n["base"]
    for p in n["parts"]: noun_parts[p] = n["base"]
    if n["gender"] not in ("m","f","n"): err(f"noun {n['base']}: gender")
    for p in n["parts"]:
        if p != p.lower(): err(f"noun {n['base']}: part {p} not lowercase")
parts = {p["form"]: p for p in lex["parts"]}
adjs = {a["base"] for a in lex["adjectives"]}
verbs = {v["inf"]: v for v in lex["verbs"]}
for v in lex["verbs"]:
    if v["prefix"] + v["stem"] + "en" != v["inf"] and v["prefix"] + v["stem"] + "n" != v["inf"]:
        err(f"verb {v['inf']}: prefix+stem+en != inf")
    expected = v["prefix"] + ("ge" if (v["separable"] or v["prefix"] == "") else "") + v["part2stem"] + v["part2end"]
    if expected != v["part2"]: err(f"verb {v['inf']}: part2 {v['part2']} != {expected}")
if len(lex["nouns"]) < 70: err("fewer than 70 nouns")
if len(lex["parts"]) < 15: err("fewer than 15 parts")
if len(lex["adjectives"]) < 20: err("fewer than 20 adjectives")
if len(lex["verbs"]) < 25: err("fewer than 25 verbs")
if len(set(nouns)) != len(lex["nouns"]): err("duplicate noun bases")

FUGEN = {"s","es","n","en","er","e","ens"}
ROLES = {"det","adj-stem","adj-end","noun","part","fuge","sep-prefix","insep-prefix","ge","verb-stem","inf-end","part-end","pl-end"}

def split_compound(word):
    """Greedy-with-backtracking split of a lowercase compound into lexicon nouns/parts + Fugen."""
    w = word.lower()
    def rec(i, acc):
        if i == len(w):
            return acc if acc and acc[-1][0] == "noun" else None
        cands = []
        for j in range(len(w), i, -1):
            seg = w[i:j]
            if seg in noun_parts: cands.append(("noun", seg, j))
            if seg in parts: cands.append(("part", seg, j))
            if seg in FUGEN and acc and acc[-1][0] in ("noun","part"): cands.append(("fuge", seg, j))
        for kind, seg, j in cands:
            r = rec(j, acc + [(kind, seg)])
            if r: return r
        return None
    return rec(0, [])

# ---------- decon ----------
dids = [e["id"] for e in decon]
if len(dids) != len(set(dids)): err("duplicate decon ids")
if len(decon) < 30: err(f"only {len(decon)} decon examples")
if set(ids) & set(dids): err("drill/decon id overlap")
stats = collections.Counter()
def noun_known(form):
    f = form
    cands = {f, f.lower()}
    # umlauted plural stems like Männ / Büch / Ämt: strip umlaut and allow lexicon plural stem match
    for c in list(cands):
        for a, b in (("ä","a"),("ö","o"),("ü","u"),("Ä","A"),("Ö","O"),("Ü","U")):
            cands.add(c.replace(a, b))
    for c in cands:
        if c in nouns or c in noun_parts or c.capitalize() in nouns: return True
    return False

for e in decon:
    for k in ("id","lang","module","word","gloss","explain","tags"):
        if k not in e: err(f"{e.get('id')}: missing {k}")
    if ("tokens" in e) == ("morphemes" in e): err(f"{e['id']}: must have exactly one of tokens/morphemes")
    toks = e["tokens"] if "tokens" in e else [{"morphemes": e["morphemes"]}]
    rebuilt = " ".join("".join(m["form"] for m in t["morphemes"]) for t in toks)
    if rebuilt != e["word"]: err(f"{e['id']}: concat '{rebuilt}' != '{e['word']}'")
    allm = [m for t in toks for m in t["morphemes"]]
    for m in allm:
        if m["role"] not in ROLES: err(f"{e['id']}: role {m['role']}")
        if not m.get("label"): err(f"{e['id']}: empty label for {m['form']}")
    roles = [m["role"] for m in allm]
    if "tokens" in e: stats["np"] += 1
    elif "part" in roles: stats["compound"] += 1
    elif "sep-prefix" in roles or "insep-prefix" in roles: stats["verb"] += 1
    elif "pl-end" in roles: stats["plural"] += 1
    # lexicon coverage
    for m in allm:
        if m["role"] == "adj-stem" and m["form"] not in adjs: err(f"{e['id']}: adjective {m['form']} not in lexicon")
        if m["role"] == "noun" and not noun_known(m["form"]): err(f"{e['id']}: noun {m['form']} not in lexicon")
        if m["role"] == "part":
            f = m["form"].lower()
            if f not in parts and f not in noun_parts: err(f"{e['id']}: part {m['form']} not in lexicon")
        if m["role"] == "fuge" and m["form"] not in FUGEN: err(f"{e['id']}: fuge {m['form']}")
    if "sep-prefix" in roles or "insep-prefix" in roles:
        pre = next(m["form"] for m in allm if m["role"] in ("sep-prefix","insep-prefix"))
        stem = next(m["form"] for m in allm if m["role"] == "verb-stem")
        sep = "sep-prefix" in roles
        matches = [v for v in verbs.values() if v["prefix"] == pre and v["separable"] == sep
                   and (v["stem"] == stem or v["part2stem"] == stem)]
        if not matches: err(f"{e['id']}: verb {pre}+{stem} not in lexicon")
        else:
            v = matches[0]
            if "part-end" in roles and e["word"] != v["part2"]: err(f"{e['id']}: participle != lexicon {v['part2']}")
            if "inf-end" in roles and e["word"] != v["inf"]: err(f"{e['id']}: infinitive != lexicon {v['inf']}")
            if "ge" in roles and not sep: err(f"{e['id']}: ge in inseparable verb")
    if "part" in roles and "tokens" not in e:
        base = e["word"]
        # strip plural ending if the example marks one (compound heads like Sicherheitsschuhe)
        if roles[-1] == "pl-end": base = base[: -len(allm[-1]["form"])]
        sp = split_compound(base)
        if not sp: err(f"{e['id']}: compound {base} does not split into lexicon items + Fugen")
        # the example's own segmentation must itself be a valid lexicon split
        own = [(m["role"], m["form"].lower()) for m in allm if m["role"] in ("part","fuge","noun")]
        if "".join(s for _, s in own) != base.lower(): err(f"{e['id']}: segmentation does not cover word")
        for k, (role, seg) in enumerate(own):
            if role == "fuge":
                if seg not in FUGEN or k == 0 or own[k-1][0] == "fuge": err(f"{e['id']}: bad fuge position {seg}")
            elif seg not in noun_parts and seg not in parts:
                err(f"{e['id']}: segment {seg} not in lexicon")
        if own[-1][0] != "noun" or own[-1][1] not in noun_parts: err(f"{e['id']}: head {own[-1][1]} is not a lexicon noun")

REQUIRED_COMPOUNDS = ["Krankenversicherungskarte","Arbeitsvertrag","Ausbildungsplatz","Berufsschule","Werkzeugkasten",
                      "Sicherheitsschuhe","Krankenhaus","Führerschein","Aufenthaltstitel"]
words = {e["word"] for e in decon}
for w in REQUIRED_COMPOUNDS:
    if w not in words: err(f"required compound {w} missing")
for w in ["angekommen","aufgestanden","eingeladen","angemeldet","ausgefüllt","mitgebracht","abgeholt","anrufen","aufstehen",
          "verstanden","bezahlt","erklärt","Männer","Bücher"]:
    if w not in words: err(f"required decon word {w} missing")
if stats["np"] < 10: err("fewer than 10 noun-phrase examples")
if stats["compound"] < 9: err("fewer than 9 compound examples")
if stats["verb"] < 9: err("fewer than 9 verb examples")
if stats["plural"] < 2: err("fewer than 2 plural examples")

# ---------- report ----------
print("drills:", len(drills))
for f in sorted(fam): print(f"  {f}: {fam[f]}")
print("drillTypes:", dict(types))
print("decon:", len(decon), dict(stats))
print("lexicon: nouns", len(lex["nouns"]), "parts", len(lex["parts"]), "adjectives", len(lex["adjectives"]), "verbs", len(lex["verbs"]))
if errors:
    print("\nERRORS:")
    for e in errors: print(" -", e)
    sys.exit(1)
print("\nALL CHECKS PASSED")
