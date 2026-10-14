'use strict';
/**
 * M30 API probe: the zone-method choice as the product serves it. Every state is reached through the
 * app's own routes — `PUT /settings` stores the choice, `?zone_method=` overrides it for one request,
 * `/bots/analyse`, `/bots/chart` and `/bots/scan` all run on it, and the TradingView webhook reads an
 * alert on it — over real candles through the candle shim.
 *
 * The read-only claim is measured the way M56 measured its own: a control analysis with no choice and
 * a measured analysis with the range geometry must write the SAME rows, because the geometry is a
 * read. And the choice adds no column: it lives in the `users.settings` JSON the app already has.
 */
const H = require('./m30-test-support'), { ok } = H;

H.finish('M30 api: the zone-method choice over the real routes, its ownership and its read-only proof', async () => {
  const u = await H.start('m30-api');
  const S = H.mod('src/bots/smc');
  if (!H.shipped(S, 'the zone-method vocabulary and the consolidation walk (src/bots/smc.js)')) return;

  const desk = await H.account(u, 'M30 desk');
  const q = (extra = {}) => H.analyseQuery(desk.id, extra);

  /* ------------------------------------------------------- 1. the default, before any choice */
  const fresh = await H.settingsOf(u);
  ok('a new account has made no choice at all: the setting is absent rather than defaulted to a value it never picked',
    fresh.zone_method === undefined || fresh.zone_method === null, JSON.stringify({ zone_method: fresh.zone_method }));

  const dflt = await H.analyse(u, q());
  const dm = H.methodOf(dflt.data);
  ok('an analysis with no choice made runs the pivot method, and says nobody chose rather than claiming it was asked for',
    dflt.status === 200 && dm && dm.method === 'pivot' && dm.requested === null && dm.source === 'default' && dm.read === true,
    JSON.stringify(dm));
  ok('every zone it plotted is the pivot candle with no consolidation walk attached',
    H.zonesOf(dflt.data).length > 0 && H.zonesOf(dflt.data).every((z) => z.zone_method === 'pivot' && z.base === null),
    JSON.stringify(H.zonesOf(dflt.data).slice(0, 1)));
  ok('and the filter publishes the whole closed vocabulary, so a client can render the choice it is offering',
    JSON.stringify(dm.vocabulary) === '["pivot","range"]' && /pivot method/i.test(dm.note), JSON.stringify(dm.vocabulary));

  /* ------------------------------------------------ 2. one request may ask for the range method */
  const ranged = await H.analyse(u, q({ zone_method: 'range' }));
  const rm = H.methodOf(ranged.data);
  ok('`?zone_method=range` really plots the consolidation: the method, the source of the choice and the applied count all say range',
    ranged.status === 200 && rm.method === 'range' && rm.requested === 'range' && rm.source === 'request' && rm.applied_zones > 0,
    JSON.stringify(rm));
  const cmp = H.compare(dflt.data, ranged.data);
  // Which origins each read kept, when they disagree — printed, so a mismatch is diagnosable from
  // the evidence file instead of being inferred from a count.
  const pk = H.zonesOf(dflt.data).map(H.keyOf), rk = H.zonesOf(ranged.data).map(H.keyOf);
  if (cmp.paired !== cmp.origins) console.log(' origin drift — pivot:', JSON.stringify(pk), '\n                  range:', JSON.stringify(rk));
  ok('and every origin the two runs BOTH plot is a superset: the range box contains the pivot box, box by box',
    cmp.origins > 0 && cmp.paired > 0 && cmp.superset === cmp.paired,
    JSON.stringify({ origins: cmp.origins, paired: cmp.paired, superset: cmp.superset, widest: cmp.widest }));
  ok('each range zone carries the walk that produced it (bars, width in ATR, what stopped it)',
    H.zonesOf(ranged.data).filter((z) => z.zone_method === 'range').every((z) => z.base && z.base.ok === true && z.base.applied === true && z.base.bars >= 2),
    JSON.stringify(H.zonesOf(ranged.data).slice(0, 2).map((z) => z.base)));
  ok('the request is not stored by asking: one request cannot rewrite the trader\u2019s preference',
    (await H.settingsOf(u)).zone_method === null || (await H.settingsOf(u)).zone_method === undefined);

  /* --------------------------------------------------- 3. the choice, stored and then consulted */
  const saved = await H.chooseZoneMethod(u, 'range');
  ok('the choice is saved through the app\u2019s own settings route and reported back',
    saved.status === 200 && saved.data.settings && saved.data.settings.zone_method === 'range',
    JSON.stringify(saved.data && saved.data.settings && saved.data.settings.zone_method));
  const stored = await H.settingsOf(u);
  ok('and it is the trader\u2019s row, not a process-wide default: the next request reads it back',
    stored.zone_method === 'range', JSON.stringify({ zone_method: stored.zone_method }));
  const consulted = await H.analyse(u, q());
  ok('an analysis that asks for NOTHING now runs the range method: the stored choice is consulted, not merely echoed',
    H.methodOf(consulted.data).method === 'range' && H.methodOf(consulted.data).source === 'settings',
    JSON.stringify(H.methodOf(consulted.data)));
  ok('and it is the same geometry the explicit request produced',
    JSON.stringify(H.zonesOf(consulted.data)) === JSON.stringify(H.zonesOf(ranged.data)),
    JSON.stringify({ a: H.zonesOf(consulted.data).length, b: H.zonesOf(ranged.data).length }));
  // The harness `req` defaults to POST, so the wrapper must too (a GET here 400s in undici, which is
  // how this was found): only the AUTH is swapped for the other account's token.
  const ou = { ...u, req: (url, body, method = 'POST', auth = u.otherToken) => u.req(url, body, method, auth) };
  const otherDesk = await H.account(ou, 'M30 other desk');
  const other = await ou.req('/bots/analyse' + H.analyseQuery(otherDesk.id), undefined, 'GET');
  ok('another account is not affected by this one\u2019s choice: the preference is per user, not a process-wide default',
    other.status === 200 && H.methodOf(other.data).method === 'pivot' && H.methodOf(other.data).requested === null,
    JSON.stringify(H.methodOf(other.data)));

  const override = await H.analyse(u, q({ zone_method: 'pivot' }));
  ok('an explicit `?zone_method=pivot` overrides the stored range for that request, so both methods can be tested side by side',
    H.methodOf(override.data).method === 'pivot' && H.methodOf(override.data).requested === 'pivot',
    JSON.stringify(H.methodOf(override.data)));
  ok('and that single request did not move the stored choice',
    (await H.settingsOf(u)).zone_method === 'range');

  const folded = await H.analyse(u, q({ zone_method: ' RANGE ' }));
  ok('the vocabulary is folded, not taken literally: a padded, upper-case request is the range method',
    H.methodOf(folded.data).method === 'range' && H.methodOf(folded.data).error === null, JSON.stringify(H.methodOf(folded.data)));

  /* --------------------------------------------------- 4. what happens when it cannot be honoured */
  const bogus = await H.analyse(u, q({ zone_method: 'consolidation' }));
  const bm = H.methodOf(bogus.data);
  ok('a method this app cannot plot runs the pivot geometry and NAMES the request and the vocabulary on the payload',
    bogus.status === 200 && bm.method === 'pivot' && bm.requested === 'consolidation'
    && /is not a zone method this app can plot/.test(bm.error) && /pivot, range/.test(bm.error), JSON.stringify(bm));
  ok('and the zones really are the pivot boxes, so the sentence and the picture agree',
    JSON.stringify(H.zonesOf(bogus.data)) === JSON.stringify(H.zonesOf(override.data)),
    JSON.stringify({ bogus: H.zonesOf(bogus.data).length, pivot: H.zonesOf(override.data).length }));
  const refused = await H.chooseZoneMethod(u, 'consolidation');
  ok('saving a method this app cannot plot is REFUSED by name rather than quietly ignored',
    refused.status === 400 && refused.data.code === 'zone_method_invalid'
    && /is not a zone method this app can plot/.test(refused.data.error) && /pivot, range/.test(refused.data.error),
    JSON.stringify({ status: refused.status, code: refused.data.code, error: refused.data.error }));
  ok('and a refused save leaves the stored choice exactly as it was',
    (await H.settingsOf(u)).zone_method === 'range');
  const cleared = await H.chooseZoneMethod(u, '');
  ok('the choice can be released back to the default (empty clears it, and the analysis says asked-nothing again)',
    cleared.status === 200 && (cleared.data.settings.zone_method === null || cleared.data.settings.zone_method === undefined)
    && H.methodOf((await H.analyse(u, q())).data).method === 'pivot' && H.methodOf((await H.analyse(u, q())).data).requested === null,
    JSON.stringify(cleared.data.settings.zone_method));

  /* --------------------------------------------------- 5. the same choice on every surface */
  await H.chooseZoneMethod(u, 'range');
  const chart = await H.chartOf(u, '?symbol=EURUSD&tf=15m&bars=400&account_id=' + desk.id);
  ok('the chart draws the same geometry the analysis used (M124: the chart is not a second opinion)',
    chart.status === 200 && chart.data.smc && chart.data.smc.zone_method === 'range'
    && chart.data.smc.zone_method_source === 'settings' && chart.data.smc.order_blocks.length > 0,
    JSON.stringify(chart.data && chart.data.smc && { m: chart.data.smc.zone_method, src: chart.data.smc.zone_method_source, zones: chart.data.smc.order_blocks.length }));
  ok('and every zone the chart DOES draw names its own geometry: range where the consolidation was walked, pivot with the reason where it could not be',
    chart.data.smc.order_blocks.every((z) => z.zone_method === 'range' || (z.zone_method === 'pivot' && z.base && z.base.applied === false && !!z.base.reason)),
    JSON.stringify(chart.data.smc.order_blocks.map((z) => [z.zone_method, z.base && z.base.reason])));
  const scan = await H.scanOf(u, '?symbols=EURUSD&tf=15m&account_id=' + desk.id);
  ok('a scan row carries the method it was built with, so a list of markets can never be read on an unnamed geometry',
    scan.status === 200 && scan.data.rows.length > 0 && scan.data.rows.every((r) => r.zone_method && r.zone_method.method === 'range' && r.zone_method.read === true),
    JSON.stringify(scan.data.rows.map((r) => r.zone_method && r.zone_method.method)));

  /* --------------------------------- 6. the alert surface: an alert is read on the same geometry */
  const hook = (await u.req('/bots/webhook', undefined, 'GET')).data;
  const alert = await u.req('/bots/webhook/tradingview?token=' + encodeURIComponent(hook.token),
    { symbol: 'EURUSD', action: 'buy', price: 1.1, tf: '15m' }, 'POST', null);
  ok('an incoming TradingView alert is analysed with the trader\u2019s own zone method, and the verdict carries it',
    alert.status === 200 && alert.data.plan && alert.data.plan.zone_method && alert.data.plan.zone_method.method === 'range'
    && alert.data.plan.zone_method.read === true, JSON.stringify(alert.data.plan && alert.data.plan.zone_method));
  const history = await u.req('/bots/webhook', undefined, 'GET');
  const row = (history.data.alerts || []).find((a) => a.id === alert.data.alert_id) || (history.data.alerts || [])[0];
  const storedResult = row && row.result && typeof row.result === 'object' ? row.result : (() => { try { return JSON.parse(row.result); } catch (e) { return null; } })();
  ok('and the STORED alert history names the geometry too, so an unattended verdict can be attributed later without re-running it',
    !!storedResult && storedResult.zone_method && storedResult.zone_method.method === 'range', JSON.stringify(storedResult && storedResult.zone_method));

  /* --------------------------------------- 7. read-only, and no schema of its own */
  const snapshotOf = async () => {
    const objs = await H.D.db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const out = {};
    for (const o of objs) {
      if (o.type !== 'table') { out[o.type + ':' + o.name] = o.name; continue; }
      try { out[o.name] = JSON.stringify(await H.D.db.prepare('SELECT * FROM ' + o.name + ' ORDER BY 1').all()); } catch { out[o.name] = '<unreadable>'; }
    }
    return out;
  };
  const before = await snapshotOf();
  await H.analyse(u, q({ zone_method: 'pivot' }));     // the control arm: the app's own writes, pivot geometry
  const controlSnap = await snapshotOf();
  await H.analyse(u, q({ zone_method: 'range' }));     // the measured arm: the same call, range geometry
  await H.chartOf(u, '?symbol=EURUSD&tf=15m&bars=400&account_id=' + desk.id + '&zone_method=range');
  const armSnap = await snapshotOf();
  const controlKeys = H.changed(before, controlSnap), armKeys = H.changed(before, armSnap);
  ok('reading the range geometry writes exactly what reading the pivot geometry writes \u2014 a method adds no row of its own',
    armKeys.every((k) => controlKeys.includes(k)), JSON.stringify({ control: controlKeys, arm: armKeys }));
  ok('and the milestone adds NO table, index, trigger or column of its own: the choice lives in the settings JSON the app already stores',
    !(await H.tablesOf()).some((t) => /zone_method|zone_geometry/i.test(t))
    && !(await H.D.db.prepare('PRAGMA table_info(users)').all()).some((c) => /zone_method/i.test(c.name)),
    JSON.stringify((await H.tablesOf()).filter((t) => /zone/i.test(t))));
});

module.exports = {};
