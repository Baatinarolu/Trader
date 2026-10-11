#!/usr/bin/env python3
"""Durable M78 patch, fresh clean apply/reverse, pristine diff and fixed source ZIP.
Never overwrites historical M54/M77 or M75/M76 stage patches. Run after all eight
measurements complete; source bytes must still match the frozen measured manifest.
"""
from pathlib import Path, PurePosixPath
import hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile
ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'extracted/tradejournal'
PATCHES = ROOT / 'analysis/patches'
EVIDENCE = ROOT / 'analysis/evidence/m78'
BASE = '256299eb9425e3ed24c01a0599a4a73d0de8c319'
# Load only fresh-tree helper functions, not the historical builder's main/guard.
ns = {'__file__': str(ROOT / 'analysis/build-m54-m77-artifacts.py'), '__name__': 'artifact_helpers'}
exec(compile((ROOT / 'analysis/build-m54-m77-artifacts.py').read_text(), ns['__file__'], 'exec'), ns)
make_patch, contents, allowed, add_zip = [ns[k] for k in ['make_patch', 'contents', 'allowed', 'add_zip']]
def run(args, cwd=ROOT): return subprocess.run(args, cwd=cwd, check=True, capture_output=True).stdout
def sha(data): return hashlib.sha256(data).hexdigest()
def write(dest, rel, data):
    p = PurePosixPath(rel); assert not p.is_absolute() and '..' not in p.parts
    target = dest / str(p); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
def meta(path):
    b = path.read_bytes()
    return {'files': b.count(b'diff --git '), 'bytes': len(b), 'sha256': sha(b), 'roundtrip_differences': 0}
def main():
    guard = json.loads((EVIDENCE / 'final-source.json').read_text())
    for p, digest in guard.items(): assert sha((APP / p).read_bytes()) == digest, p
    records = json.loads((EVIDENCE / 'measurement-runs.json').read_text())
    assert len(records) == 8 and all(r['exit_code'] == 0 for r in records)
    assert len({(r['stage'], r['profile']) for r in records}) == 8
    for r in records:
        assert sha((EVIDENCE / f"{r['stage']}-{r['profile']}.txt").read_bytes()) == r['stdout_sha256']
    equality = json.loads((EVIDENCE / 'outcome-invariance.json').read_text())
    assert equality['all_equal_except_runtime'] is True
    with tempfile.TemporaryDirectory(prefix='tj-m78-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for entry in t:
                if entry.isfile():
                    p = PurePosixPath(entry.name).relative_to('extracted/tradejournal')
                    assert allowed(p) or str(p).startswith('scripts/fixtures/'), p
                    write(parent, str(p), t.extractfile(entry).read())
        # Reconstructed parent must match the source that was actually measured.
        old = json.loads((EVIDENCE / 'parent-source.json').read_text())
        assert {p: sha(b) for p, b in contents(parent).items()} == old
        final = work / 'final'; shutil.copytree(parent, final)
        for p in guard: write(final, p, (APP / p).read_bytes())
        assert set(contents(final)) == set(guard)
        make_patch(parent, final, PATCHES / 'm78-entry-preference.patch')
        # make_patch already verifies forward+reverse byte equality. Independently
        # reconstruct the durable delta without relying on a mutable /tmp stage.
        replay = work / 'replay'; shutil.copytree(parent, replay)
        patch = PATCHES / 'm78-entry-preference.patch'
        run(['git', 'apply', '--check', str(patch)], replay); run(['git', 'apply', str(patch)], replay)
        assert contents(replay) == contents(final)
        run(['git', 'apply', '-R', '--check', str(patch)], replay); run(['git', 'apply', '-R', str(patch)], replay)
        assert contents(replay) == contents(parent)
        pristine = work / 'pristine'; pristine.mkdir()
        with zipfile.ZipFile(ROOT / 'tradingpro-main.zip') as z:
            for entry in z.infolist():
                if not entry.is_dir() and entry.filename.startswith('tradejournal/'):
                    p = PurePosixPath(entry.filename).relative_to('tradejournal')
                    if allowed(p) or str(p).startswith('scripts/fixtures/'): write(pristine, str(p), z.read(entry))
        fixed = work / 'fixed'; shutil.copytree(pristine, fixed)
        for p in guard: write(fixed, p, (APP / p).read_bytes())
        assert (pristine / 'package-lock.json').read_bytes() == (fixed / 'package-lock.json').read_bytes()
        make_patch(pristine, fixed, PATCHES / 'applied-so-far.patch')
        manifest = {'base_commit': BASE,
            'patches': {name: meta(PATCHES / name) for name in ['m78-entry-preference.patch', 'applied-so-far.patch']},
            'fixed_zip': {'source_files': len(contents(fixed)), 'roundtrip_differences': 0},
            'measurement': 'Eight fresh runs; all four profiles equal parent except elapsed runtime.',
            'scope': 'Structure-based entry preference; current execution geometry remains candidate-owned; no proprietary shortcut.'}
        (PATCHES / 'M78-STAGES.json').write_text(json.dumps(manifest, indent=2) + '\n')
        paths = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', 'analysis']).decode().split('\0')
        with zipfile.ZipFile(ROOT / 'tradingpro-fixed.zip', 'w') as z:
            for p, b in contents(fixed).items(): add_zip(z, 'tradingpro-fixed/tradejournal/' + p, b)
            for p in sorted({p for p in paths if p}):
                source = ROOT / p
                if source.is_file() and allowed(PurePosixPath(p)): add_zip(z, 'tradingpro-fixed/' + p, source.read_bytes())
        with zipfile.ZipFile(ROOT / 'tradingpro-fixed.zip') as z:
            actual = {n.removeprefix('tradingpro-fixed/tradejournal/'): z.read(n) for n in z.namelist()
                      if n.startswith('tradingpro-fixed/tradejournal/')}
            assert actual == contents(fixed)
            assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n for n in z.namelist())
        print(json.dumps(manifest, indent=2))
        print('ZIP application byte roundtrip: 0 differences;', len(actual), 'source files')
if __name__ == '__main__': main()
