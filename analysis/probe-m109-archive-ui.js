'use strict';
/** M109 archive/ownership UI probe: what the shipped card does when the facts behind it are
 * imported archives, unreadable rows or another workspace’s session — it stays readonly,
 * keeps provenance and never answers for a workspace it no longer owns. */
const H = require('./m109-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
let dom;
finish('M109 real DOM: archived facts, unreadable rows and workspace changes stay readonly', async () => {
  try {
    const { user: u, req, token, otherToken } = await start('m109-archive-ui');
    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], calls = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => { calls.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''), body: o && o.body, headers: o && o.headers }); return fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o); };
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/ask.js', 'views/dashboard.js']) if (fs.existsSync(path.join(H.APP, 'public/js', p))) load(p);
    w.API.setToken(token); await w.Store.load(true); w.Store.setAccount(u.accountId);
    const listener = w.addEventListener.bind(w);
    w.addEventListener = (t, ...a) => t === 'DOMContentLoaded' ? undefined : listener(t, ...a);
    Object.defineProperty(w.document, 'readyState', { value: 'loading', configurable: true }); load('app.js'); delete w.document.readyState; w.addEventListener = listener;
    w.App.boot = async () => {}; w.App.refresh = () => {}; w.App.toast = (text, type) => toasts.push({ text, type });
    for (const name of ['lineChart', 'histogram', 'barChart', 'scatter', 'heatmap']) w.U[name] = () => {};
    const h = w.U.h;
    w.U.h = (tag, p, ...kids) => { if (p?.onclick) { const fn = p.onclick; p = { ...p, onclick: (...a) => { const out = fn(...a); if (out?.then) pending.push(out.catch((e) => errors.push(e.message))); return out; } }; } return h(tag, p, ...kids); };
    const settle = async () => { for (let n = 0; n < 8; n++) { await Promise.all(pending); await new Promise((r) => setImmediate(r)); } };
    const click = (node) => node.dispatchEvent(new w.Event('click', { bubbles: true }));
    const type = (node, text) => { node.value = text; node.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const A = w.Views.ask;

    /* A real imported archive for today, so the surfaces have something separate to report. */
    const today = H.dayOf(H.now());
    const archive = { id: 91, day: today, preset: 'p30', target_seconds: 1800, elapsed_ms: 1800000, pause_count: 1, bell_interval_seconds: 300, ambience: 'forest', intention: 'Today I follow my plan', note: 'restored', recorded_at: new Date(H.now() - 3600000).toISOString() };
    await req('/import/json', { data: { trades: [], accounts: [], practice_sessions: { version: 1, records: [archive] } } });

    const topics = await w.API.get('/ask/topics');
    const card = A.card(topics); w.document.body.appendChild(card);
    const box = card.querySelector('[data-ask-answer]');
    type(card.querySelector('[data-ask-input]'), 'What have I recorded today?');
    click(card.querySelector('[data-ask-send]')); await settle();
    const recordsText = box.textContent;
    ok('an imported archive is reported by the channel as counted separately, and the view passes that wording through unchanged', /imported archive\(s\) counted separately/.test(recordsText) && /never as your own recorded session/.test(recordsText), recordsText.slice(0, 200));
    ok('the imported archive is not dressed as the trader’s own practice anywhere in the rendered answer', !/your own recorded session: 1/i.test(recordsText) && !/\bverified\b/i.test(recordsText));
    ok('the rendered answer still states the record-not-result limits below the numbers', /times server running time only/.test(recordsText) && /no streak, target or score to protect/.test(recordsText));

    /* An unreadable stored row: the surface must render it as unavailable, not as a zero. */
    await H.D.db.prepare("INSERT INTO practice_sessions(user_id,day,version,preset,target_seconds,elapsed_ms,pause_count,bell_interval_seconds,bell_marks_json,ambience,intention,intention_framing,intention_cues_json,note,source,recorded_at,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(u.userId, today, 9, 'p5', 300, 42.5, 0, 0, '[]', 'none', null, null, null, 'unreadable row', 'recorded', new Date(H.now()).toISOString(), 'practice-v1');
    type(card.querySelector('[data-ask-input]'), 'What have I recorded today?');
    click(card.querySelector('[data-ask-send]')); await settle();
    const kindKinds = [...box.querySelectorAll('[data-ask-kind]')].map((n) => n.getAttribute('data-ask-kind'));
    ok('a row the app cannot read back renders as a stated unavailable line beside the readable records', kindKinds.includes('unavailable') && /could not be read back/.test(box.textContent) && /not counted as a session or a single measured second/.test(box.textContent), kindKinds);
    ok('the readable part of the same answer still renders, so one unreadable row does not blank the surface', kindKinds.includes('record') && /0 session\(s\) and 0s of server-measured running time, plus 1 imported archive\(s\)/.test(box.textContent), box.textContent.slice(0, 200));
    ok('nothing in the rendered answer offers to repair, delete or edit the unreadable row', ![...box.querySelectorAll('button,a')].some((n) => /repair|fix|delete|edit|remove|clean/i.test(n.textContent)));

    /* The channel is not a data-entry surface: no account, date, filter or quantity input. */
    const inputs = [...card.querySelectorAll('input,select,textarea,button')];
    ok('the card offers exactly one input and two kinds of readonly action (chips and send): no account/date/risk field exists to submit', card.querySelectorAll('input,select,textarea').length === 1 && inputs.filter((n) => n.tagName === 'BUTTON').every((n) => n.hasAttribute('data-ask-chip') || n.hasAttribute('data-ask-send')));
    const asks = calls.filter((c) => c.url === '/api/ask');
    ok('every ask the view makes is a POST body with the question only — no account, date, filter or model field exists to send', asks.length === 2 && asks.every((c) => JSON.stringify(Object.keys(JSON.parse(c.body))) === '["question"]'), asks.map((c) => Object.keys(JSON.parse(c.body))));

    /* A second card mounted at the same time must not cross-fill the first one’s box. */
    const firstText = box.textContent;
    const second = A.card(topics); w.document.body.appendChild(second);
    const secondBox = second.querySelector('[data-ask-answer]');
    type(second.querySelector('[data-ask-input]'), 'What are my risk limits today?');
    click(second.querySelector('[data-ask-send]')); await settle();
    ok('two cards on one page fill their own answer boxes: a card never writes into another card’s surface',
      secondBox.querySelectorAll('[data-ask-text]').length === 5 && /Risk per trade/.test(secondBox.textContent) && box.textContent === firstText && !/Risk per trade/.test(box.textContent),
      { second: secondBox.querySelectorAll('[data-ask-text]').length, firstUnchanged: box.textContent === firstText });

    /* The workspace changes under a card that is already mounted: it must refuse, not answer. */
    const before = calls.filter((c) => c.url === '/api/ask').length;
    w.API.setToken(otherToken);
    click(second.querySelector('[data-ask-chip]')); await settle();
    ok('after the session changes, a chip on the already-mounted card refuses with a toast instead of asking as the new workspace', toasts.some((t) => /Workspace\/session changed/.test(t.text)) && calls.filter((c) => c.url === '/api/ask').length === before, { toasts, calls: calls.filter((c) => c.url === '/api/ask').length, before });
    ok('a stale card still renders the limits it already received rather than blanking the trader’s screen', /What this channel will not do/.test(second.textContent));

    w.API.setToken(token);
    type(card.querySelector('[data-ask-input]'), 'Should I enter this trade?');
    click(card.querySelector('[data-ask-send]')); await settle();
    ok('the refusal path works again once the card is the trader’s own, and the refusal is not cached from the earlier card', box.querySelector('[data-ask-refusal]') && box.getAttribute('data-ask-refusal') === null && box.querySelector('[data-ask-refusal]').getAttribute('data-ask-refusal') === 'ask_refused_permission');
    ok('the refusal renders its citation from the episode, so the trader can read why it will not answer', /Why \(saved episode words\)/.test(box.textContent) && /AI should not replace your trade plan|shortcut for certainty/.test(box.textContent));

    ok('no uncaught error was raised across every archived/unreadable/stale interaction', errors.length === 0, errors);
    const bodyText = w.document.body.textContent;
    /* Every sentence containing a negation is a denial this app is SUPPOSED to state; the
     * claim test is applied to what remains, so a refusal can never be misread as a grant. */
    const negated = /[^.]*\b(never|not|no|cannot|will not|isn.t|doesn.t)\b[^.]*\./gi;
    const rest = bodyText.replace(negated, ' ');
    const claim = (rest.match(/\b(?:adherence (?:is|:)|discipline score of|permission granted|you (?:may|can) (?:now )?(?:enter|trade)|admission (?:is )?(?:true|granted)|allowed: ?true|is a pass)\b/i) || [])[0];
    ok('outside its own denials, the page never makes an affirmative score, adherence, permission or admission claim', !claim, { claim, sample: rest.slice(Math.max(0, rest.indexOf(claim || '') - 80), rest.indexOf(claim || '') + 80) });
    ok('the page states the denial explicitly instead of leaving the boundary to inference', /never becomes the authority on whether you may enter/.test(bodyText) && /Authority: none/.test(bodyText));
  } finally { if (dom) dom.window.close(); }
});
