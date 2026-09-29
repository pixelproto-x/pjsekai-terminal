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
function normalize(input){
 const root=typeof input==="string"?JSON.parse(input):obj(input),src=collect(root);
 const notes=src.map(normalizeNote).filter(n=>Number.isFinite(n.time)).sort((a,b)=>a.time-b.time);
 const raw=pick(root,"timescales","timescaleEvents","scrollEvents","timescaleGroups")??root.options?.timescales;
 const timescaleGroups=groupsFrom(raw),timescales=timescaleGroups["0"]||[];
 const opt=obj(root.options);
 return {
  title:String(pick(root,"title","name","songName")??"Next SEKAI Chart"),
  artist:String(pick(root,"artist","composer","author")??""),bpm:Math.max(.1,num(pick(root,"bpm","BPM","baseBpm","tempo"),120)),
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
window.PJSekaiNextSekaiAdapter={version:"2.1.0",normalize,normalizeNote};
})();