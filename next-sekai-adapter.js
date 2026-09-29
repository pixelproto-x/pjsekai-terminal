/* Next-SEKAI chart adapter */
(()=>{"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const pick=(o,...ks)=>{for(const k of ks){if(o&&o[k]!==undefined)return o[k]}return undefined};
const obj=x=>x&&typeof x==="object"?x:{};
const sec=v=>{const n=num(v,0);return Math.abs(n)>1000?n/1000:n};
const lane=v=>clamp(Math.round(num(v,0)),0,11);
function typeOf(x){
 const s=String(pick(x,"type","kind","noteType","noteKind","archetype")??"tap").toLowerCase().replace(/_/g,"-");
 if(s.includes("damage"))return"damage"; if(s.includes("fake"))return"fake";
 if(s.includes("trace-flick")||s.includes("traceflick"))return"trace-flick";
 if(s.includes("trace"))return"trace"; if(s.includes("flick"))return"flick";
 if(s.includes("hold"))return"hold"; if(s.includes("slide")||s.includes("release"))return"slide";
 return"tap";
}
function pathOf(x,start,end,duration){
 const raw=pick(x,"path","points","lanePath","curve","guide");
 if(Array.isArray(raw)&&raw.length){
  const d=Math.max(.000001,duration||1),last=Math.max(0,raw.length-1);
  return raw.map((p,i)=>{const q=obj(p);const t=q.t!=null?q.t:q.time!=null?sec(q.time)/d:i/(last||1);return{t:clamp(num(t,0),0,1),l:lane(q.l??q.lane??q.x??start),ease:q.ease}});
 }
 return[{t:0,l:lane(start)},{t:1,l:lane(end)}];
}
function normalizeNote(x,i){
 x=obj(x); const t=sec(pick(x,"time","targetTime","timing","sec","startTime","target"));
 const d=Math.max(0,sec(pick(x,"duration","length","holdTime","endDuration","durationSeconds")));
 const l=lane(pick(x,"lane","slot","laneIndex","startLane","x")); const k=typeOf(x);
 const end=lane(pick(x,"endLane","tailLane","toLane","endX")??l); const path=pathOf(x,l,end,d);
 const rawKind=String(pick(x,"kind","noteKind","archetype","type")??k);
 return {
  id:x.id??i,time:t,lane:l,width:clamp(num(pick(x,"width","size","laneWidth"),1),.5,12),
  type:k,kind:rawKind,duration:d,endLane:path[path.length-1].l,path,
  critical:!!pick(x,"critical","isCritical","crit")||/^crit[-_]/i.test(rawKind),
  fake:k==="fake"||!!pick(x,"fake","isFake"),damage:k==="damage"||!!pick(x,"damage","isDamage"),
  hidden:!!pick(x,"hidden","isHidden")||/^hide[-_]/i.test(rawKind),
  dir:num(pick(x,"direction","flickDirection","dir"),0),
  guideColor:num(pick(x,"guideColor","color","guide"),0),
  timescaleGroup:num(pick(x,"timescaleGroup","timescaleGroupId","timescale"),0),
  speed:Math.max(.05,num(pick(x,"speed","noteSpeed","speedMultiplier"),1)),
  ease:String(pick(x,"ease","easing","connectorEase")??"linear"),
  tickTimes:Array.isArray(pick(x,"tickTimes","ticks"))?pick(x,"tickTimes","ticks").map(v=>typeof v==="object"?sec(pick(v,"time","targetTime")):sec(v)).filter(Number.isFinite):[],
  timescaleEvents:Array.isArray(x.timescaleEvents)?x.timescaleEvents.map(eventOf).sort((a,b)=>a.time-b.time):[],
  head:!!pick(x,"head","isHead"),tail:!!pick(x,"tail","isTail"),metadata:x
 };
}
function collect(root){
 if(Array.isArray(root))return root;
 root=obj(root);
 for(const k of ["notes","entities","chart","objects","objectsData","levelData","noteData"]){
  if(Array.isArray(root[k]))return root[k];
  if(root[k]&&Array.isArray(root[k].notes))return root[k].notes;
  if(root[k]&&Array.isArray(root[k].entities))return root[k].entities;
 }
 return[];
}
function groupsFrom(raw){
 const g={};
 if(Array.isArray(raw)){
  for(const e of raw){e=obj(e);const id=num(pick(e,"group","groupId","timescaleGroup"),0);(g[id]??=[]).push(eventOf(e))}
 }else if(raw&&typeof raw==="object"){
  for(const [id,list] of Object.entries(raw))if(Array.isArray(list))g[id]=list.map(eventOf)
 }
 for(const id of Object.keys(g))g[id].sort((a,b)=>a.time-b.time);
 return g;
}
function eventOf(e){
 e=obj(e); return {time:sec(pick(e,"time","targetTime","startTime","sec")),speed:Math.max(.01,num(pick(e,"speed","timescale","value"),1)),nextSpeed:Number.isFinite(Number(pick(e,"nextSpeed","endSpeed")))?num(pick(e,"nextSpeed","endSpeed"),1):null,ease:String(pick(e,"ease","easing")??"linear").toLowerCase(),transition:String(pick(e,"transition","transitionStyle")??"linear")};
}
function susToUSC(sus){
 const lines=[],measureChanges=[],meta=new Map();
 String(sus).split("\n").map(x=>x.trim()).filter(x=>x.startsWith("#")).forEach(line=>{
  const has=line.includes(":"),at=line.indexOf(has?":":" ");if(at<0)return;
  const left=line.slice(1,at).trim(),right=line.slice(at+1).trim();
  if(has)lines.push([left,right]);else if(left==="MEASUREBS")measureChanges.unshift([lines.length,+right]);else meta.set(left,right);
 });
 const req=meta.get("REQUEST")||"",rm=req.match(/^"ticks_per_beat\s+([0-9.]+)"$/),tpb=rm?+rm[1]:0;
 if(!tpb)throw new Error("SUS missing ticks_per_beat");
 const offset=-num(meta.get("WAVEOFFSET"),0),bars=[];
 for(let i=0;i<lines.length;i++){const h=lines[i][0];if(h.length===5&&h.endsWith("02"))bars.push({measure:+h.slice(0,3)+(measureChanges.find(x=>x[0]<=i)?.[1]??0),length:num(lines[i][1],4)})}
 if(!bars.length)bars.push({measure:0,length:4});bars.sort((a,b)=>a.measure-b.measure);
 let total=0;const barData=bars.map((b,i)=>{if(i)total+=(b.measure-bars[i-1].measure)*bars[i-1].length*tpb;return{measure:b.measure,ticks:total,tpm:b.length*tpb}});
 const toTick=(m,p,q)=>{let b=barData[0];for(const x of barData)if(m>=x.measure)b=x;return b.ticks+(m-b.measure)*b.tpm+(p*b.tpm)/q};
 const bpmMap=new Map(),bpmChanges=[],timeScaleChanges=[],tapNotes=[],directionalNotes=[],streams=new Map();
 const rawAt=(line,index)=>{const [h,d]=line,m=+h.slice(0,3)+(measureChanges.find(x=>x[0]<=index)?.[1]??0);return(d.match(/.{2}/g)||[]).map((v,i,a)=>v==="00"?null:{tick:toTick(m,i,a.length),value:v}).filter(Boolean)};
 lines.forEach((line,index)=>{
  const h=line[0],d=line[1];
  if(h.length===5&&h.startsWith("TIL")&&/^".*"$/.test(d)){d.slice(1,-1).split(",").map(x=>x.trim()).filter(Boolean).forEach(seg=>{const [m,rest]=seg.split("'"),[t,s]=String(rest||"").split(":");if(Number.isFinite(+m)&&Number.isFinite(+t)&&Number.isFinite(+s))timeScaleChanges.push({tick:toTick(+m,0,1)+ +t,timeScale:+s})})}
  else if(h.length===5&&h.startsWith("BPM"))bpmMap.set(h.slice(3),+d);
  else if(h.length===5&&h.endsWith("08"))for(const r of rawAt(line,index))bpmChanges.push({tick:r.tick,bpm:bpmMap.get(r.value)||0});
  else if(h.length===5&&h[3]==="1")for(const r of rawAt(line,index))tapNotes.push({tick:r.tick,lane:parseInt(h[4],36),width:parseInt(r.value[1],36),type:parseInt(r.value[0],36)});
  else if(h.length===6&&(h[3]==="3"||h[3]==="9")){const key=h[5]+"-"+h[3],v=streams.get(key)||{type:+h[3],notes:[]};v.notes.push(...rawAt(line,index).map(r=>({tick:r.tick,lane:parseInt(h[4],36),width:parseInt(r.value[1],36),type:parseInt(r.value[0],36)})));streams.set(key,v)}
  else if(h.length===5&&h[3]==="5")for(const r of rawAt(line,index))directionalNotes.push({tick:r.tick,lane:parseInt(h[4],36),width:parseInt(r.value[1],36),type:parseInt(r.value[0],36)});
 });
 const key=n=>n.lane+"-"+n.tick,flick=new Map(),trace=new Set(),critical=new Set(),removeTick=new Set(),removeEnd=new Set(),easeMods=new Map();
 directionalNotes.forEach(n=>{const k=key(n);if(n.type===1)flick.set(k,"up");else if(n.type===3)flick.set(k,"left");else if(n.type===4)flick.set(k,"right");else if(n.type===2)easeMods.set(k,"in");else if(n.type===5||n.type===6)easeMods.set(k,"out")});
 tapNotes.forEach(n=>{const k=key(n);if(n.type===2)critical.add(k);else if(n.type===5)trace.add(k);else if(n.type===6){trace.add(k);critical.add(k)}else if(n.type===3)removeTick.add(k);else if(n.type===7)removeEnd.add(k);else if(n.type===8){critical.add(k);removeEnd.add(k)}});
 const prevent=new Set();for(const s of streams.values())if(s.type===3)for(const n of s.notes)if([1,2,3,5].includes(n.type))prevent.add(key(n));
 const objects=[...timeScaleChanges.map(x=>({type:"timeScale",beat:x.tick/tpb,timeScale:x.timeScale})),...bpmChanges.map(x=>({type:"bpm",beat:x.tick/tpb,bpm:x.bpm}))],seen=new Set();
 for(const n of tapNotes){if(n.lane<=1||n.lane>=14||![1,2,5,6].includes(n.type))continue;const k=key(n);if(prevent.has(k)||seen.has(k))continue;seen.add(k);const o={type:"single",beat:n.tick/tpb,lane:n.lane-8+n.width/2,size:n.width/2,trace:n.type===5||n.type===6,critical:n.type===2||n.type===6};if(flick.has(k))o.direction=flick.get(k);objects.push(o)}
 for(const s of streams.values()){let cur=null;for(const n of s.notes.sort((a,b)=>a.tick-b.tick)){if(!cur){cur={type:"slide",active:s.type===3,critical:false,connections:[]};objects.push(cur)}const k=key(n),base={beat:n.tick/tpb,lane:n.lane-8+n.width/2,size:n.width/2,ease:easeMods.get(k)||"linear"};if(cur.connections.length===0)cur.critical=critical.has(k);if(n.type===1)cur.connections.push(cur.active&&!removeEnd.has(k)?{type:"start",...base,trace:trace.has(k),critical:cur.critical}:{type:"ignore",...base});else if(n.type===2){const q=cur.active&&!removeEnd.has(k)?{type:"end",...base,trace:trace.has(k),critical:cur.critical}:{type:"ignore",...base};if(q.type==="end"&&flick.has(k))q.direction=flick.get(k);cur.connections.push(q)}else if(n.type===3)cur.connections.push(removeTick.has(k)?{type:"attach",beat:n.tick/tpb,critical:cur.critical}:{type:"tick",...base,trace:trace.has(k),critical:cur.critical});else if(n.type===5&&!removeTick.has(k))cur.connections.push({type:"ignore",...base});if(n.type===2)cur=null}}
 return {offset,ticksPerBeat:tpb,objects,meta,title:String(meta.get("TITLE")||"").replace(/^"|"$/g,""),artist:String(meta.get("ARTIST")||"").replace(/^"|"$/g,"")};
}
function uscToBrowser(usc){
 const objects=usc.objects||[];
 const bpms=objects.filter(o=>o.type==="bpm").map(o=>({beat:num(o.beat),bpm:num(o.bpm,120)})).sort((a,b)=>a.beat-b.beat);
 const base=bpms[0]?.bpm||120;
 const beatSec=beat=>{let s=0,last=0,bpm=base;for(const x of bpms){if(x.beat>=beat)break;s+=(x.beat-last)*60/Math.max(.01,bpm);last=x.beat;bpm=x.bpm||bpm}return s+(beat-last)*60/Math.max(.01,bpm)};
 const notes=[],timescales=objects.filter(o=>o.type==="timeScale").map(o=>({time:beatSec(num(o.beat)),speed:num(o.timeScale,1)}));let id=0;
 const convertDir=v=>({left:2,up:0,right:3}[v]??0);
 const browserLane=(lane,size)=>clamp(num(lane)-num(size,.5)+6,0,11);
 for(const o of objects){
  if(o.type==="single"){
   const type=o.trace?(o.direction?"trace-flick":"trace"):(o.direction?"flick":"tap");
   notes.push({id:id++,time:beatSec(num(o.beat)),lane:browserLane(o.lane,o.size),width:Math.max(.5,num(o.size,.5)*2),type,critical:!!o.critical,dir:convertDir(o.direction)});
   continue;
  }
  if(o.type!=="slide")continue;
  const cs=(o.connections||[]).slice().sort((x,y)=>num(x.beat)-num(y.beat));
  if(cs.length<2)continue;
  const visible=cs.filter(x=>x.lane!=null);
  if(visible.length<2)continue;
  const first=visible[0],last=visible[visible.length-1];
  const b0=num(first.beat),b1=num(last.beat),duration=Math.max(.001,beatSec(b1)-beatSec(b0));
  const path=visible.map(x=>({t:(num(x.beat)-b0)/Math.max(.001,b1-b0),l:browserLane(x.lane,x.size)}));
  const ticks=cs.filter(x=>x.type==="tick"||x.type==="hidden").map(x=>beatSec(num(x.beat)));
  const headType=first.type==="start"?(first.trace?"trace":"slide"):"slide";
  const tailType=last.type==="end"?(last.direction?(last.trace?"trace-flick":"flick"):(last.trace?"trace":"slide")):"slide";
  notes.push({id:id++,time:beatSec(b0),lane:path[0].l,width:Math.max(.5,num(first.size,.5)*2),type:headType==="trace"?"trace":"slide",
   duration,endLane:path[path.length-1].l,path,critical:!!o.critical,
   headTrace:!!first.trace,headCritical:!!first.critical,tailType,tailTrace:!!last.trace,tailCritical:!!last.critical,
   tailDir:convertDir(last.direction),tickTimes:ticks,activeSlide:!!o.active,metadata:{usc:true}});
 }
 return {title:usc.title||"SUS / USC Chart",artist:usc.artist||"",bpm:base,notes,timescales,timescaleGroups:{"0":timescales},offset:num(usc.offset,0)};
}
function normalize(input){
 if(typeof input==="string"){
  try{const root=JSON.parse(input);return root?.objects?uscToBrowser(root):normalize(root)}
  catch(err){return uscToBrowser(susToUSC(input))}
 }
 if(Array.isArray(input))return{title:"Chart",artist:"",bpm:120,notes:input.map(normalizeNote),timescales:[],timescaleGroups:{"0":[]},options:{}};
 const root=obj(input),src=collect(root),notes=src.map(normalizeNote).filter(n=>Number.isFinite(n.time)).sort((x,y)=>x.time-y.time);
 const raw=pick(root,"timescales","timescaleEvents","scrollEvents","timescaleGroups")??root.options?.timescales;
 const timescaleGroups=groupsFrom(raw),timescales=timescaleGroups["0"]||[],opt=obj(root.options);
 return{
  title:String(pick(root,"title","name","songName")??"Next SEKAI Chart"),
  artist:String(pick(root,"artist","composer","author")??""),
  bpm:Math.max(.1,num(pick(root,"bpm","BPM","baseBpm","tempo"),120)),
  notes,timescales,timescaleGroups,
  options:{
   guideQuality:num(opt.guideQuality,2),noteMargin:num(opt.noteMargin,0),alternativeCurve:!!opt.alternativeCurve,
   disableTimescale:!!opt.disableTimescale,downFlick:opt.downFlick!==false,
   effectAnimationSpeed:Math.max(.1,num(opt.effectAnimationSpeed,1)),markerAnimation:opt.markerAnimation!==false,
   scoreMode:String(opt.scoreMode??"weighted-combo"),initialLife:Math.max(1,num(opt.initialLife,1000)),
   haptic:String(opt.haptic??"disabled"),noteEffectEnabled:opt.noteEffectEnabled!==false,
   laneEffectEnabled:opt.laneEffectEnabled!==false,slotEffectEnabled:opt.slotEffectEnabled!==false,
   disableFakeNotes:!!opt.disableFakeNotes
  }
 };
}
window.PJSekaiNextSekaiAdapter={version:"3.4.0",normalize,normalizeNote,susToUSC,uscToBrowser};
})();