// Real-browser checks (Chromium via the preinstalled Playwright): console errors, 380px overflow on every view,
// both themes, interference guard + logged override, TTS fallback, reload persistence. Screenshots to ./shots/.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, 'console_standalone.html');
const VIEWS = ['mission', 'drill', 'decon', 'wiretap', 'legend', 'content', 'settings'];
fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['dark', 'light']) {
    for (const vp of [{ w: 380, h: 800, tag: 'phone' }, { w: 1280, h: 860, tag: 'desktop' }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
      await page.goto(FILE);
      await page.waitForTimeout(400);
      for (const v of VIEWS) {
        await page.evaluate(v => window.OLC.show(v), v);
        await page.waitForTimeout(150);
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth,
          wide: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !el.closest('[style*="overflow"], .scroll, .table-wrap, pre, textarea'); }).slice(0, 3).map(el => el.tagName + '.' + el.className + '#' + el.id) }));
        ok(ov.sw <= ov.iw, `${scheme}/${vp.tag} ${v}: no horizontal scroll (scrollWidth ${ov.sw} vs ${ov.iw})${ov.wide.length ? ' offenders ' + ov.wide.join(', ') : ''}`);
        await page.screenshot({ path: path.join(__dirname, 'shots', `${scheme}-${vp.tag}-${v}.png`), fullPage: vp.tag === 'phone' ? false : false });
      }
      ok(errs.length === 0, `${scheme}/${vp.tag}: no console errors ${errs.join(' | ')}`);
      await ctx.close();
    }
  }

  // Functional: drill session in DE, then guard blocks HU; override logs an xfer line; data survives reload.
  const ctx = await browser.newContext({ viewport: { width: 380, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(300);
  const ttsBadge = await page.evaluate(() => document.body.innerText.match(/no (German|Hungarian) voice|no .* voice/i) ? true : !('speechSynthesis' in window) ? 'no-api' : 'voices-present');
  console.log('INFO tts state in headless Chromium:', ttsBadge);

  await page.evaluate(() => window.OLC.show('drill'));
  await page.click('#drill-lang-de').catch(() => {});
  await page.click('#drill-src-all').catch(() => {});
  await page.click('#drill-len-20').catch(() => {});
  await page.click('#drill-start');
  await page.waitForTimeout(200);
  // persona card: first 14 days locked -> wait for countdown? use the begin button if enabled, else fast-forward via hook
  const personaVisible = await page.isVisible('#drill-persona');
  ok(personaVisible, 'persona switch card shown at session start');
  const beginDisabled = await page.$eval('#persona-begin', b => b.disabled).catch(() => null);
  ok(beginDisabled === true, 'persona card locked during first 14 days (Begin disabled)');
  await page.evaluate(() => window.OLC.beginCues && window.OLC.beginCues());
  await page.waitForTimeout(200);
  // grade three cues with keyboard: Enter reveal, then 1/3/2
  for (const k of ['1', '3', '2']) {
    // learn-first: new items are shown before they are tested; Enter moves past a learn card
    for (let g = 0; g < 6 && await page.evaluate(() => { const d = window.OLC.state.drill; return !!(d && d.queue[d.idx] && d.queue[d.idx]._learn); }); g++) { await page.keyboard.press('Enter'); await page.waitForTimeout(80); }
    await page.keyboard.press('Enter'); await page.waitForTimeout(120);
    await page.keyboard.press(k); await page.waitForTimeout(120);
    await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.isVisible('#drill-summary'), 'Esc ends session and shows summary');
  await page.screenshot({ path: path.join(__dirname, 'shots', 'func-summary-phone.png'), fullPage: true });
  const st1 = await page.evaluate(() => ({ s: window.OLC.state.sessions.length, e: window.OLC.state.errors.length }));
  ok(st1.s >= 1 && st1.e >= 1, `session saved (${st1.s}) and burn-book line written (${st1.e})`);

  // Guard: try Hungarian right away
  await page.evaluate(() => window.OLC.show('drill'));
  await page.click('#drill-lang-hu').catch(() => {});
  await page.click('#drill-start');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#drill-guard'), 'interference guard blocks Hungarian right after German');
  await page.screenshot({ path: path.join(__dirname, 'shots', 'func-guard-phone.png') });
  const before = await page.evaluate(() => window.OLC.state.errors.length);
  await page.click('#guard-override');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.OLC.state.errors.filter(e => e.category === 'xfer').length);
  ok(after >= 1, 'override logged as an xfer burn-book line');

  // Deconstructor in the real page
  await page.evaluate(() => window.OLC.show('decon'));
  for (const w of ['házaimban', 'Krankenversicherungskarte', 'aufzustehen', 'zsiráfokban']) {
    await page.fill('#decon-input', w); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const txt = await page.$eval('#decon-results', el => el.innerText.slice(0, 160).replace(/\s+/g, ' '));
    console.log('INFO decon', w, '→', txt);
  }
  await page.fill('#decon-input', 'házaimban'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(__dirname, 'shots', 'func-decon-phone.png'), fullPage: true });

  // Reload persistence
  await page.reload(); await page.waitForTimeout(300);
  const st2 = await page.evaluate(() => ({ s: window.OLC.state.sessions.length, e: window.OLC.state.errors.length }));
  ok(st2.s === st1.s && st2.e >= st1.e, `state survives reload (sessions ${st2.s}, errors ${st2.e})`);
  ok(errs.length === 0, 'functional run: no console errors ' + errs.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL BROWSER CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();
