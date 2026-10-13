#!/usr/bin/env python3
"""M111 feature cohort + the milestones it sits on.

    python3 analysis/run-m111-verification.py --suite feature
    python3 analysis/run-m111-verification.py --suite feature --freeze-parents
    python3 analysis/run-m111-verification.py --suite m110feature   # alias -> the M110 runner
    python3 analysis/run-m111-verification.py --suite m109feature   # alias -> the M109 runner

The M111 cohort is eight probes measured against the delivered tree and, as controls, against the
committed M110 release (`/tmp/m111-parent/app`, built from git by `--freeze-parents`) and against
the staged pre-M111 runtime (the `policy` stage: the state vocabulary present, the engine still
quiet) — the same file, run three ways, so the absence of the feature is a measured negative rather
than a crash. Every other suite delegates to the runner that owns it.
"""
from pathlib import Path
import argparse, concurrent.futures, json, os, runpy, subprocess
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m111'
PRIOR = runpy.run_path(str(ROOT / 'analysis/run-m110-verification.py'), run_name='m111_prior_m110_helpers')
OLD = PRIOR['OLD']; read = PRIOR['read']; digest = PRIOR['digest']
M111_FEATURE = [('pure', 'probe-m111-pure.js', 26), ('engine', 'probe-m111-engine.js', 21), ('consumers', 'probe-m111-consumers.js', 20), ('api', 'probe-m111-api.js', 14), ('freshness', 'probe-m111-freshness.js', 11), ('hardening', 'probe-m111-hardening.js', 36), ('portable', 'probe-m111-portable.js', 10), ('migration', 'probe-m111-migration.js', 16)]
M111_PARENT = Path('/tmp/m111-parent/app')
M111_BASE = 'b39d9ef'
SUITES = ['feature', 'm110feature', 'm109feature', 'm108feature', 'm107feature', 'm106feature', 'm105feature', 'screenshots', 'confluences', 'emotions', 'process', 'behavior', 'reviews', 'opportunities', 'changes', 'execution', 'routine', 'raw', 'declared', 'pure', 'offline', 'market']


def freeze_m111_parent():
    OLD['freeze'](M111_BASE, str(M111_PARENT))
    E.mkdir(parents=True, exist_ok=True)
    guard = E / 'parent-source.json'; d = digest(M111_PARENT)
    if guard.exists():
        if d != read(guard):
            (Path('/tmp/m111-parent-mismatch.json')).write_text(json.dumps({'frozen': json.loads(guard.read_text()), 'current': d}, indent=2) + '\n')
            raise AssertionError('M111 parent tree changed: see /tmp/m111-parent-mismatch.json')
        print(f'M111 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n'); print(f'created parent-source.json from the actual {M111_BASE} M110 release tree ({len(d)} files)', flush=True)


M110_PARENT = Path('/tmp/m110-parent/app')
M110_BASE = 'c09574e'


def freeze_parents():
    freeze_m111_parent()
    # The M110 parent is frozen exactly as the M110 runner froze it (the same commit, the same guard),
    # so the M111 runner reads no module and no schema out of an older runner's module state.
    OLD['freeze'](M110_BASE, str(M110_PARENT))
    guard = ROOT / 'analysis/evidence/m110/parent-source.json'
    if guard.exists():
        assert digest(M110_PARENT) == read(guard), 'M110 parent tree changed'
        print(f'M110 parent guard reproduced exactly ({len(digest(M110_PARENT))} files)', flush=True)
    m109_parents = read('analysis/evidence/m109/regression-parents.json')['parents']
    info = {'method': 'Actual b39d9ef M110 Git release as the M111 parent, the inherited M110 parent (the actual c09574e M109 release), the M109 parent and every older source by saved reverse patches asserted against the frozen parent-source.json proofs; no guessed schema/current module in any parent.', 'parents': {str(M111_PARENT): {'files': len(digest(M111_PARENT)), 'byte_differences': 0}, str(M110_PARENT): {'files': len(digest(M110_PARENT)), 'byte_differences': 0}, **m109_parents}}
    (E / 'regression-parents.json').write_text(json.dumps(info, indent=2) + '\n')
    print(f'M111 regression parents: {len(info["parents"])} trees, byte differences 0', flush=True)


