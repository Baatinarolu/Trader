'use strict';
/** M106 UI probe: the shipped card/editor in jsdom against the real server. The DOM
 * app is the real shipped source; jsdom has no canvas, and TradingView is blocked, so
 * this is a structural/behavioural check, not a pixel or browser-engine proof. */
const H = require('./m106-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
let dom;
const YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
finish('M106 real DOM: four-question card, strict editor and readonly history', async () => {
  try {
    const { user: u, req, token } = await start('ui');
    let v = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], requests = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => { requests.push({ url: String(url), method: o?.method || 'GET' }); return fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o); };
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/state-gate.js', 'views/dashboard.js', 'views/journal.js']) if (fs.existsSync(path.join(H.APP, 'public/js', p))) load(p);
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
    const last = () => [...w.document.querySelectorAll('.modal')].at(-1), f = (k) => last()?.querySelector('[data-state-gate-' + k + ']');
    const click = (node) => node.dispatchEvent(new w.Event('click', { bubbles: true }));
    const P = w.Views.stateGate;

    const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8');
    ok('actual HTML loads the shared gate view before the dashboard that renders it', html.includes('/js/views/state-gate.js') && html.indexOf('/js/views/state-gate.js') < html.indexOf('/js/views/dashboard.js'));

    let view = await w.API.get('/state-gate', { account_id: u.accountId });
    let card = P.card(view);
    ok('the card states the saved rule and refuses to read the trader’s mind', /you don’t trade yet/.test(card.textContent) && /cannot read your mind/.test(card.textContent), card.textContent.slice(0, 120));
    ok('an account that never answered is shown as not adopted, never as clear/pass', /Not adopted on this account/.test(card.textContent) && !/passed/i.test(card.textContent), card.textContent.slice(0, 200));
    ok('the card offers the four questions and a readonly history, and no score', !!card.querySelector('[data-state-gate-edit]') && !!card.querySelector('[data-state-gate-history]') && !/readiness score|\bgrade\b|\d+%/.test(card.textContent), card.textContent.slice(0, 90));

    await P.edit(); await settle();
    const questions = [...last().querySelectorAll('input[type=radio][data-state-gate-answer]')];
    ok('the editor asks exactly four questions with a yes and a no each', questions.length === 8 && new Set(questions.map((q) => q.dataset.stateGateAnswer)).size === 4, questions.length);
    ok('no answer is preselected — there is no default yes', questions.every((q) => !q.checked));
    ok('the editor stores no free text: there is no text input to judge or misread', last().querySelectorAll('input[type=text],textarea').length === 0);
    toasts.length = 0; click(f('save')); await settle();
    ok('an unchecked save is refused with an explicit message rather than a silent pass', toasts.some((t) => /Answer all four questions/.test(t.text)), toasts);
    for (const q of questions.filter((x) => x.value === 'no')) if (q.dataset.stateGateAnswer === 'following_plan') { q.checked = true; q.dispatchEvent(new w.Event('change')); }
    for (const q of questions.filter((x) => x.value === 'yes')) if (q.dataset.stateGateAnswer !== 'following_plan') { q.checked = true; q.dispatchEvent(new w.Event('change')); }
    toasts.length = 0; click(f('save')); await settle();
    ok('saving four answered questions is recorded and says what did NOT change', toasts.some((t) => /Answers recorded/.test(t.text) && /unchanged/.test(t.text)), toasts);
    view = await w.API.get('/state-gate', { account_id: u.accountId });
    ok('the recorded no comes back as a failed gate with the question named', view.state === 'failed' && view.failed_questions.join(',') === 'following_plan', view.state);
    card = P.card(view);
    ok('the failed card names the trader’s own no and the consequence', /You answered no to/.test(card.textContent) && /Am I following the trade plan\?/.test(card.textContent) && /refused in the app/.test(card.textContent));
    ok('the failed card still refuses any readiness/score reading', /not a readiness score/.test(card.textContent) || /never a pass/.test(card.textContent), card.textContent.slice(0, 160));
    await P.history(); await settle();
    const history = [...last().querySelectorAll('pre')].map((p) => p.textContent).join('\n');
    ok('readonly history shows the retained answers and receipts, not a verdict', /following_plan/.test(history) && /recorded_at/.test(history) && !/passed/.test(history));
    while (w.App.modalStack.length) w.App.modalStack.at(-1)();

    await req('/state-gate?account_id=' + u.accountId, { answers: null, revision: (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data.revision }, 'PUT');
    view = await w.API.get('/state-gate', { account_id: u.accountId });
    card = P.card(view);
    ok('an adopted account with no current check is shown as unanswered and refusing', view.state === 'unanswered' && /refused until you answer/.test(card.textContent));
    await req('/state-gate?account_id=' + u.accountId, { answers: YES, revision: (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data.revision }, 'PUT');
    view = await w.API.get('/state-gate', { account_id: u.accountId });
    card = P.card(view);
    ok('a fresh pass is labelled as the trader’s own answers with an expiry', /Fresh answers: all yes/.test(card.textContent) && /server receipt/.test(card.textContent) && /expires/.test(card.textContent));
    ok('the pass names all four questions with their recorded answers', (card.textContent.match(/— yes/g) || []).length === 4, card.textContent.match(/— (yes|no)/g));

    const breaking = { ...view, state: 'unavailable', account_id: null, basis: view.basis };
    ok('an unavailable read is refused as context, not shown as a pass or a block', /unavailable/.test(P.card(breaking).textContent) && !/Fresh answers: all yes/.test(P.card(breaking).textContent.replace(/not treated as answered, passed or blocked/g, '')));
    ok('the card converts nothing into confidence: no percentage, dial or grade is rendered', !/\d+%/.test(card.textContent.replace(/APP window \d+ min/g, '')) && !/grade|dial/i.test(card.textContent));
    ok('the whole run produced no uncaught DOM error', errors.length === 0, errors);
  } catch (e) { H.ok('uncaught ' + e.message, false); }
  finally { if (dom) dom.window.close(); }
});
