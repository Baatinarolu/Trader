'use strict';
/** M87 human visual journal evidence. Explicit HTF/MTF/LTF roles/timeframes,
 * never provider/broker/compliance/capture-time verification or a risk input. */
const crypto=require('crypto'),net=require('net');
const ROLES=Object.freeze(['htf','mtf','ltf']);
const QUESTIONS=Object.freeze({htf:'Why this trend direction? What was the initial bias, structure and key levels?',mtf:'Why this location? Which supply/demand or flip zone and available liquidity?',ltf:'What was your entry trigger and confirmation?'});
const MAX_BYTES=1500000,MAX_PIXELS=24000000;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function invalid(message,status=400){const e=new Error(message);e.code='screenshot_invalid';e.status=status;return e;}
function role(value){if(!ROLES.includes(value))throw invalid('Choose exactly htf, mtf or ltf.');return value;}
function timeframe(value){
  if(typeof value!=='string'||!/^([1-9]\d{0,3})(m|h|d|w|M)$/.test(value))throw invalid('Choose an explicit canonical timeframe such as 15m,4h,1d,1w or1M. No role/frame is inferred.');
  const [,n,u]=value.match(/^([1-9]\d{0,3})(m|h|d|w|M)$/),caps={m:1440,h:48,d:365,w:52,M:12};
  if(Number(n)>caps[u])throw invalid('Timeframe is outside the supported explicit-label range.');return value;
}
function dimensions(width,height){if(!width||!height||width>16000||height>16000||width*height>MAX_PIXELS)throw invalid('Raster dimensions unavailable or exceed the24MP app budget.');return {width,height};}
function crc(b){let v=0xffffffff;for(const n of b){v^=n;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;}
function raster(b,mime){
  if(mime==='png'){
    if(b.length<57||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw invalid('PNG signature/structure is unavailable.');
    let pos=8,size=null,data=false,end=false,palette=false,colour=null;
    while(pos<b.length){if(pos+12>b.length)throw invalid('Truncated PNG chunk.');const n=b.readUInt32BE(pos),name=b.toString('ascii',pos+4,pos+8);if(!/^[A-Za-z]{4}$/.test(name)||pos+12+n>b.length)throw invalid('Invalid PNG chunk bounds.');
      const payload=b.subarray(pos+8,pos+8+n);if(crc(b.subarray(pos+4,pos+8+n))!==b.readUInt32BE(pos+8+n))throw invalid('PNG chunk checksum failed.');
      if(['acTL','fcTL','fdAT'].includes(name))throw invalid('Use a static PNG screenshot, not animation.');
      if(name[0]===name[0].toUpperCase()&&!['IHDR','PLTE','IDAT','IEND'].includes(name))throw invalid('Unsupported PNG critical chunk.');
      if(pos===8&&name!=='IHDR')throw invalid('PNG dimensions must be first.');
      if(name==='IHDR'){if(size||n!==13)throw invalid('Invalid PNG header.');size=dimensions(payload.readUInt32BE(0),payload.readUInt32BE(4));colour=payload[9];if(!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[colour]||[]).includes(payload[8])||payload[10]||payload[11]||payload[12]>1)throw invalid('Unsupported PNG coding.');}
      if(name==='PLTE'){if(palette||data||!n||n%3||n>768)throw invalid('Invalid PNG palette.');palette=true;}
      if(name==='IDAT'&&n){if(colour===3&&!palette)throw invalid('Indexed PNG lacks palette.');data=true;}pos+=n+12;
      if(name==='IEND'){if(n||pos!==b.length)throw invalid('Invalid PNG ending.');end=true;break;}
    }
    if(!size||!data||!end)throw invalid('PNG lacks dimensions/data/ending.');return size;
  }
  if(mime==='jpeg'){
    if(b.length<16||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)throw invalid('JPEG signature/ending unavailable.');
    let pos=2,size=null,components=null;
    while(pos<b.length-2){if(b[pos++]!==255)throw invalid('Invalid JPEG marker.');while(b[pos]===255)pos++;const marker=b[pos++];if(pos+2>b.length)throw invalid('Truncated JPEG marker.');const n=b.readUInt16BE(pos);if(n<2||pos+n>b.length)throw invalid('Invalid JPEG segment.');
      if([192,193,194].includes(marker)){if(size||n<8||b[pos+2]!==8||![1,3,4].includes(b[pos+7])||n!==8+3*b[pos+7])throw invalid('Invalid/unsupported JPEG frame.');components=new Set();for(let i=0;i<b[pos+7];i++){const p=pos+8+3*i;if(components.has(b[p])||!(b[p+1]>>4)||(b[p+1]>>4)>4||!(b[p+1]&15)||(b[p+1]&15)>4||b[p+2]>3)throw invalid('Invalid JPEG component.');components.add(b[p]);}size=dimensions(b.readUInt16BE(pos+5),b.readUInt16BE(pos+3));}
      if(marker===218){if(!size||n<8||!b[pos+2]||b[pos+2]>components.size||n!==6+2*b[pos+2]||pos+n>=b.length-2)throw invalid('JPEG lacks valid dimensions/scan.');for(let i=0;i<b[pos+2];i++){const p=pos+3+2*i;if(!components.has(b[p])||(b[p+1]>>4)>3||(b[p+1]&15)>3)throw invalid('Invalid JPEG scan component.');}return size;}pos+=n;
    }throw invalid('JPEG lacks a supported frame/scan.');
  }
  if(mime==='webp'){
    if(b.length<26||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)!==b.length-8)throw invalid('WebP container unavailable.');
    let pos=12,size=null,data=false;
    while(pos<b.length){if(pos+8>b.length)throw invalid('Truncated WebP chunk.');const name=b.toString('ascii',pos,pos+4),n=b.readUInt32LE(pos+4),p=b.subarray(pos+8,pos+8+n);if(pos+8+n+(n%2)>b.length)throw invalid('Invalid WebP chunk bounds.');
      if(['ANIM','ANMF'].includes(name))throw invalid('Use a static chart raster, not an animation.');
      if(name==='VP8X'){if(n!==10||p[0]&0xc3||p[1]||p[2]||p[3])throw invalid('Invalid/animated WebP header.');size=dimensions(p.readUIntLE(4,3)+1,p.readUIntLE(7,3)+1);}
      if(name==='VP8 '){if(n<10||p[0]&1||((p[0]>>>1)&7)>3||!(p[0]&16)||p.toString('hex',3,6)!=='9d012a')throw invalid('Invalid WebP frame.');const s=dimensions(p.readUInt16LE(6)&16383,p.readUInt16LE(8)&16383);if(size&&(size.width!==s.width||size.height!==s.height))throw invalid('WebP dimensions contradict frame.');size=s;data=true;}
      if(name==='VP8L'){if(n<6||p[0]!==47||p.readUInt32LE(1)>>>29)throw invalid('Invalid WebP lossless frame.');const v=p.readUInt32LE(1),s=dimensions((v&16383)+1,((v>>>14)&16383)+1);if(size&&(size.width!==s.width||size.height!==s.height))throw invalid('WebP dimensions contradict frame.');size=s;data=true;}
      pos+=8+n+(n%2);
    }if(!size||!data)throw invalid('WebP lacks dimensions/frame.');return size;
  }throw invalid('Use PNG,JPEG or static WebP.');
}
function image(value){
  if(typeof value!=='string'||!value)throw invalid('Provide a raster upload or an external HTTPS image link.');
  if(value.startsWith('data:')){
    if(value.length>Math.ceil(MAX_BYTES/3)*4+64)throw invalid('Image exceeds the1.5MB decoded app budget.');
    const m=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)throw invalid('Only canonical base64 PNG,JPEG,WebP uploads are accepted.');
    const b=Buffer.from(m[2],'base64');if(!b.length||b.length>MAX_BYTES||b.toString('base64')!==m[2])throw invalid('Invalid/oversized base64 image.');
    return {image:value,kind:'upload',...raster(b,m[1]),bytes:b.length,reference_sha256:hash(value),structural_raster_check:true,chart_verified:false};
  }
  if(value.length>4000||/[\s\x00-\x1f\x7f]/.test(value))throw invalid('External image link is invalid/oversized.');
  let u;try{u=new URL(value);}catch{throw invalid('A full external HTTPS image URL is required.');}
  const host=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||!host.includes('.')||net.isIP(host.replace(/^\[|\]$/g,''))||/(^|\.)(localhost|local|internal)$/.test(host))throw invalid('Use an external HTTPS hostname without credentials/local/IP targets.');
  if([...u.searchParams.keys()].some(k=>/(^|[-_])(token|auth|authorization|api[-_]?key|password|secret|signature|sig|credential)s?($|[-_])/i.test(k)))throw invalid('Do not store credentialed/signed image URLs; upload a local raster instead.');
  u.hash='';
  return {image:value,kind:'external_link',width:null,height:null,bytes:null,reference_sha256:hash(u.toString()),structural_raster_check:false,chart_verified:false};
}
function fields(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['timeframe','image','note'].includes(k)))throw invalid('Provide only timeframe,image and optional plain-text note.');
  const tf=timeframe(body.timeframe),note=body.note===undefined?'':body.note;if(typeof note!=='string'||note.length>2000)throw invalid('Screenshot note must be plain text, at most2000 characters.');
  return {...image(body.image),timeframe:tf,note:note.trim()};
}
// Snapshot describes the SAVED record at attachment, not authenticated chart
// pixels or actual capture time. Later financial correction keeps earlier media.
const CONTEXT=['id','user_id','account_id','symbol','direction','status','opened_at','closed_at','entry','exit','stop','target','size','fees','entry_model','entry_tf','strategy_id','strategy_version'];
const context=t=>Object.fromEntries(CONTEXT.map(k=>[k,t[k]??null]));
const contextHash=t=>hash(JSON.stringify(context(t)));
const NUMERIC_CONTEXT=['id','user_id','account_id','entry','exit','stop','target','size','fees','strategy_id','strategy_version'];
const validContext=c=>!!c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).length===CONTEXT.length&&CONTEXT.every(k=>Object.hasOwn(c,k)&&(c[k]===null||(NUMERIC_CONTEXT.includes(k)?typeof c[k]==='number'&&Number.isFinite(c[k]):typeof c[k]==='string'&&c[k].length<=2000)));
const frameKey=tf=>{const [,n,u]=tf.match(/^([1-9]\d{0,3})(m|h|d|w|M)$/);return u==='M'?n+'M':String(Number(n)*({m:60,h:3600,d:86400,w:604800}[u]));};
const stamp=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))return null;const d=new Date(v);return Number.isFinite(d.getTime())&&d.toISOString()===v?d.getTime():null;};
const ROW_KEYS=['trade_id','role','timeframe','image','note','source','recorded_at','original_recorded_at','reference_sha256','context_json','context_hash'];
function revision(t,r,slot){return hash(JSON.stringify(['screenshot-v1',r,context(t),slot?ROW_KEYS.map(k=>[k,slot[k]??null]):null]));}
function slotInfo(t,r,slot,nowMs=Date.now()){
  const base={role:r,question:QUESTIONS[r],revision:revision(t,r,slot),state:'missing',image:null,timeframe:null,note:'',recorded_at:null,source:null,original_recorded_at:null,matches_current_trade:null,capture_time_verified:false,chart_verified:false};
  if(!slot)return base;
  try{
    const data=fields({timeframe:slot.timeframe,image:slot.image,note:slot.note}),at=stamp(slot.recorded_at),snap=JSON.parse(slot.context_json);
    if(slot.trade_id!==t.id||slot.role!==r||!['upload','external_link','imported_upload','imported_external_link'].includes(slot.source)||slot.source.replace('imported_','')!==data.kind
      ||at===null||at>nowMs||slot.reference_sha256!==data.reference_sha256||!validContext(snap)||snap.id!==t.id||snap.user_id!==t.user_id||hash(slot.context_json)!==slot.context_hash
      ||slot.original_recorded_at!==null&&stamp(slot.original_recorded_at)===null)throw invalid('Stored screenshot metadata is unavailable.',503);
    const unknownImport=slot.source.startsWith('imported_')&&CONTEXT.filter(k=>!['id','user_id','account_id'].includes(k)).every(k=>snap[k]===null);
    return {...base,...data,state:'stored',source:slot.source,recorded_at:slot.recorded_at,original_recorded_at:slot.original_recorded_at,recorded_context:unknownImport?null:snap,matches_current_trade:unknownImport?null:slot.context_hash===contextHash(t),capture_time_verified:false,chart_verified:false};
  }catch{return {...base,state:'unavailable',note:'Stored image/metadata unavailable. Not counted as a known timeframe view; repair or explicitly remove.'};}
}
function view(t,rows,nowMs=Date.now()){
  const slots=Object.fromEntries(ROLES.map(r=>[r,slotInfo(t,r,rows.find(s=>s.role===r),nowMs)])),known=Object.values(slots).filter(s=>s.state==='stored');
  const frameGroups=new Map();for(const slot of known){const k=frameKey(slot.timeframe);if(!frameGroups.has(k))frameGroups.set(k,[]);frameGroups.get(k).push({role:slot.role,timeframe:slot.timeframe});}
  const reused=[...frameGroups.values()].filter(g=>g.length>1);
  const distinct=new Set(known.map(s=>s.reference_sha256)).size,legacyImage=typeof t.screenshot_url==='string'?t.screenshot_url:'';let safeLegacy=null;try{safeLegacy=image(legacyImage).image;}catch{}
  return {trade_id:t.id,account_id:t.account_id,saved_record:context(t),slots,summary:{tagged:known.length,current:known.filter(s=>s.matches_current_trade).length,distinct_references:distinct,distinct_timeframes:frameGroups.size,reused_timeframes:reused,unavailable:Object.values(slots).filter(s=>s.state==='unavailable').length,
    state:known.length===3&&distinct===3&&frameGroups.size===3?'three_tagged_views':known.length?'partial':'empty',broker_verified:false,capture_time_verified:false,
    note:'Stored human-labelled chart references, not verified chart/timeframe content, broker execution or whole-course journal completion. Legacy unassigned image excluded; duplicate references do not establish3 independent views.'},
    legacy:{image:legacyImage,display_image:safeLegacy,assigned_role:null,note:'Original unlabelled screenshot preserved. No role/timeframe is inferred from entry TF, timeframes, profit or filename.'}};
}
async function owned(store,userId,id){if(!Number.isSafeInteger(id)||id<=0)throw invalid('Trade not found',404);const t=await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);if(!t)throw invalid('Trade not found',404);return t;}
const rowsFor=(store,id)=>store.prepare('SELECT * FROM trade_screenshots WHERE trade_id=? ORDER BY role').all(id);
async function read(userId,id){const {db}=require('./db');return db.tx(async tx=>{const store=db.transactionStore(tx),t=await owned(store,userId,id);return view(t,await rowsFor(store,id));});}
function wire(body,remove=false){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!(remove?['revision']:['revision','timeframe','image','note']).includes(k))||typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision))throw invalid('Read the current saved trade/slot first and provide its revision with only timeframe,image and optional note.');
  if(remove)return null;const {revision:_,...payload}=body;return fields(payload);
}
async function change(userId,id,r,body,{remove=false}={}){
  const {db}=require('./db');return db.tx(async tx=>{const store=db.transactionStore(tx),t=await owned(store,userId,id);role(r);const data=wire(body,remove),rows=await rowsFor(store,id),old=rows.find(s=>s.role===r);
    if(body.revision!==revision(t,r,old))throw invalid('Saved trade or screenshot changed after display. Reload before replacing/removing this role.',409);
    if(remove){if(old)await store.prepare('DELETE FROM trade_screenshots WHERE trade_id=? AND role=?').run(id,r);}
    else if(!old||old.image!==data.image||old.timeframe!==data.timeframe||old.note!==data.note||old.context_hash!==contextHash(t)||slotInfo(t,r,old).state!=='stored'){
      await store.prepare(`INSERT INTO trade_screenshots(trade_id,role,timeframe,image,note,source,recorded_at,original_recorded_at,reference_sha256,context_json,context_hash)
        VALUES (?,?,?,?,?,?,?,NULL,?,?,?) ON CONFLICT(trade_id,role) DO UPDATE SET timeframe=excluded.timeframe,image=excluded.image,note=excluded.note,source=excluded.source,recorded_at=excluded.recorded_at,original_recorded_at=NULL,reference_sha256=excluded.reference_sha256,context_json=excluded.context_json,context_hash=excluded.context_hash`)
        .run(id,r,data.timeframe,data.image,data.note,data.kind,new Date().toISOString(),data.reference_sha256,JSON.stringify(context(t)),contextHash(t));
    }
    return view(t,await rowsFor(store,id));
  });
}
// Portable media is untrusted historical declaration, never a replay of owned
// API revisions/source clocks, live capture, grades or admission records.
const PORTABLE_CONTEXT=CONTEXT.filter(k=>!['id','user_id','account_id'].includes(k));
function portable(t,rows){
  const v=view(t,rows),roles={};for(const r of ROLES){const slot=v.slots[r];if(slot.state!=='stored')continue;
    roles[r]={timeframe:slot.timeframe,image:slot.image,note:slot.note,declared_recorded_at:slot.original_recorded_at||slot.recorded_at,
      ...(slot.recorded_context?{declared_context:Object.fromEntries(PORTABLE_CONTEXT.map(k=>[k,slot.recorded_context[k]]))}:{})};
  }
  return {...t,screenshot_url:v.legacy.display_image||'',...(v.legacy.image&&!v.legacy.display_image?{screenshot_legacy_unavailable:true}:{}),screenshots:{version:1,roles,unavailable_roles:ROLES.filter(r=>v.slots[r].state==='unavailable')}};
}
async function portableRowsOn(store,rows){const out=[];for(const t of rows)out.push(portable(t,await rowsFor(store,t.id)));return out;}
function parsePortable(raw,{json=false}={}){
  const result={items:[],warnings:[],skipped:0};if(raw===undefined||raw===null||raw==='')return result;
  if(json){try{raw=JSON.parse(raw);}catch{result.warnings.push('Invalid optional screenshot JSON; financial truth retained without images.');return result;}}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||!raw.roles||typeof raw.roles!=='object'||Array.isArray(raw.roles)||Object.keys(raw.roles).length>20){result.warnings.push('Unsupported optional screenshot set; no roles/timeframes inferred.');return result;}
  for(const key of Object.keys(raw.roles))if(!ROLES.includes(key)){result.skipped++;result.warnings.push('Unknown screenshot role skipped.');}
  for(const r of ROLES){if(!Object.hasOwn(raw.roles,r))continue;const value=raw.roles[r];try{
      if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Invalid role declaration.');
      const data=fields({timeframe:value.timeframe,image:value.image,...(value.note===undefined?{}:{note:value.note})});let original=null,declaredContext=null;
      if(value.declared_recorded_at!=null){const at=stamp(value.declared_recorded_at);if(at!==null&&at<=Date.now())original=value.declared_recorded_at;else result.warnings.push(r.toUpperCase()+': invalid/future historical recording timestamp dropped (unverified).');}
      if(value.declared_context!==undefined){const c=value.declared_context;if(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).length===PORTABLE_CONTEXT.length&&PORTABLE_CONTEXT.every(k=>Object.hasOwn(c,k)&&(c[k]===null||(NUMERIC_CONTEXT.includes(k)?typeof c[k]==='number'&&Number.isFinite(c[k]):typeof c[k]==='string'&&c[k].length<=2000)))){declaredContext=Object.fromEntries(PORTABLE_CONTEXT.map(k=>[k,c[k]]));}else result.warnings.push(r.toUpperCase()+': unavailable historical context, not guessed from financial import.');}
      result.items.push({role:r,...data,original_recorded_at:original,declared_context:declaredContext});
    }catch{result.skipped++;result.warnings.push(r.toUpperCase()+': unsafe/malformed optional reference/frame/note skipped; financial truth retained.');}}
  return result;
}
function legacyImport(value,media){if(value===undefined||value===null||value==='')return '';try{return image(value).image;}catch{media.warnings.push('Unsafe/unsupported optional legacy screenshot skipped; never assigned a role.');return '';}}
async function insertPortableOn(store,t,media){for(const item of media.items){const snap={...context(t),...(item.declared_context||Object.fromEntries(PORTABLE_CONTEXT.map(k=>[k,null]))),id:t.id,user_id:t.user_id,account_id:t.account_id},encoded=JSON.stringify(snap);
    await store.prepare('INSERT INTO trade_screenshots(trade_id,role,timeframe,image,note,source,recorded_at,original_recorded_at,reference_sha256,context_json,context_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(t.id,item.role,item.timeframe,item.image,item.note,'imported_'+item.kind,new Date().toISOString(),item.original_recorded_at,item.reference_sha256,encoded,hash(encoded));
  }return media.items.length;
}
module.exports={ROLES,QUESTIONS,MAX_BYTES,MAX_PIXELS,fields,image,timeframe,role,hash,invalid,CONTEXT,context,contextHash,revision,view,read,change,owned,rowsFor,stamp,portable,portableRowsOn,parsePortable,legacyImport,insertPortableOn};
