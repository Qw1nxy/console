/* engines_stub.js — development stand-in for engines.js (same API as ENGINE_API.md).
   Returns empty analyses so the console UI can be built and tested before the real engines land.
   build.js inlines this file ONLY when /home/claude/app/engines.js is missing. */
const OLC_ENGINES = (function () {
  function detectLang(text) {
    const t = String(text || "");
    if (/[őű]/.test(t) || /(gy|ty|ny|sz|zs|cs|ly)/i.test(t)) return "hu";
    if (/[ßä]/.test(t) || /\b(der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner)\b/i.test(t)) return "de";
    if (/\b[a-zäöü]+\s+[A-ZÄÖÜ]/.test(t)) return "de";
    return null;
  }
  function unknown(lang, word) {
    return {
      lang: lang, word: String(word || "").trim().replace(/\s+/g, " "), kind: lang === "hu" ? "noun" : "noun",
      morphemes: [{ form: String(word || "").trim(), role: lang === "hu" ? "stem" : "noun", label: "unknown stem" }],
      explain: "Engine stub: this word is not in the lexicon and no analysis engine is loaded yet.",
      confidence: 0.3, unknown: true
    };
  }
  const hu = {
    generateForms: function () { return new Map(); },
    parse: function () { return []; },
    build: function () { return { error: "Hungarian generator not loaded (engine stub)." }; },
    guessUnknown: function (word) { return unknown("hu", word); }
  };
  const de = {
    parse: function () { return []; },
    build: function () { return { word: "", tokens: [], explain: "German generator not loaded (engine stub)." }; },
    guessUnknown: function (word) { return unknown("de", word); }
  };
  return { hu: hu, de: de, detectLang: detectLang, version: "stub" };
})();
if (typeof window !== "undefined") window.OLC_ENGINES = OLC_ENGINES;
if (typeof module !== "undefined") module.exports = OLC_ENGINES;
