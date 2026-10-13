#!/usr/bin/env python3
"""M112 feature cohort + the milestones it sits on.

    python3 analysis/run-m112-verification.py --suite feature
    python3 analysis/run-m112-verification.py --suite feature --freeze-parents
    python3 analysis/run-m112-verification.py --suite m111feature   # alias -> the M111 runner
    python3 analysis/run-m112-verification.py --suite m110feature   # alias -> the M110 runner

The probes report through the M111 harness's own writer, so both result variables point at the same
file for an M112 probe. The cohort is six probes measured against the delivered tree and, as
controls, against the committed M111 release (`/tmp/m112-parent/app`, built from git by `--freeze-parents`). M112 is one
commit of work, so that parent IS also the pre-M112 runtime: on it the window module and the four
columns do not exist at all, which is the measured negative rather than a crash — `shipped()` fails
one assertion per probe and the probe stops.

Every other suite delegates to the runner that owns it, so an inherited number is always produced by
the runner and the evidence directory that measured it originally. The M111 and M110 cohorts are the
two directly affected by this milestone (a `trading_window` key appears in the state payload they
dump), so their summaries are re-asserted here after the delegated run.
"""
from pathlib import Path
import argparse, concurrent.futures, json, os, runpy, subprocess
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m112'
PRIOR = runpy.run_path(str(ROOT / 'analysis/run-m111-verification.py'), run_name='m112_prior_m111_helpers')
OLD = PRIOR['OLD']; read = PRIOR['read']; digest = PRIOR['digest']
M112_FEATURE = [('pure', 'probe-m112-pure.js', 36), ('engine', 'probe-m112-engine.js', 18), ('consumers', 'probe-m112-consumers.js', 32),
                ('api', 'probe-m112-api.js', 49), ('migration', 'probe-m112-migration.js', 16), ('ui', 'probe-m112-ui.js', 30)]
M112_PARENT = Path('/tmp/m112-parent/app')
M112_BASE = '4791809'
SUITES = ['feature', 'm111feature', 'm110feature', 'm109feature', 'm108feature', 'm107feature', 'm106feature', 'm105feature',
          'screenshots', 'confluences', 'emotions', 'process', 'behavior', 'reviews', 'opportunities', 'changes',
          'execution', 'routine', 'raw', 'declared', 'pure', 'offline', 'market']


def freeze_m112_parent():
    OLD['freeze'](M112_BASE, str(M112_PARENT))
    E.mkdir(parents=True, exist_ok=True)
    guard = E / 'parent-source.json'; d = digest(M112_PARENT)
    if guard.exists():
        if d != read(guard):
            (Path('/tmp/m112-parent-mismatch.json')).write_text(json.dumps({'frozen': json.loads(guard.read_text()), 'current': d}, indent=2) + '\n')
            raise AssertionError('M112 parent tree changed: see /tmp/m112-parent-mismatch.json')
        print(f'M112 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n'); print(f'created parent-source.json from the actual {M112_BASE} M111 release tree ({len(d)} files)', flush=True)


def freeze_parents():
    freeze_m112_parent()
    # The M111 parent is frozen exactly as the M111 runner froze it, so this runner reads no module
    # and no schema out of an older runner's module state.
    PRIOR['freeze_m111_parent']()
    m110_parents = read('analysis/evidence/m110/regression-parents.json')['parents']
    info = {'method': f'Actual {M112_BASE} M111 Git release as the M112 parent, the inherited M111 parent (the actual b39d9ef M110 release), the M110 parent and every older source by saved reverse patches asserted against the frozen parent-source.json proofs; no guessed schema/current module in any parent.',
            'parents': {str(M112_PARENT): {'files': len(digest(M112_PARENT)), 'byte_differences': 0}, **{k: v for k, v in m110_parents.items() if k != str(M112_PARENT)}}}
    (E / 'regression-parents.json').write_text(json.dumps(info, indent=2) + '\n')
    print(f'M112 regression parents: {len(info["parents"])} trees, byte differences 0', flush=True)


# The two assertions the M111 migration probe freezes to prove that M111 itself added no schema
# object. M112 adds four additive `accounts` columns on purpose, so on this tree both fail and are
# retained by name (exactly like the five M110-closure negatives) rather than edited away.
M111_NEGATIVES = ['M111 adds NO schema object of any kind and changes none: every table, index and trigger is byte-identical to the parent\'s',
                  'every inherited fact is byte-identical after the upgrade: a state that is derived on every read has nothing to store']


