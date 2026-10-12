#!/usr/bin/env python3
"""M99/M101 deterministic delivery:7 measured runtime stages/docs/actual32f/pristine.
--capture-stages first capture; durable rebuild replays saved all-byte stage patches.
Exact counters + additive schema/unchanged financial/permission guards. No secrets.
"""
from pathlib import Path,PurePosixPath
import argparse,io,re,runpy,shutil,tarfile,tempfile,zipfile,json
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m99';P=ROOT/'analysis/patches';BASE='32fdfbd9bd95963b15b116953dc9ea8022cffd6f'
STAGES=[('periods','m99-pure-calendar-template-input.patch'),('metrics','m99-honest-period-snapshot-metrics.patch'),('storage','m99-owned-revisioned-review-storage-api.patch'),('focus','m101-committed-focus-adjacent-followup.patch'),('ui','m99-m101-actual-period-editor-ui.patch'),('portable','m99-owned-unverified-json-history.patch'),('hardening','m99-saved-receipt-textarea-warning-hardening.patch'),('release','m99-m101-period-review-documentation.patch')]
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='artifact_helpers');sha,run,read,manifest,write,metadata,replay,counts,make_patch,contents,allowed,add_zip=[H[k] for k in ['sha','run','read','manifest','write','metadata','replay','counts','make_patch','contents','allowed','add_zip']]
CORE=H['CORE'];NEUTRAL=H['NEUTRAL']+['src/confluences.js','src/screenshots.js','src/emotions.js','src/performance.js','src/coach.js','src/bots/guardrails.js','src/bots/correction.js','src/process-outcomes.js','src/behavior-days.js','src/routes/bots.js','public/js/views/emotions.js','public/js/views/process-outcomes.js','public/js/views/behavior-days.js','public/js/views/bots.js','public/js/views/coach.js','public/js/views/analytics.js']
def gate(suite,p,f,n,nonzero=0,timeout=0,summaryless=0):
 d=read('analysis/evidence/m99/'+suite+'-summary.json');assert (d['pass'],d['fail'],d['probes'],d['completed_nonzero'],d['timeout_no_exit'],d['summaryless'])==(p,f,n,nonzero,timeout,summaryless),(suite,d);return d

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');a=ap.parse_args();assert run(['git','branch','--show-current']).decode().strip()=='arena/762c0295-trader'
 guards={n:read('analysis/evidence/m99/'+n+'-source.json') for n in ['parent']+[x[0] for x in STAGES]};current=guards['release'];assert len(current)==131 and len(guards['parent'])==129;assert manifest(APP)==current,'Unmeasured source edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected finance/core/execution/routine/entry/risk/score/native/lock changed';assert {p for p in current if guards['hardening'][p]!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Docs changed runtime';assert {p for p in current if guards['parent'].get(p)!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md','src/period-reviews.js','src/routes/api.js','src/db.js','public/index.html','public/js/views/period-reviews.js','public/js/views/journal.js','public/js/views/settings.js'}
 harness=read('analysis/evidence/m99/harness-source.json')
 for p,h in harness.items():assert sha((ROOT/p).read_bytes())==h,p
 feature=gate('feature',160,0,9)
 for r in feature['runs']:assert counts(read('analysis/evidence/m99/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 protected={s:gate(s,p,0,n) for s,p,n in [('emotions',170,13),('confluences',160,8),('execution',260,9),('routine',321,10),('offline',178,4),('market',325,4)]};behavior=gate('behavior',113,2,7,1);process=gate('process',106,2,6,1);screenshots=gate('screenshots',223,3,9,1)
 assert counts(read('analysis/evidence/m99/behavior/feature-migration-results.json'))==(9,2) and counts(read('analysis/evidence/m99/process/feature-migration-results.json'))==(9,2) and counts(read('analysis/evidence/m99/screenshots/feature-migration-results.json'))==(11,3)
 raw=gate('raw',596,156,31,21,1,1);declared=gate('declared',824,4,31,2);live=gate('pure',70,1,8,6,0,5);assert 'API.getToken is not a function' in (E/'declared-probe-m79-account-forwarding.txt').read_text()
 controls={'parent-periods-results.json':(0,30),'periods-only-metrics-results.json':(0,20),'metrics-only-storage-initial-results.json':(2,11),'metrics-only-storage-results.json':(5,22),'storage-only-focus-initial-results.json':(1,5),'storage-only-focus-results.json':(4,12),'focus-only-ui-results.json':(2,16),'ui-initial-results.json':(3,1),'ui-only-portable-initial-results.json':(0,2),'ui-only-portable-results.json':(1,13),'portable-only-hardening-results.json':(5,7),'parent-migration-results.json':(11,4)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m99/'+p))==n,(p,n)
 assert 'Not signed in' in (E/'ui-token-fixture-abort.txt').read_text();assert 'invalid choice' in (E/'behavior-runner-initial.txt').read_text()
 parents=read('analysis/evidence/m99/regression-parents.json');assert all(v['byte_differences']==0 for v in parents['parents'].values()) and [v['files'] for v in parents['parents'].values()]==[129,127,125,123,121,119,117,114,110,112,112]
 native=read('analysis/evidence/m99/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text();expected=(None,None,2) if r['arm']=='raw' and r['suite']=='api' else (202,4,1) if r['arm']=='raw' else (121,0,0) if r['suite']=='api' else (206,0,0);assert (r['pass'],r['fail'],r['exit_code'])==expected,(r,expected)
  if r['suite']=='bots':assert (r['parity_fills'],r['parity_mismatches'])==(24,0) and 'filled sample for parity: 24 trades' in text
 smoke=read('analysis/evidence/m99/smoke-exit.json');text=(E/'smoke.txt').read_text();assert smoke['exit_code']==0 and 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
 g=runpy.run_path(str(ROOT/'analysis/gen-progress.py'),run_name='progress_gate');rows=g['rows'];ledger={'total':len(rows),'done':g['done'],'partial':g['part'],'todo':g['todo'],'no_action':g['noact'],'partition_groups':len(g['GROUPS']),'partial_ids':[k for k,v in rows.items() if v['status']=='partial'],'todo_ids':[k for k,v in rows.items() if v['status']=='todo']};assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,96,3,33,0,8];assert ledger['partial_ids']==['M30','M103','M108'] and all(rows[k]['status']=='done' for k in ['M99','M101']) and all(rows[k]['status']=='todo' for k in ['M100','M104','M105','M106','M111','M112'])
 P.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m99-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name in STAGES:
   after=work/name;after.mkdir()
   if a.capture_stages or name=='release':
    source=APP if name=='release' else Path('/tmp/m99-'+name+'-stage/app')
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m99-m101-reviews-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir();assert sha((ROOT/'tradingpro-main.zip').read_bytes())=='7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final);assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes();cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature':{k:feature[k] for k in ['pass','fail','probes','scope']},'protected':{s:{k:v[k] for k in ['pass','fail','probes']} for s,v in protected.items()},'original_behavior':{'pass':113,'fail':2,'probes':7,'other_probes_pass':104,'schema_migration':[9,2]},'original_process':{'pass':106,'fail':2,'probes':6,'other_probes_pass':97,'schema_migration':[9,2]},'original_screenshots':{'pass':223,'fail':3,'probes':9,'schema_migration':[11,3]},'schema_negative_scope':'Unchanged whole-schema/all-table assumptions fail on legitimate additive review objects; retained, not rewritten. Actual129-parent additive upgrade15/0 preserves ALL original columns/rows/clock/evidence/score/permissions.','raw':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','summaryless']},'declared':{k:declared[k] for k in ['pass','fail','probes','completed_nonzero']},'live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless']},'regression_parents':parents,'native':native,'smoke':{**smoke,'conditional_views_passed':21,'style_failures':0,'console_errors':0,'canvas_environment_limits':8},'controls_and_errors':controls,'actual_parent_additive_migration':{'pass':15,'fail':0,'parent_control':[11,4],'new_schema_objects':4,'original_trade_columns':63,'old_facts_byte_differences':0},'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':131,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'harness_source_files':len(harness),'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M99 periodic artifact/M101 focus with server saved baselines, immutable revisions/explicit self-report; UTC/Monday APP calendars, annual exact questions APP-guided. Current/declared finance not broker/causal/predictive proof, imported own receiving/unverified originals; not strategy/goal/risk/core/permission/apply or actualacted completion. M100 next, M104/M105/M106/M111/M112TODO; M30/M103/M108partial; no70%/provider/pixels/human/meditation/production edge proof.'};(P/'M99-REVIEW-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist());jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':131,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n');print('Seven runtime stages + docs + actual32f + pristine: forward/reverse0 byte differences.');print('Exact132/96/3/33; M99/M101 160/0, original schema/raw/provider controls/negatives retained.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
