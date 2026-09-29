/* Project SEKAI / Next-SEKAI parity layer
 * Public-engine-inspired browser runtime. No proprietary assets are bundled.
 * Adds note taxonomy, tick generation, weighted scoring, life, release/flick semantics,
 * haptics, scheduled WebAudio feedback, and deterministic replay state.
 */
(()=>{"use strict";
const E=window.PJSekaiWebDojo;if(!E)return;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const now=()=>performance.now()/1000;
const oldLoadJSON=E.loadJSON.bind(E),oldDemo=E.demo.bind(E),oldAward=E.award.bind(E),oldUpdateMisses=E.updateMisses.bind(E),oldJudge=E.judgeNote.bind(E),oldRelease=E.release.bind(E);
E.life=1000;E.maxLife=1000;E.perfects=0;E.greats=0;E.goods=0;E.bads=0;E.misses=0;E.noteIndex=0;E.inputHistory=[];E.replay=[];
E.weights={tap:10,criticalTap:20,flick:10,criticalFlick:30,trace:1,criticalTrace:2,traceFlick:10,criticalTraceFlick:30,release:10,criticalRelease:20,tick:1,damage:1};
E.windows={...E.windows,perfect:41.667,great:83.333,good:108.333,bad:125,trace:83.333,flickPerfect:41.667,flickGreatLate:125,flickGoodLate:133.333,flickBadLate:141.667,slideEndPerfect:58.333,slideEndGreatLate:133.333,slideEndGoodLate:141.667};
E.ensureParityHud=function(){
 const h=this.stage?.querySelector(".pjsk-hud");if(!h)return;
 if(!h.querySelector("#pjskLife"))h.insertAdjacentHTML("afterbegin",'<div><small>LIFE</small><strong id="pjskLife">1000</strong></div>');
};
E.updateParityHud=function(){
 const x=this.stage?.querySelector("#pjskLife");if(x)x.textContent=Math.max(0,Math.round(this.life));
};
E.damageLife=function(n){
 const d=n?.isTick||n?.type==="tick"||n?.type==="damage-tick"?40:80;
 this.life=Math.max(0,this.life-d);
 if(this.life<=0)this.finish?.();
};
E.resetParity=function(){
 this.life=this.maxLife;this.noteIndex=0;this.inputHistory=[];this.replay=[];
 this.notes.forEach(n=>{n.hit=false;n.missed=false;n.active=false;n.headHit=false;n.tailHit=false;n.judgedTicks=-1;n.tickTimes=[];n.tickIndex=0;n.inputIds=[];});
 this.updateParityHud();
};
E.makeTicks=function(n){
 if(!n.duration||n.duration<=0)return;
 const step=Math.max(1/30,60/Math.max(1,this.bpm)/4);
 n.tickTimes=[];
 for(let t=step;t<n.duration-0.001;t+=step)n.tickTimes.push(n.time+t);
 n.tickIndex=0;n.judgedTicks=-1;
};
E.weight=function(n){
 const t=String(n.type||"tap").toLowerCase(),c=!!n.critical;
 if(n.damage||t==="damage"||t==="damage-tick")return this.weights.damage;
 if(t.includes("trace-flick"))return c?this.weights.criticalTraceFlick:this.weights.traceFlick;
 if(t.includes("trace"))return c?this.weights.criticalTrace:this.weights.trace;
 if(t.includes("flick"))return c?this.weights.criticalFlick:this.weights.flick;
 if(t.includes("release")||t.includes("tail"))return c?this.weights.criticalRelease:this.weights.release;
 return c?this.weights.criticalTap:this.weights.tap;
};
E.parityJudgment=function(j,n){
 const mult={perfect:1,great:.7,good:.5,bad:0}[j]??0;
 const comboBonus=mult&&this.combo>0?Math.min(1+Math.floor(this.combo/100)*.1,2):1;
 this.score+=this.weight(n)*mult*10*comboBonus;
 if(j==="perfect")this.perfects++;else if(j==="great")this.greats++;else if(j==="good")this.goods++;else if(j==="bad")this.bads++;
 if(j==="bad"){this.combo=0;this.damageLife(n)}else this.combo++;
 this.maxCombo=Math.max(this.maxCombo,this.combo);
};
E.award=function(j,n){
 this.parityJudgment(j,n);
 this.counts[j]=(this.counts[j]||0)+1;
 this.lastJudge=j.toUpperCase();
 const delta=(this.time()*1000+this.offset)-n.time*1000;
 this.judgeSamples.push(delta);
 this.replay.push({t:Math.round(this.time()*1000)/1000,id:n.id,j,delta:Math.round(delta*100)/100});
 this.effects.push({lane:n.lane,kind:j,critical:n.critical,life:.45,max:.45,spawn:now(),seed:(n.id*1.618)%6.283});
 this.effects.push({lane:n.lane,kind:"slot",critical:n.critical,life:.35,max:.35,spawn:now()});
 this.effects.push({lane:n.lane,kind:"lane",critical:n.critical,life:.5,max:.5,spawn:now()});
 this.sfx(j);
 if(n.type==="damage"||n.damage)this.damageLife(n);
};
E.judgeNote=function(n,lane,dx,dy,p,e){
 if(n.fake)return false;
 if(n.damage){n.hit=true;n.missed=false;this.combo=0;this.counts.miss++;this.lastJudge="DAMAGE";this.damageLife(n);this.sfx("miss");return true}
 const hit=oldJudge(n,lane,dx,dy,p,e);if(hit){n.inputIds=n.inputIds||[];n.inputIds.push(p?.id??0);return true}
 return false;
};
E.release=function(n,p,e){
 if(n?.fake)return;
 const before=n?.tailHit;
 oldRelease(n,p,e);
 if(n&&!before&&n.tailHit){
  const j=Math.abs((this.time()-n.holdUntil)*1000)<=this.windows.slideEndPerfect?"perfect":"great";
  n.tailJudgment=j;
 }
};
E.processTicks=function(){
 const t=this.time();
 for(const n of this.notes){
  if(!n.active||!n.tickTimes?.length)continue;
  while(n.tickIndex<n.tickTimes.length&&t+this.offset/1000>=n.tickTimes[n.tickIndex]){
   const tt=n.tickTimes[n.tickIndex++],lane=this.slideLaneAt(n,tt);
   const p=this.pointers&&[...this.pointers.values()][0];
   const held=p?Math.abs(this.pointerLane(p.event||p)-lane)<=1.35:false;
   if(held||n.type.startsWith("trace")){
    n.judgedTicks++;
    this.score+=this.weight({...n,type:"tick"})*10;
    this.effects.push({lane,kind:"trace",life:.2,max:.2,spawn:now(),seed:n.id+n.tickIndex});
    this.sfx("tick");
   }else if(n.type==="hold"||n.type==="slide"){
    this.damageLife({...n,isTick:true});this.combo=0;
   }
  }
 }
};
E.loop=function(){if(!this.running)return;this.processTicks();this.updateMisses();if(this.autoplay)this.autoPlay();this.render();this.updateParityHud();this.raf=requestAnimationFrame(()=>this.loop())};
E.reset=function(){
 this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;
 this.score=0;this.combo=0;this.maxCombo=0;this.counts={perfect:0,great:0,good:0,bad:0,miss:0};this.lastJudge="READY";
 this.judgeSamples=[];this.effects=[];this.resetParity();this.updateHud?.();this.updateParityHud?.();
};
E.loadJSON=function(input){
 oldLoadJSON(input);
 this.notes.forEach(n=>{
  const t=String(n.type||"tap").toLowerCase();
  if(t==="critical")n.critical=true;
  if(/trace.?flick/.test(t))n.type="trace-flick";
  else if(/flick/.test(t)&&!t.includes("trace"))n.type="flick";
  else if(/damage/.test(t))n.type="damage";
  else if(/fake/.test(t))n.fake=true;
  else if(/hold/.test(t))n.type="hold";
  else if(/slide/.test(t))n.type="slide";
  else if(/trace/.test(t))n.type="trace";
  else n.type="tap";
  this.makeTicks(n);
 });
 this.resetParity();this.ensureParityHud();this.updateParityHud();
};
E.demo=function(){oldDemo();this.notes.forEach(n=>this.makeTicks(n));this.resetParity();this.ensureParityHud();this.updateParityHud();};
E.bindParityInput=function(){
 if(this._parityBound)return;this._parityBound=true;
 this.canvas?.addEventListener("pointermove",e=>this.inputHistory.push({t:performance.now(),type:"move",x:e.clientX,y:e.clientY,p:e.pointerId}));
 this.canvas?.addEventListener("pointerup",e=>this.inputHistory.push({t:performance.now(),type:"up",x:e.clientX,y:e.clientY,p:e.pointerId}));
};
const init=E.init.bind(E);
E.init=function(){init();this.ensureParityHud();this.bindParityInput();this.updateParityHud();};
if(document.readyState==="loading")addEventListener("DOMContentLoaded",()=>setTimeout(()=>{E.ensureParityHud();E.bindParityInput();},0));else setTimeout(()=>{E.ensureParityHud();E.bindParityInput();},0);
window.PJSekaiParity={engine:E,version:"1.0.0",noteKinds:["NORM_TAP","CRIT_TAP","NORM_FLICK","CRIT_FLICK","NORM_TRACE","CRIT_TRACE","NORM_TRACE_FLICK","CRIT_TRACE_FLICK","NORM_RELEASE","CRIT_RELEASE","NORM_TICK","CRIT_TICK","HIDE_TICK","DAMAGE","HIDE_DAMAGE_TICK","ANCHOR"]};
})();