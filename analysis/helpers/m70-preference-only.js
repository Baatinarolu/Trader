'use strict';
/** Measurement-only preloader; never production options or a relaxed shipped gate.
 * Isolate M70's geometric preference from its failed-reaction fuel veto:
 * node --require ./analysis/helpers/m70-preference-only.js analysis/harness/backtest.js --breakers --seeds 60 --bars 1500 --window 300
 * TJ_APP may name a staged application. Keep every price, grade, risk and other veto.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../../extracted/tradejournal');
const Entry = require(path.join(APP, 'src/bots/entry-models'));
const original = Entry.preferExtreme;
Entry.preferExtreme = (args) => {
  const preference = original(args);
  return preference ? { ...preference, blocked: false } : preference;
};
