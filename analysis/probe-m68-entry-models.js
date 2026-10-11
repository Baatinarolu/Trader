'use strict';
/** M68 physical composition + actual levels/Now, both directions. TJ_APP = parent
 * negative control. Fixtures specify structural inputs, not historical edge. */
const path=require('path');
const APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal');
const TD=require(path.join(APP,'src/bots/topdown'));
const SU=require(path.join(APP,'src/bots/setup'));
const SMC=require(path.join(APP,'src/bots/smc'));
const Now=require(path.join(APP,'src/bots/now'));
const Mom=require(path.join(APP,'src/bots/momentum'));
const make=require('../extracted/tradejournal/scripts/fixtures/entry-model-fixture');
let pass=0,fail=0;
const ok=(n,c,d='')=>{console.log((c?' ok   ':' FAIL ')+n+(c||!d?'':' — '+d));c?pass++:fail++;};
function fresh(dir=-1,model='market_shift'){
 const f=make(dir,model);for(const x of [f.input.series,f.input.biasSeries,f.input.triggerSeries])x.smc.sessions=SMC.sessionState(new Date(f.END));return f;
}
function read(f,opts={}){
 const td=TD.build({...f.input,opts}),setups=SU.buildSetups(f.input.series.smc,{price:f.input.series.price,
  atr:1,bias:f.htfDir,indicators:f.input.series.ind,topdown:td,balance:10000,riskPct:.5,valuePerPoint:1,minRR:2,...opts});
 const c=setups.candidates.find(x=>x.dir===f.execDir);
 const now=Now.build({td,setups,series:f.input.series,symbol:'TEST',tf:'15m',nowMs:opts.observedAt||f.input.triggerSeries?.observed_at||f.END});
 return {td,setups,c,now};
}
for(const dir of [-1,1]){
 const m=x=>dir<0?x:200-x,label=dir<0?'short':'long';
 for(const model of ['market_shift','flip']){
  const f=fresh(dir,model),r=read(f,{useBreakers:model==='flip'}),name=label+' '+model;
  let buckets=0,coherent=true;
  for (const [parent,child,ms,count] of [[f.input.series.candles,f.input.triggerSeries.candles,900000,3],
    [f.input.biasSeries.candles,f.input.series.candles,14400000,16]]) for(const b of parent){
      const group=child.filter(c=>c.t>=b.t&&c.t<b.t+ms);if(group.length!==count)continue;buckets++;
      coherent=coherent&&b.o===group[0].o&&b.c===group.at(-1).c&&b.h===Math.max(...group.map(c=>c.h))&&b.l===Math.min(...group.map(c=>c.l));}
  ok(name+': explicit fixture preserves every complete overlapping MTF/HTF constituent bucket',coherent&&buckets>0);
  ok(name+': a named model is derived from the full causal sequence',r.td.entry_setup?.entry_model===model&&r.td.entry_setup.ready);
  ok(name+': the LTF zone, NOT the original MTF zone, decides actual entry',r.c.entry_model===model&&r.c.levels?.entry===m(model==='flip'?96.6:96.55)&&r.c.levels.entry_tf==='5m');
  ok(name+': model and evidence survive on the candidate and its levels',r.c.entry_evidence?.shift?.confirmed
   &&r.c.levels?.entry_evidence?.mitigation_at===f.input.triggerSeries.candles[118].t);
  ok(name+': Now uses exactly the same model/entry/stop/target',r.now.armed&&r.now.order?.entry_model===model
   &&r.now.order.entry_tf==='5m'&&r.now.order.entry===r.c.levels?.entry&&r.now.order.stop===r.c.levels.stop
   &&r.now.order.target===f.target);
  ok(name+': narrative and original bounded target/risk stay intact',Mom.alignment(f.input.biasSeries,f.input.series,f.input.triggerSeries,r.td).bias===f.htfDir
   &&r.c.levels?.targets.length===1&&r.c.levels.targets[0].price===f.target&&r.c.risk?.method_risk_multiplier===.5);
 }
 const noOpt=read(fresh(dir,'flip'));
 ok(label+': a flip-only pattern is not activated by default',!noOpt.c.ok&&!noOpt.now.armed&&noOpt.c.entry_model==='none');
 const wrong=fresh(dir);wrong.input.triggerSeries.smc.order_blocks.unshift({...wrong.input.triggerSeries.smc.order_blocks[0],body_mid:m(96.8),strength:9,structure_causes:[]});
 ok(label+': a stronger unrelated LTF OB cannot substitute for the cause',read(wrong).c.levels?.entry===m(96.55));
 const mid=fresh(dir);for(const b of mid.input.triggerSeries.candles.slice(118)){if(dir<0)b.h=96.6;else b.l=m(96.6);}
 const mr=read(mid);
 ok(label+': the final instruction step and pending check cannot claim completion before pullback',mr.td.steps.find(s=>s.n===5).done===false&&mr.td.checks.entry_model_ready===false&&mr.td.steps.some(s=>!s.done));
 ok(label+': edge/body-price touch without midpoint pullback is no trade',!mr.c.ok&&!mr.now.armed&&mr.c.entry_model_state==='waiting_pullback'
  &&mr.c.levels?.entry_status==='waiting');
 const pre=fresh(dir,'flip');for(const b of pre.input.triggerSeries.candles.slice(118)){if(dir<0)b.h=96.55;else b.l=m(96.55);}
 ok(label+': old retested=true before confirmation is not a valid flip entry',!read(pre,{useBreakers:true}).c.ok&&!read(pre,{useBreakers:true}).now.armed);
 const er=fresh(dir,'flip'),lr=fresh(dir);
 er.input.triggerSeries.smc.order_blocks=lr.input.triggerSeries.smc.order_blocks;
 er.input.triggerSeries.smc.breakers[0].strength=5;
 const ex=read(er,{useBreakers:true});
 ok(label+': M70 retains the causal extreme preference through mitigation',ex.c.entry_model==='market_shift'&&ex.c.levels?.entry===m(96.55)
  &&ex.c.levels.zone_preference?.rule==='extreme_over_flip');
 er.input.triggerSeries.smc.breakers[0].reaction_point=m(97.1);
 const fuel=read(er,{useBreakers:true});
 ok(label+': a known failed-reaction pool not taken remains a refusal',!fuel.c.ok&&fuel.td.entry_setup?.state==='waiting_fuel');
 const fb=er.input.triggerSeries.candles[118];if(dir<0)fb.h=97.2;else fb.l=m(97.2);
 er.input.triggerSeries.smc.sweeps.unshift({dir,t:fb.t,i:118,level:m(97.1),extreme:m(97.2),close:fb.c,bars_ago:1,wick_atr:1,label:'Failed-reaction fuel'});
 const filled=read(er,{useBreakers:true});
 ok(label+': actual later fuel re-arms and the stop stays beyond that excursion',filled.c.ok&&filled.c.levels?.stop===m(97.38));
}
const guards=[
 ['no measured LTF ATR cannot borrow the MTF one',f=>{f.input.triggerSeries.atr=null;f.input.triggerSeries.smc.atr=null;}],
 ['no causal LTF zone',f=>{f.input.triggerSeries.smc.order_blocks=[];}],
 ['a causally tagged zone from a different location',f=>{Object.assign(f.input.triggerSeries.smc.order_blocks[0],{bottom:88,top:89,mid:88.5,body_mid:88.5});}],
 ['an old POI touch followed by a sweep completely away from that POI',f=>{const low=f.input.triggerSeries;Object.assign(low.candles[116],{o:97.7,c:97.7,h:98,l:97.5});Object.assign(low.smc.sweeps[0],{level:97.8,extreme:98,close:97.7});}],
 ['wrong causal event identity',f=>{f.input.triggerSeries.smc.order_blocks[0].structure_causes[0].shift.level+=.01;}],
 ['a future displacement association',f=>{const c=f.input.triggerSeries.smc.order_blocks[0].structure_causes[0];c.displacement_t=f.END+300000;c.displacement_i=120;}],
 ['a pre-leg event mislabeled as its cause',f=>{f.input.triggerSeries.smc.order_blocks[0].structure_causes[0].displacement_i=118;}],
 ['missing lower sweep cannot borrow the MTF one',f=>{f.input.triggerSeries.smc.sweeps=[];}],
 ['missing lower break cannot be replaced by expansion',f=>{f.input.triggerSeries.smc.structure.last_break=null;}],
 ['a trend label is not a closed break',f=>{const b=f.input.triggerSeries.candles[117];b.c=96.5;}],
 ['same-bar sweep/shift does not prove intrabar ordering',f=>{const low=f.input.triggerSeries;Object.assign(low.smc.sweeps[0],{t:low.candles[117].t,i:117,level:96.6,extreme:96.7});}],
 ['an unconfirmed flip',f=>{f.input.triggerSeries.smc.breakers[0].confirmed=false;}],
 ['no failed reaction in a flip',f=>{f.input.triggerSeries.smc.breakers[0].failed_reaction=false;}],
 ['an unrelated flip-confirming event',f=>{f.input.triggerSeries.smc.breakers[0].structure_break.level+=.01;}],
 ['no post-shift pullback',f=>{for(const b of f.input.triggerSeries.candles.slice(118)){b.h=96.2;b.c=96.1;b.l=96;}}],
 ['zone closes through after confirmation',f=>{const b=f.input.triggerSeries.candles[119];b.c=97.2;b.h=97.3;}],
];
for(const [name,mutate]of guards){const f=fresh(-1,name.includes('flip')?'flip':'market_shift');mutate(f);const r=read(f,{useBreakers:true});ok(name+': no executable order',!r.c.ok&&!r.now.armed&&(!name.includes('different location')||r.c.entry_model==='none'));}
{
 const f=fresh(),unknown=read({...f,input:{...f.input,triggerSeries:null}});
 ok('missing distinct lower data stays explicit unknown, never falsely named',unknown.td.entry_setup?.state==='unknown'&&unknown.td.entry_setup.applies===false&&unknown.c.entry_model==='none');
 const r=read(f,{observedAt:f.input.triggerSeries.smc.structure.last_break.t+300000-1});
 ok('a still-forming structural close is not confirmed',!r.c.ok&&r.c.entry_model==='none');
 const base=read(f,{observedAt:f.END+300000});
 const perturbed=structuredClone(f);perturbed.input.triggerSeries.candles.push({t:f.END+300000,o:96,c:150,h:151,l:95,v:1});perturbed.input.triggerSeries.price=150;
 const p=read(perturbed,{observedAt:f.END+300000});
 ok('future lower prices cannot alter the observed model/entry/evidence',JSON.stringify(base.td.entry_setup)===JSON.stringify(p.td.entry_setup));
 const names=fresh();names.input.triggerSeries.smc.structure.last_break.type='non-taxonomy physical event';
 names.input.triggerSeries.smc.order_blocks[0].structure_causes[0].shift.type='non-taxonomy physical event';
 ok('type names remain report-only, not eligibility gates',read(names).c.ok);
 const ordinary=read(f);ordinary.td.countertrend=null;ordinary.td.crt_plan={tf:'4h',aggressive:{entry:94,stop:98,target:f.target},safer:{entry:95,stop:98,target:f.target}};
 // Isolate M68's historical CRT geometry guarantee. M77 now applies ordinary
 // entry-aligned exits; its separate probe checks the modern target authority.
 const s=SU.buildSetups(f.input.series.smc,{price:96.5,bias:-1,topdown:ordinary.td,balance:10000,riskPct:.5,targetAlignment:false});
 const c=s.candidates.find(x=>x.dir===-1),n=Now.build({td:ordinary.td,setups:s,series:f.input.series,symbol:'TEST',tf:'15m',nowMs:f.END});
 ok('a parallel CRT scenario cannot override the named LTF entry/stop',c.ok&&n.order?.entry===96.55&&n.order.stop===c.levels.stop&&n.order.target===f.target);
 ordinary.td.crt_plan.aggressive.target=96.4;
 const tiny=SU.buildSetups(f.input.series.smc,{price:96.5,bias:-1,topdown:ordinary.td,minRR:2,targetAlignment:false}).candidates.find(x=>x.dir===-1);
 ok('the ORIGINAL target below RR floor refuses; no farther replacement',!tiny.ok&&tiny.levels?.targets.length===1&&tiny.levels.targets[0].price===96.4);
}
console.log(`\nM68 entries: ${pass} passed / ${fail} failed`);process.exitCode=fail?1:0;
