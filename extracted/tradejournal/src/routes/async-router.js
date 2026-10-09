'use strict';
/**
 * Router whose handlers may be async.
 *
 * Express 4 does not catch rejected promises from async handlers — an unhandled
 * rejection takes the whole process down. Since the data layer is now fully async
 * (libSQL), every router is created here: a rejection is forwarded to `next()` and
 * becomes a clean 500 instead of a dead server.
 */
const express = require('express');

function asyncRouter() {
  const router = express.Router();
  const guard = (fn) => {
    if (fn.length >= 4) return fn;                      // (err, req, res, next) error handler
    const wrapped = function (req, res, next) {
      try {
        const out = fn(req, res, next);
        if (out && typeof out.then === 'function') out.catch(next);
      } catch (e) { next(e); }
    };
    Object.defineProperty(wrapped, 'name', { value: fn.name || 'handler' });
    return wrapped;
  };
  ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'].forEach((method) => {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map((a) => (typeof a === 'function' ? guard(a) : a)));
  });
  return router;
}

module.exports = { asyncRouter };
