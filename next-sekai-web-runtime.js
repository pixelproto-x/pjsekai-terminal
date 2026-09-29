/* Next SEKAI Web Runtime parity layer
 * Ports public Next SEKAI concepts to the existing Canvas runtime:
 * frame-based judgment windows, asymmetric flick windows, eased slide paths,
 * per-note timescale integration, damage/fake semantics, slot effects and
 * note/trace/flick particle families.
 */
(()=>{"use strict";
const E=window.PJSekaiWebDojo;if(!E)return;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TAU=Math.PI*2;
const frame=(n)=>n/60*1000;
const WINDOWS={
 tap:{p:[frame(2.5),frame(2.5)],g:[frame(5),frame(5)],good:[frame(6.5),frame(6.5)],bad:[frame(7.5),frame(7.5)]},
 critTap:{p:[frame(3.3),frame(3.3)],g:[frame(4.5),frame(4.5)],good:[frame(6.5),frame(6.5)],bad:[frame(7.5),frame(7.5)]},
 flick:{p:[frame(2.5),frame(2.5)],g:[frame(6.5),frame(7.5)],good:[frame(7),frame(8)],bad:[frame(7.5),frame(8.5)]},
 critFlick:{p:[frame(3.5),frame(3.5)],g:[frame(6.5),frame(7.5)],good:[frame(7),frame(8)],bad:[frame(7.5),frame(8.5)]},
 trace:{p:[frame(5),frame(5)],g:[frame(5),frame(5)],good:[frame(5),frame(5)],bad:[frame(5),frame(5)]},
 traceFlick:{p:[frame(6.5),frame(7.5)],g:[frame(6.5),frame(7.5)],good:[frame(6.5),frame(7.5)],bad:[frame(6.5),frame(7.5)]},
 slideEnd:{p:[frame(3.5),frame(4)],g:[frame(6.5),frame(8)],good:[frame(7.5),frame(8.5)],bad:[frame(8.5),frame(8.5)]}
};
function winFor(n,tail=false){
 const k=n?.type||"tap";
 if(tail)return k.startsWith("trace")?WINDOWS.traceFlick:WINDOWS.slideEnd;
 if(k==="flick")return n.critical?WINDOWS.critFlick:WINDOWS.flick;
 if(k.startsWith("trace-flick"))return WINDOWS.traceFlick;
 if(k.startsWith("trace"))return WINDOWS.trace;
 return n.critical?WINDOWS.critTap:WINDOWS.tap;
}
function judgeWindow(n,delta,tail=false){
 const w=winFor(n,tail),d=-delta;
 if(d>=-w.p[0]&&d<=w.p[1])return"perfect";
 if(d>=-w.g[0]&&d<=w.g[1])return"great";
 if(d>=-w.good[0]&&d<=w.good[1])return"good";
 if(d>=-w.bad[0]&&d<=w.bad[1])return"bad";
 return null;
}
function ease(type,x){
 x=clamp(x,0,1);const t=String(type??"linear").toLowerCase();
 if(t==="none")return x>=1?1:0;
 if(t==="in_quad"||t==="in-quad"||t==="inquad")return x*x;
 if(t==="out_quad"||t==="out-quad"||t==="outquad")return 1-(1-x)*(1-x);
 if(t==="in_out_quad"||t==="in-out-quad"||t==="inoutquad")return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
 if(t==="out_in_quad"||t==="out-in-quad"||t==="outinquad")return x<.5?(1-Math.pow(1-2*x,2))/2:.5+Math.pow(2*x-1,2)/2;
 if(t==="smooth"||t==="ease"||t==="cubic")return x*x*(3-2*x);
 return x;
}
function eventSpeed(events,t){
 if(!Array.isArray(events)||!events.length)return 1;
 let speed=1;
 for(let i=0;i<events.length;i++){
  const e=events[i],next=events[i+1],at=Number(e.time)||0,to=next?Number(next.time):Infinity;
  if(t<at)break;
  const a=Math.max(.001,Number(e.speed??e.timescale??1));
  if(next&&t<to){
   const b=Math.max(.001,Number(next.speed??next.timescale??a));
   const u=clamp((t-at)/Math.max(.000001,to-at),0,1);
   speed=ease(e.ease??"linear",u)*(b-a)+a;
   break;
  }
  speed=a;
 }
 return speed;
}
function integrate(events,a,b){
 if(b<=a)return 0;
 if(!Array.isArray(events)||!events.length)return b-a;
 let sum=0,t=a,guard=0;
 while(t<b&&guard++<256){
  let next=b;
  for(const e of events){const et=Number(e.time);if(et>t&&et<next)next=et}
  const mid=(t+next)/2;
  const sm=eventSpeed(events,mid);
  const s0=eventSpeed(events,t),s1=eventSpeed(events,next);
  sum+=(next-t)*(s0+s1+4*sm)/6;
  t=next;
 }
 return sum;
}
function scaledRemaining(n,now){
 const target=n.time;
 if(now>=target)return 0;
 const events=this.timescaleEventsFor(n);
 return integrate(events,now,target);
}
function particleSpawn(lane,type,critical=false,life=.6,count=8){
 const list=this.particles||(this.particles=[]);
 const seed=Math.random()*TAU;
 for(let i=0;i<count;i++){
  const a=seed+i*TAU/count+(Math.random()-.5)*.35;
  list.push({lane:lane,type,critical,x:Math.cos(a)*(4+Math.random()*18),y:Math.sin(a)*(4+Math.random()*18),vx:Math.cos(a)*(20+Math.random()*45),vy:Math.sin(a)*(20+Math.random()*45)-18,life,max:life,size:2+Math.random()*4});
 }
}
E.timescaleEventsFor=function(n){
 if(this.disableTimescale)return[];
 return Array.isArray(n.timescaleEvents)?n.timescaleEvents:[];
};
E.scaledRemaining=scaledRemaining;
E.visualProgress=function(n,now){
 const travel=.95/Math.max(.05,this.speed);
 return 1-clamp(this.scaledRemaining(n,now)/travel,-.15,1.15);
};
E.judgeName=function(delta,n,tail=false){return judgeWindow(n||{type:"tap"},delta,tail)};
E.slideLaneAt=function(n,t){
 const f=clamp((t-n.time)/Math.max(.000001,n.duration),0,1);
 const pts=n.path?.length?n.path:[{t:0,l:n.lane},{t:1,l:n.endLane??n.lane}];
 if(pts.length===1)return pts[0].l;
 let i=0;while(i<pts.length-1&&f>Number(pts[i+1].t))i++;
 const a=pts[i],b=pts[Math.min(i+1,pts.length-1)];
 const raw=clamp((f-Number(a.t||0))/Math.max(.000001,Number(b.t??1)-Number(a.t||0)),0,1);
 const eased=ease(b.ease??a.ease??n.ease??"linear",raw);
 const base=a.l+(b.l-a.l)*eased;
 if(Array.isArray(n.timescaleCurve)&&n.timescaleCurve.length>1){
  const q=n.timescaleCurve[Math.min(n.timescaleCurve.length-1,Math.floor(f*(n.timescaleCurve.length-1)))];
  if(Number.isFinite(q))return base+q;
 }
 return base;
};
const oldJudge=E.judgeNote;
E.judgeNote=function(n,lane,dx,dy,p,e){
 if(n.fake)return false;
 if(n.damage){n.hit=true;n.damageHit=true;this.combo=0;this.counts.miss++;this.lastJudge="DAMAGE";this.sfx("miss");this.spawnNextEffects(n,"damage");return true}
 const delta=n.time*1000-(this.time()*1000+this.offset);
 const tail=n.active&&(n.type==="hold"||n.type==="slide"||n.type.startsWith("trace"))&&this.time()>=n.holdUntil-.25;
 const j=this.judgeName(delta,n,tail);if(!j)return false;
 if(this.isFlick(n)&&!this.expectedDirection(n,dx,dy))return false;
 n.hit=true;n.active=["hold","slide","trace","trace-flick"].includes(n.type);n.hitAt=this.time();n.holdUntil=n.time+n.duration;n.progress=0;
 this.award(j,n);if(p)p.note=n;return true;
};
const oldAward=E.award;
E.award=function(j,n){
 oldAward.call(this,j,n);this.spawnNextEffects(n,j);
};
E.spawnNextEffects=function(n,j){
 const type=n.type.startsWith("trace")?"trace":n.type.includes("flick")?"flick":n.type==="slide"||n.type==="hold"?"slide":"tap";
 const critical=!!n.critical;
 this.particles=this.particles||[];
 this.slotEffects=this.slotEffects||[];
 this.slotEffects.push({lane:n.lane,size:Math.max(1,(n.size||1)),type,critical,life:.5,max:.5});
 particleSpawn.call(this,n.lane,type,critical,j==="perfect"?0.65:.5,j==="perfect"?12:7);
 if(type==="flick"||type==="trace")particleSpawn.call(this,n.lane,"directional",critical,.35,5);
 if(type==="slide")particleSpawn.call(this,n.lane,"trail",critical,.8,4);
};
E.updateParticles=function(dt){
 const ps=this.particles||[];
 for(const p of ps){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=55*dt;p.size*=.994}
 this.particles=ps.filter(p=>p.life>0);
 const ss=this.slotEffects||[];for(const x of ss)x.life-=dt;this.slotEffects=ss.filter(x=>x.life>0);
};
E.drawNextEffects=function(ctx,w,h){
 const ps=this.particles||[],ss=this.slotEffects||[];
 for(const x of ss){
  const f=clamp(x.life/x.max,0,1),xx=w*(.08+(x.lane+.5)/12*.84),yy=h*.84;
  ctx.save();ctx.globalAlpha=f*.75;ctx.strokeStyle=x.critical?"#ffe45b":x.type==="flick"?"#ff6b55":x.type==="slide"?"#5ee4a2":"#57d8ef";ctx.lineWidth=2+4*f;
  ctx.beginPath();ctx.roundRect(xx-18-f*10,yy-5-f*5,36+f*20,10+f*10,8);ctx.stroke();ctx.restore();
 }
 for(const p of ps){
  const laneX=w*(.08+(p.lane+.5)/12*.84),xx=laneX+p.x,yy=h*.79+p.y;
  const f=clamp(p.life/p.max,0,1);
  ctx.save();ctx.globalAlpha=f;ctx.fillStyle=p.critical?"#ffe45b":p.type==="flick"?"#ff765f":p.type==="trace"?"#69e6a9":"#69dcf4";ctx.beginPath();ctx.arc(xx,yy,Math.max(1,p.size*f),0,TAU);ctx.fill();ctx.restore();
 }
};
const oldRender=E.render;
E.render=function(){
 const ctx=this.ctx,r=this.canvas?.getBoundingClientRect();if(!ctx||!r)return;
 const w=r.width,h=r.height,now=this.time();
 ctx.clearRect(0,0,w,h);
 const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,"#050713");bg.addColorStop(.6,"#0c1730");bg.addColorStop(1,"#101b39");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 this.drawStage(ctx,w,h);
 for(const n of this.notes){
  if(n.missed||n.fake)continue;
  const f=this.visualProgress(n,now);
  if(f<-.04||f>1.1)continue;
  if(this.sudden&&f<.48&&!n.active)continue;
  this.drawNote(ctx,n,f,w,h);
  if(n.duration>0||n.type.startsWith("slide")||n.type.startsWith("trace"))this.drawPath(ctx,n,w,h);
  const p=this.project(this.mirror?11-n.lane:n.lane,f,w,h);
  if(Math.abs(now-n.time)<.035)this.drawNextSlotGlow(ctx,p,n);
 }
 this.drawNextEffects(ctx,w,h);this.drawEffects(ctx,w,h);this.updateHud();
};
E.drawNextSlotGlow=function(ctx,p,n){
 const pulse=.5+.5*Math.sin(this.time()*Math.PI*10);
 ctx.save();ctx.globalAlpha=.16+.16*pulse;ctx.strokeStyle=n.damage?"#ff5474":n.critical?"#ffe45b":n.type.includes("flick")?"#ff6655":n.type.startsWith("trace")?"#69e6a9":n.type==="slide"?"#5ee4a2":"#57d8ef";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,p.size*1.1,p.size*.7,0,0,TAU);ctx.stroke();ctx.restore();
};
const oldDrawPath=E.drawPath;
E.drawPath=function(ctx,n,w,h){
 const now=this.time(),pts=n.path?.length?n.path:[{t:0,l:n.lane},{t:1,l:n.endLane??n.lane}],draw=[],count=Math.max(24,pts.length*20);
 for(let i=0;i<=count;i++){const u=i/count,l=this.slideLaneAt(n,n.time+u*n.duration),f=this.visualProgress({time:n.time+u*n.duration,lane:l,duration:0,timescaleEvents:[],speed:n.speed||1},now);if(f>=-.05&&f<=1.08)draw.push(this.project(this.mirror?11-l:l,f,w,h))}
 if(draw.length<2)return;
 ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
 const color=n.damage?"rgba(255,70,110,.86)":n.critical?"rgba(255,221,70,.82)":n.type.startsWith("trace")?"rgba(93,231,166,.72)":"rgba(76,218,239,.72)";
 ctx.strokeStyle=color;ctx.lineWidth=Math.max(5,draw[0].size*.5);ctx.beginPath();ctx.moveTo(draw[0].x,draw[0].y);for(const p of draw.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();
 if(this.guideQuality>=2){ctx.fillStyle=color;for(let i=1;i<draw.length-1;i+=5){ctx.beginPath();ctx.arc(draw[i].x,draw[i].y,Math.max(2,draw[i].size*.11),0,TAU);ctx.fill()}}
 ctx.restore();
};
const oldLoop=E.loop;
E.loop=function(){if(!this.running)return;this.updateMisses();if(this.autoplay)this.autoPlay();this.updateParticles(.016);this.render();this.raf=requestAnimationFrame(()=>this.loop())};
const oldReset=E.resetJudgments;
E.resetJudgments=function(render=true){this.particles=[];this.slotEffects=[];oldReset.call(this,render)};
E.configureNextParity=function(){this.windows={perfect:frame(2.5),great:frame(5),good:frame(6.5),bad:frame(7.5),trace:frame(5)}};
E.configureNextParity();
})();