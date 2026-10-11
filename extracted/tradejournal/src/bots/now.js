'use strict';
/**
 * now.js — "what do I do at this moment?"
 *
 * The rest of the bots answer *what the market is doing*. This module answers the
 * only question a trader actually acts on, and it answers exactly one thing:
 *
 *   · one action   — WAIT / BUY / SELL / NO TRADE / RE-CHECK
 *   · on what      — the one level and the one condition that changes the answer
 *   · with what    — entry, stop, target and R:R when the method has armed a plan
 *   · until when   — the next checkpoint (bar close / killzone), so "wait" has a clock
 *   · how fresh    — the bar the read comes from, its age, and how far price has moved since
 *
 * Two things it deliberately kills:
 *   1. **Both sides on screen.** A method that says "buy" and "sell" at the same
 *      time is not a method. There is one permitted side; the other one is named
 *      and labelled *blocked*, with the reason, and never priced.
 *   2. **A read with no date on it.** Every analysis says which bar it was made
 *      on, how old that bar is, and — in replay — what happened afterwards.
 *
 * Inputs are the objects the API already builds; this file adds no new data feeds.
 */

const SMC = require('./smc');
const EntryPreference = require('./entry-preference');
const Setup = require('./setup');   // M39: one clock, one list of windows
const MS = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const TF_MS = { '1m': MS.m, '5m': 5 * MS.m, '15m': 15 * MS.m, '30m': 30 * MS.m, '1h': MS.h, '4h': 4 * MS.h, '1d': MS.d, '1w': MS.w };

const HOUR = MS.h;
const fmtTime = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');
const mins = (ms) => Math.round(ms / 60000);

/** The next bar boundary after `ms` for this timeframe (aligned to the UTC clock). */
function nextBarClose(ms, tf) {
  const span = TF_MS[tf] || MS.h;
  if (span >= MS.w) return Math.ceil(ms / MS.w) * MS.w;
  if (span >= MS.d) return Math.ceil(ms / MS.d) * MS.d;
  return Math.ceil(ms / span) * span;
}

/**
 * Killzones, same clock the SMC module uses (UTC). Used for the checkpoint and
 * for the "you are outside the window" note — never as a reason to trade.
 */
/* M39: this table used to be a second copy of the killzone hours, hardcoded in UTC and
 * commented "same clock the SMC module uses (UTC)". That stopped being true when M5 moved
 * SILVER_BULLETS to New York time: this copy named a "New York PM" window at 15:00-18:00 UTC
 * that the engine no longer has, put Asia at 00:00-06:00 UTC instead of 20:00-24:00 ET, and
 * had no London close at all — so the Now view and the engine disagreed by an hour for half
 * the year and by a whole window always. Both functions now ask the engine, so there is one
 * clock and one list of windows. */
const slug = (name) => String(name || '').toLowerCase().replace(/ killzone$/, '').replace(/[^a-z0-9]+/g, '_');
const shortLabel = (name) => String(name || '').replace(/ killzone$/, '');
function killzoneAt(ms) {
  const st = SMC.sessionState(new Date(ms));
  const b = (st.bullets || []).find((x) => x.active);
  if (!b) return null;
  return { key: slug(b.name), label: shortLabel(b.name), name: b.name, quality: b.quality, window: b.window, note: b.note || null };
}
function nextKillzone(ms) {
  const st = SMC.sessionState(new Date(ms));
  const open = (st.bullets || []).filter((x) => x.minutes_to_start > 0)
    .sort((x, y) => x.minutes_to_start - y.minutes_to_start);
  const b = open[0] || (st.bullets || [])[0];
  if (!b) return null;
  const mins = b.minutes_to_start > 0 ? b.minutes_to_start : 1440;
  return { key: slug(b.name), label: shortLabel(b.name), name: b.name, quality: b.quality,
    // M129 — countdowns are whole minutes; don't carry the request's seconds into
    // a window that starts on the minute. They already include any DST offset change.
    window: b.window, note: b.note || null, at: Math.floor(ms / 60000) * 60000 + mins * 60000 };
}

const num = (v) => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

