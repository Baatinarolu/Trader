#!/usr/bin/env python3
"""Unchanged native scripts, same-server cleanup DB; bounded per-arm serial runs.
Retain partial stdout/null exits on timeout, unlike original aborting wrapper.
Servers managed with Arena process tools, never started by this script.
"""
from pathlib import Path
import argparse,json,os,re,subprocess
ROOT=Path(__file__).resolve().parent.parent;E=ROOT/'analysis/evidence/m91';APP=ROOT/'extracted/tradejournal'
ARMS=[('parent',Path('/tmp/m91-parent/app'),3123,'/tmp/m91-parent-native.db'),('raw',APP,3124,'/tmp/m91-raw-native.db'),('fixture',APP,3125,'/tmp/m91-fixture-native.db')]
def arm(row,timeout):
 name,app,port,db=row;rows=[]
 for suite in ['api','bots']:
  base=f'http://127.0.0.1:{port}';env={**os.environ,'NODE_OPTIONS':'','TJ_APP':str(app),'TRADEJOURNAL_DB':db,'TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','TJ_SCHEDULER':'0','TJ_OFFLINE_CANDLES':'1','TJ_BASE':base};cmd=['node','scripts/'+suite+'-test.js']+([base] if suite=='api' else [])
  try:r=subprocess.run(cmd,cwd=app,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout);output=r.stdout;exit=r.returncode;status='completed'
  except subprocess.TimeoutExpired as r:output=r.stdout or b'';exit=None;status='killed_on_timeout'
  text=output.decode(errors='replace');path=f'native-{name}-{suite}.txt';(E/path).write_bytes(output);m=list(re.finditer(r'(\d+)\s+passed\s*[,·/]?\s*(\d+)\s+failed',text,re.I));counts=[int(v) for v in m[-1].groups()] if m else [None,None];parity=re.search(r'(\d+) trades:.*?\((\d+) mismatches\)',text)
  data={'arm':name,'suite':suite,'server_app':str(app),'scripts_unchanged':True,'pass':counts[0],'fail':counts[1],'exit_code':exit,'status':status,'output':path,'parity_fills':int(parity.group(1)) if parity else None,'parity_mismatches':int(parity.group(2)) if parity else None,'scope':'Original native assertions/cleanup, matching server/DB; synthetic offline candles. '+('NO preparation, mandatory routine negatives retained.' if name=='raw' else 'DECLARED actual owned preparation/15m control clock, not human or meditation proof.')+' Not broker/live/pixels/edge/production.'};rows.append(data);print(json.dumps(data),flush=True)
 return rows
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--arm',choices=[r[0] for r in ARMS]);ap.add_argument('--timeout',type=int,default=180);a=ap.parse_args();rows=[r for row in ARMS if not a.arm or row[0]==a.arm for r in arm(row,a.timeout)]
 if a.arm:
  old=json.loads((E/'native-runs.json').read_text()) if (E/'native-runs.json').exists() else [];changed={(r['arm'],r['suite']) for r in rows};rows=[r for r in old if (r['arm'],r['suite']) not in changed]+rows
 rows.sort(key=lambda r:([x[0] for x in ARMS].index(r['arm']),r['suite']));(E/'native-runs.json').write_text(json.dumps(rows,indent=2)+'\n')
