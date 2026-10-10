/* M39 — the London close killzone: present, correctly named, reduced quality, and its own
 * character note. Plus the two copies of the killzone hours that had drifted away from the
 * engine (src/bots/now.js and public/js/chart.js), which now derive from it.
 *
 * Run from the REPO ROOT:  node analysis/probe-m39-london-close.js
 *
 * His fourth window is 10:00-12:00 Eastern and he is explicit about its character:
 *   "There's a little bit lower trading volume… price tends to retrace back to the daily
 *    range… if you want to catch small retracement base opportunities, this London close
 *    session would be pretty decent."
 * The code had a window on those hours named "NY PM killzone" with quality 0.7 and the
 * generic "highest-probability window for the entry models" note, and the top-level
 * `quality` at 14:30 UTC reported 1.0 because it came from the coarse UTC-based SESSION
 * table (New York AM 12:00-16:00 UTC, quality 1.0) rather than from the window.
 */
const fs = require('fs');
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc.js'));
const NOW = require(path.join(APP, 'src/bots/now.js'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}
const at = (iso) => SMC.sessionState(new Date(iso));
const EDT = '2026-07-15', EST = '2026-01-15';

console.log('\n=== 1. The fourth window is named London close ===');
{
  const names = SMC.SILVER_BULLETS.map((b) => b.name);
  ok('four windows', names.length === 4, names.join(', '));
  ok('a London close window exists', names.indexOf('London close killzone') !== -1, names.join(', '));
  ok('no window is called NY PM any more', names.every((n) => !/NY PM/i.test(n)), names.join(', '));
  /* Stubbed, not guarded: on a tree with no London close (the pristine zip) every
   * assertion below then FAILS and the run still prints a tally, instead of throwing on
   * the first property access and reporting nothing. */
  const lc = SMC.SILVER_BULLETS.find((b) => b.name === 'London close killzone')
    || { startH: NaN, startM: NaN, endH: NaN, endM: NaN, pairs: null, restricted: undefined };
  ok('its hours are 10:00-12:00 ET', lc.startH === 10 && lc.startM === 0 && lc.endH === 12 && lc.endM === 0,
    JSON.stringify({ s: lc.startH, e: lc.endH }));
  ok('its pair list is USD ("New York and London close -> anything with USD")',
    JSON.stringify(lc.pairs) === JSON.stringify(['USD']), JSON.stringify(lc.pairs));
  ok('it is NOT restricted — gold and crypto were never excluded from it', lc.restricted !== true,
    'restricted=' + lc.restricted);
}

console.log('\n=== 2. Reduced quality, and a note that describes a retrace ===');
{
  const byName = {};
  for (const b of SMC.SILVER_BULLETS) byName[b.name] = b;
  const lc = byName['London close killzone'] || { quality: NaN, note: '' };
  ok('quality is below the two expansion windows',
    lc.quality < byName['London killzone'].quality && lc.quality < byName['NY AM killzone'].quality,
    'london_close=' + lc.quality + ' london=' + byName['London killzone'].quality + ' ny_am=' + byName['NY AM killzone'].quality);
  ok('the note mentions lower volume', /lower volume/i.test(lc.note || ''), lc.note);
  ok('the note mentions retracing into the daily range', /retrace/i.test(lc.note || '') && /daily range/i.test(lc.note || ''), lc.note);
  ok('the note does NOT call it the highest-probability window', !/highest-probability/i.test(lc.note || ''), lc.note);
  ok('every window carries its own note (one shared sentence cannot describe both characters)',
    SMC.SILVER_BULLETS.every((b) => typeof b.note === 'string' && b.note.length > 20),
    JSON.stringify(SMC.SILVER_BULLETS.map((b) => [b.name, !!b.note])));
  ok('the expansion windows still say highest-probability',
    /highest-probability/.test((byName['London killzone'] || {}).note) && /highest-probability/.test((byName['NY AM killzone'] || {}).note));
}

console.log('\n=== 3. The row\'s measurement: 14:30 UTC used to report quality 1 ===');
{
  for (const [iso, label] of [[EDT + 'T14:30:00Z', '10:30 EDT'], [EST + 'T15:30:00Z', '10:30 EST']]) {
    const st = at(iso);
    ok(label + ' -> London close killzone', st.killzone === 'London close killzone', 'got ' + st.killzone);
    ok(label + ' -> quality is the reduced 0.5, not 1.0', st.quality === 0.5, 'quality=' + st.quality);
    ok(label + ' -> the note is the retrace note', /retrace/i.test(st.note || ''), st.note);
  }
  /* The window must not overlap NY AM, and must end where he ends it. */
  ok('NY AM hands over to London close at 14:00 UTC (EDT)',
    at(EDT + 'T13:59:00Z').killzone === 'NY AM killzone' && at(EDT + 'T14:00:00Z').killzone === 'London close killzone',
    at(EDT + 'T13:59:00Z').killzone + ' -> ' + at(EDT + 'T14:00:00Z').killzone);
  ok('London close ends at 16:00 UTC (EDT)',
    at(EDT + 'T15:59:00Z').killzone === 'London close killzone' && at(EDT + 'T16:00:00Z').killzone === null,
    at(EDT + 'T15:59:00Z').killzone + ' -> ' + at(EDT + 'T16:00:00Z').killzone);
  ok('and the same in EST, one UTC hour later (15:00-17:00)',
    at(EST + 'T14:59:00Z').killzone === 'NY AM killzone' && at(EST + 'T15:00:00Z').killzone === 'London close killzone'
    && at(EST + 'T16:59:00Z').killzone === 'London close killzone' && at(EST + 'T17:00:00Z').killzone === null,
    [at(EST + 'T14:59:00Z').killzone, at(EST + 'T15:00:00Z').killzone, at(EST + 'T17:00:00Z').killzone].join(' -> '));
}

console.log('\n=== 4. now.js asks the engine instead of keeping its own stale UTC table ===');
{
  const instants = [EDT + 'T14:30:00Z', EDT + 'T03:00:00Z', EDT + 'T12:00:00Z', EDT + 'T17:30:00Z',
    EST + 'T15:30:00Z', EST + 'T11:30:00Z', EST + 'T06:30:00Z'];
  let agree = 0;
  const diffs = [];
  for (const iso of instants) {
    const ms = Date.parse(iso);
    const engine = at(iso).killzone;
    const nowKz = NOW.killzoneAt(ms);
    const nowName = nowKz ? nowKz.name : null;
    if (nowName === engine) agree++; else diffs.push(iso + ': now=' + nowName + ' engine=' + engine);
  }
  ok('now.js agrees with the engine at every instant tested (' + agree + '/' + instants.length + ')',
    agree === instants.length, diffs.join(' | '));
  const dead = Date.parse(EDT + 'T17:30:00Z');
  ok('both say nothing is open in the dead zone', NOW.killzoneAt(dead) === null && at(EDT + 'T17:30:00Z').killzone === null);
  const nxt = NOW.nextKillzone(dead);
  ok('nextKillzone names a real window and a future instant',
    !!nxt && SMC.SILVER_BULLETS.some((b) => b.name === nxt.name) && nxt.at > dead,
    JSON.stringify(nxt && { name: nxt.name, at: nxt.at, dead }));
  ok('nextKillzone from the dead zone points at Asia (20:00 ET = 00:00 UTC in EDT)',
    nxt && nxt.name === 'Asia killzone' && new Date(nxt.at).toISOString() === '2026-07-16T00:00:00.000Z',
    nxt && new Date(nxt.at).toISOString());
}

console.log('\n=== 5. No inversion: being told "not your window" never pays MORE ===');
{
  /* M39 made the in-killzone quality bullet-driven while the affinity copy mirrors the
   * coarse SESSION table, which at London close says quality 1.0. Uncapped, a pair excluded
   * from London close would have scored 6 points against 3 for a pair inside it. */
  if (typeof SMC.sessionAffinity !== 'function') {
    ok('no symbol ever out-scores the window it is excluded from', false, 'sessionAffinity absent on this tree (it arrived with M40)');
    console.log('\n' + pass + ' passed / ' + fail + ' failed');
    process.exit(1);
  }
  const windows = [[EDT + 'T03:00:00Z', 'Asia(EDT)'], [EDT + 'T07:30:00Z', 'London'], [EDT + 'T12:00:00Z', 'NY AM'], [EDT + 'T14:30:00Z', 'London close']];
  const syms = ['EURUSD', 'GBPUSD', 'AUDJPY', 'GBPJPY', 'XAUUSD', 'BTCUSDT', 'AUDNZD'];
  let bad = [];
  for (const [iso, label] of windows) {
    const st = at(iso);
    const qs = syms.map((sym) => ({ sym, q: SMC.sessionAffinity(sym, st).quality }));
    const top = Math.max.apply(null, qs.map((x) => x.q));
    if (top > st.quality + 1e-9) bad.push(label + ': ' + JSON.stringify(qs) + ' vs window ' + st.quality);
  }
  ok('no symbol ever out-scores the window it is being excluded from', bad.length === 0, bad.join(' | '));
  const lc = at(EDT + 'T14:30:00Z');
  ok('London close: EURUSD (USD leg) is in, GBPJPY is out, and neither out-scores the window',
    SMC.sessionAffinity('EURUSD', lc).in_killzone === true
    && SMC.sessionAffinity('GBPJPY', lc).in_killzone === false
    && SMC.sessionAffinity('GBPJPY', lc).quality <= lc.quality,
    'EURUSD=' + SMC.sessionAffinity('EURUSD', lc).in_killzone + ' GBPJPY q=' + SMC.sessionAffinity('GBPJPY', lc).quality + ' window q=' + lc.quality);
  ok('London close: XAUUSD is ungoverned and stays in', SMC.sessionAffinity('XAUUSD', lc).in_killzone === true);
}

console.log('\n=== 6. The chart bands come from the same windows ===');
{
  const src = fs.readFileSync(path.join(APP, 'public/js/chart.js'), 'utf8');
  const block = /const KILLZONES = \[([\s\S]*?)\];/.exec(src);
  ok('chart.js declares a KILLZONES table', !!block);
  if (block) {
    const rows = [...block[1].matchAll(/key:\s*'([^']+)'[^}]*from:\s*(\d+),\s*to:\s*(\d+)/g)]
      .map((m) => ({ key: m[1], from: Number(m[2]), to: Number(m[3]) }));
    ok('the chart has four bands', rows.length === 4, JSON.stringify(rows));
    ok('no band is called ny_pm', rows.every((r) => r.key !== 'ny_pm'), JSON.stringify(rows.map((r) => r.key)));
    ok('a london_close band exists', rows.some((r) => r.key === 'london_close'), JSON.stringify(rows.map((r) => r.key)));
    /* Each band must equal the engine's window in ET hours — this is the assertion that
     * stops the two tables drifting apart again, which is how this defect happened. */
    const want = {};
    for (const b of SMC.SILVER_BULLETS) {
      want[b.name.toLowerCase().replace(/ killzone$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^ny_am$/, 'ny_am')] = [b.startH, b.endH];
    }
    const aliases = { london_close: 'london_close', ny_am: 'ny_am', london: 'london', asia: 'asia' };
    let mismatch = [];
    for (const r of rows) {
      const w = want[aliases[r.key] || r.key];
      if (!w || w[0] !== r.from || w[1] !== r.to) mismatch.push(r.key + ' chart=' + r.from + '-' + r.to + ' engine=' + JSON.stringify(w));
    }
    ok('every chart band matches the engine window hour for hour', mismatch.length === 0, mismatch.join(' | '));
    ok('the chart converts bars with the New York clock, not getUTCHours',
      /America\/New_York/.test(src) && !/function killzoneAt\(t\) \{\s*const h = new Date\(Number\(t\)\)\.getUTCHours\(\)/.test(src));
  }
}

console.log('\n' + pass + ' passed / ' + fail + ' failed');
process.exit(fail ? 1 : 0);
