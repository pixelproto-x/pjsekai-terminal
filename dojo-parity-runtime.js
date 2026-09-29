/* PJSekai Web Dojo — high-fidelity gameplay runtime
 * Browser implementation of the public Next-SEKAI/Sonolus gameplay model.
 * Timing/score/life semantics follow the published engine source where practical.
 * Proprietary Project SEKAI assets/audio are not redistributed.
 */
(()=>{"use strict";
const E=window.PJSekaiWebDojo;if(!E)return;
const MS=1000,C=(v,a,b)=>Math.max(a,Math.min(b,v)),rad=Math.PI/180;
const K={
 NORM_TAP:"tap",CRIT_TAP:"tap",NORM_FLICK:"flick",CRIT_FLICK:"flick",
 NORM_TRACE:"trace",CRIT_TRACE:"trace",NORM_TRACE_FLICK:"trace-flick",CRIT_TRACE_FLICK:"trace-flick",
 NORM_RELEASE:"release",CRIT_RELEASE:"release",NORM_HEAD_TAP:"tap",CRIT_HEAD_TAP:"tap",
 NORM_HEAD_FLICK:"flick",CRIT_HEAD_FLICK:"flick",NORM_HEAD_TRACE:"trace",CRIT_HEAD_TRACE:"trace",
 NORM_HEAD_TRACE_FLICK:"trace-flick",CRIT_HEAD_TRACE_FLICK:"trace-flick",NORM_HEAD_RELEASE:"release",CRIT_HEAD_RELEASE:"release",
 NORM_TAIL_TAP:"tail",CRIT_TAIL_TAP:"tail",NORM_TAIL_FLICK:"tail-flick",CRIT_TAIL_FLICK:"tail-flick",
 NORM_TAIL_TRACE:"tail-trace",CRIT_TAIL_TRACE:"tail-trace",NORM_TAIL_TRACE_FLICK:"tail-trace-flick",CRIT_TAIL_TRACE_FLICK:"tail-trace-flick",
 NORM_TAIL_RELEASE:"release",CRIT_TAIL_RELEASE:"release",NORM_TICK:"tick",CRIT_TICK:"tick",
 HIDE_TICK:"hidden-tick",DAMAGE:"damage",HIDE_DAMAGE_TICK:"hidden-damage-tick",ANCHOR:"anchor"
};
const old={award:E.award,judge:E.judgeNote,release:E.release,reset:E.reset,loadJSON:E.loadJSON,demo:E.demo,loop:E.loop};
E.maxLife=1000;E.life=1000;E.judgmentAccuracy=[];E.replay=[];
E.noteWeights={tap:10,criticalTap:20,flick:10,criticalFlick:30,trace:1,criticalTrace:2,traceFlick:10,criticalTraceFlick:30,release:10,criticalRelease:20,tick:1,damage:1};
E.judgmentWindows={
 tap:{perfect:[-2.5,2.5],great:[-5,5],good:[-6.5,6.5],bad:[-7.5,7.5]},
 criticalTap:{perfect:[-3.3,3.3],great:[-4.5,4.5],good:[-6.5,6.5],bad:[-7.5,7.5]},
 flick:{perfect:[-2.5,2.5],great:[-6.5,7.5],good:[-7,8],bad:[-7.5,8.5]},
 criticalFlick:{perfect:[-3.5,3.5],great:[-6.5,7.5],good:[-7,8],bad:[-7.5,8.5]},
 trace:{perfect:[-5,5],great:[-5,5],good:[-5,5],bad:[-5,5]},
 traceFlick:{perfect:[-6.5,7.5],great:[-6.5,7.5],good:[-6.5,7.5],bad:[-6.5,7.5]},
 slide:{perfect:[-3.5,4],great:[-6.5,8],good:[-7.5,8.5],bad:[-8.5,9]},
 slideTrace:{perfect:[-6.5,8],great:[-6.5,8],good:[-6.5,8],bad:[-6.5,8]}
};
E.lifeDamage={note:80,tick:40};
E.classify=function(n){
 const t=String(n.type||n.noteKind||n.kind||"tap").toLowerCase().replace(/_/g,"-");
 if(n.damage||t.includes("damage"))return"damage";
 if(n.fake||t==="fake")return"fake";
 if(t.includes("trace-flick"))return"trace-flick";
 if(t.includes("tail-flick"))return"tail-flick";
 if(t.includes("flick"))return"flick";
 if(t.includes("trace"))return"trace";
 if(t.includes("hold"))return"hold";
 if(t.includes("slide"))return"slide";
 if(t.includes("release"))return"release";
 return"tap";
};
E.kindInfo=function(n){
 const raw=String(n.kind||n.noteKind||n.type||"NORM_TAP").toUpperCase().replace(/[ -]/g,"_");
 const type=K[raw]||this.classify(n);
 const critical=/^CRIT_/.test(raw)||!!n.critical;
 return {raw,type,critical,fake:!!n.fake||raw==="FAKE",damage:!!n.damage||/DAMAGE/.test(raw),hidden:/^HIDE_/.test(raw),anchor:raw==="ANCHOR",head:/_HEAD_/.test(raw),tail:/_TAIL_/.test(raw)};
};
E.windowFor=function(n){
 const i=this.kindInfo(n);
 if(i.critical&&i.type==="tap")return this.judgmentWindows.criticalTap;
 if(i.critical&&i.type==="flick")return this.judgmentWindows.criticalFlick;
 if(i.type==="trace-flick"||i.type==="tail-flick")return i.critical?this.judgmentWindows.traceFlick:this.judgmentWindows.traceFlick;
 if(i.type==="trace"||i.type==="tail-trace")return i.tail?this.judgmentWindows.slideTrace:this.judgmentWindows.trace;
 if(i.type==="hold"||i.type==="slide"||i.type==="release"||i.type==="tail")return this.judgmentWindows.slide;
 return this.judgmentWindows.tap;
};
E.windowJudge=function(delta,n){
 const w=this.windowFor(n),d=delta/MS;
 if(d>=w.perfect[0]&&d<=w.perfect[1])return"perfect";
 if(d>=w.great[0]&&d<=w.great[1])return"great";
 if(d>=w.good[0]&&d<=w.good[1])return"good";
 return null;
};
E.makeTicks=function(n){
 const i=this.kindInfo(n);if(i.fake||i.damage||i.anchor||!n.duration||n.duration<=0)return;
 n.tickTimes=[];const bpm=Math.max(1,this.bpm||120),step=60/bpm/2;
 for(let t=step;t<n.duration-0.0005;t+=step)n.tickTimes.push(n.time+t);
 n.tickIndex=0;
};
E.noteValue=function(n){
 const i=this.kindInfo(n);
 if(i.damage||i.type==="tick"||i.hidden)return this.noteWeights.tick;
 if(i.critical){
  if(i.type==="flick"||i.type==="trace-flick"||i.type==="tail-flick")return this.noteWeights.criticalFlick;
  if(i.type==="trace"||i.type==="tail-trace")return this.noteWeights.criticalTrace;
  if(i.type==="release"||i.type==="tail")return this.noteWeights.criticalRelease;
  return this.noteWeights.criticalTap;
 }
 if(i.type==="flick"||i.type==="tail-flick")return this.noteWeights.flick;
 if(i.type==="trace"||i.type==="tail-trace")return this.noteWeights.trace;
 if(i.type==="trace-flick")return this.noteWeights.traceFlick;
 if(i.type==="release"||i.type==="tail")return this.noteWeights.release;
 return this.noteWeights.tap;
};
E.haptic=function(j,n){
 try{if(!navigator.vibrate)return;
  if(j==="miss")navigator.vibrate(45);
  else if(j==="good")navigator.vibrate(25);
  else if(j==="great"&&this.kindInfo(n).critical)navigator.vibrate(18);
  else if(j==="perfect"&&this.kindInfo(n).critical)navigator.vibrate(24);
 }catch{}
};
E.sfx=function(kind){
 this.ensureAudio?.();const a=this.audioCtx;if(!a)return;
 const t=a.currentTime,map={perfect:[920,.055],great:[700,.05],good:[540,.045],flick:[1120,.045],tick:[780,.025],miss:[170,.06],release:[640,.045]};
 const q=map[kind]||[620,.035],o=a.createOscillator(),g=a.createGain();o.type=kind==="flick"?"square":"triangle";
 o.frequency.setValueAtTime(q[0],t);o.frequency.exponentialRampToValueAtTime(Math.max(80,q[0]*.72),t+.075);
 g.gain.setValueAtTime(q[1],t);g.gain.exponentialRampToValueAtTime(.0001,t+.09);o.connect(g).connect(a.destination);o.start(t);o.stop(t+.1);
};
E.flickDirectionOK=function(n,dx,dy){
 const mag=Math.hypot(dx,dy);if(mag<14)return false;
 let a=Math.atan2(dy,dx)*180/Math.PI;if(a<0)a+=360;
 const wanted=[270,90,180,0,225,315,135,45][Number(n.dir)||0]??270;
 if(this.mirror){const map={0:270,1:90,2:0,3:180,4:315,5:225,6:45,7:135};a=360-a}
 let d=Math.abs(a-wanted);d=Math.min(d,360-d);return d<=75;
};
E.award=function(j,n){
 const i=this.kindInfo(n);if(i.fake||i.anchor)return;
 const weight=this.noteValue(n),mult={perfect:1,great:.7,good:.5,bad:0}[j]??0;
 this.counts[j]=(this.counts[j]||0)+1;
 this.score+=Math.round(weight*mult*10);
 if(j==="bad"){this.combo=0;this.life=Math.max(0,this.life-this.lifeDamage.note)}
 else{this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo)}
 this.lastJudge=j.toUpperCase();
 const delta=(this.time()*MS+this.offset)-n.time*MS;
 this.judgeSamples.push(delta);this.judgmentAccuracy.push({note:n.id,judgment:j,delta});
 this.replay.push({id:n.id,t:this.time(),j,delta,lane:n.lane});
 const now=performance.now()/1000;
 this.effects.push({lane:n.lane,kind:j,critical:i.critical,life:.45,max:.45,spawn:now,seed:(n.id||0)*.73});
 this.effects.push({lane:n.lane,kind:"slot",critical:i.critical,life:.35,max:.35,spawn:now,seed:(n.id||0)*.37});
 this.effects.push({lane:n.lane,kind:"lane",critical:i.critical,life:.5,max:.5,spawn:now,seed:(n.id||0)*.19});
 this.sfx(i.type.includes("flick")?"flick":j);this.haptic(j,n);
};
E.judgeNote=function(n,lane,dx,dy,p,e){
 const i=this.kindInfo(n);if(i.fake||i.anchor||n.hit||n.missed)return false;
 if(i.damage){n.hit=true;this.life=Math.max(0,this.life-this.lifeDamage.tick);this.combo=0;this.counts.bad=(this.counts.bad||0)+1;this.lastJudge="BAD";this.sfx("miss");this.haptic("miss",n);return true}
 const delta=(this.time()*MS+this.offset)-n.time*MS,w=this.windowFor(n);
 let j=this.windowJudge(delta,n);
 if(!j)return false;
 if(i.type==="flick"||i.type==="trace-flick"||i.type==="tail-flick"){
  if(!this.flickDirectionOK(n,dx,dy))return false;
 }
 n.hit=true;n.active=i.type==="hold"||i.type==="slide"||i.type.startsWith("trace")||i.type==="tail";
 n.hitAt=this.time();n.holdUntil=n.time+(n.duration||0);n.tickIndex=0;
 this.award(j,n);if(p)p.note=n;return true;
};
E.release=function(n,p,e){
 if(!n||!n.active)return;
 const i=this.kindInfo(n),now=this.time(),target=(n.time+(n.duration||0))*MS,delta=now*MS+this.offset-target;
 const w=i.type==="trace"||i.type==="tail-trace"?this.judgmentWindows.slideTrace:this.judgmentWindows.slide;
 const j=(delta>=w.perfect[0]&&delta<=w.perfect[1])?"perfect":(delta>=w.great[0]&&delta<=w.great[1])?"great":(delta>=w.good[0]&&delta<=w.good[1])?"good":null;
 if(!j){this.failRelease?.(n);return}
 if((i.type==="flick"||i.type==="tail-flick")&&!this.flickDirectionOK(n,(e?.clientX||0)-(p?.downX||0),(e?.clientY||0)-(p?.downY||0))){this.failRelease?.(n);return}
 n.tailHit=true;n.active=false;n.releasedAt=now;this.award(j,{...n,time:n.time+(n.duration||0),id:String(n.id)+":tail",critical:i.critical,type:i.type});
 this.sfx("release");
};
E.processTicks=function(){
 const t=this.time()+this.offset/MS;
 for(const n of this.notes||[]){
  if(!n.active||!n.tickTimes)continue;
  while(n.tickIndex<n.tickTimes.length&&t>=n.tickTimes[n.tickIndex]){
   const tt=n.tickTimes[n.tickIndex++],lane=this.slideLaneAt(n,tt),info=this.kindInfo(n);
   let held=false;
   for(const p of this.pointers.values()){const pl=this.laneFromEvent({clientX:p.x,clientY:p.y});if(Math.abs(pl-(this.mirror?11-lane:lane))<=1.25){held=true;break}}
   if(held||info.type.startsWith("trace")){
    this.score+=this.noteWeights.tick*10;this.sfx("tick");this.effects.push({lane,kind:"trace",life:.22,max:.22,spawn:performance.now()/1000,seed:(n.id||0)+n.tickIndex});
   }else{this.life=Math.max(0,this.life-this.lifeDamage.tick);this.combo=0}
  }
 }
};
E.updateMisses=function(){
 const now=this.time()*MS+this.offset;
 for(const n of this.notes||[]){
  if(n.hit||n.missed||n.fake||n.anchor)continue;
  const i=this.kindInfo(n),w=this.windowFor(n);
  const late=w.bad[1];
  if(now-n.time*MS>late){n.missed=true;this.counts.miss=(this.counts.miss||0)+1;this.combo=0;this.life=Math.max(0,this.life-(i.type==="tick"||i.damage?40:80));if(!i.hidden)this.lastJudge="MISS";this.sfx("miss");this.haptic("miss",n);this.effects.push({lane:n.lane,kind:"miss",life:.45,max:.45,spawn:performance.now()/1000,seed:n.id||0})}
 }
};
E.renderParityHud=function(){
 const h=this.stage?.querySelector(".pjsk-hud");if(!h)return;
 let life=h.querySelector(".pjsk-life");if(!life){life=document.createElement("div");life.className="pjsk-life";life.innerHTML="<small>LIFE</small><strong></strong>";h.appendChild(life)}
 life.querySelector("strong").textContent=String(Math.round(this.life));
 let rank=h.querySelector(".pjsk-rank");if(!rank){rank=document.createElement("div");rank.className="pjsk-rank";h.appendChild(rank)}
 const m=this.counts||{};rank.textContent=`P ${m.perfect||0} / G ${m.great||0} / GD ${m.good||0} / B ${m.bad||0} / M ${m.miss||0}`;
};
E.reset=function(){
 if(this.raf)cancelAnimationFrame(this.raf);this.running=false;this.score=0;this.combo=0;this.maxCombo=0;this.life=this.maxLife;
 this.counts={perfect:0,great:0,good:0,bad:0,miss:0};this.judgeSamples=[];this.judgmentAccuracy=[];this.replay=[];this.effects=[];
 for(const n of this.notes||[]){n.hit=false;n.missed=false;n.active=false;n.tailHit=false;n.tickIndex=0;this.makeTicks(n)}
 this.lastJudge="READY";this.render?.();this.renderParityHud?.();
};
E.loadJSON=function(input){
 old.loadJSON.call(this,input);
 for(const n of this.notes||[]){const i=this.kindInfo(n);n.type=i.type;if(i.critical)n.critical=true;this.makeTicks(n)}
 this.reset();this.renderParityHud();
};
E.demo=function(){
 old.demo.call(this);for(const n of this.notes||[])this.makeTicks(n);this.reset();this.renderParityHud();
};
E.loop=function(){
 if(!this.running)return;
 this.processTicks();this.updateMisses();if(this.autoplay)this.autoPlay?.();this.render();this.renderParityHud();
 this.raf=requestAnimationFrame(()=>this.loop());
};
E.initParity=function(){
 this.renderParityHud();const c=this.canvas;if(!c||c._parity)return;c._parity=true;
 c.addEventListener("pointermove",e=>{const p=this.pointers.get(e.pointerId);if(p){p.x=e.clientX;p.y=e.clientY}});
};
const oldInit=E.init.bind(E);E.init=function(){oldInit();this.initParity()};
if(document.readyState==="loading")addEventListener("DOMContentLoaded",()=>setTimeout(()=>E.initParity?.(),0));else setTimeout(()=>E.initParity?.(),0);
window.PJSekaiParity={version:"3.0.0",engine:E,NoteKind:K};
})();