#!/usr/bin/env python3
"""Fresh M71 vs shipped 184695d: four default profiles + two opt-in ladder
profiles, both arms separately measured on identical fixture bytes. Ladder
harness valuation is T1-only, NOT a simulation of partial/BE/runner management.
Frozen manifests cover every application source file; child output is verbatim.
"""
import concurrent.futures, hashlib, json, os, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
E = ROOT / 'analysis/evidence/m71'
STAGES = {
    'parent': Path(os.environ.get('M71_PARENT_APP', '/tmp/m71-control/extracted/tradejournal')),
    'm71': Path(os.environ.get('M71_FINAL_APP', '/tmp/m71-stage/app')),
}
PROFILES = {
    'bare': ['--seeds', '60', '--bars', '1500', '--window', '300'],
    'real15': ['--real', '--realtf', '15m', '--window', '300'],
    'native': ['--topdown', '--seeds', '10', '--bars', '1500', '--window', '300'],
    'real-native': ['--topdown', '--real', '--realtf', '5m', '--window', '300'],
    'ladder-bare': ['--ladder', '--seeds', '60', '--bars', '1500', '--window', '300'],
    'ladder-real15': ['--ladder', '--real', '--realtf', '15m', '--window', '300'],
}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(stage):
    manifest = json.loads((E / ('parent-source.json' if stage == 'parent' else 'final-source.json')).read_text())
    for p, digest in manifest.items(): assert sha(STAGES[stage] / p) == digest, (stage, p)
def inputs():
    data = json.loads((ROOT / 'analysis/evidence/m54-m77/INPUTS.json').read_text())
    for item in data['inputs']: assert sha(ROOT / 'analysis/fixtures' / item['file']) == item['sha256'], item['file']
    return {item['file']: item['sha256'] for item in data['inputs']}
def measure(stage, profile):
    verify(stage)
    cmd = ['node', str(ROOT / 'analysis/harness/backtest.js'), *PROFILES[profile]]
    env = {**os.environ, 'TJ_APP': str(STAGES[stage]), 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '',
           'TURSO_AUTH_TOKEN': '', 'TRADEJOURNAL_DB': f'/tmp/m71-profile-{stage}-{profile}.db'}
    start = time.monotonic()
    with (E / f'{stage}-{profile}.txt').open('wb') as out:
        result = subprocess.run(cmd, cwd=ROOT, env=env, stdout=out, stderr=subprocess.STDOUT)
    verify(stage)
    record = {'stage': stage, 'profile': profile, 'app': str(STAGES[stage]), 'command': cmd,
              'exit_code': result.returncode, 'seconds': round(time.monotonic() - start, 3),
              'stdout_sha256': sha(E / f'{stage}-{profile}.txt')}
    (E / f'run-{stage}-{profile}.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record), flush=True)
    return record

def main():
    E.mkdir(parents=True, exist_ok=True)
    for stage in STAGES: verify(stage)
    before = inputs()
    harness_files = ['harness/backtest.js', 'harness/synth.js', 'candle-shim.js']
    guard = {p: sha(ROOT / 'analysis' / p) for p in harness_files}
    (E / 'harness-source.json').write_text(json.dumps(guard, indent=2) + '\n')
    jobs = [(s, p) for p in PROFILES for s in STAGES]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(lambda task: measure(*task), jobs))
    assert inputs() == before
    assert {p: sha(ROOT / 'analysis' / p) for p in harness_files} == guard
    (E / 'measurement-runs.json').write_text(json.dumps(records, indent=2) + '\n')
    assert len(records) == 12 and all(r['exit_code'] == 0 for r in records), records
    print('M71: all twelve fresh runs completed; four default + two opt-in T1-valued profiles per arm.', flush=True)
if __name__ == '__main__': main()
