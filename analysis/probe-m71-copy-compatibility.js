#!/usr/bin/env node
'use strict';
/** Independently test the actual clipboard formatter, including old flat plans
 * that have rr_final but no primary/floor snapshot. They retain payout display,
 * never become minimum-RR evidence. No rendering or eligibility is fabricated.
 */
const path = require('path'), fs = require('fs');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const { JSDOM } = require(path.join(APP, 'node_modules/jsdom'));
const dom = new JSDOM('<!doctype html>', { url: 'http://fixture.test', runScripts: 'outside-only' });
dom.window.eval(fs.readFileSync(path.join(APP, 'public/js/tv.js'), 'utf8'));
const text = p => dom.window.TV.planText('TEST', '15m', p);
let pass = 0, fail = 0;
const ok = (label, v) => { console.log(` ${v ? 'ok  ' : 'FAIL'} ${label}`); v ? pass++ : fail++; };
const lv = { entry: 100, stop: 99, rr_primary: 2.12, rr_final: 7,
  targets: [{ price: 102.1234, rr: 2.12, source_tf: '5m' }, { price: 107, rr: 7, source_tf: '5m' }],
  rr_floor: { rule: 'primary_target', rr: 2.1234, min_rr: 2, passed: true } };
ok('current snapshot displays precise first RR/floor, final expressly not qualification',
  /first-target 2\.1234R \/ 2R floor \(met\); final 7\.00R \(not floor evidence\)/.test(text({ action: 'BUY', levels: lv })));
ok('refused snapshot remains visibly refused even when final payout is large',
  text({ action: 'NO TRADE', levels: { ...lv, rr_floor: { ...lv.rr_floor, rr: 1.5, passed: false } } }).includes('1.5000R / 2R floor (refused)'));
const old = { ...lv }; delete old.rr_floor;
ok('old primary/final payload still displays first target, not farther final',
  text({ action: 'BUY', levels: old }).includes('first-target 2.12R') && !text({ levels: old }).includes('7.00R'));
ok('old levels payload with ONLY rr_final retains honest legacy payout display',
  text({ levels: { entry: 100, stop: 99, rr_final: 3 } }).includes('final 3.00R (legacy payout; not floor evidence)'));
ok('old flat chart plan with ONLY rr_final also retains legacy payout display',
  text({ entry: 100, stop: 99, rr_final: 4 }).includes('final 4.00R (legacy payout; not floor evidence)'));
ok('missing all RR evidence never emits NaN or a guessed floor',
  !/NaN|undefinedR|floor/.test(text({ entry: 100, stop: 99 })));
dom.window.close();
if (process.env.M71_RESULT) fs.writeFileSync(process.env.M71_RESULT, JSON.stringify({ app: APP, pass, fail,
  scope: 'Actual clipboard formatter; legacy-only final payout retains display but is never RR qualification.' }, null, 2) + '\n');
console.log(`M71 clipboard compatibility: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
