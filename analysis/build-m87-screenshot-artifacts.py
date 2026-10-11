#!/usr/bin/env python3
"""Guarded deterministic M87 delivery. Six separately measured source stages,
actual d5 and pristine ZIP forward/reverse byte equality. --capture-stages reads
initial measured trees; normal durable rebuild uses ONLY their saved patches.
No credential/env/DB/dependency reads or generated large data in archive.
"""
from pathlib import Path, PurePosixPath
import argparse,hashlib,io,json,re,runpy,shutil,subprocess,tarfile,tempfile,zipfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m87';P=ROOT/'analysis/patches';BASE='d5be22f2b86fc3c3a6d7455f1c9293d240b55e66'
STAGES=[('image','m87-pure-role-image-contracts.patch','/tmp/m87-image-stage/app'),('storage','m87-owned-role-storage-api.patch','/tmp/m87-storage-stage/app'),('ui','m87-three-role-saved-record-ui.patch','/tmp/m87-ui-stage/app'),('portable','m87-owned-portable-evidence.patch','/tmp/m87-portable-stage/app'),('hardening','m87-conservative-media-freshness.patch','/tmp/m87-hardening-stage/app'),('full','m87-screenshot-documentation.patch',None)]
CORE=['src/bots/'+n+'.js' for n in ['setup','topdown','smc','momentum','predict','entry-models','entry-preference','targets','stops','protected']]
NEUTRAL=CORE+['src/instruments.js','src/trades.js','src/performance.js','src/journaling.js','src/execution-review.js','src/routine.js','src/routine-records.js','public/js/views/execution.js','package-lock.json','scripts/api-test.js','scripts/bots-test.js','scripts/smoke-test.js']
OLD=runpy.run_path(str(ROOT/'analysis/build-m54-m77-artifacts.py'),run_name='artifact_helpers');make_patch,contents,allowed,add_zip=[OLD[k] for k in ['make_patch','contents','allowed','add_zip']]
def sha(b):return hashlib.sha256(b).hexdigest()
def run(args,cwd=ROOT):return subprocess.run(args,cwd=cwd,check=True,capture_output=True).stdout
def read(path):return json.loads((ROOT/path).read_text())
def manifest(tree):
 if tree==APP:
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','extracted/tradejournal']).decode().split('\0');rels=sorted({p.removeprefix('extracted/tradejournal/') for p in paths if p});assert all(allowed(PurePosixPath(p)) or p.startswith('scripts/fixtures/') for p in rels);return {p:sha((tree/p).read_bytes()) for p in rels}
 return {p:sha(b) for p,b in contents(tree).items()}
def write(dest,rel,b):
 p=PurePosixPath(rel);assert not p.is_absolute() and '..' not in p.parts;q=dest/str(p);q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
def metadata(p):
 b=p.read_bytes();return {'files':b.count(b'diff --git '),'bytes':len(b),'sha256':sha(b),'forward_byte_differences':0,'reverse_byte_differences':0}
def replay(before,after,patch,work):
 tree=work/('roundtrip-'+patch.stem);shutil.copytree(before,tree);run(['git','apply','--check',str(patch)],tree);run(['git','apply',str(patch)],tree);assert contents(tree)==contents(after),patch.name+' forward';run(['git','apply','-R','--check',str(patch)],tree);run(['git','apply','-R',str(patch)],tree);assert contents(tree)==contents(before),patch.name+' reverse'
