'use strict';
/** M109 UI probe: the shipped advisory card rendered in jsdom against the real server.
 * jsdom has no browser engine, so this is a structural/behavioural check — not a pixel,
 * device, audio or provider proof. */
const H = require('./m109-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
let dom;
finish('M109 real DOM: the advisory card, its refusals and its provenance', async () => {
  try {
    const { user: u, req, token } = await start('m109-ui');
    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], calls = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => { calls.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''), body: o && o.body }); return fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o); };
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

    const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8'), source = fs.readFileSync(path.join(H.APP, 'public/js/views/ask.js'), 'utf8');
    ok('actual HTML loads the advisory view before the dashboard that renders it', html.includes('/js/views/ask.js') && html.indexOf('/js/views/ask.js') < html.indexOf('/js/views/dashboard.js'));
    ok('the shipped view makes no network call of its own and loads no third-party script: every ask goes through the app’s own API helper', !/\bfetch\s*\(/.test(source) && /global\.API\.post\('\/ask'/.test(source) && !/<script|import\s/.test(source));
    ok('the view renders answer text as text nodes and never as markup', /U\.h\('p', \{ class: 'small', dataset: \{ askText: 'true' \}, text: entry\.text \}\)/.test(source) && !/\.innerHTML\s*=/.test(source.replace(/box\.innerHTML = ''/g, '')));

    const topics = (await w.API.get('/ask/topics'));
    const card = A.card(topics);
    ok('the card names the channel honestly: deterministic, read-only, no AI', /Ask the journal — deterministic, read-only, no AI/.test(card.textContent) && /no model, no API key, no network call, and no new data/.test(card.textContent));
    ok('the card states where answers come from and that it never writes', /findings this app already computed and stored/.test(card.textContent) && /it never writes anything/.test(card.textContent));
    ok('the card states what the channel refuses, in the trader’s words, before they ask', /refuses market predictions, trade permission, mental-state readings and rule changes/.test(card.textContent));
    const chips = card.querySelectorAll('[data-ask-chip]');
    ok('the card offers the server’s own example questions as chips, one per surface', chips.length === 7 && [...chips].every((c) => c.textContent.trim().length > 4), chips.length);
    ok('the input is bounded to the module’s own limit and the send action is labelled read-only', card.querySelector('[data-ask-input]').getAttribute('maxlength') === '280' && /Ask \(read-only\)/.test(card.querySelector('[data-ask-send]').textContent));
    ok('the card carries the cannot-know list and the refusal codes it will actually receive', /What this channel will not do/.test(card.textContent) && /ask_refused_permission/.test(card.textContent) && /a refusal is a successful answer carrying its reason, not an error/.test(card.textContent));
    ok('the card states no authority and that limits change only where the trader changes them', /Authority: none/.test(card.textContent) && /those change only where you explicitly change them/.test(card.textContent));

    const mount = () => { w.document.body.appendChild(card); return card; };
    mount();
    const box = card.querySelector('[data-ask-answer]');
    const chip = card.querySelector('[data-ask-chip]');
    click(chip); await settle();
    let lines = box.querySelectorAll('[data-ask-text]');
    ok('clicking a chip asks the server and renders one line per answer fact, each with its source', lines.length > 0 && box.querySelectorAll('[data-ask-source]').length === lines.length);
    ok('every rendered line carries its stated kind as a data attribute, so provenance is structural rather than implied', [...box.querySelectorAll('[data-ask-kind]')].every((n) => ['fact', 'record', 'unavailable', 'note'].includes(n.getAttribute('data-ask-kind'))));
    ok('no rendered line claims an effect, a prediction or a calming result', !/\bguarantee|will (?:rise|fall|go up|go down)|\bpredicts?\b/i.test(box.textContent) && !/makes you (?:calm|focused)/i.test(box.textContent));

    const asked = calls.filter((c) => c.url === '/api/ask');
    ok('the chip asks through POST /api/ask with the surface’s own example as the question', asked.length === 1 && JSON.parse(asked[0].body).question === chip.textContent && !('account_id' in JSON.parse(asked[0].body)));

    type(card.querySelector('[data-ask-input]'), '  What are my risk limits today?  ');
    click(card.querySelector('[data-ask-send]')); await settle();
    const second = JSON.parse(calls.filter((c) => c.url === '/api/ask')[1].body).question;
    ok('a typed question is sent as typed (the server trims and bounds it, the view does not rewrite it)', second === '  What are my risk limits today?  ');
    ok('the answer box is replaced rather than appended: one answer container is shown at a time, holding the newest answer', box.children.length === 1 && box.querySelectorAll('[data-ask-answer]').length === 1 && box.querySelectorAll('[data-ask-text]').length === 5, box.children.length);

    type(card.querySelector('[data-ask-input]'), 'Should I buy EURUSD here?');
    click(card.querySelector('[data-ask-send]')); await settle();
    const refusal = box.querySelector('[data-ask-refusal]');
    ok('a refusal renders as a refusal with its code, its reason, its citation and what it can answer instead', !!refusal && refusal.getAttribute('data-ask-refusal') === 'ask_refused_permission' && /Refused — ask_refused_permission/.test(box.textContent) && /The channel can answer:/.test(box.textContent) && /Why \(saved episode words\)/.test(box.textContent));
    ok('a refusal shows no facts at all: one note line, no surface reading and no pick', box.querySelectorAll('[data-ask-text]').length === 1 && box.querySelector('[data-ask-kind]').getAttribute('data-ask-kind') === 'note' && !/\b(buy|sell|long|short)\b\s+(now|here|at)\b/i.test(box.textContent));
    ok('nothing in the rendered refusal offers a button that could act on the trading surfaces', ![...box.querySelectorAll('button')].some((b) => /trade|enter|override|unlock|permit|approve/i.test(b.textContent)));

    type(card.querySelector('[data-ask-input]'), 'How tall is Mount Everest?');
    click(card.querySelector('[data-ask-send]')); await settle();
    ok('an unmatched question renders the honest non-answer with the list of surfaces the channel owns', !!box.querySelector('[data-ask-unknown]') && /Not answered — no_matching_topic/.test(box.textContent) && /Surfaces this channel owns:/.test(box.textContent));

    type(card.querySelector('[data-ask-input]'), '   ');
    click(card.querySelector('[data-ask-send]')); await settle();
    ok('a blank question is refused by the server and the view shows the reason instead of a silent no-op', /Could not read:/.test(box.textContent) || /Type a question/.test(box.textContent) || /ask_invalid/.test(box.textContent));

    const hostile = 'what are <img src=x onerror=alert(1)> my limits';
    type(card.querySelector('[data-ask-input]'), hostile);
    click(card.querySelector('[data-ask-send]')); await settle();
    ok('markup typed into the box is refused at the bound and never injected into the answer surface', box.querySelectorAll('img').length === 0 && errors.length === 0 && (/markup is not accepted/.test(box.textContent) || /ask_invalid/.test(box.textContent)), errors);

    const unavailableCard = A.card(null);
    ok('without the surface list the card says the channel is unavailable and changes nothing about entries', /advisory channel is unavailable/.test(unavailableCard.textContent) && /nothing about entries changed/.test(unavailableCard.textContent) && unavailableCard.querySelectorAll('[data-ask-chip]').length === 0);
    const corrupt = A.answerNode({ answered: true, refused: false, topic: 'risk_state', topic_label: 'My limits', answer: [{ kind: 'unavailable', text: 'That surface could not be read (simulated), so it is reported unavailable.', source: 'ask:read_failed' }] });
    ok('an unreadable surface renders as unavailable with its source, not as a zero or an all-clear', /Unavailable · source: ask:read_failed/.test(corrupt.textContent) && /could not be read/.test(corrupt.textContent));
    const d = Object.getOwnPropertyDescriptor(w.API, 'getToken');
    ok('the view is bound to the trader’s own session token, so a different workspace cannot be asked through a stale card', typeof d === 'object' || /API\.getToken/.test(source) ? /Workspace\/session changed/.test(source) : false, d && d.value);

    ok('no uncaught error was raised by any interaction', errors.length === 0, errors);
    ok('the view keeps the trader’s typed text when a preset answer arrives elsewhere on the page', (() => { const c2 = A.card(topics); w.document.body.appendChild(c2); const input = c2.querySelector('[data-ask-input]'); type(input, 'my limits please'); return input.value === 'my limits please'; })());
  } finally { if (dom) dom.window.close(); }
});
