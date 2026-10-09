'use strict';
/**
 * Vercel / serverless entry point.
 *
 * Everything the app needs is inside the Express app exported by server.js;
 * vercel.json routes every /api/* request here. The first request after a cold
 * start waits for the schema + starter workspace to be ready.
 */
module.exports = require('../server.js').handler;
