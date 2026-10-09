#!/usr/bin/env node
/**
 * probe-ep23-goodloss.js
 *
 * Ep 23 — "Journalling Your Trades". Brad Goh defines the good/bad loss split by
 * EXECUTION, not by P&L:
 *
 *   "a good loss is one in which I follow my plan and I still lose. That's part
 *    of trading... But then if it's a bad loss, that's alarming because a bad
 *    loss is a loss that I incurred as a result of NEGLECTING MY TRADING PLAN."
 *
 *   "a good trade is not necessarily a profitable one. A good trade is one in
 *    which you executed according to your trading plan. Especially when you
 *    didn't feel like it."
 *
 *   "Execution is what we are grading here. We don't define our performance,
 *    our self-worth by our P&L."
 *
 * correction.js:330 instead keys the good-loss branch on the SIZE of the loss:
 *
 *   else if (r >= -1.05) { score += 6; reasons.push(`Loss of ${r2(r)}R - within
 *                          the 1R limit, that is a good loss (+6)`); }
 *
 * This probe calls the REAL exported autograde() on the same losing trade at
 * every adherence level from 1/5 to 5/5 and reports (a) whether the string
 * "good loss" is emitted, and (b) how much of the total score adherence moves.
 *
 * No network, no fixtures, no synthetic OHLC -- autograde() takes a plain trade
 * row, so the inputs here are literal field values, not fabricated candles.
 */
'use strict';

const path = require('path');
const SRC = path.join(__dirname, '..', 'extracted', 'tradejournal', 'src');
const { autograde } = require(path.join(SRC, 'bots', 'correction.js'));

const base = {
  symbol: 'EURUSD', direction: 'long',
  planned_r: 2.0,          // a plan that met his 2R minimum
  r_multiple: -0.80,       // a loss, but inside the 1R stop
  stop_moved: 0,           // stop honoured
  mae_r: -0.70,            // not run over
  mfe_r: 0.30,
  adherence: 1,            // <-- the variable under test
};

console.log('Ep 23 probe: is a "good loss" graded by execution or by P&L?');
console.log('Fixed inputs: planned 2.0R, closed -0.80R, stop honoured, MAE -0.70R');
console.log('');
console.log(' adherence | score | emits "good loss"? | reasons that mention adherence');
console.log('-----------+-------+--------------------+-------------------------------');

const rows = [];
for (let a = 1; a <= 5; a++) {
  const g = autograde(Object.assign({}, base, { adherence: a }));
  const says = g.reasons.some((r) => /good loss/i.test(r));
  const adh = g.reasons.filter((r) => /adherence/i.test(r));
  rows.push({ a, score: g.score, says });
  console.log(
    '    ' + String(a) + '/5    |  ' + String(g.score).padStart(3) +
    '  |        ' + (says ? 'YES' : 'no ') +
    '         | ' + (adh.join('; ') || '(none)')
  );
}

console.log('');
const lo = rows.find((r) => r.a === 1).score;
const hi = rows.find((r) => r.a === 5).score;
console.log('Score swing from adherence 1/5 -> 5/5 on the SAME trade: ' + (hi - lo) + ' points');
console.log('"good loss" emitted at adherence 1/5: ' + rows.find((r) => r.a === 1).says);
console.log('');

// What he would call it: adherence 1/5 means the plan was neglected -> bad loss.
const full = autograde(Object.assign({}, base, { adherence: 1 }));
console.log('Full autograde reasons at adherence 1/5 (his definition: a BAD loss):');
full.reasons.forEach((r) => console.log('  - ' + r));
console.log('');
console.log('Total: ' + full.score + '/100  grade: ' + full.grade);
