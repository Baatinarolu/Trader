#!/usr/bin/env python3
"""Original native HTTP scripts on separately started processes. API BASE arg,
bots TJ_BASE env and cleanup DB EXACTLY match server. Servers started/stopped by
Arena process tools; this runner never daemonises. All arms use explicitly
labelled production offline synthetic candle IO; only parent/fixture arms have
declared synthetic preparation via actual modules (not new feature proof).
"""
from pathlib import Path
import concurrent.futures, json, os, re, subprocess
ROOT=Path(__file__).resolve().parent.parent;E=ROOT/'analysis/evidence/m86';APP=ROOT/'extracted/tradejournal'
ARMS=[('parent',Path('/tmp/m86-parent/app'),3007,'/tmp/m86-parent-native.db'),('raw',APP,3008,'/tmp/m86-raw-native.db'),('fixture',APP,3009,'/tmp/m86-fixture-native.db')]
def arm(row):
 name,app,port,db=row;rows=[]
 for suite in ['api','bots']:
  base=f'http://127.0.0.1:{port}';env={**os.environ,'NODE_OPTIONS':'','TJ_APP':str(app),'TRADEJOURNAL_DB':db,'TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','TJ_SCHEDULER':'0','TJ_OFFLINE_CANDLES':'1','TJ_BASE':base};cmd=['node','scripts/'+suite+'-test.js']+([base] if suite=='api' else [])
  out=subprocess.run(cmd,cwd=app,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120);text=out.stdout.decode(errors='replace');path=f'native-{name}-{suite}.txt';(E/path).write_text(text)
  m=list(re.finditer(r'(\d+)\s+passed\s*[,·/]?\s*(\d+)\s+failed',text,re.I));counts=[int(v) for v in m[-1].groups()] if m else [None,None]
  data={'arm':name,'suite':suite,'server_app':str(app),'scripts_unchanged':True,'pass':counts[0],'fail':counts[1],'exit_code':out.returncode,'output':path,'scope':'Original native assertions and cleanup on same server/DB; synthetic offline candle IO. '+('NO preparation fixture, retained new mandatory-routine aborts, not integrated-all assertion pass.' if name=='raw' else 'DECLARED synthetic owned preparation actual modules/15m control clock; old assertions, not human/meditation/live/broker/production proof.')};parity=re.search(r'(\d+) trades:.*?\((\d+) mismatches\)',text);data.update({'parity_fills':int(parity.group(1)) if parity else None,'parity_mismatches':int(parity.group(2)) if parity else None});rows.append(data);print(json.dumps(data),flush=True)
 return rows
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:groups=list(pool.map(arm,ARMS))
 rows=[r for group in groups for r in group];(E/'native-runs.json').write_text(json.dumps(rows,indent=2)+'\n')
