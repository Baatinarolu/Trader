#!/usr/bin/env python3
"""Verify EVERY stdout byte except the one elapsed-ms runtime field per profile.
Also recheck all four unchanged, ignored real-dataset bytes against their retained
M54/M77 provenance manifest. Does not normalize results, whitespace or thresholds.
"""
from pathlib import Path
import hashlib, json, re
ROOT = Path(__file__).resolve().parent.parent
E = ROOT / 'analysis/evidence/m78'
PROFILES = ['bare', 'real15', 'native', 'real-native']
def normalize(data): return re.sub(rb'(?<=  \xc2\xb7  )\d+ms\b', b'<elapsed-ms>', data)
def main():
    records = json.loads((E / 'measurement-runs.json').read_text())
    assert len(records) == 8 and all(r['exit_code'] == 0 for r in records)
    comparisons = []
    for profile in PROFILES:
        before, after = [(E / f'{stage}-{profile}.txt').read_bytes() for stage in ['parent', 'm78']]
        b, a = normalize(before), normalize(after)
        equal = b == a
        assert equal, profile + ': output differs beyond the elapsed runtime'
        comparisons.append({'profile': profile, 'equal_except_runtime': equal,
          'already_byte_equal': before == after, 'normalized_sha256': hashlib.sha256(a).hexdigest(),
          'runtime_fields_removed': [len(re.findall(rb'(?<=  \xc2\xb7  )\d+ms\b', data)) for data in [before, after]]})
    provenance = json.loads((ROOT / 'analysis/evidence/m54-m77/INPUTS.json').read_text())
    inputs = []
    for item in provenance['inputs']:
        p = ROOT / 'analysis/fixtures' / item['file']
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        assert digest == item['sha256'], str(p)
        inputs.append({'file': item['file'], 'sha256': digest, 'unchanged': True})
    out = {'parent_commit': '256299eb9425e3ed24c01a0599a4a73d0de8c319',
      'all_eight_runs_fresh': True, 'all_equal_except_runtime': True, 'profiles': comparisons,
      'inputs_provenance': 'analysis/evidence/m54-m77/INPUTS.json', 'inputs': inputs,
      'scope': 'No measured outcome improvement. Synthetic distorted; real outcomes dependent and below 30; native named outcomes zero.'}
    (E / 'outcome-invariance.json').write_text(json.dumps(out, indent=2) + '\n')
    print(json.dumps(out, indent=2))
if __name__ == '__main__': main()
