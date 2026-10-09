#!/usr/bin/env bash
# TradeJournal Pro — one-command launcher
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
echo "Starting TradeJournal Pro on http://localhost:${PORT:-3000} ..."
exec node server.js
