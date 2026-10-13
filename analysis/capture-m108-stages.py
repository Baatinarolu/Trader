#!/usr/bin/env python3
"""Capture the M108 stage trees, their source guards and the control runs.

The M108 implementation is delivered as one working tree, so the stages below are
*constructed* from the delivered files rather than sampled mid-edit: each stage tree is
the parent plus exactly the files listed for it, and the `policy` stage additionally
carries the pre-hardening practice module (a day view that counted a stored row it could
not read back as a recorded session, and an empty optional intention line refused as an
error) so the later hardening stage is a measured fix rather than a claim. Every tree is
hashed into `analysis/evidence/m108/<stage>-source.json`; the build script re-derives the
same trees from the saved patches and asserts the digests.

    python3 analysis/capture-m108-stages.py
    python3 analysis/capture-m108-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m108'
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='capture_helpers')
manifest=H['manifest'];write=H['write'];sha=H['sha'];read=H['read']
PARENT=Path('/tmp/m108-parent/app')
STAGES=[('policy',[]),('api',[]),('hardening',[]),('ui',[]),('documentation',[])]
FILES={
 'policy':['src/practice.js','src/db.js'],
 'api':['src/routes/api.js'],
 'hardening':['src/practice.js'],
 'ui':['public/index.html','public/js/views/practice.js','public/js/views/dashboard.js','public/js/views/journal.js','public/js/views/settings.js'],
 'documentation':['README.md','docs/API.md'],
}
BLANK_GUARD = """  /* Leaving the field empty is the normal case for an optional line, not an error. */
  if (typeof value === 'string' && !value.trim()) return { intention: null, framing: null, cues: null };
