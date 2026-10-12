#!/usr/bin/env python3
"""M104 deterministic delivery:10 measured runtime stages/docs/actual837/pristine.
--capture-stages first measured temp trees; durable rebuild saved patch replay.
Original fiscal/risk/grade/core/readiness guards; retained errors/nonzero cohorts.
"""
from pathlib import Path,PurePosixPath
import argparse,io,re,runpy,shutil,tarfile,tempfile,zipfile,json
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m104';P=ROOT/'analysis/patches';BASE='8372214715798c29259c8622ff6a025e645fa9a3'
STAGES=[('diff','m104-pure-named-rule-edit-units.patch'),('quarter','m104-owned-global-quarter-delta-guidance.patch'),('atomic-fixed','m104-atomic-strategy-current-version-storage.patch'),('api','m104-captured-quarter-facts-owned-preview-cas.patch'),('ui','m104-actual-playbook-delta-advice-history-ui.patch'),('period','m104-frozen-quarter-rule-guidance-baseline.patch'),('hardening','m104-strict-proposed-field-authority.patch'),('freshness','m104-superseded-playbook-response-error-guards.patch'),('portable','m104-unverified-json-rule-history-archives.patch'),('archive-ui','m104-archive-clock-settings-warning-ui.patch'),('release','m104-quarter-discipline-documentation.patch')]
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='artifact_helpers');sha,run,read,manifest,write,metadata,replay,counts,make_patch,contents,allowed,add_zip=[H[k] for k in ['sha','run','read','manifest','write','metadata','replay','counts','make_patch','contents','allowed','add_zip']]
CORE=H['CORE'];NEUTRAL=H['NEUTRAL']+['src/confluences.js','src/screenshots.js','src/emotions.js','src/performance.js','src/coach.js','src/bots/guardrails.js','src/bots/correction.js','src/process-outcomes.js','src/behavior-days.js','src/opportunities.js','src/routes/bots.js','public/js/views/emotions.js','public/js/views/process-outcomes.js','public/js/views/behavior-days.js','public/js/views/opportunities.js','public/js/views/bots.js','public/js/views/coach.js','public/js/views/analytics.js','public/js/views/trades.js','public/js/app.js']
def gate(suite,p,f,n,nonzero=0,timeout=0,summaryless=0):
 d=read('analysis/evidence/m104/'+suite+'-summary.json');assert (d['pass'],d['fail'],d['probes'],d['completed_nonzero'],d['timeout_no_exit'],d['summaryless'])==(p,f,n,nonzero,timeout,summaryless),(suite,d);return d

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');a=ap.parse_args();assert run(['git','branch','--show-current']).decode().strip()=='arena/762c0295-trader'
 guards={n:read('analysis/evidence/m104/'+n+'-source.json') for n in ['parent']+[x[0] for x in STAGES]};current=guards['release'];assert len(current)==135 and len(guards['parent'])==133;assert manifest(APP)==current,'Unmeasured source edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected financial/execution/core/routine/entry/risk/model/grade/score/native/lock changed';assert {p for p in current if guards['archive-ui'][p]!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Docs changed runtime';assert {p for p in current if guards['parent'].get(p)!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md','src/rule-changes.js','src/routes/api.js','src/db.js','src/period-reviews.js','public/index.html','public/js/views/rule-changes.js','public/js/views/playbook.js','public/js/views/period-reviews.js','public/js/views/settings.js'}
 harness=read('analysis/evidence/m104/harness-source.json')
 for p,h in harness.items():assert sha((ROOT/p).read_bytes())==h,p
 feature=gate('feature',153,0,11)
 for r in feature['runs']:assert counts(read('analysis/evidence/m104/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 protected={s:gate(s,p,0,n) for s,p,n in [('emotions',170,13),('confluences',160,8),('execution',260,9),('routine',321,10),('offline',178,4),('market',325,4)]};opportunities=gate('opportunities',144,1,10,1);reviews=gate('reviews',159,1,9,1);behavior=gate('behavior',113,2,7,1);process=gate('process',106,2,6,1);screenshots=gate('screenshots',223,3,9,1)
 assert counts(read('analysis/evidence/m104/opportunities/feature-migration-results.json'))==(12,1) and counts(read('analysis/evidence/m104/reviews/feature-migration-results.json'))==(14,1) and counts(read('analysis/evidence/m104/behavior/feature-migration-results.json'))==(9,2) and counts(read('analysis/evidence/m104/process/feature-migration-results.json'))==(9,2) and counts(read('analysis/evidence/m104/screenshots/feature-migration-results.json'))==(11,3)
 raw=gate('raw',596,156,31,21,1,1);declared=gate('declared',824,4,31,2);live=gate('pure',70,1,8,6,0,5);assert 'API.getToken is not a function' in (E/'declared-probe-m79-account-forwarding.txt').read_text()
 controls={'parent-diff-results.json':(0,29),'diff-only-quarter-results.json':(0,22),'quarter-only-atomic-results.json':(5,2),'atomic-initial-results.json':(3,4),'atomic-only-api-results.json':(4,15),'api-only-ui-results.json':(3,13),'ui-only-period-results.json':(2,4),'period-only-hardening-results.json':(14,3),'hardening-only-freshness-results.json':(4,2),'freshness-only-portable-results.json':(0,11),'portable-only-archive-ui-results.json':(1,5),'parent-migration-results.json':(10,4)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m104/'+p))==n,(p,n)
 assert 'SyntaxError' in (E/'parent-migration-syntax-initial.txt').read_text() and 'SyntaxError' in (E/'migration-syntax-initial.txt').read_text()
 parents=read('analysis/evidence/m104/regression-parents.json');assert all(v['byte_differences']==0 for v in parents['parents'].values()) and [v['files'] for v in parents['parents'].values()]==[133,131,129,127,125,123,121,119,117,114,110,112,112]
 native=read('analysis/evidence/m104/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text();expected=(None,None,2) if r['arm']=='raw' and r['suite']=='api' else (202,4,1) if r['arm']=='raw' else (121,0,0) if r['suite']=='api' else (206,0,0);assert (r['pass'],r['fail'],r['exit_code'])==expected,(r,expected)
  if r['suite']=='bots':assert (r['parity_fills'],r['parity_mismatches'])==(24,0) and 'filled sample for parity: 24 trades' in text
 smoke=read('analysis/evidence/m104/smoke-exit.json');text=(E/'smoke.txt').read_text();assert smoke['exit_code']==0 and 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
 g=runpy.run_path(str(ROOT/'analysis/gen-progress.py'),run_name='progress_gate');rows=g['rows'];ledger={'total':len(rows),'done':g['done'],'partial':g['part'],'todo':g['todo'],'no_action':g['noact'],'partition_groups':len(g['GROUPS']),'partial_ids':[k for k,v in rows.items() if v['status']=='partial'],'todo_ids':[k for k,v in rows.items() if v['status']=='todo']};assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,98,3,31,0,8];assert ledger['partial_ids']==['M30','M103','M108'] and rows['M104']['status']=='done' and all(rows[k]['status']=='todo' for k in ['M105','M106','M111','M112'])
 P.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m104-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name in STAGES:
   after=work/name;after.mkdir()
   if a.capture_stages or name=='release':
    source=APP if name=='release' else Path('/tmp/m104-'+name+'-stage/app')
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m104-rule-changes-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir();assert sha((ROOT/'tradingpro-main.zip').read_bytes())=='7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final);assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes();cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature':{k:feature[k] for k in ['pass','fail','probes','scope']},'protected':{s:{k:v[k] for k in ['pass','fail','probes']} for s,v in protected.items()},'original_opportunities':{'pass':144,'fail':1,'probes':10,'schema_migration':[12,1]},'original_reviews':{'pass':159,'fail':1,'probes':9,'schema_migration':[14,1]},'original_behavior':{'pass':113,'fail':2,'probes':7,'schema_migration':[9,2]},'original_process':{'pass':106,'fail':2,'probes':6,'schema_migration':[9,2]},'original_screenshots':{'pass':223,'fail':3,'probes':9,'schema_migration':[11,3]},'schema_negative_scope':'Unchanged whole-schema shape expectations fail legitimately on newobjects; preserved. Actual133-parent additive14/0 proves4newobjects/old63cols/alloriginalfacts exact.','raw':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','summaryless']},'declared':{k:declared[k] for k in ['pass','fail','probes','completed_nonzero']},'live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless']},'regression_parents':parents,'native':native,'smoke':{**smoke,'conditional_views_passed':21,'style_failures':0,'console_errors':0,'canvas_environment_limits':8},'controls_and_errors':controls,'actual_parent_additive_migration':{'pass':14,'fail':0,'parent_control':[10,4],'new_schema_objects':4,'original_trade_columns':63,'old_facts_byte_differences':0},'atomic_failure_repair':{'parent':[5,2],'new':[7,0],'scope':'Actual current/version/newsetup rollbacks, no extra finding closure/market rule change.'},'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':135,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'harness_source_files':len(harness),'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M104 named APP recorded edit-unit quarter advisory, not verified independent causalvariables or hard trade/grade/risk/strategyapply gate. Own-global everyedit/reversion/cosmetics excluded, originaldefinitions/versions/retainedcounter deletion protection, unknown coverage no0clean. Imported ownreceiving archives unverified/excluded activebudget, newquartersavedbaseline retained. M105 next/M106/M111/M112TODO/M30/M103/M108partial; no causal/predictive/70%/broker/provider/human/mental/meditation/pixel/production proof.'};(P/'M104-RULE-CHANGE-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist());jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':135,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n');print('Ten runtime stages + docs + actual837 + pristine: forward/reverse0 byte differences.');print('Exact132/98/3/31; M104153/0, old/schema/raw/provider/initial negatives retained.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
