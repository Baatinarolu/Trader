'use strict';
/** M110 pure probe: the owner module's policy, parser, clamp-on-read and the asymmetric test.
 * No server, no HTTP, no calendar — arithmetic and contracts only. */
const H = require('./m110-test-support'), { ok, finish } = H, path = require('path');
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control
const NEWS_SRC = require('fs').readFileSync(path.join(H.APP, 'src/bots/index.js'), 'utf8');
/** Comments quote the OLD code on purpose (the finding is in the comment header), so the
 * structural assertions below run against code only — a quoted example is not a live test. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\n])\/\/[^\n]*$/gm, '$1');

finish('M110 module: two clocks, bounds, refusal of the single knob, clamp on read, asymmetry', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const WINDOW_SRC = require('fs').readFileSync(path.join(H.APP, 'src/news-window.js'), 'utf8');
  const policy = N.policy();
  ok('the policy names TWO settings with distinct bounds and says a single knob does not exist', policy.before.field === 'news_block_before_min' && policy.after.field === 'news_settle_after_min' && policy.single_knob === false, policy);
  ok('the pre-release default is 15 and the post-release default is 45', policy.before.default === 15 && policy.after.default === 45, policy);
  ok('the settle floor is 30 minutes and the block floor is 1', policy.after.min === 30 && policy.before.min === 1, policy);
  ok('the recommendation is labelled a recommendation, not a floor, for the block', policy.before.recommended_min === 15 && policy.after.recommended_min === 30 && policy.after.recommended_max === 60, policy);
  ok('the doctrine is quoted (15 default, "at least 15", the 30–60 settle, the 5/10/30/60 options)', /15 minutes before and after/.test(N.DOCTRINE.pre) && /at least/.test(N.DOCTRINE.at_least) && /30 minutes to 60 minutes/.test(N.DOCTRINE.settle) && /5 minutes, 10 minutes/.test(N.DOCTRINE.options), N.DOCTRINE);
  ok('the basis states the two clocks, labels the numbers as recommendations and names the one enforced floor', /two clocks/.test(N.BASIS) && /recommendation/i.test(N.BASIS) && /floor/.test(N.BASIS), N.BASIS.slice(0, 120));
  ok('the module exports no write path at all', !Object.keys(N).some((k) => /save|insert|update|write|delete/i.test(k)), Object.keys(N));

  /* ---------------------------------------------------------------- parsing */
  const pair = N.parsePair({ news_block_before_min: 60, news_settle_after_min: 30 });
  ok('both settings are accepted at their bounds (block 60, settle 30)', pair.before_min === 60 && pair.after_min === 30, pair);
  ok('the values he demonstrates are all storable: 5, 10, 15, 30, 60', [5, 10, 15, 30, 60].every((v) => N.parsePair({ news_block_before_min: v }).before_min === v && [30, 60].every((w) => N.parsePair({ news_settle_after_min: w }).after_min === w)), 'set');
  const refused = (body, code) => { try { N.parsePair(body); return { ok: false }; } catch (e) { return { ok: true, code: e.code, status: e.status, message: e.message }; } };
  const belowFloor = refused({ news_settle_after_min: 29 }, 'news_settle_below_floor');
  ok('a settle below the 30-minute floor is REFUSED, not silently stored, and says why', belowFloor.ok && belowFloor.code === 'news_settle_below_floor' && belowFloor.status === 400 && /30 minutes to 60 minutes/.test(belowFloor.message), belowFloor);
  ok('the refusal message says the two sides are separate, so shortening one cannot shorten the other', /separate setting/.test(belowFloor.message), belowFloor.message);
  ok('the old single knob is REFUSED with its own code rather than split for the caller', ['window_min', 'newsWindowMin'].every((k) => { const r = refused({ [k]: 5 }); return r.ok && r.code === 'news_window_split_required'; }), 'both aliases');
  ok('hostile shapes are refused: true, arrays, objects, blanks, 1.5, 0, 241, 1e9', [true, [], {}, ' ', 1.5, 0, 241, 1e9, -5, 'abc'].every((v) => refused({ news_block_before_min: v }).ok && refused({ news_settle_after_min: v }).ok), 'shapes');
  ok('a string integer is accepted as that integer, the way the app already reads numeric settings', N.parsePair({ news_block_before_min: '45', news_settle_after_min: '45' }).before_min === 45, 'string');
  const warned = N.parsePair({ news_block_before_min: 5 });
  ok('a block below 15 is stored WITH a named warning quoting his recommendation', warned.before_min === 5 && warned.warnings.length === 1 && warned.warnings[0].code === 'news_block_before_below_recommended' && /at least put it at 15 minutes/.test(warned.warnings[0].message), warned);
  ok('that warning does not touch the settle: the other side is unchanged by it', warned.after_min === 45, warned);

  /* ---------------------------------------------------------- clamp on read */
  const clamped = N.plan({ news_block_before_min: 0, news_settle_after_min: 5 });
  ok('a row stored below the settle floor is CLAMPED UP to 30 on read, never used as stored', clamped.after_min === 30, clamped);
  ok('a row stored below the block minimum is clamped to 1 and both clamps are reported by field', clamped.before_min === 1 && clamped.clamped.map((c) => c.field).sort().join(',') === 'news_block_before_min,news_settle_after_min', clamped.clamped);
  ok('each clamp names the stored value, the value used and the reason', clamped.clamped.every((c) => c.from !== undefined && c.to !== undefined && /bounded/.test(c.because)), clamped.clamped);
  const legacy = N.plan({});
  ok('a missing/legacy row falls back to the episode defaults 15/45 and says so in its sources', legacy.before_min === 15 && legacy.after_min === 45 && legacy.source.join(',') === 'news_block_before_min:default,news_settle_after_min:default', legacy.source);
  const junk = N.plan({ news_block_before_min: 'abc', news_settle_after_min: null });
  ok('an unreadable stored value falls back to the default and is reported as a clamp, not guessed', junk.before_min === 15 && junk.after_min === 45 && junk.clamped.length === 1 && junk.clamped[0].field === 'news_block_before_min', junk);
  const high = N.plan({ news_block_before_min: 999, news_settle_after_min: 999 });
  ok('a stored value above the maximum is clamped down to 240 on both sides', high.before_min === 240 && high.after_min === 240, high);
  const research = N.plan({ news_block_before_min: 15, news_settle_after_min: 45 }, { newsWindow: { before_min: 90, after_min: 90 } });
  ok('a per-request research pair is honoured only inside the same bounds', research.before_min === 90 && research.after_min === 90 && (() => { try { N.plan({}, { newsWindow: { after_min: 5 } }); return false; } catch (e) { return e.code === 'news_settle_below_floor'; } })(), research);

  /* ------------------------------------------------------------- asymmetry */
  const now = Date.UTC(2026, 9, 13, 12), p1545 = N.plan({ news_block_before_min: 15, news_settle_after_min: 45 });
  const hit = (offsetMin, plan) => N.hit(now + offsetMin * 60000, now, plan || p1545);
  const rows = [-100, -46, -45, -44, -30, -1, 0, 1, 15, 16, 40, 100].map((m) => [m, hit(m)]);
  ok('a release 46–100 minutes in the past is CLEAR (outside the 45-minute settle)', rows.filter(([m, h]) => m <= -46 && h === null).length === 2, rows);
  ok('a release 1–45 minutes in the past is BLOCKED, on the after side, with the settle window', hit(-45)?.side === 'after' && hit(-1)?.side === 'after' && hit(-45)?.window_min === 45 && hit(-30)?.side === 'after', rows);
  ok('a release due in 1–15 minutes is BLOCKED on the before side with the 15-minute block', hit(1)?.side === 'before' && hit(15)?.side === 'before' && hit(15)?.window_min === 15, rows);
  ok('a release due in 16–100 minutes is CLEAR — the block is 15, not 45', hit(16) === null && hit(40) === null && hit(100) === null, rows);
  ok('the moment of the release counts as blocked, on the before side', hit(0)?.side === 'before' && hit(0)?.offset_min === 0, hit(0));
  ok('the boundary is inclusive on both sides (exactly 15 before and exactly 45 after)', hit(15) !== null && hit(-45) !== null && hit(15.0001) === null && hit(-45.0001) === null, 'boundaries');
  const p560 = N.plan({ news_block_before_min: 5, news_settle_after_min: 60 });
  ok('a 5-minute block does NOT shorten the settle: a release 50 minutes ago is still blocked', N.hit(now - 50 * 60000, now, p560)?.side === 'after' && N.hit(now - 50 * 60000, now, p560)?.window_min === 60, 'block 5 / settle 60');
  ok('and the same 5-minute block does not stretch the before side: 6 minutes ahead is clear', N.hit(now + 6 * 60000, now, p560) === null, 'block 5');
  ok('the recorded failure is now impossible: no plan can produce a 5-minute settle', (() => { try { N.plan({ news_settle_after_min: 5 }); return N.plan({ news_settle_after_min: 5 }).after_min === 30; } catch { return false; } })(), 'clamped');
  ok('an unparseable date is not a hit and not a miss dressed up as a hit', N.hit(NaN, now, p1545) === null && N.hit(undefined, now, p1545) === null, 'NaN');

  /* ----------------------------------------------------- the engine's source */
  ok('bots/index.js applies the pair through hit() and has no absolute-difference window test left in code', /NewsWindow\.hit\(/.test(code(NEWS_SRC)) && !/Math\.abs\(new Date\(e\.date\)\.getTime\(\) - now\)/.test(code(NEWS_SRC)), 'source');
  ok('bots/index.js has no windowMin identifier left in code (the comment quoting the old line is not a live test)', !/windowMin|newsWindowMin/.test(code(NEWS_SRC)), (code(NEWS_SRC).match(/windowMin\w*/g) || []).slice(0, 4));
  ok('the news check refuses a bare number for both sides and says so', /news_window_split_required'\)/.test(NEWS_SRC) && /typeof pair\.before_min !== 'number'/.test(NEWS_SRC), 'guard');
  ok('the owner module keeps the asymmetric comparison in exactly one exported function and uses no absolute distance', (code(WINDOW_SRC).match(/function hit\(/g) || []).length === 1 && !/Math\.abs/.test(code(WINDOW_SRC)), 'hit');
  ok('the module documents that M111 (calendar failure) is NOT solved here', /M111/.test(WINDOW_SRC) || /M111/.test(NEWS_SRC), 'scope note');

  const a = JSON.stringify(N.plan({ news_block_before_min: 20, news_settle_after_min: 50 })), b = JSON.stringify(N.plan({ news_block_before_min: 20, news_settle_after_min: 50 }));
  ok('the same stored row produces the same pair twice (deterministic, no clock, no randomness)', a === b, 'stable');
  ok('the detail note interpolates the CONFIGURED numbers, so it cannot describe a window the app is not applying', N.detail(N.plan({ news_block_before_min: 20, news_settle_after_min: 50 })) === 'No high-impact releases inside your news window: 20 min before and 50 min after a release (checked either side of the entry, from this account\'s settings).', N.detail(N.plan({ news_block_before_min: 20, news_settle_after_min: 50 })));
});
