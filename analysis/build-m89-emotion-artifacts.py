#!/usr/bin/env python3
"""Deterministic M89 delivery, literal stage/actual-parent/pristine byte proofs.
--capture-stages initial frozen trees; durable replay afterwards uses saved patches.
No env/credential/DB/dependency artifacts. Counters/negatives are explicit gates.
"""
from pathlib import Path,PurePosixPath
import argparse,hashlib,io,json,re,runpy,shutil,subprocess,tarfile,tempfile,zipfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m89';P=ROOT/'analysis/patches';BASE='63d8969a23066e9bd70b592d8b0ecd12585579ec'
STAGES=[('timing','m89-app-timing-context.patch'),('storage','m89-owned-first-response-storage-api.patch'),('analysis','m89-captured-only-analytics-coach.patch'),('ui','m89-after-entry-close-real-ui.patch'),('portable','m89-portable-history-immutable-update.patch'),('hardening','m89-stale-account-callback-omission-hardening.patch'),('receipt','m89-receiving-not-answer-clock.patch'),('receipt-ui','m89-unverified-original-clock-ui.patch'),('context','m89-original-declared-financial-context.patch'),('availability','m89-financial-backup-under-capture-outage.patch'),('context-ui','m89-original-versus-current-context-ui.patch'),('coach-ui','m89-known-group-net-not-causal-impact-ui.patch'),('delivery','m89-emotion-documentation.patch')]
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='artifact_helpers');sha,run,read,manifest,write,metadata,replay,counts,make_patch,contents,allowed,add_zip=[H[k] for k in ['sha','run','read','manifest','write','metadata','replay','counts','make_patch','contents','allowed','add_zip']]
CORE=H['CORE'];NEUTRAL=H['NEUTRAL']+['src/confluences.js','src/screenshots.js']
def gate(suite,p,f,n,nonzero=0,timeout=0,summaryless=0):
 d=read('analysis/evidence/m89/'+suite+'-summary.json');assert (d['pass'],d['fail'],d['probes'],d['completed_nonzero'],d['timeout_no_exit'],d['summaryless'])==(p,f,n,nonzero,timeout,summaryless),(suite,d);return d

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--capture-stages',action='store_true');a=ap.parse_args();assert run(['git','branch','--show-current']).decode().strip()=='arena/762c0295-trader'
 guards={n:read('analysis/evidence/m89/'+n+'-source.json') for n in ['parent']+[x[0] for x in STAGES]};current=guards['delivery'];assert len(current)==125 and len(guards['parent'])==123;assert manifest(APP)==current,'Unmeasured app edit';assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Protected engine/finance/core/execution/routine/lock/native code changed';assert {p for p in current if guards['coach-ui'][p]!=current[p]}=={'README.md','docs/API.md','docs/GUARDRAILS.md'},'Documentation changed runtime'
 for p,h in read('analysis/evidence/m89/harness-source.json').items():assert sha((ROOT/p).read_bytes())==h,p
 feature=gate('feature',170,0,13)
 for r in feature['runs']:assert counts(read('analysis/evidence/m89/feature-'+r['name']+'-results.json'))==(r['expected_pass'],0) and r['exit_code']==0
 protected={s:gate(s,p,0,n) for s,p,n in [('confluences',160,8),('execution',260,9),('routine',321,10),('offline',178,4),('market',325,4)]};screenshots=gate('screenshots',223,3,9,1);assert counts(read('analysis/evidence/m89/screenshots/feature-migration-results.json'))==(11,3)
 raw=gate('raw',597,155,31,21,1,1);declared=gate('declared',825,3,31,1);live=gate('pure',70,1,8,6,0,5);assert counts(read('analysis/evidence/m89/parent-declared-m85-ui-results.json'))==(22,3)
 controls={'parent-timing-results.json':(0,28),'timing-only-storage-results.json':(5,23),'storage-only-analysis-results.json':(2,14),'analysis-only-ui-results.json':(2,18),'ui-initial-results.json':(18,2),'ui-only-portable-initial-results.json':(0,15),'portable-only-freshness-results.json':(8,4),'portable-only-settings-results.json':(2,3),'hardening-only-receipt-initial-results.json':(0,1),'hardening-only-receipt-fixture-results.json':(2,4),'hardening-only-receipt-results.json':(2,4),'receipt-initial-results.json':(4,2),'receipt-only-ui-results.json':(4,2),'receipt-ui-only-context-results.json':(1,7),'context-results.json':(5,3),'availability-only-context-ui-results.json':(0,3),'context-only-coach-ui-results.json':(2,1),'parent-migration-initial-results.json':(0,1),'migration-initial-results.json':(0,1),'parent-migration-results.json':(9,5)}
 for p,n in controls.items():assert counts(read('analysis/evidence/m89/'+p))==n,(p,n)
 parents=read('analysis/evidence/m89/regression-parents.json');assert all(v['byte_differences']==0 for v in parents['parents'].values()) and [v['files'] for v in parents['parents'].values()]==[123,121,119,117,114,110,112,112]
 native=read('analysis/evidence/m89/native-runs.json');assert len(native)==6
 for r in native:
  text=(E/r['output']).read_text();expected=(None,None,2) if r['arm']=='raw' and r['suite']=='api' else (200,6,1) if r['arm']=='raw' else (121,0,0) if r['suite']=='api' else (206,0,0);assert (r['pass'],r['fail'],r['exit_code'])==expected,(r,expected)
  if r['suite']=='bots':assert (r['parity_fills'],r['parity_mismatches'])==(24,0) and 'filled sample for parity: 24 trades' in text
 initial=read('analysis/evidence/m89/native-initial-runs.json');assert len(initial)==6
 for r in initial:
  if r['suite']=='bots':assert (r['pass'],r['fail'],r['parity_fills'],r['parity_mismatches'])==((199,7,24,0) if r['arm']=='raw' else (205,1,24,0));assert '0.19' in (E/('native-'+r['arm']+'-bots-initial.txt')).read_text()
 smoke=read('analysis/evidence/m89/smoke-exit.json');text=(E/'smoke.txt').read_text();assert smoke['exit_code']==0 and 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 16' in text
 assert read('analysis/evidence/m89/smoke-after-restart-initial-exit.json')['exit_code']==1 and 'RESULT: 20/21' in (E/'smoke-after-restart-initial.txt').read_text()
 contention={s:read('analysis/evidence/m89/contention/'+s+'-summary.json') for s in ['feature','confluences','execution','raw','declared']};assert [(contention[s]['pass'],contention[s]['fail']) for s in ['feature','confluences','execution','raw','declared']]==[(130,4),(128,1),(227,1),(596,156),(824,4)];assert read('analysis/evidence/m89/contention/smoke-exit.json')['exit_code']==1 and 'RESULT: 4/21' in (E/'contention/smoke.txt').read_text()
 g=runpy.run_path(str(ROOT/'analysis/gen-progress.py'),run_name='progress_gate');rows=g['rows'];ledger={'total':len(rows),'done':g['done'],'partial':g['part'],'todo':g['todo'],'no_action':g['noact'],'partition_groups':len(g['GROUPS']),'partial_ids':[k for k,v in rows.items() if v['status']=='partial'],'todo_ids':[k for k,v in rows.items() if v['status']=='todo']};assert [ledger[k] for k in ['total','done','partial','todo','no_action','partition_groups']]==[132,92,3,37,0,8];assert ledger['partial_ids']==['M30','M103','M108'] and rows['M89']['status']=='done' and all(rows[k]['status']=='todo' for k in ['M91','M106','M111','M112'])
 P.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m89-delivery-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/');write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent'];before=parent;stages=[]
  for name,patch_name in STAGES:
   after=work/name;after.mkdir()
   if a.capture_stages or name=='delivery':
    source=APP if name=='delivery' else Path('/tmp/m89-'+name+'-stage/app')
    for p,h in guards[name].items():b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after);run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name;replay(before,after,P/patch_name,work);stages.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**metadata(P/patch_name)});before=after
  final=before;combined=P/'m89-emotions-complete.patch';make_patch(parent,final,combined);replay(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir();assert sha((ROOT/'tradingpro-main.zip').read_bytes())=='7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final);assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes();cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay(pristine,fixed,cumulative,work)
  info={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},'ledger':ledger,'feature':{k:feature[k] for k in ['pass','fail','probes','scope']},'protected':{s:{k:v[k] for k in ['pass','fail','probes']} for s,v in protected.items()},'unchanged_screenshots':{'pass':223,'fail':3,'probes':9,'scope':'Inherited M88 nullable-column shape negatives; actual M89-parent migration14/0 preserves all original trade/labels/media/obligations.'},'raw':{k:raw[k] for k in ['pass','fail','probes','completed_nonzero','timeout_no_exit','summaryless']},'declared':{'pass':825,'fail':3,'probes':31,'parent_m85_ui':[22,3],'scope':'Fixed old server11th vs actual JSDOM day12th; identical actual parent negative, not new capturing proof.'},'live_provider_attempts':{k:live[k] for k in ['pass','fail','completed_nonzero','summaryless']},'regression_parents':parents,'native':native,'initial_native':initial,'smoke':{**smoke,'conditional_views_passed':21,'style_failures':0,'console_errors':0,'canvas_environment_limits':16},'fresh_preview_smoke_negative':read('analysis/evidence/m89/smoke-after-restart-initial-exit.json'),'focused_served_coach':{'chars':1716,'elapsed_ms':124,'non_canvas_errors':0,'scope':'Tracked actual boot/direct served render, NOT original2600ms route deadline proof.'},'contention_negatives':{s:{k:v[k] for k in ['pass','fail','completed_nonzero','timeout_no_exit','summaryless']} for s,v in contention.items()},'controls_and_errors':controls,'stages':stages,'combined':metadata(combined),'pristine_cumulative':metadata(cumulative),'fixed_zip':{'source_files':125,'application_byte_differences':0,'private_env_db_dependency_files':0},'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],'harness_source_files':len(read('analysis/evidence/m89/harness-source.json')),'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),'scope':'M89 APP-event first human response only; five-minute APP policy NOT course quote/broker execution/actual mental-state proof. Imported receiving vs unverified history, optional evidence not grade/core/admission/risk. No causal dollars/70%/edge/provider/pixel/human/meditation/production proof. M106/M111/M112 TODO, M30/M103/M108 partial.'};(P/'M89-EMOTION-STAGES.json').write_text(json.dumps(info,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0');archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
    source=ROOT/p
    if source.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,source.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/';actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)};assert actual==contents(fixed) and len(z.namelist())==len(set(z.namelist()));assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist());jwt=re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}');assert not any(jwt.search(z.read(n)) for n in z.namelist()),'JWT-shaped credential in ZIP'
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':125,'excluded_from_zip_to_avoid_self_hash':True};(E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n');print('Twelve runtime stages + docs + combined + pristine: forward/reverse0 byte differences.');print('Exact132/92/3/37, actual M89 170/0; inherited/initial/contention negatives retained, no policy retuning.');print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
