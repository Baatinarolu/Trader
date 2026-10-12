#!/usr/bin/env python3
"""Freeze actual app bytes in a guarded M93 stage. Temp trees are test-only."""
from pathlib import Path
import subprocess,json,hashlib,sys
root=Path(__file__).resolve().parent.parent;app=root/'extracted/tradejournal';name=sys.argv[1];dest=Path('/tmp')/('m93-'+name+'-stage')/'app';dest.mkdir(parents=True,exist_ok=True);f=root/'analysis/evidence/m93'/f'{name}-source.json';d={}
for p in sorted(set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','extracted/tradejournal'],cwd=root).decode().split('\0'))-{''}):
 r=p.removeprefix('extracted/tradejournal/');b=(root/p).read_bytes();q=dest/r;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);d[r]=hashlib.sha256(b).hexdigest()
if f.exists():assert json.loads(f.read_text())==d,'Do not rewrite a measured historical stage'
else:f.write_text(json.dumps(d,indent=2)+'\n')
l=dest/'node_modules'
if not l.exists():l.symlink_to(app/'node_modules',target_is_directory=True)
print(name,len(d),dest)
