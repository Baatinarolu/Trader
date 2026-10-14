#!/usr/bin/env python3
"""M30 — the two zone methods: its four probes, its frozen parent, and every cohort it sits on.

    python3 analysis/run-m30-verification.py --suite feature|control [--freeze-parents]
    python3 analysis/run-m30-verification.py --suite m56feature|m13feature|m115feature|... (delegates)

`feature` runs the four M30 probes (pure, engine, api, ui) against the actual 27fbb2a M56
alert-surface release as the parent guard and writes analysis/evidence/m30/feature-summary.json.
`control` runs the mode-aware control probe in all three modes: the parent, the module-only stage
(the vocabulary and the walk exist and nothing consults them) and the delivered tree. Every other
suite delegates to analysis/run-m56-verification.py, so an inherited mark is read from its own
evidence file rather than re-derived here.
"""
from pathlib import Path
import argparse, json, os, subprocess, tarfile, io, hashlib
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m30'
# The release this milestone is built on: the M56 alert-surface commit, which is what the app tree was
# when the second zone method was written. Pinned to the full SHA and asserted below.
M30_BASE = '27fbb2acbd8574a7278d880d3654bc9706e39e90'
M30_BASE_SHORT = '27fbb2a'
PARENT = Path('/tmp/m30-parent/app')
SHIM = ROOT / 'analysis/candle-shim.js'
# (name, script, expected pass, needs the candle shim, needs TJ_PARENT)
M30_FEATURE = [('pure', 'probe-m30-pure.js', 27, False, False), ('engine', 'probe-m30-engine.js', 14, False, True),
               ('api', 'probe-m30-api.js', 29, True, False), ('ui', 'probe-m30-ui.js', 20, True, False),
               ('migration', 'probe-m30-migration.js', 22, True, True)]
M30_CONTROL = [('delivered', 11, 0), ('parent', 11, 0), ('module', 11, 0)]
DELEGATED = ['m56feature', 'm56control', 'm13feature', 'm115feature', 'm112feature', 'm111feature', 'm110feature',
             'm109feature', 'm108feature', 'm107feature', 'm106feature', 'm105feature', 'raw', 'declared', 'pure',
             'offline', 'market', 'live-provider', 'reports', 'screenshots', 'confluences', 'emotions', 'process',
             'behavior', 'reviews', 'opportunities', 'changes', 'execution', 'routine']
