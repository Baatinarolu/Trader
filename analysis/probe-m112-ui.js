'use strict';
/** M112 ui probe: the shipped trading-window dialog rendered in jsdom against the real server. The
 * dialog is where the trader OWNS the boundary, so this measures what it shows (their window, their
 * zone, the half-open rule), what it refuses (a half pair, an equal pair), and what it sends — the
 * suggestion must be visible, labelled, and applied only when they click it. jsdom has no browser
 * engine: structural/behavioural, not a pixel proof. */
const fs = require('fs'), path = require('path');
const H = require('./m112-test-support'), { ok } = H;
const N = H.mod('src/trading-window');
let dom;
H.finish('M112 real DOM: the dialog the trader owns the window with', async () => {
  if (!H.shipped(N, 'the M112 trading-window rule')) return;
  try {
    const u = await H.start('m112-ui');
    const shelf = await H.account(u, 'M112 ui desk', { routine_window_start: '08:00', routine_timezone: 'Africa/Lagos' });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], calls = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => { calls.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''), method: (o && o.method) || 'GET', body: o && o.body }); return fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o); };
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/settings.js']) load(p);
    w.API.setToken(u.token); await w.Store.load(true);
    const listener = w.addEventListener.bind(w);
    w.addEventListener = (t, ...a) => t === 'DOMContentLoaded' ? undefined : listener(t, ...a);
    Object.defineProperty(w.document, 'readyState', { value: 'loading', configurable: true }); load('app.js'); delete w.document.readyState; w.addEventListener = listener;
    w.App.boot = async () => {}; w.App.refresh = () => {}; w.App.toast = (text, type) => toasts.push({ text, type });
    const h = w.U.h;
    w.U.h = (tag, p, ...kids) => { if (p && p.onclick) { const fn = p.onclick; p = { ...p, onclick: (...a) => { const out = fn(...a); if (out && out.then) pending.push(out.catch((e) => errors.push(e.message))); return out; } }; } return h(tag, p, ...kids); };
    const settle = async () => { for (let n = 0; n < 10; n++) { await Promise.all(pending); await new Promise((r) => setImmediate(r)); } };
    const click = (node) => { if (!node) return false; node.dispatchEvent(new w.Event('click', { bubbles: true })); return true; };
    const type = (node, text) => { if (!node) return false; node.value = text; node.dispatchEvent(new w.Event('input', { bubbles: true })); return true; };
    const src = fs.readFileSync(path.join(H.APP, 'public/js/views/settings.js'), 'utf8');
    const botsSrc = fs.readFileSync(path.join(H.APP, 'public/js/views/bots.js'), 'utf8');
    /* A tree with no window dialog has no modal at all: every read below is guarded so the absent
     * dialog is a FAILING ASSERTION rather than a TypeError that stops the probe. */
    const modal = () => w.document.body.querySelector('.modal');
    const modalText = () => { const m = modal(); return m ? m.textContent : ''; };
    const field = (id) => (modal() ? w.U.$('#' + id, modal()) : null);
    const footBtn = (label) => { const m = modal(); return m ? [...m.querySelectorAll('.modal-foot button')].find((b) => b.textContent === label) : null; };
    const pressFoot = (label) => { const b = footBtn(label); if (b) click(b); return !!b; };
    const lastToast = () => toasts[toasts.length - 1] || { text: '', type: null };
    const windowCalls = () => calls.filter((c) => c.url.startsWith('/api/bots/window'));
  const windowPuts = () => windowCalls().filter((c) => c.method === 'PUT');
    const root = w.U.$('#root');

    /* ---------------------------------------------------------------- the pane */
    ok('the dialog exists as a labelled action per account, addressed by that account\u2019s own id', /data-awindow="\$\{a\.id\}"/.test(src) && /windowDialog\(accounts\.accounts\.find/.test(src), null);
    ok('the pane states the window in the trader\u2019s own terms and names who chose it, when there is none and when there is', /None selected — nothing is blocked on one/.test(src) && /accepted from your recorded journal/.test(src) && /enforced as a hard block outside it/.test(src), null);
    ok('the bots view carries the window line beside the killzone restriction rather than only inside a veto string', /filters && B\.data\.setups\.filters\.trading_window/.test(botsSrc) && /Outside your trading window/.test(botsSrc) && /No trading window selected/.test(botsSrc), null);

    await w.Views.settings.render(root); await settle();
    const openBtn = root.querySelector(`button[data-awindow="${shelf.id}"]`);
    ok('the accounts pane renders the window action for the trader\u2019s own desk', !!openBtn, null);
    click(openBtn); await settle();

    /* ---------------------------------------------------------------- the dialog */
    ok('the dialog names the zone the app will hold the boundary on, and it is the account\u2019s own routine zone', modalText().includes('Africa/Lagos'), modalText().slice(0, 160));
    ok('the two sides are time inputs with their own ids, so a trader types a clock and not a number of minutes', !!field('w-start') && !!field('w-end') && field('w-start').getAttribute('type') === 'time' && field('w-end').getAttribute('type') === 'time', null);
    ok('both are EMPTY on a desk with no window: the dialog never pre-fills a boundary the trader did not choose', field('w-start') && field('w-start').value === '' && field('w-end').value === '', { start: field('w-start') && field('w-start').value, end: field('w-end') && field('w-end').value });
    ok('the rule that makes the boundary unambiguous is written next to the fields: half-open, and a start after the end runs through midnight', /the start minute is inside, the end minute is outside/.test(modalText()) && /runs through midnight/.test(modalText()), null);
    ok('the module\u2019s own sentence for the current state is shown rather than a paraphrase', modalText().includes(N.noteFor(N.stateOf({ ownedZone: 'Africa/Lagos', nowMs: H.now() })).note), null);
    ok('with nothing to derive the dialog SAYS so instead of hiding the block or showing an empty button', !field('w-accept') && field('w-start') !== null && /Nothing to derive yet|no closed trade|recorded session/i.test(modalText()), null);

    /* ---------------------------------------------------------------- the client-side refusals */
    type(field('w-start'), '07:00');
    pressFoot('Save'); await settle();
    ok('a start without an end is refused in the dialog, with the reason, and NOTHING is written', windowPuts().length === 0 && /both a start and an end/.test(lastToast().text) && lastToast().type === 'err', { puts: windowPuts().length, toast: lastToast() });
    type(field('w-end'), '07:00');
    pressFoot('Save'); await settle();
    ok('two equal times are refused too — the dialog will not read them as \u201call day\u201d', windowPuts().length === 0 && /cannot be the same minute/.test(lastToast().text), { puts: windowPuts().length, toast: lastToast() });

    /* ---------------------------------------------------------------- saving the boundary */
    const pair = H.timesFor('Africa/Lagos', H.now());
    type(field('w-start'), pair.outside.start); type(field('w-end'), pair.outside.end);
    pressFoot('Save'); await settle();
    const put = windowPuts().find((c) => c.url === '/api/bots/window') || null;
    ok('saving sends exactly the two sides to the window endpoint, with the account they belong to', !!put && JSON.parse(put.body).account_id === shelf.id && JSON.parse(put.body).window_start === pair.outside.start && JSON.parse(put.body).window_end === pair.outside.end, put && JSON.parse(put.body));
    ok('and it never sends a zone of its own: the zone is the account\u2019s own setting, not something the dialog decides', !!put && !('window_timezone' in JSON.parse(put.body)), put && Object.keys(JSON.parse(put.body)));
    ok('the save is reported and the dialog closes only after the server answered', !modal() && /Trading window saved/.test(lastToast().text) && lastToast().type === 'ok', lastToast());
    const stored = await w.API.get('/bots/window', { account_id: shelf.id }).catch(() => ({}));
    ok('the server stored that pair for this desk, so the dialog and the guardrail read the same boundary', (stored.window || {}).start === pair.outside.start && (stored.window || {}).end === pair.outside.end && (stored.window || {}).source === 'manual' && stored.state === 'outside', stored.window);

    /* ---------------------------------------------------------------- reopening, and clearing */
    await w.Views.settings.render(root); await settle();
    ok('the pane now states the saved window with its source, so a reload does not lose who chose it', /set by you/.test(root.textContent) && root.textContent.includes(pair.outside.start), (root.textContent.match(/Trading window: [^<]{0,80}/) || [''])[0]);
    click(root.querySelector(`button[data-awindow="${shelf.id}"]`)); await settle();
    ok('reopening shows the STORED pair, not empty fields and not a suggestion', field('w-start') && field('w-start').value === pair.outside.start && field('w-end').value === pair.outside.end, { start: field('w-start') && field('w-start').value, end: field('w-end') && field('w-end').value });
    pressFoot('Clear window'); await settle();
    const clear = windowPuts().pop();
    ok('clearing sends BOTH sides as null rather than an empty pair or a silent omission', clear && JSON.parse(clear.body).window_start === null && JSON.parse(clear.body).window_end === null, clear && JSON.parse(clear.body));
    ok('and the toast says what clearing means, because \u201cnothing blocked\u201d is the whole point of the choice', /nothing is blocked on one/.test(lastToast().text), lastToast());
    ok('the cleared desk is back to unset on the server too', (await w.API.get('/bots/window', { account_id: shelf.id }).catch(() => ({}))).state === 'unset', null);

    /* ---------------------------------------------------------------- the labelled suggestion */
    for (let i = 0; i < 34; i++) {
      const day = 5 + (i % 3), hour = i < 20 ? 7 : 8;
      await H.D.db.prepare(`INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,net_pnl,setup_grade)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.user.userId, shelf.id, 'EURUSD', 'long', 'closed',
        `2026-10-0${day}T${String(hour).padStart(2, '0')}:10:00.000Z`, `2026-10-0${day}T${String(hour + 1).padStart(2, '0')}:00:00.000Z`, 1.1, 1.101, 1.099, 1.102, 1, 0, 5, 'A');
    }
    const putsBeforeOpening = windowPuts().length;
    await w.Views.settings.render(root); await settle();
    click(root.querySelector(`button[data-awindow="${shelf.id}"]`)); await settle();
    const accept = modal() ? w.U.$('#w-accept', modal()) : null;
    ok('with 34 recorded London closes the dialog offers the band it derived, in the trader\u2019s own clock, as a BUTTON', !!accept && accept.textContent.includes('08:00') && accept.textContent.includes('10:00') && accept.textContent.includes('Africa/Lagos'), accept && accept.textContent);
    ok('the offer explains WHOSE journal it came from and how many trades cleared the floor, on the same screen', /London holds 34 closed trades/.test(modalText()) && /30-trade|review floor/.test(src), modalText().slice(0, 240));
    ok('and it says what the suggestion is NOT, before the trader clicks it', /not a prediction, not a market edge and not a permission/.test(modalText()), null);
    ok('opening the dialog applied nothing: looking at the suggestion writes no window at all', windowPuts().length === putsBeforeOpening, { before: putsBeforeOpening, after: windowPuts().length });
    click(accept); await settle();
    const acceptPut = windowPuts().pop() || { body: '{}' };
    ok('clicking it sends `accept_suggestion` rather than a pair the client computed itself', JSON.parse(acceptPut.body).accept_suggestion === true && !('window_start' in JSON.parse(acceptPut.body)), JSON.parse(acceptPut.body));
    const accepted = await w.API.get('/bots/window', { account_id: shelf.id }).catch(() => ({}));
    ok('and the server recorded it as accepted from the journal, not as something the trader typed', (accepted.window || {}).source === 'from_session_history' && (accepted.window || {}).start === '08:00' && (accepted.window || {}).end === '10:00' && (accepted.window || {}).timezone === 'Africa/Lagos', accepted.window);
    ok('the toast names that difference too, so the trader knows what they just accepted', /accepted from your recorded journal/.test(lastToast().text) && lastToast().type === 'ok', lastToast());
    ok('no uncaught error was raised by any interaction', errors.length === 0, errors);
  } finally { if (dom) dom.window.close(); }
});
