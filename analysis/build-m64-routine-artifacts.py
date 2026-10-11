#!/usr/bin/env python3
"""Guard measured M14/M64/M94+M108-subset source/evidence. Nine independent
stage patches +actual751 parent/pristine forward/reverse byte proofs and
source-only deterministic ZIP. --capture-stages reads frozen measured trees;
normal invocation uses durable patches, never ephemeral /tmp baselines.
Does not change branches, read credentials or change app implementation.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile, re
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m64';P=ROOT/'analysis/patches'
BASE='75172759d134e63ed57a20c5e2941eb6c28e9855'
STAGES=[('records','m94-daily-routine-records.patch','/tmp/m64-records-stage/app'),('schedule','m64-selected-local-schedule.patch','/tmp/m64-schedule-stage/app'),('workflow','m64-ordered-steps-active-timer.patch','/tmp/m64-workflow-stage/app'),('gate','m64-routine-admission.patch','/tmp/m64-gate-stage/app'),('contracts','m64-immutable-cycle-contracts.patch','/tmp/m64-contracts-stage/app'),('provenance','m94-frozen-preparation-outcomes.patch','/tmp/m64-provenance-stage/app'),('ui','m64-persistent-routine-ui.patch','/tmp/m64-ui-stage/app'),('hardening','m64-strict-routine-shapes.patch','/tmp/m64-hardening-stage/app'),('full','m64-routine-documentation.patch',None)]
CORE=['src/bots/'+n+'.js' for n in ['setup','topdown','smc','momentum','predict','entry-models','entry-preference','targets','stops','protected']]
NEUTRAL=CORE+['package-lock.json','src/instruments.js','src/performance.js','scripts/api-test.js','scripts/bots-test.js']
ns={'__file__':str(ROOT/'analysis/build-m54-m77-artifacts.py'),'__name__':'artifact_helpers'};exec(compile(Path(ns['__file__']).read_text(),ns['__file__'],'exec'),ns)
make_patch,contents,allowed,add_zip=[ns[k] for k in ['make_patch','contents','allowed','add_zip']]
def run(args,cwd=ROOT):return subprocess.run(args,cwd=cwd,check=True,capture_output=True).stdout
def sha(b):return hashlib.sha256(b).hexdigest()
def manifest(tree):
 if tree==APP:
  # Never enumerate/read ignored env, datasets, databases or dependencies.
  prefix='extracted/tradejournal/'
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','extracted/tradejournal']).decode().split('\0')
  rels=sorted({p.removeprefix(prefix) for p in paths if p.startswith(prefix)})
  assert all(allowed(PurePosixPath(p)) or p.startswith('scripts/fixtures/') for p in rels)
  return {p:sha((tree/p).read_bytes()) for p in rels}
 return {p:sha(b) for p,b in contents(tree).items()}
def write(dest,rel,b):
 p=PurePosixPath(rel);assert not p.is_absolute() and '..' not in p.parts;t=dest/str(p);t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
def patch_meta(p):
 b=p.read_bytes();return {'files':b.count(b'diff --git '),'bytes':len(b),'sha256':sha(b),'forward_byte_differences':0,'reverse_byte_differences':0}
def replay_check(before,after,patch,work):
 tree=work/('roundtrip-'+patch.stem);shutil.copytree(before,tree);run(['git','apply','--check',str(patch)],tree);run(['git','apply',str(patch)],tree);assert contents(tree)==contents(after),patch.name+' forward';run(['git','apply','-R','--check',str(patch)],tree);run(['git','apply','-R',str(patch)],tree);assert contents(tree)==contents(before),patch.name+' reverse'
def read(rel):return json.loads((ROOT/rel).read_text())
def counts(d):return (d.get('pass',d.get('passed')),d.get('fail',d.get('failed')))
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--capture-stages',action='store_true');args=parser.parse_args();guards={n:read('analysis/evidence/m64/'+n+'-source.json') for n in ['parent']+[s[0] for s in STAGES]};current=guards['full'];assert len(current)==117 and len(guards['parent'])==114
 assert manifest(APP)==current,'Measured application changed/unknown source';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Neutral math/engine/scripts/lock changed';assert {p for p in current if current[p]!=guards['hardening'][p]}=={'README.md','docs/GUARDRAILS.md','docs/API.md'},'Documentation changed runtime'
 for p,h in read('analysis/evidence/m64/harness-source.json').items():assert sha((ROOT/p).read_bytes())==h,p
 feature=read('analysis/evidence/m64/feature-summary.json');assert feature['pass']==321 and feature['fail']==0 and len(feature['probes'])==10
 for row in feature['probes']:assert counts(read('analysis/evidence/m64/'+row['evidence']+'-results.json'))==(row['pass'],0) and row['exit_code']==0,row['name']
 negative={
  'analysis/evidence/m94/parent-records-results.json':(1,26),'analysis/evidence/m94/parent-records-initial-results.json':(1,20),
  'analysis/evidence/m64/records-only-schedule-results.json':(2,28),'analysis/evidence/m64/records-only-schedule-initial-results.json':(0,19),
  'analysis/evidence/m64/schedule-only-workflow-results.json':(4,39),'analysis/evidence/m64/schedule-only-workflow-initial-results.json':(0,1),'analysis/evidence/m64/schedule-only-workflow-http-initial-results.json':(0,1),
  'analysis/evidence/m64/workflow-only-gate-results.json':(6,21),'analysis/evidence/m64/gate-initial-results.json':(22,2),
  'analysis/evidence/m64/gate-only-contracts-results.json':(15,4),'analysis/evidence/m94/contracts-only-provenance-results.json':(3,20),
  'analysis/evidence/m64/provenance-only-ui-results.json':(1,38),'analysis/evidence/m64/workflow-only-consumers-results.json':(28,48),'analysis/evidence/m64/workflow-only-consumers-initial-results.json':(4,11),'analysis/evidence/m64/ui-only-hardening-results.json':(8,5)}
 for rel,n in negative.items():assert counts(read(rel))==n,(rel,counts(read(rel)))
 original=read('analysis/evidence/m64/original-regression-runs.json');assert len(original)==31 and sum(r['pass'] or 0 for r in original)==597 and sum(r['fail'] or 0 for r in original)==155 and sum(r['exit_code']==1 for r in original)==21 and sum(r.get('status')=='killed_on_timeout' for r in original)==1
 isolated=read('analysis/evidence/m64/isolated-regression-runs.json');assert len(isolated)==31 and sum(r['pass'] for r in isolated)==828 and all(r['fail']==0 and r['exit_code']==0 for r in isolated)
 initial=read('analysis/evidence/m64/isolated-regression-runs-initial.json');assert sum(r['pass'] for r in initial)==786 and sum(r['fail'] for r in initial)==2
 markets=read('analysis/evidence/m64/isolated-market-regression-runs.json');assert len(markets)==4 and sum(r['pass'] for r in markets)==325 and all(r['fail']==0 and r['exit_code']==0 for r in markets)
 pure=read('analysis/evidence/m64/pure-regression-runs.json');assert len(pure)==8 and sum(r['exit_code']==0 for r in pure)==4
 native=read('analysis/evidence/m64/native-runs.json');assert len(native)==6
 for row in native:
  text=(E/row['output']).read_text()
  if row['arm']=='raw':
   if row['suite']=='api':assert row['pass'] is None and row['fail'] is None and row['exit_code']==2 and 'CRASH:' in text
   else:assert (row['pass'],row['fail'],row['exit_code'])==(202,4,1) and 'pre_market_routine' in text
  elif row['suite']=='api':assert (row['pass'],row['fail'],row['exit_code'])==(121,0,0)
  else:assert (row['pass'],row['fail'],row['exit_code'])==(206,0,0) and '23 trades' in text and '0 mismatches' in text
 smoke=read('analysis/evidence/m64/smoke-result.json');assert smoke['exit_code'] is None and smoke['result_views_passed']==22 and smoke['result_views_failed']==0 and smoke['canvas_environment_limitations']==8;assert '22/22 views OK, 0 UI-style failures, 0 console errors' in (E/'smoke.txt').read_text()
 scope=read('analysis/evidence/m64/SCOPE.json');ledger=scope['ledger'];assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,87,3,42,0,8] and len(ledger['todo_ids'])==42;run(['python3','analysis/gen-progress.py']);progress=(ROOT/'analysis/PROGRESS.md').read_text();assert '**87 done · 3 partial · 42 todo · 0 deliberate no-action · 132 total**' in progress;assert len(re.findall(r'^## [A-H] ',progress,re.M))==8
 P.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m64-routine-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():
     rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/'),rel;write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stage_meta=[]
  for name,patch_name,frozen in STAGES:
   after=work/name;after.mkdir()
   if args.capture_stages or name=='full':
    source=APP if name=='full' else Path(frozen)
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay_check(before,after,P/patch_name,work);stage_meta.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**patch_meta(P/patch_name)});before=after
  final=before;combined=P/'m64-routine-complete.patch';make_patch(parent,final,combined);replay_check(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir()
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final),'Pristine retains unknown/untracked source';assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes()
  cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay_check(pristine,fixed,cumulative,work)
  result={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature_assertions':{'pass':321,'fail':0,'probes':10,'scope':'Actual no legacy/native prerequisite adapter; stated synthetic clocks/market IO/DOM seams, not real meditation/broker/pixel/production/causal proof'},'inherited_original':{'pass':597,'fail':155,'completed_nonzero':21,'timeout_no_summary':1,'scope':'Original raw/early aborts retained, not all expected828 assertions completed'},'declared_isolated':{'pass':828,'fail':0,'probes':31,'scope':'New prerequisites held fulfilled; not integrated routine policy proof'},'native':native,'smoke':smoke,'stages':stage_meta,'combined':patch_meta(combined),'pristine_cumulative':patch_meta(cumulative),'fixed_zip':{'source_files':117,'application_byte_differences':0,'credential_db_dependency_dataset_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'Scoped M14/M64/M94 closure, M108 timer subset PARTIAL. Explicit schedule/human workflow/active-clock/immutable prep/UTC close-day descriptive outcomes. No model/grade/risk/floor change/70%/causal/broker/provider/production claim.'}
  (P/'M64-ROUTINE-STAGES.json').write_text(json.dumps(result,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    src=ROOT/p
    if src.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,src.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist())
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':117,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n');print('Nine independent stages + combined + pristine: forward/reverse0 byte differences.');print('Exact132/87/3/42;321/0 actual/no adapters,828/0 explicitly isolated. Raw/native negatives and unobserved smoke exit retained.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
