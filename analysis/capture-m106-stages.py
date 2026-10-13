#!/usr/bin/env python3
"""Capture the M106 stage trees, their source guards and the control runs.

The M106 implementation is delivered as one working tree, so the stages below are
*constructed* from the delivered files rather than sampled mid-edit: each stage tree is
the parent plus exactly the files listed for it, and the `strict` stage additionally
carries the pre-hardening `stateGateRefusal` (the version that made the unchanged market
cohort fail) so the fix is a measured stage rather than a claim. Every tree is hashed
into `analysis/evidence/m106/<stage>-source.json`; the build script re-derives the same
trees from the saved patches and asserts the digests.

    python3 analysis/capture-m106-stages.py
"""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m106'
PARENT=Path('/tmp/m106-parent/app')
STAGES=[('policy',[]),('api',[]),('strict',[]),('desk',[]),('ui',[]),('documentation',[])]
FILES={
 'policy':['src/state-gate.js','src/db.js'],
 'api':['src/routes/api.js'],
 'strict':['src/bots/index.js','src/routes/bots.js'],
 'desk':['src/bots/index.js'],
 'ui':['public/index.html','public/js/views/state-gate.js','public/js/views/dashboard.js','public/js/views/journal.js','public/js/views/settings.js'],
 'documentation':['README.md','docs/API.md','docs/GUARDRAILS.md'],
}
STRICT_OLD = """async function stateGateRefusal(userId, accountId) {
  const gate = await StateGate.permission(userId, accountId);"""
STRICT_REPLACE_FROM = """async function stateGateRefusal(userId, accountId) {
  if (!userId) return { allowed: true, state: 'not_consulted', adopted: false, message: 'Unsized research carries no personal four-question claim.' };"""
def digest(tree):
 return {str(p.relative_to(tree)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(tree.rglob('*')) if p.is_file() and 'node_modules' not in p.relative_to(tree).parts and 'data' not in p.relative_to(tree).parts}
def write(tree,rel,data):
 p=tree/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
def strict_bots():
 s=(APP/'src/bots/index.js').read_text()
 i=s.index(STRICT_REPLACE_FROM)
 j=s.index("  if (gate.allowed) return gate;",i)
 # the pre-hardening version resolved nothing and let a 404 escape: that is the stage
 # the unchanged market cohort measured at 5/1 before the desk-resolution fix.
 return s[:i]+STRICT_OLD+'\n'+s[j:]
def main():
 E.mkdir(parents=True,exist_ok=True)
 assert digest(PARENT)==json.loads((E/'parent-source.json').read_text())
 before=PARENT;guards={}
 for name,_ in STAGES:
  tree=Path(f'/tmp/m106-{name}-stage/app');shutil.rmtree(tree,ignore_errors=True);shutil.copytree(before,tree,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
  for rel in FILES[name]:
   data=(APP/rel).read_bytes()
   if name=='strict' and rel=='src/bots/index.js':data=strict_bots().encode()
   write(tree,rel,data)
  guards[name]=digest(tree);(E/f'{name}-source.json').write_text(json.dumps(guards[name],indent=2,sort_keys=True)+'\n')
  print(f'{name}: {len(guards[name])} files')
  before=tree
 (E/'release-source.json').write_text(json.dumps(guards['documentation'],indent=2,sort_keys=True)+'\n')
 assert guards['documentation']==digest(APP),'release stage must equal the delivered tree'
 harness={}
 for p in sorted((ROOT/'analysis').glob('*')):
  if p.is_file() and (p.name.startswith(('probe-m106-','m106-','run-m106-','build-m106-','capture-m106-')) or p.name in ['gen-progress.py']):
   harness[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 scan={}
 for d in ['']:
  for p in sorted(ROOT.glob('analysis/patches/*m106*')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 for p in sorted(ROOT.glob('analysis/*m106*.md')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 (E/'harness-source.json').write_text(json.dumps({**harness,**scan},indent=2,sort_keys=True)+'\n')
 print('harness files:',len(harness)+len(scan))

# ------------------------------------------------------------------ control runs
CONTROLS=[('pure','/tmp/m106-parent/app'),('api','/tmp/m106-policy-stage/app'),('entry','/tmp/m106-policy-stage/app'),('gate','/tmp/m106-api-stage/app'),('ui','/tmp/m106-api-stage/app'),('freshness','/tmp/m106-parent/app'),('hardening','/tmp/m106-parent/app'),('portable','/tmp/m106-parent/app'),('archive-ui','/tmp/m106-parent/app'),('migration','/tmp/m106-parent/app')]
def ensure_modules(tree):
 link=Path(tree)/'node_modules'
 if not link.exists():link.symlink_to(APP/'node_modules',target_is_directory=True)
def controls():
 for name,tree in CONTROLS:
  ensure_modules(tree);result=E/f'parent-{name}-results.json';text=E/f'parent-{name}.txt'
  env={**os.environ,'TJ_APP':str(tree),'TJ_PARENT':str(PARENT),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M106_RESULT':str(result)}
  r=subprocess.run(['node','analysis/probe-m106-'+name+'.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
  text.write_bytes(r.stdout);d=json.loads(result.read_text())
  print(f'control {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}',flush=True)
 strict=Path('/tmp/m106-strict-stage/app');ensure_modules(strict)
 env={**os.environ,'TJ_APP':str(strict),'NODE_OPTIONS':'--require='+str(ROOT/'analysis/m64-legacy-prerequisite.js'),'TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':''}
 r=subprocess.run(['node','analysis/probe-m71-rr-consumers.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
 (E/'strict-stage-market-control.txt').write_bytes(r.stdout)
 import re as _re
 m=list(_re.finditer(r'(\d+)\s+passed,\s*(\d+)\s+failed',r.stdout.decode(errors='replace')))
 (E/'strict-stage-market-control.json').write_text(json.dumps({'arm':'strict-desk-resolution','script':'analysis/probe-m71-rr-consumers.js','pass':int(m[-1].group(1)) if m else None,'fail':int(m[-1].group(2)) if m else None,'exit_code':r.returncode,'output':'strict-stage-market-control.txt','scope':'The unchanged market cohort on the pre-hardening stage: the strict gate let a foreign/absent account id escape as 404, which is the measured regression the desk-resolution stage fixed.'},indent=2)+'\n')
 print('strict-stage market control:',(m[-1].groups() if m else None),'exit',r.returncode,flush=True)
if __name__=='__main__':
 import sys as _sys
 if '--controls' in _sys.argv:controls()
 else:main()
