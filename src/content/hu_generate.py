"""Hungarian noun-form generator — implements the rules of SCHEMA.md §3a.

Public API
----------
forms(entry)            -> dict[surface, list[morpheme]]   (first analysis per surface)
analyses(entry)         -> list[(surface, morphemes, tags)] (every analysis, incl. duplicates)
parse(word, lexicon)    -> list[(entry, morphemes)] for every entry/analysis whose surface == word

A morpheme is {"form": str, "role": str, "label": str}; roles are the schema roles
stem / link / pl / poss / poss-pl / case.  Linking vowels are always emitted as their
own `link` morpheme.  Concatenating the forms of an analysis always equals its surface.

Harmony conventions (deliberately explicit, see report):
* 2-form suffixes (ban/ben, ba/be, ból/ből, ra/re, ról/ről, nál/nél, tól/től, nak/nek,
  val/vel, the a/e linking vowel before -t and before plural-possessed -i) follow the
  entry's `harmony`: back -> a-form, front or frontRounded -> e-form.
* 3-form suffixes (hoz/hez/höz, on/en/ön, tok/tek/tök) follow the LAST non-neutral vowel
  of whatever has been added after the stem (linking vowel, plural, possessive); if
  nothing with a vowel was added, the entry's `harmony` decides.  i/í are neutral.
  This is what makes könyv -> könyvetek, könyvekhez, könyveken (not *könyvetök) and
  kert -> kertünkön, kertünkhöz correct.
"""
from __future__ import annotations

BACK = set("aáoóuú")
FRONT = set("eé")
ROUNDED = set("öőüű")
NEUTRAL = set("ií")
VOWELS = BACK | FRONT | ROUNDED | NEUTRAL

# longest first so that 'dzs' wins over 'zs'/'dz'
DIGRAPHS = ("dzs", "cs", "dz", "gy", "ly", "ny", "sz", "ty", "zs")

TWO_FORM = {
    "ine": ("ban", "ben", "inessive — in"),
    "ill": ("ba", "be", "illative — into"),
    "ela": ("ból", "ből", "elative — out of"),
    "sub": ("ra", "re", "sublative — onto"),
    "del": ("ról", "ről", "delative — off / about"),
    "ade": ("nál", "nél", "adessive — at, by"),
    "abl": ("tól", "től", "ablative — from (near)"),
    "dat": ("nak", "nek", "dative — to, for"),
}
INVARIANT = {
    "ter": ("ig", "terminative — as far as, until"),
    "cau": ("ért", "causal-final — for"),
    "ess": ("ként", "essive — as"),
}
THREE_FORM = {
    "all": ("hoz", "hez", "höz", "allative — to (near)"),
    "sup": ("on", "en", "ön", "superessive — on"),
}
CASE_KEYS = list(TWO_FORM) + list(INVARIANT) + ["all", "sup", "ins", "acc"]


def m(form: str, role: str, label: str) -> dict:
    return {"form": form, "role": role, "label": label}


def lengthen(s: str) -> str:
    """Final a/e -> á/é (applied before any suffix)."""
    if s.endswith("a"):
        return s[:-1] + "á"
    if s.endswith("e"):
        return s[:-1] + "é"
    return s


def vowel_class(ch: str) -> str | None:
    if ch in BACK:
        return "back"
    if ch in FRONT:
        return "front"
    if ch in ROUNDED:
        return "frontRounded"
    return None  # neutral or consonant


def tail_class(tail: str, default: str) -> str:
    """Class of the last non-neutral vowel of `tail`, else `default`."""
    for ch in reversed(tail):
        c = vowel_class(ch)
        if c:
            return c
    return default


def two(h: str) -> int:
    return 0 if h == "back" else 1


def three(c: str) -> int:
    return {"back": 0, "front": 1, "frontRounded": 2}[c]


def _concat(ms) -> str:
    return "".join(x["form"] for x in ms)


def _copy(ms):
    return [dict(x) for x in ms]


# ----------------------------------------------------------------------------
# stems
# ----------------------------------------------------------------------------
def _oblj(entry) -> str:
    """Stem used before the j-possessives (-ja/-je, -juk/-jük, -jai/-jei).

    Optional lexicon field `oblj`; when absent this is simply the (lengthened) oblique
    stem, i.e. exactly the SCHEMA §3a rule.  It exists for stems whose j-possessive is
    built on a different stem than the linking-vowel forms: út -> utak but útja,
    anya -> anyák but anyja, idő -> idők but ideje, ajtó -> ajtók but ajtaja/ajtajai.
    """
    return entry.get("oblj") or lengthen(entry["obl"])


