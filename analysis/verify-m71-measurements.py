#!/usr/bin/env python3
"""Verify twelve fresh run records/output hashes, four full default invariances,
retained opt-in T1-only differences, frozen app/harness bytes and unchanged data.
No favourable-result assertion, elapsed time is the ONLY normalized output field.
"""
from pathlib import Path
import hashlib, json, re
ROOT = Path(__file__).resolve().parent.parent
E = ROOT / 'analysis/evidence/m71'
DEFAULT = ['bare', 'real15', 'native', 'real-native']
OPTIONAL = ['ladder-bare', 'ladder-real15']
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def normalize(b): return re.sub(rb'(?<=  \xc2\xb7  )\d+ms\b', b'<elapsed-ms>', b)
def summary(data):
    line = re.search(rb'^  n=\s*(\d+)\s+win=\s*([\d.]+)%\s+exp=([+\-\d.]+)R\s+PF=([\d.]+|inf)', data, re.M)
    if not line:
        assert re.search(rb'^  n=0$', data, re.M)
        return {'n': 0, 'win_pct': None, 'expectancy_r': None, 'pf': None}
    n, win, exp, pf = [v.decode() for v in line.groups()]
    return {'n': int(n), 'win_pct': float(win), 'expectancy_r': float(exp), 'pf': pf if pf == 'inf' else float(pf)}
def main():
    runs = json.loads((E / 'measurement-runs.json').read_text())
    assert len(runs) == 12 and all(r['exit_code'] == 0 for r in runs)
    assert {(r['stage'], r['profile']) for r in runs} == {(s, p) for s in ['parent', 'm71'] for p in DEFAULT + OPTIONAL}
    for r in runs: assert sha(E / f"{r['stage']}-{r['profile']}.txt") == r['stdout_sha256']
    for manifest, app in [('parent-source.json', '/tmp/m71-control/extracted/tradejournal'),
                          ('final-source.json', '/tmp/m71-stage/app'),
                          ('floor-source.json', '/tmp/m71-floor-stage/app'),
                          ('window-source.json', '/tmp/m71-window-stage/app'),
                          ('full-source.json', '/tmp/m71-final-stage/app')]:
        for p, digest in json.loads((E / manifest).read_text()).items(): assert sha(Path(app) / p) == digest, (manifest, p)
    for p, digest in json.loads((E / 'full-source.json').read_text()).items(): assert sha(ROOT / 'extracted/tradejournal' / p) == digest, p
    for p, digest in json.loads((E / 'harness-source.json').read_text()).items(): assert sha(ROOT / 'analysis' / p) == digest, p
    comparisons = []
    for profile in DEFAULT + OPTIONAL:
        before, after = [(E / f'{stage}-{profile}.txt').read_bytes() for stage in ['parent', 'm71']]
        b, a = normalize(before), normalize(after)
        equal = b == a
        if profile in DEFAULT: assert equal, profile + ': default output changed beyond elapsed time'
        comparisons.append({'profile': profile, 'default': profile in DEFAULT,
          'equal_except_runtime': equal, 'already_byte_equal': before == after,
          'runtime_fields_removed': [len(re.findall(rb'(?<=  \xc2\xb7  )\d+ms\b', data)) for data in [before, after]],
          'before': summary(before), 'after': summary(after),
          'valuation': 'T1 only; optional ladder does not simulate partial/BE/runner management',
          'same_after_output_as_default_except_runtime': profile in OPTIONAL and a == normalize((E / ('m71-bare.txt' if profile == 'ladder-bare' else 'm71-real15.txt')).read_bytes())})
    provenance = json.loads((ROOT / 'analysis/evidence/m54-m77/INPUTS.json').read_text())
    inputs = []
    for row in provenance['inputs']:
        assert sha(ROOT / 'analysis/fixtures' / row['file']) == row['sha256'], row['file']
        inputs.append({'file': row['file'], 'sha256': row['sha256'], 'unchanged': True})
    for file in ['core-results.json', 'consumers-results.json', 'settings-results.json', 'copy-results.json']:
        assert json.loads((E / file).read_text())['fail'] == 0, file
    assert json.loads((E / 'default-neutrality-results.json').read_text())['unexpected_differences'] == []
    out = {'parent_commit': '184695db783c869b0e4e330cc68c0386914c8581',
      'all_twelve_runs_fresh': True, 'default_profiles_unchanged_except_runtime': True,
      'engine_stage': 'm71 primary RR (final-source.json); two route config stages separately authenticated/SQL-tested; clipboard fallback independently tested',
      'profiles': comparisons, 'inputs_provenance': 'analysis/evidence/m54-m77/INPUTS.json', 'inputs': inputs,
      'scope': 'No default outcome improvement. Optional ladder uses T1-only diagnostic, not managed expectancy or paired fixed cohort. Synthetic distorted; real dependent; native outcomes zero.'}
    (E / 'outcome-comparison.json').write_text(json.dumps(out, indent=2) + '\n')
    print(json.dumps(out, indent=2))
if __name__ == '__main__': main()
