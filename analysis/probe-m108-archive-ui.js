'use strict';
/** M108 archive-UI probe: how restored practice archives and unreadable records are shown —
 * readonly, separate, never repaired, never this trader's recorded session. */
const H = require('./m108-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
let dom;
finish('M108 real DOM: restored archives and unreadable rows stay readonly and separate', async () => {
  try {
    const { user: u, req, token } = await start('practice-archive-ui');
    const rev = async () => (await req('/practice', undefined, 'GET')).data.revision;
    await req('/practice/timer', { action: 'start', revision: await rev(), preset: 'p5', bell_interval_seconds: 0, ambience: 'none' });
    H.setNow(H.now() + 300000);
    await req('/practice/timer', { action: 'complete', revision: await rev() });
    const archived = { id: 41, day: '2026-09-28', preset: 'p30', target_seconds: 1800, elapsed_ms: 1800000, pause_count: 1, bell_interval_seconds: 600, ambience: 'fireplace', intention: 'Today I will not revenge trade', framing: 'unverified_free_text', note: 'restored', recorded_at: '2026-09-28T04:00:00.000Z' };
    const imported = await req('/import/json', { data: { trades: [], accounts: [], practice_sessions: { version: 1, records: [archived, { ...archived, id: 42, day: 'nonsense', recorded_at: '2099-01-01T00:00:00.000Z' }] } } });
    ok('the restore is accepted with warnings for the record that cannot be trusted', imported.status === 200 && imported.data.practice_warnings.length >= 1, imported.data.practice_warnings);
    await H.D.db.prepare("INSERT INTO practice_sessions(user_id,day,version,preset,target_seconds,elapsed_ms,pause_count,bell_interval_seconds,bell_marks_json,ambience,intention,intention_framing,intention_cues_json,note,source,recorded_at,schema_version) VALUES(?,?,?,'p5',300,300000,0,0,NULL,'none',NULL,NULL,NULL,NULL,'human_declared',?,'practice-v0')").run(u.userId, H.dayOf(H.now()), 88, new Date(H.now()).toISOString());

    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o);
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/practice.js', 'views/dashboard.js', 'views/journal.js', 'views/settings.js']) if (fs.existsSync(path.join(H.APP, 'public/js', p))) load(p);
    w.API.setToken(token); await w.Store.load(true); w.Store.setAccount(u.accountId);
    const listener = w.addEventListener.bind(w);
    w.addEventListener = (t, ...a) => t === 'DOMContentLoaded' ? undefined : listener(t, ...a);
    Object.defineProperty(w.document, 'readyState', { value: 'loading', configurable: true }); load('app.js'); delete w.document.readyState; w.addEventListener = listener;
    w.App.boot = async () => {}; w.App.refresh = () => {}; w.App.toast = (text, type) => toasts.push({ text, type });
    for (const name of ['lineChart', 'histogram', 'barChart', 'scatter', 'heatmap']) w.U[name] = () => {};
    const h = w.U.h;
    w.U.h = (tag, p, ...kids) => { if (p?.onclick) { const fn = p.onclick; p = { ...p, onclick: (...a) => { const out = fn(...a); if (out?.then) pending.push(out.catch((e) => errors.push(e.message))); return out; } }; } return h(tag, p, ...kids); };
    const modal = w.App.modal.bind(w.App);
    w.App.modal = (o) => { for (const a of o.actions || []) if (a.onClick) { const fn = a.onClick; a.onClick = (...args) => { const out = Promise.resolve().then(() => fn(...args)); pending.push(out.catch((e) => errors.push(e.message))); return out; }; } return modal(o); };
    const settle = async () => { for (let n = 0; n < 6; n++) { await Promise.all(pending); await new Promise((r) => setImmediate(r)); } };
    const last = () => [...w.document.querySelectorAll('.modal')].at(-1), P = w.Views.practice;

    const view = await w.API.get('/practice');
    const card = P.card(view);
    ok('today’s card counts the recorded sessions and claims no archive that belongs to another day', !!card.querySelector('[data-practice-today]') && /1 recorded session\(s\)/.test(card.querySelector('[data-practice-today]').textContent) && !/imported practice record/.test(card.textContent), card.querySelector('[data-practice-today]')?.textContent);
    const archiveDay = await w.API.get('/practice', { date: '2026-09-28' });
    const archiveCard = P.card(archiveDay);
    ok('the archive is visible only on its own day, counted separately from recorded sessions', archiveDay.imported_count === 1 && archiveDay.sessions_count === 0 && /0 recorded session\(s\)/.test(archiveCard.querySelector('[data-practice-today]').textContent) && /1 imported practice record\(s\) for this day/.test(archiveCard.textContent) && /kept separate, never this account’s recorded session/.test(archiveCard.textContent), archiveCard.textContent.match(/1 imported[^.]*/)?.[0]);
    ok('the archive is not shown inside the recorded-session list', (() => { const pre = card.querySelector('details pre'); return !pre || !/"source": "imported_unverified"/.test(pre.textContent); })());

    await w.Views.practice.history();
    await settle();
    const hist = last();
    ok('the readonly history modal explains what an archive is', /Readonly practice history/.test(hist.textContent) && /never this account’s recorded session/.test(hist.textContent) && /nothing here is a score, a streak or a judgement/.test(hist.textContent));
    const shown = hist.querySelectorAll('pre');
    ok('every stored record is shown verbatim, archive and recorded side by side', shown.length === 4 && [...shown].some((p) => /"state": "imported_unverified"/.test(p.textContent)) && [...shown].some((p) => /"state": "recorded"/.test(p.textContent)), shown.length);
    ok('the restored archive keeps its own original day and clock, not the receiver’s', [...shown].some((p) => /"day": "2026-09-28"/.test(p.textContent) && /2026-09-28T04:00:00.000Z/.test(p.textContent)));
    ok('the archive that could not be trusted was dropped with a warning, not invented', ![...shown].some((p) => /2099-01-01/.test(p.textContent)));
    ok('the unreadable row is shown as unavailable rather than repaired or counted', [...shown].some((p) => /"state": "unavailable"/.test(p.textContent)) && /1 recorded session\(s\)/.test(card.querySelector('[data-practice-today]').textContent));
    ok('the readonly modal offers no editing control for any record', !hist.querySelector('input, textarea') && !hist.querySelector('[data-practice-timer-body]') && [...hist.querySelectorAll('button')].every((b) => /Close/.test(b.textContent)), [...hist.querySelectorAll('button')].map((b) => b.textContent));

    const settingsOut = P.feedback({ practice_warnings: imported.data.practice_warnings });
    ok('the settings import feedback carries every restore warning', settingsOut && imported.data.practice_warnings.every((text) => settingsOut.textContent.includes(text)), settingsOut?.textContent?.slice(0, 120));
    ok('nothing claims a restored archive is the trader’s own practice', /Optional practice history/.test(settingsOut.textContent) && !/your own recorded/.test(settingsOut.textContent));

    const progressModal = await (async () => { w.document.body.appendChild(card); card.querySelector('[data-practice-progress]').dispatchEvent(new w.Event('click', { bubbles: true })); await settle(); return last(); })();
    ok('progress counts the archive separately in the period too', /imported record\(s\) in this period/.test(progressModal.textContent) && /counted separately, never merged/.test(progressModal.textContent));
    ok('progress still refuses any target or score reading', /Target: none. Score: none. Authority: none./.test(progressModal.textContent));
    ok('no uncaught error reached the window during the archive flow', errors.length === 0, errors.slice(0, 2));
  } catch (e) { ok('probe crashed: ' + e.message, false, e.stack); }
});
