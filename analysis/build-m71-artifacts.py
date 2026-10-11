#!/usr/bin/env python3
"""Guarded M71 independent stage patches, cumulative pristine diff, clean
forward/reverse byte proofs and deterministic final source ZIP. Historical
M54/M77/M75/M76/M78 patches remain untouched. Route fixes have their own stages.
"""
from pathlib import Path, PurePosixPath
import hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile
ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m71'; P = ROOT / 'analysis/patches'
BASE = '184695db783c869b0e4e330cc68c0386914c8581'
ns = {'__file__': str(ROOT / 'analysis/build-m54-m77-artifacts.py'), '__name__': 'artifact_helpers'}
exec(compile(Path(ns['__file__']).read_text(), ns['__file__'], 'exec'), ns)
make_patch, contents, allowed, add_zip = [ns[k] for k in ['make_patch', 'contents', 'allowed', 'add_zip']]
def run(args, cwd=ROOT): return subprocess.run(args, cwd=cwd, check=True, capture_output=True).stdout
def sha(b): return hashlib.sha256(b).hexdigest()
def write(dest, p, b):
    rel = PurePosixPath(p); assert not rel.is_absolute() and '..' not in rel.parts
    t = dest / str(rel); t.parent.mkdir(parents=True, exist_ok=True); t.write_bytes(b)
def meta(p):
    b = p.read_bytes(); return {'files': b.count(b'diff --git '), 'bytes': len(b), 'sha256': sha(b), 'roundtrip_differences': 0}
def check_replay(before, after, patch, work):
    replay = work / ('replay-' + patch.stem); shutil.copytree(before, replay)
    run(['git', 'apply', '--check', str(patch)], replay); run(['git', 'apply', str(patch)], replay)
    assert contents(replay) == contents(after)
    run(['git', 'apply', '-R', '--check', str(patch)], replay); run(['git', 'apply', '-R', str(patch)], replay)
    assert contents(replay) == contents(before)
