#!/usr/bin/env python3
"""M56 — the written plan as a gate: its five probes, its frozen parent, and every cohort it sits on.

    python3 analysis/run-m56-verification.py --suite feature|control [--freeze-parents]
    python3 analysis/run-m56-verification.py --suite m13feature|m115feature|m112feature|m111feature|
                                                     ... |raw|declared|pure|reviews|...

`feature` runs the five M56 probes (pure, engine, api, migration, ui) against the actual 6cd59fb
M115 release as the parent guard and writes analysis/evidence/m56/feature-summary.json. `control`
runs the control probe against the parent and the delivered tree in both directions. Every other
suite delegates to analysis/run-m115-verification.py (which itself delegates the inherited cohorts to
their own unchanged runners), so an inherited mark is read from its own evidence file rather than
re-derived here.
"""
from pathlib import Path
import argparse, json, os, subprocess, tarfile, io, hashlib
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m56'
# The release this milestone is built on: the M115 clean-rep count, which is what `main`'s app tree
# was when the plan gate was written. Pinned to the full SHA and asserted below via its abbreviation.
M56_BASE = '6cd59fb445f2e34ce4f243888ce6657836099c31'
M56_BASE_SHORT = '6cd59fb'
PARENT = Path('/tmp/m56-parent/app')
SHIM = ROOT / 'analysis/candle-shim.js'
# (name, script, expected pass, needs the candle shim, needs TJ_PARENT)
M56_FEATURE = [('pure', 'probe-m56-pure.js', 43, False, False), ('engine', 'probe-m56-engine.js', 25, False, True),
               ('api', 'probe-m56-api.js', 37, True, False), ('migration', 'probe-m56-migration.js', 21, False, True),
               ('ui', 'probe-m56-ui.js', 25, True, False)]
M56_CONTROL = [('delivered', 14, 0), ('parent', 14, 0)]
DELEGATED = ['m13feature', 'm115feature', 'm112feature', 'm111feature', 'm110feature', 'm109feature', 'm108feature',
             'm107feature', 'm106feature', 'm105feature', 'raw', 'declared', 'pure', 'offline', 'market',
             'live-provider', 'reports', 'screenshots', 'confluences', 'emotions', 'process', 'behavior',
             'reviews', 'opportunities', 'changes', 'execution', 'routine']
SCOPE = ('REPORTED completed assertions; literal clocks, saved rows, HTTP and a real DOM only. The trader\u2019s OWN written plan '
         '(strategies.entry_rules, stored as a list of lines and edited in the Playbook) read as a gate on the signal: a `require` '
         'line the engine can check is evaluated against facts the analysis already computed, a line that fails refuses the candidate '
         'through the ordinary no_trade/veto path with the trader\u2019s own sentence first, and a line the app cannot check is reported '
         'as unverifiable rather than shown as satisfied. NO new schema object, no backfill, no write on a read. No broker, provider, '
         'mental-state, pixel or production proof, and NO performance claim: the gate is boolean and the payload says it influences no '
         'grade, score, cap or price. RAW failures/early aborts and DECLARED assumptions stay separate. DECLARED NEGATIVE carried here '
         'by name: the inherited M99/M101 reviews cohort is STALE at this HEAD \u2014 157/3 against its committed 159/1, because the schema '
         'grew after M101; the three gaps are declared, not repaired in the probe.')


def read(p): return json.loads(Path(p).read_text())


