'use strict';
/** M111 consumers probe: what the states DO once they arrive. The setup model must not score an
 * unread calendar as a pass, the playlist must say so instead of staying silent, the read-aloud
 * line must carry it, and the surfaces that never consulted a calendar must stay unchanged and
 * LABELLED (not silently defaulted to either `clear` or `unknown`). */
const path = require('path');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
const SMC = require(path.join(H.APP, 'src/bots/smc'));
const Setup = require(path.join(H.APP, 'src/bots/setup'));
const Now = require(path.join(H.APP, 'src/bots/now'));
function bars() { let p = 1.1, t = Date.UTC(2026, 9, 13, 0, 0); const out = []; for (let i = 0; i < 320; i++) { const o = p, c = o + Math.sin(i / 7) * 0.0009 + ((i % 37 === 0) ? -0.0035 : 0.0004), h = Math.max(o, c) + 0.0004, l = Math.min(o, c) - 0.0004; out.push({ t: t + i * 900e3, o, h, l, c, v: 1000 + i }); p = c; } return out; }
H.finish('M111 consumers: unknown is not a pass, and it is said out loud', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;
  const u = await H.start('m111-consumers');
  const desk = await H.account(u, 'M111 desk');
  const pair = N.plan({ news_block_before_min: 15, news_settle_after_min: 45 });
  const newsRow = (r) => ((r.candidates || [])[0] || {}).checks?.find((c) => c.key === 'news');
  const series = bars(); const win = series.slice(-260);
  const smc = SMC.analyse(win, { tf: '15m', now: win[win.length - 1].t, swingMode: 'bos', nested: true });
  const base = { price: win[win.length - 1].c, atr: smc.atr, entrySeries: { smc, price: win[win.length - 1].c, atr: smc.atr, ind: smc.ind }, indicators: smc.ind, balance: 10000, riskPct: 0.5, maxRiskPct: 1, valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 1 };
  const B = require(path.join(H.APP, 'src/bots'));

  /* -------------------------------------------------- consumer 1: the setup model */
  H.calendarSpec(null);
  const outage = await B.newsCheck('EURUSD', pair);
  const unknownRun = Setup.buildSetups(smc, { ...base, newsBlackout: outage.blackout, newsState: outage.state, newsNote: outage.unavailable_note });
  const row = newsRow(unknownRun);
  ok('the news row FAILS on an unread calendar — the absence of evidence is not scored as evidence of absence', row.pass === false, row);
  ok('and its detail is the engine\'s own UNKNOWN sentence, not the old all-clear wording and not a second wording invented here', row.detail === outage.unavailable_note && /NOT an all-clear/.test(row.detail) && !/No high-impact news in the window\./.test(row.detail), row.detail);
  ok('the row keeps its recorded weight and label, so M111 changed a verdict and not a grade scale', row.weight === 10 && row.label === 'No high-impact news in the window', row);
  ok('the payload states the news STATE beside the blackout, so a downstream alert cannot read a null blackout as clearance', ((unknownRun.filters || {}).news_state) === 'unknown' && ((unknownRun.filters || {}).news_blackout) === null, unknownRun.filters && Object.keys(unknownRun.filters));
  ok('an unknown read does NOT become a veto: the stand-down blocks a KNOWN release, and this is the absence of that information (the veto count is unchanged)', (unknownRun.candidates[0].no_trade || []).length === (Setup.buildSetups(smc, base).candidates[0].no_trade || []).length, { unknown: unknownRun.candidates[0].no_trade, bare: Setup.buildSetups(smc, base).candidates[0].no_trade });

  H.calendarSpec([{ offset_min: 10, currency: 'JPY', title: 'BoJ rate' }]);
  const quiet = await B.newsCheck('EURUSD', pair);
  const clearRun = Setup.buildSetups(smc, { ...base, newsBlackout: null, newsState: quiet.state, newsNote: N.detail(pair) });
  ok('a calendar that WAS read and is quiet still PASSES the row, with the account\'s two windows in the detail', newsRow(clearRun).pass === true && /15 min before and 45 min after/.test(newsRow(clearRun).detail) && ((clearRun.filters || {}).news_state) === 'clear', { row: newsRow(clearRun), state: (clearRun.filters || {}).news_state });

  H.calendarSpec([{ offset_min: 5, currency: 'USD', title: 'CPI' }]);
  const dark = await B.newsCheck('EURUSD', pair);
  const blockedRun = Setup.buildSetups(smc, { ...base, newsBlackout: dark.blackout, newsState: dark.state, newsNote: N.detail(pair) });
  ok('a blocked read FAILS the row with the M110 blackout sentence, and the payload says `blocked`', newsRow(blockedRun).pass === false && newsRow(blockedRun).detail === dark.blackout && ((blockedRun.filters || {}).news_state) === 'blocked', { state: (blockedRun.filters || {}).news_state });
  ok('and it is still a real veto, so M111 did not soften the stand-down while adding a state', (blockedRun.candidates[0].no_trade || []).includes(dark.blackout) && blockedRun.candidates[0].ok === false, { ok: blockedRun.candidates[0].ok, notes: blockedRun.candidates[0].no_trade });

  /* --------------------------- consumers that never consult a calendar are LABELLED, not guessed */
  const bare = Setup.buildSetups(smc, base);
  ok('a caller that consulted no calendar is recorded as `not_consulted` — never mapped onto `clear` and never onto `unknown`', ((bare.filters || {}).news_state) === 'not_consulted', bare.filters && Object.keys(bare.filters));
  ok('and its behaviour is unchanged from before M111: the row still passes with the M110 fallback wording (this fix is about the read that FAILED, not about every surface that does not read)', newsRow(bare).pass === true && /either side of the entry/.test(newsRow(bare).detail) && !/\d+\s*min/.test(newsRow(bare).detail), newsRow(bare).detail);
  ok('the three caller kinds are mutually exclusive in the payload: `clear`, `unknown` and `not_consulted` are three different strings', new Set([(clearRun.filters || {}).news_state, (unknownRun.filters || {}).news_state, (bare.filters || {}).news_state]).size === 3, [(clearRun.filters || {}).news_state, (unknownRun.filters || {}).news_state, (bare.filters || {}).news_state]);

  /* ------------------------------------------------------ consumer 2: the playlist */
  const nowIn = { symbol: 'EURUSD', tf: '15m', nowMs: win[win.length - 1].t, td: {}, setups: {}, daily: null, quote: null, series: { candles: win, atr: smc.atr, price: win[win.length - 1].c, smc }, news: outage };
  const guard = Now.build(nowIn);
  const said = (guard.guards || []).filter((g) => /UNKNOWN/.test(g.text || ''));
  ok('the desk playlist SAYS the calendar could not be read, in the engine\'s own sentence, instead of staying silent', said.length === 1 && said[0].text === outage.unavailable_note, said);
  ok('it is a warning, not a block: an outage does not fabricate a release to stand down for', said[0].level === 'warn', said[0]);
  const darkGuard = Now.build({ ...nowIn, news: dark });
  ok('a real blackout is STILL a block, and the two never appear together', (darkGuard.guards || []).filter((g) => g.level === 'block' && /inside your news window/.test(g.text || '')).length === 1 && (darkGuard.guards || []).filter((g) => /UNKNOWN/.test(g.text || '')).length === 0, darkGuard.guards);
  const clearGuard = Now.build({ ...nowIn, news: quiet });
  ok('and a quiet calendar produces neither, so the warning is not emitted unconditionally', (clearGuard.guards || []).filter((g) => /UNKNOWN|inside your news window/.test(g.text || '')).length === 0, clearGuard.guards);

  /* ------------------------------------------- consumer 3: the read-aloud headline --------
   * The headline is built inside `analyse()`, which needs a market provider this sandbox cannot
   * reach, so it is asserted on the comment-stripped source rather than through a run: the code
   * that decides the sentence and the machine-readable flag is read here, and the same STATE is
   * exercised behaviourally through the playlist (`Now.build`) and the setup model above. */
  const engineSrc = require('fs').readFileSync(path.join(H.APP, 'src/bots/index.js'), 'utf8');
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\n])\/\/[^\n]*$/gm, '$1');
  const live = code(engineSrc);
  ok('the read-aloud line has a branch for the unread calendar, so a trader who only hears the headline is not told the calendar was consulted', /else if \(news\.state === NewsWindow\.STATES\.UNKNOWN\) parts\.push\(`NEWS UNKNOWN: \$\{news\.unavailable_note\}`\)/.test(live), 'headline branch');
  ok('the headline\u2019s machine-readable news flag is derived from the STATE, not from the absence of a blackout string', /news: news\.state !== NewsWindow\.STATES\.BLOCKED && news\.state !== NewsWindow\.STATES\.UNKNOWN,/.test(live) && !/news: !news\.blackout,/.test(live), 'flag');
  ok('the blocked branch is untouched, so M111 added a case rather than replacing the blackout rendering', /if \(news\.blackout\) parts\.push\(`NEWS BLACKOUT: \$\{news\.blackout\}`\);/.test(live), 'blackout branch');

  /* --------------------------------------- consumer 4: the advisory channel is untouched */
  const ask = await u.req('/ask', { question: 'Is there high-impact news on the calendar today?' });
  ok('the advisory channel still answers `unavailable` from its own surface and was not turned into a news oracle by this fix', ask.status === 200 && ask.data.topic === 'calendar_state' && ask.data.answer[0].kind === 'unavailable' && /unknown is not a pass/.test(ask.data.answer[0].text), ask.data && ask.data.answer);
});
