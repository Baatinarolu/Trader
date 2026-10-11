'use strict';
/** Named entry composition (Ep 18). This module contains no IO/account state.
 * M70's selection policy is shared by the legacy opt-in breaker selector and
 * the pending two-model LTF composer (M68). Geometry, not strength, defines extreme.
 */
const number = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
function preferExtreme({ chosen, flipZones = [], orderBlocks = [], sweeps = [], dir, enabled = true }) {
  if (!enabled || !chosen || !chosen.zone) return null;
  const eligible = orderBlocks.filter((z) => !z.breached && z.mitigated === false && z.dir === dir);
  if (!eligible.length) return null;
  const extreme = eligible.reduce((a, b) => dir > 0
    ? (b.bottom < a.bottom ? b : a) : (b.top > a.top ? b : a));
  // A third, stronger non-extreme OB does not cancel this mechanical preference.
  // Caller supplies only opted-in, eligible flips in existing ranking order.
  const flips = flipZones.length ? flipZones : chosen.zone.is_breaker ? [chosen.zone] : [];
  const flip = flips.find((z) => z.dir === dir && extreme.bottom <= z.top && extreme.top >= z.bottom);
  if (!flip) return null;
  const point = number(flip.reaction_point);
  const taken = point === null ? null : sweeps.find((s) => s.dir === dir
    && number(s.t) !== null && number(flip.t) !== null && s.t >= flip.t
    && number(s.extreme) !== null && number(s.close) !== null
    && (dir > 0 ? s.extreme < point && s.close > point : s.extreme > point && s.close < point)) || null;
  return { zone: extreme, flip,
    fuel: { type: dir > 0 ? 'SSL' : 'BSL', price: point, known: point !== null,
      swept: point === null ? null : !!taken, sweep_t: taken ? taken.t : null },
    blocked: point !== null && !taken,
    note: 'Ep 18: prefer the unmitigated extreme zone over an overlapping flip zone; take the liquidity beyond the failed reaction first.' };
}
module.exports = { preferExtreme };
