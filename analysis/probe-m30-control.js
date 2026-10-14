'use strict';
/**
 * M30 control: what the fault IS on the tree being measured, and what each half of the fix closes it
 * with — said in counts rather than adjectives.
 *
 * The milestone's claim is narrow and it is Ep 7's own: he gives TWO zone methods (the pivot candle
 * and the whole consolidation high-to-low), advises testing both over the trader's own 100 trades,
 * and states the cost of the pivot method himself — with it "you would have missed this entry ...
 * price did not mitigate your zone". The app had one geometry, hardcoded, with no way to say which
 * one it was reading, let alone choose. This probe measures exactly that, on whichever tree it is
 * pointed at via TJ_APP:
 *
 *   M30_CONTROL_MODE=parent     the committed M56 alert-surface release (27fbb2a) — the tree being fixed
 *   M30_CONTROL_MODE=module     that release plus `src/bots/smc.js`: the vocabulary and the
 *                               consolidation walk exist and a read can be asked for the range
 *                               geometry, while the filter, the routes, the settings key and the two
 *                               screens know nothing about it — the module is real and invisible
 *   M30_CONTROL_MODE=delivered  the delivered tree
 *
 * Every negative is a count (absent key, absent route status, absent control in the source), never a
 * crash: the same file passes on all three trees and says what it found.
 */
const fs = require('fs'), path = require('path');
const H = require('./m30-test-support'), { ok } = H;
const MODE = process.env.M30_CONTROL_MODE || 'delivered';
const SMC_FILE = path.join(H.APP, 'src', 'bots', 'smc.js');
const PUB = path.join(H.APP, 'public', 'js', 'views');
const readPub = (f) => { try { return fs.readFileSync(path.join(PUB, f), 'utf8'); } catch (e) { return ''; } };

