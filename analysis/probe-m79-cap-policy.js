#!/usr/bin/env node
'use strict';
/** M83/M113 actual libSQL + authenticated account API + real coach/correction.
 * Declared profitable 12-trades/day history is a policy stress case, not edge.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
for (const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN']) process.env[k] = '';
const file = path.join(os.tmpdir(), `m79-cap-${process.pid}.db`); process.env.TRADEJOURNAL_DB = file;
const D = require(path.join(APP, 'src/db')), Cor = require(path.join(APP, 'src/bots/correction')),
  Coach = require(path.join(APP, 'src/coach')), P = require(path.join(APP, 'src/performance'));
let pass = 0, fail = 0, server; const results = [];
function ok(label, value, detail) { results.push({label, passed: !!value, ...(!value ? {detail} : {})}); console.log(`${value ? 'ok' : 'FAIL'} ${label}${!value ? ' '+JSON.stringify(detail) : ''}`); value ? pass++ : fail++; }
(async () => { try {
  await D.ready;
  const user = await D.createUser({email:`m79-cap-${process.pid}@test.local`,name:'Cap policy',password:'test-only'});
  const other = await D.createUser({email:`m79-other-${process.pid}@test.local`,name:'Other',password:'test-only'});
  const token = await D.createSession(user.userId), otherToken = await D.createSession(other.userId);
  const express = require(path.join(APP,'node_modules/express')), app = express(); app.use(express.json()); app.use('/api',require(path.join(APP,'src/routes/api')));
  server = await new Promise(resolve => { const s = app.listen(0, '0.0.0.0', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (url, body, method = 'POST', tok = token) => { const r = await fetch(base+url,{method,headers:{'x-session':tok,'content-type':'application/json'},...(body === undefined ? {} : {body:JSON.stringify(body)})}); return {status:r.status,data:await r.json()}; };
  const account = () => D.db.prepare('SELECT * FROM accounts WHERE id=?').get(user.accountId);
  ok('additive schema has persisted cap', (await D.db.prepare('PRAGMA table_info(accounts)').all()).some(c => c.name === 'max_trades_day'));
  const original = await account(); ok('existing/default account gets course intraday3', original.max_trades_day === 3, original.max_trades_day);
  const newAcc = await request('/accounts',{name:'Scalp',max_trades_day:5});
  ok('POST stores explicit scalper5',newAcc.status===200 && newAcc.data.account.max_trades_day===5,newAcc);
  const def = await request('/accounts',{name:'Default'}); ok('POST without cap defaults3',def.data.account?.max_trades_day===3,def);
  const update = await request('/accounts/'+user.accountId,{max_trades_day:5},'PUT'); ok('PUT stores explicit5',update.data.account?.max_trades_day===5,update);
  const rename = await request('/accounts/'+user.accountId,{name:'Renamed'},'PUT'); ok('unrelated rename retains5',rename.data.account?.max_trades_day===5,rename);
  for (const value of [0,-1,101,2.5,'bad','',null,true]) {
    const r = await request('/accounts/'+user.accountId,{max_trades_day:value},'PUT');
    ok('invalid PUT cap rejected: '+JSON.stringify(value),r.status===400 && (await account()).max_trades_day===5,r);
    const c = await request('/accounts',{name:'Invalid',max_trades_day:value}); ok('invalid POST cap rejected: '+JSON.stringify(value),c.status===400,c);
  }
  for (const n of [1,2,3,5,100]) {
    const r = await request('/accounts/'+user.accountId,{max_trades_day:n},'PUT'); ok('explicit bounded integer '+n+' roundtrips',r.data.account?.max_trades_day===n,r);
  }
  await request('/accounts/'+user.accountId,{max_trades_day:3},'PUT');
  const foreign = await request('/accounts/'+user.accountId,{max_trades_day:20},'PUT',otherToken); ok('another user cannot edit policy',foreign.status===404 && (await account()).max_trades_day===3,foreign);
  const first = await Cor.guardrails(user.userId,{accountId:user.accountId}); ok('empty sample uses chosen3',first.max_trades_day===3,first.max_trades_day);
  await request('/accounts/'+user.accountId,{max_trades_day:5},'PUT');
  const during = await Cor.guardrails(user.userId,{accountId:user.accountId}); ok('midday config edit cannot undo frozen3',during.max_trades_day===3,during.max_trades_day);
  const rows = [];
  for(let i=0;i<36;i++) {
    const opened = new Date(Date.now()-(2+Math.floor(i/12))*864e5 + (i%12)*60000).toISOString();
    rows.push({user_id:user.userId,account_id:user.accountId,symbol:'TEST',status:'closed',direction:'long',opened_at:opened,closed_at:opened,entry:100,exit:101,size:1,net_pnl:10,r_multiple:1,risk_amount:10});
  }
  await D.db.batch(rows.map(t=>({sql:'INSERT INTO trades(user_id,account_id,symbol,status,direction,opened_at,closed_at,entry,exit,size,net_pnl,r_multiple,risk_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',args:Object.values(t)})));
  const populated = await Cor.guardrails(user.userId,{accountId:user.accountId});
  ok('36 closed trades do not ratify12/day or rewrite preselected3',populated.max_trades_day===3,populated.max_trades_day);
  ok('historical cap exists only as labelled suggestion',populated.evidence?.trade_cap_suggestion===6 && /suggestion/i.test(populated.evidence?.trade_cap_basis||''),populated.evidence);
  const briefing = Coach.briefing({trades:rows.map(t=>P.decorate(t,'UTC')),account:{...await account(),max_trades_day:3}});
  ok('coach never ratifies history average12/day',briefing.risk_plan.max_trades_today===3,briefing.risk_plan.max_trades_today);
  const scalp = await Cor.guardrails(user.userId,{accountId:newAcc.data.account.id}); ok('second account independently freezes scalper5',scalp.max_trades_day===5,scalp.max_trades_day);
  const guardPath = path.join(APP,'src/bots/guardrails.js');
  if(fs.existsSync(guardPath)) {
    const G = require(guardPath), tomorrow = await G.dailyCap(D.db,user.userId,await account(),Date.now()+864e5);
    ok('next UTC day adopts explicitly chosen5, not old3/history6',tomorrow.max_trades_day===5,tomorrow);
    const parallel = await Promise.all(Array.from({length:8},()=>G.dailyCap(D.db,user.userId,awaitableAccount(),Date.now()+2*864e5)));
    ok('simultaneous first checks agree on one daily cap',parallel.every(g=>g.max_trades_day===5),parallel);
    function awaitableAccount() { return {...original,max_trades_day:5}; }
  } else { ok('next UTC day adopts explicitly chosen5, not old3/history6',false,'no stored daily policy'); ok('simultaneous first checks agree on one daily cap',false,'no stored daily policy'); }
  await D.db.prepare('DELETE FROM trades WHERE user_id=?').run(user.userId);
  for (let i=0;i<5;i++) await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,closed_at,entry,exit,net_pnl) VALUES (?,?,?,'closed',?,?,100,101,1)").run(user.userId,newAcc.data.account.id,'TEST',new Date().toISOString(),new Date().toISOString());
  const short = await Cor.guardrails(user.userId,{accountId:newAcc.data.account.id}); ok('M11 floor30 stays30 with5 closed trades',short.min_trades_for_personal_guardrails===30 && short.sample_sufficient===false && short.max_trades_day===5,{floor:short.min_trades_for_personal_guardrails,sufficient:short.sample_sufficient,cap:short.max_trades_day});
  ok('settings expose cap with predecision guidance', /id="a-trades"/.test(fs.readFileSync(path.join(APP,'public/js/views/settings.js'),'utf8')));
} catch(e) { fail++; console.error(e.stack); } finally {
  if(server) await new Promise(r=>server.close(r));
  if(process.env.M79_RESULT) fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'M83/M113 configuration/UTC day policy, no market-outcome claim'},null,2)+'\n');
  console.log(`M83/M113 cap policy: ${pass} passed, ${fail} failed`);
  for(const x of ['', '-wal','-shm']) try{fs.unlinkSync(file+x);}catch{} process.exitCode=fail?1:0;
} })();