def main():
    manifests = {n: json.loads((E / f'{n}-source.json').read_text()) for n in ['parent', 'final', 'floor', 'window', 'full']}
    # 'final' is the frozen PRIMARY engine stage measured in twelve harness runs;
    # 'full' adds the independent route reads and tested legacy clipboard fallback.
    guard = manifests['full']
    assert all(sha((APP / p).read_bytes()) == d for p, d in guard.items())
    runs = json.loads((E / 'measurement-runs.json').read_text())
    assert len(runs) == 12 and all(r['exit_code'] == 0 for r in runs)
    assert len({(r['stage'], r['profile']) for r in runs}) == 12
    for r in runs: assert sha((E / f"{r['stage']}-{r['profile']}.txt").read_bytes()) == r['stdout_sha256']
    comparison = json.loads((E / 'outcome-comparison.json').read_text())
    assert comparison['all_twelve_runs_fresh'] and comparison['default_profiles_unchanged_except_runtime']
    for p, d in json.loads((E / 'harness-source.json').read_text()).items(): assert sha((ROOT / 'analysis' / p).read_bytes()) == d
    for f in ['core-results.json', 'consumers-results.json', 'settings-results.json', 'copy-results.json']:
        assert json.loads((E / f).read_text())['fail'] == 0, f
    assert not json.loads((E / 'default-neutrality-results.json').read_text())['unexpected_differences']
    with tempfile.TemporaryDirectory(prefix='tj-m71-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for ent in t:
                if ent.isfile():
                    p = PurePosixPath(ent.name).relative_to('extracted/tradejournal')
                    assert allowed(p) or str(p).startswith('scripts/fixtures/'), p
                    write(parent, p, t.extractfile(ent).read())
        assert {p: sha(b) for p, b in contents(parent).items()} == manifests['parent']
        # Reconstruct all immutable intermediate files, not from a mutable /tmp.
        primary = work / 'primary'; shutil.copytree(parent, primary)
        legacy_fallback = ": lv.rr_primary != null ? ` | first-target ${Number(lv.rr_primary).toFixed(2)}R` : '';"
        compatible_fallback = ": lv.rr_primary != null ? ` | first-target ${Number(lv.rr_primary).toFixed(2)}R` : lv.rr_final != null ? ` | final ${Number(lv.rr_final).toFixed(2)}R (legacy payout; not floor evidence)` : '';"
        for p in ['src/bots/setup.js', 'public/js/tv.js', 'public/js/views/bots.js']:
            b = (APP / p).read_bytes()
            if p == 'public/js/tv.js':
                assert compatible_fallback in b.decode()
                b = b.decode().replace(compatible_fallback, legacy_fallback, 1).encode()
            write(primary, p, b)
        assert {p: sha(b) for p, b in contents(primary).items()} == manifests['final']
        floor = work / 'floor'; shutil.copytree(primary, floor)
        route = 'src/routes/bots.js'; old = (floor / route).read_text(); start = old.index('async function floorOf(req)')
        needle = "const row = await db.prepare('SELECT settings FROM users WHERE id=?').get(req.user.id);"
        assert needle in old[start:]
        fixed = old[:start] + old[start:].replace(needle, needle.replace('await db.', 'await D.db.'), 1)
        write(floor, route, fixed.encode())
        assert {p: sha(b) for p, b in contents(floor).items()} == manifests['floor']
        window = work / 'window'; shutil.copytree(floor, window)
        write(window, route, (APP / route).read_bytes())
        assert {p: sha(b) for p, b in contents(window).items()} == manifests['window']
        full = work / 'full'; shutil.copytree(window, full)
        write(full, 'public/js/tv.js', (APP / 'public/js/tv.js').read_bytes())
        assert {p: sha(b) for p, b in contents(full).items()} == guard
        stages = [('m71-primary-rr.patch', parent, primary), ('m71-saved-floor.patch', primary, floor),
                  ('m26-saved-window-regression.patch', floor, window),
                  ('m71-copy-compatibility.patch', window, full), ('m71-complete.patch', parent, full)]
        for name, before, after in stages:
            make_patch(before, after, P / name); check_replay(before, after, P / name, work)
        pristine = work / 'pristine'; pristine.mkdir()
        with zipfile.ZipFile(ROOT / 'tradingpro-main.zip') as z:
            for ent in z.infolist():
                if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
                    p = PurePosixPath(ent.filename).relative_to('tradejournal')
                    if allowed(p) or str(p).startswith('scripts/fixtures/'): write(pristine, p, z.read(ent))
        fixed = work / 'fixed'; shutil.copytree(pristine, fixed)
        for p in guard: write(fixed, p, (APP / p).read_bytes())
        assert (pristine / 'package-lock.json').read_bytes() == (fixed / 'package-lock.json').read_bytes()
        make_patch(pristine, fixed, P / 'applied-so-far.patch')
        check_replay(pristine, fixed, P / 'applied-so-far.patch', work)
        manifest = {'base_commit': BASE,
          'stage_source_manifests': ['parent-source.json', 'final-source.json', 'floor-source.json', 'window-source.json', 'full-source.json'],
          'patches': {name: meta(P / name) for name in [s[0] for s in stages] + ['applied-so-far.patch']},
          'fixed_zip': {'source_files': len(contents(fixed)), 'roundtrip_differences': 0},
          'measurement': 'Twelve fresh engine runs: four default profiles unchanged except runtime; two optional T1-valued profiles per arm. Saved floor/M26 window reads and clipboard compatibility measured in independent stages.',
          'scope': 'Primary minimum RR, not artificial target/stop shrinking. API default1/direct Setup2/configured floors preserved; restored saved setting reads. No market edge or managed ladder expectancy claim.'}
        (P / 'M71-STAGES.json').write_text(json.dumps(manifest, indent=2) + '\n')
        paths = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', 'analysis']).decode().split('\0')
        excluded = 'analysis/evidence/m71/archive-sha256.json'
        with zipfile.ZipFile(ROOT / 'tradingpro-fixed.zip', 'w') as z:
            for p, b in contents(fixed).items(): add_zip(z, 'tradingpro-fixed/tradejournal/' + p, b)
            for p in sorted({p for p in paths if p and p != excluded}):
                source = ROOT / p
                if source.is_file() and allowed(PurePosixPath(p)): add_zip(z, 'tradingpro-fixed/' + p, source.read_bytes())
        with zipfile.ZipFile(ROOT / 'tradingpro-fixed.zip') as z:
            actual = {n.removeprefix('tradingpro-fixed/tradejournal/'): z.read(n) for n in z.namelist()
                      if n.startswith('tradingpro-fixed/tradejournal/')}
            assert actual == contents(fixed)
            assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n for n in z.namelist())
        archive = ROOT / 'tradingpro-fixed.zip'
        # Outside the ZIP to avoid a circular self-hash; deterministic repeated builds.
        (ROOT / excluded).write_text(json.dumps({'file': archive.name, 'bytes': archive.stat().st_size,
          'sha256': sha(archive.read_bytes()), 'source_files': len(actual), 'excluded_from_zip_to_avoid_self_hash': True}, indent=2) + '\n')
        print(json.dumps(manifest, indent=2)); print('ZIP application byte roundtrip: 0 differences;', len(actual), 'source files')
        print((ROOT / excluded).read_text())
if __name__ == '__main__': main()
