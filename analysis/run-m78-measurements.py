#!/usr/bin/env python3
"""Fresh, separately measured M78 vs shipped 256299e on identical four profiles.
Requires archived/frozen apps + deps in /tmp (or overrides below); raw stdout is
retained verbatim. No datasets, account DBs or credentials are written to Git.
"""
import concurrent.futures, hashlib, json, os, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / 'analysis/evidence/m78'
STAGES = {
    'parent': Path(os.environ.get('M78_PARENT_APP', '/tmp/m78-control/extracted/tradejournal')),
    'm78': Path(os.environ.get('M78_FINAL_APP', '/tmp/m78-stage/app')),
}
PROFILES = {
    'bare': ['--seeds', '60', '--bars', '1500', '--window', '300'],
    'real15': ['--real', '--realtf', '15m', '--window', '300'],
    'native': ['--topdown', '--seeds', '10', '--bars', '1500', '--window', '300'],
    'real-native': ['--topdown', '--real', '--realtf', '5m', '--window', '300'],
}
def verify(stage):
    manifest = json.loads((EVIDENCE / ('parent-source.json' if stage == 'parent' else 'final-source.json')).read_text())
    for p, digest in manifest.items():
        assert hashlib.sha256((STAGES[stage] / p).read_bytes()).hexdigest() == digest, (stage, p)

def measure(stage, profile):
    verify(stage)
    cmd = ['node', str(ROOT / 'analysis/harness/backtest.js'), *PROFILES[profile]]
    env = {**os.environ, 'TJ_APP': str(STAGES[stage]), 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '',
           'TURSO_AUTH_TOKEN': '', 'TRADEJOURNAL_DB': f'/tmp/m78-profile-{stage}-{profile}.db'}
    start = time.monotonic()
    with (EVIDENCE / f'{stage}-{profile}.txt').open('wb') as output:
        result = subprocess.run(cmd, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
    verify(stage)
    record = {'stage': stage, 'profile': profile, 'app': str(STAGES[stage]),
              'command': cmd, 'exit_code': result.returncode, 'seconds': round(time.monotonic() - start, 3),
              'stdout_sha256': hashlib.sha256((EVIDENCE / f'{stage}-{profile}.txt').read_bytes()).hexdigest()}
    print(json.dumps(record), flush=True)
    return record

def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for stage in STAGES: verify(stage)
    # Four concurrent children on the same two-core host; controls/final have
    # identical limits. This changes elapsed time only, not candle clocks.
    jobs = [(s, p) for p in PROFILES for s in STAGES]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(lambda task: measure(*task), jobs))
    (EVIDENCE / 'measurement-runs.json').write_text(json.dumps(records, indent=2) + '\n')
    assert all(r['exit_code'] == 0 for r in records), records
    print('M78: all eight fresh profile runs completed successfully', flush=True)

if __name__ == '__main__': main()
