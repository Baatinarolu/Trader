#!/usr/bin/env python3
"""Guarded M86/M92 delivery. Eight separately measured runtime stages +docs,
actual c22 parent/pristine forward+reverse byte equality, deterministic source+
audit ZIP; no credential/env/DB/dependency reads. --capture-stages initially reads
measured trees; normal rebuild uses durable patches, never stage /tmp reliance.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, re, shutil, subprocess, tarfile, tempfile, zipfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m86';P=ROOT/'analysis/patches';BASE='c22d5b9f6db4eca17f5981f5b87230f5ec343b86'
STAGES=[('rubric','m86-pure-execution-rubric.patch','/tmp/m86-rubric-stage/app'),('review','m86-explicit-stop-review-contracts.patch','/tmp/m86-review-stage/app'),('outcome','m86-unknown-realised-outcome.patch','/tmp/m86-outcome-stage/app'),('feedback','m86-read-only-grades-feedback.patch','/tmp/m86-feedback-stage/app'),('freshness','m86-current-displayed-revision.patch','/tmp/m86-freshness-stage/app'),('day','m92-process-ranked-day.patch','/tmp/m86-day-stage/app'),('ui','m86-m92-execution-review-ui.patch','/tmp/m86-ui-stage/app'),('hardening','m86-current-evidence-uncertainty.patch','/tmp/m86-hardening-stage/app'),('full','m86-m92-documentation.patch',None)]
CORE=['src/bots/'+n+'.js' for n in ['setup','topdown','smc','momentum','predict','entry-models','entry-preference','targets','stops','protected']];NEUTRAL=CORE+['src/instruments.js','package-lock.json','scripts/api-test.js','scripts/bots-test.js','scripts/smoke-test.js']
ns={'__file__':str(ROOT/'analysis/build-m54-m77-artifacts.py'),'__name__':'artifact_helpers'};exec(compile(Path(ns['__file__']).read_text(),ns['__file__'],'exec'),ns);make_patch,contents,allowed,add_zip=[ns[k] for k in ['make_patch','contents','allowed','add_zip']]
def sha(b):return hashlib.sha256(b).hexdigest()
def run(args,cwd=ROOT):return subprocess.run(args,cwd=cwd,check=True,capture_output=True).stdout
def read(path):return json.loads((ROOT/path).read_text())
def manifest(tree):
 if tree==APP:
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','extracted/tradejournal']).decode().split('\0');rels=sorted({p.removeprefix('extracted/tradejournal/') for p in paths if p})
  assert all(allowed(PurePosixPath(p)) or p.startswith('scripts/fixtures/') for p in rels)
  return {p:sha((tree/p).read_bytes()) for p in rels}
 return {p:sha(b) for p,b in contents(tree).items()}
def write(dest,rel,b):
 path=PurePosixPath(rel);assert not path.is_absolute() and '..' not in path.parts;p=dest/str(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def metadata(p):
 b=p.read_bytes();return {'files':b.count(b'diff --git '),'bytes':len(b),'sha256':sha(b),'forward_byte_differences':0,'reverse_byte_differences':0}
def replay(before,after,patch,work):
 tree=work/('roundtrip-'+patch.stem);shutil.copytree(before,tree);run(['git','apply','--check',str(patch)],tree);run(['git','apply',str(patch)],tree);assert contents(tree)==contents(after),patch.name+' forward';run(['git','apply','-R','--check',str(patch)],tree);run(['git','apply','-R',str(patch)],tree);assert contents(tree)==contents(before),patch.name+' reverse'
def counts(d):return d.get('pass',d.get('passed')),d.get('fail',d.get('failed'))
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');args=ap.parse_args();guards={n:read('analysis/evidence/m86/'+n+'-source.json') for n in ['parent']+[s[0] for s in STAGES]};current=guards['full'];assert len(current)==119 and len(guards['parent'])==117
 assert manifest(APP)==current,'Unknown/unmeasured application edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected engine/instrument/lock/native scripts changed';assert {p for p in current if current[p]!=guards['hardening'][p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Documentation modified runtime'
 for p,h in read('analysis/evidence/m86/harness-source.json').items():assert sha((ROOT/p).read_bytes())==h,p
 feature=read('analysis/evidence/m86/feature-summary.json');assert (feature['pass'],feature['fail'],feature['probes'])==(260,0,9) and feature['completed_nonzero']==feature['summaryless']==feature['timeout_no_exit']==0
 for r in feature['runs']:assert counts(read('analysis/evidence/m86/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 routine=read('analysis/evidence/m86/routine-summary.json');assert (routine['pass'],routine['fail'],routine['probes'])==(321,0,10) and all(r['exit_code']==0 for r in routine['runs'])
 controls={'parent-rubric-results.json':(4,52),'parent-final-rubric-results.json':(4,56),'rubric-only-review-contracts-results.json':(6,36),'review-only-rubric-results.json':(59,1),'outcome-only-derived-feedback-initial-results.json':(2,21),'outcome-only-derived-feedback-results.json':(3,20),'feedback-only-freshness-results.json':(3,11),'freshness-only-day-results.json':(3,21),'day-only-ui-results.json':(2,27),'day-only-final-ui-results.json':(2,31),'ui-whole-initial-results.json':(32,1),'noninterference-initial-results.json':(6,2),'parent-noninterference-results.json':(26,8),'ui-only-hardening-results.json':(2,12),'ui-only-final-hardening-results.json':(2,13),'known-evidence-movement-initial-results.json':(14,1)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m86/'+p))==n,(p,n)
 raw=read('analysis/evidence/m86/raw-summary.json');assert (raw['pass'],raw['fail'],raw['probes'],raw['completed_nonzero'],raw['timeout_no_exit'])==(597,155,31,21,1)
 decl=read('analysis/evidence/m86/declared-summary.json');assert (decl['pass'],decl['fail'],decl['probes'])==(828,0,31) and all(r['exit_code']==0 for r in decl['runs'])
 assert counts(read('analysis/evidence/m86/declared-summary-initial.json'))==(819,1) and counts(read('analysis/evidence/m86/raw-summary-initial.json'))==(590,154)
 old=read('analysis/evidence/m86/legacy-parent-reconstruction.json');assert old['source_files']==110 and old['byte_differences']==0 and old['git_object_available'] is False
 offline=read('analysis/evidence/m86/offline-summary.json');assert (offline['pass'],offline['fail'],offline['probes'])==(178,0,4) and all(r['exit_code']==0 for r in offline['runs'])
 live=read('analysis/evidence/m86/pure-summary.json');assert (live['pass'],live['fail'],live['completed_nonzero'],live['summaryless'])==(70,1,6,5)
 market=read('analysis/evidence/m86/market-summary.json');assert (market['pass'],market['fail'],market['probes'])==(325,0,4) and all(r['exit_code']==0 for r in market['runs'])
 native=read('analysis/evidence/m86/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text()
  if r['arm']=='raw':
   if r['suite']=='api':assert r['pass'] is None and r['fail'] is None and r['exit_code']==2 and 'CRASH:' in text
   else:assert (r['pass'],r['fail'],r['exit_code'])==(202,4,1) and 'pre_market_routine' in text
  else:
   assert (r['pass'],r['fail'],r['exit_code'])==((121,0,0) if r['suite']=='api' else (206,0,0))
   if r['suite']=='bots':assert r['parity_fills']==21 and r['parity_mismatches']==0 and '21 trades' in text and '0 mismatches' in text
 smoke=read('analysis/evidence/m86/smoke-result.json');assert smoke['exit_code'] is None and smoke['result_views_passed']==21 and smoke['result_views_failed']==0 and smoke['canvas_environment_limitations']==8;assert 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in (E/'smoke.txt').read_text()
 scope=read('analysis/evidence/m86/SCOPE.json');ledger=scope['ledger_after'];assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,89,3,40,0,8] and len(ledger['todo_ids'])==40;assert scope['sources'][2]['id']=='xoUlvwdBVJ4' and all('paraphrase' in s and 'quote' not in s for s in scope['sources']);run(['python3','analysis/gen-progress.py']);progress=(ROOT/'analysis/PROGRESS.md').read_text();assert '**89 done · 3 partial · 40 todo · 0 deliberate no-action · 132 total**' in progress and len(re.findall(r'^## [A-H] ',progress,re.M))==8
 P.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m86-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():
     rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name,frozen in STAGES:
   after=work/name;after.mkdir()
   if args.capture_stages or name=='full':
    source=APP if name=='full' else Path(frozen)
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m86-m92-execution-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir()
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final),'Unknown pristine/source retained';assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes()
  cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature_assertions':{'pass':260,'fail':0,'probes':9,'scope':'Actual no legacy/native prerequisite adapter, declared literal fixed-clock journal/market IO/DOM only'},'prior_actual_routine':{'pass':321,'fail':0,'probes':10,'owned_strategy_ui_freshness':'UNMEASURED prior distinct scope'},'raw_inherited':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','scope']},'declared_isolation':{k:decl[k] for k in ['pass','fail','probes','scope']},'offline_synthetic_no_prerequisite_adapter':{'pass':178,'fail':0},'original_live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless','scope']},'declared_market':{'pass':325,'fail':0},'native':native,'smoke':smoke,'controls_and_errors':controls,'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':119,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M86 retrospective SELF execution +M92 process day ranking only, not capital grade, core writing, broker/live emotion/routine/market edge/cause/70%/production/pixel proof; unknowns unreviewed, no guessed legacy provenance.'}
  (P/'M86-EXECUTION-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist())
   jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':119,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n')
  print('Nine separate stages + combined + pristine: clean forward/reverse0 byte differences.');print('Exact132/89/3/40; new260/0, prior actual321/0, DECLARED828/0, raw/native negatives retained; smoke exitNULL.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
