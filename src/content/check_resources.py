#!/usr/bin/env python3 -I
"""Validate /home/claude/content/resources.json against DAY1_SPEC.md §Resources.

Run:  python3 -I /home/claude/content/check_resources.py [path/to/resources.json]
Exit code 0 = all checks passed; 1 = at least one error (listed on stderr).
"""
import json
import re
import sys
from collections import Counter

PATH = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/content/resources.json"

REQUIRED = {
    "id": str, "lang": str, "name": str, "url": str, "what": str, "use": str,
    "cost": str, "fromStage": int, "toStage": int, "priority": str,
    "protocol": str, "verified": bool, "checked": str,
}
OPTIONAL = {"note": str}
LANGS = {"de", "hu", "both"}
PRIORITIES = {"core", "optional"}
PROTOCOL_RE = re.compile(r"^(P-([1-9]|1[0-3])|D5|D6)$")
ID_RE = re.compile(r"^(de|hu|both)-[a-z0-9]+(-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL_RE = re.compile(r"^https?://[^\s]+$")
WHAT_MAX_WORDS = 12
CORE_STAGE1_MIN, CORE_STAGE1_MAX = 3, 5
# Stage 0 exists only for Hungarian (weeks 1-2: sounds). "both" uses German stages.
MIN_STAGE = {"de": 1, "hu": 0, "both": 1}
MAX_STAGE = 4

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


try:
    with open(PATH, encoding="utf-8") as fh:
        data = json.load(fh)
except (OSError, json.JSONDecodeError) as exc:
    print(f"ERROR: cannot load {PATH}: {exc}", file=sys.stderr)
    sys.exit(1)

if not isinstance(data, list) or not data:
    print("ERROR: top level must be a non-empty JSON array", file=sys.stderr)
    sys.exit(1)

ids = Counter()
for i, item in enumerate(data):
    tag = f"[{i}] {item.get('id', '?') if isinstance(item, dict) else '?'}"
    if not isinstance(item, dict):
        err(f"{tag}: not an object")
        continue
    # required fields and types
    for key, typ in REQUIRED.items():
        if key not in item:
            err(f"{tag}: missing field '{key}'")
        elif not isinstance(item[key], typ) or (typ is int and isinstance(item[key], bool)):
            err(f"{tag}: field '{key}' must be {typ.__name__}")
    for key in item:
        if key not in REQUIRED and key not in OPTIONAL:
            err(f"{tag}: unknown field '{key}'")
    if "note" in item and not isinstance(item["note"], str):
        err(f"{tag}: 'note' must be a string")
    if errors and errors[-1].startswith(tag):
        continue  # type errors above make the rest unreliable

    ids[item["id"]] += 1
    if not ID_RE.match(item["id"]):
        err(f"{tag}: id must look like de-foo-bar / hu-foo / both-foo")
    if not item["id"].startswith(item["lang"] + "-"):
        err(f"{tag}: id prefix must match lang '{item['lang']}'")
    if item["lang"] not in LANGS:
        err(f"{tag}: lang must be one of {sorted(LANGS)}")
    if item["priority"] not in PRIORITIES:
        err(f"{tag}: priority must be core|optional")
    if not PROTOCOL_RE.match(item["protocol"]):
        err(f"{tag}: protocol '{item['protocol']}' not in P-1..P-13, D5, D6")
    if not DATE_RE.match(item["checked"]):
        err(f"{tag}: checked must be YYYY-MM-DD")
    for key in ("name", "what", "use", "cost"):
        if not item[key].strip():
            err(f"{tag}: '{key}' is empty")
    nwords = len(item["what"].split())
    if nwords > WHAT_MAX_WORDS:
        err(f"{tag}: 'what' has {nwords} words (max {WHAT_MAX_WORDS})")
    if not re.search(r"\b(P-\d{1,2}|D5|D6)\b", item["use"]):
        err(f"{tag}: 'use' must name a protocol (P-n, D5 or D6)")
    if item["url"] == "claude.ai":
        pass  # spec: Claude in chat has no URL
    elif not URL_RE.match(item["url"]):
        err(f"{tag}: url is not an http(s) URL")
    elif "verified" in item and item["verified"] is False and not item.get("note"):
        err(f"{tag}: verified:false requires a 'note' saying why")
    # stage ranges
    lo, hi = item["fromStage"], item["toStage"]
    mn = MIN_STAGE.get(item["lang"], 1)
    if not (mn <= lo <= MAX_STAGE):
        err(f"{tag}: fromStage {lo} outside {mn}..{MAX_STAGE} for lang {item['lang']}")
    if not (mn <= hi <= MAX_STAGE):
        err(f"{tag}: toStage {hi} outside {mn}..{MAX_STAGE} for lang {item['lang']}")
    if lo > hi:
        err(f"{tag}: fromStage {lo} > toStage {hi}")

for dup, n in ids.items():
    if n > 1:
        err(f"duplicate id '{dup}' ({n} times)")

# core counts per language at the language's start (fromStage <= 1); 'both' counts for each
core_start = {"de": [], "hu": []}
for item in data:
    if not isinstance(item, dict) or item.get("priority") != "core":
        continue
    if item.get("fromStage", 99) <= 1:
        for lang in ("de", "hu"):
            if item.get("lang") in (lang, "both"):
                core_start[lang].append(item["id"])
for lang, found in core_start.items():
    if not (CORE_STAGE1_MIN <= len(found) <= CORE_STAGE1_MAX):
        err(f"{lang}: {len(found)} core items at fromStage<=1 (need {CORE_STAGE1_MIN}-{CORE_STAGE1_MAX}): {found}")

# summary
by_lang = Counter(i["lang"] for i in data if isinstance(i, dict))
by_lang_prio = Counter((i["lang"], i["priority"]) for i in data if isinstance(i, dict))
unverified = [(i["id"], i.get("note", "")) for i in data if isinstance(i, dict) and i.get("verified") is False]

print(f"{PATH}: {len(data)} resources")
for lang in ("de", "hu", "both"):
    print(f"  {lang}: {by_lang.get(lang, 0)} total, {by_lang_prio.get((lang, 'core'), 0)} core, {by_lang_prio.get((lang, 'optional'), 0)} optional")
for lang, found in core_start.items():
    print(f"  core at start ({lang}, fromStage<=1): {len(found)} -> {', '.join(found)}")
print(f"  verified: {len(data) - len(unverified)} / unverified: {len(unverified)}")
for rid, note in unverified:
    print(f"    - {rid}: {note[:110]}{'…' if len(note) > 110 else ''}")
for w in warnings:
    print("WARN:", w)
if errors:
    for e in errors:
        print("ERROR:", e, file=sys.stderr)
    print(f"{len(errors)} error(s)", file=sys.stderr)
    sys.exit(1)
print("OK")
