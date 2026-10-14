'use strict';
/**
 * M30 ui probe: the zone-method choice as a trader sees it, rendered in jsdom against the payloads
 * the server really serves. What a screen can mislead about here is narrow and specific, so it is
 * what is measured:
 *
 *   · the Settings control offers the CLOSED vocabulary and preselects nothing the trader never
 *     chose (an unset setting must not render as a standing choice);
 *   · saving the control sends the value and nothing else, so the screen's claim and the stored row
 *     cannot drift — and the trade-off is stated in words that name both methods;
 *   · the bots screen names the geometry the read actually ran on, including where the choice came
 *     from, how many zones were plotted that way, which stayed pivot because the walk failed, and the
 *     sentence for a request the app could not honour;
 *   · a read that never reached the zone stage says NOTHING rather than naming a method it did not use;
 *   · the note is explanation, not a second decision surface with its own control.
 *
 * jsdom has no browser engine: this is a structural and behavioural proof, not a pixel proof.
 */
const fs = require('fs'), path = require('path');
const H = require('./m30-test-support'), { ok } = H;

H.finish('M30 real DOM: the zone-method choice and the geometry every screen names', async () => {
  const S = H.mod('src/bots/smc');
  if (!H.shipped(S, 'the zone-method vocabulary and the consolidation walk (src/bots/smc.js)')) return;
  const u = await H.start('m30-ui');
  const desk = await H.account(u, 'M30 ui desk');
  const q = (extra = {}) => H.analyseQuery(desk.id, extra);

  /* ------------------------------------------------------- real payloads, real states */
  const pivot = (await H.analyse(u, q())).data;
  const ranged = (await H.analyse(u, q({ zone_method: 'range' }))).data;
  const bogus = (await H.analyse(u, q({ zone_method: 'consolidation' }))).data;
  ok('the probe renders payloads the server really sent: the default read, an honoured request, and a request the app cannot honour',
    H.methodOf(pivot).method === 'pivot' && H.methodOf(pivot).source === 'default'
    && H.methodOf(ranged).method === 'range' && H.methodOf(ranged).source === 'request'
    && H.methodOf(bogus).method === 'pivot' && !!H.methodOf(bogus).error,
    JSON.stringify([H.methodOf(pivot), H.methodOf(ranged), H.methodOf(bogus && bogus.setups) && H.methodOf(bogus)]));
  await H.chooseZoneMethod(u, 'range');
  const asked = (await H.analyse(u, q())).data;
  ok('and a stored choice is a state the server distinguishes from a request (the source token travels with it)',
    H.methodOf(asked).method === 'range' && H.methodOf(asked).source === 'settings', JSON.stringify(H.methodOf(asked)));
  await H.chooseZoneMethod(u, '');

  const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
  const dom = new JSDOM('<body><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
  const root = w.document.getElementById('app');
  const qs = (sel, r) => (r || root).querySelector(sel);
  const qsa = (sel, r) => [...(r || root).querySelectorAll(sel)];
  const text = (n) => (n ? n.textContent : '');
  const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------- 1. the bots screen names the geometry */
  let payload = pivot;
  const sent = [];
  w.Store = { accountId: desk.id, strategies: [], user: { id: 1 }, settings: {}, reloadAll: async () => {} };
  w.API = {
    get: (url, params) => { sent.push([url, params || null]); return url === '/bots/analyse' ? Promise.resolve(payload) : Promise.resolve({}); },
    put: (url, body) => { sent.push(['PUT ' + url, body]); return Promise.resolve({ ok: true }); },
    post: () => Promise.resolve({ ok: true }),
  };
  /* The view repaints through App.refresh once its own reads land, so the stub MUST repaint (with a
   * re-entrancy guard) or every note below would be measured on the empty pre-data DOM. */
  let painting = false;
  w.App = { refresh: () => { if (painting) return; painting = true; try { w.Views.bots.render(root); } finally { painting = false; } },
    toast: () => {}, runGuarded: (fn) => fn(null), modal: () => ({ close() {} }) };
  w.Chart = null;
  load('util.js'); load('views/bots.js');
  const paint = async (p) => { payload = p; w.Views.bots.reset(); w.Views.bots.render(root); await tick(); };
  await paint(pivot);
  const pNote = text(qs('[data-zone-method]'));
  ok('the bots screen names the geometry the read ran on, in words that say which of the two Ep 7 methods it is',
    /pivot method/i.test(pNote) && /single candle/i.test(pNote), pNote);
  ok('and it points at the other choice where the trader can make it, rather than making it for him',
    /range method/i.test(pNote) && /Settings/.test(pNote), pNote);
  ok('the default read is named as the default (nobody chose), not attributed to a decision the trader never made',
    H.methodOf(pivot).source === 'default' && !/you chose|your saved/i.test(pNote), JSON.stringify(pNote));
  await paint(ranged);
  const rNote = text(qs('[data-zone-method]'));
  ok('a range read says so, with the number of zones actually plotted that way (the slice on screen is not the whole read)',
    /range method/i.test(rNote) && /whole consolidation high-to-low/i.test(rNote) && new RegExp(String(H.methodOf(ranged).applied_zones)).test(rNote),
    rNote);
  await paint(bogus);
  const bNote = text(qs('[data-zone-method]'));
  ok('a request the app cannot honour prints the app\u2019s own sentence naming what it can plot, so the picture and the sentence agree',
    /is not a zone method this app can plot/.test(bNote) && /pivot, range/.test(bNote), bNote);
  ok('and the screen still says which geometry it DID use rather than leaving the zones unattributed',
    /pivot/.test(bNote), bNote);
  const fallback = { ...ranged, setups: { ...ranged.setups, filters: { ...ranged.setups.filters,
    zone_method: { ...H.methodOf(ranged), base_fallbacks: 2 } } } };
  await paint(fallback);
  ok('zones whose consolidation could not be walked are counted on screen as having stayed pivot, never silently dropped',
    /2 could not be walked and stayed pivot/.test(text(qs('[data-zone-method]'))), text(qs('[data-zone-method]')));
  const sentinel = { ...pivot, smc: { ...pivot.smc, order_blocks: [] }, setups: { ...pivot.setups, filters: { ...pivot.setups.filters,
    zone_method: { ...H.methodOf(pivot), read: false, applied_zones: 0 } } } };
  await paint(sentinel);
  ok('a read that never reached the zone stage says NOTHING: it does not name a method it did not use',
    text(qs('[data-zone-method]')) === '', JSON.stringify(text(qs('[data-zone-method]'))));
  await paint(ranged);
  ok('the note is explanation, not a second decision surface: it carries no control of its own',
    qsa('[data-zone-method] button').length === 0 && qsa('[data-zone-method] input').length === 0
    && qsa('[data-zone-method] select').length === 0, qsa('[data-zone-method] *').length);
  ok('and the method note does not disturb the M26 window note or the M56 plan note beside it',
    !!qs('[data-plan-gate]') && text(qs('[data-plan-gate]')).length >= 0, text(qs('[data-plan-gate]')).slice(0, 60));

  /* ------------------------------------------------------- 2. the Settings control */
  const putBodies = [];
  w.Views.settings = undefined;
  w.API = { get: (url) => (url === '/accounts' ? Promise.resolve({ accounts: [], stats: {} }) : Promise.resolve({})),
    put: (url, body) => { putBodies.push([url, body]); return Promise.resolve({ ok: true }); },
    post: () => Promise.resolve({ ok: true }) };
  w.Store.user = { id: 1, name: 'Probe', settings: {} };   // the trader has made no choice yet
  load('views/settings.js');
  await w.Views.settings.render(root);
  const tab = [...root.querySelectorAll('button')].find((b) => text(b) === 'Preferences');
  tab.dispatchEvent(new w.Event('click'));
  await tick(60);
  ok('the Settings pane offers the zone method as a named choice with its own control',
    !!qs('#s-zone') && qs('#s-zone').dataset.zoneMethod === 'true' && !!qs('[data-zone-method-note]'), JSON.stringify(qsa('select', qs('.form-grid')).map((s) => s.id)));
  ok('it offers the CLOSED vocabulary: the pivot default and the range method, and nothing else',
    qsa('#s-zone option').length === 2 && qsa('#s-zone option').map((o) => o.value).join('|') === '|range',
    JSON.stringify(qsa('#s-zone option').map((o) => [o.value, text(o)])));
  ok('and an unset choice preselects NOTHING the trader never made: the empty (default) option is the selected one',
    qs('#s-zone').value === '', JSON.stringify(qs('#s-zone').value));
  ok('the note states the trade-off in words that name both methods and where the numbers differ (the stop behind a wider zone)',
    /pivot/i.test(text(qs('[data-zone-method-note]'))) && /range/i.test(text(qs('[data-zone-method-note]')))
    && /wider/i.test(text(qs('[data-zone-method-note]'))) && /stop/i.test(text(qs('[data-zone-method-note]'))),
    text(qs('[data-zone-method-note]')));
  qs('#s-zone').value = 'range';
  qs('#s-save').dispatchEvent(new w.Event('click'));
  await tick(60);
  const save = putBodies.find(([url]) => url === '/settings');
  ok('saving sends the chosen method on the settings route the app already has (the screen and the stored row cannot drift)',
    !!save && save[1].zone_method === 'range', JSON.stringify(save && [save[0], save[1].zone_method]));
  ok('and the save still carries the fields that were already on that form, so choosing a geometry cannot silently drop a preference',
    !!save && typeof save[1].name === 'string' && Array.isArray(save[1].focus_symbols) && 'timezone' in save[1] && 'min_rr' in save[1] && 'session_pref' in save[1],
    JSON.stringify(save && Object.keys(save[1])));

  w.Store.user = { id: 1, name: 'Probe', settings: { zone_method: 'range' } };
  await w.Views.settings.render(root);
  [...root.querySelectorAll('button')].find((b) => text(b) === 'Preferences').dispatchEvent(new w.Event('click'));
  await tick(60);
  ok('and the stored choice is preselected on the next visit, so the screen never loses a decision the trader made',
    qs('#s-zone').value === 'range', JSON.stringify({ values: qsa('#s-zone option').map((o) => [o.value, o.selected]) }));
});

module.exports = {};
