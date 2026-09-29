/* Next SEKAI compatibility adapter
 * Based on the public MIT-licensed Next SEKAI engine format/semantics.
 * This is a browser-side adapter, not a copy of the Sonolus runtime.
 * Reference: https://github.com/Next-SEKAI/sonolus-next-sekai-engine
 */
(()=>{"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const pick=(o,...keys)=>{for(const k of keys){if(o&&o[k]!==undefined)return o[k]}return undefined};
function lane(v){return clamp(Math.round(num(v,0)),0,11)}
function time(v){let n=num(v,0);return Math.abs(n)>1000?n/1000:n}
function kind(x){
 const s=String(pick(x,"type","kind","noteType","noteKind","archetype")??"tap").toLowerCase();
 if(/damage/.test(s))return"damage";
 if(/fake/.test(s))return"fake";
 if(/trace.?flick/.test(s))return"trace-flick";
 if(/trace/.test(s))return"trace";
 if(/flick|slide.?flick/.test(s))return"flick";
 if(/hold|slide/.test(s))return s.includes("slide")?"slide":"hold";
 return"tap";
}
function pathOf(x,start,end,duration){
 const raw=pick(x,"path","points","lanePath","curve");
 if(Array.isArray(raw)&&raw.length)return raw.map((p,i)=>({t:clamp(num(p?.t,p?.time!=null?time(p.time)/(duration||1):i/(raw.length-1||1)),0,1),l:lane(p?.l??p?.lane??p?.x??start)}));
 const e=lane(pick(x,"endLane","tailLane","toLane","endX")??end);
 return [{t:0,l:lane(start)},{t:1,l:e}];
}
function normalizeNote(x,i){
 const t=time(pick(x,"time","targetTime","timing","sec","startTime"));
 const d=Math.max(0,time(pick(x,"duration","length","holdTime","endDuration")));
 const l=lane(pick(x,"lane","slot","laneIndex","startLane","x"));
 const k=kind(x);
 const end=lane(pick(x,"endLane","tailLane","toLane")??l);
 return {
  id:i,time:t,lane:l,type:k,duration:d,endLane:end,
  critical:!!pick(x,"critical","isCritical","crit"),
  fake:k==="fake"||!!pick(x,"fake","isFake"),
  damage:k==="damage"||!!pick(x,"damage","isDamage"),
  dir:num(pick(x,"direction","flickDirection","dir"),0),
  guideColor:num(pick(x,"guideColor","color"),0),
  timescaleGroup:num(pick(x,"timescaleGroup","timescale"),0),
  speed:num(pick(x,"speed","noteSpeed","speedMultiplier"),1),
  ease:String(pick(x,"ease","easing")??"smooth"),
  path:pathOf(x,l,end,d)
 };
}
function collect(root){
 if(Array.isArray(root))return root;
 for(const k of ["notes","entities","levelData","chart","objects","objectsData"]){
  if(Array.isArray(root?.[k]))return root[k];
  if(root?.[k]&&Array.isArray(root[k].notes))return root[k].notes;
 }
 return [];
}
function normalize(input){
 const root=typeof input==="string"?JSON.parse(input):input;
 const src=collect(root);
 const notes=src.map(normalizeNote).filter(n=>Number.isFinite(n.time)).sort((a,b)=>a.time-b.time);
 const bpm=num(pick(root,"bpm","BPM","baseBpm"),120);
 return {
  title:String(pick(root,"title","name","songName")??"Next SEKAI Chart"),
  artist:String(pick(root,"artist","composer")??""),
  bpm,notes,
  options:{
   guideQuality:num(root?.options?.guideQuality,2),
   noteMargin:num(root?.options?.noteMargin,1),
   alternativeCurve:!!root?.options?.alternativeCurve,
   disableTimescale:!!root?.options?.disableTimescale
  }
 };
}
window.PJSekaiNextSekaiAdapter={version:"1.0.0",normalize,normalizeNote};
})();