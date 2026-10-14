#!/usr/bin/env python3
"""M115 — the clean-rep count: its four probes, its frozen parent, and every cohort it sits on.

    python3 analysis/run-m115-verification.py --suite feature|control [--freeze-parents]
    python3 analysis/run-m115-verification.py --suite m13feature|m112feature|m111feature|m110feature|
                                                       m109feature|m108feature|m107feature|m106feature|
                                                       m105feature|raw|declared|pure|reviews|...

`feature` runs the four M115 probes against the actual b87e852 M13/M65 release as the parent guard and
writes analysis/evidence/m115/feature-summary.json. `control` runs the same probe against the parent in
both directions. Every other suite delegates to analysis/run-m13-verification.py (which itself delegates
the inherited cohorts to their own unchanged runners), so the inherited marks are read from their own
evidence files rather than re-derived here.
"""
from pathlib import Path
import argparse, json, os, subprocess, tarfile, io, hashlib
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m115'
# git is asked for the parent by its unambiguous abbreviation (asserted below to resolve to the full
# SHA): this sandbox is a partial clone whose lazy fetch is not always available, while the short form
# resolves from the local commit-graph. The identity stays pinned to the full SHA.
M115_BASE = 'b87e85214e06509350d005506028a543ffc2468c'
M115_BASE_SHORT = 'b87e852'
PARENT = Path('/tmp/m115-parent/app')
M115_FEATURE = [('pure', 'probe-m115-pure.js', 41), ('api', 'probe-m115-api.js', 30), ('migration', 'probe-m115-migration.js', 18), ('ui', 'probe-m115-ui.js', 27)]
M115_CONTROL = [('delivered', 13, 0), ('parent', 13, 0)]
DELEGATED = ['m13feature', 'm112feature', 'm111feature', 'm110feature', 'm109feature', 'm108feature', 'm107feature', 'm106feature',
             'm105feature', 'raw', 'declared', 'pure', 'offline', 'market', 'live-provider', 'reports', 'screenshots',
             'confluences', 'emotions', 'process', 'behavior', 'reviews', 'opportunities', 'changes', 'execution', 'routine']
