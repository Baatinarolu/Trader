'use strict';
/**
 * Capture a static, self-contained snapshot of the running interface.
 *
 *   node scripts/ui-snapshot.js [baseUrl] [route] [outFile]
 *
 * Why this exists: the live preview can be cached by a browser or a proxy, and a
 * design question ("is it actually the terminal skin?") should be answerable
 * without trusting anyone's cache. This boots the real app in jsdom against the
 * running server, serialises the rendered shell, inlines the real stylesheet and
 * writes one HTML file that renders with zero network access.
 *
 * Canvas charts and the TradingView embed cannot paint under jsdom, so those
 * panels appear in their text-fallback form — everything else is the real DOM.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

class TvBlockedLoader extends ResourceLoader {
  fetch(url, options) {
    if (/tradingview\.com/i.test(String(url))) return Promise.resolve(Buffer.from('/* blocked */'));
    return super.fetch(url, options);
  }
}

const BASE = process.argv[2] || 'http://localhost:3000';
const ROUTE = process.argv[3] || 'dashboard';
const OUT = process.argv[4] || path.join(__dirname, '..', 'docs', 'ui-snapshot.html');

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', () => {});
  vc.on('warn', () => {});
  vc.on('log', () => {});

  const dom = await JSDOM.fromURL(BASE, {
    runScripts: 'dangerously',
    resources: new TvBlockedLoader(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (url, opts = {}) => {
        const u = String(url).startsWith('http') ? String(url) : BASE + url;
        const headers = Object.assign({}, opts.headers || {});
        const tok = window.localStorage.getItem('tj_token');
        if (tok) headers['x-session'] = tok;
        return fetch(u, { ...opts, headers, duplex: 'half' }).then(async (res) => {
          const body = await res.text();
          return { ok: res.ok, status: res.status, headers: res.headers, text: async () => body, json: async () => JSON.parse(body) };
        });
      };
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => '2026-09-01';
    },
  });

  const { window } = dom;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.document.querySelector('.sidebar'); i++) await wait(150);
  if (!window.document.querySelector('.sidebar')) throw new Error('shell never rendered — is the server running?');

  if (ROUTE && ROUTE !== 'dashboard') {
    window.App.go(ROUTE);
    await wait(3000);
  }

  // let the last async panel finish painting
  await wait(1500);

  const doc = window.document;
  doc.querySelectorAll('script').forEach((s) => s.remove());
  const shell = (doc.querySelector('.shell') || doc.body).outerHTML;
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'app.css'), 'utf8');
  const build = (doc.querySelector('#build-tag') || {}).textContent || '';
  const title = (doc.querySelector('#page-title') || {}).textContent || ROUTE;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TradeJournal Pro — interface snapshot (${title})</title>
<style>${css}
/* snapshot-only additions */
.snap-banner{position:sticky;top:0;z-index:99;background:#111418;border-bottom:1px solid #23262f;color:#99a1af;
  font:11px/1.6 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;padding:6px 14px;display:flex;gap:14px;flex-wrap:wrap}
.snap-banner b{color:#3f7fe0;font-weight:600}
.snap-banner span{color:#6e7683}
</style>
</head>
<body>
<div class="snap-banner"><b>STATIC SNAPSHOT — ${title}</b><span>${build}</span><span>buttons are inert; the interactive app runs on the preview</span><span>canvas charts and the TradingView embed show their text fallback in this capture</span></div>
${shell}
</body>
</html>
`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`wrote ${OUT} (${kb} KB) — route "${title}", ${build}`);
  window.close();
})().catch((e) => { console.error('SNAPSHOT FAILED:', e.message); process.exit(1); });
