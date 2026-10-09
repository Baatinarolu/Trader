#!/usr/bin/env bash
# =============================================================================
#  Rebuild extracted/tradejournal — run this first thing in any new turn, or
#  whenever the tree has been wiped.
# =============================================================================
#  WHY THIS EXISTS
#  `extracted/` was in .gitignore, and gitignored content is NOT persisted in the
#  turn-end workspace snapshot. So the whole app tree — including node_modules —
#  disappeared between turns and any server started from it died with it. /tmp is
#  wiped too, so scratch baselines and negative-control trees do not survive.
#  Observed for real, more than once: a turn began with `cd extracted/tradejournal`
#  failing and the live preview returning 000.
#
#  WHAT IS DURABLE
#    tradingpro-main.zip                     the pristine app — the patch's base
#    analysis/patches/applied-so-far.patch   EVERY change the audit made, across the
#                                            whole app (17 files: src/, server.js,
#                                            scripts/, .vercelignore, DEPLOY.md)
#    analysis/                               ledger, probes, harness, findings
#
#  THE RESTORE IS "PRISTINE + PATCH", NOT "UNZIP THE FIXED ZIP"
#  tradingpro-fixed.zip already contains a previous session's partial fixes, and the
#  patch is a diff from PRISTINE, so applying it on top of the fixed zip fails 11
#  hunks. The patch is verified to reproduce the working tree byte-for-byte from a
#  fresh pristine unzip (diff -r) and to reverse-apply cleanly.
#
#  ★ THE git apply TRAP — read before "simplifying" step 3
#  Running `git apply` from INSIDE extracted/tradejournal, when that directory has no
#  .git of its own, makes git resolve the patch paths against the OUTER repo root. It
#  decides every path lies outside the subdirectory it was invoked from, prints
#  "Skipped patch" for all 17 files, AND EXITS 0. A silent no-op that leaves a
#  pristine tree looking restored. It was caught only because step 5 greps one
#  sentinel per changed file — an exit-code check or `node --check` would have passed,
#  because the tree was syntactically valid, booted, and simply contained none of the
#  work. So: apply from the repo root with --directory, then prove it landed with a
#  reverse-check, then verify by CONTENT.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/extracted/tradejournal"
PATCH="$ROOT/analysis/patches/applied-so-far.patch"
WORK="${TMPDIR:-/tmp}/tj-restore.$$"

cd "$ROOT"
[ -f "$PATCH" ] || { echo "FATAL: $PATCH missing — nothing to restore from"; exit 1; }
[ -f tradingpro-main.zip ] || { echo "FATAL: tradingpro-main.zip missing"; exit 1; }

# One sentinel per changed file. A restore is verified by content, never by exit code.
SENTINELS="src/bots/smc.js|eq_band
src/bots/setup.js|rangeRiskMult
src/bots/momentum.js|biasHysteresis
src/bots/topdown.js|invalidation_level
src/bots/index.js|applyBiasHysteresis
src/db.js|bias_state
src/candles.js|yahooErrorText
src/candles.js|offlineCandles
src/candles.js|netHint
server.js|/api/health
scripts/vercel-check.js|/api/health
.vercelignore|scripts/
DEPLOY.md|TURSO_DATABASE_URL"

verify() {
  local fail=0 file token
  while IFS='|' read -r file token; do
    [ -z "$file" ] && continue
    if [ -f "$APP/$file" ] && grep -q -- "$token" "$APP/$file"; then
      printf '     ok   %-28s %s\n' "$file" "$token"
    else
      printf '     MISSING %-23s %s\n' "$file" "$token"; fail=1
    fi
  done <<< "$SENTINELS"
  return $fail
}

# Idempotent: if the tree is already complete, do not rebuild it. Once the app is
# committed to git this path is the normal one, and rebuilding would be pointless
# churn (and would discard anything edited since).
if [ -f "$APP/package.json" ] && verify >/dev/null 2>&1; then
  echo "tree already complete — not rebuilding"
  verify
  [ -d "$APP/node_modules" ] || { echo "installing dependencies"; (cd "$APP" && npm install --no-audit --no-fund --silent); }
  echo; echo "ready: $APP"
  exit 0
fi

rm -rf "$ROOT/extracted" "$WORK"
mkdir -p "$ROOT/extracted" "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "1/4  unzipping the pristine app (tradingpro-main.zip)"
unzip -q tradingpro-main.zip -d "$WORK/pristine"
PSRV="$(find "$WORK/pristine" -maxdepth 3 -type f -name server.js -not -path '*/node_modules/*' | head -1)"
[ -n "$PSRV" ] || { echo "FATAL: no server.js in the pristine zip"; exit 1; }
cp -r "$(dirname "$PSRV")" "$APP"
rm -rf "$APP/node_modules" "$APP/data"
# ★ The pristine zip ships a .git directory INSIDE the app. Left in place, the outer
# repository treats extracted/tradejournal as an embedded repo and stages it as a
# single gitlink — so `git add -A` records a pointer instead of the files, and a
# Vercel deploy from that commit gets an empty directory. Removing it is what makes
# the app genuinely tracked and therefore deployable.
rm -rf "$APP/.git"

echo "2/4  applying $(basename "$PATCH") (from the repo root — see the trap above)"
git -C "$ROOT" apply --check --directory=extracted/tradejournal "$PATCH"
git -C "$ROOT" apply --directory=extracted/tradejournal "$PATCH"
git -C "$ROOT" apply --check --reverse --directory=extracted/tradejournal "$PATCH" \
  || { echo "FATAL: patch reported success but did not fully land"; exit 1; }

echo "3/4  npm install"
(cd "$APP" && npm install --no-audit --no-fund --silent)

echo "4/4  verifying by content"
verify || { echo "FATAL: restore incomplete"; exit 1; }
for f in src/db.js src/bots/index.js src/bots/momentum.js src/candles.js server.js; do
  node --check "$APP/$f"
done
(cd "$APP" && node -e "
const D=require('./src/db.js'), M=require('./src/bots/momentum.js'), C=require('./src/candles.js');
for (const f of ['getBiasState','setBiasState','clearBiasState'])
  if (typeof D[f]!=='function') { console.error('db.'+f+' missing'); process.exit(1); }
if (typeof M.biasHysteresis!=='function') { console.error('momentum.biasHysteresis missing'); process.exit(1); }
for (const f of ['netHint','offlineCandles'])
  if (typeof C[f]!=='function') { console.error('candles.'+f+' missing'); process.exit(1); }
console.log('     ok   runtime exports resolve');
")
echo
echo "restored: $APP"
echo "run it:      cd extracted/tradejournal && node server.js"
echo "deploy help: extracted/tradejournal/DEPLOY.md"
echo
echo "Live candles need a host that can reach Yahoo. Where none can, exercise the app on"
echo "labelled demo bars instead (OFF by default, never silently substituted):"
echo "  TJ_OFFLINE_CANDLES=1 node server.js"
