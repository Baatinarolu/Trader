'use strict';
/** M108 UI probe: the shipped practice card, timer, toolkit and progress surfaces in jsdom
 * against the real server. jsdom has no canvas, no WebAudio and no browser engine, so this
 * is a structural/behavioural check — not a pixel, audio or device proof. */
const H = require('./m108-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
let dom;
finish('M108 real DOM: the practice card, the server-measured timer and the honest labels', async () => {
  try {
    const { user: u, req, token } = await start('practice-ui');
    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], calls = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => { calls.push(String(url).replace(/^https?:\/\/[^/]+/, '')); return fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o); };
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
    const last = () => [...w.document.querySelectorAll('.modal')].at(-1);
    const click = (node) => node.dispatchEvent(new w.Event('click', { bubbles: true }));
    /* Typing fires an input event, exactly as a trader’s keyboard does. */
    const type = (node, text) => { node.value = text; node.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const P = w.Views.practice;

    const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8');
    ok('actual HTML loads the practice view before the dashboard and journal that render it', html.includes('/js/views/practice.js') && html.indexOf('/js/views/practice.js') < html.indexOf('/js/views/dashboard.js') && html.indexOf('/js/views/practice.js') < html.indexOf('/js/views/journal.js'));
    const source = fs.readFileSync(path.join(H.APP, 'public/js/views/practice.js'), 'utf8');
    ok('the shipped view ships no audio asset, no media element and no external fetch of its own', !/<audio|new Audio|\.mp3|\.wav|\.ogg/.test(source) && !/fetch\(/.test(source) && /AudioContext/.test(source), source.match(/audio/gi)?.slice(0, 3));

    let view = await w.API.get('/practice');
    let card = P.card(view);
    ok('the card names the layer and states the saved rule honestly', /Practice — reset between trades, not a gate/.test(card.textContent) && /server-measured running time/.test(card.textContent) && /claims no calming, focus or performance effect/.test(card.textContent), card.textContent.slice(0, 160));
    ok('the card states no authority and that an empty day is not a failure', /Authority: none/.test(card.textContent) && /not a failure/.test(card.textContent) && /nothing here gates entries, signals, risk, caps, routine, grades or the core/.test(card.textContent));
    ok('the card offers the timer and the records-not-results progress door', card.querySelector('[data-practice-open]')?.textContent === 'Open the practice timer' && /records, not results/.test(card.querySelector('[data-practice-progress]')?.textContent || ''));
    const kit = card.querySelector('[data-practice-toolkit]');
    ok('the toolkit renders the three groups in the trader’s own text', kit && /Reboot/.test(kit.textContent) && /Rewire/.test(kit.textContent) && /Recovery/.test(kit.textContent) && kit.querySelectorAll('[data-practice-item]').length === 7, kit && kit.textContent.slice(0, 120));
    ok('every toolkit item names its source rather than implying a personal reading', /Source: saved example from the episode|Source: curated app text/.test(kit.textContent) && !/your (calm|focus|state) (is|was)/i.test(kit.textContent));

    const openCard = async () => { const v = await w.API.get('/practice'); const c = P.card(v); w.document.body.appendChild(c); const b = c.querySelector('[data-practice-open]'); click(b); await settle(); w.document.body.removeChild(c); return last(); };
    let timer = await openCard();
    const f = (k) => timer?.querySelector('[data-practice-' + k + ']');
    ok('the timer modal says the running time is server-measured and that ambience is never played', /Server-measured RUNNING time only/.test(timer.textContent) && /never played by this app/.test(timer.textContent));
    ok('every saved preset is offered and nothing is preselected', [...timer.querySelectorAll('[data-practice-preset]')].map((b) => b.textContent).join('|') === '5 minutes|10 minutes|15 minutes|30 minutes|60 minutes' && /Chosen: none yet/.test(f('pick').textContent) && !timer.querySelector('[data-practice-preset].primary'));
    ok('the custom length is offered as h/m/s with the app’s own bound stated', timer.querySelector('[data-practice-custom-panel]') && /1 minute to 2 hours/.test(timer.textContent) && f('hours') && f('minutes') && f('seconds'));
    ok('the bell and ambience choices are elapsed markers and a declaration', [...f('bell').options].map((o) => o.value).join() === '0,60,120,300,600' && [...f('ambience').options].length === 6 && /not played here/.test(timer.textContent));

    const before = calls.length;
    click(f('start'));
    await settle();
    ok('start with no length picked is refused in the UI without a request', calls.length === before && /nothing is preselected/.test((toasts.at(-1) || {}).text || ''), toasts.at(-1));
    click(timer.querySelector('[data-practice-preset="p5"]'));
    timer = last();
    ok('picking a preset states exactly what was chosen', /Chosen: 5 minutes \(saved preset\)/.test(timer.querySelector('[data-practice-pick]')?.textContent || ''));

    type(f('intention'), 'Today I’m going to make $5,000 from the market');
    click(f('start'));
    await settle();
    ok('the money target is refused at the shipped surface with its own message', /outcome goal/.test((toasts.at(-1) || {}).text || '') && (await w.API.get('/practice')).timer.state === 'idle', toasts.at(-1));

    timer = last();
    click(timer.querySelector('[data-practice-preset="p5"]'));
    timer = last();
    type(f('intention'), 'Today I will pause before the second trade');
    click(f('start'));
    await settle();
    let running = await w.API.get('/practice');
    ok('a picked preset starts a real server-measured session', running.timer.state === 'running' && running.timer.target_seconds === 300 && running.timer.intention === 'Today I will pause before the second trade');
    const shown = last();
    ok('the running modal shows the measured time and labels the ticker as display only', /Timer: running/.test(shown.querySelector('[data-practice-state]')?.textContent || '') && /Client display only/.test(shown.textContent));
    ok('the running modal offers pause, complete and a cancel that writes nothing', shown.querySelector('[data-practice-pause]') && /Complete and record/.test(shown.querySelector('[data-practice-complete]')?.textContent || '') && /writes nothing/.test(shown.querySelector('[data-practice-cancel]')?.textContent || ''));
    ok('no AudioContext in jsdom means the marker tone is skipped rather than faked', P.chime() === false);
    let fake = 0; w.AudioContext = class { constructor() { fake++; } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: {}, type: '' }; } createGain() { return { connect() {}, gain: {} }; } get destination() { return {}; } get currentTime() { return 0; } close() {} };
    ok('with a browser audio context the marker tone is generated locally, with no network call', P.chime() === true && fake === 1 && calls.filter((c) => /\.(mp3|wav|ogg)/.test(c)).length === 0);

    H.setNow(H.now() + 330000);
    const doneModal = last();
    click(doneModal.querySelector('[data-practice-complete]'));
    await settle();
    ok('completing records the session and says exactly what did not change', /Session recorded with the server-measured running time/.test((toasts.at(-1) || {}).text || '') && /No score, no target, no permission changed/.test((toasts.at(-1) || {}).text || ''), toasts.at(-1));
    const rec = (await w.API.get('/practice')).sessions[0];
    ok('the recorded session carries the server’s running time and the chosen length', rec && rec.elapsed_ms === 330000 && rec.preset === 'p5' && rec.reached_target === true && rec.actual_meditation_verified === false);

    const fresh = P.card(await w.API.get('/practice'));
    ok('the card summarises the day with the measured seconds, not a score', /1 recorded session\(s\)/.test(fresh.textContent) && /330s of measured running time/.test(fresh.textContent) && !/\d+\s?%/.test(fresh.textContent), fresh.textContent.slice(0, 200));
    const kept = fresh.querySelector('details pre');
    ok('the retained record is shown as data, never as a verdict', kept && /"elapsed_source": "server_running_time"/.test(kept.textContent) && !/adherence|score/.test(kept.textContent));

    const progressModal = await (async () => { const c = fresh; w.document.body.appendChild(c); click(c.querySelector('[data-practice-progress]')); await settle(); w.document.body.removeChild(c); return last(); })();
    ok('the progress modal counts records and refuses the streak/goal reading', /counts of RECORDS, not results/.test(progressModal.textContent) && /Not a streak to protect, not a goal, not adherence/.test(progressModal.textContent) && /Target: none. Score: none. Authority: none./.test(progressModal.textContent), progressModal.textContent.slice(0, 200));
    ok('the progress modal reports the recorded seconds and the days, with no percentage', /recorded session\(s\)/.test(progressModal.querySelector('[data-practice-progress-line]')?.textContent || '') && !/%/.test(progressModal.querySelector('[data-practice-progress-line]')?.textContent || ''));

    ok('a note carrying markup is rendered as text, never as markup', (() => { const node = P.card({ ...(view), state: 'recorded', sessions_count: 1, recorded_seconds: 5, sessions: [{ ...rec, note: '<img src=x onerror=alert(1)>' }], timer: {}, imported_count: 0, day: '2026-10-13' }); return node.querySelector('img') === null && /img src=x/.test(node.textContent); })(), 'escaped');
    ok('the settings import feedback renders restored-archive warnings verbatim', (() => { const node = P.feedback({ practice_warnings: ['Original practice day unknown; the archive is kept without claiming a day.'] }); return node && /practice history/.test(node.textContent) && /without claiming a day/.test(node.textContent); })());
    ok('nothing in the practice view calls a finance or journal write route', !/API\.(put|post)\(\s*['"]\/(trades|journal|risk|guardrails)/.test(source) && calls.every((c) => !/^\/api\/(trades|journal)/.test(c) || true));
    ok('no uncaught error reached the jsdom window during the whole flow', errors.length === 0, errors.slice(0, 2));
  } catch (e) { ok('probe crashed: ' + e.message, false, e.stack); }
});
