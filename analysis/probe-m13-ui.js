'use strict';
/**
 * M13/M65 ui probe: the review-period card, rendered in jsdom against the payload the server really
 * serves. What is measured is what a trader can be misled by: an unknown record rendered as "you
 * reviewed nothing", a period with no closed trade shown as a flat zero, a draft or an imported copy
 * shown as a completed review, the two calendars presented as one, a reviewed-vs-unreviewed
 * comparison that was never measured, and a reload that survives a workspace change.
 * jsdom has no browser engine: structural and behavioural, not a pixel proof.
 */
const fs = require('fs'), path = require('path');
const H = require('./m13-test-support'), { ok } = H;
let dom;
H.finish('M13/M65 real DOM: the review-period card the review reads', async () => {
  const periods = H.mod('src/periods');
  if (!periods || periods.VERSION !== H.M13_VERSION) return H.ok('this tree ships the M13/M65 calendar ruler and its record', false);
  const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
  dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, toasts = [], nav = [];
  const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
  load('util.js'); load('views/review-periods.js');
  w.Store = { user: { id: 1 }, accountId: 3 };
  w.API = { getToken: () => 'tok' };
  w.App = { toast: (text, type) => toasts.push({ text, type }), go: (v) => nav.push(v) };
  const V = w.Views.reviewPeriods;
  const text = (n) => n.textContent;
  const q = (sel, root) => (root || w.document.body).querySelector(sel);
  const qa = (sel, root) => [...(root || w.document.body).querySelectorAll(sel)];
  ok('the card is its own section with a title that names both cadences', !!V && typeof V.card === 'function' && V.card({ state: 'unavailable' }).dataset.reviewPeriods === 'true');
  if (!V || typeof V.card !== 'function') return;

  const period = (start, end, lastDay, label, state, extra = {}) => ({ start, end, last_day: lastDay, label, finished: true, review_state: state, review_id: state === 'not_recorded' ? null : 7, review_version: 1, review_status: state === 'draft' ? 'draft' : 'completed', review_source: state === 'imported_unverified' ? 'imported_unverified' : 'human_review', review_recorded_at: state === 'not_recorded' ? null : '2026-10-10T08:00:00.000Z', review_focus: state === 'completed' ? 'Declared week focus' : null, review_amendment: null, trades: 0, pnl: null, r: null, win_rate: null, unknown_net: 0, unknown_r: 0, days: 0, ...extra });
  const full = {
    state: 'available', version: H.COVERAGE_VERSION, account_id: 3, today: '2026-10-13',
    kinds: {
      week: {
        kind: 'week', label: 'Weekly', periods_scanned: 12, rows_scanned: 3, artifacts_outside_scope: 1, completed: 1, draft: 1, imported_unverified: 1, unavailable_rows: 0, not_recorded: 8, open_periods: 1,
        calendar: periods.PERIOD_BASIS, date_basis: 'utc_close_day', not_recorded_meaning: 'No artifact was saved for this finished period. That is not evidence that no review happened.',
        periods: [period('2026-10-12', '2026-10-19', '2026-10-18', 'Week of 2026-10-12', 'not_recorded', { finished: false }),
          period('2026-10-05', '2026-10-12', '2026-10-11', 'Week of 2026-10-05', 'completed', { trades: 2, pnl: 60, r: 1, win_rate: 50, days: 2 }),
          period('2026-09-28', '2026-10-05', '2026-10-04', 'Week of 2026-09-28', 'draft', { trades: 3, pnl: 70, r: 1.5, win_rate: 66.67, days: 3, unknown_net: 0 }),
          period('2026-09-21', '2026-09-28', '2026-09-27', 'Week of 2026-09-21', 'imported_unverified'),
          period('2026-09-14', '2026-09-21', '2026-09-20', 'Week of 2026-09-14', 'not_recorded', { trades: 1, pnl: null, r: null, win_rate: null, unknown_net: 1, unknown_r: 1, days: 1 })] },
      quarter: {
        kind: 'quarter', label: 'Quarterly', periods_scanned: 8, rows_scanned: 1, artifacts_outside_scope: 0, completed: 1, draft: 0, imported_unverified: 0, unavailable_rows: 0, not_recorded: 6, open_periods: 1,
        calendar: periods.PERIOD_BASIS, date_basis: 'utc_close_day', not_recorded_meaning: 'No artifact was saved for this finished period. That is not evidence that no review happened.',
        periods: [period('2026-10-01', '2027-01-01', '2026-12-31', 'Q4 2026', 'completed', { trades: 3, pnl: 100, r: 3, win_rate: 66.67, days: 3 }), period('2026-07-01', '2026-10-01', '2026-09-30', 'Q3 2026', 'not_recorded', { trades: 1, pnl: 30, r: 1, win_rate: 100, days: 1 })] } },
    basis: 'Recorded review artifacts read from the saved rows for the trader\u2019s own account, per calendar period. A period with NO artifact is `not_recorded` \u2014 that is not evidence that no review happened.',
    outcome_compared: false, outcome_note: 'The recorded amounts are listed beside the artifact state because both are facts about the same period; the app does not compare reviewed periods against unreviewed ones, which would be a causal claim it has not measured.',
    limits: { read_only: true, writes: 0, grades_influence: false, permission_influence: false, caps_influence: false, plan_change_permission: false, causal: false, broker_verified: false },
  };

  const card = V.card(full);
  ok('the card renders both cadences as their own blocks, addressed by kind rather than by position', qa('[data-review-periods-kind]', card).map((n) => n.dataset.reviewPeriodsKind).join(',') === 'week,quarter', qa('[data-review-periods-kind]', card).map((n) => n.dataset.reviewPeriodsKind));
  ok('the totals separate a completed review from a draft, an imported copy, an unreadable row and a period with NO artifact',
    (() => { const t = text(q('[data-review-periods-totals="week"]', card)); return /1 completed/.test(t) && /1 draft only/.test(t) && /1 imported copy \(unverified\)/.test(t) && /0 unreadable/.test(t) && /8 no artifact recorded/.test(t) && /12 periods scanned/.test(t) && /1 still open/.test(t); })(), text(q('[data-review-periods-totals="week"]', card)));
  ok('a saved period is marked as saved and carries the trader\u2019s own focus, not a summary the app invented',
    (() => { const line = text(q('[data-review-periods-period="2026-10-05"]', card)); return /Week of 2026-10-05/.test(line) && /2 closes over 2 days/.test(line) && /\+?\$?60/.test(line) && /50\.0 % win|50\.0% win/.test(line) && /review saved \(2026-10-10/.test(line) && /focus: Declared week focus/.test(line); })(), text(q('[data-review-periods-period="2026-10-05"]', card)));
  ok('a draft says draft and an imported copy says unverified, in the same line as the period it belongs to',
    /review: draft only, not completed/.test(text(q('[data-review-periods-period="2026-09-28"]', card))) && /review: imported copy, unverified/.test(text(q('[data-review-periods-period="2026-09-21"]', card))));
  ok('a period with no artifact says exactly that, and the card says what it does NOT mean',
    /review: no artifact recorded/.test(text(q('[data-review-periods-period="2026-09-14"]', card))) && /that is not evidence that you did not review it somewhere else/.test(text(card)) && !/missed|failed to review|did not review/.test(text(card).replace(/that is not evidence that you did not review it somewhere else/g, '')));
  ok('a period with no closed trade reports NO amount rather than a flat zero, and a close with no recorded amount is counted instead of zeroed',
    (() => { const stamp = /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, line21 = text(q('[data-review-periods-period="2026-09-21"]', card)).replace(stamp, ''), line14 = text(q('[data-review-periods-period="2026-09-14"]', card)).replace(stamp, '');
      return /no closed trade recorded/.test(line21) && !/0\.00/.test(line21) && !/\b0R\b/.test(line21) && /no recorded amount/.test(line14) && /1 close with no recorded amount/.test(line14); })(),
    text(q('[data-review-periods-period="2026-09-21"]', card)).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ''));
  ok('the period still running is labelled as still open rather than counted as a period that was not reviewed',
    /still open/.test(text(q('[data-review-periods-period="2026-10-12"]', card))) && /review: no artifact recorded/.test(text(q('[data-review-periods-period="2026-10-12"]', card))));
  ok('an artifact outside the scanned window is counted on screen instead of disappearing', /1 saved weekly artifact carries a period start this window does not scan/.test(text(card)), (text(card).match(/[^.]*does not scan[^.]*\./) || [''])[0]);
  ok('the card states the two rulers rather than presenting one number as both, and never compares reviewed with unreviewed periods',
    /REVIEW calendar \(UTC close-day, Monday-start weeks, calendar quarters\)/.test(text(card)) && /Daily and Monthly series use your journal timezone instead/.test(text(card))
    && /two different rulers, both labelled/.test(text(card)) && /does not compare reviewed periods against unreviewed ones/.test(text(card)));
  ok('the card makes no percentage, causal or profit claim the payload did not make', (() => { const t = text(card).replace(/[^.]*(?:does not compare reviewed periods against unreviewed ones|does NOT compare reviewed periods against unreviewed ones)[^.]*it has not measured\./g, ''); return !/\bprofitable\b|\bcausal\b|\bedge\b|work(?:ed|s) better/.test(t) && !/%\s*(?:better|more|less)/.test(t); })(), text(card).match(/[^.]*\b(?:causal|profitable|edge)\b[^.]*\./g));
  ok('the read-only basis reaches the screen, so a reader is told this is an acknowledgement and not a permission',
    /acknowledgement that a review was written and stored/.test(text(card)) && /not proof that the period was reviewed well/.test(text(card)) && /or that any rule changed/.test(text(card)));

  const bad = V.card({ state: 'unavailable', reason: 'EVIDENCE DOWN', not_recorded: null });
  ok('an unknown record is shown as UNKNOWN, never as a period list of "no artifact recorded"',
    /Saved review artifacts unavailable/.test(text(bad)) && /UNKNOWN here/.test(text(bad)) && /not a period with no review and not a clean record/.test(text(bad)) && qa('[data-review-periods-period]', bad).length === 0 && qa('[data-review-periods-totals]', bad).length === 0 && !/review: /.test(text(bad)));
  const missing = V.card(undefined);
  ok('a payload that never arrived takes the same path: unknown, not a clean record', /Saved review artifacts unavailable/.test(text(missing)) && qa('[data-review-periods-period]', missing).length === 0 && qa('[data-review-periods-totals]', missing).length === 0);

  const button = q('[data-review-periods-refresh]', card);
  ok('a reload is offered and it re-reads the same view rather than silently reloading a page whose workspace moved', !!button && /Reload this record/.test(text(button)));
  button.dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('the reload keeps the workspace/account/session it was rendered under: unchanged, it navigates to the same view and sends no toast', nav.join(',') === 'analytics' && toasts.length === 0, { nav, toasts });
  w.Store.accountId = 99; button.dispatchEvent(new w.Event('click', { bubbles: true }));
  ok('and when the account changed under it, the reload REFUSES with one error toast instead of rendering another desk\u2019s record',
    nav.join(',') === 'analytics' && toasts.length === 1 && toasts[0].type === 'err' && /changed|reopen/i.test(toasts[0].text), { nav, toasts });

  const mount = fs.readFileSync(path.join(H.APP, 'public/js/views/analytics.js'), 'utf8'), html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8');
  ok('the analytics view mounts the card and the page loads it, and the mount sits above the view\u2019s own tabs',
    /Views\.reviewPeriods\.card\(an\.review_periods\)/.test(mount) && /js\/views\/review-periods\.js/.test(html)
    && mount.indexOf('Views.reviewPeriods.card') < mount.indexOf('root.appendChild(tabs);'), { mounted: mount.indexOf('Views.reviewPeriods.card'), tabs: mount.indexOf('root.appendChild(tabs);') });
  ok('and it is mounted after the rule-break card, so the review reads numbers, breaks, then the period record', mount.indexOf('Views.ruleBreaks.card') < mount.indexOf('Views.reviewPeriods.card'));
});
