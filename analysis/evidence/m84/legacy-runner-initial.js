#!/usr/bin/env node
'use strict';
/** Declared PREREQUISITE ISOLATION for existing M79/M81/M82 guard-rule probes.
 * The new writing prerequisite is held fulfilled; missing pre-trade emotion in
 * old synthetic fixtures is explicitly supplied as Neutral. New closure prompt
 * is held fulfilled in those old UI flows. These are NOT full M85-policy passes.
 * Original unmodified runs/negatives are retained separately. New M85 probes run
 * with none of these seams and separately prove mandatory input/writing/real UI.
 * No production file, geometry, price, risk coefficient or sample floor changes.
 * Usage: TJ_APP=... node analysis/legacy-guard-fixture-runner.js analysis/probe-...
 */
const fs=require('fs'),path=require('path'),Module=require('module');const script=path.resolve(process.argv[2]||'');if(!fs.existsSync(script))throw Error('Pass an existing legacy probe');const APP=path.resolve(process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal'));
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){const value=originalLoad.apply(this,arguments);let resolved;try{resolved=Module._resolveFilename(request,parent,isMain);}catch{return value;}
 if(resolved===path.join(APP,'src/journaling.js') && value.syncLosses && !value.__legacyPrerequisite){
   value.syncLosses=async(_store,_uid,_account,_rows,nowMs)=>({pending_count:0,pending:[],completed_count:0,rule_date:new Date(nowMs).toISOString().slice(0,10),timezone:'UTC',scope:'DECLARED legacy-probe fixture: M85 writing held fulfilled, not exercised'});
   Object.defineProperty(value,'__legacyPrerequisite',{value:true});
 }
 if(resolved.includes('/jsdom/') && value.JSDOM && !value.__legacyDom){
   const Original=value.JSDOM;value.JSDOM=class extends Original{constructor(...a){super(...a);const w=this.window,raw=w.eval;w.eval=function(source){const out=raw.call(w,source);
     if(w.Views?.tradeForm && !w.Views.tradeForm.__legacyFixture){const f=w.Views.tradeForm;const replacement=(...args)=>{const form=f(...args),emotion=form.node.querySelector('#tf-emo-before');if(emotion&&!emotion.value)emotion.value='Neutral';return form;};replacement.__legacyFixture=true;w.Views.tradeForm=replacement;}
     if(w.Views?.openJournalReview)w.Views.openJournalReview=async()=>undefined; // new prompt prerequisite held fulfilled, NOT tested by old flow
     return out;
   };}};Object.defineProperty(value,'__legacyDom',{value:true});
 }
 return value;
};
const originalFetch=global.fetch;global.fetch=(url,opts)=>{
 if(opts?.body && ['POST','PUT'].includes(opts.method||'GET') && /\/api\/trades(?:\/\d+)?(?:\?|$)/.test(String(url))){let b;try{b=JSON.parse(opts.body);}catch{}
  if(b?.status==='open' && b.record_only!==true && (b.emotion_before===undefined||b.emotion_before===null||b.emotion_before===''))opts={...opts,body:JSON.stringify({...b,emotion_before:'Neutral'})};
 }
 return originalFetch(url,opts);
};
let source=fs.readFileSync(script,'utf8');
if(path.basename(script)==='probe-m79-migration.js'){
 const old="one.tables.length===4",replacement="one.tables.length===(one.tables.some(t=>t.name==='guardrail_reflections')?5:4) && ['guardrail_day_caps','guardrail_day_state','guardrail_entry_admissions','guardrail_events'].every(n=>one.tables.some(t=>t.name===n))";
 if(!source.includes(old))throw Error('Unexpected historical migration assertion');source=source.replace(old,replacement); // new additive table, old four names still REQUIRED
}
console.log('DECLARED legacy guard-rule prerequisite isolation: writing fulfilled / explicit synthetic Neutral / new UI prompt fulfilled / additive table names. Original negatives kept; not M85 integrated-policy proof.');
const m=new Module(script,module);m.filename=script;m.paths=Module._nodeModulePaths(path.dirname(script));m._compile(source,script);
