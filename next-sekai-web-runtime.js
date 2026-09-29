/* Next-SEKAI Web Dojo Runtime v5
 * Behavioral browser port of the public Next-SEKAI/Sonolus model.
 * Implements note families, exact public timing windows, input intervals,
 * delayed/wrong-way flick resolution, active traces/slides/ticks, damage,
 * score modes, life, multi-timescale, options, replay/progress and effects.
 * Official proprietary game assets are not bundled.
 */
(()=>{"use strict";
const E=window.PJSekaiWebDojo;if(!E)return;
const MS=1000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TAU=Math.PI*2,RAD=Math.PI/180;
const F=n=>n/60*1000;
const W={
 tap:{p:[-F(2.5),F(2.5)],g:[-F(5),F(5)],good:[-F(6.5),F(6.5)],bad:[-F(7.5),F(7.5)]},
 criticalTap:{p:[-F(3.3),F(3.3)],g:[-F(4.5),F(4.5)],good:[-F(6.5),F(6.5)],bad:[-F(7.5),F(7.5)]},
 flick:{p:[-F(2.5),F(2.5)],g:[-F(6.5),F(7.5)],good:[-F(7),F(8)],bad:[-F(7.5),F(8.5)]},
 criticalFlick:{p:[-F(3.5),F(3.5)],g:[-F(6.5),F(7.5)],good:[-F(7),F(8)],bad:[-F(7.5),F(8.5)]},
 trace:{p:[-F(5),F(5)],g:[-F(5),F(5)],good:[-F(5),F(5)],bad:[-F(5),F(5)]},
 traceFlick:{p:[-F(6.5),F(7.5)],g:[-F(6.5),F(7.5)],good:[-F(6.5),F(7.5)],bad:[-F(6.5),F(7.5)]},
 slide:{p:[-F(3.5),F(4)],g:[-F(6.5),F(8)],good:[-F(7.5),F(8.5)],bad:[-F(8.5),F(8.5)]},
 slideTrace:{p:[-F(6.5),F(8)],g:[-F(6.5),F(8)],good:[-F(6.5),F(8)],bad:[-F(6.5),F(8)]}
};
const MODE={WEIGHTED_FLAT:"weighted-flat",WEIGHTED_COMBO:"weighted-combo",UNWEIGHTED_FLAT:"unweighted-flat",UNWEIGHTED_COMBO:"unweighted-combo"};
const DIR={UP_OMNI:[0,-1],DOWN_OMNI:[0,1],UP_LEFT:[-.707,-.707],UP_RIGHT:[.707,-.707],DOWN_LEFT:[-.707,.707],DOWN_RIGHT:[.707,.707]};
const GUIDE=["#61d7f0","#68e0ac","#ffe04e","#ff8b77","#c38dff","#ff77b9","#6da8ff","#ffffff"];
const SFX={tap:[640,"triangle"],critical:[920,"sine"],flick:[1180,"square"],trace:[780,"sine"],tick:[760,"triangle"],great:[690,"sine"],good:[540,"triangle"],miss:[180,"sawtooth"]};
const N=E.nextSekai||(E.nextSekai={});
Object.assign(N,{version:"5.1.0",scoreMode:N.scoreMode||MODE.WEIGHTED_COMBO,initialLife:N.initialLife||1000,maxLife:N.maxLife||1000,inputOffset:Number(N.inputOffset)||0,effectAnimationSpeed:Number(N.effectAnimationSpeed)||1,haptic:N.haptic||"disabled",sfxEnabled:true,noteEffectEnabled:true,laneEffectEnabled:true,slotEffectEnabled:true,disableFakeNotes:false,disableTimescale:false,downFlick:true,guideQuality:2,noteMargin:0,alternativeCurve:false,replay:[],progress:[],judgments:[],pending:new Map(),touches:new Map(),finished:false});
function info(n){
 const raw=String(n.kind||n.noteKind||n.type||"tap").toUpperCase().replace(/[ -]/g,"_");
 let type=String(n.type||"tap").toLowerCase();
 if(/DAMAGE/.test(raw)||n.damage)type="damage";
 else if(/FAKE/.test(raw)||n.fake)type="fake";
 else if(type==="trace-flick")type="trace-flick";
 else if(type.includes("trace"))type="trace";
 else if(type.includes("flick"))type="flick";
 else if(type.includes("hold"))type="hold";
 else if(type.includes("slide")||type.includes("release")||/_TAIL_/.test(raw)||/_HEAD_/.test(raw)&&n.duration>0)type="slide";
 return {raw,type,critical:/^CRIT_/.test(raw)||!!n.critical,fake:!!n.fake||/^FAKE/.test(raw)||N.disableFakeNotes,damage:!!n.damage||/DAMAGE/.test(raw),hidden:!!n.hidden||/^HIDE_/.test(raw),head:/_HEAD_/.test(raw),tail:/_TAIL_/.test(raw),anchor:raw==="ANCHOR"};
}
function win(n,tail=false){
 const i=info(n);
 if(tail)return i.type==="trace"||i.type==="trace-flick"?W.slideTrace:(i.type==="flick"?W.slide:W.slide);
 if(i.type==="flick")return i.critical?W.criticalFlick:W.flick;
 if(i.type==="trace-flick")return W.traceFlick;
 if(i.type==="trace")return W.trace;
 if(i.type==="hold"||i.type==="slide"||i.raw.includes("RELEASE"))return W.slide;
 return i.critical?W.criticalTap:W.tap;
}
function judge(delta,n,tail=false){
 const w=win(n,tail);
 if(delta>=w.p[0]&&delta<=w.p[1])return"perfect";
 if(delta>=w.g[0]&&delta<=w.g[1])return"great";
 if(delta>=w.good[0]&&delta<=w.good[1])return"good";
 if(delta>=w.bad[0]&&delta<=w.bad[1])return"bad";
 return null;
}
function targetTime(n){return E.reverse?(E.duration-n.time-(n.duration||0)):n.time}
function adjustedNow(){return (E.reverse?E.duration-E.time():E.time())*MS+N.inputOffset}
function deltaFor(n){return adjustedNow()-targetTime(n)*MS}
function inputInterval(n,tail=false){
 const w=win(n,tail);const t=tail?(n.time+(n.duration||0)):n.time;
 const target=E.reverse?E.duration-t:t;
 return {start:target*MS+w.bad[0]-N.inputOffset,end:target*MS+w.bad[1]-N.inputOffset};
}
function kindWeight(n){
 const i=info(n); if([MODE.UNWEIGHTED_FLAT,MODE.UNWEIGHTED_COMBO].includes(N.scoreMode))return 10;
 if(i.damage||i.hidden)return 1;
 if(i.critical)return i.type==="flick"||i.type==="trace-flick"?30:i.type==="trace"?2:i.type==="slide"||i.type==="hold"?20:20;
 return i.type==="flick"||i.type==="trace-flick"?10:i.type==="trace"?1:i.type==="slide"||i.type==="hold"?10:10;
}
function scoreMultiplier(j){
 if(N.scoreMode===MODE.WEIGHTED_FLAT||N.scoreMode===MODE.UNWEIGHTED_FLAT)return ({perfect:3,great:2,good:1,bad:0}[j]||0);
 return ({perfect:1,great:.7,good:.5,bad:0}[j]||0);
}
function comboBonus(){return (N.scoreMode===MODE.WEIGHTED_COMBO||N.scoreMode===MODE.UNWEIGHTED_COMBO)?Math.min(Math.floor((E.combo||0)/100),10)*.1:0}
function award(j,n,delta,opts={}){
 const i=info(n);if(i.fake||i.anchor||i.damage||i.hidden)return;
 if(E.counts[j]==null)E.counts[j]=0;E.counts[j]++;
 const mult=scoreMultiplier(j),weight=kindWeight(n),before=E.combo;
 E.score+=Math.round(weight*10*mult*(1+((N.scoreMode.includes("combo")?Math.min(Math.floor(before/100),10)*.1:0))));
 if(j==="bad"){E.combo=0;E.life=clamp(E.life-80,0,N.maxLife)}else{E.combo++;E.maxCombo=Math.max(E.maxCombo,E.combo)}
 E.lastJudge=j.toUpperCase();
 const sample=delta==null?deltaFor(n):delta;
 E.judgeSamples.push(sample);const rec={id:n.id,time:E.time(),delta:sample,judgment:j,lane:n.lane,critical:i.critical,wrongWay:!!opts.wrongWay};
 N.judgments.push(rec);N.replay.push(rec);E.judgmentAccuracy=N.judgments;E.replay=N.replay;
 spawnHit(n,j);playHitSfx(n,j);haptic(j,n);
}
function damage(n){
 if(n.damageResolved)return;
 n.damageResolved=true;n.hit=true;n.missed=false;E.combo=0;E.life=clamp(E.life-40,0,N.maxLife);E.counts.bad=(E.counts.bad||0)+1;E.lastJudge="DAMAGE";playHitSfx(n,"miss");spawnHit(n,"damage");haptic("miss",n);
}
function completeDamage(n){n.damageResolved=true;n.hit=true}
function directionVector(dir){const k=["UP_OMNI","DOWN_OMNI","UP_LEFT","UP_RIGHT","DOWN_LEFT","DOWN_RIGHT"][Number(dir)||0]||"UP_OMNI";return DIR[k]||DIR.UP_OMNI}
function flickAngle(n,dx,dy){
 let x=dx,y=dy;if(E.mirror)x=-x;const l=Math.hypot(x,y);if(l<18)return -1;return Math.atan2(y/l,x/l);
}
function flickOK(n,dx,dy){
 const a=flickAngle(n,dx,dy);if(a<0)return false;
 const [wx,wy]=directionVector(n.dir),want=Math.atan2(wy,wx);
 let diff=Math.abs(Math.atan2(Math.sin(a-want),Math.cos(a-want)));
 return diff<=75*RAD;
}
function noteLaneAt(n,t){
 const d=Math.max(.000001,n.duration||0),f=clamp((t-n.time)/d,0,1),pts=n.path?.length?n.path:[{t:0,l:n.lane},{t:1,l:n.endLane??n.lane}];
 if(pts.length===1)return pts[0].l;
 let i=0;while(i<pts.length-1&&f>Number(pts[i+1].t))i++;
 const a=pts[i],b=pts[Math.min(i+1,pts.length-1)],u=clamp((f-Number(a.t||0))/Math.max(.000001,Number(b.t??1)-Number(a.t||0)),0,1);
 return a.l+(b.l-a.l)*easeValue(b.ease??a.ease??n.ease??"linear",u);
}
function easeValue(type,x){
 x=clamp(x,0,1);const k=String(type||"linear").toLowerCase().replace(/[- ]/g,"_");
 if(k==="none")return x>=1?1:0;
 if(k.includes("in_out_cubic")||k.includes("inoutcubic"))return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
 if(k.includes("in_out_quad")||k.includes("inoutquad"))return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
 if(k.includes("out_in_quad")||k.includes("outinquad"))return x<.5?(1-Math.pow(1-2*x,2))/2:.5+Math.pow(2*x-1,2)/2;
 if(k.includes("in_quad"))return x*x;
 if(k.includes("out_quad"))return 1-(1-x)*(1-x);
 if(k.includes("in_cubic"))return x*x*x;
 if(k.includes("out_cubic"))return 1-Math.pow(1-x,3);
 if(k.includes("in_quart"))return x**4;
 if(k.includes("out_quart"))return 1-(1-x)**4;
 if(k.includes("sine"))return(1-Math.cos(Math.PI*x))/2;
 return x*x*(3-2*x);
}
function eventsFor(n){
 if(N.disableTimescale||E.disableTimescale)return[];
 const g=E.timescaleGroups?.[String(n.timescaleGroup)]||E.timescaleGroups?.[n.timescaleGroup]||null;
 if(Array.isArray(g)&&g.length)return g;
 if(Array.isArray(n.timescaleEvents)&&n.timescaleEvents.length)return n.timescaleEvents;
 return E.timescaleEvents||[];
}
function speedAt(events,t){
 if(!events.length)return 1;let current=events[0]?.speed??1;
 for(let i=0;i<events.length;i++){const a=events[i],b=events[i+1];if(t<a.time)break;if(!b||t>=b.time){current=Number(a.speed)||1;continue}
  const u=clamp((t-a.time)/Math.max(.000001,b.time-a.time),0,1);const as=Number(a.speed)||1,bs=Number(b.speed??a.speed)||as;return as+(bs-as)*easeValue(b.ease??a.ease??"linear",u)
 }
 return current;
}
function integrate(events,a,b){
 if(b<=a||!events.length)return Math.max(0,b-a);
 const cuts=[a,...events.map(x=>Number(x.time)).filter(x=>x>a&&x<b),b].sort((x,y)=>x-y);let sum=0;
 for(let i=0;i<cuts.length-1;i++){const x=cuts[i],y=cuts[i+1],m=(x+y)/2,s0=speedAt(events,x),sm=speedAt(events,m),s1=speedAt(events,y);sum+=(y-x)*(s0+4*sm+s1)/6}
 return sum;
}
function visualProgress(n,now){
 const target=targetTime(n),ev=eventsFor(n),dist=integrate(ev,now,target);
 const travel=.95/Math.max(.05,E.speed*(n.speed||1));return 1-clamp(dist/travel,-.15,1.15);
}
function findCandidate(lane,now,mode="head"){
 const out=[];
 for(const n of E.notes||[]){
  const i=info(n);if(n.hit||n.missed||i.fake||i.anchor||i.damage||i.hidden)continue;
  if(mode==="tail"&&!n.active)continue;
  const t=mode==="tail"?n.time+(n.duration||0):n.time;
  const logical=E.reverse?E.duration-t:t,delta=now-logical*MS;
  const w=win(n,mode==="tail"),lo=w.bad[0]-N.inputOffset,hi=w.bad[1]-N.inputOffset;
  if(delta<w.bad[0]||delta>w.bad[1])continue;
  const nl=E.mirror?11-n.lane:n.lane,width=Math.max(.5,Number(n.width)||1)+N.noteMargin*12;
  if(Math.abs(nl-lane)>width/2+1.25)continue;
  out.push({n,abs:Math.abs(delta),delta});
 }
 out.sort((a,b)=>a.abs-b.abs);return out[0]?.n||null;
}
function capturePointer(e,p){
 const lane=E.laneFromEvent(e),now=adjustedNow(),n=findCandidate(lane,now);
 if(!n)return;
 p.nextSekaiNote=n;p.note=n;p.nextSekaiDownX=e.clientX;p.nextSekaiDownY=e.clientY;p.nextSekaiStart=performance.now();
 const i=info(n);
 if(i.type==="flick"||i.type==="trace-flick"){N.pending.set(e.pointerId,{n,wrong:false,wrongTime:-1});return}
 if(i.type==="damage"){damage(n);return}
 const d=deltaFor(n),j=judge(d,n);
 if(j){n.hit=true;n.active=n.duration>0||i.type==="hold"||i.type==="slide"||i.type==="trace"||i.type==="trace-flick";n.hitAt=E.time();n.holdUntil=n.time+(n.duration||0);n.capturedPointer=e.pointerId;award(j,n,d);return}
}
function captureFlick(e,p){
 const q=N.pending.get(e.pointerId),n=q?.n||findCandidate(E.laneFromEvent(e),adjustedNow(),"head");if(!n)return false;
 const dx=e.clientX-(q?.downX??p?.downX??e.clientX),dy=e.clientY-(q?.downY??p?.downY??e.clientY);
 const d=deltaFor(n),w=win(n);if(d<w.bad[0]-N.inputOffset||d>w.bad[1]-N.inputOffset)return false;
 if(flickOK(n,dx,dy)){
  const j=judge(d,n);if(j){n.hit=true;n.active=n.duration>0;n.hitAt=E.time();n.capturedPointer=e.pointerId;N.pending.delete(e.pointerId);award(j,n,d);return true}
 }else if(q){q.wrong=true;if(q.wrongTime<0)q.wrongTime=E.time()}
 return false;
}
function releasePointer(e,p){
 const n=p?.nextSekaiNote||N.pending.get(e.pointerId)?.n;if(!n)return;
 const i=info(n);if(i.type==="flick"||i.type==="trace-flick"){captureFlick(e,p);N.pending.delete(e.pointerId);return}
 if(!n.active)return;
 const tailTime=n.time+(n.duration||0),logical=E.reverse?E.duration-tailTime:tailTime,delta=(E.reverse?E.duration-E.time():E.time())*MS+N.inputOffset-logical*MS;
 const j=judge(delta,n,true);
 if(i.type==="trace"||i.type==="slide"||i.type==="hold"){if(j){n.active=false;n.tailHit=true;award(j,{...n,id:String(n.id)+":tail",time:tailTime,lane:n.endLane??n.lane,type:"slide",critical:n.critical},delta)}else fail(n)}
}
function fail(n,reason="miss"){
 if(n.missed)return;n.missed=true;n.active=false;E.combo=0;E.counts.miss=(E.counts.miss||0)+1;E.life=clamp(E.life-(info(n).type==="tick"||info(n).damage?40:80),0,N.maxLife);E.lastJudge=reason.toUpperCase();N.judgments.push({id:n.id,time:E.time(),delta:deltaFor(n),judgment:"miss",lane:n.lane,reason});E.replay=N.judgments.slice();spawnHit(n,"miss");playHitSfx(n,"miss");haptic("miss",n)
}
function processActive(){
 const logical=E.reverse?E.duration-E.time():E.time(),touches=[...E.pointers.entries()];
 for(const n of E.notes||[]){
  const i=info(n);if(i.fake||i.hidden||i.anchor||n.missed)continue;
  if(i.damage&&!n.damageResolved){
   const delta=logical*MS+N.inputOffset-n.time*MS,w=win(n);
   if(delta>w.p[0]&&delta<=w.bad[1]){let touched=false;for(const [,p] of touches){const lane=E.laneFromEvent({clientX:p.x,clientY:p.y});if(Math.abs((E.mirror?11-n.lane:n.lane)-lane)<=1.25){touched=true;break}}if(touched)damage(n);else if(delta>=w.bad[1])completeDamage(n)}
   continue;
  }
  if(n.active&&n.duration>0){
   n.progress=clamp((logical-n.time)/n.duration,0,1);
   const pathLane=noteLaneAt(n,clamp(E.time(),n.time,n.time+n.duration));
   let held=false;
   for(const [,p] of touches){const lane=E.laneFromEvent({clientX:p.x,clientY:p.y});if(Math.abs((E.mirror?11-pathLane:pathLane)-lane)<=Math.max(1.25,(n.width||1)/2+N.noteMargin*6)){held=true;break}}
   if(!n.tickTimes)n.tickTimes=makeTicks(n);
   while(n.tickIndex<(n.tickTimes||[]).length&&logical+N.inputOffset/MS>=n.tickTimes[n.tickIndex]){
    const tt=n.tickTimes[n.tickIndex++],tl=noteLaneAt(n,tt);if(held||i.type==="trace"||i.type==="trace-flick"){E.counts.perfect=(E.counts.perfect||0)+1;E.score+=10;spawnTick(n,tl)}else{E.life=clamp(E.life-40,0,N.maxLife);E.combo=0;E.counts.miss=(E.counts.miss||0)+1;spawnTick(n,tl,"miss")}
   }
  }
  if(n.active&&logical>=n.time+(n.duration||0)){
   // Ended without a release: evaluate as perfect at the boundary, matching active-note completion behavior.
   n.active=false;n.tailHit=true;const tail={...n,id:String(n.id)+":tail",time:n.time+(n.duration||0),lane:n.endLane??n.lane,type:"slide",critical:n.critical};
   award("perfect",tail,0,{autoComplete:true});
  }
  const end=inputInterval(n).end;
  if(!n.hit&&!n.missed&&logical*MS+N.inputOffset>end+0.01)fail(n);
 }
 for(const [id,q] of N.pending){
  const n=q.n; if(!n||n.hit||n.missed)continue;
  const logical=E.reverse?E.duration-E.time():E.time(),d=logical*MS+N.inputOffset-n.time*MS,w=win(n);
  if(q.wrong&&d>=w.p[1]&&d>=w.p[0]){const raw=judge(d,n);const j=raw==="perfect"?"great":raw;if(j){n.hit=true;award(j,n,d,{wrongWay:true});}else fail(n,"wrong-way") ;N.pending.delete(id)}
  else if(d>w.bad[1]){fail(n);N.pending.delete(id)}
 }
}
function makeTicks(n){
 if(!n.duration||n.duration<=0)return[];
 const bpm=Math.max(.1,E.bpm||120),step=60/bpm/2,arr=[];for(let t=step;t<n.duration-.0001;t+=step)arr.push(n.time+t);return arr
}
function spawnHit(n,kind){
 E.effects=E.effects||[];const now=performance.now()/1000,i=info(n),count=kind==="perfect"?14:kind==="great"?10:kind==="good"?7:8;
 const color=i.damage||kind==="damage"?"#ff5a72":i.critical?"#ffe05a":i.type==="trace"||i.type==="trace-flick"?GUIDE[n.guideColor%GUIDE.length]:i.type==="flick"?"#ff9862":"#66dff2";
 E.effects.push({lane:n.lane,kind,critical:i.critical,damage:i.damage,color,spawn:now,life:.52,max:.52,count});
 E.effects.push({lane:n.lane,kind:"slot",critical:i.critical,color,spawn:now,life:.36,max:.36});
 E.effects.push({lane:n.lane,kind:"lane",critical:i.critical,color,spawn:now,life:.45,max:.45});
}
function spawnTick(n,lane,kind="tick"){E.effects=E.effects||[];E.effects.push({lane,kind,color:kind==="miss"?"#ff5a72":GUIDE[n.guideColor%GUIDE.length],spawn:performance.now()/1000,life:.28,max:.28})}
function playHitSfx(n,j){
 if(!N.sfxEnabled||N.sfxEnabled===false)return;const a=E.audioCtx;if(!a)return;
 try{const map=j==="perfect"&&info(n).critical?SFX.critical:j==="flick"?SFX.flick:info(n).type==="trace"?SFX.trace:j==="great"?SFX.great:j==="good"?SFX.good:j==="miss"?SFX.miss:SFX.tap;
  const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=map[1];o.frequency.setValueAtTime(map[0],t);o.frequency.exponentialRampToValueAtTime(map[0]*.72,t+.08);g.gain.setValueAtTime(.045,t);g.gain.exponentialRampToValueAtTime(.0001,t+.11);o.connect(g).connect(a.destination);o.start(t);o.stop(t+.12)
 }catch{}
}
function haptic(j,n){
 if(N.haptic==="disabled"||!navigator.vibrate)return;
 if(N.haptic==="miss"&&j!=="miss")return;
 if(N.haptic==="miss-good"&&j!=="miss"&&j!=="good")return;
 try{navigator.vibrate(j==="miss"?45:j==="good"?22:14)}catch{}
}
function drawEffects(ctx,w,h){
 const list=E.effects||[],now=performance.now()/1000,scale=Math.max(.1,N.effectAnimationSpeed||1);
 for(const e of list){if(!e.spawn)e.spawn=now;const elapsed=(now-e.spawn)*scale;e.age=elapsed;e.life=e.max-elapsed;if(e.life<=0)continue;
  const p=clamp(elapsed/e.max,0,1),x=w*(.08+(e.lane+.5)/12*.84),y=h*.83,alpha=1-p,c=e.color||"#69dcf4";
  ctx.save();ctx.globalCompositeOperation="lighter";ctx.globalAlpha=alpha;
  if(e.kind==="slot"){ctx.strokeStyle=c;ctx.lineWidth=2+4*alpha;ctx.beginPath();ctx.ellipse(x,y,22+32*p,8+14*p,0,0,TAU);ctx.stroke()}
  else if(e.kind==="lane"){ctx.fillStyle=c;ctx.globalAlpha*=.55;ctx.fillRect(x-5,y-95*p,10,95*p)}
  else{ctx.fillStyle=c;const count=e.count||8;for(let i=0;i<count;i++){const a=i*TAU/count+(e.seed||0),r=(8+44*p)*(i%2?.82:1);ctx.beginPath();ctx.arc(x+Math.cos(a)*r,y+Math.sin(a)*r,Math.max(1.5,4*(1-p)),0,TAU);ctx.fill()}}
  ctx.restore()
 }
 E.effects=list.filter(e=>e.life>0)
}
function render(){
 const ctx=E.ctx,r=E.canvas?.getBoundingClientRect();if(!ctx||!r)return;
 const w=r.width,h=r.height,now=E.time();ctx.clearRect(0,0,w,h);
 const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,"#050713");bg.addColorStop(.58,"#0c1730");bg.addColorStop(1,"#111c3a");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);E.drawStage(ctx,w,h);
 for(const n of E.notes||[]){const i=info(n);if(n.missed||n.damageResolved||(!n.active&&n.hit)||i.fake||i.hidden)continue;
  const f=visualProgress(n,now);if(f<-.05||f>1.12)continue;if(E.sudden&&f<.48&&!n.active)continue;
  drawPath(ctx,n,w,h,now);drawNote(ctx,n,f,w,h);
 }
 drawEffects(ctx,w,h);
 E.updateHud?.();N.updateHud?.();
}
function approach(v){v=clamp(v,0,1);return N.alternativeCurve?1-Math.pow(1-v,1.6):Math.pow(v,1.65)}
function drawPath(ctx,n,w,h,now){
 if(!n.duration&&!n.path?.length)return;
 const pts=[],count=Math.max(24,(n.path?.length||2)*18);
 for(let i=0;i<=count;i++){const u=i/count,t=n.time+u*(n.duration||0),l=noteLaneAt(n,t),f=visualProgress({time:t,lane:l,duration:0,timescaleGroup:n.timescaleGroup,path:[],speed:n.speed||1},now);if(f<-.05||f>1.12)continue;pts.push(E.project(E.mirror?11-l:l,f,w,h))}
 if(pts.length<2)return;const c=n.damage?"#ff5a72":n.critical?"#ffe04e":GUIDE[n.guideColor%GUIDE.length]||"#69dcf4";
 ctx.save();ctx.strokeStyle=c;ctx.globalAlpha=n.type.startsWith("trace")?.78:.66;ctx.lineWidth=Math.max(4,pts[0].size*(N.guideQuality>=2?1.0:.75));ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();
 if(N.guideQuality>=2){ctx.fillStyle=c;for(let i=2;i<pts.length-1;i+=5){ctx.beginPath();ctx.arc(pts[i].x,pts[i].y,Math.max(1.5,pts[i].size*.10),0,TAU);ctx.fill()}}
 ctx.restore()
}
function drawNote(ctx,n,f,w,h){
 const p=E.project(E.mirror?11-n.lane:n.lane,f,w,h),i=info(n),c=i.damage?"#ff5a72":i.critical?"#fff0a0":i.type.startsWith("trace")?GUIDE[n.guideColor%GUIDE.length]:i.type==="flick"?"#ffb45f":"#f3fbff";
 ctx.save();ctx.translate(p.x,p.y);const width=Math.max(1,n.width||1),s=p.size*clamp((1+N.noteMargin*3)*Math.sqrt(width),1,3.2);ctx.shadowBlur=i.critical?24:14;ctx.shadowColor=c;ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(-s*.75,-s*.52,s*1.5,s*1.04,s*.2);ctx.fill();
 if(i.type==="flick"||i.type==="trace-flick"){const [vx,vy]=directionVector(n.dir);ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(vx*s*1.08,vy*s*1.08);ctx.lineTo(-vy*s*.38+vx*s*.2,vx*s*.38+vy*s*.2);ctx.lineTo(vy*s*.38+vx*s*.2,-vx*s*.38+vy*s*.2);ctx.closePath();ctx.fill()}
 if(i.type==="trace"){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke()}
 if(i.critical){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke()}ctx.restore()
}
function addControls(){
 const box=E.stage?.querySelector(".pjsk-import-box");if(!box||box.querySelector(".nextsekai-controls"))return;
 const d=document.createElement("div");d.className="nextsekai-controls";d.style.cssText="display:grid;grid-template-columns:repeat(4,minmax(100px,1fr));gap:6px;margin-top:8px";
 d.innerHTML='<label>Score<select data-ns="score"><option value="weighted-combo">Weighted Combo</option><option value="weighted-flat">Weighted Flat</option><option value="unweighted-combo">Unweighted Combo</option><option value="unweighted-flat">Unweighted Flat</option></select></label><label>Life<input data-ns="life" type="number" min="1" max="9999" step="1"></label><label>Haptic<select data-ns="haptic"><option value="disabled">Off</option><option value="miss">Miss</option><option value="miss-good">Miss + Good</option></select></label><label>Effect Speed<input data-ns="effect" type="number" min=".25" max="4" step=".05"></label><label>Guide<select data-ns="guide"><option value="0.5">Low</option><option value="1">Normal</option><option value="2">High</option></select></label><label>Fake<select data-ns="fake"><option value="false">Show</option><option value="true">Hide</option></select></label><label>Timescale<select data-ns="ts"><option value="false">On</option><option value="true">Off</option></select></label><label>Alt Curve<select data-ns="curve"><option value="false">Off</option><option value="true">On</option></select></label>';
 box.appendChild(d);
 d.querySelectorAll("[data-ns]").forEach(el=>el.addEventListener("change",()=>{
  const k=el.dataset.ns;if(k==="score")N.scoreMode=el.value;
  if(k==="life"){N.initialLife=Math.max(1,+el.value||1000);N.maxLife=N.initialLife;E.life=N.initialLife}
  if(k==="haptic")N.haptic=el.value;
  if(k==="effect")N.effectAnimationSpeed=clamp(+el.value||1,.25,4);
  if(k==="guide")N.guideQuality=+el.value;
  if(k==="fake")N.disableFakeNotes=el.value==="true";
  if(k==="ts")N.disableTimescale=el.value==="true";
  if(k==="curve")N.alternativeCurve=el.value==="true";
  localStorage.setItem("pjsekai-next-options",JSON.stringify({scoreMode:N.scoreMode,initialLife:N.initialLife,haptic:N.haptic,effectAnimationSpeed:N.effectAnimationSpeed,guideQuality:N.guideQuality,disableFakeNotes:N.disableFakeNotes,disableTimescale:N.disableTimescale,alternativeCurve:N.alternativeCurve}));
  E.resetJudgments?.(true);
 }));
 const load=JSON.parse(localStorage.getItem("pjsekai-next-options")||"null")||{};N.scoreMode=load.scoreMode||N.scoreMode;N.initialLife=+load.initialLife||N.initialLife;N.maxLife=N.initialLife;N.haptic=load.haptic||N.haptic;N.effectAnimationSpeed=+load.effectAnimationSpeed||N.effectAnimationSpeed;N.guideQuality=+load.guideQuality||N.guideQuality;N.disableFakeNotes=!!load.disableFakeNotes;N.disableTimescale=!!load.disableTimescale;N.alternativeCurve=!!load.alternativeCurve;
 for(const [k,v] of Object.entries({score:N.scoreMode,life:N.initialLife,haptic:N.haptic,effect:N.effectAnimationSpeed,guide:N.guideQuality,fake:String(N.disableFakeNotes),ts:String(N.disableTimescale),curve:String(N.alternativeCurve)})){const el=d.querySelector('[data-ns="'+k+'"]');if(el)el.value=String(v)}
}
function updateHud(){
 const h=E.stage?.querySelector(".pjsk-hud");if(!h)return;
 let life=h.querySelector(".next-life");if(!life){life=document.createElement("div");life.className="next-life";life.innerHTML="<small>LIFE</small><strong></strong>";h.appendChild(life)}
 life.querySelector("strong").textContent=Math.round(E.life);
 let r=h.querySelector(".next-rank");if(!r){r=document.createElement("div");r.className="next-rank";h.appendChild(r)}
 const c=E.counts||{};r.textContent=`P ${c.perfect||0}  G ${c.great||0}  GD ${c.good||0}  B ${c.bad||0}  M ${c.miss||0}`;
}
function finishResult(){
 if(N.finished)return;N.finished=true;E.running=false;const c=E.counts||{},total=(E.notes||[]).filter(n=>!info(n).fake&&!info(n).damage&&!info(n).hidden&&!info(n).anchor).length;
 const judged=(c.perfect||0)+(c.great||0)+(c.good||0)+(c.bad||0)+(c.miss||0);
 const acc=judged?((c.perfect||0)+(c.great||0)*.8+(c.good||0)*.5)/judged*100:0;
 E.result={total:judged,score:Math.round(E.score),combo:E.maxCombo,accuracy:+acc.toFixed(3),ap:(c.great||0)+(c.good||0)+(c.bad||0)+(c.miss||0)===0,fc:(c.miss||0)===0,life:E.life,replay:N.replay.slice()};
 E.lastJudge=E.result.ap?"AP":E.result.fc?"FC":"RESULT";showResult();
}
function showResult(){
 let p=E.stage?.querySelector(".next-result");if(!p){p=document.createElement("div");p.className="next-result";p.style.cssText="position:absolute;inset:auto 18px 18px auto;z-index:9;padding:12px 14px;border-radius:16px;background:rgba(8,12,27,.86);color:#fff;font-size:11px;backdrop-filter:blur(10px)";E.stage.appendChild(p)}
 const r=E.result;p.innerHTML=`<b>${r.ap?"ALL PERFECT":r.fc?"FULL COMBO":"RESULT"}</b><br>Score ${r.score} · Max Combo ${r.combo} · Accuracy ${r.accuracy}% · Life ${Math.round(r.life)}`;
}
const oldInit=E.init;E.init=function(){oldInit.call(this);addControls();N.finished=false;N.replay=[];N.judgments=[];setTimeout(addControls,0)};
const oldLoadJSON=E.loadJSON;E.loadJSON=function(input){oldLoadJSON.call(this,input);const a=window.PJSekaiNextSekaiAdapter?.normalize(input);if(a){E.timescaleGroups=a.timescaleGroups;E.nextOptions=a.options||E.nextOptions;N.guideQuality=E.nextOptions.guideQuality??N.guideQuality;N.noteMargin=E.nextOptions.noteMargin??N.noteMargin;N.alternativeCurve=!!E.nextOptions.alternativeCurve;N.disableTimescale=!!E.nextOptions.disableTimescale;N.disableFakeNotes=!!E.nextOptions.disableFakeNotes;N.effectAnimationSpeed=E.nextOptions.effectAnimationSpeed??N.effectAnimationSpeed;N.downFlick=E.nextOptions.downFlick!==false;N.scoreMode=E.nextOptions.scoreMode||N.scoreMode;N.initialLife=E.nextOptions.initialLife||N.initialLife;N.maxLife=N.initialLife}N.finished=false;N.replay=[];N.judgments=[];for(const n of E.notes||[]){n.tickTimes=makeTicks(n);n.tickIndex=0;n.missed=false;n.hit=false;n.active=false}};
const oldReset=E.resetJudgments;E.resetJudgments=function(render=true){oldReset.call(this,render);N.finished=false;N.replay=[];N.judgments=[];N.progress=[];E.life=N.initialLife||1000;E.maxLife=N.maxLife||E.life;for(const n of E.notes||[]){n.tickTimes=makeTicks(n);n.tickIndex=0;n.missed=false;n.hit=false;n.active=false;n.damageResolved=false}};
E.findHead=function(lane){return findCandidate(lane,adjustedNow(),"head")};
E.judgeNote=function(n,lane,dx,dy,p,e){if(!n||n.hit||n.missed)return false;const i=info(n);if(i.fake||i.anchor||i.hidden)return false;if(i.damage){damage(n);return true}const d=deltaFor(n);let j=judge(d,n);if(!j)return false;if(i.type==="flick"||i.type==="trace-flick"){if(!flickOK(n,dx,dy)){N.pending.set(e?.pointerId||-1,{n,wrong:true,wrongTime:E.time(),downX:e?.clientX||0,downY:e?.clientY||0});return false}}n.hit=true;n.active=n.duration>0||["hold","slide","trace","trace-flick"].includes(i.type);n.hitAt=E.time();n.holdUntil=n.time+(n.duration||0);if(p)p.note=n;award(j,n,d);return true};
E.touchDown=function(e,p){capturePointer(e,p);};
E.flickAt=function(e,p){captureFlick(e,p)};
E.release=function(n,p,e){if(n)releasePointer(e||{},p||{})};
E.track=function(n,p,e){if(!n?.active)return;const lane=E.laneFromEvent(e),target=E.reverse?11-noteLaneAt(n,E.time()):noteLaneAt(n,E.time());n.progress=clamp((E.time()-n.time)/Math.max(.001,n.duration||1),0,1);if(Math.abs(lane-target)>Math.max(1.25,(n.width||1)/2+N.noteMargin*6))n.offPath=true;else n.offPath=false};
const oldLoop=E.loop;E.loop=function(){if(!this.running)return;processActive();const logical=E.reverse?E.duration-E.time():E.time();N.progress.push({time:E.time(),combo:E.combo,score:E.score,life:E.life});if(N.progress.length>2400)N.progress.shift();if(logical>=E.duration-.01&&!N.finished)finishResult();drawEffects(E.ctx,E.canvas.getBoundingClientRect().width,E.canvas.getBoundingClientRect().height);render();this.raf=requestAnimationFrame(()=>this.loop())};
E.timescaleEventsFor=eventsFor;E.scrollSpeedAt=function(t){return speedAt(this.timescaleEvents||[],t)};E.scrollDistance=function(a,b){return integrate(this.timescaleEvents||[],a,b)*this.speed};
E.visualProgress=visualProgress;E.approach=approach;
N.updateHud=updateHud;
setTimeout(()=>addControls(),50);
window.PJSekaiNextSekaiWebRuntime=N;
})();