def feature(row, parent=M111_PARENT, prefix='m111feature'):
    n, s, p, *rest = row; expect_fail = rest[0] if rest else 0
    result = E / (prefix + '-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'TJ_PARENT': str(parent), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'M111_RESULT': str(result)}
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    output = prefix + '-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        out = {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': expect_fail, 'exit_code': run.returncode, 'status': 'completed' if run.returncode is not None else 'timeout', 'output': output}
        print(f'{prefix}/{n}: NO SUMMARY, exit={run.returncode}', flush=True); return out
    d = json.loads(result.read_text())
    out = {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': expect_fail, 'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}
    print(f'{prefix}/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}', flush=True); return out


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True, choices=SUITES); ap.add_argument('--freeze-parents', action='store_true'); ap.add_argument('--only', help='Rerun one script substring and merge into the same-source suite')
    a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parents()
    if a.suite in ['m110feature', 'm109feature', 'm108feature', 'm107feature', 'm106feature', 'm105feature', 'screenshots', 'confluences', 'emotions', 'process', 'behavior', 'reviews', 'opportunities', 'changes', 'execution', 'routine', 'raw', 'declared', 'pure', 'offline', 'market']:
        # The M110 milestone IS that runner's own `feature` suite, so the alias is resolved here
        # rather than passed through, and the artifact path is the resolved name's.
        child_suite = {'m110feature': 'feature'}.get(a.suite, a.suite)
        child = ['python3', 'analysis/run-m110-verification.py', '--suite', child_suite] + (['--only', a.only] if a.only else [])
        r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-4000:], flush=True)
        edir = 'm110' if a.suite == 'm110feature' else 'm109'
        print('M111 cohort artifacts:', 'analysis/evidence/' + edir + '/' + child_suite + '-summary.json', flush=True)
        if a.suite == 'm110feature':
            # The M110 cohort's own probes measure the pre-M111 silence on purpose. Five of its
            # assertions are therefore this milestone's DECLARED negative and the count is pinned
            # here so a later change cannot quietly soften them: three in the engine/consumers
            # probes (the quiet-outage shape, the payload key set that grew by `state`, and the
            # "M111 is open and NOT solved here" marker that exists to make closing it visible) and
            # the two frozen key-set assertions beside them. Everything else in that cohort
            # reproduces exactly (41/0, 40/0, 25/0, 17/0, 40/0, 17/0, 33/0, 23/0).
            d = read('analysis/evidence/m110/feature-summary.json')
            assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero']) == (253, 5, 9, 2), (d['pass'], d['fail'], d['probes'], d['completed_nonzero'])
            print('M110 cohort on this tree: 253/5 — those five are the declared M111-closure negatives.', flush=True)
            raise SystemExit(0)
        raise SystemExit(r.returncode)
    if a.suite == 'feature':
        rows = list(M111_FEATURE)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outs = list(pool.map(feature, rows))
    total = {'pass': sum(r['pass'] or 0 for r in outs), 'fail': sum(r['fail'] or 0 for r in outs), 'probes': len(outs), 'completed_nonzero': sum(r['exit_code'] is not None and r['exit_code'] != 0 for r in outs), 'timeout_no_exit': sum(r['exit_code'] is None for r in outs), 'summaryless': sum(r['pass'] is None or r['fail'] is None for r in outs), 'scope': 'REPORTED completed assertions; literal clocks/journals/DOM only. The calendar-read states (blocked/clear/unknown) measured on the module, over HTTP, through the engine and its consumers, across a feed outage, a recovery and a restart, and by upgrading the committed M110 release. The sandbox has no market or calendar network, so the calendar is fed through the app\u2019s own fetch path by a shim and the thrown-read path by a patched reader; no live-feed, provider, broker, pixel or human proof is claimed, and nothing here says what a release does to price. RAW failures/early aborts, DECLARED assumptions and every frozen milestone-only schema negative remain SEPARATE.', 'runs': outs}
    (E / (a.suite + '-runs.json')).write_text(json.dumps(outs, indent=2) + '\n'); (E / (a.suite + '-summary.json')).write_text(json.dumps(total, indent=2) + '\n')
    print(json.dumps({k: v for k, v in total.items() if k != 'runs'}, indent=2))
    assert all(r['pass'] == r['expected_pass'] and r['fail'] == r['expected_fail'] and r['exit_code'] == 0 for r in outs), [(r['name'], r['pass'], r['fail']) for r in outs if r['pass'] != r['expected_pass'] or r['fail'] != r['expected_fail'] or r['exit_code'] != 0]


if __name__ == '__main__':
    main()
