'use strict';
/** ONLY A TEST SERVER, never production code. Original native HTTP scripts are
 * unchanged. New users have an explicitly DECLARED synthetic preparation fixture
 * made with actual routine module operations and a controlled15m server clock.
 * This isolates older native assertions, NOT new routine/human/timer proof.
 * Actual raw-native no-fixture results and all new no-adapter proofs are retained.
 * No model/risk/floor, HTTP request or native test assertion is intercepted.
 */
const path=require('path'),APP=path.resolve(process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal')),D=require(path.join(APP,'src/db')),R=require(path.join(APP,'src/routine')),create=D.createUser;
D.createUser=async function(...args){const u=await create.apply(this,args),now=Date.now(),begin=now-900000,window=new Date(now+120*60000).toISOString().slice(11,16);
  await D.db.prepare("UPDATE accounts SET routine_window_start=?,routine_timezone='UTC',routine_lead_minutes=180,routine_order='ep17' WHERE id=?").run(window,u.accountId);
  const state=await R.current(u.userId,{accountId:u.accountId,nowMs:begin}),cycle_id=state.cycle.id;
  for(const b of [{step:'calendar',reviewed:true,method:'manual_external',summary:'DECLARED synthetic native-fixture human review, no real news clearance'},{step:'plan',reviewed:true,plan_text:'DECLARED native-fixture manual plan, no actual human review claim'},{step:'charts',reviewed:true,daily_bias:'neutral',htf_range:'DECLARED synthetic review',alert_status:'not_applicable',alert_note:'DECLARED native fixture, no actual external alert claim'}])await R.acknowledge(u.userId,{account_id:u.accountId,cycle_id,...b},begin);
  await R.meditation(u.userId,{account_id:u.accountId,cycle_id,action:'start'},begin);await R.meditation(u.userId,{account_id:u.accountId,cycle_id,action:'complete'},now);await R.acknowledge(u.userId,{account_id:u.accountId,cycle_id,step:'check_in',calm:true,clear:true,following_plan:true,would_take_if_up_big:true},now);return u;
};
console.log('DECLARED NATIVE fixture: synthetic owned preparation via actual modules/15m controlled clock. Old native assertions only; not integrated routine/human/meditation proof.');
require(path.join(APP,'server'));
const {app,bootPromise}=require(path.join(APP,'server'));
bootPromise.then(()=>{app.set('tj-internal',true);app.listen(Number(process.env.PORT||3002),'0.0.0.0',()=>console.log('Declared native test fixture server listening on '+(process.env.PORT||3002)+'; scheduler OFF.'));}).catch(e=>{console.error('Native fixture startup failed:',e.message);process.exitCode=1;});