def counts(d):return d.get('pass',d.get('passed')),d.get('fail',d.get('failed'))
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');a=ap.parse_args();assert run(['git','branch','--show-current']).decode().strip()=='arena/762c0295-trader'
 guards={n:read('analysis/evidence/m87/'+n+'-source.json') for n in ['parent']+[s[0] for s in STAGES]};current=guards['full'];assert len(current)==121 and len(guards['parent'])==119;assert manifest(APP)==current,'Unmeasured application edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected engine/P&L/grading/routine/lock/native code changed';assert {p for p in current if current[p]!=guards['hardening'][p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Docs changed runtime'
 for p,h in read('analysis/evidence/m87/harness-source.json').items():assert sha((ROOT/p).read_bytes())==h,p
 feature=read('analysis/evidence/m87/feature-summary.json');assert (feature['pass'],feature['fail'],feature['probes'])==(226,0,9) and feature['completed_nonzero']==feature['summaryless']==feature['timeout_no_exit']==0
 for r in feature['runs']:assert counts(read('analysis/evidence/m87/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 for suite,p,f,n in [('execution',260,0,9),('routine',321,0,10),('offline',178,0,4),('market',325,0,4),('declared',828,0,31)]:
  d=read('analysis/evidence/m87/'+suite+'-summary.json');assert (d['pass'],d['fail'],d['probes'])==(p,f,n) and all(r['exit_code']==0 for r in d['runs'])
 controls={'parent-image-contracts-results.json':(0,52),'parent-image-contracts-initial-results.json':(0,52),'image-only-storage-results.json':(8,25),'storage-only-ui-results.json':(3,29),'ui-only-portable-results.json':(5,23),'portable-only-hardening-results.json':(17,18),'portable-only-backup-outage-results.json':(2,2),'portable-only-ui-freshness-initial-results.json':(6,7),'portable-only-ui-freshness-results.json':(5,8),'portable-only-settings-ui-results.json':(3,12),'parent-migration-results.json':(8,6),'migration-initial-results.json':(0,1),'migration-state-initial-results.json':(13,1)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m87/'+p))==n,(p,n)
 raw=read('analysis/evidence/m87/raw-summary.json');assert (raw['pass'],raw['fail'],raw['probes'],raw['completed_nonzero'],raw['timeout_no_exit'],raw['summaryless'])==(597,155,31,21,1,1)
 initialRaw=read('analysis/evidence/m87/raw-summary-initial.json');initialDeclared=read('analysis/evidence/m87/declared-summary-initial.json');assert counts(initialRaw)==(569,155) and counts(initialDeclared)==(798,2)
 parents=read('analysis/evidence/m87/regression-parents.json');assert all(p['byte_differences']==0 for p in parents['parents'].values()) and [p['files'] for p in parents['parents'].values()]==[119,117,114,110,112,112]
 live=read('analysis/evidence/m87/pure-summary.json');assert (live['pass'],live['fail'],live['completed_nonzero'],live['summaryless'])==(70,1,6,5)
 native=read('analysis/evidence/m87/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text()
  if r['arm']=='raw':
   if r['suite']=='api':assert (r['pass'],r['fail'],r['exit_code'])==(None,None,2) and 'CRASH:' in text
   else:assert (r['pass'],r['fail'],r['exit_code'])==(201,5,1) and r['parity_fills']==20 and r['parity_mismatches']==0
  else:
   assert (r['pass'],r['fail'],r['exit_code'])==((121,0,0) if r['suite']=='api' else (205,1,1))
   if r['suite']=='bots':assert r['parity_fills']==20 and r['parity_mismatches']==0 and 'filled sample for parity: 20 trades' in text
 smoke=read('analysis/evidence/m87/smoke-exit.json');text=(E/'smoke.txt').read_text();assert smoke['exit_code']==0 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
 gen=runpy.run_path(str(ROOT/'analysis/gen-progress.py'),run_name='progress_gate');rows=gen['rows'];ledger={'total':len(rows),'done':gen['done'],'partial':gen['part'],'todo':gen['todo'],'no_action':gen['noact'],'partition_groups':len(gen['GROUPS']),'partial_ids':[k for k,v in rows.items() if v['status']=='partial'],'todo_ids':[k for k,v in rows.items() if v['status']=='todo']};assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,90,3,39,0,8];assert ledger['partial_ids']==['M30','M103','M108'] and rows['M87']['status']=='done' and all(rows[k]['status']=='todo' for k in ['M88','M89','M106','M111','M112'])
 P.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m87-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name,frozen in STAGES:
   after=work/name;after.mkdir()
   if a.capture_stages or name=='full':
    source=APP if name=='full' else Path(frozen)
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m87-screenshots-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir();assert sha((ROOT/'tradingpro-main.zip').read_bytes())=='7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final);assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes()
  cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature_assertions':{'pass':226,'fail':0,'probes':9,'scope':'Actual no prerequisite adapter; declared clock/literal journals/tiny CODEC fixtures and DOM, not chart/pixels/broker'},'prior_actual_execution':{'pass':260,'fail':0,'probes':9},'prior_actual_routine':{'pass':321,'fail':0,'probes':10,'owned_strategy_ui_freshness':'UNMEASURED prior distinct scope'},'raw_inherited':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','summaryless','scope']},'declared_isolation':{'pass':828,'fail':0},'initial_missing_parent_negatives':{'raw':[569,155],'declared':[798,2]},'regression_parents':parents,'offline_synthetic_no_prerequisite_adapter':{'pass':178,'fail':0},'live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless']},'declared_market':{'pass':325,'fail':0},'native':native,'smoke':{**smoke,'result_views_passed':22,'result_views_failed':0,'style_failures':0,'console_errors':0,'canvas_environment_limitations':8},'controls_and_errors':controls,'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':121,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M87 optional explicit HUMAN-labelled visual refs only. Recording != capture, imported provenance unverified. Not financial/core/grade/risk/admission/news/broker/live/emotion/meditation/pixel/edge/production or entire course-journal proof. M88/M89 remain open.'}
  (P/'M87-SCREENSHOT-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist());jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':121,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n')
  print('Six independent stages + combined + pristine: forward/reverse0 byte differences.');print('Exact132/90/3/39; actual M87 226/0, execution260/0, routine321/0. RAW/native negatives kept; no live/pixel/production/70% claims.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
