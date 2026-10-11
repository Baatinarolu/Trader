#!/usr/bin/env python3
"""M75/M76 milestone artifacts. Uses durable stage patches after first build.
Source ZIP excludes credentials, runtime DBs, dependencies and downloaded data.
"""
from pathlib import Path, PurePosixPath
import hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile

ROOT = Path(__file__).resolve().parent.parent
# Reuse the already-verified fresh-tree diff/apply/reverse machinery, not its
# historical M54/M77 main() or source guard. No old stage artifact is overwritten.
ns = {'__file__': str(ROOT / 'analysis/build-m54-m77-artifacts.py'), '__name__': 'artifact_helpers'}
exec(compile((ROOT / 'analysis/build-m54-m77-artifacts.py').read_text(), ns['__file__'], 'exec'), ns)
make_patch, contents, allowed, add_zip = [ns[k] for k in ['make_patch', 'contents', 'allowed', 'add_zip']]
BASE = '9f629c1'
PATCHES = ROOT / 'analysis/patches'
APP = ROOT / 'extracted/tradejournal'

def run(args, cwd=ROOT):
    return subprocess.run(args, cwd=cwd, capture_output=True, check=True).stdout

def sha(data): return hashlib.sha256(data).hexdigest()

def write(dest, rel, data):
    p = dest / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)

def apply(dest, patch):
    run(['git', 'apply', '--check', str(patch)], dest)
    run(['git', 'apply', str(patch)], dest)

def meta(patch):
    b = patch.read_bytes()
    return {'files': b.count(b'diff --git '), 'bytes': len(b), 'sha256': sha(b), 'roundtrip_differences': 0}

def main():
    files = run(['git', 'ls-files', '-z', 'extracted/tradejournal']).decode().split('\0')
    rel = sorted({str(PurePosixPath(p).relative_to('extracted/tradejournal')) for p in files if p}
                 | {'src/bots/protected.js', 'src/bots/stops.js'})
    for p, digest in json.loads((ROOT / 'analysis/evidence/m75-m76/final-source.json').read_text()).items():
        assert sha((APP / p).read_bytes()) == digest, p
    with tempfile.TemporaryDirectory(prefix='tj-m75-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for e in t:
                if e.isfile():
                    p = str(PurePosixPath(e.name).relative_to('extracted/tradejournal'))
                    assert allowed(PurePosixPath(p)) or p.startswith('scripts/fixtures/')
                    write(parent, p, t.extractfile(e).read())
        final = work / 'final'; shutil.copytree(parent, final)
        for p in rel: write(final, p, (APP / p).read_bytes())
        m76patch = PATCHES / 'm76-protected.patch'
        if not m76patch.exists():
            stage = work / 'm76-bootstrap'; shutil.copytree(parent, stage)
            for p in rel:
                source = Path('/tmp/m76-stage/app') / p
                if source.is_file(): write(stage, p, source.read_bytes())
            make_patch(parent, stage, m76patch)
        m76 = work / 'm76'; shutil.copytree(parent, m76); apply(m76, m76patch)
        make_patch(parent, final, PATCHES / 'm75-m76-complete.patch')
        make_patch(m76, final, PATCHES / 'm75-stop-policy.patch')
        # Stage patches must reproduce their source and reverse to the parent.
        for patch, before, after in [(m76patch, parent, m76),
            (PATCHES / 'm75-m76-complete.patch', parent, final),
            (PATCHES / 'm75-stop-policy.patch', m76, final)]:
            d = work / (patch.stem + '-check'); shutil.copytree(before, d); apply(d, patch)
            assert contents(d) == contents(after)
            run(['git', 'apply', '-R', '--check', str(patch)], d)
            run(['git', 'apply', '-R', str(patch)], d)
            assert contents(d) == contents(before)
        pristine = work / 'pristine'; pristine.mkdir()
        with zipfile.ZipFile(ROOT / 'tradingpro-main.zip') as z:
            for e in z.infolist():
                if not e.is_dir() and e.filename.startswith('tradejournal/'):
                    p = PurePosixPath(e.filename).relative_to('tradejournal')
                    if allowed(p) or str(p).startswith('scripts/fixtures/'): write(pristine, str(p), z.read(e))
        fixed = work / 'fixed'; shutil.copytree(pristine, fixed)
        for p in rel: write(fixed, p, (APP / p).read_bytes())
        make_patch(pristine, fixed, PATCHES / 'applied-so-far.patch')
        manifest = {'base_commit': run(['git', 'rev-parse', BASE]).decode().strip(),
            'patches': {name: meta(PATCHES / name) for name in ['m76-protected.patch',
                'm75-stop-policy.patch', 'm75-m76-complete.patch', 'applied-so-far.patch']},
            'stage_base': {'m75-stop-policy.patch': 'm76-protected.patch'},
            'fixed_zip': {'source_files': len(contents(fixed)), 'roundtrip_differences': 0},
            'notes': ['M76 measured separately; all four profile outputs unchanged except runtime.',
                'M75 complete stop/consumer stage measured separately; negative outcomes retained.',
                'Source guards and original stage hashes are in analysis/evidence/m75-m76.',
                'Fresh parent bare/real15 controls rerun; native control stdout reused from prior validated parent geometry.']}
        (PATCHES / 'M75-M76-STAGES.json').write_text(json.dumps(manifest, indent=2) + '\n')
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