/**
 * @param {object} p
 * @param {object} p.td          topdown.build() output (the method's read)
 * @param {object} p.setups      Setup.buildSetups() output
 * @param {object} p.series      the trading-timeframe series (candles, smc, price, atr)
 * @param {object} [p.quote]     live quote { price, at|t, provider }
 * @param {object} [p.news]      newsCheck() output
 * @param {object} [p.daily]     personal guardrail state
 * @param {object} [p.replay]    { trim, since: {price, atr, verdict} } when re-reading an older bar
 * @param {string} p.symbol
 * @param {string} p.tf
 * @param {number} [p.nowMs]     evaluation instant (defaults to now; fixed in tests)
 */
function build(p = {}) {
  const { td = {}, setups = {}, series = {}, quote = null, news = null, daily = null, replay = null } = p;
  const minRR = Number(p.minRR) > 0 ? Number(p.minRR) : 1;   // opt-in floor, default 1R
  const symbol = String(p.symbol || '').toUpperCase();
  const tf = String(p.tf || '15m');
  const nowMs = Number(p.nowMs) || Date.now();
  const atr = num(series.atr) || num(series.smc && series.smc.atr) || 0;
  const candles = series.candles || [];
  const lastClosed = candles.length ? candles[candles.length - 1] : null;

  /* ---------------------------------------------------------- freshness --- */
  const barMs = TF_MS[tf] || MS.h;
  const ageMin = lastClosed ? mins(nowMs - lastClosed.t) : null;
  const livePrice = num(quote && quote.price) || num(series.price);
  const closeOfBar = lastClosed ? num(lastClosed.c) : null;
  const drift = (livePrice !== null && closeOfBar !== null && atr) ? (livePrice - closeOfBar) / atr : null;

  let freshness = { state: 'unknown', bar_age_min: ageMin, bars_expected: 1, note: 'no candles for this market.' };
  if (lastClosed) {
    const late = ageMin !== null && ageMin > (barMs / 60000) * 2.5;
    const weekend = ageMin !== null && ageMin > 36 * 60;
    const driftTxt = drift === null ? '' : ` price has moved ${Math.abs(drift).toFixed(2)} ATR since that close.`;
    if (replay) {
      freshness = {
        state: 'replay', bar_age_min: ageMin,
        note: `This is a re-read of the bar that closed ${fmtTime(lastClosed.t)} — the market has traded on since.`,
      };
    } else if (weekend) {
      freshness = { state: 'market-closed', bar_age_min: ageMin, note: `Last candle ${fmtTime(lastClosed.t)} (${ageMin} min old) — the market looks closed, so the read cannot change until it reopens.` };
    } else if (late) {
      freshness = { state: 'stale', bar_age_min: ageMin, note: `Last candle closed ${ageMin} min ago — slower than a ${tf} bar by a wide margin. Check the data feed before trusting the levels.` };
    } else if (drift !== null && Math.abs(drift) > 0.5) {
      freshness = { state: 'aging', bar_age_min: ageMin, note: `Read is from the ${tf} bar closed ${fmtTime(lastClosed.t)}.${driftTxt} That is more than half an ATR, so the entry may already be gone.` };
    } else {
      freshness = { state: 'fresh', bar_age_min: ageMin, note: `Read is from the ${tf} bar closed ${fmtTime(lastClosed.t)} (${Math.max(1, mins(nowMs - lastClosed.t))} min ago).${driftTxt}` };
    }
  }

  /* ------------------------------------------------------- the one call --- */
  const direction = num(td.direction) || 0;
  const blocked = !!td.blocked;
  const plan = td.crt_plan || null;
  const bias = (td.layers && td.layers.bias) || {};
  const state = bias.state || td.status || 'unknown';

  // the candidate the method permits (same side); everything else is named, not priced
  const cands = (setups.candidates || []);
  const allowed = direction ? cands.find((c) => c.dir === direction) : null;
  const otherDir = direction ? cands.find((c) => c.dir === -direction) : null;
  const conviction = td.conviction || null;
  const convictionTier = conviction && conviction.tier ? conviction.tier : null;
  const confirmed = convictionTier === 'A';
  const fullRisk = confirmed && Setup.methodRiskMult(td, direction) === 1;
  const entryTf = allowed && (allowed.entry_tf || allowed.levels && allowed.levels.entry_tf)
    || td.entry_setup && td.entry_setup.entry_tf || td.entry_preference && td.entry_preference.entry_tf || tf;
  let entryPreference = (allowed && EntryPreference.scope(allowed.entry_preference
      || allowed.levels && allowed.levels.entry_preference, entryTf, nowMs, direction))
    || EntryPreference.scope(td.entry_preference, entryTf, nowMs, direction)
    || EntryPreference.read({ dir: direction, series, tf: entryTf, observedAt: nowMs });

  const pendingStep = (td.steps || []).find((s) => !s.done) || null;
  const doneSteps = (td.steps || []).filter((s) => s.done).length;

  let action = 'WAIT';
  let side = 0;
  let headline = '';
  let watch = null;
  let order = null;
  let invalidate = '';

  if (blocked) {
    const block = (td.conflicts || []).find((c) => c.blocks_trade) || null;
    action = /chase/i.test(block ? block.kind : '') ? 'WAIT' : 'NO TRADE';
    headline = `${symbol} ${tf}: do not trade this right now. ${td.headline || ''}`.trim();
    if (block) headline += ` ${block.resolution}`;
    if (td.countertrend) {
      const poi = td.countertrend.point_of_interest;
      watch = { level: poi.entry, kind: 'zone', condition: 'touch the MTF POI, then obtain a fresh LTF sweep and structural shift',
        text: td.countertrend.completed ? 'The bounded pullback is complete; wait for a new narrative.' : `Watch ${poi.bottom}–${poi.top}; a lower-timeframe read is not permission to skip the MTF location.` };
    } else if (bias.range) {
      watch = {
        level: side ? bias.range.low : null, kind: 'level',
        condition: 'wait for a fresh right candle at the range edge, then a sweep that closes back inside',
        text: `Nothing to do until ${bias.tf || 'the higher timeframe'} prints a new right candle and one side of ${bias.range.low} – ${bias.range.high} is swept and reclaimed.`,
      };
    }
    invalidate = 'This is not a bearish or bullish opinion — it is the absence of a qualifying setup. It stops applying when a new right candle forms at a level that matters.';
  } else if (direction && allowed && allowed.ok === false) {
    // M127 — the visible order must obey the same-side candidate's execution vetoes.
    // `allowed` used to be computed and never read: a CRT plan could arm an order after
    // the setup engine refused the session, phase, shift or RR. Unknown/missing setup
    // data is not a refusal; only the explicit false is. The scenario remains in td.
    action = 'NO TRADE';
    const reasons = Array.isArray(allowed.no_trade) ? allowed.no_trade : [];
    headline = `${symbol} ${tf}: no trade — ${reasons.join(' ') || allowed.action || 'the setup is not tradeable.'}`;
    const zone = allowed.levels && allowed.levels.entry_zone;
    if (zone && allowed.levels.entry_status === 'waiting') {
      watch = { level: num(zone[direction > 0 ? 1 : 0]), kind: 'zone',
        condition: 'wait for the retrace, then re-check every entry condition',
        text: `Watch for the retrace to ${zone[0]} – ${zone[1]}; reaching it is a reason to re-check, not permission to enter.` };
    }
    invalidate = 'Nothing is armed. Re-run the analysis when the blocking condition changes.';
  } else if (direction && allowed && allowed.ok && allowed.levels
      && ['flip', 'market_shift'].includes(allowed.entry_model)) {
    // M68: the causal LTF candidate, not a parallel CRT safer/aggressive scenario,
    // is the ONLY entry/stop authority. Keep the pre-existing method target/risk.
    const lv = allowed.levels, target = lv.targets[0];
    side = direction; action = direction > 0 ? 'BUY' : 'SELL';
    order = { side: direction > 0 ? 'long' : 'short', type: 'limit at the confirmed lower zone',
      entry: lv.entry, stop: lv.stop, target: target.price, rr: target.rr,
      target_tf: lv.target_tf || target.source_tf || target.tf || null,
      target_kind: target.kind, target_policy: lv.target_policy || null,
      stop_tf: lv.stop_tf, stop_kind: lv.stop_policy && lv.stop_policy.kind, stop_policy: lv.stop_policy || null,
      entry_model: allowed.entry_model, entry_tf: allowed.entry_tf, entry_evidence: allowed.entry_evidence,
      mode: td.countertrend ? 'countertrend-pullback' : 'named-entry',
      risk_pct: allowed.risk ? allowed.risk.risk_pct : null,
      size_note: td.countertrend ? 'Counter-HTF pullback: at most half ordinary same-grade risk.' : 'Use the actual candidate risk plan; model name is not a sizing override.',
      rr_warning: null };
    headline = `${symbol}: ${allowed.entry_tf} ${allowed.entry_model} entry at ${lv.entry}, after the causal zone pullback.`
      + (td.countertrend ? ` Bounded internal pullback; the HTF narrative is still ${td.countertrend.htf_bias > 0 ? 'bullish' : 'bearish'}.` : ` HTF decides direction; the ${lv.target_tf || 'entry-aligned'} magnet defines the exit.`);
    watch = { level: lv.entry, kind: 'entry', condition: 'causal lower zone and sweep extreme must still hold',
      text: `Limit ${lv.entry}, stop ${lv.stop}, target ${target.price} (${target.rr}R).` };
    invalidate = lv.invalidation;
  } else if (direction && td.countertrend && allowed && allowed.ok && allowed.levels) {
    // M33: one authority for prices — the actual eligible setup owns the stop and
    // its SINGLE HTF-zone target. Never re-price it from a parallel CRT scenario.
    const lv = allowed.levels, target = lv.targets[0];
    side = direction;
    action = direction > 0 ? 'BUY' : 'SELL';
    order = { side: direction > 0 ? 'long' : 'short', type: 'limit at the confirmed point of interest',
      entry: lv.entry, stop: lv.stop, target: target.price, rr: target.rr,
      target_tf: lv.target_tf || target.source_tf || target.tf || null,
      target_kind: target.kind, target_policy: lv.target_policy || null,
      stop_tf: lv.stop_tf, stop_kind: lv.stop_policy && lv.stop_policy.kind, stop_policy: lv.stop_policy || null,
      mode: 'countertrend-pullback', risk_pct: allowed.risk ? allowed.risk.risk_pct : null,
      size_note: 'Counter-HTF pullback: at most half ordinary same-grade risk; the daily narrative stays intact.',
      rr_warning: null };
    headline = `${symbol} ${tf}: ${direction > 0 ? 'long' : 'short'} internal pullback is armed at reduced risk, only to ${td.countertrend.target.label}. The HTF narrative is still ${td.countertrend.htf_bias > 0 ? 'bullish' : 'bearish'}.`;
    watch = { level: lv.entry, kind: 'entry', condition: 'the confirmed POI and counter-leg stop must still hold',
      text: `Limit ${lv.entry}, stop ${lv.stop}, ONE target ${target.price} (${target.rr}R). No farther runner.` };
    invalidate = `${td.countertrend.ltf_tf} close beyond the counter-leg stop voids this execution, not the held daily bias. ${lv.invalidation}`;
  } else if (direction && plan && allowed && allowed.ok && allowed.levels
      && allowed.levels.target_policy && allowed.levels.target_policy.rule === 'entry_or_one_above') {
    // M77: ordinary CRT's HTF range is narrative, not a parallel executable order.
    // The SAME final candidate owns entry, stop, target, RR and actual risk in every consumer.
    const lv = allowed.levels, target = lv.targets[0];
    side = direction; action = direction > 0 ? 'BUY' : 'SELL';
    order = { side: direction > 0 ? 'long' : 'short', type: 'limit at the eligible entry zone',
      entry: lv.entry, stop: lv.stop, target: target.price, rr: target.rr,
      entry_tf: lv.entry_tf, target_tf: lv.target_tf, target_kind: target.kind, target_policy: lv.target_policy,
      stop_tf: lv.stop_tf, stop_kind: lv.stop_policy && lv.stop_policy.kind, stop_policy: lv.stop_policy || null,
      mode: 'entry-aligned', risk_pct: allowed.risk ? allowed.risk.risk_pct : null,
      size_note: Setup.methodRiskMult(td, direction) < 1
        ? 'Counter-HTF CRT rotation: at most half ordinary same-grade risk.'
        : 'Use the actual candidate risk plan; the HTF projection is not an alternative exit.', rr_warning: null };
    headline = `${symbol}: ${direction > 0 ? 'long' : 'short'} at ${lv.entry}; ONE ${lv.target_tf} opposing magnet at ${target.price} (${target.rr}R).`;
    watch = { level: lv.entry, kind: 'entry', condition: 'the entry zone and defining stop must still hold',
      text: `Limit ${lv.entry}, stop ${lv.stop}, target ${target.price}. Do not substitute the HTF projected range edge.` };
    invalidate = lv.invalidation;
  } else if (direction && plan) {
    side = direction;
    action = direction > 0 ? 'BUY' : 'SELL';
    entryPreference = { ...entryPreference, execution: 'crt_scenario' };
    const ag = plan.aggressive || {};
    const selection = EntryPreference.choose(plan, entryPreference);
    const chosen = selection.scenario || {}; // M78: structure, never conviction/risk
    order = {
      side: direction > 0 ? 'long' : 'short',
      type: selection.variant === 'aggressive' ? 'stop-limit at the confirmation' : 'limit on the swept-edge retest',
      entry: num(chosen.entry), stop: num(chosen.stop), target: num(chosen.target),
      rr: num(chosen.rr), alt_entry: num(ag.entry), alt_target: num(ag.target), alt_rr: num(ag.rr),
      size_note: Setup.methodRiskMult(td, direction) < 1
        ? 'Counter-HTF rotation: at most half ordinary same-grade risk, even with lower-timeframe confirmation.'
        : fullRisk ? 'Full risk: the method is confirmed and the lower timeframe has confirmed it too.'
          : 'Half risk: lower-timeframe confirmation is not in yet. Sizing does not choose the entry variant.',
      mode: selection.field,
      // the trader asked for these to be shown rather than hidden — but never silently
      rr_warning: (Number(num(chosen.rr)) > 0 && Number(num(chosen.rr)) < minRR)
        ? `Below your ${minRR}R minimum — this pays ${num(chosen.rr)}R. The range is real; the reward does not pay for the risk. Treat it as a scenario, not an order.`
        : null,
    };
    headline = `${symbol} ${tf}: ${direction > 0 ? 'long' : 'short'} is armed — ${fullRisk ? 'full size' : 'half size'} (conviction ${convictionTier || 'B'}). Wait for the entry to be reached; do not buy the market here.`;
    watch = {
      level: num(chosen.entry), kind: 'entry',
      condition: `price must trade into ${num(chosen.entry)} with the range ${plan.range ? `${num(plan.range.low)} – ${num(plan.range.high)}` : ''} still holding`,
      text: `Order sits at ${num(chosen.entry)} (${selection.variant === 'aggressive' ? 'the confirmation' : 'the retest of the swept edge'}). Stop ${num(chosen.stop)}, target ${num(chosen.target)} (${num(chosen.rr)}R).`,
    };
    invalidate = plan.invalidation || `If price closes back through ${num(chosen.stop)} the read is wrong — take the loss, do not average.`;
    if (plan.lopsided) {
      action = 'WAIT';
      headline = `${symbol} ${tf}: the range and the sweep do not belong together — the stop sits ${plan.risk_over_range} ranges away from the entry. Wait for the range that this sweep was actually made for.`;
      order = null;
    } else if (plan.thin_sweep) {
      action = 'WAIT';
      headline = `${symbol} ${tf}: the sweep is too thin to trade — ${plan.wick_atr} ATR deep. Wait for a clean sweep of the level, not a scratch past it.`;
      order = null;
    } else if (plan.sub_noise) {
      // a stop sitting on the entry is not a plan — never arm it
      action = 'WAIT';
      headline = `${symbol} ${tf}: the sweep is too small to risk money against — the stop would sit on the entry. Wait for a wider right candle.`;
      order = null;
    } else if (chosen.chase || plan.chase) {
      action = 'WAIT';
      headline = `${symbol} ${tf}: the ${direction > 0 ? 'long' : 'short'} idea is real but the easy part of the range is gone — wait for the next right candle rather than chasing this one.`;
      order = null;
    } else if (plan.projection_only) {
      action = 'WAIT'; side = 0; order = null;
      headline = `${symbol} ${tf}: CRT ${selection.variant} preference is a projection only — no eligible candidate order. ${entryPreference.reason}`;
      watch.condition = 'obtain an eligible causal entry candidate; the HTF projection is not permission to enter';
    }
  } else if (direction) {
    action = 'WAIT';
    side = direction;
    const mid = bias.range ? num(bias.range.mid) || num(bias.range.high) : null;
    headline = `${symbol} ${tf}: the bias is ${direction > 0 ? 'long' : 'short'} but nothing is armed yet. ${pendingStep ? `Still missing: ${pendingStep.title}.` : ''}`.trim();
    watch = {
      level: direction > 0 ? num(bias.range && bias.range.low) : num(bias.range && bias.range.high), kind: 'sweep',
      condition: direction > 0 ? 'sweep below the range low, then close back inside' : 'sweep above the range high, then close back inside',
      text: bias.range
        ? `Watch ${direction > 0 ? num(bias.range.low) : num(bias.range.high)} — the side that has to be swept for ${direction > 0 ? 'longs' : 'shorts'} to arm.`
        : 'No qualifying range on the higher timeframe yet, so there is no level to watch.',
    };
    invalidate = 'If the higher timeframe loses its direction, or both sides of the range get taken, this read is void — stand down and wait for the next candle.';
  } else {
    action = 'WAIT';
    headline = `${symbol} ${tf}: no directional read. ${td.headline || 'The higher timeframe has not decided which side of the range it wants.'}`;
    // a marked range with no direction still gives the trader something to watch:
    // the side that gets swept is what decides the direction later
    if (bias.range) {
      watch = {
        level: null, kind: 'range',
        low: num(bias.range.low), high: num(bias.range.high),
        condition: 'whichever side of the range is swept and closes back inside decides the direction — trade the side that fails to hold',
        text: `Both edges are live: ${num(bias.range.low)} below, ${num(bias.range.high)} above. There is no trade until one of them is swept and reclaimed.`,
      };
    } else {
      watch = { level: null, kind: 'none', condition: 'no qualifying range on the higher timeframe yet', text: 'Nothing to watch until a right candle forms at a level that matters.' };
    }
    invalidate = 'Nothing to invalidate — there is no read yet. A sweep that closes back inside the range creates one.';
  }

  if (order) {
    order.entry_variant = entryPreference.variant;
    order.entry_preference = entryPreference;
  }

  /* ------------------------------------------------- the other side ------- */
  let otherSide = null;
  // A refused call has side=0: there is no permitted side to contrast with. Its
  // scenarios stay in setups.candidates rather than implying a live opposite trade.
  if (side && otherDir) {
    otherSide = {
      dir: -direction,
      side: otherDir.side,
      grade: otherDir.grade,
      score: otherDir.score,
      blocked_by: (td.conflicts || []).find((c) => c.blocks_trade) || null,
      text: `The ${otherDir.side} setup scored ${otherDir.score}/100 on the entry model, and it is still not armed: the higher timeframe decides direction and the lower timeframe only times the entry, so a good grade on the wrong side stays a scenario. It becomes live if the ${bias.tf || 'higher timeframe'} read flips — not before.`,
    };
  }

  /* ------------------------------------------------------- checkpoint ----- */
  const nextBar = nextBarClose(nowMs, tf);
  const kzNow = killzoneAt(nowMs);
  const kzNext = nextKillzone(nowMs);
  let checkpoint = {
    at: new Date(nextBar).toISOString(),
    label: `next ${tf} close · ${fmtTime(nextBar)}`,
    text: `Re-check on the ${tf} close at ${fmtTime(nextBar)}.`,
  };
  if (action === 'BUY' || action === 'SELL') {
    checkpoint = {
      at: new Date(nextBar).toISOString(),
      label: `order live until ${fmtTime(nextBar)} · ${tf} close`,
      text: `The order stays valid while the range holds. Re-check at the ${tf} close (${fmtTime(nextBar)}); if it has not filled by then, re-read the range.`,
    };
  } else if (kzNow) {
    checkpoint = {
      at: new Date(nextBar).toISOString(),
      label: `${kzNow.label} killzone · next ${tf} close ${fmtTime(nextBar)}`,
      text: `You are inside the ${kzNow.label} window and nothing is armed — that is a real answer, not a reason to force a trade. Next ${tf} close ${fmtTime(nextBar)}.`,
    };
  } else {
    checkpoint = {
      at: new Date(kzNext.at).toISOString(),
      label: `${kzNext.label} killzone opens ${fmtTime(kzNext.at)}`,
      text: `Nothing is armed and no killzone is open. The next window where a setup is even allowed is ${kzNext.label} at ${fmtTime(kzNext.at)}.`,
    };
  }

  /* ---------------------------------------------------------- guards ------ */
  const guards = [];
  // the sub-floor warning is rendered as its own red block under the order — it is
  // not repeated in the guard list (measured in the browser: both printed)
  if (news && news.blackout) guards.push({ level: 'block', text: news.blackout });
  if (daily && daily.status && daily.status !== 'clear') guards.push({ level: 'warn', text: daily.message || String(daily.status) });
  if (freshness.state === 'stale' || freshness.state === 'aging') guards.push({ level: 'warn', text: freshness.note });
  if (!kzNow && !blocked && direction) guards.push({ level: 'info', text: 'Outside every killzone: the playlist only trades the London and New York windows.' });

  /* --------------------------------------------------------- replay ------- */
  let since = null;
  if (replay && replay.since) {
    const s = replay.since;
    const delta = (s.price !== null && livePrice !== null && atr) ? (livePrice - s.price) / atr : null;
    since = {
      bars_later: replay.trim,
      price_then: num(s.price), price_now: num(livePrice),
      delta_atr: delta === null ? null : Number(delta.toFixed(2)),
      verdict_then: s.verdict || null,
      verdict_now: td.status || null,
      text: `As of that bar the read was "${s.verdict || '—'}". Since then the market moved ${delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(2) + ' ATR'} and the read is now "${td.status || '—'}".`,
    };
  }

  return {
    symbol, timeframe: tf,
    as_of: new Date(nowMs).toISOString(),
    evaluated_on: {
      last_closed_bar: lastClosed ? new Date(lastClosed.t).toISOString() : null,
      last_close: closeOfBar,
      bar_age_min: ageMin,
      candles: candles.length,
      replay: !!replay, trim: replay ? replay.trim : 0,
    },
    live: quote ? { price: num(quote.price), at: quote.at ? new Date(quote.at).toISOString() : null, provider: quote.provider || null, drift_atr: drift === null ? null : Number(drift.toFixed(2)) } : null,
    action, side, headline, entry_preference: entryPreference,
    ...(td.entry_setup ? { entry_model: allowed ? allowed.entry_model || 'none' : 'none', entry_tf: allowed ? allowed.entry_tf : null } : {}),
    armed: !!order,
    order,
    watch,
    checkpoint,
    invalidate,
    freshness,
    guards,
    other_side: otherSide,
    conviction: convictionTier,
    full_risk: fullRisk,
    steps_done: doneSteps,
    steps_total: (td.steps || []).length,
    pending_step: pendingStep ? { n: pendingStep.n, title: pendingStep.title, text: pendingStep.text } : null,
    killzone: kzNow ? (kzNow.name || kzNow.label) : null,
    range: bias.range ? { low: num(bias.range.low), high: num(bias.range.high), mid: num(bias.range.mid) } : null,
    since,
  };
}

module.exports = { build, nextBarClose, killzoneAt, nextKillzone, TF_MS };