def _stem(entry, form: str) -> dict:
    base, obl, gloss, h = entry["base"], entry["obl"], entry["gloss"], entry["harmony"]
    if form == base:
        return m(form, "stem", f"{gloss} ({h} stem)")
    if form == lengthen(base) and form != base:
        return m(form, "stem", f"{gloss} — final {base[-1]} lengthens to {form[-1]} before a suffix")
    if form == obl or form == lengthen(obl):
        return m(form, "stem", f"{gloss} — {base} becomes {form}- before linking-vowel suffixes")
    is_oblj, is_oblpl = form == entry.get("oblj"), form == entry.get("oblpl")
    if is_oblj and is_oblpl:
        return m(form, "stem", f"{gloss} — irregular: {base} becomes {form}- before the 3rd-person and plural-possessed suffixes")
    if is_oblj:
        return m(form, "stem", f"{gloss} — irregular: {base} becomes {form}- before the j-possessives (-ja/-je, -juk/-jük{', -jai/-jei' if entry.get('ji') else ''})")
    if is_oblpl:
        return m(form, "stem", f"{gloss} — irregular: {base} becomes {form}- before the plural-possessed -i")
    return m(form, "stem", f"{gloss} ({h} stem; surface stem {form})")


# ----------------------------------------------------------------------------
# attaching a case suffix to an existing analysis
# ----------------------------------------------------------------------------
def add_case(entry, ms, case: str):
    """Return new morpheme list = ms + case suffix `case` (one of CASE_KEYS)."""
    h = entry["harmony"]
    ms = _copy(ms)
    last = ms[-1]
    if last["form"] and last["form"][-1] in "ae":
        last["form"] = lengthen(last["form"])
        last["label"] += f" — final {last['form'][-1]} is the lengthened form taken before a case suffix"
    surface = _concat(ms)
    stem_len = len(ms[0]["form"])
    tail = surface[stem_len:]
    c3 = tail_class(tail, h)
    ends_vowel = surface[-1] in VOWELS

    if case in TWO_FORM:
        b, f, gl = TWO_FORM[case]
        suf = (b, f)[two(h)]
        ms.append(m(suf, "case", f"{gl} ({'back' if two(h) == 0 else 'front'} form of -{b}/-{f})"))
        return ms
    if case in INVARIANT:
        suf, gl = INVARIANT[case]
        ms.append(m(suf, "case", f"{gl} (invariant -{suf})"))
        return ms
    if case == "all":
        b, f, r, gl = THREE_FORM["all"]
        suf = (b, f, r)[three(c3)]
        ms.append(m(suf, "case", f"{gl} ({suf} of -hoz/-hez/-höz, 3-form harmony)"))
        return ms
    if case == "sup":
        b, f, r, gl = THREE_FORM["sup"]
        if ends_vowel:
            ms.append(m("n", "case", f"{gl} (just -n after a vowel)"))
        else:
            suf = (b, f, r)[three(c3)]
            ms.append(m(suf, "case", f"{gl} ({suf} of -on/-en/-ön, 3-form harmony)"))
        return ms
    if case == "acc":
        if ends_vowel:
            ms.append(m("t", "case", "accusative — direct object (-t directly after a vowel)"))
        else:
            lv = ("a", "e")[two(h)]
            ms.append(m(lv, "link", f"linking vowel {lv} before -t (a/e by harmony after a suffix)"))
            ms.append(m("t", "case", "accusative — direct object"))
        return ms
    if case == "ins":
        suf = ("val", "vel")[two(h)]
        if ends_vowel:
            ms.append(m(suf, "case", f"instrumental — with (-{suf} after a vowel)"))
            return ms
        d = next((d for d in DIGRAPHS if surface.endswith(d)), None)
        if d:
            # hegy + vel -> heggyel: written heg + gyel so that forms concatenate
            cut = len(d) - 1
            last = ms[-1]
            last["form"] = last["form"][:-cut]
            last["label"] += f" — final digraph {d} doubles to {d[0] + d} with -{suf}; written {last['form']}+{d + suf[1:]}"
            ms.append(m(d + suf[1:], "case", f"instrumental -{suf}: v assimilates to the final {d} ({d} -> {d[0] + d})"))
        else:
            c = surface[-1]
            ms.append(m(c + suf[1:], "case", f"instrumental -{suf}: v assimilates to the final consonant ({c} + {suf} -> {c}{c}{suf[1:]})"))
        return ms
    raise ValueError(case)


