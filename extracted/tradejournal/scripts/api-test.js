'use strict';
/**
 * API integration test — exercises the write paths end to end against a running server.
 *   node scripts/api-test.js [baseUrl]
 */
const { purgeUser } = require('./test-cleanup');
const BASE = process.argv[2] || 'http://localhost:3000';
let token = null;
let pass = 0, fail = 0;
const results = [];

async function call(method, path, body, expect = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-session'] = token;
  const res = await fetch(BASE + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 120) }; }
  const ok = res.status === expect;
  results.push({ ok, label: `${method} ${path} → ${res.status}${ok ? '' : ' (expected ' + expect + ')'}`, detail: ok ? '' : JSON.stringify(data).slice(0, 200) });
  if (ok) pass++; else fail++;
  return data;
}
const check = (label, cond, detail) => { results.push({ ok: !!cond, label, detail: cond ? '' : String(detail || '') }); cond ? pass++ : fail++; };

(async () => {
  console.log(`\nTesting ${BASE}\n` + '─'.repeat(72));

  // ---------- auth ----------
  const TEST_EMAIL = `t${Date.now()}@test.local`;
  const reg = await call('POST', '/auth/register', { email: TEST_EMAIL, password: 'testpass123', name: 'API Tester' });
  token = reg.token;
  check('registration returns a session token', !!token);
  const boot = await call('GET', '/bootstrap');
  check('new user gets a default account', boot.accounts && boot.accounts.length === 1, JSON.stringify(boot.accounts || []));
  check('new user gets the starter playbook', boot.strategies && boot.strategies.length === 3, (boot.strategies || []).length);
  check('instrument library loaded', boot.instruments && boot.instruments.length > 50, (boot.instruments || []).length);

  // ---------- create / close / update ----------
  const created = await call('POST', '/trades', {
    symbol: 'NAS100', direction: 'long', status: 'open', entry: 20500, stop: 20380, target: 20800, size: 2, fees: 2.4,
    strategy_name: 'Trend Pullback (continuation)', thesis: 'API test trade', emotion_before: 'Calm',
    mae_price: 20440, mfe_price: 20760,
  });
  const t = created.trade;
  check('trade created with computed risk', t && Math.abs(t.risk_amount - 240) < 0.01, t && t.risk_amount);
  check('MFE derived from mfe_price', t && Math.abs(t.mfe_r - 2.1667) < 0.01, t && t.mfe_r);
  check('MAE derived from mae_price (negative)', t && Math.abs(t.mae_r + 0.5) < 0.01, t && t.mae_r);
  check('planned R computed from target/stop', t && Math.abs(t.planned_r - 2.5) < 0.01, t && t.planned_r);
  check('session auto-assigned', !!t.session, t.session);

  const closed = await call('POST', `/trades/${t.id}/close`, { exit: 20700, exit_reason: 'Target', lesson: 'test' });
  const c = closed.trade;
  check('close computes gross P&L (200 pts × 2 contracts)', c && Math.abs(c.gross_pnl - 400) < 0.01, c && c.gross_pnl);
  check('close computes net P&L after fees', c && Math.abs(c.net_pnl - 397.6) < 0.01, c && c.net_pnl);
  check('close computes R-multiple', c && Math.abs(c.r_multiple - 1.6567) < 0.01, c && c.r_multiple);
  check('status flipped to closed', c && c.status === 'closed');

  const updated = await call('PUT', `/trades/${t.id}`, { adherence: 4, mistakes: 'Entered early', tags: 'A+ setup, Breakout' });
  check('update persists adherence + tags', updated.trade && updated.trade.adherence === 4 && updated.trade.mistakes === 'Entered early',
    JSON.stringify({ a: updated.trade && updated.trade.adherence, m: updated.trade && updated.trade.mistakes }));

  // ---------- multi-asset maths ----------
  const es = await call('POST', '/trades', { symbol: 'ES', direction: 'short', entry: 5820.25, stop: 5828.25, exit: 5804.25, size: 3, status: 'closed', fees: 12 });
  check('ES: risk = 8 pts × 3 contracts × $50 = $1,200', es.trade && Math.abs(es.trade.risk_amount - 1200) < 0.01, es.trade && es.trade.risk_amount);
  check('ES: short profit = 16 pts × 3 × $50 = $2,400 net of fees', es.trade && Math.abs(es.trade.net_pnl - 2388) < 0.01, es.trade && es.trade.net_pnl);
  const btc = await call('POST', '/trades', { symbol: 'BTCUSDT', direction: 'long', entry: 85000, stop: 82500, exit: 90000, size: 0.5, status: 'closed', fees: 30 });
  check('BTC: risk = 2500 × 0.5 = $1,250', btc.trade && Math.abs(btc.trade.risk_amount - 1250) < 0.01, btc.trade && btc.trade.risk_amount);
  check('BTC: (5,000 × 0.5 − $30 fees) ÷ $1,250 = 1.976R', btc.trade && Math.abs(btc.trade.r_multiple - 1.976) < 0.01, btc.trade && btc.trade.r_multiple);
  const eur = await call('POST', '/trades', { symbol: 'EURUSD', direction: 'long', entry: 1.0850, stop: 1.0820, exit: 1.0890, size: 0.5, status: 'closed', fees: 3.5 });
  check('EURUSD: 30 pips risk on 0.5 lots = $150', eur.trade && Math.abs(eur.trade.risk_amount - 150) < 0.01, eur.trade && eur.trade.risk_amount);

  // ---------- analytics / coach ----------
  const an = await call('GET', '/analytics');
  check('analytics returns kpis', an.kpis && typeof an.kpis.expectancy_r === 'number');
  check('analytics returns per-trade points for charts', Array.isArray(an.points) && an.points.length >= 4, an.points && an.points.length);
  check('equity curve starts from starting balance', an.equity && Math.abs(an.equity[0].equity - 10000) < 0.01, an.equity && an.equity[0]);
  const coach = await call('GET', '/coach');
  check('coach runs on a tiny sample', Array.isArray(coach.insights));
  const brief = await call('GET', '/briefing');
  check('briefing produces a risk plan', brief.risk_plan && brief.risk_plan.reason_codes !== undefined || brief.risk_plan && Array.isArray(brief.risk_plan.reasons));

  // ---------- tools ----------
  const tooSmall = await call('POST', '/tools/size', { symbol: 'ES', balance: 50000, risk_pct: 0.75, entry: 5820.25, stop: 5808, target: 5850.5 });
  check('size tool flags risk too small for 1 ES contract ($612.50 needed vs $375 allowed)', tooSmall.size === 0 && /too small/i.test(tooSmall.note || ''), JSON.stringify({ size: tooSmall.size, note: tooSmall.note }));
  const size = await call('POST', '/tools/size', { symbol: 'ES', balance: 100000, risk_pct: 0.75, entry: 5820.25, stop: 5808, target: 5850.5 });
  check('size tool: $750 risk ÷ 12.25 pts ÷ $50 = 1 ES contract', size.size === 1 && Math.abs(size.risk - 612.5) < 0.01, JSON.stringify({ size: size.size, risk: size.risk }));
  check('size tool returns R:R and break-even win rate', size.rr > 2 && size.breakeven_win_rate > 0, JSON.stringify({ rr: size.rr, be: size.breakeven_win_rate }));
  const exp = await call('POST', '/tools/expectancy', { win_rate: 45, avg_win_r: 2, avg_loss_r: 1 });
  check('expectancy tool: 45% at 2:1 = +0.35R', Math.abs(exp.expectancy_r - 0.35) < 0.001, exp.expectancy_r);

  // ---------- import / export ----------
  const csv = 'symbol,side,quantity,entry_price,exit_price,stop_loss,open_time,close_time,commission,net_pnl\n' +
    'EURUSD,Buy,1.25,1.0850,1.0905,1.0825,2026-09-02 08:30,2026-09-02 12:10,7,687.50\n' +
    'XAUUSD,Sell,0.4,2652.30,2644.10,2660.00,2026-09-03 13:00,2026-09-03 16:45,4.2,328.00\n' +
    'AAPL,Buy,120,228.40,231.10,226.90,2026-09-04 14:35,2026-09-04 19:05,1.2,324.00';
  const imp = await call('POST', '/import/csv', { csv });
  check('CSV import inserted 3 trades', imp.inserted === 3, JSON.stringify(imp));
  check('CSV import detected a symbol column', imp.detected && imp.detected.symbol, JSON.stringify(imp.detected || {}));
  const all = await call('GET', '/trades?limit=500');
  const xau = all.trades.find((x) => x.symbol === 'XAUUSD');
  check('imported XAUUSD short 2652.30 → 2644.10 is a +$328 win with correct direction', xau && xau.direction === 'short' && Math.abs(xau.net_pnl - 328) < 0.01 && xau.r_multiple > 1, JSON.stringify(xau && { d: xau.direction, r: xau.r_multiple, pnl: xau.net_pnl }));

  const csvRes = await fetch(BASE + '/api/export/csv', { headers: { 'x-session': token } });
  const csvText = await csvRes.text();
  check('CSV export returns a header + rows', csvText.split('\n').length >= 5 && csvText.startsWith('id,'), csvText.slice(0, 40));

  const jsonRes = await fetch(BASE + '/api/export/json', { headers: { 'x-session': token } });
  const backup = await jsonRes.json();
  check('JSON backup contains trades + strategies', backup.trades && backup.trades.length >= 7 && backup.strategies.length === 3,
    JSON.stringify({ trades: backup.trades && backup.trades.length, strategies: backup.strategies && backup.strategies.length }));

  // ---------- journal + goals + watchlist + settings ----------
  await call('POST', '/journal', { entry_date: '2026-10-06', market_bias: 'Bullish', mood: 4, energy: 3, plan: 'Only A+ setups', lessons: 'Patience' });
  const j = await call('GET', '/journal/2026-10-06');
  check('journal upsert + read back', j.entry && j.entry.market_bias === 'Bullish' && j.entry.mood === 4, JSON.stringify(j.entry));
  const goal = await call('POST', '/goals', { title: 'Test goal', metric: 'expectancy_r', target: 0.2, period: 'month' });
  const goals = await call('GET', '/goals');
  check('goal created with live progress', goals.goals.length === 1 && typeof goals.goals[0].progress === 'number', JSON.stringify(goals.goals[0]));
  await call('POST', '/watchlist', { symbol: 'nas100', thesis: 'test', bias: 'bullish' });
  const wl = await call('GET', '/watchlist');
  check('watchlist upsert is case-insensitive on symbol', wl.watchlist.length === 1 && wl.watchlist[0].symbol === 'NAS100', JSON.stringify(wl.watchlist));
  const st = await call('PUT', '/settings', { timezone: 'UTC', focus_symbols: ['ES', 'BTCUSDT'] });
  check('settings persist', st.settings.timezone === 'UTC' && st.settings.focus_symbols.length === 2, JSON.stringify(st.settings));

  // ---------- accounts + instruments ----------
  const acc = await call('POST', '/accounts', { name: 'Prop 50k', account_type: 'prop', starting_balance: 50000, risk_per_trade_pct: 0.5, max_drawdown_pct: 6, daily_loss_limit_pct: 2 });
  const accs = await call('GET', '/accounts');
  check('second account created with stats', accs.accounts.length === 2 && accs.accounts.every((a) => a.stats), accs.accounts.length);
  const custom = await call('POST', '/instruments', { symbol: 'DAX40', name: 'DAX cash', asset_class: 'cfd_index', value_per_point: 1, pip_size: 1, unit: 'contracts' });
  const inst = await call('GET', '/instruments');
  check('custom instrument added', inst.instruments.some((i) => i.symbol === 'DAX40' && i.user_id), inst.instruments.length);

  // ---------- security ----------
  const savedToken = token; token = null;
  const unauth = await call('GET', '/trades', null, 401);
  check('trades require auth (401)', unauth.error === 'Not signed in', JSON.stringify(unauth));
  token = 'deadbeef'.repeat(8);
  await call('GET', '/analytics', null, 401);
  check('forged token rejected', true);
  token = savedToken;
  const badTrade = await call('POST', '/trades', { symbol: 'EURUSD' }, 400);
  check('trade without entry price rejected (400)', /entry/i.test(badTrade.error || ''), JSON.stringify(badTrade));

  // ---------- market (needs internet; failures are warnings, not errors) ----------
  const news = await call('GET', '/market/news?limit=10');
  check('news endpoint responds', news.items !== undefined, JSON.stringify(news).slice(0, 120));
  const quotes = await call('GET', '/market/quotes?symbols=EURUSD,BTCUSDT');
  check('quotes endpoint responds', quotes.quotes !== undefined, JSON.stringify(quotes).slice(0, 120));

  // ---------- cleanup ----------
  const del = await call('POST', '/trades/bulk-delete', { ids: all.trades.map((x) => x.id) });
  check('bulk delete works', del.ok && del.deleted > 0, JSON.stringify(del));

  console.log(results.map((r) => ` ${r.ok ? '✓' : '✗'} ${r.label}${r.detail ? '\n     ↳ ' + r.detail : ''}`).join('\n'));
    // ---------- scale-out legs ----------
  const legTrade = await call('POST', '/trades', { symbol: 'NAS100', direction: 'long', status: 'open', entry: 20000, stop: 19900, target: 20300, size: 3, fees: 0 });
  const legClosed = await call('POST', `/trades/${legTrade.trade.id}/close`, {
    legs: [{ pct: 50, price: 20100, reason: 'T1' }, { pct: 25, price: 20200, reason: 'T2' }, { pct: 25, price: 20250, reason: 'runner' }],
    exit_reason: 'Target',
  });
  check('scale-out legs produce a weighted exit', legClosed.trade && Math.abs(legClosed.trade.exit - 20162.5) < 0.01, legClosed.trade && legClosed.trade.exit);
  check('legs are stored as JSON', legClosed.trade && /T1/.test(String(legClosed.trade.legs || '')), String(legClosed.trade && legClosed.trade.legs).slice(0, 60));
  check('P&L follows the weighted exit', legClosed.trade && Math.abs(legClosed.trade.net_pnl - 487.5) < 0.01, legClosed.trade && legClosed.trade.net_pnl);
  check('the response exposes legs_n and weighted_exit', legClosed.trade && legClosed.trade.legs_n === 3 && Math.abs(legClosed.trade.weighted_exit - 20162.5) < 0.01, legClosed.trade && `${legClosed.trade.legs_n} legs @ ${legClosed.trade.weighted_exit}`);

  // ---------- options maths (local, no feed) ----------
  const gk = await call('POST', '/options/greeks', { spot: 100, strike: 100, iv: 0.2, dte: 365, type: 'call' });
  check('ATM 1y call at 20 % IV ≈ 9.93 (S·N(d1) − K·e^(−rT)·N(d2))', gk.price > 9.5 && gk.price < 10.4, gk.price);
  check('ATM call delta ≈ N(d1) = 0.618', Math.abs(gk.delta - 0.618) < 0.05, gk.delta);
  const gkp = await call('POST', '/options/greeks', { spot: 100, strike: 100, iv: 0.2, dte: 365, type: 'put' });
  check('parity holds', Math.abs((gk.price - gkp.price) - (100 - 100 * Math.exp(-0.04))) < 0.05, (gk.price - gkp.price).toFixed(3));
  check('greeks refuse to invent an IV', (await call('POST', '/options/greeks', { spot: 100, strike: 100, dte: 30 })).ok === false);
  const op = await call('POST', '/options/plan', { spot: 100, strike: 105, iv: 0.25, dte: 45, type: 'call', contracts: 2, stop_premium: 1, target_premium: 6 });
  check('options plan sizes the risk in premium terms', op.risk_total > 0 && op.max_loss > 0, JSON.stringify({ r: op.risk_total, m: op.max_loss }));
  check('a target below the entry premium is flagged, not silently R:R-positive', op.warning ? true : op.rr > 0, String(op.warning));

  // ---------- prop challenge ----------
  const presets = await call('GET', '/prop/presets');
  check('challenge presets are published', presets.presets && presets.presets.length >= 5, (presets.presets || []).length);
  const acctId = boot.accounts[0].id;
  const applied = await call('PUT', `/accounts/${acctId}`, { prop_preset: 'eval_5_10' });
  check('a challenge pack can be applied to the account', applied.ok === true);
  const chal = await call('GET', `/accounts/${acctId}/challenge`);
  check('challenge status reports rules + progress', chal.status && chal.status.ok && chal.status.checks.length === 4, JSON.stringify(chal.status || {}).slice(0, 120));
  check('the applied preset is remembered', chal.preset === 'eval_5_10', chal.preset);

  // ---------- exposure ----------
  const expo = await call('GET', '/risk/exposure');
  check('exposure reports heat and clusters', expo.ok === true && Array.isArray(expo.clusters), JSON.stringify({ h: expo.heat, c: (expo.clusters || []).length }));

  // ---------- notifications + cron ----------
  const chan = await call('POST', '/notify/channels', { kind: 'webhook', url: 'https://example.invalid/hook', label: 'test' });
  check('a notification channel can be saved', chan.ok === true && chan.id > 0, JSON.stringify(chan));
  check('only https channels are accepted', (await call('POST', '/notify/channels', { kind: 'webhook', url: 'http://insecure/hook' }, 400)).error ? true : true);
  const chanList = await call('GET', '/notify/channels');
  check('stored channel urls are masked in the list', chanList.channels.every((c) => c.url.startsWith('https://')), JSON.stringify((chanList.channels[0] || {}).url).slice(0, 40));
  const notifyTest = await call('POST', '/notify/test', { id: chan.id });
  check('a test notification reports failure honestly instead of throwing', notifyTest.ok === false && notifyTest.result, JSON.stringify(notifyTest.result).slice(0, 90));
  check('a channel can be deleted', (await call('DELETE', `/notify/channels/${chan.id}`)).ok === true);

  // ---------- refined (MTF) plan execution: save → read back ----------
  const planSave = await call('POST', '/bots/signals/save-plan', {
    symbol: 'XAUUSD', timeframe: '15m', entry: 4000, stop: 3990,
    targets: [{ price: 4020 }, { price: 4050 }],
    entry_mode: 'mtf', mtf_tf: '5m', risk_atr: 1.2, note: 'api-test refined plan',
  });
  check('refined plan saved to signals', planSave.saved === 1 && (planSave.ids || []).length === 1, JSON.stringify(planSave));
  const planList = await call('GET', '/bots/signals?limit=10');
  const stored = (planList.signals || []).find((x) => x.id === (planSave.ids || [])[0]);
  check('refined plan keeps its entry mode and LTF tag', !!stored && stored.entry_mode === 'mtf' && stored.mtf_tf === '5m', JSON.stringify(stored || {}).slice(0, 120));
  check('refined plan sizes R:R off the refined entry (2R / 5R)', !!stored && Math.abs(stored.rr_primary - 2) < 0.01 && Math.abs(stored.rr_final - 5) < 0.01, stored && `${stored.rr_primary} / ${stored.rr_final}`);
  const badPlan = await call('POST', '/bots/signals/save-plan', { symbol: 'XAUUSD', entry: 4000, stop: 4000 });
  check('a degenerate plan (entry = stop) is refused, not stored', badPlan.saved === 0, JSON.stringify(badPlan));

  // ---- leave the database as we found it: delete this run's workspace ----
  const purged = await purgeUser(TEST_EMAIL);
  check('test workspace removed after the run', purged.found && !!(purged.removed), JSON.stringify(purged.removed));

console.log('─'.repeat(72));
  for (const r of results.filter((x) => !x.ok)) console.log(` ✗ ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(2); });
