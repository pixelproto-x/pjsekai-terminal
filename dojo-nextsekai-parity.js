/* Next-SEKAI parity layer — browser-side behavioral model.
 * Mirrors the public Next-SEKAI/Sonolus concepts: buckets, input interval,
 * note state, score modes, life, multi-timescale, damage, flick direction,
 * replay/progress and effect controls. Proprietary assets are intentionally
 * not bundled.
 */
(()=>{"use strict";
const E=window.PJSekaiWebDojo;if(!E)return;
const MS=1000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const frame=1/60;
const modes={WEIGHTED_COMBO:"weighted-combo",WEIGHTED_FLAT:"weighted-flat",UNWEIGHTED_FLAT:"unweighted-flat",UNWEIGHTED_COMBO:"unweighted-combo"};
E.nextSekai={
 version:"4.0.0",scoreMode:modes.WEIGHTED_COMBO,initialLife:1000,maxLife:1000,
 inputOffset:0,windowScale:1,effectAnimationSpeed:1,markerAnimation:true,
 noteEffectEnabled:true,laneEffectEnabled:true,slotEffectEnabled:true,sfxEnabled:true,
 vibrateMode:"tap",disableFakeNotes:false,disableTimescale:false,
 guideQuality:2,noteMargin:1,alternativeCurve:false,downFlick:true,
 progress:[],judgments:[],activeTouches:new Map(),pendingReleases:new Map()
};
const N=E.nextSekai;
N.weight=k=>({tap:10,flick:10,trace:1,"trace-flick":10,release:10,hold:10,slide:10,tick:1,damage:1}[k]||10);
N.criticalWeight=k=>({tap:20,flick:30,trace:2,"trace-flick":30,release:20,hold:20,slide:20,tick:1,damage:1}[k]||20);
N.info=n=>{
 const raw=String(n.kind||n.noteKind||n.type||"NORM_TAP").toUpperCase().replace(/[ -]/g,"_");
 const type=E.classify?E.classify(n):String(n.type||"tap");
 return {raw,type,critical:/^CRIT_/.test(raw)||!!n.critical,fake:!!n.fake||raw==="FAKE",damage:!!n.damage||/DAMAGE/.test(raw),hidden:/^HIDE_/.test(raw),head:/_HEAD_/.test(raw),tail:/_TAIL_/.test(raw),anchor:raw==="ANCHOR"};
};
N.windows={
 tap:{p:[-2.5,2.5],g:[-5,5],good:[-6.5,6.5],bad:[-7.5,7.5]},
 criticalTap:{p:[-3.3,3.3],g:[-4.5,4.5],good:[-6.5,6.5],bad:[-7.5,7.5]},
 flick:{p:[-2.5,2.5],g:[-6.5,7.5],good:[-7,8],bad:[-7.5,8.5]},
 criticalFlick:{p:[-3.5,3.5],g:[-6.5,7.5],good:[-7,8],bad:[-7.5,8.5]},
 trace:{p:[-5,5],g:[-5,5],good:[-5,5],bad:[-5,5]},
 traceFlick:{p:[-6.5,7.5],g:[-6.5,7.5],good:[-6.5,7.5],bad:[-6.5,7.5]},
 slide:{p:[-3.5,4],g:[-6.5,8],good:[-7.5,8.5],bad:[-8.5,9]},
 slideTrace:{p:[-6.5,8],g:[-6.5,8],good:[-6.5,8],bad:[-6.5,8]}
};
N.window=n=>{
 const i=N.info(n);
 if(i.type==="flick")return i.critical?N.windows.criticalFlick:N.windows.flick;
 if(i.type==="trace-flick"||i.type==="tail-flick")return N.windows.traceFlick;
 if(i.type==="trace"||i.type==="tail-trace")return i.tail?N.windows.slideTrace:N.windows.trace;
 if(i.type==="hold"||i.type==="slide"||i.type==="release"||i.type==="tail")return N.windows.slide;
 return i.critical?N.windows.criticalTap:N.windows.tap;
};
N.judge=(delta,n)=>{
 const w=N.window(n),d=delta/N.windowScale;
 if(d>=w.p[0]&&d<=w.p[1])return"perfect";
 if(d>=w.g[0]&&d<=w.g[1])return"great";
 if(d>=w.good[0]&&d<=w.good[1])return"good";
 return null;
};
N.badWindow=n=>N.window(n).bad[1]*N.windowScale;
N.inputInterval=n=>N.badWindow(n)+Math.max(0,N.inputOffset);
N.scoreMultiplier=j=>{
 if(N.scoreMode===modes.WEIGHTED_FLAT||N.scoreMode===modes.UNWEIGHTED_FLAT)
  return {perfect:3,great:2,good:1,bad:0}[j]||0;
 return {perfect:1,great:.7,good:.5,bad:0}[j]||0;
};
N.noteWeight=n=>{
 const i=N.info(n);
 return N.scoreMode===modes.UNWEIGHTED_COMBO||N.scoreMode===modes.UNWEIGHTED_FLAT?10:(i.critical?N.criticalWeight(i.type):N.weight(i.type));
};
N.comboBonus=()=>{
 if(N.scoreMode!==modes.WEIGHTED_COMBO&&N.scoreMode!==modes.UNWEIGHTED_COMBO)return 0;
 return Math.min(1000,Math.floor((E.combo||0)/100))*0.1;
};
N.flickDirection=dir=>{
 const d=Number(dir)||0;
 return ["up","down","left","right","up-left","up-right","down-left","down-right"][d]||"up";
};
N.directionVector=dir=>{
 const m={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],"up-left":[-.707,-.707],"up-right":[.707,-.707],"down-left":[-.707,.707],"down-right":[.707,.707]};
 return m[N.flickDirection(dir)]||[0,-1];
};
N.flickOK=(n,dx,dy)=>{
 if(Math.hypot(dx,dy)<14)return false;
 let vx=dx,vy=dy;
 if(E.mirror)vx=-vx;
 const len=Math.hypot(vx,vy);vx/=len;vy/=len;
 let want=N.directionVector(n.dir);
 if(!N.downFlick&&want[1]>0)return false;
 return vx*want[0]+vy*want[1]>=Math.cos(75*Math.PI/180);
};
N.score=(j,n)=>{
 const i=N.info(n);if(i.fake||i.anchor)return;
 const w=N.noteWeight(n),m=N.scoreMultiplier(j);
 let comboFactor=1;
 if(N.scoreMode===modes.WEIGHTED_COMBO||N.scoreMode===modes.UNWEIGHTED_COMBO)
   comboFactor=1+N.comboBonus();
 E.score+=Math.round(w*10*m*comboFactor);
};
N.lifeDelta=(j,n)=>{
 const i=N.info(n);
 if(j==="miss"||j==="bad")return -(i.type==="tick"||i.damage||i.hidden?-40:-80);
 return 0;
};
N.record=(j,n,delta)=>{
 N.judgments.push({id:n.id,time:E.time(),delta,judgment:j,lane:n.lane,critical:N.info(n).critical});
 E.judgmentAccuracy=N.judgments;
 E.replay=E.replay||[];
 E.replay.push({id:n.id,t:E.time(),delta,j,lane:n.lane});
};
N.hit=(j,n,delta)=>{
 const i=N.info(n);if(i.fake||i.anchor)return;
 E.counts[j]=(E.counts[j]||0)+1;
 if(j==="bad"){E.combo=0}else if(j!=="miss"){E.combo++;E.maxCombo=Math.max(E.maxCombo,E.combo)}
 N.score(j,n);
 E.life=clamp(E.life+N.lifeDelta(j,n),0,N.maxLife);
 E.lastJudge=j.toUpperCase();
 N.record(j,n,delta);
 if(E.effects){
  const now=performance.now()/1000,base={spawn:now,max:.45,life:.45,lane:n.lane,critical:i.critical,seed:(n.id||0)*.37};
  if(N.noteEffectEnabled)E.effects.push({...base,kind:j});
  if(N.slotEffectEnabled)E.effects.push({...base,kind:"slot",max:.35,life:.35});
  if(N.laneEffectEnabled)E.effects.push({...base,kind:"lane",max:.5,life:.5});
 }
 if(E.sfx&&N.sfxEnabled)E.sfx(i.type.includes("flick")?"flick":j);
 if(E.haptic&&N.vibrateMode!=="off")E.haptic(j,n);
};
N.resetNote=n=>{
 n.hit=false;n.missed=false;n.active=false;n.tailHit=false;n.headHit=false;n.tickIndex=0;n.tickTimes=[];
 const i=N.info(n);
 if(!i.fake&&!i.damage&&!i.anchor&&n.duration>0){
   const bpm=Math.max(1,E.bpm||120),step=60/bpm/2;
   for(let t=step;t<n.duration-0.0001;t+=step)n.tickTimes.push(n.time+t);
 }
};
N.findCandidates=(lane,now)=>{
 const out=[];
 for(const n of E.notes||[]){
  const i=N.info(n);if(n.hit||n.missed||i.fake||i.anchor||i.hidden)continue;
  if(i.damage)continue;
  const nl=E.mirror?11-n.lane:n.lane;
  const width=Math.max(1,Number(n.width)||1);
  if(Math.abs(nl-lane)>width/2+1.25)continue;
  const d=now*MS+N.inputOffset-n.time*MS;
  if(Math.abs(d)<=N.inputInterval(n))out.push({n,d,abs:Math.abs(d)});
 }
 out.sort((a,b)=>a.abs-b.abs);return out;
};
N.choose=(lane,now)=>N.findCandidates(lane,now)[0]?.n||null;
N.applyTimescale=()=>{
 if(N.disableTimescale||E.disableTimescale)return;
 E.timescaleGroups=E.timescaleGroups||new Map();
 for(const n of E.notes||[])if(Number.isFinite(n.timescaleGroup))E.timescaleGroups.set(n.timescaleGroup,true);
};
N.progressTick=()=>{
 const d=Math.max(0,E.duration||1),t=clamp(E.time()/d,0,1);
 N.progress.push({t,time:E.time(),combo:E.combo,score:E.score,life:E.life});
 if(N.progress.length>1800)N.progress.shift();
};
N.damageCheck=()=>{
 const now=E.time()*MS+N.inputOffset;
 for(const n of E.notes||[]){
  const i=N.info(n);if(!i.damage||n.missed)continue;
  const w=N.badWindow(n);
  if(now-n.time*MS>w){n.missed=true;continue}
  if(now>=n.time-N.windowScale*.005&&now<=n.time+w){
    n.missed=true;E.life=clamp(E.life-40,0,N.maxLife);E.combo=0;E.counts.bad=(E.counts.bad||0)+1;E.lastJudge="DAMAGE";E.sfx?.("miss");
  }
 }
};
N.patch=()=>{
 E.maxLife=N.maxLife;E.life=N.initialLife;
 const oldReset=E.reset;
 E.reset=function(){oldReset.call(this);this.maxLife=N.maxLife;this.life=N.initialLife;N.progress=[];N.judgments=[];for(const n of this.notes||[])N.resetNote(n);N.applyTimescale()};
 const oldLoad=E.loadJSON;
 E.loadJSON=function(input){oldLoad.call(this,input);N.applyTimescale();for(const n of this.notes||[])N.resetNote(n)};
 const oldDemo=E.demo;
 E.demo=function(){oldDemo.call(this);for(const n of this.notes||[])N.resetNote(n)};
 const oldLoop=E.loop;
 E.loop=function(){
  if(!this.running)return;
  N.damageCheck();N.progressTick();
  oldLoop.call(this);
 };
 const oldFind=E.findHead;
 E.findHead=function(lane){
  const n=N.choose(lane,this.time());return n||oldFind.call(this,lane);
 };
 const oldJudge=E.judgeNote;
 E.judgeNote=function(n,lane,dx,dy,p,e){
  const i=N.info(n);if(i.fake||i.anchor)return false;
  if(i.damage){N.damageCheck();return true}
  const delta=(this.time()*MS+N.inputOffset)-n.time*MS;
  const j=N.judge(delta,n);
  if(!j)return false;
  if((i.type==="flick"||i.type==="trace-flick"||i.type==="tail-flick")&&!N.flickOK(n,dx,dy))return false;
  n.hit=true;n.active=n.duration>0||["hold","slide","trace","trace-flick"].includes(i.type);n.hitAt=this.time();n.holdUntil=n.time+(n.duration||0);
  N.hit(j,n,delta);if(p)p.note=n;return true;
 };
 const oldRelease=E.release;
 E.release=function(n,p,e){
  if(!n)return;
  const i=N.info(n);
  if(!n.active){oldRelease.call(this,n,p,e);return}
  const delta=(this.time()*MS+N.inputOffset)-(n.time+(n.duration||0))*MS;
  const w=(i.type==="trace"||i.type==="tail-trace")?N.windows.slideTrace:N.windows.slide;
  let j=null;
  if(delta>=w.p[0]&&delta<=w.p[1])j="perfect";
  else if(delta>=w.g[0]&&delta<=w.g[1])j="great";
  else if(delta>=w.good[0]&&delta<=w.good[1])j="good";
  if(!j){this.failRelease?.(n);return}
  if((i.type==="flick"||i.type==="tail-flick")&&!N.flickOK(n,(e?.clientX||0)-(p?.downX||0),(e?.clientY||0)-(p?.downY||0)))return this.failRelease?.(n);
  n.active=false;n.tailHit=true;N.hit(j,{...n,id:String(n.id)+":tail",time:n.time+(n.duration||0)},delta);
 };
 const oldMiss=E.updateMisses;
 E.updateMisses=function(){
  const now=this.time()*MS+N.inputOffset;
  for(const n of this.notes||[]){
   const i=N.info(n);if(n.hit||n.missed||i.fake||i.anchor)continue;
   if(now-n.time*MS>N.badWindow(n)){n.missed=true;E.combo=0;E.counts.miss=(E.counts.miss||0)+1;E.life=clamp(E.life-(i.type==="tick"||i.damage?40:80),0,E.maxLife);E.lastJudge="MISS";N.record("miss",n,now-n.time*MS);E.sfx?.("miss")}
  }
  oldMiss.call(this);
 };
 const oldTick=E.processTicks;
 E.processTicks=function(){
  oldTick.call(this);
  const now=this.time();
  for(const n of this.notes||[]){
   if(!n.active||!n.tickTimes)continue;
   while(n.tickIndex<n.tickTimes.length&&now+N.inputOffset/MS>=n.tickTimes[n.tickIndex]){
    const tickTime=n.tickTimes[n.tickIndex++],lane=this.slideLaneAt(n,tickTime);
    let held=false;
    for(const p of this.pointers.values()){const pl=this.laneFromEvent({clientX:p.x,clientY:p.y});if(Math.abs(pl-(this.mirror?11-lane:lane))<=Math.max(1.25,(n.width||1)/2)){held=true;break}}
    if(held||N.info(n).type.startsWith("trace")){E.score+=10;E.counts.perfect=(E.counts.perfect||0)+1;E.sfx?.("tick")}
    else{E.life=clamp(E.life-40,0,E.maxLife);E.combo=0;E.counts.miss=(E.counts.miss||0)+1}
   }
  }
 };
};
N.patch();
window.PJSekaiNextSekaiParity=N;
})();