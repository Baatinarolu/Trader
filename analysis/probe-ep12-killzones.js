'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 12 — ICT Killzones: do the code's constants match his stated windows?
 *
 * Brad Goh, Ep 12: "The following times right here are in UTC-4, right? Which is
 * the Eastern Standard Time."  He names FOUR killzones and gives Eastern times.
 * Cross-check that settles the offset: "the London Q zone, which for me is going
 * to be the 2:00 p.m. to 5:00 p.m. Singapore time" -> 14:00-17:00 UTC+8 =
 * 06:00-09:00 UTC = 02:00-05:00 at UTC-4.
 *
 * Runs the real SMC.sessionState(). No fixtures needed, no network.
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const SMC = require(path.resolve(__dirname, '..', 'extracted', 'tradejournal', 'src', 'bots', 'smc.js'));

const fmt = (h) => String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';

const his = [
  ['Asia', 20, 24], ['London', 2, 5], ['New York', 7, 10], ['London close', 10, 12],
];
const code = [
  ['London killzone', 6, 9, 1.0],
  ['NY AM killzone', 12, 15, 1.0],
  ['NY PM killzone', 15, 18, 0.7],
];

console.log('=== his four killzones: Eastern -> UTC ===');
for (const [n, a, b] of his) {
  console.log(`  ${n.padEnd(13)} ${fmt(a)}-${fmt(b)} ET   UTC-4 -> ${fmt(a + 4)}-${fmt(b + 4)}   UTC-5 -> ${fmt(a + 5)}-${fmt(b + 5)}`);
}
console.log('\n=== code SILVER_BULLETS (smc.js:619-623): UTC -> Eastern ===');
for (const [n, a, b, q] of code) {
  console.log(`  ${n.padEnd(18)} ${fmt(a)}-${fmt(b)} UTC q=${q}   UTC-4 -> ${fmt(a - 4)}-${fmt(b - 4)}   UTC-5 -> ${fmt(a - 5)}-${fmt(b - 5)}`);
}

console.log('\n=== which offset does each code killzone imply? (M37) ===');
const pairs = [
  ['London killzone', 6, 9, 'London', 2, 5],
  ['NY AM killzone', 12, 15, 'New York', 7, 10],
  ['NY PM killzone', 15, 18, 'London close', 10, 12],
];
for (const [cn, ca, cb, hn, ha, hb] of pairs) {
  const hits = [4, 5].filter((off) => (((ca - off) % 24) + 24) % 24 === ha && (((cb - off) % 24) + 24) % 24 === hb);
  console.log(`  ${cn.padEnd(18)} vs his ${hn.padEnd(13)} -> ${hits.length ? 'matches ONLY at UTC-' + hits.join('/UTC-') : 'matches at NEITHER offset'}`);
}

console.log('\n=== the real sessionState() inside each of his windows ===');
const cases = [
  ['Asia KZ        02:00 UTC (22:00 ET)', 2],
  ['London KZ      07:30 UTC (03:30 ET)', 7.5],
  ['NY KZ 1st hour 11:00 UTC (07:00 ET)', 11],
  ['NY KZ          12:00 UTC (08:00 ET)', 12],
  ['London close   14:30 UTC (10:30 ET)', 14.5],
];
for (const [label, h] of cases) {
  const s = SMC.sessionState(new Date(Date.UTC(2026, 9, 6, Math.floor(h), (h % 1) * 60)));
  console.log(`  ${label}  in_killzone=${String(s.in_killzone).padEnd(5)} killzone=${String(s.killzone).padEnd(16)} quality=${s.quality}`);
}

console.log('\n=== what his Asia pairs get (M38/M40) ===');
const asia = SMC.sessionState(new Date(Date.UTC(2026, 9, 6, 2, 0)));
console.log(`  at 02:00 UTC, in_killzone=${asia.in_killzone} -> the weight-8 check at setup.js:158 FAILS`);
console.log(`  for AUD/NZD/JPY, the one window he assigns them: "the Australian dollar, the New Zealand dollar, and the Japanese yen pairs."`);
