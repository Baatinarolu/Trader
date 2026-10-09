/* M36 — scale-in legs.
 *
 *   1. a two-position pyramid produces one weighted entry, not two unrelated trades
 *   2. the stop follows the most recent add, as the course describes
 *   3. adds into a winner are distinguished from averaging down
 *   4. scale-OUT legs still work unchanged (the pre-existing mechanism must not regress)
 *   5. both directions at once give a coherent trade
 *
 *   node analysis/probe-m36-scale-in.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', 'extracted', 'tradejournal');
const T = require(path.join(ROOT, 'src/trades.js'));

let pass = 0, fail = 0;
const ck = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
};
const base = {
  user_id: 1, account_id: 1, symbol: 'EURUSD', direction: 'long', status: 'closed',
  opened_at: '2026-03-04T13:30:00Z', closed_at: '2026-03-04T15:00:00Z',
  entry: 1.0900, exit: 1.0960, stop: 1.0870, size: 2, value_per_point: 100000,
};

console.log('\n=== 1. a pyramid produces ONE weighted entry ===');
{
  // 60% at 1.0900, 40% at 1.0920 -> weighted 1.0908
  const t = T.normalise({ ...base, entries: [
    { pct: 60, price: 1.0900, reason: 'first position', at: '2026-03-04T13:30:00Z' },
    { pct: 40, price: 1.0920, reason: 'scaled in on the pullback', at: '2026-03-04T14:10:00Z', stop_after: 1.0895 },
  ] });
  console.log(`  weighted entry ${t.entry}  (expected 1.0908)  ·  entries_n=${t.entries_n}  ·  stop=${t.stop}`);
  ck('the entry is the size-weighted average', Math.abs(t.entry - 1.0908) < 1e-9, 'got ' + t.entry);
  ck('entries_n counts the legs', t.entries_n === 2, 'got ' + t.entries_n);
  ck('the legs survive as JSON', typeof t.entries === 'string' && JSON.parse(t.entries).length === 2);

  console.log('\n=== 2. the stop follows the most recent add ===');
  ck('stop moved to the last add\'s stop_after', t.stop === 1.0895, 'got ' + t.stop);
  ck('stop_moved is flagged', t.stop_moved === 1, 'got ' + t.stop_moved);

  console.log('\n=== 3. adds into a winner vs averaging down ===');
  ck('a long added ABOVE the average is into a winner', t.adds_into_winner === 1, 'got ' + t.adds_into_winner);
  const down = T.normalise({ ...base, entries: [
    { pct: 50, price: 1.0900 }, { pct: 50, price: 1.0860 },
  ] });
  ck('a long added BELOW the average is averaging down', down.adds_into_winner === 0, 'got ' + down.adds_into_winner);
  const shortUp = T.normalise({ ...base, direction: 'short', entry: 1.0900, exit: 1.0840, entries: [
    { pct: 50, price: 1.0900 }, { pct: 50, price: 1.0880 },
  ] });
  ck('for a SHORT, adding below the average is into a winner', shortUp.adds_into_winner === 1,
    'got ' + shortUp.adds_into_winner);
  const single = T.normalise({ ...base, entries: [{ pct: 100, price: 1.0900 }] });
  ck('a single position is neither (null, not 0)', single.adds_into_winner === null,
    'got ' + single.adds_into_winner);
}

console.log('\n=== 4. scale-OUT legs must not regress ===');
{
  const t = T.normalise({ ...base, legs: [
    { pct: 50, price: 1.0940 }, { pct: 50, price: 1.0980 },
  ] });
  console.log(`  weighted exit ${t.exit}  (expected 1.096)  ·  legs_n=${t.legs_n}`);
  ck('the weighted exit is unchanged by the new code', Math.abs(t.exit - 1.096) < 1e-9, 'got ' + t.exit);
  ck('legs_n still counts scale-outs', t.legs_n === 2, 'got ' + t.legs_n);
  ck('a trade with no entries has entries_n 0 and null entries', (() => {
    const p = T.normalise({ ...base });
    return p.entries_n === 0 && p.entries === null && p.weighted_entry === null;
  })());
}

console.log('\n=== 5. both directions at once ===');
{
  const t = T.normalise({ ...base, entry: 1.0900, exit: 1.0960,
    entries: [{ pct: 60, price: 1.0900 }, { pct: 40, price: 1.0920, stop_after: 1.0895 }],
    legs: [{ pct: 50, price: 1.0940 }, { pct: 50, price: 1.0980 }] });
  console.log(`  entry ${t.entry} -> exit ${t.exit}  ·  entries_n=${t.entries_n} legs_n=${t.legs_n}  ·  net ${t.net_pnl}`);
  ck('entry is weighted from the adds', Math.abs(t.entry - 1.0908) < 1e-9, 'got ' + t.entry);
  ck('exit is weighted from the scale-outs', Math.abs(t.exit - 1.096) < 1e-9, 'got ' + t.exit);
  ck('P&L is positive on a winner pyramided and scaled out', t.net_pnl > 0, 'got ' + t.net_pnl);
  ck('entries is an allowed column', T.COLUMNS.includes('entries'), T.COLUMNS.join(','));
  ck('malformed JSON in entries is ignored, not thrown', (() => {
    const p = T.normalise({ ...base, entries: 'not json' });
    return p.entries_n === 0 && p.entry === 1.09;
  })());
}

console.log(`\n ${pass}/${pass + fail} passed${fail ? '  — ' + fail + ' FAILED' : ''}\n`);
process.exit(fail ? 1 : 0);
