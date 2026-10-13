'use strict';
/** M110 consumers probe: who in the shipped tree READS the news rule, and does each reader still
 * get what it needs now that the single `window_min` was replaced by a per-side pair.
 *
 * Three readers exist and are driven for real: the desk playlist's guard list (`bots/now.js`),
 * the setup model's check row / veto list / `news_blackout` field (`bots/setup.js`) and the
 * dashboard headline (`bots/index.js`, source-level — it is module-local and its inputs are the
 * same payload). The M109 advisory channel is asked about the calendar through its own route,
 * because it is a consumer that must not start claiming a window it cannot fetch.
 * jsdom-free, no market data: absolute statements only where a real path produced them. */
const H = require('./m110-test-support'), { ok, start, account, finish } = H;
const path = require('path'), fs = require('fs');
const B = require(path.join(H.APP, 'src/bots'));
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control
const SMC = require(path.join(H.APP, 'src/bots/smc'));
const Setup = require(path.join(H.APP, 'src/bots/setup'));
const Now = require(path.join(H.APP, 'src/bots/now'));

/** Comments out of the way before any structural claim is made about source. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*$/gm, '$1');
const shipped = (rel) => code(fs.readFileSync(path.join(H.APP, rel), 'utf8'));

function bars(n = 320) {
  const out = []; let p = 1.1000; const t0 = Date.UTC(2026, 9, 13, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const up = Math.sin(i / 18) > -0.2;
    const step = (up ? 1 : -1) * 0.0006 + Math.sin(i / 7) * 0.0002;
    p = Math.max(1.05, Math.min(1.2, p + step));
    const o = p - step / 2, c = p;
    out.push({ t: t0 + i * 900000, o, h: Math.max(o, c) + 0.0004, l: Math.min(o, c) - 0.0004, c, v: 1000 + i });
  }
  return out;
}

finish('M110 consumers', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const u = await start('m110-consumers');
  const desk = await account(u, 'Consumers desk', { news_block_before_min: 5, news_settle_after_min: 45 });
  const pair = N.plan(desk);

  /* ------------------------------------------------------------ inventory */
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules') continue; const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(f); } };
  walk(path.join(H.APP, 'src')); walk(path.join(H.APP, 'public/js'));
  const rel = files.map((f) => path.relative(H.APP, f));
  const bodies = new Map(rel.map((r) => [r, shipped(r)]));
  const sentenceBuilders = rel.filter((r) => /inside your news window \(/.test(bodies.get(r)) || /inside your news window \(\$\{/.test(bodies.get(r)));
  ok('exactly ONE shipped file builds the blackout sentence, so the rule has a single voice and no reader invents its own wording', sentenceBuilders.length === 1 && sentenceBuilders[0] === 'src/bots/index.js', sentenceBuilders);
  const readsWindowMin = [...bodies].filter(([, b]) => /news\.window_min\b|news\?\.window_min\b|\.news\.window_min\b/.test(b)).map(([r]) => r);
  ok('no shipped file reads a single `window_min` off a news payload any more: the removed knob has no dangling reader', readsWindowMin.length === 0, readsWindowMin);
  ok('the three readers that DO exist each take the engine’s blackout rather than rebuilding it: the playlist guard, the headline and the setup payload', /if \(news && news\.blackout\) guards\.push\(\{ level: 'block', text: news\.blackout \}\)/.test(bodies.get('src/bots/now.js')) && /if \(news\.blackout\) parts\.push\(`NEWS BLACKOUT: \$\{news\.blackout\}`\)/.test(bodies.get('src/bots/index.js')) && /news_blackout: blackout \|\| null/.test(bodies.get('src/bots/setup.js')));
  ok('no shipped client reads the new `windows` echo either, so the API’s provenance block cannot be mistaken for a control by an old page', rel.filter((r) => r.startsWith('public/js')).every((r) => !/\.windows\b/.test(bodies.get(r))), rel.filter((r) => r.startsWith('public/js') && /\.windows\b/.test(bodies.get(r))));

  /* ------------------------------------------------ the engine payload itself */
  H.calendarSpec([{ offset_min: -12, currency: 'USD', title: 'FOMC' }, { offset_min: 100, currency: 'USD', title: 'Far away' }]);
  const dark = await B.newsCheck('EURUSD', pair);
  ok('the served payload has no top-level `window_min` any more — the one-number field is gone, not deprecated', !('window_min' in dark) && Object.keys(dark).sort().join(',') === 'blackout,currencies,events,upcoming,windows', Object.keys(dark));
  ok('each blocked release carries the window of ITS OWN side (the 45-minute settle, not the 5-minute block)', dark.events.length === 1 && dark.events[0].side === 'after' && dark.events[0].window_min === 45, dark.events);
  ok('the payload echoes the pair as provenance, with the source of each side, so a consumer can audit what was applied', dark.windows.before_min === 5 && dark.windows.after_min === 45 && dark.windows.source.length === 2 && dark.windows.clamped.length === 0, dark.windows);
  H.calendarSpec([]);
  const clear = await B.newsCheck('EURUSD', pair);
  ok('a genuinely empty week yields a clear payload that is distinguishable from a blocked one but not from an outage (that gap is M111, and this probe names it as such)', clear.blackout === null && clear.events.length === 0 && clear.windows.unavailable === undefined, clear.windows);

  /* --------------------------------------------------- consumer 1: the playlist */
  const series = bars(); const win = series.slice(-260);
  const smc = SMC.analyse(win, { tf: '15m', now: win[win.length - 1].t, swingMode: 'bos', nested: true });
  const nowIn = { symbol: 'EURUSD', tf: '15m', nowMs: win[win.length - 1].t, td: {}, setups: {}, daily: null, quote: null, series: { candles: win, atr: smc.atr, price: win[win.length - 1].c, smc }, news: dark };
  const guard = Now.build(nowIn);
  const newsGuards = (guard.guards || []).filter((g) => /news window|stand down|printed|FOMC/i.test(g.text || ''));
  ok('the desk playlist renders the blackout as exactly one guard, quoted verbatim from the engine', newsGuards.length === 1 && newsGuards[0].text === dark.blackout, guard.guards);
  ok('and it is a BLOCK-level guard, not a warning the trader can scroll past', newsGuards[0].level === 'block', newsGuards[0]);
  const clean = Now.build({ ...nowIn, news: clear });
  ok('with a clear calendar the playlist adds no news guard at all: the “no releases in the window” statement lives in the setup row where the window can be named', (clean.guards || []).filter((g) => /news window|stand down|FOMC/i.test(g.text || '')).length === 0, clean.guards);
  const M = require(path.join(H.APP, 'src/market'));
  H.calendarSpec(null);
  const dead = await M.getCalendar();
  const outage = await B.newsCheck('EURUSD', pair);
  const outageGuard = Now.build({ ...nowIn, news: outage });
  ok('an M111 outage reaches this consumer as silence: no guard, no unavailable flag and no error on the payload — the failure is visible only at the market layer, which is exactly the gap M111 measures', dead.ok === false && outageGuard.guards.filter((g) => /news window|stand down/i.test(g.text || '')).length === 0 && outage.windows.unavailable === undefined && !('error' in outage), { feed: dead.ok, keys: Object.keys(outage), guards: outageGuard.guards.length });
  H.calendarSpec([{ offset_min: 20, currency: 'USD', title: 'NFP' }]);
  const ahead = await B.newsCheck('EURUSD', pair);
  const aheadGuard = Now.build({ ...nowIn, news: ahead, nowMs: Date.now() });
  ok('a release whose block has not started yet (20 minutes out, 5-minute block) produces no guard, and the payload says why', aheadGuard.guards.filter((g) => /NFP/.test(g.text || '')).length === 0 && ahead.events.length === 0 && ahead.upcoming.some((e) => e.title === 'NFP'), ahead.upcoming);

  /* -------------------------------------------------- consumer 2: the setup model */
  const base = { price: win[win.length - 1].c, atr: smc.atr, entrySeries: { smc, price: win[win.length - 1].c, atr: smc.atr, ind: smc.ind }, indicators: smc.ind, balance: 10000, riskPct: 0.5, maxRiskPct: 1, valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 1 };
  const blacked = Setup.buildSetups(smc, { ...base, newsBlackout: dark.blackout, newsNote: N.detail(pair) });
  const payloadField = (r) => (((r || {}).filters) || {}).news_blackout;
  ok('the setup payload emits `news_blackout` inside its filters block, which is where a downstream alert reads the rule from', 'news_blackout' in ((blacked.filters) || {}), Object.keys(blacked.filters || {}));
  ok('with a blackout the setup payload carries it, and with none it is null rather than an empty string or a false', payloadField(blacked) === dark.blackout && payloadField(Setup.buildSetups(smc, base)) === null, { with: payloadField(blacked), without: payloadField(Setup.buildSetups(smc, base)) });
  const rowWeight = ((blacked.candidates || [])[0] || {}).checks.find((c) => c.key === 'news');
  ok('the news check keeps its recorded weight and label: this milestone split a window, it did not retune the grade', rowWeight.weight === 10 && rowWeight.label === 'No high-impact news in the window' && rowWeight.pass === false, rowWeight);

  /* ------------------------------------------- consumer 3: the M109 advisory channel */
  const ask = await u.req('/ask', { question: 'Is there high-impact news on the calendar today?' });
  const answered = ask.data && ask.data.answer && ask.data.answer[0];
  ok('the advisory channel answers its calendar surface, and says it cannot fetch rather than inventing a window', ask.status === 200 && ask.data.topic === 'calendar_state' && answered.kind === 'unavailable' && !/\b(15|45|30|60)\s*min/i.test(answered.text), { topic: ask.data && ask.data.topic, answer: answered });
  ok('that answer names the surface it cannot read and cites where the fact comes from, so the silence is attributable rather than a quiet market', /economic calendar\/news window is fetched live and is not stored/.test(answered.text) && /calendar/i.test(answered.source) && /unknown is not a pass/.test(answered.text), answered);
  ok('and the channel’s own source declares it cannot fetch, so a later calendar change cannot quietly turn it into a news oracle', /this channel cannot fetch/.test(bodies.get('src/ask.js')) && !/NewsWindow|newsCheck/.test(bodies.get('src/ask.js')));

  /* ------------------------------------------------------- per-side, per desk */
  const deskRow = (await u.req('/accounts', undefined, 'GET')).data.accounts.find((x) => x.id === desk.id);
  H.calendarSpec([{ offset_min: -3, currency: 'USD', title: 'Just printed' }]);
  const mine = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  const theirs = await u.req('/bots/news/EURUSD', undefined, 'GET');
  ok('the same calendar blocks this desk (5-minute block, 45 settle) and its different pair is reported per account, not once globally', mine.data.events.length === 1 && mine.data.windows.before_min === deskRow.news_block_before_min && theirs.data.windows.before_min === 15, { mine: mine.data.windows, theirs: theirs.data.windows });
  ok('the blackout string a consumer quotes names THIS desk’s two numbers, so one trader’s guard can never describe another’s window', /5 min before \/ 45 min after/.test(mine.data.blackout) && mine.data.blackout === payloadField(Setup.buildSetups(smc, { ...base, newsBlackout: mine.data.blackout })), mine.data.blackout);
});
