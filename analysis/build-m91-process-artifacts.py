#!/usr/bin/env python3
"""Deterministic M91 delivery: six runtime stages/docs/actual5a/pristine proofs.
--capture-stages reads original measured temp trees; durable mode replays patches.
No private env/DB/dependency/cache artifacts. Retain controls and old negatives.
"""
from pathlib import Path,PurePosixPath
import argparse,io,json,re,runpy,shutil,tarfile,tempfile,zipfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m91';P=ROOT/'analysis/patches';BASE='5a37105bc2bbf11849494e92d586147f4a398a46'
STAGES=[('pure','m91-pure-account-day-distinctions.patch'),('api','m91-owned-read-only-source-api.patch'),('ui','m91-actual-process-outcome-review-ui.patch'),('hardening','m91-source-coverage-net-overflow-hardening.patch'),('freshness','m91-context-errors-unknown-money-ui.patch'),('presentation','m91-day-not-per-trade-attribution-ui.patch'),('delivery','m91-process-review-documentation.patch')]
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='artifact_helpers');sha,run,read,manifest,write,metadata,replay,counts,make_patch,contents,allowed,add_zip=[H[k] for k in ['sha','run','read','manifest','write','metadata','replay','counts','make_patch','contents','allowed','add_zip']]
CORE=H['CORE'];NEUTRAL=H['NEUTRAL']+['src/confluences.js','src/screenshots.js','src/emotions.js','src/db.js','src/performance.js','src/coach.js','src/bots/guardrails.js','public/js/views/emotions.js']
def gate(suite,p,f,n,nonzero=0,timeout=0,summaryless=0):
 d=read('analysis/evidence/m91/'+suite+'-summary.json');assert (d['pass'],d['fail'],d['probes'],d['completed_nonzero'],d['timeout_no_exit'],d['summaryless'])==(p,f,n,nonzero,timeout,summaryless),(suite,d);return d

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');a=ap.parse_args();assert run(['git','branch','--show-current']).decode().strip()=='arena/762c0295-trader'
 guards={n:read('analysis/evidence/m91/'+n+'-source.json') for n in ['parent']+[x[0] for x in STAGES]};current=guards['delivery'];assert len(current)==127 and len(guards['parent'])==125;assert manifest(APP)==current,'Unmeasured app edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected financial/score/core/guard/routine/engine/lock/native code changed';assert {p for p in current if guards['presentation'][p]!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Docs changed runtime'
 assert {p for p in current if guards['parent'].get(p)!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md','src/process-outcomes.js','src/routes/api.js','public/index.html','public/js/views/process-outcomes.js','public/js/views/analytics.js','public/js/views/coach.js','public/js/views/journal.js'}
 harness=read('analysis/evidence/m91/harness-source.json')
 for p,h in harness.items():assert sha((ROOT/p).read_bytes())==h,p
 feature=gate('feature',108,0,6)
 for r in feature['runs']:assert counts(read('analysis/evidence/m91/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 protected={s:gate(s,p,0,n) for s,p,n in [('emotions',170,13),('confluences',160,8),('execution',260,9),('routine',321,10),('offline',178,4),('market',325,4)]};screenshots=gate('screenshots',223,3,9,1);assert counts(read('analysis/evidence/m91/screenshots/feature-migration-results.json'))==(11,3)
 raw=gate('raw',597,155,31,21,1,1);declared=gate('declared',825,3,31,1);live=gate('pure',70,1,8,6,0,5)
 controls={'parent-pure-initial-results.json':(0,29),'parent-pure-results.json':(0,37),'pure-only-api-results.json':(11,10),'api-only-ui-results.json':(3,12),'api-only-ui-corrected-results.json':(3,12),'ui-initial-results.json':(14,1),'ui-only-hardening-initial-results.json':(3,10),'ui-only-hardening-results.json':(5,11),'hardening-only-freshness-initial-results.json':(0,1),'freshness-initial-results.json':(0,1),'hardening-only-freshness-results.json':(3,4),'freshness-only-presentation-results.json':(7,1),'migration-initial-results.json':(9,1),'migration-diagnostic-results.json':(9,1),'parent-migration-results.json':(9,2)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m91/'+p))==n,(p,n)
 parents=read('analysis/evidence/m91/regression-parents.json');assert all(v['byte_differences']==0 for v in parents['parents'].values()) and [v['files'] for v in parents['parents'].values()]==[125,123,121,119,117,114,110,112,112]
 native=read('analysis/evidence/m91/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text();expected=(None,None,2) if r['arm']=='raw' and r['suite']=='api' else (200,6,1) if r['arm']=='raw' else (121,0,0) if r['suite']=='api' else (206,0,0);assert (r['pass'],r['fail'],r['exit_code'])==expected,(r,expected)
  if r['suite']=='bots':assert (r['parity_fills'],r['parity_mismatches'])==(24,0) and 'filled sample for parity: 24 trades' in text
 smoke=read('analysis/evidence/m91/smoke-exit.json');text=(E/'smoke.txt').read_text();assert smoke['exit_code']==0 and 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
 g=runpy.run_path(str(ROOT/'analysis/gen-progress.py'),run_name='progress_gate');rows=g['rows'];ledger={'total':len(rows),'done':g['done'],'partial':g['part'],'todo':g['todo'],'no_action':g['noact'],'partition_groups':len(g['GROUPS']),'partial_ids':[k for k,v in rows.items() if v['status']=='partial'],'todo_ids':[k for k,v in rows.items() if v['status']=='todo']};assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,93,3,36,0,8];assert ledger['partial_ids']==['M30','M103','M108'] and rows['M91']['status']=='done' and all(rows[k]['status']=='todo' for k in ['M93','M106','M111','M112'])
 P.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m91-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name in STAGES:
   after=work/name;after.mkdir()
   if a.capture_stages or name=='delivery':
    source=APP if name=='delivery' else Path('/tmp/m91-'+name+'-stage/app')
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m91-process-outcomes-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir();assert sha((ROOT/'tradingpro-main.zip').read_bytes())=='7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final);assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes();cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature':{k:feature[k] for k in ['pass','fail','probes','scope']},'protected':{s:{k:v[k] for k in ['pass','fail','probes']} for s,v in protected.items()},'unchanged_screenshots':{'pass':223,'fail':3,'probes':9,'scope':'Inherited exact-schema migration assumptions; actual125-parent zero-schema/restarts11/0.'},'raw':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','summaryless']},'declared':{k:declared[k] for k in ['pass','fail','probes','completed_nonzero']},'live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless']},'regression_parents':parents,'native':native,'smoke':{**smoke,'conditional_views_passed':21,'style_failures':0,'console_errors':0,'canvas_environment_limits':8},'controls_and_errors':controls,'zero_schema_migration':{'pass':11,'fail':0,'parent_control':[9,2],'actual_parent_lazy_bootstrap':'Old M102 strategy-v1 defaults reproduced by actual-parent restart before comparing; no other fact/financial/evidence/permission table ignored.'},'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':127,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'harness_source_files':len(harness),'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M91 read-only profitable whole-owned UTC account-day + retained actual trade exception review association. Mere stop/blocked/research/history not violation. Current corrected outcomes/full account not filtered winner slice; financial wins/expectancy/grades/behaviour scores/risk/core/routine/permission unchanged. No causal dollar/psychological reinforcement/broker/pixel/provider/human/meditation/production/edge/70% proof. M93 next; M106/M111/M112 TODO, M30/M103/M108 partial.'};(P/'M91-PROCESS-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist());jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':127,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n');print('Six runtime stages + docs + actual5a + pristine: forward/reverse0 byte differences.');print('Exact132/93/3/36; M91 108/0, old control/errors/regression negatives retained.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
