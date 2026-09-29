(()=>{"use strict";
const state={songId:"",difficulty:"Expert",noteSpeed:7,mirror:false,sudden:false,hidden:false,playing:false,time:0,bpm:120,audio:null,last:0,notes:[],particles:[],score:0,combo:0,maxCombo:0,judgements:{perfect:0,great:0,good:0,bad:0,miss:0},hits:new Map()};
const root=document.getElementById("root"),view=document.getElementById("view"),hud=document.getElementById("hud"),info=document.getElementById("info"),play=document.getElementById("play"),reset=document.getElementById("reset");
const app=new PIXI.Application(),stage=new PIXI.Container(),guide=new PIXI.Container(),notesLayer=new PIXI.Container(),fx=new PIXI.Container();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function geometry(){const w=view.clientWidth||1280,h=view.clientHeight||720;return{w,h,top:h*.10,bottom:h*.91,hit:h*.82,leftTop:w*.205,rightTop:w*.795,leftBottom:w*.018,rightBottom:w*.982}}
function lanePoint(l,y){const g=geometry(),p=clamp((y-g.top)/(g.bottom-g.top),0,1),u=clamp((state.mirror?11-l:l)/11,0,1);return{x:g.leftTop+(g.rightTop-g.leftTop)*u+(g.leftBottom-g.leftTop+(g.rightBottom-g.rightTop-g.leftBottom+g.leftTop)*u)*p,y}}
function laneX(l,y){return lanePoint(l,y).x}
function noteY(t){const g=geometry(),travel=.74/(Math.max(.1,state.noteSpeed)/7),d=(t-state.time)*travel;return g.hit-d*g.h*.92}
function buildScene(){app.stage.addChild(stage,guide,notesLayer,fx);window.addEventListener("resize",layout);layout()}
function layout(){const g=geometry();stage.removeChildren();guide.removeChildren();const bg=new PIXI.Graphics();bg.rect(0,0,g.w,g.h).fill({color:0x050713});stage.addChild(bg);const lane=new PIXI.Graphics();lane.moveTo(g.leftTop,g.top).lineTo(g.rightTop,g.top).lineTo(g.rightBottom,g.bottom).lineTo(g.leftBottom,g.bottom).closePath().fill({color:0x10182f,alpha:.98}).stroke({color:0x7181c5,width:2,alpha:.56});stage.addChild(lane);for(let i=0;i<=12;i++){const t=i/12,x1=g.leftTop+(g.rightTop-g.leftTop)*t,x2=g.leftBottom+(g.rightBottom-g.leftBottom)*t;const l=new PIXI.Graphics();l.moveTo(x1,g.top).lineTo(x2,g.bottom).stroke({color:0x8092c8,width:i%3===0?1.6:1,alpha:i%3===0?.38:.17});guide.addChild(l)}for(const p of [.18,.34,.52,.70]){const y=g.top+(g.bottom-g.top)*p,lw=g.leftTop+(g.leftBottom-g.leftTop)*p,rw=g.rightTop+(g.rightBottom-g.rightTop)*p;const d=new PIXI.Graphics();d.moveTo(lw,y).lineTo(rw,y).stroke({color:0x7181c5,width:p<.4?1:1.4,alpha:.16});guide.addChild(d)}const vanish=new PIXI.Graphics();vanish.circle((g.leftTop+g.rightTop)/2,g.top,Math.max(18,g.w*.018)).fill({color:0x74ecff,alpha:.045}).stroke({color:0x74ecff,width:1,alpha:.12});guide.addChild(vanish);const hit=new PIXI.Graphics();hit.moveTo(g.leftBottom,g.hit).lineTo(g.rightBottom,g.hit).stroke({color:0x74ecff,width:4,alpha:.95});const hitGlow=new PIXI.Graphics();hitGlow.moveTo(g.leftBottom,g.hit).lineTo(g.rightBottom,g.hit).stroke({color:0x74ecff,width:14,alpha:.06});guide.addChild(hitGlow,hit)}
function seeded(){let r=7;for(const c of String(state.songId)+"|"+state.difficulty)r=(r*1664525+c.charCodeAt(0)+1013904223)>>>0;return()=>((r=(r*1664525+1013904223)>>>0)/4294967296)}
function difficultyDensity(){return{Easy:52,Normal:82,Hard:118,Expert:170,Master:214,Append:268}[state.difficulty]||170}
function makeNote(id,lane,time,type="tap",opts={}){
 return {id,lane,time,type,duration:Math.max(0,Number(opts.duration)||0),endLane:opts.endLane??lane,path:Array.isArray(opts.path)?opts.path:null,dir:Number(opts.dir)||0,critical:!!opts.critical,hit:false,miss:false,held:false,holdOk:false,slideProgress:0};
}
function buildNotes(){
 const rnd=seeded(),count=difficultyDensity(),beat=60/(state.bpm||120),notes=[];let t=1,id=0;
 for(let i=0;i<count;){
  const lane=Math.floor(rnd()*12),r=rnd(),critical=rnd()<.1;let type="tap",duration=0,endLane=lane,path=null,dir=0;
  if(r<.14){type="flick";dir=[0,2,3,4,5][Math.floor(rnd()*5)]}
  else if(r<.31){type="hold";duration=beat*(1+rnd()*4)}
  else if(r<.46){type="slide";duration=beat*(1.5+rnd()*3);endLane=Math.floor(rnd()*12);const m1=clamp(Math.round(lane+(endLane-lane)*.38)+(rnd()<.5?-1:1),0,11),m2=clamp(Math.round(lane+(endLane-lane)*.68)+(rnd()<.5?-1:1),0,11);path=[{t:0,l:lane},{t:.38,l:m1},{t:.68,l:m2},{t:1,l:endLane}]}
  notes.push(makeNote(id++,lane,t,type,{duration,endLane,path,dir,critical}));i++;
  if(rnd()<.13&&i<count){let lane2=Math.floor(rnd()*12);if(Math.abs(lane2-lane)<2)lane2=(lane2+5)%12;const t2=rnd()<.16?"flick":"tap";notes.push(makeNote(id++,lane2,t,t2,{dir:t2==="flick"?[0,2,3][Math.floor(rnd()*3)]:0,critical:rnd()<.07}));i++}
  t+=beat*(rnd()<.76?.5:rnd()<.35?.75:1);
 }
 notes.sort((a,b)=>a.time-b.time||a.lane-b.lane);state.notes=notes;state.time=0;state.score=0;state.combo=0;state.maxCombo=0;state.judgements={perfect:0,great:0,good:0,bad:0,miss:0};state.particles=[];info.textContent=state.songId+" · "+state.difficulty;renderHud()
}
function loadChart(chart){
 const src=Array.isArray(chart)?{notes:chart}:chart&&typeof chart==="object"?chart:null;if(!src||!Array.isArray(src.notes))return false;
 state.bpm=Number(src.bpm)||120;
 state.notes=src.notes.map((n,i)=>makeNote(i,clamp(Math.round(Number(n.lane)||0),0,11),Number(n.time)||0,String(n.type||"tap").toLowerCase(),{duration:Number(n.duration)||0,endLane:clamp(Math.round(Number(n.endLane??n.lane)||0),0,11),path:Array.isArray(n.path)?n.path.map(p=>({t:clamp(Number(p.t)||0,0,1),l:clamp(Math.round(Number(p.l??p.lane)||0),0,11)})):null,dir:Number(n.dir??n.direction)||0,critical:!!n.critical})).sort((a,b)=>a.time-b.time||a.lane-b.lane);
 state.time=0;state.score=0;state.combo=0;state.maxCombo=0;state.judgements={perfect:0,great:0,good:0,bad:0,miss:0};state.particles=[];info.textContent=(src.title||state.songId||"Chart")+" · "+state.difficulty;renderHud();return true
}

function grade(delta){const a=Math.abs(delta);if(a<=41.667)return"perfect";if(a<=83.333)return"great";if(a<=108.333)return"good";if(a<=125)return"bad";return null}
function addFx(x,y,kind){const g=new PIXI.Graphics();g.circle(0,0,kind==="perfect"?20:15).fill({color:kind==="perfect"?0xffe35f:0x6fe7ff,alpha:.3}).stroke({color:0xffffff,width:2,alpha:.9});g.x=x;g.y=y;fx.addChild(g);state.particles.push({g,t:0,d:.24})}
function renderHud(){hud.textContent="COMBO "+state.combo+"   SCORE "+String(Math.round(state.score)).padStart(7,"0")}
function noteScale(y){const g=geometry(),p=clamp((y-g.top)/(g.bottom-g.top),0,1);return .28+.92*p}
function laneAt(n,t){if(!n.path?.length)return n.lane;const p=clamp((t-n.time)/Math.max(.001,n.duration),0,1);let i=0;while(i<n.path.length-1&&p>n.path[i+1].t)i++;const a=n.path[i],b=n.path[Math.min(i+1,n.path.length-1)],u=clamp((p-a.t)/Math.max(.001,b.t-a.t),0,1);return a.l+(b.l-a.l)*u}
function drawHold(n,y,x,w){
 if(!n.duration)return;const g0=geometry(),pts=[],steps=n.type==="slide"?24:10;
 for(let i=0;i<=steps;i++){const p=i/steps,tt=n.time+n.duration*p,yy=noteY(tt),xx=laneX(laneAt(n,tt),yy);if(yy>-150&&yy<g0.h+150)pts.push([xx,yy])}
 if(pts.length<2)return;const line=new PIXI.Graphics();line.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)line.lineTo(pts[i][0],pts[i][1]);line.stroke({color:n.type==="slide"?0x66d8ff:(n.holdOk?0x9bffcf:0x63e8a9),width:Math.max(6,w*.74),alpha:.94});notesLayer.addChild(line);
 const edge=new PIXI.Graphics();edge.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)edge.lineTo(pts[i][0],pts[i][1]);edge.stroke({color:0xffffff,width:Math.max(1.5,w*.12),alpha:n.type==="slide"?.62:.42});notesLayer.addChild(edge);
 const tail=pts[pts.length-1],cap=new PIXI.Graphics();cap.roundRect(-w*.55,-Math.max(5,w*.12),w*1.1,Math.max(10,w*.24),5).fill({color:n.type==="slide"?0x8feaff:0x86f0b7,alpha:.96}).stroke({color:0xffffff,width:1,alpha:.7});cap.x=tail[0];cap.y=tail[1];notesLayer.addChild(cap)
}
function drawNote(n){
 const y=noteY(n.time),g=geometry();if(y<-120||y>g.h+120)return;const x=laneX(laneAt(n,n.time),y),s=noteScale(y),w=Math.max(10,Math.min(78,g.w/12*.92)*s),h=Math.max(10,w*.34);
 if(n.duration)drawHold(n,y,x,w);if(state.sudden&&y<g.h*.55)return;
 const alpha=state.hidden?.18:1,color=n.critical?0xffef9b:n.type==="flick"?0xffa066:n.type==="slide"?0x74dfff:0xf4fbff;
 const q=new PIXI.Graphics();q.roundRect(-w*.72,-h*.5,w*1.44,h,Math.max(3,h*.28)).fill({color,alpha}).stroke({color:n.critical?0xffffff:n.type==="slide"?0x8fe8ff:0x96dbff,width:Math.max(1,s*(n.critical?2:1)),alpha:.96});q.x=x;q.y=y;notesLayer.addChild(q);
 if(n.type==="flick"){const d={0:[0,-1],1:[0,1],2:[-.86,-.5],3:[.86,-.5],4:[-.86,.5],5:[.86,.5]}[n.dir]||[0,-1],a=new PIXI.Graphics();a.moveTo(d[0]*w*.55,d[1]*h*.9).lineTo(-d[1]*w*.42,d[0]*h*.42).lineTo(d[1]*w*.42,-d[0]*h*.42).closePath().fill({color:0xffffff,alpha});a.x=x;a.y=y;notesLayer.addChild(a)}
 if(n.type==="slide"){const c=new PIXI.Graphics();c.circle(0,0,Math.max(2,w*.11)).fill({color:0xffffff,alpha:.28});c.x=x;c.y=y;notesLayer.addChild(c)}
 if(n.critical){const z=new PIXI.Graphics();z.circle(0,0,Math.max(3,w*.19)).fill({color:0xffffff,alpha:.34}).stroke({color:0xfff4c2,width:1.2,alpha:.7});z.x=x;z.y=y;notesLayer.addChild(z)}
}