# ----------------------------------------------------------------------------
# bases: plural, accusative, superessive (explicit forms split into morphemes)
# ----------------------------------------------------------------------------
def _split_plural(entry):
    base, obl, lv, pl = entry["base"], entry["obl"], entry["lv"], entry["pl"]
    lobl = lengthen(obl)
    if pl == lobl + lv + "k":
        ms = [_stem(entry, lobl)]
        if lv:
            ms.append(m(lv, "link", f"linking vowel {lv} before plural -k"))
        ms.append(m("k", "pl", "plural"))
        return ms, True
    # fallback: not derivable from obl + lv + k
    return [_stem(entry, pl[:-1]), m("k", "pl", "plural")], False


def _split_acc(entry):
    base, obl, lv, acc = entry["base"], entry["obl"], entry["lv"], entry["acc"]
    lbase, lobl = lengthen(base), lengthen(obl)
    if acc == lbase + "t":
        return [_stem(entry, lbase), m("t", "case", "accusative — direct object (-t directly on the stem)")], True
    for v in (lv, "a", "e", "o", "ö"):
        if v and acc == lobl + v + "t":
            return [_stem(entry, lobl), m(v, "link", f"linking vowel {v} before -t"),
                    m("t", "case", "accusative — direct object")], True
    if acc == lobl + "t":
        return [_stem(entry, lobl), m("t", "case", "accusative — direct object")], True
    return [_stem(entry, acc[:-1]), m("t", "case", "accusative — direct object")], False


def _split_sup(entry):
    base, obl, sup = entry["base"], entry["obl"], entry["sup"]
    lbase, lobl = lengthen(base), lengthen(obl)
    if sup == lbase + "n":
        return [_stem(entry, lbase), m("n", "case", "superessive — on (just -n after a vowel)")], True
    for st in (base, lobl):
        for v in ("o", "e", "ö"):
            if sup == st + v + "n":
                return [_stem(entry, st), m(v + "n", "case", f"superessive — on ({v}n of -on/-en/-ön, 3-form harmony)")], True
    return [_stem(entry, sup[:-1]), m("n", "case", "superessive — on")], False


# ----------------------------------------------------------------------------
# possessives
# ----------------------------------------------------------------------------
PERSONS = ["1SG", "2SG", "3SG", "1PL", "2PL", "3PL"]
PERSON_GLOSS = {"1SG": "my", "2SG": "your (sg)", "3SG": "his/her/its", "1PL": "our", "2PL": "your (pl)", "3PL": "their"}


def _poss_sg(entry, person):
    obl, lv, h, j3 = entry["obl"], entry["lv"], entry["harmony"], entry["j3"]
    lobl = lengthen(obl)
    if j3 and person in ("3SG", "3PL"):
        lobl = _oblj(entry)
    ms = [_stem(entry, lobl)]
    ends_vowel = lobl[-1] in VOWELS
    gl = PERSON_GLOSS[person]
    if person in ("1SG", "2SG", "2PL"):
        if lv:
            ms.append(m(lv, "link", f"linking vowel {lv} before the possessive"))
        if person == "1SG":
            ms.append(m("m", "poss", f"1SG possessor — {gl}"))
        elif person == "2SG":
            ms.append(m("d", "poss", f"2SG possessor — {gl}"))
        else:
            c = tail_class(lv, h)
            suf = ("tok", "tek", "tök")[three(c)]
            ms.append(m(suf, "poss", f"2PL possessor — {gl} ({suf} of -tok/-tek/-tök)"))
    elif person == "3SG":
        v = ("a", "e")[two(h)]
        suf = ("j" if j3 else "") + v
        ms.append(m(suf, "poss", f"3SG possessor — {gl} (-{suf}{'; this stem takes j' if j3 else ''})"))
    elif person == "1PL":
        suf = "nk" if ends_vowel else ("unk", "ünk")[two(h)]
        ms.append(m(suf, "poss", f"1PL possessor — {gl} (-{suf}{' after a vowel' if ends_vowel else ''})"))
    elif person == "3PL":
        v = ("uk", "ük")[two(h)]
        suf = ("j" if j3 else "") + v
        ms.append(m(suf, "poss", f"3PL possessor — {gl} (-{suf}{'; this stem takes j' if j3 else ''})"))
    return ms


