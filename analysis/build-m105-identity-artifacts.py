#!/usr/bin/env python3
"""M105 deterministic delivery:9 successful runtime stages/docs/actual903/pristine.
--capture-stages first measured temp trees; durable rebuild saved patch replay.
Exact guards, retained quarter/ledger/bootstrap/native/schema negatives. No secrets.
"""
from pathlib import Path,PurePosixPath
import argparse,io,re,runpy,shutil,tarfile,tempfile,zipfile,json
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m105';P=ROOT/'analysis/patches';BASE='903c156db36cc3dd0d99400c6085859777891f92'
STAGES=[('pure','m105-nullable-declared-words-quarter-policy.patch'),('tally','m105-current-reported-plan-counts.patch'),('api','m105-owned-versioned-declaration-api.patch'),('quarter-fixed','m105-daily-context-frozen-quarter-reference.patch'),('ui','m105-actual-daily-quarter-card-editor-ui.patch'),('hardening','m105-source-chronology-reference-orphan-guards.patch'),('portable','m105-imported-inactive-json-word-history.patch'),('archive-ui','m105-readonly-archive-settings-warning-ui.patch'),('freshness','m105-dashboard-obsolete-failure-context-guard.patch'),('release','m105-identity-theme-documentation.patch')]
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='artifact_helpers');sha,run,read,manifest,write,metadata,replay,counts,make_patch,contents,allowed,add_zip=[H[k] for k in ['sha','run','read','manifest','write','metadata','replay','counts','make_patch','contents','allowed','add_zip']]
CORE=H['CORE'];NEUTRAL=H['NEUTRAL']+['src/confluences.js','src/screenshots.js','src/emotions.js','src/performance.js','src/coach.js','src/bots/guardrails.js','src/bots/correction.js','src/process-outcomes.js','src/behavior-days.js','src/opportunities.js','src/rule-changes.js','src/routes/bots.js','public/js/views/emotions.js','public/js/views/process-outcomes.js','public/js/views/behavior-days.js','public/js/views/opportunities.js','public/js/views/rule-changes.js','public/js/views/bots.js','public/js/views/coach.js','public/js/views/analytics.js','public/js/views/trades.js','public/js/views/playbook.js','public/js/app.js']
def gate(suite,p,f,n,nonzero=0,timeout=0,summaryless=0):
 d=read('analysis/evidence/m105/'+suite+'-summary.json');assert (d['pass'],d['fail'],d['probes'],d['completed_nonzero'],d['timeout_no_exit'],d['summaryless'])==(p,f,n,nonzero,timeout,summaryless),(suite,d);return d

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');a=ap.parse_args();assert run(['git','branch','--show-current']).decode().strip()=='arena/762c0295-trader'
 guards={n:read('analysis/evidence/m105/'+n+'-source.json') for n in ['parent']+[x[0] for x in STAGES]};current=guards['release'];assert len(current)==137 and len(guards['parent'])==135;assert manifest(APP)==current,'Unmeasured source edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected financial/core/execution/daily/window/routine/guard/entry/model/risk/native/lock changed';assert {p for p in current if guards['freshness'][p]!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Docs changed runtime';assert {p for p in current if guards['parent'].get(p)!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md','src/identity.js','src/routes/api.js','src/db.js','src/period-reviews.js','public/index.html','public/js/views/identity.js','public/js/views/dashboard.js','public/js/views/journal.js','public/js/views/period-reviews.js','public/js/views/settings.js'}
 harness=read('analysis/evidence/m105/harness-source.json')
 for p,h in harness.items():assert sha((ROOT/p).read_bytes())==h,p
 feature=gate('feature',142,0,10)
 for r in feature['runs']:assert counts(read('analysis/evidence/m105/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 protected={s:gate(s,p,0,n) for s,p,n in [('emotions',170,13),('confluences',160,8),('execution',260,9),('routine',321,10),('offline',178,4),('market',325,4)]};changes=gate('changes',152,1,11,1);opportunities=gate('opportunities',144,1,10,1);reviews=gate('reviews',159,1,9,1);behavior=gate('behavior',113,2,7,1);process=gate('process',106,2,6,1);screenshots=gate('screenshots',223,3,9,1)
 for suite,n in [('changes',(13,1)),('opportunities',(12,1)),('reviews',(14,1)),('behavior',(9,2)),('process',(9,2)),('screenshots',(11,3))]:assert counts(read('analysis/evidence/m105/'+suite+'/feature-migration-results.json'))==n
 raw=gate('raw',596,156,31,21,1,1);declared=gate('declared',824,4,31,2);live=gate('pure',70,1,8,6,0,5);assert 'API.getToken is not a function' in (E/'declared-probe-m79-account-forwarding.txt').read_text()
 controls={'parent-pure-results.json':(0,27),'pure-only-tally-results.json':(0,20),'tally-only-api-results.json':(3,19),'api-only-quarter-results.json':(1,6),'quarter-initial-results.json':(5,2),'quarter-only-ui-results.json':(2,13),'ui-only-hardening-results.json':(7,4),'hardening-only-portable-results.json':(1,12),'portable-only-archive-ui-results.json':(1,5),'archive-only-freshness-results.json':(7,1),'migration-initial-results.json':(12,1),'parent-migration-results.json':(9,4)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m105/'+p))==n,(p,n)
 assert read('analysis/evidence/m105/ledger-initial-classification.json') and read('analysis/evidence/m105/freeze-initial-syntax.json')
 parents=read('analysis/evidence/m105/regression-parents.json');assert all(v['byte_differences']==0 for v in parents['parents'].values()) and [v['files'] for v in parents['parents'].values()]==[135,133,131,129,127,125,123,121,119,117,114,110,112,112]
 native=read('analysis/evidence/m105/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text();expected=(None,None,2) if r['arm']=='raw' and r['suite']=='api' else (200,6,1) if r['arm']=='raw' else (121,0,0) if r['suite']=='api' else (204,2,1);assert (r['pass'],r['fail'],r['exit_code'])==expected,(r,expected)
  if r['suite']=='bots':assert (r['parity_fills'],r['parity_mismatches'])==(15,0) and 'filled sample for parity: 15 trades' in text
 smoke=read('analysis/evidence/m105/smoke-exit.json');text=(E/'smoke.txt').read_text();assert smoke['exit_code']==0 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
 g=runpy.run_path(str(ROOT/'analysis/gen-progress.py'),run_name='progress_gate');rows=g['rows'];ledger={'total':len(rows),'done':g['done'],'partial':g['part'],'todo':g['todo'],'no_action':g['noact'],'partition_groups':len(g['GROUPS']),'partial_ids':[k for k,v in rows.items() if v['status']=='partial'],'todo_ids':[k for k,v in rows.items() if v['status']=='todo']};assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,99,3,30,0,8];assert ledger['partial_ids']==['M30','M103','M108'] and rows['M105']['status']=='done' and all(rows[k]['status']=='todo' for k in ['M106','M107','M111','M112'])
 P.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m105-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name in STAGES:
   after=work/name;after.mkdir()
   if a.capture_stages or name=='release':
    source=APP if name=='release' else Path('/tmp/m105-'+name+'-stage/app')
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m105-identity-theme-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir();assert sha((ROOT/'tradingpro-main.zip').read_bytes())=='7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final);assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes();cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature':{k:feature[k] for k in ['pass','fail','probes','scope']},'protected':{s:{k:v[k] for k in ['pass','fail','probes']} for s,v in protected.items()},'original_changes':{'pass':152,'fail':1,'probes':11,'schema_migration':[13,1]},'original_opportunities':{'pass':144,'fail':1,'probes':10,'schema_migration':[12,1]},'original_reviews':{'pass':159,'fail':1,'probes':9,'schema_migration':[14,1]},'original_behavior':{'pass':113,'fail':2,'probes':7,'schema_migration':[9,2]},'original_process':{'pass':106,'fail':2,'probes':6,'schema_migration':[9,2]},'original_screenshots':{'pass':223,'fail':3,'probes':9,'schema_migration':[11,3]},'schema_negative_scope':'Unchanged whole-schema shape expectations kept on additive identityobjects. Actual135-parent additive13/0 verifies4newobjects/old63cols/alloriginalrawfacts exact, stable actualparent M102lazybootstrap isolated.','raw':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','summaryless']},'declared':{k:declared[k] for k in ['pass','fail','probes','completed_nonzero']},'live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless']},'regression_parents':parents,'native':native,'native_limits':'Parent/current same15syntheticfill/0mismatches; both>20sample conditions fail, no padding/clock/floor/risk/targets retune.','smoke':{**smoke,'conditional_views_passed':22,'style_failures':0,'console_errors':0,'canvas_environment_limits':8},'controls_and_errors':controls,'actual_parent_additive_migration':{'pass':13,'fail':0,'parent_control':[9,4],'new_schema_objects':4,'original_trade_columns':63,'old_facts_byte_differences':0},'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':137,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'harness_source_files':len(harness),'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M105 optional declaredselfdescription/quartertheme/current acknowledged-plan tally only; not mentalstate/selfworth/identityscore/causal/broker/action fulfilment or readiness/permission/risk/core. Receipt-as-of historicalday, savedquarter immutable identity/theme separateactionfocus/intention. Imported ownreceiving INACTIVE archives unverified originals, no proof/tally replay. M106 next/M107/M111/M112TODO/M30/M103/M108partial; no70%/causal/predictive/provider/human/meditation/pixel/productionproof.'};(P/'M105-IDENTITY-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist());jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':137,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n');print('Nine runtime stages + docs + actual903 + pristine: forward/reverse0 byte differences.');print('Exact132/99/3/30; M105142/0, original/native/schema/raw/provider/initial negatives retained.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
