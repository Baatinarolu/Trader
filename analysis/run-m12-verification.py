#!/usr/bin/env python3
"""M12 — the rule-break tally: its four probes, its frozen parent, and every cohort it sits on.

    python3 analysis/run-m12-verification.py --suite feature [--freeze-parents]
    python3 analysis/run-m12-verification.py --suite m112feature|m111feature|m110feature|m109feature|...
                                                       m108feature|m107feature|m106feature|m105feature
                                                       raw|declared|pure

`feature` runs the four M12 probes against the actual 67f2ed2 M112 release as the parent guard and
writes analysis/evidence/m12/feature-summary.json. Every other suite delegates to
analysis/run-m112-verification.py, so the inherited cohorts are measured by their own unchanged
runners and the marks below are read from their own evidence files rather than re-derived here.
"""
from pathlib import Path
import argparse, json, os, shutil, subprocess, sys, tarfile, io, hashlib
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m12'
M12_BASE = '67f2ed26f2398bd0f95537f88dee65f5c760e771'
# git is asked for the parent by its unambiguous abbreviation (asserted below to resolve to the
# full SHA): this sandbox is a partial clone whose lazy fetch is not always available, while the
# short form resolves from the local commit-graph. The identity stays pinned to the full SHA.
M12_BASE_SHORT = '67f2ed2'
PARENT = Path('/tmp/m12-parent/app')
M12_FEATURE = [('pure', 'probe-m12-pure.js', 26), ('api', 'probe-m12-api.js', 23), ('migration', 'probe-m12-migration.js', 12), ('ui', 'probe-m12-ui.js', 18)]
SCOPE = ('REPORTED completed assertions; literal audit rows, clocks and DOM only. The guardrail audit the app '
         'already writes, aggregated into the review it already serves: the rule is measured on rows shaped the way '
         'guardrails.logEvent writes them, over HTTP on the endpoint the review reads, in the shipped card, and '
         'against a database the committed 67f2ed2 M112 release created and wrote with its own code. No broker, '
         'provider, mental-state, pixel or production proof, and no causal claim joining a break to a result. '
         'RAW failures/early aborts, DECLARED assumptions and every frozen milestone-only schema negative remain SEPARATE.')


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
    if PARENT.exists(): shutil.rmtree(PARENT)
    PARENT.mkdir(parents=True)
    assert subprocess.run(['git', 'rev-parse', M12_BASE_SHORT], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout.decode().strip() == M12_BASE, 'the abbreviated parent must resolve to the pinned M112 commit'
    with tarfile.open(fileobj=io.BytesIO(subprocess.run(['git', 'archive', M12_BASE_SHORT, 'extracted/tradejournal'], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout)) as t:
        for ent in t:
            if ent.isfile():
                rel = Path(ent.name).relative_to('extracted/tradejournal')
                dest = PARENT / rel; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(t.extractfile(ent).read())
    (PARENT / 'node_modules').symlink_to(APP / 'node_modules')
    assert not (PARENT / 'src/rule-breaks.js').exists(), 'the M12 parent must not already ship the tally'
    d = digest(PARENT)
    if guard.exists():
        if d != read(guard):
            (Path('/tmp/m12-parent-mismatch.json')).write_text(json.dumps({'frozen': json.loads(guard.read_text()), 'current': d}, indent=2) + '\n')
            raise AssertionError('M12 parent tree changed: see /tmp/m12-parent-mismatch.json')
        print(f'M12 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n'); print(f'created parent-source.json from the actual {M12_BASE[:7]} M112 release tree ({len(d)} files)', flush=True)


def freeze_parents():
    """The M12 parent plus the inherited parent trees the delegated cohorts measure against, recorded
    with their byte differences, so the builder reads a measured map rather than a claim."""
    freeze_parent()
    m112_parents = read('analysis/evidence/m112/regression-parents.json')['parents']
    assert str(Path('/tmp/m112-parent/app')) in m112_parents, 'run analysis/run-m112-verification.py --suite feature --freeze-parents first: the delegated M112 cohort and its controls need that tree'
    info = {'method': f'Actual {M12_BASE[:7]} M112 Git release as the M12 parent (the milestone the tally sits on), plus the M112 cohort\'s own measured parent map inherited unchanged \u2014 no parent is re-derived here and no schema or module is read out of an older runner.',
            'parents': {str(PARENT): {'files': len(digest(PARENT)), 'byte_differences': 0}, **m112_parents}}
    (E / 'regression-parents.json').write_text(json.dumps(info, indent=2) + '\n')
    print(f'M12 regression parents: {len(info["parents"])} trees, byte differences 0', flush=True)


def feature(row):
    n, s, p = row
    result = E / ('m12feature-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'TJ_PARENT': str(PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'M12_RESULT': str(result), 'M111_RESULT': str(result)}
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    output = 'm12feature-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        print(f'm12feature/{n}: NO SUMMARY, exit={run.returncode}', flush=True)
        return {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': 0, 'exit_code': run.returncode, 'status': 'completed', 'output': output}
    d = json.loads(result.read_text())
    print(f'm12feature/{n}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
    return {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': 0, 'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True)
    ap.add_argument('--freeze-parents', action='store_true'); a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parents()
    if a.suite == 'feature':
        outs = [feature(r) for r in M12_FEATURE]
        info = {'app': str(APP), 'suite': 'feature', 'parent': str(PARENT), 'pass': sum(o['pass'] or 0 for o in outs), 'fail': sum(o['fail'] or 0 for o in outs),
                'probes': len(outs), 'completed_nonzero': sum(o['exit_code'] not in (0, None) for o in outs), 'timeout_no_exit': 0,
                'summaryless': sum(o['pass'] is None for o in outs), 'scope': SCOPE, 'runs': outs}
        (E / 'feature-summary.json').write_text(json.dumps(info, indent=2) + '\n')
        (E / 'feature-runs.json').write_text(json.dumps(outs, indent=2) + '\n')
        print(f'M12 cohort: {info["pass"]}/{info["fail"]} across {info["probes"]} probes; nonzero exits {info["completed_nonzero"]}', flush=True)
        bad = [o['name'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] or o['exit_code'] != 0]
        assert not bad, f'M12 cohort did not reproduce its own expected counts: {bad}'
        raise SystemExit(0)
    child = ['python3', 'analysis/run-m112-verification.py', '--suite', {'m112feature': 'feature'}.get(a.suite, a.suite)]
    r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-3000:], flush=True)
    print('M12 cohort artifacts: the delegated runner wrote its own evidence under analysis/evidence/', flush=True)
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
