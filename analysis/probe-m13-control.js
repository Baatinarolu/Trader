'use strict';
/** M13/M65 control: what the fault IS on the tree being measured, said in counts rather than adjectives.
 *
 * The milestone's claim is narrow: the review system has spoken in weeks and quarters since M99/M101,
 * the rule-change advisory has spoken in quarters since M104, and the performance payload offered only
 * `daily`/`monthly` — and nothing joined a period to the artifact the trader saved for it. This probe
 * measures exactly that, on whichever tree it is pointed at via TJ_APP:
 *
 *   M13_CONTROL_MODE=parent       the committed 9c88e0a M12 release — the release being fixed
 *   M13_CONTROL_MODE=series-only  that release plus `src/periods.js` and the delivered
 *                                 `src/performance.js`: the calendar exists and the weekly/quarterly
 *                                 buckets ride the payload, and NOTHING records which periods were
 *                                 reviewed and no page shows any of it
 *   M13_CONTROL_MODE=delivered    the delivered tree
 *
 * A tree that buckets closes and does not record the review is the measured control, so the negative
 * here is a count (0 record, 0 mounts) and never a crash. The period arithmetic that ALREADY exists is
 * named by file, so the "there is no calendar" story cannot be told loosely: two shipped modules
 * already compute period boundaries, each with its own copy of the rule.
 */
const fs = require('fs'), path = require('path');
const H = require('./m13-test-support'), { ok } = H;
const MODE = process.env.M13_CONTROL_MODE || 'delivered';
const SRC = path.join(H.APP, 'src'), PUB = path.join(H.APP, 'public');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
const rel = (p) => path.relative(H.APP, p).split(path.sep).join('/');
const filesContaining = (dir, token) => walk(dir).filter((f) => fs.readFileSync(f, 'utf8').includes(token)).map(rel).sort();
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const CARRIES_SERIES = MODE !== 'parent';
const CARRIES_RECORD = MODE === 'delivered';

