'use strict';
/** M107 archive/consumers UI probe: the shipped card, history, settings warning helper and
 * the real dashboard/journal wiring for imported archives and orphaned original rows.
 * jsdom without canvas/TradingView: structural/behavioural, not pixel proof. */
const H = require('./m107-test-support'), { ok, start, finish, D } = H, fs = require('fs'), path = require('path');
let dom;
finish('M107 real DOM: imported archives, orphan rows and the settings warning surface', async () => {
  try {
    const { user: u, other, req, token, otherToken } = await start('intention-archive-ui');
    await H.prepare(u, 20); await H.prepare(other, 20);
    let v = (await req('/intention?account_id=' + u.accountId, undefined, 'GET')).data;
    await req('/intention?account_id=' + u.accountId, { template: 'no_revenge', revision: v.revision }, 'PUT');
    const backup = (await req('/export/json', undefined, 'GET')).data.daily_intentions;
    const restored = await req('/import/json', { trades: [], daily_intentions: backup }, 'POST', otherToken);
    ok('restoring a real backup into another owner returns the intention warnings array', restored.status === 200 && Array.isArray(restored.data.intention_warnings), restored.data.intention_warnings);

    const M = require(path.join(H.APP, 'src/market'));
    M.getCalendar = async () => ({ ok: false, events: [] }); M.getQuotes = async () => ({ ok: false, quotes: {} });
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], opened = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o);
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/intention.js', 'views/dashboard.js', 'views/journal.js', 'views/settings.js']) if (fs.existsSync(path.join(H.APP, 'public/js', p))) load(p);
    w.API.setToken(otherToken); await w.Store.load(true); w.Store.setAccount(other.accountId);
    const listener = w.addEventListener.bind(w);
    w.addEventListener = (t, ...a) => t === 'DOMContentLoaded' ? undefined : listener(t, ...a);
    Object.defineProperty(w.document, 'readyState', { value: 'loading', configurable: true }); load('app.js'); delete w.document.readyState; w.addEventListener = listener;
    w.App.boot = async () => {}; w.App.refresh = () => {}; w.App.toast = (text, type) => toasts.push({ text, type });
    const h = w.U.h;
    w.U.h = (tag, p, ...kids) => { if (p?.onclick) { const fn = p.onclick; p = { ...p, onclick: (...a) => { const out = fn(...a); if (out?.then) pending.push(out.catch((e) => errors.push(e.message))); return out; } }; } return h(tag, p, ...kids); };
    const modal = w.App.modal.bind(w.App);
    w.App.modal = (o) => { opened.push(o.title); return modal(o); };
    const settle = async () => { for (let n = 0; n < 6; n++) { await Promise.all(pending); await new Promise((r) => setImmediate(r)); } };
    const last = () => [...w.document.querySelectorAll('.modal')].at(-1);
    const P = w.Views.intention;

    let dest = await w.API.get('/intention', { account_id: other.accountId });
    let card = P.card(dest);
    ok('the receiving trader still has nothing recorded today, with the archives disclosed beside it', dest.state === 'unrecorded' && dest.imported_archives >= 1 && /imported intention record\(s\) restored as unverified archives/.test(card.textContent) && /never count as this account’s recorded day/.test(card.textContent), { state: dest.state, archives: dest.imported_archives });
    ok('imported words never appear as the receiver’s own intention and never claim authority', !/Recorded: “/.test(card.textContent) && /Authority: none/.test(card.textContent) && !/\ballowed\b/.test(card.textContent));
    ok('the receiver is still offered their own editor for today', !!card.querySelector('[data-intention-edit]'));

    await P.history(other.accountId); await settle();
    const historyText = last().textContent, rows = [...last().querySelectorAll('pre')].map((p) => JSON.parse(p.textContent));
    ok('the readonly history lists every restored row as an imported archive of someone else’s words', rows.length >= 1 && rows.filter((r) => r.source === 'imported_unverified').length >= 1 && /never this account’s recorded intention for a day/.test(historyText), rows.map((r) => r.source));
    const imported = rows.find((r) => r.source === 'imported_unverified');
    ok('a restored row keeps its original day, receipt and id as history, and no permission field', imported.state === 'imported_unverified' && imported.historical && imported.historical.day === '2026-10-13' && !!imported.historical.recorded_at && imported.historical.original_id && imported.authority === 'none' && !('allowed' in imported), imported.historical);
    ok('the history modal renders data only, never executable markup from a backup', last().querySelectorAll('img,script,iframe').length === 0);

    let mine = await w.API.get('/intention', { account_id: other.accountId });
    await req('/intention?account_id=' + other.accountId, { template: 'journal_every_trade', revision: mine.revision }, 'PUT', otherToken);
    mine = await w.API.get('/intention', { account_id: other.accountId });
    card = P.card(mine);
    ok('the receiver’s own recorded day sits beside the archives without displacing them', mine.state === 'recorded' && mine.template === 'journal_every_trade' && mine.imported_archives >= 1 && /imported intention record\(s\)/.test(card.textContent), { state: mine.state, archives: mine.imported_archives });

    const warn = P.feedback({ intention_warnings: ['Optional intention history was not restored: future original intention receipt omitted.'] });
    ok('the settings helper surfaces the server’s own warning text verbatim', warn && /future original intention receipt omitted/.test(warn.textContent) && warn.querySelectorAll('p').length === 1);
    ok('the settings helper refuses to invent a warning from a missing field or a missing payload', P.feedback({}) === null && P.feedback(undefined) === null && P.feedback({ intention_warnings: [] }) === null);

    /* An orphaned original row: the account is gone, the row is retained for its owner's own
     * readonly history, never re-attached to another account and never updatable. */
    const mineView = await D.db.prepare('SELECT id FROM daily_intentions WHERE user_id=? AND day=? ORDER BY version DESC LIMIT 1').get(u.userId, '2026-10-13');
    await D.db.prepare('DELETE FROM accounts WHERE id=?').run(u.accountId);
    const orphan = await D.db.prepare('SELECT id,account_id,account_key,source FROM daily_intentions WHERE id=? AND user_id=?').get(mineView.id, u.userId);
    ok('deleting the account keeps the original row for its owner with the account link nulled', orphan && orphan.account_id === null && orphan.account_key !== null && orphan.source === 'human_declared', orphan);
    let blocked = null; try { await D.db.prepare('UPDATE daily_intentions SET day=? WHERE id=?').run('2026-01-01', orphan.id); } catch (e) { blocked = e.message; }
    ok('the retained orphan row is still immutable and cannot be rewritten', !!blocked && /immutable/i.test(blocked), blocked);
    const orphanRows = (await req('/intention/history', undefined, 'GET')).data.records.filter((r) => r.id === orphan.id);
    ok('its true words and receipt stay readable in the owner’s own readonly history, labelled with no account', orphanRows.length === 1 && orphanRows[0].state === 'recorded' && orphanRows[0].text === 'Today I will not revenge trade' && orphanRows[0].framing === 'process_template' && orphanRows[0].account_id === null && orphanRows[0].account_key === orphan.account_key, orphanRows[0]);
    const deletedDesk = await req('/intention?account_id=' + u.accountId, undefined, 'GET');
    const otherScope = (await req('/intention/history?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.records;
    ok('the orphan can never be claimed by a deleted desk or leak into another owner’s scope', deletedDesk.status === 404 && deletedDesk.data.code === 'intention_invalid' && !otherScope.some((r) => r.id === orphan.id), { deleted: deletedDesk.status, leaked: otherScope.map((r) => r.id) });

    const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8');
    const dash = fs.readFileSync(path.join(H.APP, 'public/js/views/dashboard.js'), 'utf8');
    const journal = fs.readFileSync(path.join(H.APP, 'public/js/views/journal.js'), 'utf8');
    const settings = fs.readFileSync(path.join(H.APP, 'public/js/views/settings.js'), 'utf8');
    ok('the shipped day surfaces fetch and render the same intention object', /\/intention/.test(dash) && /Views\.intention\.card/.test(dash) && /daily_intention/.test(journal) && /Views\.intention\.card/.test(journal) && /intention\??\.feedback/.test(settings) && /views\/intention\.js/.test(html));
    ok('no shipped intention surface mints permission, a score or a percentage', !/readiness|percent|win[- ]?rate|score/i.test(dash.slice(Math.max(0, dash.indexOf('/intention') - 400), dash.indexOf('/intention') + 400)) && !/allowed/.test(P.card(mine).textContent));
    ok('no uncaught DOM error while rendering the archive/orphan surfaces', errors.length === 0, errors.slice(0, 3));
  } catch (e) { ok('archive-ui probe completed without an uncaught error', false, e.message); console.error(e.stack); }
});