def _poss_pl(entry, person):
    obl, lv, h, ji = entry["obl"], entry["lv"], entry["harmony"], entry["ji"]
    # optional `oblpl`: stem before plural-possessed -i when it differs from the
    # oblique stem (szülő -> szülője but szülei/szüleim).  Note idő -> ideje but
    # regular időim/idői, and ajtó -> ajtaja, ajtajai/ajtajaim (oblj + ji), so
    # neither needs oblpl.
    lobl = entry.get("oblpl") or (_oblj(entry) if ji else lengthen(obl))
    ms = [_stem(entry, lobl)]
    v = ("a", "e")[two(h)]
    if ji:
        ms.append(m("j" + v, "link", f"j + linking vowel {v} before plural-possessed -i (this stem takes j)"))
    elif lv:
        ms.append(m(v, "link", f"linking vowel {v} before plural-possessed -i"))
    ms.append(m("i", "poss-pl", "plural of the possessed thing"))
    gl = PERSON_GLOSS[person]
    if person == "1SG":
        ms.append(m("m", "poss", f"1SG possessor — {gl}"))
    elif person == "2SG":
        ms.append(m("d", "poss", f"2SG possessor — {gl}"))
    elif person == "3SG":
        pass  # 3SG possessor is unmarked after -i (házai)
    elif person == "1PL":
        ms.append(m("nk", "poss", f"1PL possessor — {gl}"))
    elif person == "2PL":
        suf = ("tok", "tek")[two(h)]
        ms.append(m(suf, "poss", f"2PL possessor — {gl} (-{suf})"))
    elif person == "3PL":
        ms.append(m("k", "poss", f"3PL possessor — {gl} (-k after -i)"))
    return ms


# ----------------------------------------------------------------------------
# full paradigm
# ----------------------------------------------------------------------------
def analyses(entry):
    """Every generated form of `entry` as (surface, morphemes, tags)."""
    out = []
    base = entry["base"]
    lbase = lengthen(base)

    def emit(ms, tags):
        out.append((_concat(ms), ms, tags))

    emit([_stem(entry, base)], ["base"])
    # cases directly on the base
    for ck in CASE_KEYS:
        if ck == "acc":
            ms, ok = _split_acc(entry)
            emit(ms, ["acc"] + ([] if ok else ["irregular-split"]))
        elif ck == "sup":
            ms, ok = _split_sup(entry)
            emit(ms, ["sup"] + ([] if ok else ["irregular-split"]))
        else:
            emit(add_case(entry, [_stem(entry, lbase)], ck), ["case", ck])
    # plural and plural + case
    pl_ms, ok = _split_plural(entry)
    emit(pl_ms, ["pl"] + ([] if ok else ["irregular-split"]))
    for ck in CASE_KEYS:
        emit(add_case(entry, pl_ms, ck), ["pl", "case", ck])
    # possessive singular-possessed (+ case)
    for p in PERSONS:
        ms = _poss_sg(entry, p)
        emit(ms, ["poss.sg", p])
        for ck in CASE_KEYS:
            emit(add_case(entry, ms, ck), ["poss.sg", p, "case", ck])
    # possessive plural-possessed (+ case)
    for p in PERSONS:
        ms = _poss_pl(entry, p)
        emit(ms, ["poss.pl", p])
        for ck in CASE_KEYS:
            emit(add_case(entry, ms, ck), ["poss.pl", p, "case", ck])
    return out


def forms(entry) -> dict:
    """surface -> morpheme list (first analysis wins on a within-entry collision)."""
    d = {}
    for surface, ms, _tags in analyses(entry):
        d.setdefault(surface, ms)
    return d


def parse(word: str, lexicon) -> list:
    """All (entry, morphemes) whose generated surface equals `word`."""
    hits = []
    for entry in lexicon:
        for surface, ms, _tags in analyses(entry):
            if surface == word:
                hits.append((entry, ms))
    return hits


if __name__ == "__main__":  # tiny smoke test
    demo = {"base": "ház", "gloss": "house", "harmony": "back", "obl": "ház", "lv": "a",
            "acc": "házat", "pl": "házak", "sup": "házon", "j3": False, "ji": False, "notes": ""}
    f = forms(demo)
    for w in ("ház", "házat", "házak", "házon", "házzal", "házaimban", "házunkhoz", "házatokat"):
        print(w, "->", " + ".join(x["form"] + ":" + x["role"] for x in f[w]))
