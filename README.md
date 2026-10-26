# Operative's Linguistic Console

A single-file, offline web app for self-directed German and Hungarian training: timed reflex drills with spaced repetition, a case/suffix deconstructor, a daily block plan with an interference guard, an error log ("burn book"), and the full training doctrine as a searchable Field Manual.

The built app lives at the repository root and is served by GitHub Pages. Everything else is under `src/`.

## Install on a phone or PC

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. Open it from the icon from then on.
- **Android / PC (Chrome or Edge):** open the site → install icon in the address bar.

It works offline after the first load. All progress stays on the device; use **Settings → Export** to back up or move data to another device, and **Import** to restore.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `sw.js`, `manifest.webmanifest`, icons | The built app (generated — do not edit by hand) |
| `src/app/console_src.html` | App UI source (markup, CSS, JS) with `__SEED__` and `/*__ENGINES__*/` markers |
| `src/app/engines.js` | German and Hungarian morphology engines (parse / build) |
| `src/app/build.js` | Assembles the app: inlines engines and content, writes `console.html` (artifact fragment), `console_standalone.html`, and the PWA into `../pwa/dist` |
| `src/app/test_*.js` | Acceptance tests: engines (node), app (jsdom), real browser (Playwright) |
| `src/content/*.json` | Drills, deconstructor examples, lexicons; `check_*.py` validate them; `hu_generate.py` is the reference Hungarian generator |
| `src/content/SCHEMA.md` | Content schema |
| `src/pwa/manual.json` | The Field Manual sections (the doctrine, Part 1) |
| `src/app/APP_SPEC.md`, `src/app/ENGINE_API.md` | Build spec and engine contract |

## Rebuild

```
cd src/app && npm install          # jsdom for tests; Playwright is optional
node build.js                      # writes console.html, console_standalone.html, ../../pwa/dist/*
node test_engines.js && node test_console.js
```

`build.js` expects the content in `../content/` and writes the PWA to `../pwa/dist/`; copy that folder's files to the repository root to deploy.

## Editing content

Use the in-app **Content Manager**. Export JSON from the app and paste it into `src/content/*.json` only when the shipped defaults should change.
