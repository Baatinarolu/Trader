'use strict';
/** M68 stage1: provenance annotations, no selector/gate/price changes.
 * TJ_APP = implementation, TJ_CONTROL = parent. OHLC-linked event inputs plus
 * a real SMC discovery census; never a historical market-edge claim.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc'));
const Synth = require('./harness/synth');
const parent = process.env.TJ_CONTROL ? require(path.join(process.env.TJ_CONTROL, 'src/bots/smc')) : null;
let pass=0, fail=0;
const ok=(name,c)=>{ console.log((c?' ok   ':' FAIL ')+name); c?pass++:fail++; };
const T=Date.parse('2026-07-15T08:00Z'), step=300000;
const bars = Array.from({length:10},(_,i)=>({t:T+i*step,o:104,c:104,h:105,l:103,v:100}));
bars[2]={...bars[2],o:100,c:99,h:100.3,l:98.7};
bars[3]={...bars[3],o:99,c:103,h:104,l:98.9};
bars[4]={...bars[4],o:103,c:105,h:106,l:103};
const ds=[{i:3,t:bars[3].t,dir:1,rangeAtr:1.5},{i:4,t:bars[4].t,dir:1,rangeAtr:4}];
const breaks=[{i:3,t:bars[3].t,dir:'up',level:101,type:'BOS'},
 {i:4,t:bars[4].t,dir:'up',level:104,type:'CHoCH'}];
const read=(ds1=ds,bs=breaks,cs=bars)=>SMC.findOrderBlocks(cs,1,ds1,bs,{maxBlocks:1});
const ob=read()[0];
ok('dedup retains the old strongest representative',ob && ob.i===2 && ob.displacement_i===4);
ok('a cause records the exact displacement, close-based break and price',ob?.structure_causes?.some(c=>c.displacement_i===3&&c.shift.t===bars[3].t&&c.shift.level===101&&c.shift.close===103&&c.shift.confirmed));
ok('dedup and maxBlocks do NOT erase the other creating association',ob?.structure_causes?.length===3
 && ob.structure_causes.some(c=>c.displacement_i===4&&c.shift.i===4));
// d3 can also create the follow-through break d4: three associations, two distinct shifts.
const unrelated=read([ds[1]],[breaks[0]])[0];
ok('old broke_structure annotation is preserved',unrelated?.broke_structure===true);
ok('an earlier event is NOT claimed as a later displacement cause',unrelated?.structure_causes?.length===0);
const wick=structuredClone(bars);wick[3].c=100.5;wick[3].h=104;
ok('a wick through the level without a close is not a causal shift',read([ds[0]],[breaks[0]],wick)[0]?.structure_causes?.length===0);
const wrongTime=[{...breaks[0],t:bars[3].t-1}];
ok('a break reference must belong to the actual candle',read([ds[0]],wrongTime)[0]?.structure_causes?.length===0);
const custom=[{...breaks[0],type:'physical event without taxonomy'}];
ok('BOS/CHoCH/MSS naming remains report-only',read([ds[0]],custom)[0]?.structure_causes?.length===1);
const fc=[
 {o:100,c:100,h:101,l:100}, {o:100,c:99,h:100.2,l:98},
 {o:100,c:101.2,h:101.5,l:100.2}, {o:101.2,c:101.3,h:101.6,l:100.4},
 {o:101.3,c:102,h:102.3,l:101.2}, {o:102,c:102,h:102.2,l:101.7},
].map((b,i)=>({...b,t:T+i*step,v:100}));
const original={dir:-1,side:'supply',i:0,t:T,bottom:100,top:101,mid:100.5,breached:true,strength:0.5};
const flipBreak={i:4,t:fc[4].t,dir:'up',type:'CHoCH',level:101.6};
const flip=SMC.findBreakers([original],fc,1,[flipBreak])[0];
ok('flip records its exact confirming structural event',flip?.structure_break?.t===fc[4].t && flip.confirmed_at===fc[4].t);
ok('legacy retouch can precede confirmation (annotation remains unchanged)',flip?.retested===true);
ok('that pre-confirmation touch is NOT a post-confirmation mitigation',flip?.post_confirmation_mitigation_t===null);
fc.push({t:T+6*step,o:102,c:101.9,h:102,l:100.3,v:100});
ok('only a later midpoint mitigation gets the post-confirmation timestamp',SMC.findBreakers([original],fc,1,[flipBreak])[0]?.post_confirmation_mitigation_t===fc[6].t);
const strip=(a)=>{
 const x=structuredClone(a);
 for(const z of x.order_blocks||[]){delete z.structure_causes;delete z.displacement_t;}
 for(const z of x.breakers||[]){delete z.structure_break;delete z.confirmed_at;delete z.post_confirmation_mitigation_t;}
 return JSON.stringify(x);
};
let reads=0, diff=0, causal=0, flips=0, invalid=0;
for(let seed=1;seed<=6;seed++){
 const cs=Synth.series({seed,bars:700});
 for(let i=300;i<700;i+=25){
  const win=cs.slice(i-300,i+1),now=win.at(-1).t+900000;
  const a=SMC.analyse(win,{tf:'15m',now});reads++;
  if(parent&&strip(a)!==strip(parent.analyse(win,{tf:'15m',now})))diff++;
  for(const z of a.order_blocks||[])for(const cause of z.structure_causes||[]){
   causal++;const b=win[cause.shift.i];
   if(!b||b.t!==cause.shift.t||cause.shift.i<cause.displacement_i||cause.shift.i>cause.displacement_i+1
    ||!(z.dir>0?b.c>cause.shift.level:b.c<cause.shift.level))invalid++;
  }
  for(const z of a.breakers||[])if(z.structure_break)flips++;
 }
}
console.log(` census: reads=${reads} causal associations=${causal} confirmed flip refs=${flips} invalid=${invalid} legacy diffs=${diff}`);
ok('OHLC discovery produces actual causal associations',causal>0&&flips>0);
ok('every discovered association verifies against its physical candle',invalid===0);
if(parent)ok('every legacy SMC field is IDENTICAL after stripping ONLY new annotations',diff===0);
console.log(`\nM68 provenance: ${pass} passed / ${fail} failed`);process.exitCode=fail?1:0;