H.finish(`M30 control (${MODE}): the one geometry nothing could name`, async () => {
  const u = await H.start('M30 control ' + MODE);
  const desk = await H.account(u, 'M30 control desk');
  const S = (() => { try { return H.mod('src/bots/smc'); } catch (e) { return null; } })();
  const HAS_MODULE = !!S && Array.isArray(S.ZONE_METHODS) && typeof S.consolidationBase === 'function';
  const CARRIES_MODULE_FILE = /ZONE_METHODS/.test(fs.existsSync(SMC_FILE) ? fs.readFileSync(SMC_FILE, 'utf8') : '');

  /* 1. Is there a second geometry at all? On the parent this is the whole fault: one hard-coded box. */
  ok('a second zone method exists exactly when the tree being measured ships one \u2014 on the parent there is no vocabulary and no walk to ask for',
    HAS_MODULE === (MODE !== 'parent') && (HAS_MODULE
      ? JSON.stringify(S.ZONE_METHODS) === '["pivot","range"]' && S.ZONE_METHOD_DEFAULT === 'pivot'
      : !CARRIES_MODULE_FILE),
    { mode: MODE, methods: S && S.ZONE_METHODS, file_mentions: CARRIES_MODULE_FILE });

  /* 2. Does a READ actually use it? Measured on real candles, through the app's own route. */
  const q = H.analyseQuery(desk.id);
  const pivot = (await H.analyse(u, q)).data;
  const ranged = (await H.analyse(u, q + '&zone_method=range')).data;
  const pm = H.methodOf(pivot), rm = H.methodOf(ranged);
  const zones = (p) => H.zonesOf(p).length;
  ok('an analysis states which geometry it ran on exactly when the tree can run two, and on the parent the payload has no zone-method key at all (the question cannot even be asked there)',
    (!!pm) === (MODE === 'delivered') && (!pm || pm.method === 'pivot'),
    { mode: MODE, keys: Object.keys((pivot.setups || {}).filters || {}).filter((k) => /zone/.test(k)), method: pm && pm.method });
  ok('and asking for the range geometry either widens the boxes or is simply an unrecognised parameter \u2014 the parent ignores it and returns the identical zones',
    MODE === 'delivered' ? (rm && rm.method === 'range' && rm.applied_zones > 0 && zones(ranged) > 0)
      : JSON.stringify(H.zonesOf(pivot)) === JSON.stringify(H.zonesOf(ranged)),
    { mode: MODE, pivot_zones: zones(pivot), range_zones: zones(ranged), applied: rm && rm.applied_zones });
  /* The "price came back into the consolidation without touching the candle" claim is a property of the
   * WALK, so it is measured on a synthetic series rather than on whichever fixture a route happens to
   * serve: the fixture can legitimately contain no such return, and a claim that depends on the market
   * is not a claim about the code. */
  const synth = (() => {
    if (!HAS_MODULE) return null;
    const Synth = require(path.join(__dirname, 'harness', 'synth'));
    let windows = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const cs = Synth.series({ seed, bars: 900 });
      // Walk several windows per seed rather than one: whether a given window contains the return is a
      // fact about that market, and this probe is measuring the CODE. Zone indices live inside the
      // window, so the bars handed to `compare` are the window's own candles.
      for (let i = 260; i < cs.length - 4; i += 61) {
        const win = cs.slice(Math.max(0, i - 300), i + 1), now = cs[i].t;
        const c = H.compare(S.analyse(win, { tf: '15m', now }), S.analyse(win, { tf: '15m', now, zoneMethod: 'range' }), win);
        windows++;
        if (c.missed > 0) return { seed, i, missed: c.missed, paired: c.paired, windows, first: c.missedOrigins[0] };
      }
    }
    return { seed: null, missed: 0, windows };
  })();
  ok('the wider box is measurable in the candles, not just in a label: the range method catches a return price made into the consolidation without touching the pivot candle',
    MODE === 'parent' ? synth === null && JSON.stringify(H.zonesOf(pivot)) === JSON.stringify(H.zonesOf(ranged)) : (synth && synth.missed > 0),
    { mode: MODE, synth, compare: H.compare(pivot, ranged) });

  /* 3. The choice: is there anywhere to MAKE it, and does the app remember it? */
  const saved = await H.chooseZoneMethod(u, 'range');
  ok('the choice can be stored exactly when the settings route knows the key \u2014 and where it does not, the SAME body is accepted and silently ignored, which is the fault: a request the app does not implement reads back as a success',
    (!!(saved.data && saved.data.settings && saved.data.settings.zone_method === 'range')) === (MODE === 'delivered') && saved.status === 200,
    { mode: MODE, status: saved.status, stored: saved.data && saved.data.settings && saved.data.settings.zone_method });
  const bad = await H.chooseZoneMethod(u, 'consolidation');
  ok('and an unrecognised method is rejected with its own code exactly when the route validates it; the parent stores nothing because it has never heard of the key',
    (bad.status === 400 && bad.data.code === 'zone_method_invalid') === (MODE === 'delivered'),
    { mode: MODE, status: bad.status, code: bad.data && bad.data.code, error: (bad.data && bad.data.error || '').slice(0, 60) });
  const stored = await H.settingsOf(u);
  ok('the stored preference is the trader\u2019s own row, so a choice made once is consulted by the next request rather than living in the request that made it',
    MODE !== 'delivered' ? (stored.zone_method === undefined || stored.zone_method === null)
      : (stored.zone_method === 'range' && H.methodOf((await H.analyse(u, q)).data).source === 'settings'),
    { mode: MODE, stored: stored.zone_method });
  await H.chooseZoneMethod(u, '');

  /* 4. The screens: a geometry the trader cannot see is a geometry he cannot choose. */
  const settingsSrc = readPub('settings.js'), botsSrc = readPub('bots.js');
  const hasControl = /s-zone/.test(settingsSrc) && /zone_method/.test(settingsSrc);
  const hasNote = /zoneMethod:\s*'true'/.test(botsSrc);
  ok('the Settings pane offers the choice, and the analysis page names the geometry it read, exactly when the tree ships both',
    hasControl === (MODE === 'delivered') && hasNote === (MODE === 'delivered'),
    { mode: MODE, control: hasControl, note: hasNote });
  ok('and on the parent neither exists: there is no control to pick a geometry with and no line on the analysis page to say which one it used',
    MODE === 'delivered' || (!hasControl && !hasNote),
    { mode: MODE, settings_mentions_zone: /zone/.test(settingsSrc), bots_mentions_zone: /Zones:/.test(botsSrc) });

  /* 5. Nothing else moved: no schema, no extra row, and the pivot read is the read the parent made. */
  const tables = await H.tablesOf();
  ok('the milestone adds NO table, index, trigger or column of its own on any tree \u2014 the choice lives in the settings JSON the app already stores',
    !tables.some((t) => /zone_method|zone_geometry/i.test(t))
    && !(await H.D.db.prepare('PRAGMA table_info(users)').all()).some((c) => /zone_method/i.test(c.name)),
    { mode: MODE, users_columns: (await H.D.db.prepare('PRAGMA table_info(users)').all()).map((c) => c.name).filter((n) => /zone/i.test(n)) });
  const before = JSON.stringify(await H.D.db.prepare('SELECT * FROM users ORDER BY id').all());
  await H.analyse(u, q);
  await H.analyse(u, q + '&zone_method=range');
  ok('and reading either geometry writes no row of its own: the trader\u2019s stored settings are byte-identical across both reads',
    MODE !== 'delivered' || JSON.stringify(await H.D.db.prepare('SELECT * FROM users ORDER BY id').all()) === before,
    { mode: MODE });
});

module.exports = {};