def digest(tree):
    out = {}
    for p in sorted(tree.rglob('*')):
        if p.is_file() and not any(x in p.parts for x in ('node_modules', '.git')):
            out[str(p.relative_to(tree))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def freeze_parent():
    E.mkdir(parents=True, exist_ok=True)
    guard = E / 'parent-source.json'
    PARENT.mkdir(parents=True, exist_ok=True)
    assert subprocess.run(['git', 'rev-parse', M56_BASE_SHORT], cwd=ROOT, stdout=subprocess.PIPE,
                          check=True).stdout.decode().strip() == M56_BASE, 'the abbreviated parent does not resolve to the pinned M13/M65 SHA'
    tar = subprocess.run(['git', 'archive', '--format=tar', M56_BASE_SHORT, 'extracted/tradejournal'], cwd=ROOT,
                         stdout=subprocess.PIPE, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(tar)) as t:
        for ent in t.getmembers():
            if ent.isfile():
                rel = Path(ent.name).relative_to('extracted/tradejournal')
                dest = PARENT / rel; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(t.extractfile(ent).read())
    nm = PARENT / 'node_modules'
    if not nm.exists(): nm.symlink_to(APP / 'node_modules')
    assert not (PARENT / 'src/bots/plan-gate.js').exists(), 'the M56 parent must not already ship the plan gate'
    assert (PARENT / 'src/periods.js').exists() and (PARENT / 'src/journaling.js').exists() and (PARENT / 'src/execution-review.js').exists() \
        and (PARENT / 'src/challenge.js').exists(), 'the M56 parent is the 6cd59fb M115 clean-reps release'
    d = digest(PARENT)
    if guard.exists():
        frozen = read(guard)
        if frozen != d:
            (Path('/tmp/m56-parent-mismatch.json')).write_text(json.dumps({'frozen': frozen, 'current': d}, indent=2) + '\n')
            raise AssertionError('M56 parent tree changed: see /tmp/m56-parent-mismatch.json')
        print(f'M56 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n')
        print(f'created parent-source.json from the actual {M56_BASE_SHORT} M115 release tree ({len(d)} files)', flush=True)


def feature(row):
    n, s, p, shim, parent = row
    result = E / ('m56feature-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'NODE_OPTIONS': ('--require=' + str(SHIM)) if shim else '',
           'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '',
           'M56_RESULT': str(result), 'M115_RESULT': str(result), 'M111_RESULT': str(result)}
    if parent: env['TJ_PARENT'] = str(PARENT)
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
    output = 'm56feature-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        print(f'm56feature/{n}: NO SUMMARY, exit={run.returncode}', flush=True)
        return {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': 0,
                'exit_code': run.returncode, 'status': 'completed', 'output': output}
    d = json.loads(result.read_text())
    print(f'm56feature/{n}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
    return {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': 0,
            'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True)
    ap.add_argument('--freeze-parents', action='store_true'); a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parent()
    if a.suite == 'feature':
        outs = [feature(r) for r in M56_FEATURE]
        info = {'app': str(APP), 'suite': 'feature', 'parent': str(PARENT), 'pass': sum(o['pass'] or 0 for o in outs),
                'fail': sum(o['fail'] or 0 for o in outs), 'probes': len(outs),
                'completed_nonzero': sum(o['exit_code'] not in (0, None) for o in outs), 'timeout_no_exit': 0,
                'summaryless': sum(o['pass'] is None for o in outs), 'scope': SCOPE, 'runs': outs}
        (E / 'feature-summary.json').write_text(json.dumps(info, indent=2) + '\n')
        (E / 'feature-runs.json').write_text(json.dumps(outs, indent=2) + '\n')
        print(f'M56 cohort: {info["pass"]}/{info["fail"]} across {info["probes"]} probes; nonzero exits {info["completed_nonzero"]}', flush=True)
        bad = [o['name'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] or o['exit_code'] != 0]
        assert not bad, f'M56 cohort did not reproduce its own expected counts: {bad}'
        raise SystemExit(0)
    if a.suite == 'control':
        outs = []
        for mode, pass_n, fail_n in M56_CONTROL:
            result = E / f'm56control-{mode}-results.json'
            env = {**os.environ, 'M56_CONTROL_MODE': mode, 'M56_RESULT': str(result), 'M115_RESULT': str(result), 'M111_RESULT': str(result),
                   'TJ_APP': str(APP if mode == 'delivered' else PARENT), 'NODE_OPTIONS': '--require=' + str(SHIM),
                   'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': ''}
            run = subprocess.run(['node', 'analysis/probe-m56-control.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
            (E / f'm56control-{mode}.txt').write_bytes(run.stdout)
            d = json.loads(result.read_text()) if result.exists() else {'pass': None, 'fail': None}
            print(f'm56control/{mode}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
            outs.append({'mode': mode, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': pass_n, 'expected_fail': fail_n, 'exit_code': run.returncode})
        (E / 'control-results.json').write_text(json.dumps({'suite': 'control', 'runs': outs}, indent=2) + '\n')
        bad = [o['mode'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] != o['expected_fail'] or o['exit_code'] != 0]
        assert not bad, f'M56 control did not reproduce its own expected counts: {bad}'
        print(f'M56 control: {sum(o["pass"] for o in outs)}/{sum(o["fail"] for o in outs)} across {len(outs)} modes', flush=True)
        raise SystemExit(0)
    assert a.suite in DELEGATED, f'unknown M56 suite {a.suite!r}'
    # `m13feature` is the parent cohort and `m115feature` the release this milestone is built on: the
    # M115 runner knows the former as `feature` and forwards the latter unchanged.
    child = ['python3', 'analysis/run-m115-verification.py', '--suite', {'m13feature': 'feature', 'm115feature': 'feature', 'm56feature': 'feature'}.get(a.suite, a.suite)]
    r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-3000:], flush=True)
    print('M56 cohort artifacts: the delegated runner wrote its own evidence under analysis/evidence/', flush=True)
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
