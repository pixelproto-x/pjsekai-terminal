(()=>{"use strict";
const state={songId:"",difficulty:"Expert",noteSpeed:7,mirror:false,sudden:false,hidden:false,playing:false,time:0,bpm:120,audio:null,lastFrame:0,notes:[],particles:[],score:0,combo:0};
const root=document.getElementById("root");
const hud=document.getElementById("hud");
const info=document.getElementById("info");
const view=document.getElementById("view");
const app=new PIXI.Application();
async function boot(){
 await app.init({resizeTo:view,antialias:true,background:"#050713",resolution:Math.min(2,devicePixelRatio||1),autoDensity:true});
 view.appendChild(app.canvas);
 app.canvas.style.width="100%";app.canvas.style.height="100%";app.canvas.style.display="block";app.canvas.style.touchAction="none";
 buildScene();
 window.parent?.postMessage({type:"PJSK_DOJO_READY"},location.origin);
 app.ticker.add(tick);
}
const stage=new PIXI.Container(),notesLayer=new PIXI.Container(),fxLayer=new PIXI.Container(),guideLayer=new PIXI.Container();
function buildScene(){
 app.stage.addChild(stage,guideLayer,notesLayer,fxLayer);
 window.addEventListener("resize",layout);
 window.addEventListener("message",onMessage);
 view.addEventListener("pointerdown",onPointer,{passive:false});
 layout();loadChart();
}
function layout(){
 const w=view.clientWidth||1280,h=view.clientHeight||720;
 stage.removeChildren();guideLayer.removeChildren();
 const bg=new PIXI.Graphics();
 bg.rect(0,0,w,h).fill({color:0x060914});
 stage.addChild(bg);
 const top=h*.16,bottom=h*.94,left=w*.13,right=w*.87;
 const lane=new PIXI.Graphics();
 lane.moveTo(left,top).lineTo(right,top).lineTo(w*.98,bottom).lineTo(w*.02,bottom).closePath().fill({color:0x111a35,alpha:.96}).stroke({color:0x6b78b8,width:2,alpha:.5});
 stage.addChild(lane);
 for(let i=0;i<=12;i++){
  const p=i/12,xt=left+(right-left)*p,xb=w*.02+(w*.96)*p;
  const g=new PIXI.Graphics();g.moveTo(xt,top).lineTo(xb,bottom).stroke({color:0x6370a8,width:i===0||i===12?2:1,alpha:i%3===0?.5:.22});guideLayer.addChild(g);
 }
 const hit=new PIXI.Graphics();hit.moveTo(w*.02,h*.86).lineTo(w*.98,h*.86).stroke({color:0x7ce8ff,width:4,alpha:.95});guideLayer.addChild(hit);
 for(const x of [0,.25,.5,.75,1]){const g=new PIXI.Graphics();g.moveTo(w*(.02+.96*x),h*.86).lineTo(w*(.02+.96*x),h*.94).stroke({color:0x7ce8ff,width:1,alpha:.2});guideLayer.addChild(g)}
}
function laneX(lane,y){
 const w=view.clientWidth||1280,h=view.clientHeight||720;
 const yt=h*.16,yb=h*.86,f=Math.max(0,Math.min(1,(y-yt)/(yb-yt)));
 const lx=w*.13+(w*.74)*((state.mirror?11-lane:lane)/11);
 const bx=w*.02+(w*.96)*((state.mirror?11-lane:lane)/11);
 return lx+(bx-lx)*f;
}
function noteY(time){
 const w=view.clientWidth||1280,h=view.clientHeight||720,hit=h*.86;
 const travel=.78/(Math.max(.1,state.noteSpeed)/7);
 const delta=(time-state.time)*travel;
 return hit-delta*(h*.72);
}
function buildNotes(){
 const n=Math.max(72,Math.min(420,Number(state.notes)||180)),bpm=state.bpm||120,beat=60/bpm;
 const seed=[...(String(state.songId)+state.difficulty)].reduce((a,c)=>((a*33+c.charCodeAt(0))>>>0),7);
 let r=seed;
 const rnd=()=>{r=(r*1664525+1013904223)>>>0;return r/4294967296};
 state.notes=[];
 for(let i=0;i<n;i++){
  const lane=Math.floor(rnd()*12),time=1.2+i*beat*(rnd()<.72?.5:1),hold=rnd()<.16?beat*(1+rnd()*4):0,flick=rnd()<.12,critical=rnd()<.08;
  state.notes.push({id:i,lane,time,duration:hold,type:flick?"flick":hold?"hold":"tap",critical,hit:false});
 }
 state.time=0;state.score=0;state.combo=0;state.playing=false;
 info.textContent=state.songId+" · "+state.difficulty;
}
function loadChart(){buildNotes();renderHud()}
function addFx(x,y,kind){
 const g=new PIXI.Graphics();g.circle(0,0,kind==="critical"?26:18).fill({color:kind==="critical"?0xffe75e:0x61d7f0,alpha:.28}).stroke({color:0xffffff,width:2,alpha:.9});g.x=x;g.y=y;g.alpha=1;g.scale.set(.3);fxLayer.addChild(g);state.particles.push({g,life:0,max:.22});
}
function renderHud(){hud.textContent="COMBO "+state.combo+"   SCORE "+String(state.score).padStart(7,"0");}
function drawNote(n){
 const y=noteY(n.time);if(y< -120||y>view.clientHeight+140)return;
 const p=.02+.96*(state.mirror?11-n.lane:n.lane)/11;
 const x=laneX(n.lane,y),w=view.clientWidth||1280;
 const width= Math.max(12,(.74-(Math.abs(y-(view.clientHeight*.86))/Math.max(1,view.clientHeight*.7))*.2)*w/12);
 if(n.duration){
  const endY=noteY(n.time+n.duration),g=new PIXI.Graphics();g.moveTo(x,y).lineTo(laneX(n.lane,endY),endY).stroke({color:0x65e6a7,width:Math.max(8,width*.72),alpha:.9});notesLayer.addChild(g);
 }
 const c=n.critical?0xfff09b:n.type==="flick"?0xff9e61:0xf1fbff;
 const g=new PIXI.Graphics();g.roundRect(-width*.7,-Math.max(7,width*.18),width*1.4,Math.max(14,width*.36),Math.max(4,width*.12)).fill({color:c,alpha:state.hidden?.16:1}).stroke({color:n.critical?0xffffff:0x9fdfff,width:n.critical?2:1,alpha:.9});g.x=x;g.y=y;notesLayer.addChild(g);
 if(n.type==="flick"){const a=new PIXI.Graphics();a.moveTo(-7,6).lineTo(0,-10).lineTo(7,6).lineTo(0,1).closePath().fill({color:0xffffff,alpha:1});a.x=x;a.y=y;notesLayer.addChild(a)}
 if(n.critical){const c2=new PIXI.Graphics();c2.circle(x,y,Math.max(5,width*.18)).fill({color:0xffffff,alpha:.35});notesLayer.addChild(c2)}
 if(state.sudden&&y<view.clientHeight*.56)return;
}
function tick(delta){
 const dt=Math.min(.05,delta/(app.ticker.maxFPS||60));if(state.playing)state.time+=dt;
 notesLayer.removeChildren();
 for(const n of state.notes){if(!n.hit)drawNote(n);if(!n.hit&&state.time-n.time>.14+(7-state.noteSpeed)*.006)n.miss=true}
 for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.life+=dt;p.g.alpha=1-p.life/p.max;p.g.scale.set(.3+2*p.life/p.max);if(p.life>=p.max){p.g.destroy();state.particles.splice(i,1)}}
 fxLayer.sortableChildren=true;
 renderHud();
 if(state.playing&&state.time>Math.max(...state.notes.map(n=>n.time+(n.duration||0)))+1)state.playing=false;
}
function judgeAt(x,y){
 let best=null,score=Infinity;
 for(const n of state.notes){
  if(n.hit||n.miss)continue;
  const ny=noteY(n.time),nx=laneX(n.lane,ny),d=Math.hypot(nx-x,ny-y);
  if(d<Math.min(74,view.clientWidth/8)&&d<score){best=n;score=d}
 }
 if(!best)return;
 const nowDelta=(state.time-best.time)*1000;
 if(Math.abs(nowDelta)>142)return;
 best.hit=true;state.combo++;state.score+=best.critical?30:10;if(best.duration)best.heldAt=state.time;addFx(x,y,best.critical?"critical":"tap");renderHud();
}
function onPointer(e){e.preventDefault();const r=view.getBoundingClientRect();judgeAt(e.clientX-r.left,e.clientY-r.top)}
function onMessage(e){
 if(e.source!==window.parent)return;
 const m=e.data||{};if(m.source!=="pjsekai-terminal")return;
 if(m.type==="PJSK_DOJO_SET_OPTIONS"){const p=m.payload||{};if(p.songId!==undefined)state.songId=String(p.songId);if(p.difficulty)state.difficulty=String(p.difficulty);if(p.noteSpeed)state.noteSpeed=Math.max(1,Math.min(12,Number(p.noteSpeed)||7));if(p.mirror!==undefined)state.mirror=!!p.mirror;if(p.sudden!==undefined)state.sudden=!!p.sudden;if(p.hidden!==undefined)state.hidden=!!p.hidden;buildNotes();renderHud()}
 if(m.type==="PJSK_DOJO_SET_CHART"){const p=m.payload||{};state.notes=Array.isArray(p.notes)?p.notes.map((n,i)=>({...n,id:i,time:Number(n.time)||0,lane:Number(n.lane)||0,duration:Number(n.duration)||0})):state.notes;state.bpm=Number(p.bpm)||120;state.time=0;state.combo=0;state.score=0}
 if(m.type==="PJSK_DOJO_SET_AUDIO"){if(state.audio)URL.revokeObjectURL(state.audio);state.audio=String(m.payload?.dataUrl||"");if(state.audio){const a=new Audio(state.audio);a.preload="auto";a.playbackRate=1;state.audio=a}}
 if(m.type==="PJSK_DOJO_PLAY")state.playing=true;
 if(m.type==="PJSK_DOJO_PAUSE")state.playing=false;
}
view.addEventListener("dblclick",()=>{state.playing=!state.playing});
document.getElementById("play").addEventListener("click",()=>{state.playing=!state.playing});
document.getElementById("reset").addEventListener("click",()=>{buildNotes();renderHud()});
boot();
})();