function nearest(x,y){let best=null,score=Infinity;for(const n of state.notes){if(n.hit||n.miss)continue;const ny=noteY(n.time),nx=laneX(n.lane,ny),d=Math.hypot(nx-x,ny-y),window=state.noteSpeed>9?72:84;if(d<window&&d<score){score=d;best=n}}return best}
function hit(x,y){const n=nearest(x,y);if(!n)return;const delta=(state.time-n.time)*1000;if(Math.abs(delta)>142)return;const j=grade(delta);if(!j){n.miss=true;state.combo=0;state.judgements.miss++;renderHud();return}n.hit=true;n.held=n.duration>0;n.holdOk=false;state.combo++;state.maxCombo=Math.max(state.maxCombo,state.combo);state.judgements[j]++;state.score+=(n.critical?20:10)*({perfect:1,great:.7,good:.45,bad:0}[j]||0);addFx(x,y,j);renderHud()}
function updateHold(){for(const n of state.notes){if(!n.hit||!n.duration||!n.held)continue;const end=n.time+n.duration,delta=(state.time-end)*1000;if(delta>=-72&&delta<=120)n.holdOk=true;if(delta>120){n.held=false;if(n.holdOk){state.combo++;state.maxCombo=Math.max(state.maxCombo,state.combo);state.score+=6;addFx(laneX(n.lane,noteY(end)),geometry().hit,"release")}else{state.combo=0;state.judgements.miss++}}}}
function tick(){const now=performance.now(),dt=Math.min(.05,(now-(state.last||now))/1000);state.last=now;if(state.playing){if(state.audio&&!state.audio.paused)state.time=state.audio.currentTime||0;else state.time+=dt}notesLayer.removeChildren();updateHold();for(const n of state.notes){if(!n.hit&&!n.miss&&state.time-n.time>.142){n.miss=true;state.combo=0;state.judgements.miss++}if(!n.hit&&!n.miss)drawNote(n)}for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.t+=dt;p.g.alpha=1-p.t/p.d;p.g.scale.set(.5+1.7*p.t/p.d);if(p.t>=p.d){p.g.destroy();state.particles.splice(i,1)}}renderHud();if(state.playing&&state.time>Math.max(...state.notes.map(n=>n.time+(n.duration||0)))+1){state.playing=false;if(state.audio)state.audio.pause()}}function animate(){tick();requestAnimationFrame(animate)}
function setOptions(p){if(p.songId!==undefined)state.songId=String(p.songId);if(p.difficulty)state.difficulty=String(p.difficulty);if(Number.isFinite(Number(p.noteSpeed)))state.noteSpeed=clamp(Number(p.noteSpeed),1,12);if(p.mirror!==undefined)state.mirror=!!p.mirror;if(p.sudden!==undefined)state.sudden=!!p.sudden;if(p.hidden!==undefined)state.hidden=!!p.hidden;buildNotes()}
window.addEventListener("message",e=>{if(e.source!==window.parent||e.origin!==location.origin)return;const m=e.data||{};if(m.source!=="pjsekai-terminal")return;if(m.type==="PJSK_DOJO_SET_OPTIONS")setOptions(m.payload||{});if(m.type==="PJSK_DOJO_SET_CHART")loadChart(m.payload?.chart||m.payload);if(m.type==="PJSK_DOJO_SET_AUDIO"){const url=String(m.payload?.dataUrl||"");if(state.audio)state.audio.pause();state.audio=url?new Audio(url):null;if(state.audio){state.audio.preload="auto";state.audio.addEventListener("ended",()=>state.playing=false)}}if(m.type==="PJSK_DOJO_PLAY"){state.playing=true;if(state.audio?.paused)state.audio.play().catch(()=>{})}if(m.type==="PJSK_DOJO_PAUSE"){state.playing=false;state.audio?.pause()}});
view.addEventListener("pointerdown",e=>{e.preventDefault();const r=view.getBoundingClientRect();hit(e.clientX-r.left,e.clientY-r.top);view.setPointerCapture?.(e.pointerId)});
play.addEventListener("click",()=>{state.playing=!state.playing;if(state.audio){if(state.playing)state.audio.play().catch(()=>{});else state.audio.pause()}});
reset.addEventListener("click",()=>{buildNotes();state.audio?.pause()});
(async()=>{await app.init({resizeTo:view,antialias:true,background:0x050713,resolution:Math.min(2,devicePixelRatio||1),autoDensity:true});view.appendChild(app.canvas);app.canvas.style.width="100%";app.canvas.style.height="100%";app.canvas.style.display="block";buildScene();buildNotes();app.ticker.add(()=>{});animate();window.parent!==window&&window.parent.postMessage({type:"PJSK_DOJO_READY"},"*")})()
})();