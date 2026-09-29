/* Project SEKAI / Next-SEKAI Web Dojo — unified runtime
 * Behavioral recreation based on the public Next-SEKAI / Sonolus engine.
 * The browser implementation is self-contained and uses original Canvas/WebAudio rendering.
 * No proprietary Project SEKAI runtime/assets are redistributed.
 */
(()=>{"use strict";
const E=window.PJSekaiWebDojo;if(!E)return;
const MS=1000,TAU=Math.PI*2,RAD=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),F=n=>n/60*1000;
const MODE={WEIGHTED_FLAT:"weighted-flat",WEIGHTED_COMBO:"weighted-combo",UNWEIGHTED_FLAT:"unweighted-flat",UNWEIGHTED_COMBO:"unweighted-combo"};
const DIR={UP_OMNI:[0,-1],DOWN_OMNI:[0,1],UP_LEFT:[-.7071068,-.7071068],UP_RIGHT:[.7071068,-.7071068],DOWN_LEFT:[-.7071068,.7071068],DOWN_RIGHT:[.7071068,.7071068]};
const GUIDE=["#61d7f0","#ff6e86","#6ee0aa","#62a8ff","#ffe04d","#bf84ff","#57dbe3","#202532"];
const WINDOW={
 tap:{perfect:[-F(2.5),F(2.5)],great:[-F(5),F(5)],good:[-F(6.5),F(6.5)],bad:[-F(7.5),F(7.5)]},
 criticalTap:{perfect:[-F(3.3),F(3.3)],great:[-F(4.5),F(4.5)],good:[-F(6.5),F(6.5)],bad:[-F(7.5),F(7.5)]},
 flick:{perfect:[-F(2.5),F(2.5)],great:[-F(6.5),F(7.5)],good:[-F(7),F(8)],bad:[-F(7.5),F(8.5)]},
 criticalFlick:{perfect:[-F(3.5),F(3.5)],great:[-F(6.5),F(7.5)],good:[-F(7),F(8)],bad:[-F(7.5),F(8.5)]},
 trace:{perfect:[-F(5),F(5)],great:[-F(5),F(5)],good:[-F(5),F(5)],bad:[-F(5),F(5)]},
 traceFlick:{perfect:[-F(6.5),F(7.5)],great:[-F(6.5),F(7.5)],good:[-F(6.5),F(7.5)],bad:[-F(6.5),F(7.5)]},
 slideEnd:{perfect:[-F(3.5),F(4)],great:[-F(6.5),F(8)],good:[-F(7.5),F(8.5)],bad:[-F(8.5),F(8.5)]},
 slideTrace:{perfect:[-F(6.5),F(8)],great:[-F(6.5),F(8)],good:[-F(6.5),F(8)],bad:[-F(6.5),F(8)]}
};
const SFX={tap:[640,"triangle"],critical:[920,"sine"],flick:[1180,"square"],trace:[780,"sine"],tick:[760,"triangle"],great:[690,"sine"],good:[540,"triangle"],miss:[180,"sawtooth"],release:[610,"triangle"]};
const N=E.nextSekai||{};
Object.assign(N,{
 version:"7.0.0",
 scoreMode:N.scoreMode||MODE.WEIGHTED_COMBO,
 initialLife:Number(N.initialLife)||1000,maxLife:Number(N.maxLife)||1000,
 inputOffset:Number(N.inputOffset)||0,
 effectAnimationSpeed:Number(N.effectAnimationSpeed)||1,
 noteEffectEnabled:N.noteEffectEnabled!==false,laneEffectEnabled:N.laneEffectEnabled!==false,slotEffectEnabled:N.slotEffectEnabled!==false,
 sfxEnabled:N.sfxEnabled!==false,
 haptic:N.haptic||"disabled",edgeTouchCorrection:true,
 flickSpeedThreshold:2,touchLeniency:1,slideLockout:.25,
 guideQuality:Number(N.guideQuality)||2,noteMargin:Number(N.noteMargin)||0,
 alternativeCurve:!!N.alternativeCurve,disableTimescale:!!N.disableTimescale,
 disableFakeNotes:!!N.disableFakeNotes,downFlick:N.downFlick!==false,
 score:0,combo:0,maxCombo:0,judgments:[],replay:[],progress:[],pending:new Map(),touchHistory:new Map(),finished:false
});
function classify(n){
 const raw=String(n.kind||n.noteKind||n.type||"tap").toUpperCase().replace(/[ -]/g,"_");
 let type=String(n.type||"tap").toLowerCase();
 if(/DAMAGE/.test(raw)||n.damage)type="damage";
 else if(/HIDE_DAMAGE/.test(raw)||n.hidden&&/damage/i.test(String(n.kind||"")))type="hidden-damage";
 else if(/FAKE/.test(raw)||n.fake)type="fake";
 else if(/TRACE_?FLICK/.test(raw)||type==="trace-flick")type="trace-flick";
 else if(/FLICK/.test(raw)||type==="flick")type="flick";
 else if(/TRACE/.test(raw)||type==="trace")type="trace";
 else if(/TICK/.test(raw)||type==="tick")type="tick";
 else if(/RELEASE|_HEAD_|_TAIL_/.test(raw)||type==="slide"||type==="hold")type="slide";
 else type="tap";
 return {raw,type,critical:/^CRIT_/.test(raw)||!!n.critical,fake:!!n.fake||/^FAKE_/.test(raw),hidden:!!n.hidden||/^HIDE_/.test(raw),damage:!!n.damage||/DAMAGE/.test(raw),anchor:raw==="ANCHOR",head:/_HEAD_/.test(raw)||!!n.head,tail:/_TAIL_/.test(raw)||!!n.tail};
}
function winFor(n,tail=false){
 const i=classify(n);
 if(tail)return i.type==="trace"||i.type==="trace-flick"?WINDOW.slideTrace:WINDOW.slideEnd;
 if(i.type==="flick")return i.critical?WINDOW.criticalFlick:WINDOW.flick;
 if(i.type==="trace-flick")return WINDOW.traceFlick;
 if(i.type==="trace"||i.type==="tick"||i.type==="hidden-damage")return WINDOW.trace;
 if(i.type==="slide")return WINDOW.slideEnd;
 return i.critical?WINDOW.criticalTap:WINDOW.tap;
}
function judgeDelta(delta,n,tail=false){
 const w=winFor(n,tail);
 if(delta>=w.perfect[0]&&delta<=w.perfect[1])return"perfect";
 if(delta>=w.great[0]&&delta<=w.great[1])return"great";
 if(delta>=w.good[0]&&delta<=w.good[1])return"good";
 if(delta>=w.bad[0]&&delta<=w.bad[1])return"bad";
 return null;
}
function targetTime(n,tail=false){
 const t=tail?n.time+(n.duration||0):n.time;
 return E.reverse?Math.max(0,E.duration-t):t;
}
function adjustedNow(){
 const t=E.reverse?Math.max(0,E.duration-E.time()):E.time();
 return t*MS+N.inputOffset;
}
function deltaFor(n,tail=false){return adjustedNow()-targetTime(n,tail)*MS}
function noteWeight(n){
 const i=classify(n);if(N.scoreMode===MODE.UNWEIGHTED_COMBO||N.scoreMode===MODE.UNWEIGHTED_FLAT)return 10;
 if(i.damage||i.hidden||i.type==="tick")return 1;
 if(i.critical)return(i.type==="flick"||i.type==="trace-flick")?30:(i.type==="trace"?2:20);
 return(i.type==="flick"||i.type==="trace-flick")?10:(i.type==="trace"?1:10);
}
function scoreMul(j){
 return(N.scoreMode===MODE.WEIGHTED_FLAT||N.scoreMode===MODE.UNWEIGHTED_FLAT)?({perfect:3,great:2,good:1,bad:0}[j]||0):({perfect:1,great:.7,good:.5,bad:0}[j]||0);
}
function addScore(j,n,before){
 const comboMode=N.scoreMode===MODE.WEIGHTED_COMBO||N.scoreMode===MODE.UNWEIGHTED_COMBO;
 const comboBonus=comboMode?Math.min(10,Math.floor(Math.max(0,before)/100))*.1:0;
 E.score+=Math.round(noteWeight(n)*10*scoreMul(j)*(1+comboBonus));
}
function record(j,n,delta,extra={}){
 const r={id:n.id,time:E.time(),delta:+Number(delta||0).toFixed(4),judgment:j,lane:n.lane,critical:!!classify(n).critical,...extra};
 N.judgments.push(r);N.replay.push(r);E.judgmentAccuracy=N.judgments;E.replay=N.replay;
 E.judgeSamples=E.judgeSamples||[];E.judgeSamples.push(r.delta);
}
function playSfx(kind,n){
 if(!N.sfxEnabled||!E.ensureAudio)return;E.ensureAudio();const a=E.audioCtx;if(!a)return;
 try{const i=classify(n||{}),spec=kind==="perfect"&&i.critical?SFX.critical:kind==="flick"?SFX.flick:kind==="trace"?SFX.trace:kind==="tick"?SFX.tick:kind==="great"?SFX.great:kind==="good"?SFX.good:kind==="miss"?SFX.miss:kind==="release"?SFX.release:SFX.tap;
  const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=spec[1];o.frequency.setValueAtTime(spec[0],t);o.frequency.exponentialRampToValueAtTime(spec[0]*.72,t+.08);g.gain.setValueAtTime(.045,t);g.gain.exponentialRampToValueAtTime(.0001,t+.11);o.connect(g).connect(a.destination);o.start(t);o.stop(t+.12)}catch{}
}
function haptic(j){
 if(!navigator.vibrate||N.haptic==="disabled")return;
 if(N.haptic==="miss"&&j!=="miss")return;
 if(N.haptic==="miss-good"&&j!=="miss"&&j!=="good")return;
 try{navigator.vibrate(j==="miss"?45:j==="good"?22:14)}catch{}
}
function spawnEffect(n,kind){
 E.effects=E.effects||[];const i=classify(n),now=performance.now()/1000;
 const color=i.damage||kind==="damage"?"#ff5572":i.critical?"#ffe15a":i.type==="trace"||i.type==="trace-flick"?GUIDE[(n.guideColor||0)%GUIDE.length]:i.type==="flick"?"#ff9d61":"#69dff2";
 if(N.noteEffectEnabled)E.effects.push({lane:n.lane,kind,critical:i.critical,color,spawn:now,max:kind==="perfect"?.55:.46,life:kind==="perfect"?.55:.46,count:kind==="perfect"?14:kind==="great"?10:7});
 if(N.slotEffectEnabled)E.effects.push({lane:n.lane,kind:"slot",critical:i.critical,color,spawn:now,max:.25,life:.25});
 if(N.laneEffectEnabled)E.effects.push({lane:n.lane,kind:"lane",critical:i.critical,color,spawn:now,max:.5,life:.5});
}
function spawnTick(n,lane,kind="tick"){E.effects=E.effects||[];E.effects.push({lane,kind,color:kind==="miss"?"#ff5572":GUIDE[(n.guideColor||0)%GUIDE.length],spawn:performance.now()/1000,max:.25,life:.25})}
function award(j,n,delta,extra={}){
 const i=classify(n);if(i.fake||i.anchor||i.hidden||i.damage)return;
 const before=E.combo;E.counts[j]=(E.counts[j]||0)+1;addScore(j,n,before);
 if(j==="bad"){E.combo=0;E.life=clamp((E.life??N.initialLife)-80,0,N.maxLife)}else{E.combo++;E.maxCombo=Math.max(E.maxCombo,E.combo)}
 E.lastJudge=j.toUpperCase();record(j,n,delta,extra);spawnEffect(n,j);playSfx(j,n);haptic(j);
}
function fail(n,reason="miss"){
 const i=classify(n);if(n.missed||i.fake||i.anchor)return;
 n.missed=true;n.active=false;E.combo=0;E.counts.miss=(E.counts.miss||0)+1;
 E.life=clamp((E.life??N.initialLife)-(i.type==="tick"||i.type==="hidden-damage"||i.damage?40:80),0,N.maxLife);
 E.lastJudge=reason.toUpperCase();record("miss",n,deltaFor(n),{reason});spawnEffect(n,"miss");playSfx("miss",n);haptic("miss");
}
function hitDamage(n){if(n.damageResolved)return;n.damageResolved=true;n.hit=true;n.active=false;E.combo=0;E.counts.bad=(E.counts.bad||0)+1;E.life=clamp((E.life??N.initialLife)-40,0,N.maxLife);E.lastJudge="DAMAGE";record("damage",n,deltaFor(n),{damage:true});spawnEffect(n,"damage");playSfx("miss",n);haptic("miss")}
function completeDamage(n){n.damageResolved=true;n.hit=true;n.active=false}
function directionVector(dir){const d=Number(dir)||0;return d===0?DIR.UP_OMNI:d===1?DIR.DOWN_OMNI:d===2?DIR.UP_LEFT:d===3?DIR.UP_RIGHT:d===4?DIR.DOWN_LEFT:d===5?DIR.DOWN_RIGHT:DIR.UP_OMNI}
function flickAngle(dx,dy){let x=dx,y=dy;if(E.mirror)x=-x;const l=Math.hypot(x,y);return l<1?null:Math.atan2(y/l,x/l)}
function flickMatches(n,dx,dy){
 const a=flickAngle(dx,dy);if(a==null)return false;const d=Number(n.dir)||0;
 if(d===0)return true;if(d===1)return N.downFlick!==false;
 const want=directionVector(d),b=Math.atan2(want[1],want[0]),diff=Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 return diff<=Math.PI/2;
}
function pointerSpeed(p){
 if(!p)return 0;const dt=Math.max(.001,(performance.now()-(p.lastT??performance.now()))/1000);return Math.hypot((p.x??0)-(p.lastX??p.x??0),(p.y??0)-(p.lastY??p.y??0))/dt;
}
function eventLane(e){
 const r=E.canvas.getBoundingClientRect();let x=clamp(e.clientX-r.left,0,r.width-1e-4);
 if(N.edgeTouchCorrection)x=clamp(x,0,r.width);
 return clamp(Math.floor(x/r.width*12),0,11);
}
function laneDistance(n,lane){
 const nl=E.mirror?11-n.lane:n.lane,width=Math.max(.5,Number(n.width)||1)+N.noteMargin*12;
 return Math.abs(nl-lane)<=width/2+N.touchLeniency;
}
function candidate(lane,mode="head"){
 const now=adjustedNow(),out=[];
 for(const n of E.notes||[]){
  const i=classify(n);if(n.missed||n.hit||i.fake||i.anchor||i.hidden)continue;
  if(i.damage||i.type==="hidden-damage")continue;if(mode==="tail"&&!n.active)continue;
  const d=deltaFor(n,mode==="tail"),w=winFor(n,mode==="tail");
  if(d<w.bad[0]||d>w.bad[1]||!laneDistance(n,lane))continue;
  const spatial=Math.abs((E.mirror?11-n.lane:n.lane)-lane),temporal=Math.abs(d)/Math.max(1,w.bad[1]-w.bad[0]);
  out.push({n,score:-spatial-temporal*.25,abs:Math.abs(d)});
 }
 out.sort((a,b)=>b.score-a.score||a.abs-b.abs);return out[0]?.n||null;
}
function makeTicks(n){
 if(Array.isArray(n.tickTimes)&&n.tickTimes.length)return n.tickTimes.slice().sort((a,b)=>a-b);
 if(!n.duration)return[];
 const arr=[],step=60/Math.max(.1,E.bpm||120)/2;for(let t=step;t<n.duration-1e-6;t+=step)arr.push(n.time+t);return arr;
}
function pathLane(n,t){
 if(!n.duration||!n.path?.length)return n.lane;
 const f=clamp((t-n.time)/Math.max(.000001,n.duration),0,1),pts=n.path;let i=0;
 while(i<pts.length-1&&f>Number(pts[i+1].t??1))i++;
 const a=pts[i],b=pts[Math.min(i+1,pts.length-1)],u=clamp((f-Number(a.t||0))/Math.max(.000001,Number(b.t??1)-Number(a.t||0)),0,1);
 return Number(a.l)+((Number(b.l)-Number(a.l))*easeCurve(b.ease??a.ease??n.ease,u));
}
function easeCurve(type,x){
 x=clamp(x,0,1);const k=String(type||"linear").toLowerCase().replace(/[- ]/g,"_");
 if(k==="none")return x>=1?1:0;if(k.includes("in_out_cubic")||k.includes("inoutcubic"))return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
 if(k.includes("in_out_quad")||k.includes("inoutquad"))return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
 if(k.includes("out_in_quad")||k.includes("outinquad"))return x<.5?(1-Math.pow(1-2*x,2))/2:.5+Math.pow(2*x-1,2)/2;
 if(k.includes("in_quad"))return x*x;if(k.includes("out_quad"))return 1-(1-x)*(1-x);
 if(k.includes("in_cubic"))return x*x*x;if(k.includes("out_cubic"))return 1-Math.pow(1-x,3);
 if(k.includes("in_quart"))return x**4;if(k.includes("out_quart"))return 1-(1-x)**4;
 if(k.includes("sine"))return(1-Math.cos(Math.PI*x))/2;return x*x*(3-2*x);
}
function groupsFor(n){
 if(N.disableTimescale||E.disableTimescale)return[];
 const g=E.timescaleGroups?.[n.timescaleGroup]??E.timescaleGroups?.[String(n.timescaleGroup)];
 return Array.isArray(g)&&g.length?g:(Array.isArray(n.timescaleEvents)?n.timescaleEvents:(E.timescaleEvents||[]));
}
function speedAt(events,t){
 if(!events.length)return 1;let cur=Number(events[0].speed)||1;
 for(let i=0;i<events.length;i++){const a=events[i],b=events[i+1];if(t<Number(a.time))break;if(!b||t>=Number(b.time)){cur=Number(a.speed)||1;continue}const u=clamp((t-a.time)/Math.max(.000001,b.time-a.time),0,1),as=Number(a.speed)||1,bs=Number(b.speed??a.speed)||as;return as+(bs-as)*easeCurve(b.ease??a.ease,u)}
 return cur;
}
function integrate(events,a,b){
 if(b<=a)return 0;if(!events.length)return b-a;const cuts=[a,...events.map(x=>Number(x.time)).filter(t=>t>a&&t<b),b].sort((x,y)=>x-y);let sum=0;
 for(let i=0;i<cuts.length-1;i++){const x=cuts[i],y=cuts[i+1],m=(x+y)/2,s0=speedAt(events,x),sm=speedAt(events,m),s1=speedAt(events,y);sum+=(y-x)*(s0+4*sm+s1)/6}return sum;
}
function visualProgress(n,now){
 const target=targetTime(n),dist=integrate(groupsFor(n),Math.min(now,target),Math.max(now,target));
 const signed=now<=target?dist:-dist,travel=.95/Math.max(.05,(E.speed||1)*(n.speed||1));
 return 1-clamp(signed/travel,-.15,1.15);
}
function touchState(e){
 const id=e.pointerId||0,p=N.touchHistory.get(id)||{id,downX:e.clientX,downY:e.clientY,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,downT:performance.now(),lastT:performance.now(),speed:0,angle:0,started:true,ended:false,note:null};
 p.lastX=p.x;p.lastY=p.y;p.lastT=p.lastT??performance.now();p.x=e.clientX;p.y=e.clientY;const dt=Math.max(.001,(performance.now()-p.lastT)/1000);p.speed=Math.hypot(p.x-p.lastX,p.y-p.lastY)/dt;p.angle=Math.atan2(p.y-p.lastY,p.x-p.lastX);N.touchHistory.set(id,p);return p;
}
function onDown(e){
 if(e.target!==E.canvas&&!e.target.closest?.(".pjsk-import-box"))return;
 const p={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,downX:e.clientX,downY:e.clientY,downT:performance.now(),lastT:performance.now(),speed:0,angle:0,started:true,ended:false,note:null};
 N.touchHistory.set(e.pointerId,p);
 const lane=eventLane(e),n=candidate(lane);if(!n)return;
 const i=classify(n);
 if(i.damage||i.type==="hidden-damage"){if(laneDistance(n,lane))hitDamage(n);return}
 if(i.type==="flick"||i.type==="trace-flick"){N.pending.set(e.pointerId,{n,downX:e.clientX,downY:e.clientY,startTime:E.time(),bestTime:Infinity,bestCorrect:false,lastTime:E.time(),wrong:false});return}
 if(i.type==="trace"){n.traceArmed=true;n.tracePointer=e.pointerId;n.active=true;n.capturedPointer=e.pointerId;n.holdUntil=n.time+(n.duration||0);return}
 const d=deltaFor(n),j=judgeDelta(d,n);if(j){n.hit=true;n.active=n.duration>0||i.type==="slide";n.hitAt=E.time();n.holdUntil=n.time+(n.duration||0);n.capturedPointer=e.pointerId;award(j,n,d)}
}
function onMove(e){
 const p=N.touchHistory.get(e.pointerId);if(!p)return;
 const oldX=p.x,oldY=p.y,oldT=p.lastT;p.lastX=oldX;p.lastY=oldY;p.x=e.clientX;p.y=e.clientY;p.lastT=performance.now();const dt=Math.max(.001,(p.lastT-oldT)/1000);p.speed=Math.hypot(p.x-oldX,p.y-oldY)/dt;p.angle=Math.atan2(p.y-oldY,p.x-oldX);
 const q=N.pending.get(e.pointerId);if(q){q.lastLane=eventLane(e);q.lastSpeed=p.speed;q.lastTime=E.time();if(flickMatches(q.n,e.clientX-q.downX,e.clientY-q.downY)){q.bestCorrect=true;q.bestTime=E.time()}}
 if(p.note?.active||p.note?.traceArmed){const n=p.note,target=E.mirror?11-pathLane(n,E.time()):pathLane(n,E.time());n.offPath=Math.abs(eventLane(e)-target)>Math.max(1.25,(n.width||1)/2+N.noteMargin*6)}
}
function resolveFlick(e,p){
 const q=N.pending.get(e.pointerId);if(!q)return false;const n=q.n,dx=e.clientX-q.downX,dy=e.clientY-q.downY;
 const elapsed=Math.max(.001,(performance.now()-p.downT)/1000),speed=Math.hypot(dx,dy)/elapsed;if(speed<N.flickSpeedThreshold)return false;
 const d=deltaFor(n),w=winFor(n);if(d<w.bad[0]||d>w.bad[1])return false;
 const correct=flickMatches(n,dx,dy);if(correct||q.bestCorrect){const j=judgeDelta(d,n);if(j){n.hit=true;n.active=n.duration>0;n.hitAt=E.time();n.capturedPointer=e.pointerId;award(q.bestCorrect&&!correct?"great":j,n,d,{wrongWay:q.bestCorrect&&!correct});return true}}
 q.wrong=true;if(q.bestTime===Infinity)q.bestTime=E.time();return false;
}
function onUp(e){
 const p=N.touchHistory.get(e.pointerId),q=N.pending.get(e.pointerId),n=p?.note||q?.n;if(!n)return;
 const i=classify(n);if(i.type==="flick"||i.type==="trace-flick"){resolveFlick(e,p||{});N.pending.delete(e.pointerId);N.touchHistory.delete(e.pointerId);return}
 if(!n.active){N.touchHistory.delete(e.pointerId);return}
 const d=deltaFor(n,true),j=judgeDelta(d,{...n,type:i.type==="trace"?"trace":"slide"},true);
 if(i.type==="trace"||i.type==="slide"){
  if(j){n.active=false;n.tailHit=true;award(j,{...n,id:String(n.id)+":tail",time:n.time+(n.duration||0),lane:n.endLane??n.lane,type:"slide",critical:n.critical},d)}
  else fail(n,"release")
 }
 N.touchHistory.delete(e.pointerId);
}
function processFrame(){
 const logical=E.reverse?E.duration-E.time():E.time(),touches=[...N.touchHistory.values()];
 for(const n of E.notes||[]){
  const i=classify(n);if(i.fake||i.anchor||n.missed)continue;
  if((i.damage||i.type==="hidden-damage")&&!n.damageResolved){
   const d=logical-n.time,w=winFor(n),touched=touches.some(p=>laneDistance(n,eventLane({clientX:p.x,clientY:p.y})));
   if(touched&&d>=w.perfect[0]/MS&&d<=w.bad[1]/MS)hitDamage(n);else if(d>w.bad[1]/MS)completeDamage(n);
   continue;
  }
  if((i.type==="trace"||i.type==="trace-flick")&&!n.hit){
   const target=E.mirror?11-pathLane(n,n.time):pathLane(n,n.time);
   let right=false,wrong=false;
   for(const p of touches){if(Math.abs(eventLane({clientX:p.x,clientY:p.y})-target)>Math.max(1.25,(n.width||1)/2+N.noteMargin*6))continue;
    if(i.type==="trace"||flickMatches(n,p.x-p.downX,p.y-p.downY))right=true;else wrong=true;
   }
   const d=logical-n.time;
   if(right&&d>=-5/60&&d<=5/60){n.hit=true;n.active=n.duration>0;n.capturedPointer=touches[0]?.id??-1;award("perfect",n,d*MS,{earlyTrace:true})}
   else if(wrong&&d>=-5/60&&d<=5/60)n.traceWrongSeen=true;
  }
  if(n.active&&n.duration>0){
   n.progress=clamp((logical-n.time)/Math.max(.000001,n.duration),0,1);
   n.tickTimes=n.tickTimes||makeTicks(n);n.tickIndex=n.tickIndex||0;
   while(n.tickIndex<n.tickTimes.length&&logical+N.inputOffset/MS>=n.tickTimes[n.tickIndex]){
    const tt=n.tickTimes[n.tickIndex++],tl=pathLane(n,tt),held=touches.some(p=>Math.abs(eventLane({clientX:p.x,clientY:p.y})-(E.mirror?11-tl:tl))<=Math.max(1.25,(n.width||1)/2+N.noteMargin*6));
    if(held||i.type==="trace"||i.type==="trace-flick"){E.score+=10;E.counts.perfect=(E.counts.perfect||0)+1;spawnTick(n,tl)}
    else{E.life=clamp((E.life??N.initialLife)-40,0,N.maxLife);E.combo=0;E.counts.miss=(E.counts.miss||0)+1;spawnTick(n,tl,"miss")}
   }
  }
  const end=targetTime(n)*MS+winFor(n).bad[1]-N.inputOffset;
  if(!n.hit&&!n.active&&adjustedNow()>end)fail(n);
  if(n.active&&logical>=n.time+(n.duration||0)&&!n.tailHit){
   n.active=false;n.tailHit=true;award("perfect",{...n,id:String(n.id)+":tail",time:n.time+(n.duration||0),lane:n.endLane??n.lane,type:"slide",critical:n.critical},0,{autoComplete:true})
  }
 }
 for(const [id,q] of N.pending){
  if(!q.n||q.n.hit||q.n.missed)continue;const d=deltaFor(q.n),w=winFor(q.n);
  if(q.wrong&&d>=w.perfect[0]&&d<=w.perfect[1]&&!q.bestCorrect){const j=judgeDelta(d,q.n);if(j)award(j==="perfect"?"great":j,q.n,d,{wrongWay:true});q.n.hit=true;N.pending.delete(id)}
  else if(d>w.bad[1]){fail(q.n,"flick");N.pending.delete(id)}
 }
 N.progress.push({time:E.time(),score:E.score,combo:E.combo,life:E.life});if(N.progress.length>3600)N.progress.shift();
 if(E.time()>=E.duration-.01&&!N.finished)finish();
}
function drawParticles(ctx,w,h){
 const now=performance.now()/1000,scale=Math.max(.1,N.effectAnimationSpeed||1);
 for(const e of E.effects||[]){const age=(now-e.spawn)*scale;e.life=e.max-age;if(e.life<=0)continue;const p=clamp(age/e.max,0,1),x=w*(.08+(e.lane+.5)/12*.84),y=h*.83,c=e.color||"#69dff2";ctx.save();ctx.globalCompositeOperation="lighter";ctx.globalAlpha=1-p;
  if(e.kind==="slot"){ctx.strokeStyle=c;ctx.lineWidth=2+4*(1-p);ctx.beginPath();ctx.ellipse(x,y,22+30*p,8+14*p,0,0,TAU);ctx.stroke()}
  else if(e.kind==="lane"){ctx.fillStyle=c;ctx.globalAlpha*=.55;ctx.fillRect(x-5,y-90*p,10,90*p)}
  else{ctx.fillStyle=c;for(let i=0;i<(e.count||8);i++){const a=TAU*i/(e.count||8)+(e.seed||0),r=(8+44*p)*(i%2?.82:1);ctx.beginPath();ctx.arc(x+Math.cos(a)*r,y+Math.sin(a)*r,Math.max(1.5,4*(1-p)),0,TAU);ctx.fill()}}
  ctx.restore()
 }
 E.effects=(E.effects||[]).filter(e=>e.life>0);
}
function render(){
 const ctx=E.ctx,r=E.canvas?.getBoundingClientRect();if(!ctx||!r)return;const w=r.width,h=r.height,now=E.time();
 ctx.clearRect(0,0,w,h);const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,"#050713");bg.addColorStop(.6,"#0c1730");bg.addColorStop(1,"#111c3a");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);E.drawStage(ctx,w,h);
 for(const n of E.notes||[]){const i=classify(n);if(n.missed||i.fake||i.hidden)continue;const f=visualProgress(n,now);if(f<-.05||f>1.12)continue;if(E.sudden&&f<.48&&!n.active)continue;drawPath(n,w,h,now);drawNote(n,f,w,h)}
 drawParticles(ctx,w,h);E.updateHud?.();updateHud();
}
function drawPath(n,w,h,now){
 if(!n.duration)return;const pts=[],count=Math.max(24,(n.path?.length||2)*18);
 for(let i=0;i<=count;i++){const u=i/count,t=n.time+u*n.duration,l=pathLane(n,t),f=visualProgress({time:t,lane:l,duration:0,timescaleGroup:n.timescaleGroup,speed:n.speed||1},now);if(f>=-.05&&f<=1.12)pts.push(E.project(E.mirror?11-l:l,f,w,h))}
 if(pts.length<2)return;const c=classify(n),color=c.damage?"#ff5572":c.critical?"#ffe04e":c.type==="trace"||c.type==="trace-flick"?GUIDE[(n.guideColor||0)%GUIDE.length]:c.type==="flick"?"#ff9d61":"#69dff2";
 const ctx=E.ctx;ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=c.type==="trace"||c.type==="trace-flick"?.78:.68;ctx.lineWidth=Math.max(4,pts[0].size*(N.guideQuality>=2?1:.75));ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
}
function drawNote(n,f,w,h){
 const ctx=E.ctx,i=classify(n),p=E.project(E.mirror?11-n.lane:n.lane,f,w,h),color=i.damage?"#ff5572":i.critical?"#fff0a0":i.type==="trace"||i.type==="trace-flick"?GUIDE[(n.guideColor||0)%GUIDE.length]:i.type==="flick"?"#ffb35f":"#f4fbff";
 ctx.save();ctx.translate(p.x,p.y);const s=p.size*clamp((1+N.noteMargin*3)*Math.sqrt(Math.max(1,n.width||1)),1,3.3);ctx.shadowBlur=i.critical?24:14;ctx.shadowColor=color;ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-s*.75,-s*.52,s*1.5,s*1.04,s*.2);ctx.fill();
 if(i.type==="flick"||i.type==="trace-flick"){const [vx,vy]=directionVector(n.dir);ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(vx*s*1.08,vy*s*1.08);ctx.lineTo(-vy*s*.38+vx*s*.2,vx*s*.38+vy*s*.2);ctx.lineTo(vy*s*.38+vx*s*.2,-vx*s*.38+vy*s*.2);ctx.closePath();ctx.fill()}
 if(i.critical){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke()}ctx.restore();
}
function updateHud(){
 const c=document.querySelector("#pjskCombo"),s=document.querySelector("#pjskScore"),j=document.querySelector("#pjskJudge");if(c)c.textContent=E.combo||0;if(s)s.textContent=String(Math.round(E.score||0)).padStart(7,"0");if(j)j.textContent=E.lastJudge||"READY";
 const h=E.stage?.querySelector(".pjsk-hud");if(!h)return;let life=h.querySelector(".next-life");if(!life){life=document.createElement("div");life.className="next-life";life.innerHTML="<small>LIFE</small><strong></strong>";h.appendChild(life)}life.querySelector("strong").textContent=String(Math.round(E.life??N.initialLife));
 let r=h.querySelector(".next-rank");if(!r){r=document.createElement("div");r.className="next-rank";h.appendChild(r)}const m=E.counts||{};r.textContent=`P ${m.perfect||0}  G ${m.great||0}  GD ${m.good||0}  B ${m.bad||0}  M ${m.miss||0}`;
}
function finish(){
 if(N.finished)return;N.finished=true;E.running=false;cancelAnimationFrame(E.raf);const c=E.counts||{},total=(E.notes||[]).filter(n=>{const i=classify(n);return!i.fake&&!i.damage&&!i.hidden&&!i.anchor}).length,judged=(c.perfect||0)+(c.great||0)+(c.good||0)+(c.bad||0)+(c.miss||0);
 const acc=judged?((c.perfect||0)+(c.great||0)*.8+(c.good||0)*.5)/judged*100:0;
 E.result={total,score:Math.round(E.score||0),combo:E.maxCombo||0,counts:{...c},accuracy:+acc.toFixed(3),ap:!(c.great||0||c.good||0||c.bad||0||c.miss||0),fc:(c.miss||0)===0,life:Math.round(E.life??N.initialLife),replay:N.replay.slice()};
 showResult();
}
function showResult(){
 const stage=E.stage;if(!stage)return;let p=stage.querySelector(".next-result");if(!p){p=document.createElement("div");p.className="next-result";p.style.cssText="position:absolute;inset:auto 18px 18px auto;z-index:20;width:min(390px,calc(100% - 36px));padding:14px;border-radius:18px;background:rgba(8,12,27,.92);color:#fff;font-size:11px;backdrop-filter:blur(12px)";stage.appendChild(p)}
 const r=E.result;p.innerHTML=`<b style="font-size:14px">${r.ap?"ALL PERFECT":r.fc?"FULL COMBO":"RESULT"}</b><br>Score ${r.score} · Max Combo ${r.combo} · Accuracy ${r.accuracy}% · Life ${r.life}<canvas class="next-progress" width="340" height="82" style="display:block;width:100%;height:82px;margin-top:8px;border-radius:10px;background:rgba(255,255,255,.05)"></canvas><div style="display:flex;gap:6px;margin-top:8px"><button class="next-replay-export" style="flex:1;border:0;border-radius:999px;padding:8px;font-size:10px;font-weight:800">Export Replay</button><button class="next-result-close" style="border:0;border-radius:999px;padding:8px 11px;font-size:10px">Close</button></div>`;
 const cv=p.querySelector("canvas"),g=cv?.getContext("2d"),a=N.progress||[];if(g&&a.length){const maxS=Math.max(1,...a.map(x=>x.score||0)),maxC=Math.max(1,...a.map(x=>x.combo||0)),maxL=Math.max(1,N.maxLife||1000),plot=(key,max,y,h)=>{g.beginPath();a.forEach((x,i)=>{const xx=i/(a.length-1||1)*cv.width,yy=y+h-(x[key]||0)/max*h;i?g.lineTo(xx,yy):g.moveTo(xx,yy)});g.stroke()};g.lineWidth=1.5;g.strokeStyle="#61d7f0";plot("score",maxS,2,30);g.strokeStyle="#ffe04d";plot("combo",maxC,35,18);g.strokeStyle="#69e0aa";plot("life",maxL,56,18)}
 p.querySelector(".next-replay-export")?.addEventListener("click",()=>{const blob=new Blob([JSON.stringify({engine:"Next-SEKAI-Web",version:N.version,result:E.result,replay:N.replay},null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="pjsekai-dojo-replay.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)});
 p.querySelector(".next-result-close")?.addEventListener("click",()=>p.remove());
}
function addControls(){
 const box=E.stage?.querySelector(".pjsk-import-box");if(!box||box.querySelector(".next-unified-controls"))return;
 const d=document.createElement("div");d.className="next-unified-controls";d.style.cssText="display:grid;grid-template-columns:repeat(4,minmax(100px,1fr));gap:6px;margin-top:8px";
 d.innerHTML='<label>Score<select data-nx="score"><option value="weighted-combo">Weighted Combo</option><option value="weighted-flat">Weighted Flat</option><option value="unweighted-combo">Unweighted Combo</option><option value="unweighted-flat">Unweighted Flat</option></select></label><label>Life<input data-nx="life" type="number" min="1" max="9999" step="1"></label><label>Haptic<select data-nx="haptic"><option value="disabled">Off</option><option value="miss">Miss</option><option value="miss-good">Miss + Good</option></select></label><label>Effect Speed<input data-nx="effect" type="number" min=".25" max="4" step=".05"></label><label>Guide<select data-nx="guide"><option value="0.5">Low</option><option value="1">Normal</option><option value="2">High</option></select></label><label>Fake<select data-nx="fake"><option value="false">Show</option><option value="true">Hide</option></select></label><label>Timescale<select data-nx="ts"><option value="false">On</option><option value="true">Off</option></select></label><label>Alt Curve<select data-nx="curve"><option value="false">Off</option><option value="true">On</option></select></label>';
 box.appendChild(d);
 const sync=()=>{for(const [k,v] of Object.entries({score:N.scoreMode,life:N.initialLife,haptic:N.haptic,effect:N.effectAnimationSpeed,guide:N.guideQuality,fake:String(N.disableFakeNotes),ts:String(N.disableTimescale),curve:String(N.alternativeCurve)})){const el=d.querySelector('[data-nx="'+k+'"]');if(el)el.value=String(v)}};
 d.querySelectorAll("[data-nx]").forEach(el=>el.addEventListener("change",()=>{const k=el.dataset.nx;if(k==="score")N.scoreMode=el.value;if(k==="life"){N.initialLife=Math.max(1,+el.value||1000);N.maxLife=N.initialLife;E.life=N.initialLife}if(k==="haptic")N.haptic=el.value;if(k==="effect")N.effectAnimationSpeed=clamp(+el.value||1,.25,4);if(k==="guide")N.guideQuality=+el.value;if(k==="fake")N.disableFakeNotes=el.value==="true";if(k==="ts")N.disableTimescale=el.value==="true";if(k==="curve")N.alternativeCurve=el.value==="true";localStorage.setItem("pjsekai-next-options",JSON.stringify({scoreMode:N.scoreMode,initialLife:N.initialLife,haptic:N.haptic,effectAnimationSpeed:N.effectAnimationSpeed,guideQuality:N.guideQuality,disableFakeNotes:N.disableFakeNotes,disableTimescale:N.disableTimescale,alternativeCurve:N.alternativeCurve});reset();sync()}));sync();
}
function reset(){
 E.running=false;cancelAnimationFrame(E.raf);E.score=0;E.combo=0;E.maxCombo=0;E.life=N.initialLife;E.maxLife=N.maxLife;E.counts={perfect:0,great:0,good:0,bad:0,miss:0};E.effects=[];E.judgeSamples=[];E.lastJudge="READY";N.replay=[];N.judgments=[];N.progress=[];N.pending.clear();N.finished=false;
 for(const n of E.notes||[]){n.hit=false;n.missed=false;n.active=false;n.tailHit=false;n.damageResolved=false;n.tickIndex=0;n.tickTimes=makeTicks(n);n.traceArmed=false;n.traceWrongSeen=false}
 E.render?.();
}
function applyOptions(o){
 if(!o)return;N.guideQuality=Number(o.guideQuality??N.guideQuality);N.noteMargin=Number(o.noteMargin??N.noteMargin);N.alternativeCurve=!!o.alternativeCurve;N.disableTimescale=!!o.disableTimescale;N.disableFakeNotes=!!o.disableFakeNotes;N.effectAnimationSpeed=Number(o.effectAnimationSpeed??N.effectAnimationSpeed);N.downFlick=o.downFlick!==false;N.scoreMode=o.scoreMode||N.scoreMode;N.initialLife=Math.max(1,Number(o.initialLife)||N.initialLife);N.maxLife=N.initialLife;N.haptic=o.haptic||N.haptic;
}
function loadNormalized(input){
 const a=window.PJSekaiNextSekaiAdapter?.normalize(input);if(!a)return;
 E.notes=(a.notes||[]).map((n,i)=>({...n,id:n.id??i,tickTimes:Array.isArray(n.tickTimes)?n.tickTimes.slice():[],tickIndex:0,hit:false,missed:false,active:false}));
 E.bpm=a.bpm||120;E.chartName=a.title||"Imported Chart";E.artist=a.artist||"";E.timescaleGroups=a.timescaleGroups||{"0":a.timescales||[]};E.timescaleEvents=a.timescales||[];E.duration=Math.max(1,...E.notes.map(n=>n.time+(n.duration||0)))+2;applyOptions(a.options);reset();
}
function install(){
 const oldInit=E.init,oldImport=E.importChart,oldLoad=E.loadJSON,oldDemo=E.demo;
 E.touchDown=onDown;E.track=(n,p,e)=>{if(p)onMove(e)};E.release=onUp;E.flickAt=(e,p)=>resolveFlick(e,p||N.touchHistory.get(e.pointerId)||{});E.judgeNote=(n)=>{return n?.hit===true};
 E.isFlick=n=>{const i=classify(n||{});return i.type==="flick"||i.type==="trace-flick"};
 E.resetJudgments=reset;E.reset=reset;E.finish=finish;E.render=render;E.loop=function(){if(!this.running)return;processFrame();render();this.raf=requestAnimationFrame(()=>this.loop())};
 E.loadJSON=function(input){loadNormalized(input)};
 E.importChart=function(text,name="chart.json"){try{const t=String(text).trim();if(t.startsWith("{")||t.startsWith("["))loadNormalized(JSON.parse(t));else oldImport.call(this,text,name)}catch(err){console.error(err);alert("譜面格式無法解析："+err.message)}};
 E.demo=function(){oldDemo.call(this);for(const n of E.notes||[])n.tickTimes=makeTicks(n);reset()};
 E.init=function(){oldInit.call(this);addControls()};
 const audio=E.audio;
 if(audio){audio.addEventListener("play",()=>{N.finished=false});audio.addEventListener("pause",()=>{})}
 const stage=E.stage;
 if(stage&&!stage._nextUnifiedInput){
  stage._nextUnifiedInput=true;stage.style.touchAction="none";
  stage.addEventListener("pointerdown",e=>{try{stage.setPointerCapture?.(e.pointerId)}catch{};onDown(e)},true);
  stage.addEventListener("pointermove",onMove,true);
  stage.addEventListener("pointerup",onUp,true);
  stage.addEventListener("pointercancel",e=>{N.pending.delete(e.pointerId);N.touchHistory.delete(e.pointerId)},true);
 }
 addControls();
}
if(document.readyState==="loading")addEventListener("DOMContentLoaded",()=>install(),{once:true});else install();
window.PJSekaiNextSekaiFinal=N;
})();