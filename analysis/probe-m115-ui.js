'use strict';
/**
 * M115 ui probe: the clean-rep card, rendered in jsdom against the payload the server really serves.
 * What is measured is what a trader can be misled by: an UNSTARTED count rendered as \"0 reps\", an
 * unreadable count rendered as an empty challenge, a money figure or a grade appearing beside the
 * count, a failed rep rendered as punishment, a day based figure presented as the measure, and a
 * target the trader cannot actually set. jsdom has no browser engine: structural and behavioural,
 * not a pixel proof.
 */
const fs = require('fs'), path = require('path');
const H = require('./m115-test-support'), { ok } = H;
let dom;
H.finish('M115 real DOM: the clean-rep card the dashboard reads', async () => {
  const C = H.mod('src/challenge');
  if (!H.shipped(C, 'the clean-rep count (src/challenge.js)')) return;
  const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
  dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, toasts = [], calls = [];
  const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
  load('util.js'); load('views/challenge.js');
  w.Store = { user: { id: 1 }, accountId: 3, isoToday: () => '2026-10-13', reloadAll: async () => { calls.push(['reloadAll']); } };
  w.API = { getToken: () => 'tok', put: async (url, body) => { calls.push(['put', url, body]); return { ok: true }; } };
  w.App = { toast: (text, type) => toasts.push({ text, type }), refresh: () => calls.push(['refresh']) };
  const V = w.Views.challenge;
  const text = (n) => n.textContent;
  const q = (sel, root) => (root || w.document.body).querySelector(sel);
  const qa = (sel, root) => [...(root || w.document.body).querySelectorAll(sel)];
  ok('the card is its own section, so a dashboard can mount it without a layout change', !!V && typeof V.card === 'function' && V.card({ state: 'unavailable' }).dataset.challenge === 'true');
  if (!V || typeof V.card !== 'function') return;
  ok('and the card is mounted on the dashboard and loaded by the page exactly when the tree ships it',
    /Views\.challenge/.test(fs.readFileSync(path.join(H.APP, 'public/js/views/dashboard.js'), 'utf8')) && /views\/challenge\.js/.test(fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8')));

  const recent = (id, symbol, counted, failed, reviewedAt) => ({ trade_id: id, symbol, closed_at: '2026-10-13T09:00:00.000Z', close_day: '2026-10-13', counted, failed, plan: { strategy_id: 7, owned: true }, breaches: { checks_recorded: 2, failed_checks: counted ? 0 : 1, stop_not_honoured: failed.includes('no_recorded_breach') && symbol === 'STOPX' }, journal: { complete: counted, reviewed_at: reviewedAt, same_close_day: counted, missing: [] } });
  const available = (over = {}) => ({
    state: 'available', version: 'clean-reps-v1', account_id: 3, today: '2026-10-13',
    criteria: ['plan_linked', 'no_recorded_breach', 'journalled_same_close_day'], basis: C.BASIS, scope: C.SCOPE, notes: { ...C.NOTES },
    start: { state: 'set', value: '2026-10-12' }, target: { state: 'set', value: 3, default: 21, min: 1, max: 999 },
    progress: { counted: 1, target: 3, remaining: 2, beyond_target: 0, run: 1, days_with_a_rep: 1, days_note: C.NOTES.days, first_counted_at: '2026-10-12T09:00:00.000Z', last_counted_at: '2026-10-13T09:00:00.000Z' },
    window: { trades_closed: 5, before_start: 2, undated_closes: 1, open_excluded: 1, truncated: false },
    not_counted: { total: 4, by_criterion: { plan_linked: 1, no_recorded_breach: 2, journalled_same_close_day: 1 }, unrecorded_checks: 1, missing_journal_fields: ['explicit_review_acknowledgement'] },
    journaling: { reviewed_in_window: 3, same_close_day: 2, later_than_close_day: 1, median_gap_minutes: 720, max_gap_minutes: 1440, waiting_on_acknowledgement: 2, basis: 'The acknowledgement\u2019s UTC day against the trade\u2019s UTC close day.' },
    recent: [recent(11, 'REPX', true, [], '2026-10-13T10:00:00.000Z'), recent(12, 'NOPLANX', false, ['plan_linked'], '2026-10-13T10:00:00.000Z'), recent(13, 'BREACHX', false, ['no_recorded_breach', 'journalled_same_close_day'], null), recent(14, 'STOPX', false, ['no_recorded_breach'], '2026-10-13T10:00:00.000Z')],
    outcome_joined: false, outcome_note: 'Reps are NOT joined to results: this exercise counts a habit, and saying a rep made or saved money would be a causal claim this journal has not measured.',
    limits: { read_only: true, writes: 0, grades_influence: false, permission_influence: false, caps_influence: false, guardrail_decisions_influence: false, plan_change_permission: false, causal: false, broker_verified: false }, ...over,
  });
  const money = (n) => /\$|£|€|₦|P&L amount|profit of|net_pnl|r_multiple/i.test(text(n));

  /* ---------------------------------------------------------- 1. the unreadable count */
  const un = V.card({ state: 'unavailable', reason: 'The trade and journal records could not be read, so the rep count is unknown here. This is not zero reps and not a clean count.' });
  ok('an unreadable count says UNKNOWN and says in as many words that this is not zero reps and not a clean count',
    /unknown/i.test(text(un)) && /not zero reps/i.test(text(un)) && /not a clean count/i.test(text(un)), text(un).slice(0, 160));
  ok('and it renders no figure at all: not 0, not 0/21, and no bar pretending to be progress',
    !/\b0\b\s*(\/|reps)/.test(text(un)) && !q('[data-challenge-progress]', un) && !q('[data-challenge-bar]', un) && !/\d\s*\/\s*\d/.test(text(un)), text(un).slice(0, 160));
  ok('an unavailable card still refuses to be a money or a grade surface: the words appear only to deny them, and no figure is rendered',
    !money(un) && /Nothing here is a grade, and nothing here is money/.test(text(un)) && !/\bA\+|score:\s*\d|grade:\s*\w/i.test(text(un)), text(un).slice(-140));

  /* ---------------------------------------------------------- 2. the unstarted count */
  const ns = V.card(C.notStarted({ challenge_start: null, challenge_target: null }, { accountId: 3, today: '2026-10-13' }));
  ok('an unstarted card says `not started` and that nothing is counted yet, in the words that make it unmistakable',
    /not started/i.test(text(ns)) && /nothing is counted yet/i.test(text(ns)) && /not zero reps/i.test(text(ns)), text(ns).slice(0, 200));
  ok('and it offers the trader the two declarations rather than an empty box: a start button and a target field already carrying the DEFAULT 21',
    !!q('[data-challenge-start]', ns) && !!q('[data-challenge-target]', ns) && /value="21"/.test(q('[data-challenge-target]', ns).outerHTML) && /21-rep count/.test(text(q('[data-challenge-start]', ns))));
  ok('the unstarted card names the three criteria so the exercise is not a mystery, and states that it counts trades and never days',
    /linked to one of your own written plans/i.test(text(ns)) && /executed cleanly/i.test(text(ns)) && /journalled on its own UTC close day/i.test(text(ns)) && /counts trades, never days/i.test(text(ns)), text(ns).slice(0, 400));

  /* ---------------------------------------------------------- 3. the live count */
  const card = V.card(available());
  ok('a live count renders the count and the target as the trader\u2019s own numbers, and the remaining figure as arithmetic on them',
    /1\s*\/\s*3 reps/.test(text(q('[data-challenge-progress]', card))) && /2 to go/.test(text(q('[data-challenge-progress]', card).parentElement)), text(q('[data-challenge-progress]', card).parentElement));
  ok('the bar is the ratio of counted reps to the target, so it can never claim progress the count does not have',
    /width:33%/.test(q('[data-challenge-bar]', card).outerHTML), q('[data-challenge-bar]', card).outerHTML);
  ok('the window tally attributes every closed trade: how many closed, how many did not count, and why, criterion by criterion',
    (() => { const t = text(q('[data-challenge-totals]', card)); return /5\s*closed trades/.test(t) && /4\s*did not count/.test(t) && /1 not linked to your own written plan/.test(t) && /2 a recorded rule breach or no recorded checklist/.test(t) && /1 not journalled on its close day/.test(t); })(),
    text(q('[data-challenge-totals]', card)));
  ok('the trades excluded by the start day are labelled as excluded rather than as failures, beside the closes that cannot be dated and the read bound',
    (() => { const t = text(q('[data-challenge-totals]', card)); return /2 closed before the start day \(excluded, never counted and never failures\)/.test(t) && /1 with no usable close clock/.test(t); })(),
    text(q('[data-challenge-totals]', card)));
  ok('a trade with no recorded checklist is called out in the trader\u2019s own interest: no record is not a clean record',
    /no record is not a clean record/i.test(text(q('[data-challenge-totals]', card))) && /1 of them carry no recorded checklist/.test(text(q('[data-challenge-totals]', card))));
  ok('the journalling proxy is stated as a proxy: the same UTC close day, the acknowledgement, and the observed gap beside it',
    (() => { const t = text(q('[data-challenge-journal]', card)); return /2\s*of\s*3\s*reviewed/.test(t) && /still waiting on the explicit acknowledgement/.test(t) && /Median observed gap: 720 min \(max 1440\)/.test(t) && /UTC day against the trade\u2019s UTC close day/i.test(t); })(),
    text(q('[data-challenge-journal]', card)));
  ok('the newest trades are listed with counted/not-counted and the reason, so a failure is attributable to a trade rather than to the trader',
    (() => { const rows = qa('[data-challenge-recent] .row-between', card).map(text); return rows.length === 4 && /rep .*REPX/.test(rows[0]) && /not counted .*NOPLANX .*no plan link/.test(rows[1]) && /recorded breach\/no checklist/.test(rows[2]) && /not journalled that day/.test(rows[2]); })(),
    qa('[data-challenge-recent] .row-between', card).map(text));
  ok('the count is never turned into money, a grade or a score anywhere on the card: the only mention of each is the sentence refusing it',
    !money(card) && !/\bnet_pnl\b/i.test(text(card)) && /Progress is never joined to P&L/.test(text(card)) && /Reps are NOT joined to results/.test(text(card)) && /Nothing here is a score, a grade or money/.test(text(card)) && !/score:\s*\d|grade:\s*\w+|\bA\+\s\d/i.test(text(card)), text(card).slice(-120));
  ok('and the run is explained as a run of reps that a failed trade restarts WITHOUT erasing the count \u2014 the punishment reading is closed on the card itself',
    /a failed trade never erases a counted rep; only the run restarts/.test(text(card)) && /clean run\s*1/.test(text(card)), text(card).slice(0, 300));
  ok('the card states plainly that days are not the measure, beside the one day figure it reports as information only',
    /Skipping days is permitted by the exercise, so days are never counted/.test(text(card)) && /the exercise measures a habit, not a result/i.test(text(card)));

  /* ---------------------------------------------------------- 4. the target the trader declares */
  ok('the target is editable and the count is not: saving the target posts ONLY the target, so no click can move a record',
    (() => { const c2 = V.card(available()); q('[data-challenge-target]', c2).value = '7';
      q('[data-challenge-save-target]', c2).dispatchEvent(new w.Event('click'));
      return true; })());
  await new Promise((r) => setTimeout(r, 30));
  ok('and the write it performs is the settings route with the rep target the trader typed \u2014 no new endpoint, no count edit',
    calls.some(([m, url, body]) => m === 'put' && url === '/settings' && body && body.challenge_target === 7 && Object.keys(body).length === 1), JSON.stringify(calls));
  const callsBefore = calls.length;
  q('[data-challenge-start]', V.card(C.notStarted({}, { accountId: 3, today: '2026-10-13' }))).dispatchEvent(new w.Event('click'));
  await new Promise((r) => setTimeout(r, 30));
  ok('starting the count posts the trader\u2019s OWN day through the same route, and refreshes the dashboard rather than pretending locally',
    calls.slice(callsBefore).some(([m, url, body]) => m === 'put' && url === '/settings' && body && body.challenge_start === '2026-10-13' && Object.keys(body).length === 1) && calls.some(([m]) => m === 'reloadAll') && calls.some(([m]) => m === 'refresh'),
    JSON.stringify(calls.slice(callsBefore)));
  ok('the card claims no authority at all: not one permission, cap or decision is spoken of as something the count can grant or refuse',
    !/permission/i.test(text(card)) && !/\bcaps?\b/i.test(text(card)) && !/you (may|must) |not allowed/i.test(text(card)) && card.dataset.challenge === 'true');

  /* ---------------------------------------------------------- 5. a stale card refuses to write */
  const staleToasts = [];
  const before5 = calls.length;
  const stale = V.card(C.notStarted({}, { accountId: 3, today: '2026-10-13' }));
  w.Store.accountId = 99;
  q('[data-challenge-start]', stale).dispatchEvent(new w.Event('click'));
  await new Promise((r) => setTimeout(r, 30));
  ok('a card rendered for ANOTHER workspace or account refuses to write and says so, instead of saving a declaration into the wrong journal',
    calls.length === before5 && toasts.slice(-1)[0] && /another workspace or account/.test(toasts.slice(-1)[0].text) && toasts.slice(-1)[0].type === 'err',
    JSON.stringify({ calls: calls.slice(before5), toast: toasts.slice(-1)[0], staleToasts }));
  w.Store.accountId = 3;

  /* ---------------------------------------------------------- 6. a target the trader broke */
  const bad = V.card(available({ target: { state: 'unusable', value: null, default: 21, min: 1, max: 999 }, progress: { ...available().progress, target: null, remaining: null, beyond_target: null } }));
  ok('an unusable stored target is reported as such and NO remaining figure is invented from the default: the card does not quietly substitute 21',
    /target unusable/.test(text(bad)) && /stored target is not usable, so no remaining figure is shown/.test(text(bad)) && !/nan|NaN/.test(text(bad)) && !/\b21\b\s*(to go|reps to)/.test(text(bad)),
    text(bad).slice(0, 300));
  const beyond = V.card(available({ progress: { ...available().progress, counted: 5, target: 3, remaining: 0, beyond_target: 2 } }));
  ok('and a count past the target is reported as beyond it rather than as a failure to stop: the exercise has no ceiling to enforce',
    /target reached/.test(text(beyond)) && /2 beyond it/.test(text(beyond)) && !/violation|exceeded the limit|must stop/i.test(text(beyond)), text(beyond).slice(0, 260));
  const zero = V.card(available({ progress: { ...available().progress, counted: 0, remaining: 3, beyond_target: 0, run: 0 }, recent: [], window: { trades_closed: 0, before_start: 0, undated_closes: 0, open_excluded: 0, truncated: false }, not_counted: { total: 0, by_criterion: { plan_linked: 0, no_recorded_breach: 0, journalled_same_close_day: 0 }, unrecorded_checks: 0, missing_journal_fields: [] }, journaling: { reviewed_in_window: 0, same_close_day: 0, later_than_close_day: 0, median_gap_minutes: null, max_gap_minutes: null, waiting_on_acknowledgement: 0, basis: '' } }));
  ok('a STARTED count with no trades yet shows a real zero \u2014 which is a different thing from an unstarted count, and the card keeps them apart',
    /0\s*\/\s*3 reps/.test(text(q('[data-challenge-progress]', zero))) && /3 to go/.test(text(q('[data-challenge-progress]', zero).parentElement)) && /No closed trades in this window yet/.test(text(zero)) && !/unknown/i.test(text(zero)),
    text(q('[data-challenge-progress]', zero).parentElement));
});
