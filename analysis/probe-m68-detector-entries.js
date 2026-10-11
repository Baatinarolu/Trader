'use strict';
/** Positive LOWER detector→named composer controls. All lower structure, OBs,
 * failures, sweeps and associations come from SMC.analyse(OHLC), never injected.
 * The pre-existing MTF POI is an EXPLICIT context; one final pullback candle is
 * manufactured, then re-detected. NOT an OHLC-only HTF/MTF method or edge sample. */
const path=require('path'),APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal');
const SMC=require(path.join(APP,'src/bots/smc')),E=require(path.join(APP,'src/bots/entry-models'));
const {series}=require('./harness/synth');
const cs=series({seed:1,bars:900}).map((b,i)=>({...b,t:Date.parse('2026-07-01T00:00:00Z')+i*300000}));
let pass=0,fail=0;
const ok=(n,c)=>{console.log((c?' ok   ':' FAIL ')+n);c?pass++:fail++;};
for(const [end,name,pb0]of[[445,'flip',{o:1.0097,c:1.0097,h:1.009768,l:1.009632}],
 [695,'market_shift',{o:.92935,c:.92935,h:.929442,l:.929258}]])for(const mirror of [false,true]){
 const flip=b=>mirror?{...b,o:2-b.o,c:2-b.c,h:2-b.l,l:2-b.h}:b;
 const candles=cs.slice(end-300,end).map(flip),pb=flip({...pb0,t:cs[end].t,v:1000}),all=candles.concat(pb);
 const smc=SMC.analyse(all,{tf:'5m'}),dir=mirror?1:-1;
 const bottom=name==='flip'?1.006:.927,top=name==='flip'?1.013:.932,mid=name==='flip'?1.0097:.9293;
 const poi={zone:{kind:'order_block',dir,bottom:mirror?2-top:bottom,top:mirror?2-bottom:top,mid:mirror?2-mid:mid,
   meta:{t:candles[0].t-1800000,displacement_t:candles[0].t-900000}}};
 const input={lower:{tf:'5m',candles:all,smc,atr:smc.atr},medium:{tf:'15m',candles:[candles[0]]},dir,poi,useBreakers:true,observedAt:pb.t+300000};
 const r=E.compose?E.compose(input):{ready:false,entry_model:'none'},label=`${name} ${dir>0?'long':'short'}`;
 ok(label+': raw lower OHLC actually discovers and readies the named model',r.ready&&r.entry_model===name);
 const shift=r.shift,bar=shift&&all.find(b=>b.t===shift.t);
 ok(label+': that exact physical observed close confirms it',shift?.confirmed&&shift.t+300000<=input.observedAt&&bar&&(dir>0?bar.c>shift.level:bar.c<shift.level));
 ok(label+': pre-pullback clock still refuses even though the full stream contains it',!!E.compose&&!E.compose({...input,observedAt:pb.t}).ready);
 const legacy=E.compose?E.compose({...input,useBreakers:false}):{entry_model:'none'};
 ok(label+': flip is truly opt-in; market-shift remains the causal OB',name==='flip'?legacy.entry_model!=='flip'&&r.zone?.kind==='flip_zone':legacy.entry_model==='market_shift'&&r.zone?.meta.structure_causes.some(c=>c.shift.t===shift.t));
}
console.log(`\nM68 detector entries: ${pass} passed / ${fail} failed`);process.exitCode=fail?1:0;