SCOPE = ('REPORTED completed assertions; literal clocks, saved rows, HTTP and a real DOM only. Ep 7 gives TWO zone '
         'methods — the PIVOT method (the single candle before the displacement) and the RANGE method (the whole '
         'consolidation high-to-low) — and the app shipped one of them, hardcoded, with no way to say which geometry '
         'a read used let alone choose the other. The range method is now computed by a closed three-rule walk '
         '(a displacement bar ends the base, a bar that does not overlap it is the departure, a 3-ATR cap is REPORTED), '
         'the method is a closed vocabulary (`pivot` default, `range`), a read NAMES the geometry it ran on and where '
         'the choice came from, and the choice is stored in the settings JSON that already exists. NO new schema object, '
         'no new file, no write on a read, no broker/mental/pixel/production proof, and NO performance claim: the wider '
         'zone is stated as a trade-off (wider zone, wider stop) in both the payload and the screens, never as a winner. '
         'RAW failures/early aborts and DECLARED assumptions stay separate. DECLARED NEGATIVE carried here by name: the '
         'inherited M99/M101 reviews cohort is STALE at this HEAD — 157/3 against its committed 159/1, because the schema '
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
    assert subprocess.run(['git', 'rev-parse', M30_BASE_SHORT], cwd=ROOT, stdout=subprocess.PIPE,
                          check=True).stdout.decode().strip() == M30_BASE, 'the abbreviated parent does not resolve to the pinned M56 alert-surface SHA'
    tar = subprocess.run(['git', 'archive', '--format=tar', M30_BASE_SHORT, 'extracted/tradejournal'], cwd=ROOT,
                         stdout=subprocess.PIPE, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(tar)) as t:
        for ent in t.getmembers():
            if ent.isfile():
                rel = Path(ent.name).relative_to('extracted/tradejournal')
                dest = PARENT / rel; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(t.extractfile(ent).read())
    nm = PARENT / 'node_modules'
    if not nm.exists(): nm.symlink_to(APP / 'node_modules')
    # The parent must be the M56 alert-surface release: it HAS the plan gate and the parsed alert
    # history, and it has NO zone-method vocabulary.
    assert (PARENT / 'src/bots/plan-gate.js').exists(), 'the M30 parent is the M56 release and must ship the plan gate'
    assert 'refused this alert' in (PARENT / 'public/js/views/settings.js').read_text(), 'the M30 parent is the M56 alert surface'
    assert 'ZONE_METHODS' not in (PARENT / 'src/bots/smc.js').read_text(), 'the M30 parent must not already have two zone methods'
    d = digest(PARENT)
    if guard.exists():
        frozen = read(guard)
        if frozen != d:
            Path('/tmp/m30-parent-mismatch.json').write_text(json.dumps({'frozen': frozen, 'current': d}, indent=2) + '\n')
            raise AssertionError('M30 parent tree changed: see /tmp/m30-parent-mismatch.json')
        print(f'M30 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n')
        print(f'created parent-source.json from the actual {M30_BASE_SHORT} M56 release tree ({len(d)} files)', flush=True)


def feature(row):
    n, s, p, shim, parent = row
    result = E / ('m30feature-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'NODE_OPTIONS': ('--require=' + str(SHIM)) if shim else '',
           'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '',
           'M30_RESULT': str(result), 'M115_RESULT': str(result), 'M111_RESULT': str(result)}
    if parent: env['TJ_PARENT'] = str(PARENT)
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
    output = 'm30feature-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        print(f'm30feature/{n}: NO SUMMARY, exit={run.returncode}', flush=True)
        return {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': 0,
                'exit_code': run.returncode, 'status': 'completed', 'output': output}
    d = json.loads(result.read_text())
    print(f'm30feature/{n}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
    return {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': 0,
            'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True)
    ap.add_argument('--freeze-parents', action='store_true'); a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parent()
    if a.suite == 'feature':
        outs = [feature(r) for r in M30_FEATURE]
        info = {'app': str(APP), 'suite': 'feature', 'parent': str(PARENT), 'pass': sum(o['pass'] or 0 for o in outs),
                'fail': sum(o['fail'] or 0 for o in outs), 'probes': len(outs),
                'completed_nonzero': sum(o['exit_code'] not in (0, None) for o in outs), 'timeout_no_exit': 0,
                'summaryless': sum(o['pass'] is None for o in outs), 'scope': SCOPE, 'runs': outs}
        (E / 'feature-summary.json').write_text(json.dumps(info, indent=2) + '\n')
        (E / 'feature-runs.json').write_text(json.dumps(outs, indent=2) + '\n')
        print(f'M30 cohort: {info["pass"]}/{info["fail"]} across {info["probes"]} probes; nonzero exits {info["completed_nonzero"]}', flush=True)
        bad = [o['name'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] or o['exit_code'] != 0]
        assert not bad, f'M30 cohort did not reproduce its own expected counts: {bad}'
        raise SystemExit(0)
    if a.suite == 'control':
        outs = []
        for mode, pass_n, fail_n in M30_CONTROL:
            result = E / f'm30control-{mode}-results.json'
            tree = APP if mode == 'delivered' else (PARENT if mode == 'parent' else Path(CAPTURE_MODULE_TREE))
            env = {**os.environ, 'M30_CONTROL_MODE': mode, 'M30_RESULT': str(result), 'M115_RESULT': str(result),
                   'M111_RESULT': str(result), 'TJ_APP': str(tree), 'TJ_PARENT': str(PARENT),
                   'NODE_OPTIONS': '--require=' + str(SHIM),
                   'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': ''}
            run = subprocess.run(['node', 'analysis/probe-m30-control.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
            (E / f'm30control-{mode}.txt').write_bytes(run.stdout)
            d = json.loads(result.read_text()) if result.exists() else {'pass': None, 'fail': None}
            print(f'm30control/{mode}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
            outs.append({'mode': mode, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': pass_n, 'expected_fail': fail_n, 'exit_code': run.returncode})
        (E / 'control-results.json').write_text(json.dumps({'suite': 'control', 'runs': outs}, indent=2) + '\n')
        bad = [o['mode'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] != o['expected_fail'] or o['exit_code'] != 0]
        assert not bad, f'M30 control did not reproduce its own expected counts: {bad}'
        print(f'M30 control: {sum(o["pass"] for o in outs)}/{sum(o["fail"] for o in outs)} across {len(outs)} modes', flush=True)
        raise SystemExit(0)
    assert a.suite in DELEGATED, f'unknown M30 suite {a.suite!r}'
    child = ['python3', 'analysis/run-m56-verification.py', '--suite', {'m56feature': 'feature', 'm56control': 'control'}.get(a.suite, a.suite)]
    r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-3000:], flush=True)
    print('M30 cohort artifacts: the delegated runner wrote its own evidence under analysis/evidence/', flush=True)
    raise SystemExit(r.returncode)


# The module-only stage tree is built by capture-m30-stages.py; the control suite needs it because that
# is the arm that proves the module alone changes nothing anybody can see.
CAPTURE_MODULE_TREE = '/tmp/m30-module-stage/app'

if __name__ == '__main__':
    main()