"""
LOOSE_RECORDED = "  const recorded = readable.filter((s) => s.state === 'recorded');"
LOOSE_STATE = """    state: rows.length ? 'recorded' : 'unrecorded',
    message: rows.length ? 'Practice sessions recorded for this day: server-measured running time only.' : 'No practice session recorded for this day. Nothing is carried over, and an empty day is not a failure.',"""
LOOSE_PROGRESS = "  const recorded = inRange.filter((r) => r.state === 'recorded');"
def loose_practice():
 s=(APP/'src/practice.js').read_text()
 assert s.count(BLANK_GUARD)==1
 s=s.replace(BLANK_GUARD,"")
 assert s.count(LOOSE_RECORDED)==1
 s=s.replace(LOOSE_RECORDED,"  const recorded = readable;")
 assert s.count(LOOSE_STATE)==1
 s=s.replace(LOOSE_STATE,"""    state: readable.length ? 'recorded' : 'unrecorded',
    message: readable.length ? 'Practice sessions recorded for this day: server-measured running time only.' : 'No practice session recorded for this day. Nothing is carried over, and an empty day is not a failure.',""")
 assert s.count(LOOSE_PROGRESS)==1
 s=s.replace(LOOSE_PROGRESS,"  const recorded = inRange;")
 return s
def main():
 E.mkdir(parents=True,exist_ok=True)
 assert manifest(PARENT)==read('analysis/evidence/m108/parent-source.json')
 before=PARENT;guards={}
 for name,_ in STAGES:
  tree=Path(f'/tmp/m108-{name}-stage/app');shutil.rmtree(tree,ignore_errors=True);shutil.copytree(before,tree,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
  for rel in FILES[name]:
   data=(APP/rel).read_bytes()
   if name=='policy' and rel=='src/practice.js':data=loose_practice().encode()
   write(tree,rel,data)
  guards[name]=manifest(tree);(E/f'{name}-source.json').write_text(json.dumps(guards[name],indent=2,sort_keys=True)+'\n')
  print(f'{name}: {len(guards[name])} files')
  before=tree
 (E/'release-source.json').write_text(json.dumps(guards['documentation'],indent=2,sort_keys=True)+'\n')
 assert guards['documentation']==manifest(APP),'release stage must equal the delivered tree'
 # The api stage IS the pre-hardening runtime (loose policy + owned schema + routes, no
 # view), so the measured control tree and the stage are asserted identical rather than
 # copied twice.
 pre=Path('/tmp/m108-pre-hardening/app');shutil.rmtree(pre,ignore_errors=True);shutil.copytree(Path('/tmp/m108-api-stage/app'),pre,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
 assert manifest(pre)==guards['api'],'the pre-hardening control tree must be the api stage'
 (E/'pre-hardening-source.json').write_text(json.dumps(manifest(pre),indent=2,sort_keys=True)+'\n')
 print('pre-hardening control tree (= api stage):',len(manifest(pre)),'files')
 harness={}
 for p in sorted((ROOT/'analysis').glob('*')):
  if p.is_file() and (p.name.startswith(('probe-m108-','m108-','run-m108-','build-m108-','capture-m108-')) or p.name=='gen-progress.py'):
   harness[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 scan={}
 for p in sorted(ROOT.glob('analysis/patches/*m108*')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 for p in sorted(ROOT.glob('analysis/*[mM]108*.md')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 (E/'harness-source.json').write_text(json.dumps({**harness,**scan},indent=2,sort_keys=True)+'\n')
 print('harness files:',len(harness)+len(scan))

# ------------------------------------------------------------------ control runs
CONTROLS=[('pure',PARENT),('api',Path('/tmp/m108-policy-stage/app')),('consumers',Path('/tmp/m108-policy-stage/app')),('freshness',PARENT),('hardening',PARENT),('portable',PARENT),('ui',Path('/tmp/m108-api-stage/app')),('archive-ui',Path('/tmp/m108-api-stage/app')),('migration',PARENT)]
LOOSE=[('hardening',Path('/tmp/m108-pre-hardening/app')),('pure',Path('/tmp/m108-pre-hardening/app'))]
def ensure_modules(tree):
 link=Path(tree)/'node_modules'
 if not link.exists():link.symlink_to(APP/'node_modules',target_is_directory=True)
def run_probe(name,tree,prefix):
 ensure_modules(tree);result=E/f'{prefix}-{name}-results.json';text=E/f'{prefix}-{name}.txt'
 env={**os.environ,'TJ_APP':str(tree),'TJ_PARENT':str(PARENT),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M108_RESULT':str(result),'M107_RESULT':str(result),'M106_RESULT':str(result),'M105_RESULT':str(result)}
 r=subprocess.run(['node','analysis/probe-m108-'+name+'.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240)
 text.write_bytes(r.stdout);d=json.loads(result.read_text())
 print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}',flush=True)
 return {'pass':d['pass'],'fail':d['fail'],'exit_code':r.returncode}
def controls():
 parent={}
 for name,tree in CONTROLS:
  counts=run_probe(name,tree,'parent');parent[name]={'tree':'the delivered parent (M107 release) with no practice module, tables, routes or view','script':'analysis/probe-m108-'+name+'.js',**counts,'output':f'parent-{name}.txt','scope':'The unchanged M108 probe on the feature-absent parent runtime: no practice module, no owned practice tables, no /practice surface. Every assertion that needs the feature is a measured negative.'}
 (E/'parent-controls.json').write_text(json.dumps(parent,indent=2)+'\n')
 print('parent controls:',{k:(v['pass'],v['fail']) for k,v in parent.items()},flush=True)
 pre={}
 for name,tree in LOOSE:
  counts=run_probe(name,tree,'pre-hardening');pre[name]={'tree':'the delivered runtime with the pre-hardening day view and empty-intention line (the api stage itself)','script':'analysis/probe-m108-'+name+'.js',**counts,'output':f'pre-hardening-{name}.txt','scope':'The unchanged M108 probes on the pre-hardening runtime (the exact policy stage pool/timer plus its routes): the hardening probe measures the day view counting a stored receipt it cannot read back as a recorded session, and the pure probe measures the empty optional intention line being refused as an error. The hardening stage made both honest and both probes are green on the delivered tree.'}
 (E/'pre-hardening-controls.json').write_text(json.dumps(pre,indent=2)+'\n')
 print('pre-hardening controls:',{k:(v['pass'],v['fail']) for k,v in pre.items()},flush=True)
if __name__=='__main__':
 if '--controls' in sys.argv:controls()
 else:main()