def feature(row, parent=M112_PARENT, prefix='m112feature'):
    n, s, p, *rest = row; expect_fail = rest[0] if rest else 0
    result = E / (prefix + '-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'TJ_PARENT': str(parent), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'M112_RESULT': str(result), 'M111_RESULT': str(result)}
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    output = prefix + '-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        out = {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': expect_fail,
               'exit_code': run.returncode, 'status': 'completed' if run.returncode is not None else 'timeout', 'output': output}
        print(f'{prefix}/{n}: NO SUMMARY, exit={run.returncode}', flush=True); return out
    d = json.loads(result.read_text())
    out = {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': expect_fail,
           'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}
    print(f'{prefix}/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}', flush=True); return out


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True, choices=SUITES)
    ap.add_argument('--freeze-parents', action='store_true'); ap.add_argument('--only', help='Rerun one script substring and merge into the same-source suite')
    a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parents()
    if a.suite == 'm111feature':
        child = ['python3', 'analysis/run-m111-verification.py', '--suite', 'feature'] + (['--only', a.only] if a.only else [])
        r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-4000:], flush=True)
        print('M112 cohort artifacts: analysis/evidence/m111/feature-summary.json', flush=True)
        d = read('analysis/evidence/m111/feature-summary.json')
        # Every M111 assertion that measures the calendar read is expected to reproduce exactly; the
        # TWO failures are its own migration probe's schema negativity, and they are retained by name.
        assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero']) == (152, 2, 8, 1), (d['pass'], d['fail'], d['probes'], d['completed_nonzero'])
        mig = next(r for r in d['runs'] if r['name'] == 'migration')
        assert (mig['pass'], mig['fail'], mig['exit_code']) == (14, 2, 1), mig
        text = (E.parent / 'm111' / 'm111feature-migration.txt').read_text()
        for label in M111_NEGATIVES:
            assert ('FAIL ' + label) in text, ('the M111 negative must be the frozen assertion it claims to be', label)
        print('M111 cohort on this tree: 152/2 across 8 probes; the two failures are the M111 migration probe\u2019s own declared schema negatives, named and retained.', flush=True)
        raise SystemExit(0)
    if a.suite in SUITES[1:]:
        child_suite = {'m110feature': 'feature'}.get(a.suite, a.suite)
        child = ['python3', 'analysis/run-m110-verification.py', '--suite', child_suite] + (['--only', a.only] if a.only else [])
        r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-4000:], flush=True)
        edir = 'm110' if a.suite == 'm110feature' else 'm109'
        print('M112 cohort artifacts:', 'analysis/evidence/' + edir + '/' + child_suite + '-summary.json', flush=True)
        if a.suite == 'm110feature':
            # The M110 cohort measures the pre-M111 silence on purpose, so five of its assertions are
            # the M111-closure negative this tree inherits. The count is pinned so a later change
            # cannot quietly soften them; the payload also gained `trading_window` under M112, which
            # those probes record in their text output without asserting on it.
            d = read('analysis/evidence/m110/feature-summary.json')
            assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero']) == (253, 5, 9, 2), (d['pass'], d['fail'], d['probes'], d['completed_nonzero'])
            print('M110 cohort on this tree: 253/5 — those five are the declared M111-closure negatives.', flush=True)
            raise SystemExit(0)
        raise SystemExit(r.returncode)
    rows = list(M112_FEATURE)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outs = list(pool.map(feature, rows))
    total = {'pass': sum(r['pass'] or 0 for r in outs), 'fail': sum(r['fail'] or 0 for r in outs), 'probes': len(outs),
             'completed_nonzero': sum(r['exit_code'] is not None and r['exit_code'] != 0 for r in outs), 'timeout_no_exit': sum(r['exit_code'] is None for r in outs),
             'summaryless': sum(r['pass'] is None or r['fail'] is None for r in outs),
             'scope': 'REPORTED completed assertions; literal clocks/journals/DOM only. The trading window measured on the module, through the entry engine, over HTTP (including the entry-admission path with a completed pre-market routine), across the upgraded committed-M111 release and in the shipped dialog. The sandbox has no market or broker network, so candles are the probes\u2019 own synthetic series and the routine is completed through the app\u2019s own endpoints; no live-feed, provider, broker, pixel, human or production proof is claimed, and nothing here says an hour will be profitable. RAW failures/early aborts, DECLARED assumptions and every frozen milestone-only schema negative remain SEPARATE.', 'runs': outs}
    (E / (a.suite + '-runs.json')).write_text(json.dumps(outs, indent=2) + '\n'); (E / (a.suite + '-summary.json')).write_text(json.dumps(total, indent=2) + '\n')
    print(json.dumps({k: v for k, v in total.items() if k != 'runs'}, indent=2))
    assert all(r['pass'] == r['expected_pass'] and r['fail'] == r['expected_fail'] and r['exit_code'] == 0 for r in outs), [(r['name'], r['pass'], r['fail']) for r in outs if r['pass'] != r['expected_pass'] or r['fail'] != r['expected_fail'] or r['exit_code'] != 0]


if __name__ == '__main__':
    main()
