#!/usr/bin/env node
'use strict';
const H=require('./m88-test-support'),{ok,finish}=H,path=require('path');let C;try{C=require(path.join(H.APP,'src/confluences'));}catch{}const good=(v,expected)=>{try{return JSON.stringify(C.labels(v))===JSON.stringify(expected);}catch{return false;}},bad=v=>{try{C.labels(v);return false;}catch(e){return e.code==='confluence_invalid';}};
finish('M88 explicit confluence codec',async()=>{
 for(const[v,e]of [[null,null],[[],[]],[['Sweep'],['Sweep']],[['Sweep','Order block'],['Sweep','Order block']],[['A','B','C','D','E'],['A','B','C','D','E']],[[' Sweep ','sweep','Order   block'],['Sweep','Order block']],[['Café','Café'],['Café']],[['level, reaction','"quoted" level'],['level, reaction','"quoted" level']],[['<img src=x>','Flip'],['<img src=x>','Flip']]])ok('literal nullable/none/partial/selected text normalisation '+JSON.stringify(v),good(v,e));
 for(const v of [undefined,'Sweep,Order block','["Sweep"]',1,false,{},[null],[''],['  '],['A',{}],['A','B','C','D','E','F'],['x'.repeat(81)],['a\u0000b'],['a\nb'],Array(21).fill('A')])ok('reject malformed/ambiguous/over-budget '+JSON.stringify(v),!!C&&bad(v));
 const a=[' Sweep ','sweep','Flip'],before=JSON.stringify(a);try{C.labels(a);}catch{}ok('pure codec no mutation, no guessed source/capture clocks/technical truth',!!C&&JSON.stringify(a)===before);ok('case/spacing reusable key canonical, semantic alias not invented',C?.key?.(' Order   BLOCK ')===C?.key?.('order block')&&!!C&&C.key('OB')!==C.key('Order block'));
});
