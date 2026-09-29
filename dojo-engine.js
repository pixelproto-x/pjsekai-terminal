/* Project SEKAI-style Web Dojo Engine
 * Architecture informed by public Sonolus/Next-SEKAI research.
 * Uses original Canvas/SVG-like drawing and WebAudio; no proprietary game assets.
 */
(()=>{"use strict";
const $=s=>document.querySelector(s), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const B36=s=>parseInt(String(s),36), RAD=Math.PI/180;

const Engine={
 canvas:null,ctx:null,stage:null,audio:null,raf:0,running:false,
 speed:1,offset:0,mirror:false,reverse:false,sudden:false,autoplay:false,
 bpm:120,chartName:"Web Dojo",duration:90,ticksPerBeat:480,notes:[],slides:[],timescaleEvents:[],
 score:0,combo:0,maxCombo:0,counts:{perfect:0,great:0,good:0,bad:0,miss:0},
 effects:[],pointers:new Map(),judgeSamples:[],lastJudge:"READY",lastTime:0,clockBase:0,clockStarted:0,clockPaused:0,
 audioCtx:null,master:null,loaded:false,sectionStart:0,sectionEnd:0,sectionLoop:false,
 windows:{perfect:41.667,great:83.333,good:108.333,bad:125,trace:83.333,flickPerfect:41.667,flickGreatLate:125,flickGoodLate:133.333,flickBadLate:141.667,slideEndPerfect:58.333,slideEndGreatLate:133.333,slideEndGoodLate:141.667},judge:{perfect:0,great:0,good:0,bad:0,miss:0},result:null,guideQuality:2,noteMargin:1,alternativeCurve:false,disableTimescale:false,skin:"sekai",nextOptions:{guideQuality:2,noteMargin:1,alternativeCurve:false,disableTimescale:false},
 init(){
  this.stage=$("#dojoStage"); if(!this.stage)return;
  this.stage.innerHTML="";
  this.canvas=document.createElement("canvas");this.canvas.className="pjsk-engine-canvas";
  this.stage.appendChild(this.canvas);this.ctx=this.canvas.getContext("2d");
  this.audio=$("#dojoAudio");this.makeHud();this.makeTools();this.bind();this.resize();
  addEventListener("resize",()=>this.resize());this.demo();this.render();
 },
 makeHud(){
  const h=document.createElement("div");h.className="pjsk-hud";
  h.innerHTML='<div><small>COMBO</small><strong id="pjskCombo">0</strong></div><div><small>SCORE</small><strong id="pjskScore">0000000</strong></div><div><small>JUDGMENT</small><strong id="pjskJudge">READY</strong></div>';
  this.stage.appendChild(h);
 },
 makeTools(){
  const b=document.createElement("div");b.className="pjsk-import-box";
  b.innerHTML='<b>SEKAI CHART ENGINE</b><span>12-Lane · SUS / USC-like JSON · Multi-touch</span><label class="pjsk-file-btn">匯入譜面<input id="pjskChartFile" type="file" accept=".sus,.json,.txt" hidden></label><button id="pjskDemo">Demo</button><button id="pjskExport">Export JSON</button>';
  this.stage.appendChild(b);
  $("#pjskChartFile")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(f)this.importChart(await f.text(),f.name)});
  $("#pjskDemo")?.addEventListener("click",()=>{this.demo();this.reset()});
  $("#pjskExport")?.addEventListener("click",()=>this.exportJSON());
 },
 bind(){
  $("#dojoPracticePlay")?.addEventListener("click",()=>this.toggle());
  $("#dojoPracticeStop")?.addEventListener("click",()=>this.stop());
  $("#dojoSpeed")?.addEventListener("input",e=>{this.speed=+e.target.value||1;if(this.audio)this.audio.playbackRate=this.speed;const x=$("#dojoSpeedValue");if(x)x.textContent=this.speed.toFixed(2)+"x"});
  $("#dojoMirror")?.addEventListener("change",e=>this.mirror=e.target.checked);
  $("#dojoReverse")?.addEventListener("change",e=>this.reverse=e.target.checked);
  $("#dojoSudden")?.addEventListener("change",e=>this.sudden=e.target.checked);
  $("#dojoLoop")?.addEventListener("change",e=>this.sectionLoop=e.target.checked);
  $("#dojoAudioFile")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(!f)return;this.audio.src=URL.createObjectURL(f);this.audio.load();const n=$("#dojoAudioName");if(n)n.textContent=f.name});
  if(this.audio){
   this.audio.addEventListener("play",()=>{this.running=true;this.ensureAudio();this.loop()});
   this.audio.addEventListener("pause",()=>{this.running=false;cancelAnimationFrame(this.raf);this.render()});
   this.audio.addEventListener("loadedmetadata",()=>this.duration=this.audio.duration||this.duration);
   this.audio.addEventListener("seeked",()=>this.resetJudgments(false));
   this.audio.addEventListener("timeupdate",()=>{if(this.sectionLoop&&this.sectionEnd>this.sectionStart&&this.time()>=this.sectionEnd)this.seek(this.sectionStart)});
  }
  const c=this.stage;
  c.addEventListener("pointerdown",e=>{c.setPointerCapture?.(e.pointerId);const p={x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY,px:e.clientX,py:e.clientY,start:performance.now(),note:null};this.pointers.set(e.pointerId,p);this.touchDown(e,p)});
  c.addEventListener("pointermove",e=>{const p=this.pointers.get(e.pointerId);if(!p)return;p.px=p.x;p.py=p.y;p.x=e.clientX;p.y=e.clientY;if(p.note)this.track(p.note,p,e)});
  c.addEventListener("pointerup",e=>{const p=this.pointers.get(e.pointerId);if(p){if(p.note&&this.isFlick(p.note)){this.judgeNote(p.note,this.laneFromEvent(e),e.clientX-p.downX,e.clientY-p.downY,p,e)}else if(p.note)this.release(p.note,p,e);else this.flickAt(e,p);this.pointers.delete(e.pointerId)}});
  c.addEventListener("pointercancel",e=>{const p=this.pointers.get(e.pointerId);if(p?.note)this.failRelease(p.note);this.pointers.delete(e.pointerId)});
  addEventListener("keydown",e=>{if(e.repeat)return;const map={a:0,s:1,d:2,f:3,j:8,k:9,l:10,";":11};if(map[e.key.toLowerCase()]!=null)this.tapLane(map[e.key.toLowerCase()],e.key.toLowerCase());if(e.key===" ")this.toggle();if(e.key.toLowerCase()==="r")this.stop()});
 },
 resize(){if(!this.canvas)return;const r=this.canvas.getBoundingClientRect(),d=devicePixelRatio||1;this.canvas.width=Math.max(1,r.width*d);this.canvas.height=Math.max(1,r.height*d);this.ctx.setTransform(d,0,0,d,0,0)},
 time(){if(this.audio&&this.audio.src)return this.audio.currentTime||0;if(!this.running)return this.clockPaused||0;return this.clockBase+(performance.now()-this.clockStarted)/1000*this.speed},
 seek(t){const v=clamp(t,0,this.duration);if(this.audio&&this.audio.src){this.audio.currentTime=v}else{this.clockBase=v;this.clockPaused=v;this.clockStarted=performance.now()}},
 toggle(){if(this.audio&&this.audio.src){if(this.audio.paused)this.audio.play().catch(()=>{});else this.audio.pause();return}if(this.running){this.clockPaused=this.time();this.running=false;cancelAnimationFrame(this.raf);this.render();return}this.clockBase=this.clockPaused||0;this.clockStarted=performance.now();this.running=true;this.ensureAudio();this.loop()},
 stop(){if(this.audio&&this.audio.src)this.audio.pause();this.running=false;cancelAnimationFrame(this.raf);this.clockBase=0;this.clockPaused=0;this.seek(0);this.reset()},
 reset(){this.resetJudgments(true);this.result=null;this.render()},
 evaluateResult(){
  const total=this.notes.filter(n=>!n.fake&&!n.damage).length;
  const judged=this.counts.perfect+this.counts.great+this.counts.good+this.counts.bad+this.counts.miss;
  const acc=judged?((this.counts.perfect+this.counts.great*.8+this.counts.good*.5+this.counts.bad*.1)/judged)*100:0;
  const ap=this.counts.great+this.counts.good+this.counts.bad+this.counts.miss===0;
  return {total,score:Math.round(this.score),combo:this.maxCombo,counts:{...this.counts},accuracy:+acc.toFixed(3),ap,fc:this.counts.miss===0};
 },
 finish(){this.running=false;cancelAnimationFrame(this.raf);this.result=this.evaluateResult();this.lastJudge=this.result.ap?"AP":this.result.fc?"FC":"RESULT";this.render()},

 resetJudgments(render=true){for(const n of this.notes){n.hit=false;n.missed=false;n.active=false;n.progress=0;n.judgedTicks=0;n.tailHit=false}this.combo=0;this.score=0;this.maxCombo=0;this.counts={perfect:0,great:0,good:0,bad:0,miss:0};this.effects=[];this.judgeSamples=[];this.lastJudge="READY";if(render)this.render()},
 ensureAudio(){try{if(!this.audioCtx)this.audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(this.audioCtx.state==="suspended")this.audioCtx.resume()}catch{}},
 sfx(kind){this.ensureAudio();if(!this.audioCtx)return;const o=this.audioCtx.createOscillator(),g=this.audioCtx.createGain(),now=this.audioCtx.currentTime;const f=kind==="perfect"?880:kind==="great"?660:kind==="good"?520:kind==="flick"?1040:kind==="tick"?760:kind==="miss"?170:600;o.type=kind==="flick"?"square":"triangle";o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(f*.72,now+.055);g.gain.setValueAtTime(.035,now);g.gain.exponentialRampToValueAtTime(.0001,now+.09);o.connect(g).connect(this.audioCtx.destination);o.start(now);o.stop(now+.095)},
 laneFromEvent(e){const r=this.canvas.getBoundingClientRect();let x=clamp(e.clientX-r.left,0,r.width-.001),l=Math.floor(x/r.width*12);return this.mirror?11-l:l},
 touchDown(e,p){
  if(e.target!==this.canvas&&e.target.closest(".pjsk-import-box"))return;
  const lane=this.laneFromEvent(e),n=this.findHead(lane);
  if(n){if(this.isFlick(n)){p.note=n;return}if(this.judgeNote(n,lane,0,0,p,e))p.note=n}
 },
 flickAt(e,p){
  const dx=e.clientX-p.downX,dy=e.clientY-p.downY;
  const lane=this.laneFromEvent(e),n=this.findHead(lane);
  if(n)this.judgeNote(n,lane,dx,dy,p,e);
 },
 isFlick(n){return ["flick","trace-flick","tail-flick","head-flick"].includes(n.type)},
 expectedDirection(n,dx,dy){
  if(Math.hypot(dx,dy)<18)return false;
  let a=Math.atan2(dy,dx)/RAD;if(a<0)a+=360;
  const d=n.dir||0;const wanted=[270,90,180,0,225,315,135,45][d]??270;
  let diff=Math.abs(a-wanted);diff=Math.min(diff,360-diff);return diff<=70;
 },
 findHead(lane){
  const now=this.time()*1000+this.offset;let best=null,bd=Infinity;
  for(const n of this.notes){if(n.hit||n.missed||n.fake||n.damage||n.judgedTicks>0&&n.isTick)continue;if(n.lane!==lane)continue;const d=Math.abs(n.time*1000-now);if(d<bd&&d<=this.windows.bad+65){best=n;bd=d}}
  return best;
 },
 windowFor(n){const t=String(n.type||"tap");if(t.includes("trace-flick")||t.includes("flick"))return{perfect:this.windows.flickPerfect,great:this.windows.flickGreatLate,good:this.windows.flickGoodLate,bad:this.windows.flickBadLate};if(t.includes("trace"))return{perfect:this.windows.trace,great:this.windows.trace,good:this.windows.trace,bad:this.windows.trace};if(t==="slide"||t.includes("hold")||t.includes("tail"))return{perfect:this.windows.slideEndPerfect,great:this.windows.slideEndGreatLate,good:this.windows.slideEndGoodLate,bad:this.windows.bad};return this.windows},
 judgeName(delta,n){const w=this.windowFor(n||{}),a=Math.abs(delta);return a<=w.perfect?"perfect":a<=w.great?"great":a<=w.good?"good":a<=w.bad?"bad":null},
 judgeNote(n,lane,dx,dy,p,e){
  if(n.damage){n.hit=true;this.combo=0;this.counts.miss++;this.lastJudge="DAMAGE";this.sfx("miss");return true}

  const delta=(this.time()*1000+this.offset)-n.time*1000,j=this.judgeName(delta,n);if(!j)return false;
  if(this.isFlick(n)&&!this.expectedDirection(n,dx,dy))return false;
  if(n.type==="slide"&&n.path?.length>1)n.headHit=true;
  n.hit=true;n.active=["hold","slide","trace","trace-flick"].includes(n.type);n.hitAt=this.time();n.holdUntil=n.time+n.duration;
  this.award(j,n);if(p)p.note=n;return true;
 },
 award(j,n){this.counts[j]++;this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);const mult=n.critical?1.1:1;this.score+=Math.round(({perfect:1000,great:800,good:500,bad:100}[j]||0)*mult);this.lastJudge=j.toUpperCase();this.judgeSamples.push((this.time()*1000+this.offset)-n.time*1000);this.effects.push({lane:n.lane,kind:j,critical:n.critical,life:.45,max:.45,spawn:performance.now()/1000,seed:Math.random()*6.28});this.effects.push({lane:n.lane,kind:"slot",critical:n.critical,life:.35,max:.35,spawn:performance.now()/1000});this.effects.push({lane:n.lane,kind:"lane",critical:n.critical,life:.5,max:.5,spawn:performance.now()/1000});this.sfx(j)},
 track(n,p,e){
  if(!n.active)return;
  const pos=this.pointerLane(e),target=this.slideLaneAt(n,this.time());
  const dist=Math.abs(pos-target);
  if(n.type==="slide"||n.type==="trace"||n.type==="trace-flick"){n.progress=clamp((this.time()-n.time)/Math.max(.001,n.duration),0,1);if(dist<=1.35){if(n.type.startsWith("trace"))this.tickTrace(n);}}
 },
 pointerLane(e){return this.laneFromEvent(e)},
 slideLaneAt(n,t){const f=clamp((t-n.time)/Math.max(.001,n.duration),0,1);const pts=n.path||[{t:0,l:n.lane},{t:1,l:n.endLane??n.lane}];if(pts.length===1)return pts[0].l;let a=pts[0],b=pts[pts.length-1];for(let i=1;i<pts.length;i++){if(f<=pts[i].t){b=pts[i];a=pts[i-1];break}}const u=(f-a.t)/Math.max(.0001,b.t-a.t);return a.l+(b.l-a.l)*this.ease(u,n.ease||"smooth")},
 ease(t,kind="smooth"){t=clamp(t,0,1);const k=String(kind||"smooth").toLowerCase();if(k==="linear"||k==="none")return t;if(k.includes("inout"))return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;if(k.includes("in")&&k.includes("quad"))return t*t;if(k.includes("out")&&k.includes("quad"))return 1-(1-t)*(1-t);if(k.includes("in")&&k.includes("cubic"))return t*t*t;if(k.includes("out")&&k.includes("cubic"))return 1-Math.pow(1-t,3);if(k.includes("in")&&k.includes("quart"))return t*t*t*t;if(k.includes("out")&&k.includes("quart"))return 1-Math.pow(1-t,4);if(k.includes("sine"))return(1-Math.cos(Math.PI*t))/2;return t*t*(3-2*t)},
 tickTrace(n){const tick=Math.floor((this.time()-n.time)/.125);if(tick>n.judgedTicks){n.judgedTicks=tick;this.score+=100;this.sfx("tick");this.effects.push({lane:this.slideLaneAt(n,this.time()),kind:"trace",life:.28,max:.28,spawn:performance.now()/1000,seed:Math.random()*6.28})}},
 release(n,p,e){
  if(n.type==="hold"||n.type==="slide"||n.type.startsWith("trace")){
    const remain=(n.holdUntil-this.time())*1000;
    if(remain>this.windows.trace){this.failRelease(n);return}
  }

  if(!n.active)return;
  const remain=(n.holdUntil-this.time())*1000;
  if(remain<=this.windows.trace||this.time()>n.holdUntil){n.active=false;n.tailHit=true;this.score+=300;this.sfx("tick");this.effects.push({lane:n.endLane??n.lane,kind:"slot",life:.4,max:.4,spawn:performance.now()/1000})}
  else this.failRelease(n);
 },
 failRelease(n){n.active=false;this.combo=0;this.counts.bad++;this.lastJudge="MISS";this.sfx("miss")},
 updateMisses(){
  const now=this.time()*1000+this.offset;
  for(const n of this.notes){
   if(n.hit||n.missed)continue;
   if(now-n.time*1000>this.windows.bad){n.missed=true;this.combo=0;this.counts.miss++;this.lastJudge="MISS";this.effects.push({lane:n.lane,kind:"miss",life:.45,max:.45,spawn:performance.now()/1000});}
  }
 },
 loop(){if(!this.running)return;this.updateMisses();if(this.autoplay)this.autoPlay();this.render();this.raf=requestAnimationFrame(()=>this.loop())},
 autoPlay(){const now=this.time()*1000+this.offset;for(const n of this.notes){if(n.fake||n.damage)continue;if(!n.hit&&!n.missed&&Math.abs(now-n.time*1000)<12){n.hit=true;n.active=n.duration>0;n.holdUntil=n.time+n.duration;this.award("perfect",n)}}},
 project(l,f,w,h){const p=clamp(f,0,1),z=Math.pow(p,1.65),spread=w*(.055+.84*z),x=w/2+((l+.5)/12-.5)*spread,y=h*.07+(1-z)*h*.77;return{x,y,size:Math.max(8,spread/13)}},
 pathPoints(n,now,w,h){const pts=n.path||[{t:0,l:n.lane},{t:1,l:n.endLane??n.lane}];return pts.map(v=>{const f=1-(n.time+v.t*n.duration-now)/(1/this.speed);const p=this.project(this.mirror?11-v.l:f,w,h);return p})},
 render(){
  if(!this.ctx)return;const ctx=this.ctx,r=this.canvas.getBoundingClientRect(),w=r.width,h=r.height;ctx.clearRect(0,0,w,h);
  const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,"#050713");bg.addColorStop(.6,"#0c1730");bg.addColorStop(1,"#101b39");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  this.drawStage(ctx,w,h);
  const now=this.time();
  for(const n of this.notes){if(n.missed)continue;const f=1-this.scrollDistance(now,n.time)/.95;if(f<-.04||f>1.1)continue;if(this.sudden&&f<.48&&!n.active)continue;this.drawNote(ctx,n,f,w,h)}
  this.drawEffects(ctx,w,h);this.updateHud();
 },
 drawStage(ctx,w,h){
  ctx.save();ctx.strokeStyle="rgba(120,190,255,.18)";ctx.lineWidth=1;
  for(let i=0;i<=12;i++){const top=w/2+(i/12-.5)*w*.055,bottom=w*.08+i*w*.84/12;ctx.beginPath();ctx.moveTo(top,h*.05);ctx.lineTo(bottom,h*.91);ctx.stroke()}
  ctx.strokeStyle="rgba(255,255,255,.48)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w*.08,h*.84);ctx.lineTo(w*.92,h*.84);ctx.stroke();
  ctx.fillStyle="rgba(120,220,255,.08)";ctx.fillRect(w*.08,h*.84,w*.84,h*.06);ctx.restore();
 },
 drawNote(ctx,n,f,w,h){
  if(n.fake)return;

  const p=this.project(this.mirror?11-n.lane:n.lane,f,w,h);const critical=n.critical;const margin=clamp(this.noteMargin||1,.65,1.35);
  if(n.duration>0||n.type.startsWith("slide")||n.type.startsWith("trace"))this.drawPath(ctx,n,w,h);
  ctx.save();ctx.translate(p.x,p.y);ctx.shadowBlur=critical?22:13;ctx.shadowColor=critical?"#ffe05a":n.type.startsWith("trace")?"#69e6a9":n.type.includes("flick")?"#ffbd4a":"#58dcff";
  ctx.fillStyle=n.damage?"#ff5577":critical?"#fff19a":n.type.startsWith("trace")?"#69e6a9":n.type.includes("flick")?"#ffc44d":"#f4fbff";
  const s=p.size*margin*clamp(Math.sqrt(n.width||1),1,3);ctx.beginPath();ctx.roundRect(-s*.72,-s*.52,s*1.44,s*1.04,s*.22);ctx.fill();
  if(this.isFlick(n)){ctx.fillStyle="#fff";ctx.beginPath();const ang=(n.dir||0)*45-90;const a=ang*RAD;ctx.moveTo(Math.cos(a)*s*1.05,Math.sin(a)*s*1.05);ctx.lineTo(Math.cos(a+2.45)*s*.35,Math.sin(a+2.45)*s*.35);ctx.lineTo(Math.cos(a-2.45)*s*.35,Math.sin(a-2.45)*s*.35);ctx.closePath();ctx.fill()}
  if(critical){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke()}ctx.restore();
 },
 drawPath(ctx,n,w,h){
  const now=this.time(),pts=n.path||[{t:0,l:n.lane},{t:1,l:n.endLane??n.lane}],draw=[];
  for(let i=0;i<=Math.max(16,pts.length*12);i++){const u=i/Math.max(16,pts.length*12);const l=this.samplePath(pts,u),f=1-(n.time+u*n.duration-now)/(1/this.speed);if(f>=-.05&&f<=1.08)draw.push(this.project(this.mirror?11-l:l,f,w,h))}
  if(draw.length<2)return;ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=n.critical?"rgba(255,221,70,.82)":n.type.startsWith("trace")?"rgba(93,231,166,.72)":"rgba(76,218,239,.72)";ctx.lineWidth=Math.max(5,draw[0].size*.5);ctx.beginPath();ctx.moveTo(draw[0].x,draw[0].y);for(const p of draw.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();
  ctx.fillStyle=n.critical?"#fff0a0":"#8cecff";for(let i=1;i<draw.length-1;i+=8){ctx.beginPath();ctx.arc(draw[i].x,draw[i].y,Math.max(2,draw[i].size*.13),0,Math.PI*2);ctx.fill()}ctx.restore();
 },
 samplePath(pts,u){if(pts.length===1)return pts[0].l;let i=Math.min(pts.length-2,Math.floor(u*(pts.length-1))),a=pts[i],b=pts[i+1],f=u*(pts.length-1)-i;return a.l+(b.l-a.l)*this.ease(f)},
 scrollSpeedAt(t){const ev=this.timescaleEvents||[];if(!ev.length)return 1;let i=-1;for(let k=0;k<ev.length;k++){if(t>=ev[k].time)i=k;else break}if(i<0)return 1;const a=ev[i],b=ev[i+1];if(!b)return a.speed;const u=clamp((t-a.time)/Math.max(.0001,b.time-a.time),0,1);return a.speed+(b.speed-a.speed)*this.ease(u,a.ease||"linear")},
 scrollDistance(a,b){if(Math.abs(b-a)<.000001)return 0;const dir=b>=a?1:-1,lo=Math.min(a,b),hi=Math.max(a,b),cuts=[lo];for(const e of this.timescaleEvents||[])if(e.time>lo&&e.time<hi)cuts.push(e.time);cuts.push(hi);let total=0;for(let i=0;i<cuts.length-1;i++){const x=cuts[i],y=cuts[i+1],steps=Math.max(2,Math.ceil((y-x)*30)),dt=(y-x)/steps;for(let j=0;j<steps;j++){const p=x+(j+.5)*dt;total+=this.scrollSpeedAt(p)*dt}}return total*dir*this.speed},
drawEffects(ctx,w,h){const now=performance.now()/1000;for(const e of this.effects){if(!e.spawn)e.spawn=now;if(!e.max)e.max=e.life||.45;const age=now-e.spawn;e.life=e.max-age;if(e.life<=0)continue;const x=w*(.08+(e.lane+.5)/12*.84),y=h*.82-(e.y||0),p=clamp(age/e.max,0,1);ctx.save();ctx.globalCompositeOperation="lighter";ctx.globalAlpha=Math.max(0,1-p);const base=e.critical?"#fff1a0":e.kind==="miss"?"#ff5577":e.kind==="great"?"#ffe45e":e.kind==="good"?"#63d9ff":e.kind==="flick"?"#ffbf55":"#7de9ff";ctx.strokeStyle=base;ctx.fillStyle=base;ctx.lineWidth=2+4*(1-p);if(e.kind==="slot"){ctx.beginPath();ctx.arc(x,y,18+34*p,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,8+14*p,0,Math.PI*2);ctx.fill()}else if(e.kind==="lane"){ctx.globalAlpha*=.65;ctx.fillRect(x-5,y-90*p,10,90*p)}else if(e.kind==="trace"){for(let i=0;i<8;i++){const a=i*Math.PI/4+(e.seed||0);ctx.beginPath();ctx.arc(x+Math.cos(a)*(10+35*p),y+Math.sin(a)*(10+35*p),2.5,0,Math.PI*2);ctx.fill()}}else{ctx.beginPath();ctx.arc(x,y,10+42*p,0,Math.PI*2);ctx.stroke()}ctx.restore()}this.effects=this.effects.filter(e=>e.life>0)}, updateHud(){const c=$("#pjskCombo"),s=$("#pjskScore"),j=$("#pjskJudge");if(c)c.textContent=this.combo;if(s)s.textContent=String(Math.round(this.score)).padStart(7,"0");if(j)j.textContent=this.lastJudge},
 demo(){this.notes=[];this.slides=[];let t=1,id=0;for(let i=0;i<260;i++){const l=(i*5+i%3)%12;let type=i%29===0?"trace-flick":i%23===0?"slide":i%19===0?"hold":i%13===0?"flick":i%17===0?"trace":"tap";const d=type==="hold"?.62:type.includes("slide")?1.05:type.startsWith("trace")?.9:0;const path=d?[{t:0,l},{t:.32,l:(l+(i%5)-2+12)%12},{t:.7,l:(l+(i%7)-3+12)%12},{t:1,l:(l+(i%2?3:-3)+12)%12}]:[{t:0,l}];this.notes.push({id:id++,time:t,lane:l,type,duration:d,endLane:path[path.length-1].l,path,critical:i%7===0,dir:i%8});t+=i%11===0?.24:i%7===0?.3:.46}this.duration=t+2;this.chartName="Web Dojo Demo";},
 importChart(text,name="chart.sus"){try{const trimmed=text.trim();if(trimmed[0]==="{"||trimmed[0]==="["){const data=JSON.parse(trimmed);this.loadJSON(data);this.chartName=data.title||name;return}this.loadSUS(trimmed);this.chartName=name;this.reset();this.render()}catch(e){console.error(e);alert("譜面格式無法解析："+e.message)}},
 loadJSON(input){
  let normalized=null;
  try{normalized=window.PJSekaiNextSekaiAdapter?.normalize(input)||null}catch(err){console.warn("Next SEKAI adapter fallback:",err)}
  const data=normalized||{title:"Imported JSON",bpm:120,notes:Array.isArray(input)?input:(input?.notes||[]),timescales:[]};
  const normalizedTime=!!normalized;
  this.timescaleEvents=(data.timescales||[]).map(e=>({time:+e.time||0,speed:clamp(+e.speed||1,.05,8),nextSpeed:Number.isFinite(+e.nextSpeed)?clamp(+e.nextSpeed,.05,8):null,ease:String(e.ease||"linear").toLowerCase(),transition:e.transition||"timescale"})).sort((a,b)=>a.time-b.time);
  this.notes=[];let id=0;
  for(const x of data.notes||[]){
   const n={id:id++,time:normalizedTime?(+x.time||0):(+x.time/1000||+x.time||0),lane:clamp(+x.lane||0,0,11),width:clamp(+(x.width||1),1,12),type:String(x.type||"tap").toLowerCase(),duration:+x.duration||0,endLane:clamp(+(x.endLane??x.lane)||0,0,11),critical:!!x.critical,dir:+x.dir||0,fake:!!x.fake,damage:!!x.damage,guideColor:+x.guideColor||0,timescaleGroup:+x.timescaleGroup||0,speed:+x.speed||1,ease:x.ease||"smooth",path:Array.isArray(x.path)?x.path.map(p=>({t:+p.t||0,l:clamp(+p.l||0,0,11)})):null};
   if(n.path?.length)n.endLane=n.path[n.path.length-1].l;
   if(n.type==="fake")n.fake=true;if(n.type==="damage")n.damage=true;
   this.notes.push(n);
  }
  this.bpm=+data.bpm||120;this.nextOptions=data.options||this.nextOptions;
  this.guideQuality=+this.nextOptions.guideQuality||2;this.noteMargin=+this.nextOptions.noteMargin||1;
  this.alternativeCurve=!!this.nextOptions.alternativeCurve;this.disableTimescale=!!this.nextOptions.disableTimescale;
  this.duration=Math.max(1,...this.notes.map(n=>n.time+n.duration))+2;this.reset();this.render()
 },
 loadSUS(text){
  const lines=String(text).replace(/\r/g,"").split("\n"),bpmMap={},measureLen={},raw=[],bpmChanges=[],speedDefs={},activeSpeed=null;
  let tpb=this.ticksPerBeat||480,title="",artist="",baseBpm=120;
  const b36=s=>parseInt(String(s),36);
  for(const line0 of lines){
   const line=line0.trim();if(!line.startsWith("#"))continue;
   let m=line.match(/^#TITLE\s+"([^"]*)"/i);if(m){title=m[1];continue}
   m=line.match(/^#ARTIST\s+"([^"]*)"/i);if(m){artist=m[1];continue}
   m=line.match(/^#REQUEST\s+"?ticks_per_beat\s+(\d+)/i);if(m){tpb=+m[1];continue}
   m=line.match(/^#BASEBPM\s+([\d.+-]+)/i);if(m){baseBpm=+m[1];continue}
   m=line.match(/^#BPM([0-9A-Z]{2}):\s*([\d.+-]+)/i);if(m){bpmMap[m[1].toUpperCase()]=+m[2];continue}
   m=line.match(/^#(\d{3})08:\s*([0-9A-Z]{2})/i);if(m){bpmChanges.push({measure:+m[1],ref:m[2].toUpperCase()});continue}
   m=line.match(/^#(\d{3})02:\s*([\d.]+)/i);if(m){measureLen[+m[1]]=+m[2];continue}
   m=line.match(/^#(?:TIL|HISPEED)([0-9A-Z]{2}):\s*"([^"]*)"/i);if(m){speedDefs[m[1].toUpperCase()]=m[2];continue}
   m=line.match(/^#HISPEED\s+([0-9A-Z]{2})/i);if(m){activeSpeed=m[1].toUpperCase();continue}
   if(/^#NOSPEED/i.test(line)){activeSpeed=null;continue}
   m=line.match(/^#(\d{3})([0-9A-Z])([0-9A-Z])([0-9A-Z])?:\s*([0-9A-Za-z]+)/i);
   if(m)raw.push({measure:+m[1],type:m[2].toUpperCase(),lane:b36(m[3]),channel:(m[4]||"0").toUpperCase(),data:m[5].toUpperCase(),speed:activeSpeed});
  }
  this.ticksPerBeat=tpb;
  const firstKey=Object.keys(bpmMap)[0];this.bpm=baseBpm||(+bpmMap[firstKey]||120);
  const maxMeasure=Math.max(0,...raw.map(x=>x.measure),...bpmChanges.map(x=>x.measure));
  const starts=[],bpms=[];
  let cursor=0,currentBpm=this.bpm;
  const changes=new Map(bpmChanges.map(x=>[x.measure,+bpmMap[x.ref]||currentBpm]));
  for(let m=0;m<=maxMeasure;m++){
   if(changes.has(m))currentBpm=changes.get(m);
   bpms[m]=currentBpm;starts[m]=cursor;cursor+=(measureLen[m]??4)*60/currentBpm;
  }
  const measureTime=(m,frac)=>starts[m]+frac*(measureLen[m]??4)*60/(bpms[m]||this.bpm);
  const dirByLaneTime=new Map(), events=[], slides=new Map(), guides=new Map();
  for(const r of raw){
   const pairs=Math.max(1,Math.floor(r.data.length/2));
   for(let i=0;i<pairs;i++){
    const pair=r.data.slice(i*2,i*2+2);if(pair==="00"||pair.length<2)continue;
    const frac=pairs===1?0:i/(pairs-1),time=measureTime(r.measure,frac),lane=C(r.lane,0,11),v=b36(pair[1]);
    const key=lane+"@"+time.toFixed(6);
    if(r.type==="5"){dirByLaneTime.set(key,v);continue}
    if(r.type==="3"){const arr=slides.get(r.channel)||[];arr.push({time,lane,width:v});slides.set(r.channel,arr);continue}
    if(r.type==="9"){const arr=guides.get(r.channel)||[];arr.push({time,lane,width:v});guides.set(r.channel,arr);continue}
    if(r.type==="4")continue;
    if(r.type==="1"||r.type==="2"||r.type==="3"||r.type==="5"||r.type==="6"||r.type==="7"||r.type==="8"){
      const critical=r.type==="2"||r.type==="6"||r.type==="8";
      const type=r.type==="1"||r.type==="2"?"tap":r.type==="3"?"slide":r.type==="5"||r.type==="6"?"trace":"tap";
      if(type!=="slide")events.push({time,lane,type,critical,dir:dirByLaneTime.get(key)??0,width:v});
    }
   }
  }
  const notes=[];let id=0;
  for(const e of events)notes.push({id:id++,time:e.time,lane:e.lane,type:e.type,duration:0,endLane:e.lane,path:[{t:0,l:e.lane}],critical:e.critical,dir:e.dir});
  for(const arr of slides.values()){
   arr.sort((a,b)=>a.time-b.time);if(arr.length<2)continue;
   const first=arr[0],last=arr[arr.length-1],duration=Math.max(.001,last.time-first.time);
   notes.push({id:id++,time:first.time,lane:first.lane,type:"slide",duration,endLane:last.lane,path:arr.map((p,i)=>({t:(p.time-first.time)/duration,l:p.lane})),critical:false,dir:0});
  }
  notes.sort((a,b)=>a.time-b.time);
  this.notes=notes;this.chartName=title||"Imported SUS";this.artist=artist;this.duration=Math.max(1,...notes.map(n=>n.time+n.duration))+2;
  this.timescaleEvents=[];
  for(let m=0;m<=maxMeasure;m++){
   const b=bpms[m]||this.bpm;if(m===0||Math.abs(b-(bpms[m-1]||b))>.0001)this.timescaleEvents.push({time:starts[m],speed:b/this.bpm,nextSpeed:null,ease:"linear",transition:"scroll"});
  }
  this.reset();this.render();
 }, exportJSON(){const data={title:this.chartName,bpm:this.bpm,notes:this.notes.map(n=>({time:Math.round(n.time*1000),lane:n.lane,type:n.type,duration:n.duration,endLane:n.endLane,critical:n.critical,dir:n.dir,path:n.path}))};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="pjsekai-dojo-chart.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
};
window.PJSekaiWebDojo=Engine;
if(document.readyState==="loading")addEventListener("DOMContentLoaded",()=>Engine.init());else Engine.init();
})();