H.finish(`M13/M65 control (${MODE}): the fault the delivered tree closes`, async () => {
  const u = await H.start('M13 control ' + MODE);
  const desk = await H.account(u, 'M13 control desk');
  /* One close with an exact clock and one saved artifact, through the app's own SQL shapes: the two
   * facts this milestone joins. Everything below is measured against these two rows. */
  await H.close(u, desk.id, { symbol: 'M13CTL', closedAt: '2026-10-05T09:00:00.000Z', net: 60, r: 1 });
  let rowId = null; try { rowId = await H.review(u, desk.id, 'week', '2026-10-05'); } catch { rowId = null; }

  /* 1. Does the tree ship the one ruler at all? */
  let periods = null; try { periods = H.mod('src/periods'); } catch { }
  ok('the tree ships the ONE period ruler (periods-v1) exactly when the calendar is the delivered one', H.periodsOf(periods) === CARRIES_SERIES, { mode: MODE, version: periods && periods.VERSION });

  /* 2. Can the review read a week? The endpoint the review already reads either carries the buckets or
   * it does not — measured from the wire, on a close actually written. */
  const an = (await H.analytics(u, '?account_id=' + desk.id)).data || {};
  const seriesCarried = !!an.weekly && !!an.quarterly;
  const bucketed = !seriesCarried ? null : Object.values(an.weekly).find((b) => b.start === '2026-10-05');
  ok('the analytics payload carries `weekly`/`quarterly` exactly when the tree buckets on the review calendar', seriesCarried === CARRIES_SERIES, { mode: MODE, keys: Object.keys(an).filter((k) => /week|quarter|daily|monthly/i.test(k)) });
  ok('and a carried bucket places the written close on the review calendar: the week of 2026-10-05, with the amount it recorded', !seriesCarried || (!!bucketed && bucketed.pnl === 60 && bucketed.trades === 1 && /review calendar/.test(bucketed.basis)), { bucket: bucketed && { start: bucketed.start, trades: bucketed.trades, pnl: bucketed.pnl } });

  /* 3. Is any period joined to the artifact the trader saved for it? This is the joined fact, and it is
   * the one the parent and the series-only tree cannot answer at all. */
  const rp = H.reviewPeriodsOf(an), week = rp.kinds && rp.kinds.week, period = week && week.periods && week.periods.find((p) => p.start === '2026-10-05');
  ok('the payload carries the record of which periods were reviewed exactly when the tree serves it', !!rp.state === CARRIES_RECORD, { mode: MODE, state: rp.state });
  ok('a carried record joins the saved artifact to its OWN period, and leaves the periods with no artifact named as such rather than as misses',
    !CARRIES_RECORD || (rp.state === 'available' && period && period.review_state === 'completed' && period.review_id === rowId && period.trades === 1 && period.pnl === 60 && week.not_recorded >= 1 && /not evidence that no review happened/.test(week.not_recorded_meaning)),
    { state: rp.state, period: period && { state: period.review_state, id: period.review_id, trades: period.trades, pnl: period.pnl } });

  /* 4. Can a trader see it? The card file, the page load and the mount are three separate facts. */
  const card = path.join(PUB, 'js/views/review-periods.js'), html = read(path.join(PUB, 'index.html')), view = read(path.join(PUB, 'js/views/analytics.js'));
  ok('the review can DISPLAY it: the card exists, the page loads it and the analytics view mounts it (three separate facts, all required)',
    (fs.existsSync(card) && /views\/review-periods\.js/.test(html) && /Views\.reviewPeriods\.card/.test(view)) === CARRIES_RECORD,
    { file: fs.existsSync(card), loaded: /views\/review-periods\.js/.test(html), mounted: /Views\.reviewPeriods\.card/.test(view) });

  /* 5. The fault itself, in counts. `weeklySeries`/`not_recorded` are the vocabulary this milestone
   * introduces, and the period arithmetic the app ALREADY has is named by file: two shipped modules
   * each wrote the rule out for themselves, which is the duplication the single ruler removes. */
  /* CALL SITES, not token mentions: the producer is the module that buckets a close, the carrier is the
   * route that hands the buckets to the record. A doc comment naming a function is not a surface. */
  const seriesVocabulary = filesContaining(SRC, 'weeklySeries(').sort();
  const carrierVocabulary = filesContaining(SRC, 'analytics.weekly').sort();
  const recordVocabulary = filesContaining(SRC, 'coverageOptional').sort();
  const alreadySpeaking = ['src/period-reviews.js', 'src/rule-changes.js'].filter((f) => fs.existsSync(path.join(SRC, f.slice(4))));
  ok('the weekly/quarterly series is a call site this milestone introduces: absent on the release being fixed, and on the delivered tree exactly the one module that buckets a close',
    JSON.stringify(seriesVocabulary) === JSON.stringify(CARRIES_SERIES ? ['src/performance.js'] : []), { mode: MODE, seriesVocabulary });
  ok('the buckets reach the record from exactly one place on the delivered tree, and nowhere on the trees where the record does not exist',
    JSON.stringify(carrierVocabulary) === JSON.stringify(CARRIES_RECORD ? ['src/routes/api.js'] : []), { mode: MODE, carrierVocabulary });
  ok('and the joined record is too: absent on both pre-fix trees, and present on the delivered tree in exactly the module and the route that serve it',
    JSON.stringify(recordVocabulary) === JSON.stringify(CARRIES_RECORD ? ['src/period-reviews.js', 'src/routes/api.js'] : []), { mode: MODE, recordVocabulary });
  ok('the app ALREADY speaks in periods in two named modules — the gap is one shared ruler and the series, not the vocabulary of a review',
    alreadySpeaking.length === 2 && alreadySpeaking.includes('src/period-reviews.js') && alreadySpeaking.includes('src/rule-changes.js'),
    alreadySpeaking.map((f) => [f, (read(path.join(SRC, f.slice(4))).match(/\b(getUTCDay|periodStart|quarter)\b/g) || []).length]));

  /* 6. The control's own honesty: nothing here writes, and the rows this probe wrote are the only ones. */
  const rows = await H.digests(['trades', 'period_reviews']);
  ok('the control writes its own close and its own artifact through the app\u2019s own SQL shapes, and the tree reads them back unchanged',
    JSON.parse(rows.trades).length === 1 && JSON.parse(rows.period_reviews).length === (rowId === null ? 0 : 1), { trades: JSON.parse(rows.trades).length, reviews: JSON.parse(rows.period_reviews).length });
});
