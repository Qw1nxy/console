/* engines.js — rule-based German and Hungarian morphology engines for the
   Operative's Linguistic Console.  Plain browser JavaScript: no imports, no DOM,
   never touches browser storage.  Every function is pure and takes the lexicon as an argument.

   API: see /home/claude/app/ENGINE_API.md.  Defines one global:
     const OLC_ENGINES = { hu, de, detectLang, version: "1" }

   The Hungarian generator is a faithful port of /home/claude/content/hu_generate.py
   (same rules, same morpheme splits, linking vowels as separate `link` morphemes). */
const OLC_ENGINES = (function () {
  "use strict";

  // ───────────────────────────── shared helpers ─────────────────────────────
  function normWord(w) {
    return String(w == null ? "" : w).trim().replace(/\s+/g, " ");
  }
  function M(form, role, label) {
    return { form: form, role: role, label: label };
  }
  function concatForms(ms) {
    return ms.map(function (x) { return x.form; }).join("");
  }
  function copyMs(ms) {
    return ms.map(function (x) { return { form: x.form, role: x.role, label: x.label }; });
  }

  // ═══════════════════════════════ HUNGARIAN ═══════════════════════════════
  //
  // Vowel classes.  Hungarian suffixes "harmonise" with the vowels of the word:
  //   back  (a á o ó u ú)        → -ban, -hoz, -on, -tok …
  //   front (e é)                → -ben, -hez, -en, -tek …
  //   front rounded (ö ő ü ű)    → -ben, -höz, -ön, -tök …  (only 3-form suffixes differ)
  //   neutral (i í)              → do not decide harmony on their own.
  var HU_BACK = "aáoóuú", HU_FRONT = "eé", HU_ROUNDED = "öőüű", HU_NEUTRAL = "ií";
  var HU_VOWELS = HU_BACK + HU_FRONT + HU_ROUNDED + HU_NEUTRAL;
  // longest first so that "dzs" wins over "zs"/"dz"
  var HU_DIGRAPHS = ["dzs", "cs", "dz", "gy", "ly", "ny", "sz", "ty", "zs"];

  // 2-form case suffixes: [back form, front form, meaning]
  var HU_TWO_FORM = {
    ine: ["ban", "ben", "inessive — in"],
    ill: ["ba", "be", "illative — into"],
    ela: ["ból", "ből", "elative — out of"],
    sub: ["ra", "re", "sublative — onto"],
    del: ["ról", "ről", "delative — off / about"],
    ade: ["nál", "nél", "adessive — at, by"],
    abl: ["tól", "től", "ablative — from (near)"],
    dat: ["nak", "nek", "dative — to, for"]
  };
  // invariant suffixes (one form for every stem)
  var HU_INVARIANT = {
    ter: ["ig", "terminative — as far as, until"],
    cau: ["ért", "causal-final — for"],
    ess: ["ként", "essive — as"]
  };
  // 3-form suffixes: [back, front, front rounded, meaning]
  var HU_THREE_FORM = {
    all: ["hoz", "hez", "höz", "allative — to (near)"],
    sup: ["on", "en", "ön", "superessive — on"]
  };
  var HU_CASE_KEYS = ["ine", "ill", "ela", "sub", "del", "ade", "abl", "dat", "ter", "cau", "ess", "all", "sup", "ins", "acc"];
  // UI case keys (ENGINE_API: the BACK form names the case) → internal keys
  var HU_CASE_BY_UI = {
    ban: "ine", ba: "ill", "ból": "ela", on: "sup", ra: "sub", "ról": "del", "nál": "ade",
    hoz: "all", "tól": "abl", t: "acc", nak: "dat", val: "ins", ig: "ter", "ért": "cau", "ként": "ess"
  };
  var HU_CASE_GLOSS = {
    ine: "in (inessive)", ill: "into (illative)", ela: "out of (elative)", sub: "onto (sublative)",
    del: "off / about (delative)", ade: "at, by (adessive)", abl: "from (ablative)", dat: "to, for (dative)",
    ter: "as far as, until (terminative)", cau: "for (causal-final)", ess: "as (essive)",
    all: "to, towards (allative)", sup: "on (superessive)", ins: "with (instrumental)", acc: "direct object (accusative)"
  };
  var HU_PERSONS = ["1SG", "2SG", "3SG", "1PL", "2PL", "3PL"];
  var HU_PERSON_GLOSS = { "1SG": "my", "2SG": "your (sg)", "3SG": "his/her/its", "1PL": "our", "2PL": "your (pl)", "3PL": "their" };

  // Final a/e → á/é (applied before any suffix): kutya → kutyát, kutyák, kutyában.
  function huLengthen(s) {
    if (s.slice(-1) === "a") return s.slice(0, -1) + "á";
    if (s.slice(-1) === "e") return s.slice(0, -1) + "é";
    return s;
  }
  function huVowelClass(ch) {
    if (HU_BACK.indexOf(ch) >= 0) return "back";
    if (HU_FRONT.indexOf(ch) >= 0) return "front";
    if (HU_ROUNDED.indexOf(ch) >= 0) return "frontRounded";
    return null; // neutral vowel or consonant
  }
  // Class of the last non-neutral vowel of `tail`, else `dflt`.
  function huTailClass(tail, dflt) {
    for (var i = tail.length - 1; i >= 0; i--) {
      var c = huVowelClass(tail[i]);
      if (c) return c;
    }
    return dflt;
  }
  function two(h) { return h === "back" ? 0 : 1; }
  function three(c) { return c === "back" ? 0 : c === "front" ? 1 : 2; }
  function isHuVowel(ch) { return HU_VOWELS.indexOf(ch) >= 0; }

  // Stem used before the j-possessives (-ja/-je, -juk/-jük, -jai/-jei).  Optional lexicon
  // field `oblj`; when absent it is the lengthened oblique stem (út → utak but útja).
  function huOblj(entry) {
    return entry.oblj || huLengthen(entry.obl);
  }

  // The stem morpheme, labelled with the alternation it shows (if any).
  function huStem(entry, form) {
    var base = entry.base, obl = entry.obl, gloss = entry.gloss, h = entry.harmony;
    if (form === base) return M(form, "stem", gloss + " (" + h + " stem)");
    if (form === huLengthen(base) && form !== base)
      return M(form, "stem", gloss + " — final " + base.slice(-1) + " lengthens to " + form.slice(-1) + " before a suffix");
    if (form === obl || form === huLengthen(obl))
      return M(form, "stem", gloss + " — " + base + " becomes " + form + "- before linking-vowel suffixes");
    if (form === entry.oblj || form === entry.oblpl)
      return M(form, "stem", gloss + " — irregular: " + base + " becomes " + form + "- before the 3rd-person / plural possessive");
    return M(form, "stem", gloss + " (" + h + " stem; surface stem " + form + ")");
  }

  // Attach a case suffix to an existing analysis (ms = stem [+ link] [+ pl | poss…]).
  function huAddCase(entry, msIn, cas) {
    var h = entry.harmony;
    var ms = copyMs(msIn);
    var last = ms[ms.length - 1];
    // Rule: a final short a/e lengthens before any further suffix (háza → házában, kertje → kertjével).
    if (last.form && "ae".indexOf(last.form.slice(-1)) >= 0) {
      last.form = huLengthen(last.form);
      last.label += " — final " + last.form.slice(-1) + " is the lengthened form taken before a case suffix";
    }
    var surface = concatForms(ms);
    var stemLen = ms[0].form.length;
    var tail = surface.slice(stemLen);
    // 3-form suffixes follow the last non-neutral vowel of what was ADDED after the stem
    // (könyv-ek-en, kert-ünk-ön); with nothing added, the entry's harmony decides.
    var c3 = huTailClass(tail, h);
    var endsVowel = isHuVowel(surface.slice(-1));
    var t, suf;

    if (HU_TWO_FORM[cas]) {
      t = HU_TWO_FORM[cas];
      suf = t[two(h)];
      ms.push(M(suf, "case", t[2] + " (" + (two(h) === 0 ? "back" : "front") + " form of -" + t[0] + "/-" + t[1] + ")"));
      return ms;
    }
    if (HU_INVARIANT[cas]) {
      t = HU_INVARIANT[cas];
      ms.push(M(t[0], "case", t[1] + " (invariant -" + t[0] + ")"));
      return ms;
    }
    if (cas === "all") {
      t = HU_THREE_FORM.all;
      suf = t[three(c3)];
      ms.push(M(suf, "case", t[3] + " (" + suf + " of -hoz/-hez/-höz, 3-form harmony)"));
      return ms;
    }
    if (cas === "sup") {
      t = HU_THREE_FORM.sup;
      if (endsVowel) {
        // superessive after a vowel is just -n (házán, autón)
        ms.push(M("n", "case", t[3] + " (just -n after a vowel)"));
      } else {
        suf = t[three(c3)];
        ms.push(M(suf, "case", t[3] + " (" + suf + " of -on/-en/-ön, 3-form harmony)"));
      }
      return ms;
    }
    if (cas === "acc") {
      if (endsVowel) {
        ms.push(M("t", "case", "accusative — direct object (-t directly after a vowel)"));
      } else {
        // after a plural or possessive the accusative always takes a/e: házakat, kerteket, házamat
        var lv = ["a", "e"][two(h)];
        ms.push(M(lv, "link", "linking vowel " + lv + " before -t (a/e by harmony after a suffix)"));
        ms.push(M("t", "case", "accusative — direct object"));
      }
      return ms;
    }
    if (cas === "ins") {
      suf = ["val", "vel"][two(h)];
      if (endsVowel) {
        ms.push(M(suf, "case", "instrumental — with (-" + suf + " after a vowel)"));
        return ms;
      }
      // -val/-vel after a consonant: the v becomes a copy of that consonant (ház + val → házzal).
      var d = null;
      for (var i = 0; i < HU_DIGRAPHS.length; i++) {
        if (surface.slice(-HU_DIGRAPHS[i].length) === HU_DIGRAPHS[i]) { d = HU_DIGRAPHS[i]; break; }
      }
      if (d) {
        // digraph doubles its first letter: hegy + vel → heggyel, written heg + gyel so forms concatenate
        var cut = d.length - 1;
        last = ms[ms.length - 1];
        last.form = last.form.slice(0, last.form.length - cut);
        last.label += " — final digraph " + d + " doubles to " + d[0] + d + " with -" + suf + "; written " + last.form + "+" + d + suf.slice(1);
        ms.push(M(d + suf.slice(1), "case", "instrumental -" + suf + ": v assimilates to the final " + d + " (" + d + " -> " + d[0] + d + ")"));
      } else {
        var c = surface.slice(-1);
        ms.push(M(c + suf.slice(1), "case", "instrumental -" + suf + ": v assimilates to the final consonant (" + c + " + " + suf + " -> " + c + c + suf.slice(1) + ")"));
      }
      return ms;
    }
    throw new Error("unknown case " + cas);
  }

  // Explicit lexicon forms (pl, acc, sup) split into morphemes.  Returns [morphemes, regular?].
  function huSplitPlural(entry) {
    var obl = entry.obl, lv = entry.lv, pl = entry.pl;
    var lobl = huLengthen(obl);
    if (pl === lobl + lv + "k") {
      var ms = [huStem(entry, lobl)];
      if (lv) ms.push(M(lv, "link", "linking vowel " + lv + " before plural -k"));
      ms.push(M("k", "pl", "plural"));
      return [ms, true];
    }
    // fallback: not derivable from obl + lv + k
    return [[huStem(entry, pl.slice(0, -1)), M("k", "pl", "plural")], false];
  }
  function huSplitAcc(entry) {
    var base = entry.base, obl = entry.obl, lv = entry.lv, acc = entry.acc;
    var lbase = huLengthen(base), lobl = huLengthen(obl);
    if (acc === lbase + "t")
      return [[huStem(entry, lbase), M("t", "case", "accusative — direct object (-t directly on the stem)")], true];
    var vs = [lv, "a", "e", "o", "ö"];
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v && acc === lobl + v + "t")
        return [[huStem(entry, lobl), M(v, "link", "linking vowel " + v + " before -t"), M("t", "case", "accusative — direct object")], true];
    }
    if (acc === lobl + "t")
      return [[huStem(entry, lobl), M("t", "case", "accusative — direct object")], true];
    return [[huStem(entry, acc.slice(0, -1)), M("t", "case", "accusative — direct object")], false];
  }
  function huSplitSup(entry) {
    var base = entry.base, obl = entry.obl, sup = entry.sup;
    var lbase = huLengthen(base), lobl = huLengthen(obl);
    if (sup === lbase + "n")
      return [[huStem(entry, lbase), M("n", "case", "superessive — on (just -n after a vowel)")], true];
    var sts = [base, lobl], vs = ["o", "e", "ö"];
    for (var i = 0; i < sts.length; i++) {
      for (var j = 0; j < vs.length; j++) {
        if (sup === sts[i] + vs[j] + "n")
          return [[huStem(entry, sts[i]), M(vs[j] + "n", "case", "superessive — on (" + vs[j] + "n of -on/-en/-ön, 3-form harmony)")], true];
      }
    }
    return [[huStem(entry, sup.slice(0, -1)), M("n", "case", "superessive — on")], false];
  }

  // Singular-possessed: 1SG obl+lv+m, 2SG obl+lv+d, 3SG obl+(j)+a/e, 1PL obl+unk/ünk (nk after a
  // vowel), 2PL obl+lv+tok/tek/tök, 3PL obl+(j)+uk/ük.
  function huPossSg(entry, person) {
    var obl = entry.obl, lv = entry.lv, h = entry.harmony, j3 = !!entry.j3;
    var lobl = huLengthen(obl);
    if (j3 && (person === "3SG" || person === "3PL")) lobl = huOblj(entry);
    var ms = [huStem(entry, lobl)];
    var endsVowel = isHuVowel(lobl.slice(-1));
    var gl = HU_PERSON_GLOSS[person];
    var v, suf;
    if (person === "1SG" || person === "2SG" || person === "2PL") {
      if (lv) ms.push(M(lv, "link", "linking vowel " + lv + " before the possessive"));
      if (person === "1SG") ms.push(M("m", "poss", "1SG possessor — " + gl));
      else if (person === "2SG") ms.push(M("d", "poss", "2SG possessor — " + gl));
      else {
        var c = huTailClass(lv, h);
        suf = ["tok", "tek", "tök"][three(c)];
        ms.push(M(suf, "poss", "2PL possessor — " + gl + " (" + suf + " of -tok/-tek/-tök)"));
      }
    } else if (person === "3SG") {
      v = ["a", "e"][two(h)];
      suf = (j3 ? "j" : "") + v;
      ms.push(M(suf, "poss", "3SG possessor — " + gl + " (-" + suf + (j3 ? "; this stem takes j" : "") + ")"));
    } else if (person === "1PL") {
      suf = endsVowel ? "nk" : ["unk", "ünk"][two(h)];
      ms.push(M(suf, "poss", "1PL possessor — " + gl + " (-" + suf + (endsVowel ? " after a vowel" : "") + ")"));
    } else if (person === "3PL") {
      v = ["uk", "ük"][two(h)];
      suf = (j3 ? "j" : "") + v;
      ms.push(M(suf, "poss", "3PL possessor — " + gl + " (-" + suf + (j3 ? "; this stem takes j" : "") + ")"));
    }
    return ms;
  }

  // Plural-possessed: obl + (ji ? j+a/e : (lv ? a/e : "")) + i + {m, d, "", nk, tok/tek, k}.
  function huPossPl(entry, person) {
    var obl = entry.obl, lv = entry.lv, h = entry.harmony, ji = !!entry.ji;
    // optional `oblpl`: stem before plural-possessed -i when it differs (idő → idei, ajtó → ajtai)
    var lobl = entry.oblpl || (ji ? huOblj(entry) : huLengthen(obl));
    var ms = [huStem(entry, lobl)];
    var v = ["a", "e"][two(h)];
    if (ji) ms.push(M("j" + v, "link", "j + linking vowel " + v + " before plural-possessed -i (this stem takes j)"));
    else if (lv) ms.push(M(v, "link", "linking vowel " + v + " before plural-possessed -i"));
    ms.push(M("i", "poss-pl", "plural of the possessed thing"));
    var gl = HU_PERSON_GLOSS[person];
    if (person === "1SG") ms.push(M("m", "poss", "1SG possessor — " + gl));
    else if (person === "2SG") ms.push(M("d", "poss", "2SG possessor — " + gl));
    else if (person === "3SG") { /* 3SG possessor is unmarked after -i (házai) */ }
    else if (person === "1PL") ms.push(M("nk", "poss", "1PL possessor — " + gl));
    else if (person === "2PL") {
      var suf = ["tok", "tek"][two(h)];
      ms.push(M(suf, "poss", "2PL possessor — " + gl + " (-" + suf + ")"));
    } else if (person === "3PL") ms.push(M("k", "poss", "3PL possessor — " + gl + " (-k after -i)"));
    return ms;
  }

  // A chain records which slots were filled: { plural, possessor, pluralPossessed, case, tags }.
  function huChain(o) {
    return {
      plural: !!o.plural,
      possessor: o.possessor || null,
      pluralPossessed: !!o.pluralPossessed,
      "case": o["case"] || null,
      tags: o.tags || []
    };
  }

  // Every generated form of `entry` as { surface, morphemes, chain } (same order as the Python).
  function huAnalyses(entry) {
    var out = [];
    var base = entry.base, lbase = huLengthen(base);
    function emit(ms, chain) { out.push({ surface: concatForms(ms), morphemes: ms, chain: chain }); }
    var i, p, ck, r;
    emit([huStem(entry, base)], huChain({ tags: ["base"] }));
    // cases directly on the base (accusative and superessive from the explicit lexicon forms)
    for (i = 0; i < HU_CASE_KEYS.length; i++) {
      ck = HU_CASE_KEYS[i];
      if (ck === "acc") { r = huSplitAcc(entry); emit(r[0], huChain({ "case": "acc", tags: ["acc"].concat(r[1] ? [] : ["irregular-split"]) })); }
      else if (ck === "sup") { r = huSplitSup(entry); emit(r[0], huChain({ "case": "sup", tags: ["sup"].concat(r[1] ? [] : ["irregular-split"]) })); }
      else emit(huAddCase(entry, [huStem(entry, lbase)], ck), huChain({ "case": ck, tags: ["case", ck] }));
    }
    // plural and plural + case
    r = huSplitPlural(entry);
    var plMs = r[0];
    emit(plMs, huChain({ plural: true, tags: ["pl"].concat(r[1] ? [] : ["irregular-split"]) }));
    for (i = 0; i < HU_CASE_KEYS.length; i++) {
      ck = HU_CASE_KEYS[i];
      emit(huAddCase(entry, plMs, ck), huChain({ plural: true, "case": ck, tags: ["pl", "case", ck] }));
    }
    // possessive, singular possessed (+ case)
    for (p = 0; p < HU_PERSONS.length; p++) {
      var ms = huPossSg(entry, HU_PERSONS[p]);
      emit(ms, huChain({ possessor: HU_PERSONS[p], tags: ["poss.sg", HU_PERSONS[p]] }));
      for (i = 0; i < HU_CASE_KEYS.length; i++) {
        ck = HU_CASE_KEYS[i];
        emit(huAddCase(entry, ms, ck), huChain({ possessor: HU_PERSONS[p], "case": ck, tags: ["poss.sg", HU_PERSONS[p], "case", ck] }));
      }
    }
    // possessive, plural possessed (+ case)
    for (p = 0; p < HU_PERSONS.length; p++) {
      var ms2 = huPossPl(entry, HU_PERSONS[p]);
      emit(ms2, huChain({ possessor: HU_PERSONS[p], pluralPossessed: true, tags: ["poss.pl", HU_PERSONS[p]] }));
      for (i = 0; i < HU_CASE_KEYS.length; i++) {
        ck = HU_CASE_KEYS[i];
        emit(huAddCase(entry, ms2, ck), huChain({ possessor: HU_PERSONS[p], pluralPossessed: true, "case": ck, tags: ["poss.pl", HU_PERSONS[p], "case", ck] }));
      }
    }
    return out;
  }

  // Map surface → { morphemes, chain } (first analysis wins on a within-entry collision).
  function huGenerateForms(entry) {
    var map = new Map();
    if (!entry || !entry.base) return map;
    var all = huAnalyses(entry);
    for (var i = 0; i < all.length; i++) {
      if (!map.has(all[i].surface)) map.set(all[i].surface, { morphemes: all[i].morphemes, chain: all[i].chain });
    }
    return map;
  }

  // Plain-English explanation of one analysis, assembled from the chain.
  function huExplain(entry, ms, chain) {
    var h = entry.harmony;
    var hName = h === "back" ? "back-vowel" : h === "front" ? "front-vowel" : "front-rounded";
    var s = [];
    var stem = ms[0].form;
    var cm = ms[ms.length - 1];
    // -val/-vel after a digraph (hegy + vel → heggyel) is written heg + gyel: detect that split
    var insDigraph = null;
    if (chain["case"] === "ins") {
      for (var di = 0; di < HU_DIGRAPHS.length; di++) if (cm.form.indexOf(HU_DIGRAPHS[di]) === 0) { insDigraph = HU_DIGRAPHS[di]; break; }
    }
    var first = entry.base + " ‘" + entry.gloss + "’ is a " + hName + " stem";
    if (stem !== entry.base) {
      if (stem === huLengthen(entry.base)) first += "; its final " + entry.base.slice(-1) + " lengthens to " + stem.slice(-1) + " before a suffix";
      else if (stem === entry.obl || stem === huLengthen(entry.obl)) first += "; before linking-vowel suffixes it uses the oblique stem " + stem + "-";
      else if (insDigraph && ms.length === 2) first += "; it is written " + stem + " + " + cm.form + " only because the doubled digraph " + insDigraph[0] + insDigraph + " cannot be cut cleanly";
      else first += "; here it appears in the irregular stem form " + stem + "-";
    }
    s.push(first + ".");
    var link = null, i;
    for (i = 0; i < ms.length; i++) if (ms[i].role === "link") { link = ms[i]; break; }
    if (chain.plural) {
      s.push("Plural -k" + (link ? " needs the linking vowel " + link.form + " after a consonant (this stem's linking vowel is " + (entry.lv || link.form) + ")" : " attaches directly to the vowel-final stem") + ".");
    } else if (chain.possessor) {
      var poss = null;
      for (i = 0; i < ms.length; i++) if (ms[i].role === "poss") poss = ms[i];
      var who = HU_PERSON_GLOSS[chain.possessor];
      var t = "The " + chain.possessor + " possessive ‘" + who + "’";
      if (chain.pluralPossessed) t += " is built on -i (more than one thing possessed)" + (poss ? " plus -" + poss.form : " with no extra ending for 3SG");
      else if (poss) t += " is -" + poss.form.replace(/[áé]$/, function (c) { return c === "á" ? "a" : "e"; }) + (entry.j3 && (chain.possessor === "3SG" || chain.possessor === "3PL") ? " (this stem takes j)" : "");
      if (link) t += "; the linking vowel " + link.form + " sits between stem and suffix";
      s.push(t + ".");
    } else if (link) {
      s.push("The linking vowel " + link.form + " is inserted because the stem ends in a consonant and this stem takes " + link.form + ".");
    }
    if (chain["case"]) {
      var meaning = HU_CASE_GLOSS[chain["case"]] || chain["case"];
      var ct = "The case suffix -" + cm.form + " means " + meaning;
      var vv = ["val", "vel"][two(h)];
      if (HU_TWO_FORM[chain["case"]]) ct += "; it is a two-form suffix (-" + HU_TWO_FORM[chain["case"]][0] + "/-" + HU_TWO_FORM[chain["case"]][1] + ") and takes the " + (h === "back" ? "back" : "front") + " form";
      else if (chain["case"] === "all" || chain["case"] === "sup") ct += "; it is a three-form suffix (" + HU_THREE_FORM[chain["case"]].slice(0, 3).map(function (x) { return "-" + x; }).join("/") + ") chosen by the last non-neutral vowel before it" + (cm.form === "n" ? ", shortened to -n after a vowel" : "");
      else if (chain["case"] === "ins") {
        if (/^v/.test(cm.form)) ct += "; -" + vv + " stays intact after a vowel";
        else if (insDigraph) ct = "The case suffix -" + vv + " means " + meaning + "; its v assimilates to the final digraph " + insDigraph + ", which doubles its first letter (" + insDigraph + " → " + insDigraph[0] + insDigraph + "), so -" + vv + " surfaces as -" + cm.form;
        else ct = "The case suffix -" + vv + " means " + meaning + "; its v becomes a copy of the final consonant " + cm.form[0] + " (" + concatForms(ms.slice(0, -1)) + " + " + vv + " → " + concatForms(ms) + ")";
      } else if (chain["case"] === "acc") ct += (chain.plural || chain.possessor) && ms.length > 2 && ms[ms.length - 2].role === "link" ? "; after a plural or possessive the accusative always takes the linking vowel " + ms[ms.length - 2].form + " (a/e by harmony)" : "";
      else ct += "; it has one invariant form";
      s.push(ct + ".");
    }
    if (ms.length > 2) s.push("Order is always stem → (linking vowel) → number/possessive → case.");
    return s.slice(0, 4).join(" ");
  }

  // Lexicon index: lowercase surface → [{ entry, morphemes, chain }], cached per lexicon array.
  var huIndexCache = new WeakMap();
  // Cheap change detector so in-place edits from the Content Manager invalidate the cache.
  function huSignature(lexicon) {
    try { return JSON.stringify(lexicon); } catch (e) { return String(Math.random()); }
  }
  function huIndex(lexicon) {
    if (!Array.isArray(lexicon)) return new Map();
    var sig = huSignature(lexicon);
    var cached = huIndexCache.get(lexicon);
    if (cached && cached.sig === sig) return cached.index;
    var index = new Map();
    for (var i = 0; i < lexicon.length; i++) {
      var entry = lexicon[i];
      if (!entry || typeof entry.base !== "string" || typeof entry.obl !== "string") continue;
      var all;
      try { all = huAnalyses(entry); } catch (e) { continue; } // a malformed entry never breaks parsing
      for (var k = 0; k < all.length; k++) {
        var key = all[k].surface.toLowerCase();
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ entry: entry, morphemes: all[k].morphemes, chain: all[k].chain });
      }
    }
    huIndexCache.set(lexicon, { sig: sig, index: index });
    return index;
  }

  function huParse(word, lexicon) {
    var w = normWord(word);
    if (!w) return [];
    var hits = huIndex(lexicon).get(w.toLowerCase()) || [];
    var out = hits.map(function (hit) {
      return {
        lang: "hu", word: w, kind: "noun",
        morphemes: copyMs(hit.morphemes),
        explain: huExplain(hit.entry, hit.morphemes, hit.chain),
        entry: hit.entry, chain: hit.chain, confidence: 1
      };
    });
    out.sort(function (a, b) { return a.morphemes.length - b.morphemes.length; });
    return out;
  }

  // Compose a form from options (see ENGINE_API hu.build).
  function huBuild(entry, opts) {
    opts = opts || {};
    if (!entry || typeof entry.base !== "string") return { error: "No stem chosen." };
    if (opts.plural && opts.pluralPossessed) return { error: "Plural and plural-possessed are mutually exclusive: házaim already means ‘my houses’." };
    if (opts.pluralPossessed && !opts.possessor) return { error: "Plural-possessed (-i) needs a possessor." };
    var person = opts.possessor ? String(opts.possessor).toUpperCase() : null;
    if (person && HU_PERSONS.indexOf(person) < 0) return { error: "Unknown possessor " + opts.possessor + "." };
    var ck = null;
    if (opts["case"]) {
      ck = HU_CASE_BY_UI[opts["case"]] || (HU_CASE_KEYS.indexOf(opts["case"]) >= 0 ? opts["case"] : null);
      if (!ck) return { error: "Unknown case " + opts["case"] + "." };
    }
    var ms, r;
    try {
      if (opts.plural) ms = huSplitPlural(entry)[0];
      else if (person) ms = opts.pluralPossessed ? huPossPl(entry, person) : huPossSg(entry, person);
      else ms = null;
      if (ck) {
        if (ms) ms = huAddCase(entry, ms, ck);
        else if (ck === "acc") { r = huSplitAcc(entry); ms = r[0]; }   // explicit lexicon form
        else if (ck === "sup") { r = huSplitSup(entry); ms = r[0]; }   // explicit lexicon form
        else ms = huAddCase(entry, [huStem(entry, huLengthen(entry.base))], ck);
      }
      if (!ms) ms = [huStem(entry, entry.base)];
    } catch (e) {
      return { error: "Could not build this form: " + (e && e.message ? e.message : e) };
    }
    var chain = huChain({ plural: !!opts.plural, possessor: person, pluralPossessed: !!opts.pluralPossessed, "case": ck });
    return { word: concatForms(ms), morphemes: ms, explain: huExplain(entry, ms, chain), entry: entry, chain: chain };
  }

  // Heuristic right-to-left peel of known suffixes for a word not in the lexicon.
  var HU_GUESS_CASES = [
    ["ban", "ine"], ["ben", "ine"], ["ból", "ela"], ["ből", "ela"], ["ról", "del"], ["ről", "del"],
    ["nál", "ade"], ["nél", "ade"], ["hoz", "all"], ["hez", "all"], ["höz", "all"], ["tól", "abl"], ["től", "abl"],
    ["nak", "dat"], ["nek", "dat"], ["ként", "ess"], ["ért", "cau"], ["val", "ins"], ["vel", "ins"],
    ["ba", "ill"], ["be", "ill"], ["ra", "sub"], ["re", "sub"], ["ig", "ter"],
    ["on", "sup"], ["en", "sup"], ["ön", "sup"], ["ot", "acc"], ["at", "acc"], ["et", "acc"], ["öt", "acc"], ["t", "acc"], ["n", "sup"]
  ];
  function huGuessUnknown(word, lexicon) {
    var w = normWord(word);
    var rest = w.toLowerCase();
    var tail = [];           // morphemes peeled, in reverse order
    var assumed = [];
    var i;
    function endsWith(s, suf) { return s.length > suf.length && s.slice(-suf.length) === suf; }
    // 1. a case suffix at the very end
    for (i = 0; i < HU_GUESS_CASES.length; i++) {
      var suf = HU_GUESS_CASES[i][0], key = HU_GUESS_CASES[i][1];
      if (endsWith(rest, suf)) {
        if ((suf === "t" || suf === "n") && isHuVowel(rest.slice(-2, -1)) === false && rest.length < 4) continue;
        if (key === "acc" && suf.length === 2) {
          // "at/et/ot/öt" = linking vowel + t
          tail.push(M("t", "case", "accusative — direct object (assumed)"));
          tail.push(M(suf[0], "link", "linking vowel " + suf[0] + " before -t (assumed)"));
        } else {
          tail.push(M(suf, "case", (HU_CASE_GLOSS[key] || key) + " — -" + suf + " (assumed)"));
        }
        rest = rest.slice(0, -suf.length);
        assumed.push("-" + suf + " as the " + (HU_CASE_GLOSS[key] || key) + " suffix");
        break;
      }
    }
    // 2. a possessive ending (singular or plural possessed)
    var POSS = [["aim", "1SG", true], ["eim", "1SG", true], ["aid", "2SG", true], ["eid", "2SG", true], ["aink", "1PL", true], ["eink", "1PL", true],
      ["aitok", "2PL", true], ["eitek", "2PL", true], ["aik", "3PL", true], ["eik", "3PL", true], ["ai", "3SG", true], ["ei", "3SG", true],
      ["unk", "1PL", false], ["ünk", "1PL", false], ["nk", "1PL", false], ["tok", "2PL", false], ["tek", "2PL", false], ["tök", "2PL", false],
      ["juk", "3PL", false], ["jük", "3PL", false], ["uk", "3PL", false], ["ük", "3PL", false], ["ja", "3SG", false], ["je", "3SG", false],
      ["já", "3SG", false], ["jé", "3SG", false], ["om", "1SG", false], ["am", "1SG", false], ["em", "1SG", false], ["öm", "1SG", false],
      ["od", "2SG", false], ["ad", "2SG", false], ["ed", "2SG", false], ["öd", "2SG", false], ["m", "1SG", false], ["d", "2SG", false],
      ["a", "3SG", false], ["e", "3SG", false], ["á", "3SG", false], ["é", "3SG", false]];
    var foundPoss = false;
    for (i = 0; i < POSS.length && !foundPoss; i++) {
      var ps = POSS[i][0], who = POSS[i][1], plPoss = POSS[i][2];
      if (!endsWith(rest, ps) || rest.length - ps.length < 2) continue;
      if (ps.length === 1 && !tail.length) continue; // a bare final m/d/a/e is too weak a signal alone
      if (plPoss) {
        var after = ps.slice(2); // ending after the a/e + i
        if (after) tail.push(M(after, "poss", who + " possessor — " + HU_PERSON_GLOSS[who] + " (assumed)"));
        tail.push(M("i", "poss-pl", "plural of the possessed thing (assumed)"));
        tail.push(M(ps[0], "link", "linking vowel " + ps[0] + " before -i (assumed)"));
      } else if (/^[oaeö][md]$/.test(ps)) {
        tail.push(M(ps[1], "poss", who + " possessor — " + HU_PERSON_GLOSS[who] + " (assumed)"));
        tail.push(M(ps[0], "link", "linking vowel " + ps[0] + " before the possessive (assumed)"));
      } else {
        tail.push(M(ps, "poss", who + " possessor — " + HU_PERSON_GLOSS[who] + " (assumed)"));
      }
      rest = rest.slice(0, -ps.length);
      assumed.push("-" + ps + " as the " + who + " possessive");
      foundPoss = true;
    }
    // 3. plural -k (with its linking vowel)
    if (!foundPoss && endsWith(rest, "k") && rest.length > 3) {
      var lvk = rest.slice(-2, -1);
      tail.push(M("k", "pl", "plural (assumed)"));
      if ("aeoö".indexOf(lvk) >= 0 && !isHuVowel(rest.slice(-3, -2))) {
        tail.push(M(lvk, "link", "linking vowel " + lvk + " before plural -k (assumed)"));
        rest = rest.slice(0, -2);
      } else rest = rest.slice(0, -1);
      assumed.push("-k as the plural");
    }
    // the stem keeps the input's spelling
    var stemForm = w.slice(0, rest.length);
    var ms = [M(stemForm, "stem", "unknown stem")].concat(tail.reverse());
    var lastV = null;
    for (i = stemForm.length - 1; i >= 0; i--) { var vc = huVowelClass(stemForm[i].toLowerCase()); if (vc) { lastV = vc; break; } }
    var explain = "“" + w + "” is not in the lexicon. " +
      (assumed.length ? "Peeling known endings from the right, I assumed " + assumed.join(", then ") + ", leaving the unknown stem “" + stemForm + "”." : "No known Hungarian ending was found, so the whole word is treated as an unknown stem.") +
      (lastV ? " Its last full vowel suggests a " + (lastV === "back" ? "back" : lastV === "front" ? "front" : "front-rounded") + "-vowel stem." : "") +
      " Add the stem to the lexicon to get a verified analysis.";
    return { lang: "hu", word: w, kind: "noun", morphemes: ms, explain: explain, confidence: 0.3, unknown: true };
  }

  var hu = { generateForms: huGenerateForms, parse: huParse, build: huBuild, guessUnknown: huGuessUnknown };

  // ════════════════════════════════ GERMAN ════════════════════════════════
  var DE_CASES = ["nom", "acc", "dat", "gen"];
  var DE_CASE_NAME = { nom: "nominative", acc: "accusative", dat: "dative", gen: "genitive" };
  var DE_CASE_USE = {
    nom: "subject", acc: "direct object", dat: "dative — indirect object or after dative prepositions (mit, zu, bei, nach, aus, von)",
    gen: "genitive — possession / after wegen, trotz, während"
  };
  var DE_GENDER_NAME = { m: "masculine", f: "feminine", n: "neuter", pl: "plural" };
  var DE_ARTICLE = { m: "der", f: "die", n: "das" };
  function lc(s) { return String(s).toLowerCase(); }
  function lcFirst(s) { return s ? s[0].toLowerCase() + s.slice(1) : s; }

  // Determiner tables.  A "slot" is a (case, gender) pair; gender "pl" = plural (gender irrelevant).
  //   definite:  der/die/das/die; den/die/das/die; dem/der/dem/den; des/der/des/der
  var DE_DEF = {
    nom: { m: "der", f: "die", n: "das", pl: "die" }, acc: { m: "den", f: "die", n: "das", pl: "die" },
    dat: { m: "dem", f: "der", n: "dem", pl: "den" }, gen: { m: "des", f: "der", n: "des", pl: "der" }
  };
  //   ein-words (ein, kein, mein, dein, sein, ihr, unser, euer, Ihr): stem + ending
  var DE_EIN_END = {
    nom: { m: "", f: "e", n: "", pl: "e" }, acc: { m: "en", f: "e", n: "", pl: "e" },
    dat: { m: "em", f: "er", n: "em", pl: "en" }, gen: { m: "es", f: "er", n: "es", pl: "er" }
  };
  //   STRONG adjective endings (no article): m er/en/em/en; f e/e/er/er; n es/es/em/en; pl e/e/en/er
  //   (genitive m/n is -en because the noun itself carries the genitive -s/-es: guten Weines)
  var DE_STRONG = {
    nom: { m: "er", f: "e", n: "es", pl: "e" }, acc: { m: "en", f: "e", n: "es", pl: "e" },
    dat: { m: "em", f: "er", n: "em", pl: "en" }, gen: { m: "en", f: "er", n: "en", pl: "er" }
  };
  //   der-words (dieser, jeder) decline like der/die/das: genitive m/n -es (dieses Mannes)
  var DE_DER_WORD = {
    nom: { m: "er", f: "e", n: "es", pl: "e" }, acc: { m: "en", f: "e", n: "es", pl: "e" },
    dat: { m: "em", f: "er", n: "em", pl: "en" }, gen: { m: "es", f: "er", n: "es", pl: "er" }
  };
  // WEAK adjective endings (after der/die/das, dieser, jeder): nom sg -e; acc sg m -en, f/n -e; dat/gen -en; pl -en
  var DE_WEAK = {
    nom: { m: "e", f: "e", n: "e", pl: "en" }, acc: { m: "en", f: "e", n: "e", pl: "en" },
    dat: { m: "en", f: "en", n: "en", pl: "en" }, gen: { m: "en", f: "en", n: "en", pl: "en" }
  };
  // MIXED adjective endings (after ein-words): nom sg m -er, nom/acc sg n -es, otherwise weak
  var DE_MIXED = {
    nom: { m: "er", f: "e", n: "es", pl: "en" }, acc: { m: "en", f: "e", n: "es", pl: "en" },
    dat: { m: "en", f: "en", n: "en", pl: "en" }, gen: { m: "en", f: "en", n: "en", pl: "en" }
  };
  function deAdjEnding(pattern, cas, g) {
    var t = pattern === "weak" ? DE_WEAK : pattern === "mixed" ? DE_MIXED : DE_STRONG;
    return t[cas][g];
  }
  var DE_EIN_WORDS = [
    { stem: "ein", name: "indefinite article ein", noPl: true },
    { stem: "kein", name: "negative article kein-" },
    { stem: "mein", name: "possessive mein- (my)" },
    { stem: "dein", name: "possessive dein- (your, informal)" },
    { stem: "sein", name: "possessive sein- (his/its)" },
    { stem: "ihr", name: "possessive ihr-/Ihr- (her, their, or formal your)" },
    { stem: "unser", name: "possessive unser- (our)" },
    { stem: "euer", name: "possessive euer- (your, plural informal)", endStem: "eur" } // euer → eure, euren, eurem, eurer, eures
  ];
  var DE_DER_WORDS = [
    { stem: "dies", name: "demonstrative dieser (this)" },
    { stem: "jed", name: "jeder (every, each)", noPl: true }
  ];
  var DE_END_LIST = ["", "e", "en", "em", "er", "es"];

  // Every reading of a determiner token: { cas, g, detType, detName, ending }.
  // detType: "definite" (weak adjective), "ein" (mixed), "der-word" (weak).
  function deDetReadings(token) {
    var t = lc(token), out = [], cas, g, i, k;
    for (i = 0; i < DE_CASES.length; i++) {
      cas = DE_CASES[i];
      for (g in DE_DEF[cas]) {
        if (DE_DEF[cas][g] === t) out.push({ cas: cas, g: g, detType: "definite", detName: "definite article", ending: null });
      }
    }
    for (k = 0; k < DE_EIN_WORDS.length; k++) {
      var w = DE_EIN_WORDS[k];
      for (i = 0; i < DE_CASES.length; i++) {
        cas = DE_CASES[i];
        for (g in DE_EIN_END[cas]) {
          var end = DE_EIN_END[cas][g];
          if (g === "pl" && w.noPl) continue;
          var form = end ? (w.endStem || w.stem) + end : w.stem;
          if (form === t) out.push({ cas: cas, g: g, detType: "ein", detName: w.name, ending: end, stem: w.stem });
        }
      }
    }
    for (k = 0; k < DE_DER_WORDS.length; k++) {
      var d = DE_DER_WORDS[k];
      for (i = 0; i < DE_CASES.length; i++) {
        cas = DE_CASES[i];
        for (g in DE_DER_WORD[cas]) {
          if (g === "pl" && d.noPl) continue;
          if (d.stem + DE_DER_WORD[cas][g] === t) out.push({ cas: cas, g: g, detType: "der-word", detName: d.name, ending: DE_DER_WORD[cas][g], stem: d.stem });
        }
      }
    }
    return out;
  }
  function deDetLabel(r, token) {
    var slot = DE_CASE_NAME[r.cas] + " " + (r.g === "pl" ? "plural" : DE_GENDER_NAME[r.g] + " singular");
    if (r.detType === "definite") {
      var note = "";
      if (r.g === "f" && (r.cas === "dat" || r.cas === "gen")) note = " (die → der)";
      if (r.g === "m" && r.cas === "acc") note = " (der → den)";
      return "definite article — " + slot + note;
    }
    if (r.detType === "ein") {
      return r.detName + (r.ending ? " with " + slot + " ending -" + r.ending : " — " + slot + " (no ending, so the adjective must show the gender)");
    }
    return r.detName + " — " + slot + " (ending -" + r.ending + ", declined like der/die/das)";
  }

  // Noun endings.  Genitive sg m/n: +es if the base ends in s, ß, x, z, tz, sch; else +s.  Feminine: unchanged.
  function deGenEnding(noun) {
    if (noun.gender === "f") return "";
    if (/(s|ß|x|z|sch)$/i.test(noun.base)) {
      // Bus → Busses: a single final s doubles when the plural shows the doubling (Busse)
      if (/[^s]s$/i.test(noun.base) && noun.pl && lc(noun.pl).indexOf(lc(noun.base) + "s") === 0) return "ses";
      return "es";
    }
    // One-syllable nouns ending in a consonant take -es in standard teaching usage (des Mannes, des Tages);
    // longer nouns and vowel-final nouns take -s (des Vertrags, des Autos, des Kaffees).
    var vowelGroups = (lc(noun.base).match(/[aeiouäöüy]+/g) || []).length;
    if (vowelGroups === 1 && /[^aeiouäöüyh]$/i.test(noun.base)) return "es";
    return "s";
  }
  // Dative plural: +n unless the plural already ends in n or s.
  function deDatPlEnding(noun) {
    return /[ns]$/i.test(noun.pl) ? "" : "n";
  }
  function deUmlaut(s) {
    return s.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/Ä/g, "A").replace(/Ö/g, "O").replace(/Ü/g, "U");
  }
  // Split a noun's plural into stem + ending, noting umlaut: Mann/Männer → ["Männ", "er", "a → ä"].
  function dePluralSplit(noun) {
    var base = noun.base, pl = noun.pl || "";
    if (!pl) return null;
    var dbase = lc(deUmlaut(base)), dpl = lc(deUmlaut(pl));
    var i = 0;
    while (i < dbase.length && i < dpl.length && dbase[i] === dpl[i]) i++;
    var stem = pl.slice(0, i), ending = pl.slice(i);
    var um = null;
    for (var k = 0; k < i; k++) {
      if (lc(base[k]) !== lc(pl[k])) { um = base[k] + " → " + pl[k]; break; }
    }
    return { stem: stem, ending: ending, umlaut: um, dropped: base.slice(i) };
  }
  function deNounDesc(noun) {
    return noun.gloss + " — " + DE_ARTICLE[noun.gender] + " " + noun.base + ", " + DE_GENDER_NAME[noun.gender];
  }
  // Noun morphemes for a surface token (keeps the token's spelling) in a given number/case.
  //   kind: "base" | "gen" | "pl" | "datpl" | "zeropl"
  function deNounMorphemes(noun, token, kind, cas) {
    var use = cas ? "; " + DE_CASE_USE[cas] : "";
    if (kind === "base") return [M(token, "noun", deNounDesc(noun) + use)];
    if (kind === "gen") {
      var ge = token.slice(noun.base.length);
      return [M(token, "noun", deNounDesc(noun) + "; genitive singular adds -" + ge + " (" + noun.base + " → " + noun.base + ge + ")" + (ge === "ses" ? " — the s doubles as in the plural " + noun.pl : ""))];
    }
    var sp = dePluralSplit(noun);
    var plLabel = "plural";
    if (!sp.ending) {
      return [M(token, "noun", deNounDesc(noun) + "; zero plural — the plural " + noun.pl + " is identical to the singular" + use)];
    }
    var stemLabel = deNounDesc(noun);
    if (sp.umlaut) stemLabel += "; stem vowel takes umlaut (" + sp.umlaut + ") in the plural";
    if (sp.dropped) stemLabel += "; drops -" + sp.dropped + " in the plural";
    var ms = [M(token.slice(0, sp.stem.length), "noun", stemLabel),
      M(token.slice(sp.stem.length, sp.stem.length + sp.ending.length), "pl-end", plLabel + " -" + sp.ending + " (" + noun.base + " → " + noun.pl + ")" + (kind === "pl" && cas ? "; " + DE_CASE_USE[cas] : ""))];
    if (kind === "datpl") {
      ms.push(M(token.slice(sp.stem.length + sp.ending.length), "pl-end", "dative plural -n (added when the plural does not already end in -n or -s)"));
    }
    return ms;
  }
  // All surface forms of a noun that can close a noun phrase: { form (lower), number, cases, kind }.
  function deNounForms(noun) {
    var out = [];
    var base = lc(noun.base);
    out.push({ form: base, number: "sg", cases: noun.gender === "f" ? ["nom", "acc", "dat", "gen"] : ["nom", "acc", "dat"], kind: "base" });
    if (noun.gender !== "f") {
      var ge = deGenEnding(noun);
      out.push({ form: base + ge, number: "sg", cases: ["gen"], kind: "gen" });
      if (ge === "s") out.push({ form: base + "es", number: "sg", cases: ["gen"], kind: "gen" }); // des Vertrages is equally correct
      if (ge === "es" && !/(s|ß|x|z|sch)$/i.test(noun.base)) out.push({ form: base + "s", number: "sg", cases: ["gen"], kind: "gen" }); // des Manns is a valid variant
    }
    if (noun.pl) {
      var pl = lc(noun.pl), dn = deDatPlEnding(noun);
      var sp = dePluralSplit(noun);
      out.push({ form: pl, number: "pl", cases: dn ? ["nom", "acc", "gen"] : ["nom", "acc", "dat", "gen"], kind: sp && sp.ending ? "pl" : "zeropl" });
      if (dn) out.push({ form: pl + dn, number: "pl", cases: ["dat"], kind: "datpl" });
    }
    return out;
  }

  // Lexicon indexes (cached per lexicon object).
  var deIndexCache = new WeakMap();
  function deIndex(lex) {
    lex = lex || {};
    var nouns = Array.isArray(lex.nouns) ? lex.nouns : [];
    var parts = Array.isArray(lex.parts) ? lex.parts : [];
    var adjs = Array.isArray(lex.adjectives) ? lex.adjectives : [];
    var verbs = Array.isArray(lex.verbs) ? lex.verbs : [];
    var sig;
    try { sig = JSON.stringify([nouns, parts, adjs, verbs]); } catch (e) { sig = String(Math.random()); }
    var cached = deIndexCache.get(lex);
    if (cached && cached.sig === sig) return cached.index;
    var idx = { nouns: nouns, adjs: adjs, verbs: verbs, parts: parts, nounForms: new Map(), nounByBase: new Map(), nounByPl: new Map(), adjByBase: new Map(), partDict: new Map() };
    var i, k;
    for (i = 0; i < nouns.length; i++) {
      var n = nouns[i];
      if (!n || typeof n.base !== "string") continue;
      var forms = deNounForms(n);
      for (k = 0; k < forms.length; k++) {
        if (!idx.nounForms.has(forms[k].form)) idx.nounForms.set(forms[k].form, []);
        idx.nounForms.get(forms[k].form).push({ noun: n, f: forms[k] });
      }
      if (!idx.nounByBase.has(lc(n.base))) idx.nounByBase.set(lc(n.base), []);
      idx.nounByBase.get(lc(n.base)).push(n);
      if (n.pl) {
        if (!idx.nounByPl.has(lc(n.pl))) idx.nounByPl.set(lc(n.pl), []);
        idx.nounByPl.get(lc(n.pl)).push(n);
      }
    }
    for (i = 0; i < adjs.length; i++) if (adjs[i] && adjs[i].base) idx.adjByBase.set(lc(adjs[i].base), adjs[i]);
    // compound part dictionary: lexicon `parts` entries first, then nouns' parts + bases, then adjective bases
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p && p.form && !idx.partDict.has(lc(p.form))) idx.partDict.set(lc(p.form), { label: p.gloss || p.form, kind: p.type || "part" });
    }
    for (i = 0; i < nouns.length; i++) {
      var nn = nouns[i];
      if (!nn || typeof nn.base !== "string") continue;
      var cand = [lc(nn.base)].concat((nn.parts || []).map(lc));
      for (k = 0; k < cand.length; k++) {
        if (!idx.partDict.has(cand[k])) idx.partDict.set(cand[k], { label: deNounDesc(nn).replace(/, (masculine|feminine|neuter)$/, ""), kind: "noun-part", noun: nn, isPlural: nn.pl && cand[k] === lc(nn.pl) && lc(nn.pl) !== lc(nn.base) });
      }
    }
    for (i = 0; i < adjs.length; i++) {
      var a = adjs[i];
      if (a && a.base && !idx.partDict.has(lc(a.base))) idx.partDict.set(lc(a.base), { label: a.gloss + " — adjective " + a.base + " as a compound part", kind: "adj-part" });
    }
    deIndexCache.set(lex, { sig: sig, index: idx });
    return idx;
  }

  // Adjective token = lexicon base (+ optional e-elision: teuer → teur-, dunkel → dunkl-, hoch → hoh-) + ending.
  function deAdjMatch(token, idx) {
    var t = lc(token), out = [];
    for (var i = 1; i < DE_END_LIST.length; i++) {
      var end = DE_END_LIST[i];
      if (t.length <= end.length || t.slice(-end.length) !== end) continue;
      var stem = t.slice(0, -end.length);
      var adj = idx.adjByBase.get(stem);
      var note = "";
      if (!adj) {
        // elision: base "teuer" → surface stem "teur", "dunkel" → "dunkl"; base "hoch" → "hoh"
        idx.adjByBase.forEach(function (a, base) {
          if (adj) return;
          var el = deAdjStemFor(a);
          if (el.note && el.stem === stem) { adj = a; note = el.note; }
        });
      }
      if (adj) out.push({ adj: adj, stem: token.slice(0, stem.length), ending: token.slice(stem.length), note: note });
    }
    return out;
  }
  function deAdjEndLabel(pattern, ending, cas, g, detToken) {
    var slot = DE_CASE_NAME[cas] + (g === "pl" ? " plural" : " " + DE_GENDER_NAME[g]);
    if (pattern === "weak") return "weak ending -" + ending + " (after " + detToken + ", " + slot + " — the article already shows the case)";
    if (pattern === "mixed") {
      if ((cas === "nom" && g === "m") || ((cas === "nom" || cas === "acc") && g === "n"))
        return "mixed ending -" + ending + " (" + slot + " after " + detToken + ", which has no ending — the adjective shows the gender)";
      return "mixed ending -" + ending + " (" + slot + " — " + detToken + " already carries an ending, so the adjective falls back to weak -" + ending + ")";
    }
    return "strong ending -" + ending + " (" + slot + ", no article — the adjective shows the case and gender itself)";
  }

  // NP analyser: [det] [adj…] noun.  Every consistent (case, gender/number) reading is one analysis.
  function deParseNP(input, idx) {
    var toks = input.split(" ");
    if (toks.length < 2 || toks.length > 5) return [];
    var nounTok = toks[toks.length - 1];
    var nounHits = idx.nounForms.get(lc(nounTok)) || [];
    if (!nounHits.length) return [];
    var detReadings = deDetReadings(toks[0]);
    var hasDet = detReadings.length > 0;
    var adjToks = toks.slice(hasDet ? 1 : 0, toks.length - 1);
    var adjMatches = [];
    for (var a = 0; a < adjToks.length; a++) {
      var mm = deAdjMatch(adjToks[a], idx);
      if (!mm.length) return [];
      adjMatches.push(mm);
    }
    var readings = hasDet ? detReadings : [];
    if (!hasDet) {
      // no determiner: every slot is a candidate; the strong adjective ending and the noun decide
      for (var ci = 0; ci < DE_CASES.length; ci++) for (var g in DE_STRONG[DE_CASES[ci]]) readings.push({ cas: DE_CASES[ci], g: g, detType: "none" });
      if (!adjToks.length) return []; // two bare nouns are not a phrase we analyse
    }
    var out = [];
    for (var r = 0; r < readings.length; r++) {
      var rd = readings[r];
      var pattern = rd.detType === "ein" ? "mixed" : rd.detType === "none" ? "strong" : "weak";
      for (var h = 0; h < nounHits.length; h++) {
        var nh = nounHits[h], noun = nh.noun, f = nh.f;
        // gender/number agreement: plural slot ↔ plural form; singular slot ↔ noun's gender
        if (rd.g === "pl" ? f.number !== "pl" : (f.number !== "sg" || noun.gender !== rd.g)) continue;
        if (f.cases.indexOf(rd.cas) < 0) continue;
        var want = deAdjEnding(pattern, rd.cas, rd.g);
        var adjTokens = [], ok = true;
        for (var ai = 0; ai < adjMatches.length && ok; ai++) {
          var pick = null;
          for (var mi = 0; mi < adjMatches[ai].length; mi++) if (lc(adjMatches[ai][mi].ending) === want) { pick = adjMatches[ai][mi]; break; }
          if (!pick) { ok = false; break; }
          adjTokens.push({ morphemes: [
            M(pick.stem, "adj-stem", pick.adj.gloss + pick.note),
            M(pick.ending, "adj-end", deAdjEndLabel(pattern, want, rd.cas, rd.g, hasDet ? toks[0] : "no article"))
          ] });
        }
        if (!ok) continue;
        var tokens = [];
        if (hasDet) tokens.push({ morphemes: [M(toks[0], "det", deDetLabel(rd, toks[0]))] });
        tokens = tokens.concat(adjTokens);
        tokens.push({ morphemes: deNounMorphemes(noun, nounTok, f.kind, rd.cas) });
        out.push({
          lang: "de", word: input, kind: "np", tokens: tokens,
          reading: { "case": rd.cas, gender: rd.g === "pl" ? noun.gender : rd.g, number: rd.g === "pl" ? "pl" : "sg", det: rd.detType, pattern: pattern },
          explain: deExplainNP(rd, pattern, noun, f, adjMatches.length > 0, hasDet ? toks[0] : null, want),
          entry: noun, confidence: 1
        });
      }
    }
    // stable order: nom, acc, dat, gen
    out.sort(function (x, y) { return DE_CASES.indexOf(x.reading["case"]) - DE_CASES.indexOf(y.reading["case"]); });
    return out;
  }
  function deExplainNP(rd, pattern, noun, f, hasAdj, detTok, adjEnd) {
    var s = [];
    var slot = DE_CASE_NAME[rd.cas] + " " + (rd.g === "pl" ? "plural" : DE_GENDER_NAME[rd.g] + " singular");
    if (detTok) {
      var what = rd.detType === "definite" ? "the definite article" : rd.detType === "ein" ? "an ein-word" : "a der-word (declined like the definite article)";
      s.push(detTok + " is " + what + ", read here as " + slot + ".");
    } else {
      s.push("There is no article, so the phrase is read as " + slot + " from the adjective ending and the noun.");
    }
    if (hasAdj) {
      if (pattern === "weak") s.push("After " + (rd.detType === "definite" ? "a definite article" : detTok) + " the adjective takes the weak ending: -e in the nominative singular (and feminine/neuter accusative), -en everywhere else — here -" + adjEnd + ".");
      else if (pattern === "mixed") s.push(((rd.cas === "nom" && rd.g === "m") || ((rd.cas === "nom" || rd.cas === "acc") && rd.g === "n"))
        ? "After an ein-word with no ending the adjective must show the gender itself (mixed pattern): -er for masculine nominative, -es for neuter nominative/accusative — here -" + adjEnd + "."
        : "The ein-word already carries a clear ending, so the adjective falls back to the weak -" + adjEnd + " (mixed pattern).");
      else s.push("With no article the adjective takes the strong ending — the one der/die/das would have shown: -" + adjEnd + " for " + slot + ".");
    }
    var nounNote = "‘" + noun.gloss + "’ is " + DE_ARTICLE[noun.gender] + " " + noun.base + " (" + DE_GENDER_NAME[noun.gender] + ")";
    if (f.kind === "pl" || f.kind === "zeropl") nounNote += ", plural " + noun.pl;
    if (f.kind === "datpl") nounNote += "; the dative plural adds -n to " + noun.pl;
    if (f.kind === "gen") nounNote += "; masculine/neuter genitive singular adds -" + deGenEnding(noun);
    if (rd.cas === "gen" && noun.gender === "f" && f.kind === "base") nounNote += "; feminine nouns take no genitive ending";
    s.push(nounNote + ", which is what pins the reading down.");
    return s.join(" ");
  }

  // ── Compound splitter ────────────────────────────────────────────────────
  // Fugenelemente (linking elements) that may stand between two parts.
  var DE_FUGEN = ["s", "es", "n", "en", "er", "e", "ens"];
  function deFugeLabel(fuge, prevPart) {
    var p = lc(prevPart);
    if (fuge === "s" || fuge === "es") {
      if (/(ung|heit|keit|schaft|ion|tät|ling|tum)$/.test(p)) return "linking -" + fuge + " after -" + p.match(/(ung|heit|keit|schaft|ion|tät|ling|tum)$/)[1] + " (nouns with this suffix always take -s)";
      return "linking -" + fuge + " (Fugenelement — looks like a genitive but is only a joint)";
    }
    if (fuge === "n" || fuge === "en") return "linking -" + fuge + " (Fugenelement, often the old plural or weak-noun form)";
    if (fuge === "er") return "linking -er (Fugenelement shaped like the -er plural: Bücherregal)";
    if (fuge === "e") return "linking -e (Fugenelement: Hundehütte, Badezimmer)";
    return "linking -ens (Fugenelement: Herzensangelegenheit)";
  }
  function dePartLabel(info, seg) {
    if (info.kind === "noun-part") {
      var n = info.noun;
      return n.gloss + " — " + DE_ARTICLE[n.gender] + " " + n.base + (info.isPlural ? " (plural form " + n.pl + " used as the first part)" : "");
    }
    return info.label;
  }
  // Head of a compound: a lexicon noun in its base form, or its plural (split as noun + pl-end).
  function deHeadOptions(seg, idx) {
    var out = [], i;
    var bases = idx.nounByBase.get(seg) || [];
    for (i = 0; i < bases.length; i++) out.push({ noun: bases[i], plural: false });
    var pls = idx.nounByPl.get(seg) || [];
    for (i = 0; i < pls.length; i++) if (lc(pls[i].pl) !== lc(pls[i].base)) out.push({ noun: pls[i], plural: true });
    return out;
  }
  // Recursive split of `word` into parts (+ Fugen) ending in a lexicon head noun.
  // Returns every split as { segs: [{kind, text(lower), start, end, info}], nParts, nFugen }.
  function deSplitCompound(word, idx) {
    var w = lc(word), n = w.length, results = [];
    var MAX = 6;
    function rec(i, segs, lastKind) {
      if (segs.length > MAX) return;
      var rest = w.slice(i);
      // try to finish with a head noun (needs at least one part before it)
      if (segs.length && lastKind !== "fuge-pending") {
        var heads = deHeadOptions(rest, idx);
        for (var h = 0; h < heads.length; h++) {
          var nParts = 0, nFugen = 0;
          for (var s = 0; s < segs.length; s++) { if (segs[s].kind === "part") nParts++; else nFugen++; }
          results.push({ segs: segs.concat([{ kind: "head", text: rest, start: i, end: n, head: heads[h] }]), nParts: nParts, nFugen: nFugen });
        }
      }
      // a Fuge may follow a part (never another Fuge, never start the word)
      if (segs.length && lastKind === "part") {
        for (var f = 0; f < DE_FUGEN.length; f++) {
          var fg = DE_FUGEN[f];
          if (rest.length > fg.length && rest.slice(0, fg.length) === fg) rec(i + fg.length, segs.concat([{ kind: "fuge", text: fg, start: i, end: i + fg.length }]), "fuge");
        }
      }
      // a part
      for (var j = i + 1; j < n; j++) {
        var seg = w.slice(i, j);
        var info = idx.partDict.get(seg);
        if (info) rec(j, segs.concat([{ kind: "part", text: seg, start: i, end: j, info: info }]), "part");
      }
    }
    rec(0, [], null);
    // prefer fewest parts, then fewest Fugen; drop duplicates
    results.sort(function (a, b) { return (a.nParts - b.nParts) || (a.nFugen - b.nFugen); });
    var seen = {}, uniq = [];
    for (var r = 0; r < results.length; r++) {
      var key = results[r].segs.map(function (s) { return s.kind + ":" + s.text + (s.head ? "/" + (s.head.plural ? "pl" : "sg") : ""); }).join("+");
      if (!seen[key]) { seen[key] = 1; uniq.push(results[r]); }
    }
    return uniq;
  }
  function deCompoundAnalysis(word, split) {
    var ms = [], i, seg;
    var head = split.segs[split.segs.length - 1];
    var noun = head.head.noun;
    for (i = 0; i < split.segs.length; i++) {
      seg = split.segs[i];
      var text = word.slice(seg.start, seg.end); // keep the input's spelling
      if (seg.kind === "part") ms.push(M(text, "part", dePartLabel(seg.info, text)));
      else if (seg.kind === "fuge") ms.push(M(text, "fuge", deFugeLabel(seg.text, split.segs[i - 1].text)));
      else {
        var headDesc = noun.gloss + " — " + DE_ARTICLE[noun.gender] + " " + noun.base + "; last part sets gender: " + DE_ARTICLE[noun.gender];
        if (head.head.plural) {
          var sp = dePluralSplit(noun);
          ms.push(M(text.slice(0, sp.stem.length), "noun", headDesc + (sp.umlaut ? "; umlaut " + sp.umlaut + " in the plural" : "")));
          ms.push(M(text.slice(sp.stem.length), "pl-end", "plural -" + sp.ending + " (" + noun.base + " → " + noun.pl + ") — the plural ending belongs to the head noun"));
        } else ms.push(M(text, "noun", headDesc));
      }
    }
    var partsText = split.segs.filter(function (s) { return s.kind === "part"; }).map(function (s) { return s.text; });
    var fugen = split.segs.filter(function (s) { return s.kind === "fuge"; });
    var s = ["Read compounds from the right: the last part " + noun.base + " is the head and the part(s) before it (" + partsText.join(", ") + ") say what kind of " + noun.base + ". The head gives the gender (" + DE_ARTICLE[noun.gender] + " " + word.charAt(0).toUpperCase() + word.slice(1) + ") and the plural (" + (noun.pl || "none") + ")."];
    if (fugen.length) {
      var prev = split.segs[split.segs.indexOf(fugen[0]) - 1].text;
      s.push("The -" + fugen[0].text + " after " + prev + " is a linking element (Fuge), not a genitive" + (/(ung|heit|keit|schaft|ion|tät)$/.test(prev) ? "; nouns in -" + prev.match(/(ung|heit|keit|schaft|ion|tät)$/)[1] + " always take -s." : "."));
    } else s.push("No linking element here: the parts simply join.");
    var adjPart = split.segs.filter(function (x) { return x.kind === "part" && (x.info.kind === "adj-part"); });
    var verbPart = split.segs.filter(function (x) { return x.kind === "part" && x.info.kind === "verb-part"; });
    if (adjPart.length) s.push(adjPart[0].text.charAt(0).toUpperCase() + adjPart[0].text.slice(1) + "- is an adjective used as a compound part.");
    if (verbPart.length) s.push(verbPart[0].text.charAt(0).toUpperCase() + verbPart[0].text.slice(1) + "- is a verb stem; verb stems join directly with no linking element.");
    return { lang: "de", word: word, kind: "compound", morphemes: ms, explain: s.join(" "), entry: noun, confidence: 1 };
  }
  function deParseCompound(word, idx) {
    if (word.indexOf(" ") >= 0) return [];
    var splits = deSplitCompound(word, idx);
    return splits.slice(0, 3).map(function (sp) { return deCompoundAnalysis(word, sp); });
  }

  // ── Verb analyser ────────────────────────────────────────────────────────
  var DE_SEP_PREFIXES = ["ab", "an", "auf", "aus", "bei", "ein", "fest", "fort", "her", "hin", "los", "mit", "nach", "vor", "weg", "weiter", "zu", "zurück", "zusammen", "um", "durch", "über", "unter"];
  var DE_INSEP_PREFIXES = ["be", "ge", "er", "ver", "zer", "ent", "emp", "miss"];
  function dePrefixMorpheme(v, text) {
    if (v.separable) return M(text, "sep-prefix", "separable prefix " + v.prefix + "- (stressed; splits off in main clauses: ich " + v.stem + "e … " + v.prefix + ")");
    return M(text, "insep-prefix", "inseparable prefix " + v.prefix + "- (unstressed, never splits, blocks ge-)");
  }
  function dePartEndLabel(v) {
    var changed = v.part2stem !== v.stem;
    if (v.part2end === "en") return "strong participle ending -en" + (changed ? " (with vowel change " + v.stem + " → " + v.part2stem + ")" : "");
    if (v.part2end === "et") return "weak ending -et (after a stem ending in d/t)";
    if (changed) return "mixed-verb ending -t (vowel change plus -t, like bringen → gebracht)";
    return "weak participle ending -t";
  }
  function deStemLabel(v, isPart2) {
    if (isPart2 && v.part2stem !== v.stem) return "participle stem of " + v.inf.slice(v.prefix.length) + " (" + v.stem + " → " + v.part2stem + ")";
    return "stem of " + v.inf.slice(v.prefix.length);
  }
  function deVerbExplain(v, form) {
    var s = [];
    var simple = v.inf.slice(v.prefix.length);
    if (v.prefix && v.separable) s.push(v.inf + " is a separable verb: the prefix " + v.prefix + "- is stressed and splits off in a main clause (ich " + v.stem + "e … " + v.prefix + "); it rejoins at the end of a clause and in the infinitive.");
    else if (v.prefix) s.push(v.inf + " has the inseparable prefix " + v.prefix + "-: unstressed, it never splits off, and it blocks ge- in the participle.");
    else s.push(v.inf + " is a simple verb without a prefix.");
    if (form === "part2") {
      if (v.prefix && v.separable) s.push("In the participle ge- goes between prefix and stem: " + v.prefix + "-ge-" + v.part2stem + "-" + v.part2end + ".");
      else if (v.prefix) s.push("The participle has no ge-: " + v.prefix + "-" + v.part2stem + "-" + v.part2end + ", not *ge" + v.part2 + ".");
      else s.push("The participle starts with ge-: ge-" + v.part2stem + "-" + v.part2end + ".");
      if (v.part2end === "en") s.push("Strong verb → ending -en" + (v.part2stem !== v.stem ? " and a stem-vowel change (" + v.stem + " → " + v.part2stem + ")" : "") + ".");
      else if (v.part2stem !== v.stem) s.push("Mixed verb: vowel change plus the weak ending -t.");
      else s.push("Weak verb → ending -" + v.part2end + (v.part2end === "et" ? " (the extra e is needed after d/t)" : "") + ".");
      if (v.aux) s.push("Perfekt with " + v.aux + ".");
    } else if (form === "zu-inf") {
      s.push("In the zu-infinitive zu slips between the separable prefix and the stem: " + v.prefix + "-zu-" + simple + ".");
    } else {
      s.push("Infinitive = " + (v.prefix ? "prefix + " : "") + "stem " + v.stem + " + ending -" + simple.slice(v.stem.length) + ".");
    }
    return s.slice(0, 4).join(" ");
  }
  function deParseVerb(word, idx) {
    if (word.indexOf(" ") >= 0) return [];
    var w = lc(word), out = [];
    for (var i = 0; i < idx.verbs.length; i++) {
      var v = idx.verbs[i];
      if (!v || typeof v.inf !== "string") continue;
      var pre = v.prefix || "";
      var ms, pos;
      // 1. infinitive: (prefix +) stem + en/n
      if (lc(v.inf) === w) {
        var infEnd = v.inf.slice(pre.length + v.stem.length);
        if (pre + v.stem + infEnd === v.inf && /^(en|n)$/.test(infEnd)) {
          ms = []; pos = 0;
          if (pre) { ms.push(dePrefixMorpheme(v, word.slice(0, pre.length))); pos = pre.length; }
          ms.push(M(word.slice(pos, pos + v.stem.length), "verb-stem", deStemLabel(v, false)));
          ms.push(M(word.slice(pos + v.stem.length), "inf-end", "infinitive ending -" + infEnd));
          out.push({ lang: "de", word: word, kind: "verb", morphemes: ms, explain: deVerbExplain(v, "inf"), entry: v, confidence: 1 });
        }
      }
      // 2. participle: sep prefix + ge + stem + end | insep prefix + stem + end | ge + stem + end
      if (v.part2 && lc(v.part2) === w) {
        var hasGe = v.separable || !pre;
        var expected = pre + (hasGe ? "ge" : "") + v.part2stem + v.part2end;
        if (expected === v.part2) {
          ms = []; pos = 0;
          if (pre) { ms.push(dePrefixMorpheme(v, word.slice(0, pre.length))); pos = pre.length; }
          if (hasGe) { ms.push(M(word.slice(pos, pos + 2), "ge", pre ? "participle marker ge- — goes between the separable prefix and the stem" : "participle marker ge-")); pos += 2; }
          ms.push(M(word.slice(pos, pos + v.part2stem.length), "verb-stem", deStemLabel(v, true)));
          ms.push(M(word.slice(pos + v.part2stem.length), "part-end", dePartEndLabel(v)));
          out.push({ lang: "de", word: word, kind: "verb", morphemes: ms, explain: deVerbExplain(v, "part2"), entry: v, confidence: 1 });
        }
      }
      // 3. zu-infinitive of a separable verb: aufzustehen = auf + zu + steh + en
      if (pre && v.separable && w === lc(pre + "zu" + v.inf.slice(pre.length))) {
        var tail = v.inf.slice(pre.length + v.stem.length);
        ms = [dePrefixMorpheme(v, word.slice(0, pre.length)),
          M(word.slice(pre.length, pre.length + 2), "zu", "zu of the zu-infinitive — slips between the separable prefix and the stem"),
          M(word.slice(pre.length + 2, pre.length + 2 + v.stem.length), "verb-stem", deStemLabel(v, false)),
          M(word.slice(pre.length + 2 + v.stem.length), "inf-end", "infinitive ending -" + tail)];
        out.push({ lang: "de", word: word, kind: "verb", morphemes: ms, explain: deVerbExplain(v, "zu-inf"), entry: v, confidence: 1 });
      }
    }
    return out;
  }

  // ── Bare noun / plural recogniser ────────────────────────────────────────
  function deParseNoun(word, idx) {
    if (word.indexOf(" ") >= 0) return [];
    var w = lc(word), out = [], i, n;
    var bases = idx.nounByBase.get(w) || [];
    for (i = 0; i < bases.length; i++) {
      n = bases[i];
      var lab = deNounDesc(n) + (n.pl ? "; plural " + n.pl : "; no plural") + (n.pl && lc(n.pl) === w ? " (identical to the singular)" : "");
      out.push({ lang: "de", word: word, kind: "noun", morphemes: [M(word, "noun", lab)],
        explain: n.base + " is " + DE_GENDER_NAME[n.gender] + ": " + DE_ARTICLE[n.gender] + " " + n.base + ", plural " + (n.pl || "—") + ". Learn the article with the noun — it decides every determiner and adjective ending around it.",
        entry: n, confidence: 1 });
    }
    var pls = idx.nounByPl.get(w) || [];
    for (i = 0; i < pls.length; i++) {
      n = pls[i];
      var sp = dePluralSplit(n);
      var ms, ex;
      if (!sp.ending) {
        ms = [M(word, "noun", deNounDesc(n) + "; zero plural — the plural is identical to the singular (" + n.base + " → " + n.pl + ")")];
        ex = n.base + " has a zero plural: die " + n.pl + " looks exactly like the singular. Nouns in -er, -el, -en (and most neuter -chen/-lein) often do this; only the article (die) and any adjective show the plural.";
      } else {
        var stemLab = deNounDesc(n);
        if (sp.umlaut) stemLab += "; stem vowel takes umlaut (" + sp.umlaut + ") in the plural";
        if (sp.dropped) stemLab += "; the singular's final -" + sp.dropped + " is replaced";
        ms = [M(word.slice(0, sp.stem.length), "noun", stemLab), M(word.slice(sp.stem.length), "pl-end", "plural ending -" + sp.ending)];
        ex = "Plural pattern " + (sp.umlaut ? "umlaut + " : "") + "-" + sp.ending + ": " + n.base + " → " + n.pl + "." +
          (sp.umlaut ? " The stem vowel changes (" + sp.umlaut + "); the umlaut is written on the stem, not a separate morpheme." : "") +
          (/^(e|en|n|er|s|nen)$/.test(sp.ending) ? " In the dative plural " + (/[ns]$/.test(n.pl) ? "nothing is added because the plural already ends in -" + n.pl.slice(-1) + "." : "an extra -n is added: " + n.pl + "n.") : "");
      }
      out.push({ lang: "de", word: word, kind: "plural", morphemes: ms, explain: ex, entry: n, confidence: 1 });
    }
    return out;
  }

  function deParse(input, lexicon) {
    var w = normWord(input);
    if (!w) return [];
    var idx = deIndex(lexicon);
    var out = [];
    var push = function (arr) { for (var i = 0; i < arr.length; i++) out.push(arr[i]); };
    try { push(deParseNP(w, idx)); } catch (e) { /* never let one analyser kill the others */ }
    try { push(deParseCompound(w, idx)); } catch (e2) { }
    try { push(deParseVerb(w, idx)); } catch (e3) { }
    try { push(deParseNoun(w, idx)); } catch (e4) { }
    return out;
  }

  // ── German builder ───────────────────────────────────────────────────────
  // Adjective stem before an ending: hoch → hoh-; -el drops its e (dunkel → dunkle); -er drops its e only
  // after a vowel (teuer → teure, sauer → saure) — sicher, lecker keep it (sichere).
  function deAdjStemFor(adj) {
    var b = lc(adj.base);
    if (b === "hoch") return { stem: "hoh", note: " (hoch → hoh- before an ending)" };
    if (/[^aeiouäöü]el$/.test(b) || /[aeiouäöü]er$/.test(b)) return { stem: b.slice(0, -2) + b.slice(-1), note: " (the -e of " + b + " drops before the ending)" };
    return { stem: b, note: "" };
  }
  function deBuild(opts) {
    opts = opts || {};
    var noun = opts.noun, det = opts.det || "definite", cas = opts["case"] || "nom", num = opts.number || "sg", adj = opts.adjective || null;
    if (!noun || !noun.base || !noun.gender) return { word: "", tokens: [], explain: "Choose a noun first.", error: "noun missing" };
    if (DE_CASES.indexOf(cas) < 0) return { word: "", tokens: [], explain: "Unknown case " + cas + ".", error: "bad case" };
    if (num === "pl" && !noun.pl) return { word: "", tokens: [], explain: noun.base + " has no plural in the lexicon.", error: "no plural" };
    var g = num === "pl" ? "pl" : noun.gender;
    var tokens = [], explain = [];
    var slot = DE_CASE_NAME[cas] + " " + (g === "pl" ? "plural" : DE_GENDER_NAME[g] + " singular");
    var pattern, detTok = null;
    if (det === "definite") {
      detTok = DE_DEF[cas][g]; pattern = "weak";
      tokens.push({ morphemes: [M(detTok, "det", "definite article — " + slot)] });
      explain.push("Definite article for " + slot + ": " + detTok + ".");
    } else if (det === "ein") {
      var stem = g === "pl" ? "kein" : "ein", end = DE_EIN_END[cas][g];
      detTok = stem + end; pattern = "mixed";
      tokens.push({ morphemes: [M(detTok, "det", (g === "pl" ? "kein- (ein has no plural, so kein- stands in)" : "indefinite article ein") + (end ? " with " + slot + " ending -" + end : " — " + slot + ", no ending"))] });
      explain.push((g === "pl" ? "ein has no plural, so the ein-word plural is shown with kein-: " : "Ein-word for " + slot + ": ") + detTok + ".");
    } else {
      pattern = "strong";
      explain.push("No article: the adjective must carry the case/gender ending itself (strong pattern).");
    }
    var adjEnd = null;
    if (adj && adj.base) {
      adjEnd = deAdjEnding(pattern, cas, g);
      var as = deAdjStemFor(adj);
      tokens.push({ morphemes: [M(as.stem, "adj-stem", (adj.gloss || adj.base) + as.note), M(adjEnd, "adj-end", deAdjEndLabel(pattern, adjEnd, cas, g, detTok || "no article"))] });
      if (pattern === "weak") explain.push("After a definite article the adjective is weak: -e in nominative singular (and feminine/neuter accusative), -en everywhere else → -" + adjEnd + ".");
      else if (pattern === "mixed") explain.push(((cas === "nom" && g === "m") || ((cas === "nom" || cas === "acc") && g === "n")) ? "The ein-word has no ending here, so the adjective shows the gender (mixed pattern): -" + adjEnd + "." : "The ein-word already shows the case, so the adjective takes weak -" + adjEnd + " (mixed pattern).");
      else explain.push("Strong ending -" + adjEnd + ": the ending der/die/das would have had for " + slot + ".");
    }
    // noun form
    var nounTok, nounMs;
    if (num === "sg") {
      if (cas === "gen" && noun.gender !== "f") {
        var ge = deGenEnding(noun);
        nounTok = noun.base + ge;
        nounMs = [M(nounTok, "noun", deNounDesc(noun) + "; genitive singular -" + ge + (ge === "es" ? (/(s|ß|x|z|sch)$/i.test(noun.base) ? " (after s/ß/x/z/tz/sch)" : " (one-syllable noun)") : ""))];
        explain.push("Masculine/neuter genitive singular adds -" + ge + ": " + nounTok + ".");
      } else {
        nounTok = noun.base;
        nounMs = [M(nounTok, "noun", deNounDesc(noun) + "; " + DE_CASE_USE[cas] + (cas === "gen" ? " — feminine nouns take no genitive ending" : ""))];
      }
    } else {
      var dn = cas === "dat" ? deDatPlEnding(noun) : "";
      nounTok = noun.pl + dn;
      nounMs = deNounMorphemes(noun, nounTok, dn ? "datpl" : (dePluralSplit(noun).ending ? "pl" : "zeropl"), cas);
      if (cas === "dat") explain.push(dn ? "Dative plural adds -n to the plural " + noun.pl + " → " + nounTok + "." : "Dative plural adds nothing because " + noun.pl + " already ends in -" + noun.pl.slice(-1) + ".");
    }
    tokens.push({ morphemes: nounMs });
    var word = tokens.map(function (t) { return concatForms(t.morphemes); }).join(" ");
    return { word: word, tokens: tokens, explain: explain.join(" "), reading: { "case": cas, gender: noun.gender, number: num, det: det, pattern: pattern } };
  }

  // ── German unknown-word guess ────────────────────────────────────────────
  function deGuessUnknown(word, lexicon) {
    var w = normWord(word);
    var idx = deIndex(lexicon);
    var lw = lc(w), ms = null, explain = "", i;
    var capital = /^[A-ZÄÖÜ]/.test(w);
    // 1. verb patterns (lowercase input only): prefix + ge + stem + t/et/en, insep prefix + stem + t/en, ge + stem + t/en, prefix + stem + en
    if (!capital && lw.length > 4 && w.indexOf(" ") < 0) {
      var m;
      for (i = 0; i < DE_SEP_PREFIXES.length && !ms; i++) {
        var sp = DE_SEP_PREFIXES[i];
        if (lw.indexOf(sp + "ge") === 0 && (m = lw.slice(sp.length + 2).match(/^(.+?)(et|t|en)$/)) && m[1].length >= 2) {
          ms = [M(w.slice(0, sp.length), "sep-prefix", "separable prefix " + sp + "- (assumed)"), M(w.slice(sp.length, sp.length + 2), "ge", "participle marker ge- between prefix and stem"),
            M(w.slice(sp.length + 2, sp.length + 2 + m[1].length), "verb-stem", "unknown stem"), M(w.slice(sp.length + 2 + m[1].length), "part-end", "participle ending -" + m[2] + (m[2] === "en" ? " (strong)" : " (weak)"))];
          explain = "Looks like the participle of a separable verb " + sp + "-…-en: prefix + ge- + stem + -" + m[2] + ".";
        } else if (lw.indexOf(sp + "zu") === 0 && (m = lw.slice(sp.length + 2).match(/^(.+?)(en|n)$/)) && m[1].length >= 2) {
          ms = [M(w.slice(0, sp.length), "sep-prefix", "separable prefix " + sp + "- (assumed)"), M(w.slice(sp.length, sp.length + 2), "zu", "zu of the zu-infinitive"),
            M(w.slice(sp.length + 2, sp.length + 2 + m[1].length), "verb-stem", "unknown stem"), M(w.slice(sp.length + 2 + m[1].length), "inf-end", "infinitive ending -" + m[2])];
          explain = "Looks like a zu-infinitive of a separable verb: " + sp + " + zu + stem + -" + m[2] + ".";
        }
      }
      if (!ms && (m = lw.match(/^ge(.{2,}?)(et|t|en)$/))) {
        ms = [M(w.slice(0, 2), "ge", "participle marker ge-"), M(w.slice(2, 2 + m[1].length), "verb-stem", "unknown stem"), M(w.slice(2 + m[1].length), "part-end", "participle ending -" + m[2])];
        explain = "Looks like a participle of a simple verb: ge- + stem + -" + m[2] + ".";
      }
      for (i = 0; i < DE_INSEP_PREFIXES.length && !ms; i++) {
        var ip = DE_INSEP_PREFIXES[i];
        if (lw.indexOf(ip) === 0 && (m = lw.slice(ip.length).match(/^(.{2,}?)(et|t|en)$/))) {
          var role = m[2] === "en" ? "inf-end" : "part-end";
          ms = [M(w.slice(0, ip.length), "insep-prefix", "inseparable prefix " + ip + "- (assumed; blocks ge-)"), M(w.slice(ip.length, ip.length + m[1].length), "verb-stem", "unknown stem"),
            M(w.slice(ip.length + m[1].length), role, (role === "inf-end" ? "infinitive ending (or strong participle) -" : "weak participle ending -") + m[2])];
          explain = "Looks like a verb with the inseparable prefix " + ip + "-: no ge- in the participle.";
        }
      }
      for (i = 0; i < DE_SEP_PREFIXES.length && !ms; i++) {
        var sp2 = DE_SEP_PREFIXES[i];
        if (lw.indexOf(sp2) === 0 && (m = lw.slice(sp2.length).match(/^(.{2,}?)(en)$/))) {
          ms = [M(w.slice(0, sp2.length), "sep-prefix", "separable prefix " + sp2 + "- (assumed)"), M(w.slice(sp2.length, sp2.length + m[1].length), "verb-stem", "unknown stem"), M(w.slice(sp2.length + m[1].length), "inf-end", "infinitive ending -en")];
          explain = "Looks like the infinitive of a separable verb: " + sp2 + " + stem + -en.";
        }
      }
    }
    // 2. compound: unknown first part + known head (gender known) — else known parts + unknown head
    if (!ms && w.indexOf(" ") < 0) {
      for (i = 2; i < lw.length - 2 && !ms; i++) {
        var heads = deHeadOptions(lw.slice(i), idx);
        if (heads.length) {
          var hn = heads[0].noun;
          // peel known parts/Fugen off the unknown prefix where possible
          var prefixMs = [], j = 0, cur = 0, guard = 0;
          while (cur < i && guard++ < 6) {
            var found = null;
            for (j = i; j > cur + 1; j--) { if (idx.partDict.has(lw.slice(cur, j))) { found = j; break; } }
            if (found && found <= i) {
              prefixMs.push(M(w.slice(cur, found), "part", dePartLabel(idx.partDict.get(lw.slice(cur, found)), lw.slice(cur, found)))); cur = found;
              for (var f2 = 0; f2 < DE_FUGEN.length && cur < i; f2++) { var fg2 = DE_FUGEN[f2]; if (lw.slice(cur, cur + fg2.length) === fg2 && cur + fg2.length <= i) { prefixMs.push(M(w.slice(cur, cur + fg2.length), "fuge", deFugeLabel(fg2, lw.slice(0, cur)))); cur += fg2.length; break; } }
            } else { prefixMs.push(M(w.slice(cur, i), "part", "unknown first part")); cur = i; }
          }
          if (cur !== i) prefixMs = [M(w.slice(0, i), "part", "unknown first part")];
          ms = prefixMs.concat([M(w.slice(i), "noun", hn.gloss + " — " + DE_ARTICLE[hn.gender] + " " + hn.base + "; head noun sets gender: " + DE_ARTICLE[hn.gender])]);
          explain = "Looks like a compound whose head " + hn.base + " is in the lexicon (so it is " + DE_ARTICLE[hn.gender] + " " + w.charAt(0).toUpperCase() + w.slice(1) + "), but the first part is unknown.";
        }
      }
      if (!ms) {
        var best = null;
        (function () {
          function rec(k, segs, lastKind) {
            if (segs.length > 4) return;
            if (segs.length && k < lw.length - 2 && (!best || segs.length > best.segs.length)) best = { segs: segs.slice(), headStart: k, unknown: "head" };
            if (segs.length && lastKind === "part") for (var f = 0; f < DE_FUGEN.length; f++) { var fg = DE_FUGEN[f]; if (lw.slice(k, k + fg.length) === fg && k + fg.length < lw.length) rec(k + fg.length, segs.concat([{ kind: "fuge", start: k, end: k + fg.length, text: fg }]), "fuge"); }
            for (var q = k + 2; q < lw.length - 1; q++) { var info = idx.partDict.get(lw.slice(k, q)); if (info) rec(q, segs.concat([{ kind: "part", start: k, end: q, text: lw.slice(k, q), info: info }]), "part"); }
          }
          rec(0, [], null);
        })();
        if (best) {
          ms = best.segs.map(function (sg) { return sg.kind === "part" ? M(w.slice(sg.start, sg.end), "part", dePartLabel(sg.info, sg.text)) : M(w.slice(sg.start, sg.end), "fuge", deFugeLabel(sg.text, "")); });
          ms.push(M(w.slice(best.headStart), "noun", "unknown head noun — it would set the gender"));
          explain = "Looks like a compound: the first part(s) are in the lexicon, but the head “" + w.slice(best.headStart) + "” is not. The head would decide the gender and plural.";
        }
      }
    }
    if (!ms) {
      var role2 = capital || w.indexOf(" ") >= 0 ? "noun" : "verb-stem";
      ms = [M(w, role2, "unknown " + (role2 === "noun" ? "noun" : "stem"))];
      explain = "No lexicon noun, compound part, verb or determiner pattern matches.";
    }
    return { lang: "de", word: w, kind: capital ? "noun" : "verb", morphemes: ms,
      explain: "“" + w + "” is not in the lexicon. " + explain + " Add the missing noun or verb to the lexicon to get a verified analysis.",
      confidence: 0.3, unknown: true };
  }

  var de = { parse: deParse, build: deBuild, guessUnknown: deGuessUnknown };

  // ═══════════════════════════════ detectLang ══════════════════════════════
  var DE_DET_TOKENS = /\b(der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner|keines|mein|meine|meinen|meinem|meiner|meines|dein|deine|deinen|deinem|deiner|deines|sein|seine|seinen|seinem|seiner|seines|ihr|ihre|ihren|ihrem|ihrer|ihres|unser|unsere|unseren|unserem|unserer|unseres|euer|eure|euren|eurem|eurer|eures|dieser|diese|dieses|diesen|diesem|jeder|jede|jedes|jeden|jedem)\b/i;
  var HU_SUFFIX_RE = /(ban|ben|hoz|hez|höz|nak|nek|val|vel|unk|ünk|tok|tek|tök|juk|jük|kkal|kkel|ról|ről|ból|ből|nál|nél|tól|től|ért|ként)$/i;
  function detectLang(text) {
    var t = normWord(text);
    if (!t) return null;
    if (/[áéíóúőűÁÉÍÓÚŐŰ]/.test(t)) return "hu";            // letters German never uses
    if (/[ßäÄ]/.test(t) || DE_DET_TOKENS.test(t)) return "de";  // German-only letters or a determiner
    if (/(sch|ck|tz|pf|ung|heit|keit|chen|lich|zeug)/i.test(t)) return "de"; // German-only clusters/suffixes (Ausbildungszentrum has "sz" by accident)
    if (/(gy|ty|ny|sz|zs|cs|ly)/i.test(t)) return "hu";        // Hungarian digraphs
    if (/\b[a-zäöü]+\s+[A-ZÄÖÜ]/.test(t)) return "de";          // capitalised noun after a lowercase word
    if (/^[A-ZÄÖÜ]/.test(t) && t.indexOf(" ") < 0) return "de"; // a lone capitalised word: German nouns are capitalised
    if (HU_SUFFIX_RE.test(t)) return "hu";
    return null;
  }

  return { hu: hu, de: de, detectLang: detectLang, version: "1" };
})();
if (typeof window !== "undefined") window.OLC_ENGINES = OLC_ENGINES;
if (typeof module !== "undefined") module.exports = OLC_ENGINES;