SCOPE = ('REPORTED completed assertions; literal clocks, saved rows, HTTP and a real DOM only. The count of RECORDED clean reps for the '
         'trader\u2019s own account: the three criteria Ep 32 names (plan-aligned, executed cleanly, journalled on the close day) read as '
         'recorded facts from the trades the app already stores, its own checklist rows, its own hash-verified journal acknowledgement and '
         'its own execution review. TRADES are counted, never calendar days; the start and the target are the trader\u2019s own two settings '
         'values (no schema object, no backfill); an unstarted count is `counted:null` and an unreadable read is `unavailable`, never 0. '
         'No broker, provider, mental-state, pixel or production proof, and NO causal claim joining a rep to a result (the payload says so). '
         'RAW failures/early aborts and DECLARED assumptions stay separate. DECLARED NEGATIVE carried here by name: the inherited M99/M101 '
         'reviews cohort is STALE at this HEAD \u2014 157/3 against its committed 159/1 (migration 12/3), because the schema grew after M101 '
         '(accounts 26->36 columns and 10 delivered-only tables), which the M108-era evidence did not contain. The three gaps are declared '
         'here, not repaired in the probe.')


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
    assert subprocess.run(['git', 'rev-parse', M115_BASE_SHORT], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout.decode().strip() == M115_BASE, 'the abbreviated parent does not resolve to the pinned M13/M65 SHA'
    tar = subprocess.run(['git', 'archive', '--format=tar', M115_BASE_SHORT, 'extracted/tradejournal'], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(tar)) as t:
        for ent in t.getmembers():
            if ent.isfile():
                rel = Path(ent.name).relative_to('extracted/tradejournal')
                dest = PARENT / rel; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(t.extractfile(ent).read())
    nm = PARENT / 'node_modules'
    if not nm.exists(): nm.symlink_to(APP / 'node_modules')
    assert not (PARENT / 'src/challenge.js').exists(), 'the M115 parent must not already ship the clean-rep count'
    assert (PARENT / 'src/periods.js').exists() and (PARENT / 'src/period-reviews.js').exists() and (PARENT / 'src/journaling.js').exists() and (PARENT / 'src/execution-review.js').exists(), 'the M115 parent is the b87e852 M13/M65 release: it already has the journal acknowledgement, the execution review and the review periods'
    d = digest(PARENT)
    if guard.exists():
        frozen = read(guard)
        if frozen != d:
            (Path('/tmp/m115-parent-mismatch.json')).write_text(json.dumps({'frozen': frozen, 'current': d}, indent=2) + '\n')
            raise AssertionError('M115 parent tree changed: see /tmp/m115-parent-mismatch.json')
        print(f'M115 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n'); print(f'created parent-source.json from the actual {M115_BASE_SHORT} M13/M65 release tree ({len(d)} files)', flush=True)


def feature(row):
    n, s, p = row
    result = E / ('m115feature-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'TJ_PARENT': str(PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'M115_RESULT': str(result), 'M111_RESULT': str(result)}
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
    output = 'm115feature-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        print(f'm115feature/{n}: NO SUMMARY, exit={run.returncode}', flush=True)
        return {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': 0, 'exit_code': run.returncode, 'status': 'completed', 'output': output}
    d = json.loads(result.read_text())
    print(f'm115feature/{n}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
    return {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': 0, 'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True)
    ap.add_argument('--freeze-parents', action='store_true'); a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parent()
    if a.suite == 'feature':
        outs = [feature(r) for r in M115_FEATURE]
        info = {'app': str(APP), 'suite': 'feature', 'parent': str(PARENT), 'pass': sum(o['pass'] or 0 for o in outs), 'fail': sum(o['fail'] or 0 for o in outs),
                'probes': len(outs), 'completed_nonzero': sum(o['exit_code'] not in (0, None) for o in outs), 'timeout_no_exit': 0,
                'summaryless': sum(o['pass'] is None for o in outs), 'scope': SCOPE, 'runs': outs}
        (E / 'feature-summary.json').write_text(json.dumps(info, indent=2) + '\n')
        (E / 'feature-runs.json').write_text(json.dumps(outs, indent=2) + '\n')
        print(f'M115 cohort: {info["pass"]}/{info["fail"]} across {info["probes"]} probes; nonzero exits {info["completed_nonzero"]}', flush=True)
        bad = [o['name'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] or o['exit_code'] != 0]
        assert not bad, f'M115 cohort did not reproduce its own expected counts: {bad}'
        raise SystemExit(0)
    if a.suite == 'control':
        outs = []
        for mode, pass_n, fail_n in M115_CONTROL:
            result = E / f'm115control-{mode}-results.json'
            env = {**os.environ, 'M115_CONTROL_MODE': mode, 'M115_RESULT': str(result), 'M111_RESULT': str(result),
                   'TJ_APP': str(APP if mode == 'delivered' else PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': ''}
            run = subprocess.run(['node', 'analysis/probe-m115-control.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
            (E / f'm115control-{mode}.txt').write_bytes(run.stdout)
            d = json.loads(result.read_text()) if result.exists() else {'pass': None, 'fail': None}
            print(f'm115control/{mode}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
            outs.append({'mode': mode, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': pass_n, 'expected_fail': fail_n, 'exit_code': run.returncode})
        (E / 'control-results.json').write_text(json.dumps({'suite': 'control', 'runs': outs}, indent=2) + '\n')
        bad = [o['mode'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] != o['expected_fail'] or o['exit_code'] != 0]
        assert not bad, f'M115 control did not reproduce its own expected counts: {bad}'
        print(f'M115 control: {sum(o["pass"] for o in outs)}/{sum(o["fail"] for o in outs)} across {len(outs)} modes', flush=True)
        raise SystemExit(0)
    assert a.suite in DELEGATED, f'unknown M115 suite {a.suite!r}'
    # `m13feature` is THIS milestone's parent cohort: the M13/M65 runner knows its own feature suite by
    # the name `feature`, and every other name is forwarded to it unchanged (it delegates the inherited
    # cohorts further, to their own runners, so no cohort is re-implemented here).
    child = ['python3', 'analysis/run-m13-verification.py', '--suite', {'m13feature': 'feature'}.get(a.suite, a.suite)]
    r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-3000:], flush=True)
    print('M115 cohort artifacts: the delegated runner wrote its own evidence under analysis/evidence/', flush=True)
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
