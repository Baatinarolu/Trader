'use strict';
/** M107 UI probe: the shipped intention card/editor/history in jsdom against the real
 * server. The DOM app is the real shipped source; jsdom has no canvas and TradingView is
 * blocked, so this is a structural/behavioural check, not a pixel or browser-engine proof. */
const H = require('./m107-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
let dom;
finish('M107 real DOM: the one-rule card, the strict editor and the readonly history', async () => {
  try {
    const { user: u, req, token } = await start('intention-ui');
    await H.prepare(u, 20);
    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o);
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/intention.js', 'views/dashboard.js', 'views/journal.js', 'views/settings.js']) if (fs.existsSync(path.join(H.APP, 'public/js', p))) load(p);
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
    const last = () => [...w.document.querySelectorAll('.modal')].at(-1), f = (k) => last()?.querySelector('[data-intention-' + k + ']');
    const click = (node) => node.dispatchEvent(new w.Event('click', { bubbles: true }));
    const P = w.Views.intention;

    const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8');
    ok('actual HTML loads the intention view before the dashboard and journal that render it', html.includes('/js/views/intention.js') && html.indexOf('/js/views/intention.js') < html.indexOf('/js/views/dashboard.js') && html.indexOf('/js/views/intention.js') < html.indexOf('/js/views/journal.js'));

    let view = await w.API.get('/intention', { account_id: u.accountId });
    let card = P.card(view);
    ok('the card states the saved rule and names the episode’s own anti-example', /one simple sentence/.test(card.textContent) && /make \$5,000/.test(card.textContent) && /outcome goal/.test(card.textContent), card.textContent.slice(0, 140));
    ok('a day with nothing recorded is not a failure and offers no score', /Not recorded yet today/.test(card.textContent) && !/readiness score|\bgrade\b|\d+%/.test(card.textContent), card.textContent.slice(0, 120));
    ok('the card offers the editor and the readonly history and states authority:none', !!card.querySelector('[data-intention-edit]') && !!card.querySelector('[data-intention-history]') && /Authority: none/.test(card.textContent));
    ok('no intention is ever carried over or defaulted into today', /not a failure/.test(card.textContent) && /never copied from an earlier day/.test(card.textContent));

    const past = await w.API.get('/intention', { account_id: u.accountId, date: '2026-10-12' });
    const pastCard = P.card(past);
    ok('a past day is readonly: no editor button and no back-filling', !pastCard.querySelector('[data-intention-edit]') && /readonly/.test(pastCard.textContent) && /cannot be written for yesterday or tomorrow/.test(pastCard.textContent));
    ok('a past day keeps its own empty answer rather than borrowing today’s words', pastCard.textContent.includes('Nothing was recorded on that day') && !/A\+ setups only/.test(pastCard.textContent));

    await P.edit(); await settle();
    const radios = [...last().querySelectorAll('[data-intention-template]')];
    ok('the editor offers exactly the four saved process examples', radios.length === 4 && radios.map((r) => r.dataset.intentionTemplate).join(',') === 'follow_plan,a_plus_only,journal_every_trade,no_revenge', radios.length);
    ok('no saved example is preselected — there is no default intention', radios.every((r) => !r.checked) && f('custom').checked);
    ok('the neutral state is the trader’s own words with an empty box — no saved example is chosen for them', f('text').disabled === false && f('text').value === '');
    /* jsdom does not run a radio's default action for a synthetic click: set the check and
     * dispatch the change the view actually listens to, exactly like the M106 probe did. */
    radios[0].checked = true; radios[0].dispatchEvent(new w.Event('change')); await settle();
    ok('picking a saved example disables free text and keeps the check the trader made', radios[0].checked && f('text').disabled === true);
    toasts.length = 0; click(f('save')); await settle();
    ok('recording a saved example reports the record and what did NOT change', toasts.some((t) => /Intention recorded for today/.test(t.text) && /No trade permission, risk or grade changed/.test(t.text)), toasts);
    view = await w.API.get('/intention', { account_id: u.accountId });
    ok('the recorded day comes back as the saved example with its framing and receipt', view.state === 'recorded' && view.template === 'follow_plan' && view.framing === 'process_template' && !!view.receipt, { state: view.state, framing: view.framing });

    await P.edit(); await settle();
    const custom2 = f('custom'); custom2.checked = true; custom2.dispatchEvent(new w.Event('change')); await settle();
    ok('choosing your own words re-enables the box and clears every saved example in this editor', custom2.checked === true && [...last().querySelectorAll('[data-intention-template]')].every((r) => !r.checked) && f('text').disabled === false, { checked: custom2.checked, disabled: f('text').disabled });
    f('text').value = 'Today I will make $5,000 from the market';
    toasts.length = 0; click(f('save')); await settle();
    ok('the editor refuses a money target in the same sentence and says so', toasts.some((t) => /amount and an outcome in the same sentence/.test(t.text)) && toasts.every((t) => t.type === 'err'), toasts);
    view = await w.API.get('/intention', { account_id: u.accountId });
    ok('the refused write changed nothing — the saved example is still the day', view.template === 'follow_plan' && view.version === 1, { version: view.version });
    f('text').value = 'Today I will wait for the retest before entering';
    toasts.length = 0; click(f('save')); await settle();
    ok('free text is stored as written and labelled unverified, never process-oriented', toasts.some((t) => t.type === 'ok'), toasts);
    view = await w.API.get('/intention', { account_id: u.accountId });
    ok('the stored free text keeps the trader’s wording, framing and its own warnings', view.text === 'Today I will wait for the retest before entering' && view.framing === 'unverified_free_text' && Array.isArray(view.warnings), { framing: view.framing });

    await P.edit(); await settle();
    ok('the editor shows the retained records for the day rather than hiding them', /Retained records for this day/.test(last().textContent) && (last().querySelectorAll('pre').length >= 2));
    f('text').value = 'unsaved draft that must be discarded';
    click(f('reload')); await settle();
    ok('reload discards the unsaved draft and re-reads the day from the server', f('text').value === view.text && view.text === 'Today I will wait for the retest before entering', { box: f('text').value, server: view.text });

    toasts.length = 0; const hm = await P.history(); await settle();
    ok('the readonly history modal lists the day’s versions with receipts and says it is not a score', /Readonly daily-intention history/.test(last().textContent) && /never this account’s recorded intention for a day/.test(last().textContent) && /Nothing here is a score or a judgement/.test(last().textContent), toasts);
    ok('the history modal renders every retained record as data, not as executable markup', last().querySelectorAll('pre').length >= 1 && last().querySelectorAll('img,script,iframe').length === 0 && typeof hm?.close === 'function');

    const markup = 'Today I follow my plan <img src=x onerror=alert(1)>';
    const saved = await req('/intention?account_id=' + u.accountId, { intention: markup, revision: (await req('/intention?account_id=' + u.accountId, undefined, 'GET')).data.revision }, 'PUT');
    const markupRow = (await w.API.get('/intention', { account_id: u.accountId }));
    const markupCard = P.card(markupRow);
    ok('the server stored the markup as words and the card renders them as escaped text', saved.status === 200 && markupRow.text === markup && markupCard.querySelectorAll('img,script').length === 0 && markupCard.textContent.includes('<img src=x'), { status: saved.status });
    ok('no uncaught DOM error was recorded while rendering the real views', errors.length === 0, errors.slice(0, 3));
  } catch (e) { ok('ui probe completed without an uncaught error', false, e.message); console.error(e.stack); }
});
