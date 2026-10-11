'use strict';
/** DECLARED M64-only prerequisite isolation for UNCHANGED inherited guard tests.
 * The current routine is held fulfilled and its NEW first-entry capture disabled.
 * All old cap/loss/profit/writing/admission tests remain in their original code.
 * NOT integrated M64 policy/timer/provenance proof. New M64 probes never load this.
 * Use NODE_OPTIONS=--require=<this file> to cover their separate-process restarts.
 * Older M79/M81 tests may additionally use legacy-guard-fixture-runner.js for their
 * declared M85 writing/emotion/prompt fixture; M84/M85 tests need ONLY this layer.
 */
const path=require('path'),Module=require('module'),APP=path.resolve(process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal')),load=Module._load;
Module._load=function(request,parent,isMain){const value=load.apply(this,arguments);let resolved;try{resolved=Module._resolveFilename(request,parent,isMain);}catch{return value;}
  if(resolved===path.join(APP,'src/routine.js')&&value.current&&!value.__m64LegacyIsolation){
    value.current=async(userId,{account=null,accountId=null,store,nowMs=Date.now()}={})=>{if(!account)account=await require(path.join(APP,'src/routine-records')).owned(store||require(path.join(APP,'src/db')).db,userId,accountId);return{account_id:account.id,state:'complete',complete:true,cycle:null,steps:[],order:[],next_step:null,evaluated_at:new Date(nowMs).toISOString(),scope:'DECLARED M64 held-fulfilled fixture: no routine workflow/timer/first-entry proof'};};
    value.observeAdmission=async()=>{}; // isolate the new capture, not old admissions
    Object.defineProperty(value,'__m64LegacyIsolation',{value:true});
  }
  return value;
};
console.log('DECLARED M64 prerequisite isolation: routine held fulfilled, new first-entry routine capture not exercised. NOT full current policy proof. Original runs/negatives retained.');
