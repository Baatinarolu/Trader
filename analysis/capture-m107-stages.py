#!/usr/bin/env python3
"""Capture the M107 stage trees, their source guards and the control runs.

The M107 implementation is delivered as one working tree, so the stages below are
*constructed* from the delivered files rather than sampled mid-edit: each stage tree is
the parent plus exactly the files listed for it, and the `policy` stage additionally
carries the pre-hardening intention module (the date policy that read a day that had not
happened as "nothing recorded", and did not refuse a malformed day at the day surfaces)
so the later date-hardening stage is a measured fix rather than a claim. Every tree is
hashed into `analysis/evidence/m107/<stage>-source.json`; the build script re-derives the
same trees from the saved patches and asserts the digests.

    python3 analysis/capture-m107-stages.py
    python3 analysis/capture-m107-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m107'
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='capture_helpers')
manifest=H['manifest'];write=H['write'];sha=H['sha'];read=H['read']
PARENT=Path('/tmp/m107-parent/app')
STAGES=[('policy',[]),('api',[]),('hardening',[]),('ui',[]),('documentation',[])]
FILES={
 'policy':['src/intention.js','src/db.js'],
 'api':['src/routes/api.js'],
 'hardening':['src/intention.js'],
 'ui':['public/index.html','public/js/views/intention.js','public/js/views/dashboard.js','public/js/views/journal.js','public/js/views/settings.js'],
 'documentation':['README.md','docs/API.md'],
}
LOOSE_DAYKEY = """function dayKey(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value) || Clock(value + 'T00:00:00.000Z', { canonical: true }) === null) throw invalid('Use a valid UTC calendar date (YYYY-MM-DD).');
  return value;
}"""
STRICT_DAYKEY = """/** A requested day is the app's own input. Malformed days and days that have not happened
 * are refused outright rather than rendered as "nothing recorded". */
function dayKey(value, { nowMs = Date.now() } = {}) {
  const shaped = typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
  if (shaped && value > utcDay(nowMs)) throw invalid('A future UTC day cannot be read as a day that happened.');
  if (!shaped || Clock(value + 'T00:00:00.000Z', { canonical: true }) === null) throw invalid('Use a valid past-or-today UTC calendar date (YYYY-MM-DD).');
  return value;
}"""
def loose_intention():
 s=(APP/'src/intention.js').read_text()
 assert s.count(STRICT_DAYKEY)==1
 s=s.replace(STRICT_DAYKEY,LOOSE_DAYKEY)
 future="    if (shaped && date > today) return { ...empty(accountId, date, today), state: 'unavailable', message: 'A future UTC day cannot be read as a day that happened.' };\n"
 assert s.count(future)==1
 s=s.replace(future,'')
 shaped="    const shaped = typeof date === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(date);\n"
 assert s.count(shaped)==1
 s=s.replace(shaped,'')
 view="""  /* A requested day is the app's own input: a malformed one is refused here rather than
   * being dressed up as a day with nothing recorded. */
  if (date !== null) dayKey(date, { nowMs });
"""
 assert s.count(view)==1
 s=s.replace(view,'')
 return s
def main():
 E.mkdir(parents=True,exist_ok=True)
 assert manifest(PARENT)==read('analysis/evidence/m107/parent-source.json')
 before=PARENT;guards={}
 for name,_ in STAGES:
  tree=Path(f'/tmp/m107-{name}-stage/app');shutil.rmtree(tree,ignore_errors=True);shutil.copytree(before,tree,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
  for rel in FILES[name]:
   data=(APP/rel).read_bytes()
   if name=='policy' and rel=='src/intention.js':data=loose_intention().encode()
   write(tree,rel,data)
  guards[name]=manifest(tree);(E/f'{name}-source.json').write_text(json.dumps(guards[name],indent=2,sort_keys=True)+'\n')
  print(f'{name}: {len(guards[name])} files')
  before=tree
 (E/'release-source.json').write_text(json.dumps(guards['documentation'],indent=2,sort_keys=True)+'\n')
 assert guards['documentation']==manifest(APP),'release stage must equal the delivered tree'
 # The api stage IS the pre-date-hardening runtime (loose module + routes + schema), so the
 # measured control tree and the stage are asserted identical rather than copied twice.
 loose=Path('/tmp/m107-loose-date/app');shutil.rmtree(loose,ignore_errors=True);shutil.copytree(Path('/tmp/m107-api-stage/app'),loose,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
 assert manifest(loose)==guards['api'],'the pre-hardening control tree must be the api stage'
 (E/'loose-date-source.json').write_text(json.dumps(manifest(loose),indent=2,sort_keys=True)+'\n')
 print('loose-date control tree (= api stage):',len(manifest(loose)),'files')
 harness={}
 for p in sorted((ROOT/'analysis').glob('*')):
  if p.is_file() and (p.name.startswith(('probe-m107-','m107-','run-m107-','build-m107-','capture-m107-')) or p.name in ['gen-progress.py']):
   harness[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 scan={}
 for p in sorted(ROOT.glob('analysis/patches/*m107*')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 for p in sorted(ROOT.glob('analysis/*[mM]107*.md')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 (E/'harness-source.json').write_text(json.dumps({**harness,**scan},indent=2,sort_keys=True)+'\n')
 print('harness files:',len(harness)+len(scan))

# ------------------------------------------------------------------ control runs
CONTROLS=[('pure',PARENT),('api',Path('/tmp/m107-policy-stage/app')),('consumers',Path('/tmp/m107-policy-stage/app')),('freshness',Path('/tmp/m107-loose-date/app')),('hardening',PARENT),('portable',PARENT),('ui',Path('/tmp/m107-api-stage/app')),('archive-ui',Path('/tmp/m107-api-stage/app')),('migration',PARENT)]
LOOSE=['freshness']
def ensure_modules(tree):
 link=Path(tree)/'node_modules'
 if not link.exists():link.symlink_to(APP/'node_modules',target_is_directory=True)
def run_probe(name,tree,prefix):
 ensure_modules(tree);result=E/f'{prefix}-{name}-results.json';text=E/f'{prefix}-{name}.txt'
 env={**os.environ,'TJ_APP':str(tree),'TJ_PARENT':str(PARENT),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M107_RESULT':str(result),'M106_RESULT':str(result),'M105_RESULT':str(result)}
 r=subprocess.run(['node','analysis/probe-m107-'+name+'.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240)
 text.write_bytes(r.stdout);d=json.loads(result.read_text())
 print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}',flush=True)
 return {'pass':d['pass'],'fail':d['fail'],'exit_code':r.returncode}
def controls():
 loose={}
 for name,tree in CONTROLS:
  prefix='loose-date' if name in LOOSE else 'parent'
  counts=run_probe(name,tree,prefix)
  if name in LOOSE:loose[name]={'tree':'the delivered runtime with the pre-hardening date policy','script':'analysis/probe-m107-'+name+'.js',**counts,'output':f'loose-date-{name}.txt','scope':'The unchanged M107 probe on the pre-date-hardening runtime: a day that has not happened was read as "nothing recorded" and a malformed day was not refused at the day surfaces. The next stage made both measurable refusals.'}
 (E/'loose-date-controls.json').write_text(json.dumps(loose,indent=2)+'\n')
 print('loose-date controls:',{k:(v['pass'],v['fail']) for k,v in loose.items()},flush=True)
if __name__=='__main__':
 if '--controls' in sys.argv:controls()
 else:main()
