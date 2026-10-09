'use strict';
/**
 * End-to-end smoke test: loads the real app in jsdom against the running
 * server, signs into the demo account, visits every view and reports any
 * console error or render failure.  Run with the server already listening:
 *   node scripts/smoke-test.js [baseUrl]
 */
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

/**
 * The sandboxed in-app preview has no network, so TradingView's widget script can
 * never load there. We reproduce exactly that state here: the embed request is
 * answered with an empty script, which must make the UI paint its fallback card.
 */
class TvBlockedLoader extends ResourceLoader {
  fetch(url, options) {
    if (/tradingview\.com/i.test(String(url))) return Promise.resolve(Buffer.from('/* blocked by smoke harness */'));
    return super.fetch(url, options);
  }
}

const BASE = process.argv[2] || 'http://localhost:3000';
const errors = [];
const warnings = [];

(async () => {
  const vc = new VirtualConsole();
  // jsdom has no canvas backend: it reports getContext() as "not implemented" even when
  // the app handles the missing context gracefully. That is a harness limitation, not an
  // app bug, so it is counted separately instead of failing the run.
  const envLimits = [];
  const isEnvLimit = (msg) => /getContext\(\) method: without installing the canvas npm package|Not implemented: HTMLCanvasElement/.test(String(msg));
  vc.on('jsdomError', (e) => {
    const msg = e.stack || e.message;
    if (isEnvLimit(msg)) envLimits.push(msg); else errors.push('jsdomError: ' + msg);
  });
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  vc.on('warn', (...a) => warnings.push('console.warn: ' + a.join(' ')));
  vc.on('log', () => {});

  const dom = await JSDOM.fromURL(BASE, {
    runScripts: 'dangerously',
    resources: new TvBlockedLoader(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom has no fetch — wire it to Node's, with cookie/token plumbing
      window.fetch = (url, opts = {}) => {
        const u = String(url).startsWith('http') ? String(url) : BASE + url;
        const headers = Object.assign({}, opts.headers || {});
        const tok = window.localStorage.getItem('tj_token');
        if (tok) headers['x-session'] = tok;
        return fetch(u, { ...opts, headers, duplex: 'half' }).then(async (res) => {
          const body = await res.text();
          return {
            ok: res.ok, status: res.status, headers: res.headers,
            text: async () => body,
            json: async () => JSON.parse(body),
          };
        });
      };
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => '2026-09-01';
    },
  });

  const { window } = dom;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // no sign-in wall any more — the shell must appear on its own
  for (let i = 0; i < 120 && !window.document.querySelector('.sidebar'); i++) await wait(150);
  if (!window.document.querySelector('.sidebar')) throw new Error('Shell never rendered (auto workspace connect failed)');
  const hasToken = !!window.localStorage.getItem('tj_token');
  const html = window.document.body.innerHTML;
  const text = window.document.body.textContent || '';
  const authWall = /tpl-auth|Sign in|Create account|type="password"|class="auth-/.test(html);
  const navIcons = window.document.querySelectorAll('.nav-item .ico svg').length;
  const navItems = window.document.querySelectorAll('.nav-item').length;
  // Decorative emoji and dingbats must never appear in the rendered UI. Box-drawing
  // characters inside source comments are not rendered, so this scans the DOM only.
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const glyphTexts = (text.match(EMOJI) || []).length;
  const glyphAttrs = [...window.document.querySelectorAll('[title],[aria-label]')]
    .filter((el) => EMOJI.test(el.getAttribute('title') || '') || EMOJI.test(el.getAttribute('aria-label') || '')).length;
  const buildStamp = (window.document.querySelector('#build-tag') || {}).textContent || '';
  const styleReport = [
    ['shell: no sign-in UI anywhere', !authWall],
    [`shell: navigation draws ${navIcons} inline SVG icons for ${navItems} items`, navItems > 0 && navIcons === navItems],
    ['shell: zero emoji/glyph characters in rendered text', glyphTexts === 0],
    ['shell: zero emoji/glyph characters in tooltips and labels', glyphAttrs === 0],
    ['shell: the sidebar prints the build stamp (cache check)', !!buildStamp],
  ];
  console.log(`\n=== BOOT ===\n auto-connected workspace: ${hasToken} · sign-in UI present: ${authWall}`);
  console.log('=== UI STYLE ===');
  styleReport.forEach(([label, ok]) => console.log(` ${ok ? 'ok  ' : 'FAIL'} ${label}`));
  const styleFails = styleReport.filter(([, ok]) => !ok).length;

  // ---- workspaces instead of logins: open a fresh one, then come back ------
  const ws = [];
  try {
    const firstToken = window.localStorage.getItem('tj_token');
    const firstName = (window.Store.user && window.Store.user.name) || '';
    const firstTrades = (window.Store.stats && window.Store.stats.trades) || 0;
    await window.App.switchWorkspace('fresh');
    await wait(2500);
    const freshToken = window.localStorage.getItem('tj_token');
    const freshTrades = (window.Store.stats && window.Store.stats.trades) || 0;
    ws.push(` fresh workspace opened: ${!!freshToken && freshToken !== firstToken} · empty (0 trades): ${freshTrades === 0} · previous parked: ${!!window.localStorage.getItem('tj_prev_session')}`);
    await window.App.switchWorkspace('back');
    await wait(2500);
    const backToken = window.localStorage.getItem('tj_token');
    const backTrades = (window.Store.stats && window.Store.stats.trades) || 0;
    ws.push(` switched back: ${backToken === firstToken} · trades restored: ${backTrades === firstTrades} (${backTrades}) · same user: ${(window.Store.user || {}).name === firstName}`);
  } catch (e) { ws.push(' workspace switch failed: ' + e.message); }
  console.log(`\n=== WORKSPACES ===\n${ws.join('\n')}`);

  const routes = ['dashboard', 'bots', 'coach', 'market', 'trades', 'journal', 'calendar', 'analytics', 'playbook', 'risk', 'settings'];
  const report = [];
  for (const r of routes) {
    const before = errors.length;
    window.App.go(r);
    await wait(2600);
    const content = window.document.querySelector('#content');
    const text = (content ? content.textContent : '').trim();
    const html = content ? content.innerHTML : '';
    const skeleton = /class="skeleton"/.test(html);
    const broken = /Could not load this view/.test(text);
    report.push({
      route: r, chars: text.length, failed: broken || text.length < 120 || skeleton,
      newErrors: errors.length - before,
      title: (window.document.querySelector('#page-title') || {}).textContent,
    });
  }

  /* deep-dive: the bots view — run a live analysis, then walk every bot tab */
  window.App.go('bots');
  await wait(1500);
  const botReport = [];
  const analyseBtn = [...window.document.querySelectorAll('.bot-toolbar .btn')].find((b) => /Analyse/i.test(b.textContent));
  if (analyseBtn) { analyseBtn.click(); await wait(9000); }
  const botRoot = window.document.querySelector('#content');
  const mechanic = {
    tab: 'Mechanics',
    chars: botRoot.textContent.trim().length,
    tables: botRoot.querySelectorAll('table').length,
    canvases: botRoot.querySelectorAll('canvas').length,
    badges: botRoot.querySelectorAll('.chip').length,
    checks: botRoot.querySelectorAll('.bot-check').length,
  };
  botReport.push(mechanic);
  for (const b of [...botRoot.querySelectorAll('.tabs button')]) {
    if (/Mechanics/i.test(b.textContent)) continue;
    b.click();
    await wait(/Scan/i.test(b.textContent) ? 7000 : 4500);
    const pane = window.document.querySelector('#content');
    botReport.push({
      tab: b.textContent.trim(),
      chars: pane.textContent.trim().length,
      tables: pane.querySelectorAll('table').length,
      canvases: pane.querySelectorAll('canvas').length,
      badges: pane.querySelectorAll('.chip').length,
      checks: pane.querySelectorAll('.bot-check').length,
    });
  }
  console.log('\n=== BOT TABS ===');
  botReport.forEach((t) => console.log(` ${t.chars > 500 ? '✓' : '✗'} ${String(t.tab).padEnd(22)} chars:${String(t.chars).padStart(6)} tables:${t.tables} canvas:${t.canvases} chips:${t.badges} checks:${t.checks}`));

  // the Prediction pane carries the honest panel + the execution affordances
  const predBtn = [...window.document.querySelectorAll('.tabs button')].find((b) => /Prediction/i.test(b.textContent));
  if (predBtn) { predBtn.click(); await wait(5000); }
  const predPane = window.document.querySelector('#content');
  const predText = predPane.textContent.replace(/\s+/g, ' ');
  const predChecks = [
    ['prediction: exit-frontier table with break-even column', /Exit frontier/.test(predText) && /Needs to break even/.test(predText)],
    ['prediction: measured playlist filters table', /own filters, measured/.test(predText)],
    ['prediction: the win-rate dial', /win rate is a dial/i.test(predText)],
    ['prediction: five filter views offered', ['all', 'refined', 'strict', 'cost_floor', 'full'].every((k) => new RegExp(`${k}(?: · default)? \\(n=`).test(predText))],
    ['prediction: the selected view explains itself', /every setup|video's refinement loop|refinement at once|displacement leg \+ stop|maximum-expectancy/.test(predText)],
    ['prediction: the measured view is the default and is marked', /full · default \(n=/.test(predText) && /View shown by default: full/.test(predText)],
    ['prediction: measured gate chips on live setups', predPane.querySelectorAll('.chip').length > 0 && /Stop ≥ 0\.6 ATR/.test(predText) && /Target ≥ 3R/.test(predText)],
    ['prediction: LTF confirmation state shown', /LTF confirmation/.test(predText)],
    ['prediction: refined plan is saveable when actionable', !/Save refined plan to signals/.test(predText) || /Refined plan \(/.test(predText)],
    ['prediction: second-chance re-entry is reported', /Second-chance re-entry/.test(predText)],
  ];
  console.log('\n=== PREDICTION PANEL ===');
  predChecks.forEach(([label, okv]) => {
    console.log(` ${okv ? '✓' : '✗'} ${label}`);
    report.push({ route: 'prediction:' + label, chars: okv ? 200 : 0, failed: !okv, newErrors: 0, title: 'Prediction' });
  });

  // clicking the measured "full" filter view must relabel the dial and swap its rows
  const fullChip = [...window.document.querySelectorAll('#content .chip')].find((c) => /^full \(n=/.test(c.textContent.trim()));
  if (fullChip) {
    fullChip.click();
    await wait(4000);
    const after = window.document.querySelector('#content').textContent.replace(/\s+/g, ' ');
    const okv = /maximum-expectancy/.test(after);
    console.log(` ${okv ? '✓' : '✗'} prediction: switching to the measured view changes the dial's label and data`);
    report.push({ route: 'prediction: measured view switch', chars: okv ? 200 : 0, failed: !okv, newErrors: 0, title: 'Prediction' });
  }

  // deep-dive: click every analytics tab and count rendered SVGs/tables
  window.App.go('analytics');
  await wait(2200);
  const tabReport = [];
  const tabButtons = [...window.document.querySelectorAll('.tabs button')];
  for (const b of tabButtons) {
    b.click();
    await wait(1400);
    const pane = window.document.querySelector('#content');
    tabReport.push({
      tab: b.textContent,
      svgs: pane.querySelectorAll('svg').length,
      tables: pane.querySelectorAll('table').length,
      kpis: pane.querySelectorAll('.kpi').length,
      chars: pane.textContent.trim().length,
    });
  }
  console.log('\n=== ANALYTICS TABS ===');
  tabReport.forEach((t) => console.log(` ${t.chars > 400 ? '✓' : '✗'} ${String(t.tab).padEnd(20)} svgs:${t.svgs} tables:${t.tables} kpis:${t.kpis} chars:${t.chars}`));

  // deep-dive: settings tabs
  window.App.go('settings');
  await wait(1800);
  const setTabs = [...window.document.querySelectorAll('.tabs button')];
  const setReport = [];
  for (const b of setTabs) {
    b.click();
    await wait(700);
    const pane = window.document.querySelector('#content');
    setReport.push({ tab: b.textContent, chars: pane.textContent.trim().length, inputs: pane.querySelectorAll('input,select,textarea').length });
  }
  console.log('\n=== SETTINGS TABS ===');
  setReport.forEach((t) => console.log(` ${t.chars > 200 ? '✓' : '✗'} ${String(t.tab).padEnd(18)} chars:${t.chars} inputs:${t.inputs}`));

  // ── deep-dive: TradingView integration ─────────────────────────────────────
  console.log('\n=== TRADINGVIEW ===');
  window.App.go('market');
  await wait(3400);                                   // let the widget timeout paint the fallback
  const tvHost = window.document.querySelector('.tv-host');
  const tvFallback = window.document.querySelector('.tv-host .tv-fallback');
  const tvLinkEl = window.document.querySelector('.tv-host .tv-fallback a.btn, .tv-host a.btn');
  const tvToolbar = [...window.document.querySelectorAll('.tv-toolbar button, .tv-toolbar a')].map((b) => b.textContent.trim());
  const tvFallbackText = tvFallback ? tvFallback.textContent.replace(/\s+/g, ' ').trim() : '';
  console.log(` tv host: ${!!tvHost} · fallback painted: ${!!tvFallback} · deep link: ${tvLinkEl ? tvLinkEl.getAttribute('href') : '—'}`);
  console.log(` toolbar: ${tvToolbar.join(' | ')}`);
  if (tvFallbackText) console.log(` fallback copy: "${tvFallbackText.slice(0, 110)}…"`);

  // the market chart panel hands the symbol+timeframe over to the bots view
  const tvBotBtn = [...window.document.querySelectorAll('.tv-toolbar button')].find((b) => /Analyse with the bot/i.test(b.textContent));
  if (tvBotBtn) { tvBotBtn.click(); await wait(1500); }
  const handedOver = window.App.route === 'bots';
  const botSym = window.document.querySelector('.bot-toolbar input');
  const botTvLink = window.document.querySelector('.bot-toolbar a[target=_blank]');
  console.log(` handover to bots view: ${handedOver} · symbol in bot toolbar: ${botSym ? botSym.value : '—'} · bot TV link: ${botTvLink ? botTvLink.getAttribute('href') : '—'}`);

  // settings → integrations tab (webhook URL, templates, alert table)
  window.App.go('settings');
  await wait(1500);
  const ivTab = [...window.document.querySelectorAll('.tabs button')].find((b) => /Integrations/i.test(b.textContent));
  if (ivTab) { ivTab.click(); await wait(1600); }
  const ivUrl = [...window.document.querySelectorAll('#content input')].find((i) => /webhook\/tradingview/.test(i.value || ''));
  const ivText = window.document.querySelector('#content').textContent.replace(/\s+/g, ' ');
  console.log(` integrations tab: ${!!ivTab} · webhook url: ${ivUrl ? ivUrl.value.replace(/token=.*/, 'token=…') : '—'}`);
  console.log(` panel mentions: ${['TradingView alerts', 'Copy JSON template', 'Send a test alert', 'Recent alerts'].filter((k) => ivText.includes(k)).join(' · ') || 'none'}`);

  // ── exercise the trade modal (open, read the live computed fields, close) ──
  window.App.openTrade(null, { symbol: 'EURUSD', entry: 1.085, stop: 1.082, target: 1.0925, size: 1.2, status: 'closed', exit: 1.09 });
  await wait(900);
  const modalOpen = !!window.document.querySelector('.modal');
  const summaryText = (window.document.querySelector('#tf-summary') || {}).textContent || '';
  window.App.modalStack.slice().forEach((c) => c());

  console.log('\n=== VIEW SMOKE TEST ===');
  report.forEach((r) => console.log(
    ` ${r.failed ? '✗' : '✓'} ${r.route.padEnd(10)} ${String(r.chars).padStart(6)} chars  errors:${r.newErrors}  title:"${r.title}"`
  ));
  console.log(`\n trade modal opened: ${modalOpen} | live summary: ${summaryText.replace(/\s+/g, ' ').slice(0, 90)}`);

  if (envLimits.length) console.log(`\n(jsdom canvas limitation encountered ${envLimits.length}× — the chart degrades to a text summary, verified separately)`);
  console.log('\n=== CONSOLE ERRORS (' + errors.length + ') ===');
  [...new Set(errors)].slice(0, 25).forEach((e) => console.log(' • ' + String(e).split('\n').slice(0, 2).join(' | ')));
  if (warnings.length) {
    console.log('\n=== WARNINGS (' + warnings.length + ') ===');
    [...new Set(warnings)].slice(0, 10).forEach((e) => console.log(' • ' + e.slice(0, 160)));
  }
  const failed = report.filter((r) => r.failed);
  console.log(`\nRESULT: ${report.length - failed.length}/${report.length} views OK, ${styleFails} UI-style failures, ${errors.length} console errors`);
  process.exit(failed.length || styleFails || errors.length ? 1 : 0);
})().catch((e) => { console.error('SMOKE TEST CRASH:', e.message); process.exit(2); });
