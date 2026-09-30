/* Dojo WebGL runtime — browser-native Project SEKAI-style practice engine. */
(()=>{"use strict";
let A=window.__PJSEKAI_APP__||null,booted=false;
function appRoot(){return window.__PJSEKAI_APP__||(A&&A.getState?A:null)||null;}
const $=id=>document.getElementById(id),cl=(v,a,b)=>Math.max(a,Math.min(b,v)),N=(v,d=0)=>Number.isFinite(+v)?+v:d;
const S={songs:null,diffs:null,vocals:null,selDiff:"expert",audio:new Audio(),notes:[],running:false,paused:false,starting:false,lead:2.5,seek:0,score:0,combo:0,best:0,life:1000,judged:0,total:0,counts:{PERFECT:0,GREAT:0,GOOD:0,BAD:0,MISS:0},timing:0,tn:0,held:new Map(),fx:[],pt:[],keyFlash:[0,0,0,0],gl:null,buf:null,pr:null,geom:null,raf:0,last:0,keys:["D","F","J","K"],ro:null,clockStart:0,error:""};
S.audio.preload="auto";
const DIFF=["easy","normal","hard","expert","master","append"],LAB={easy:"Easy",normal:"Normal",hard:"Hard",expert:"Expert",master:"Master",append:"Append"};
const st=document.createElement("style");st.textContent="#dojoGameStageWrap{position:relative;overflow:hidden;aspect-ratio:16/9;min-height:320px;background:#050713;touch-action:none}#dojoGameCanvas{position:absolute;inset:0;width:100%;height:100%}.dojo-wgl-overlay{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 80%,transparent 30%,rgba(0,0,0,.45) 100%)}.dojo-wgl-pause{position:absolute;z-index:5;right:12px;top:12px;border:1px solid rgba(255,255,255,.2);background:rgba(5,8,20,.55);color:#fff;border-radius:999px;padding:8px 12px;font-weight:800}.dojo-wgl-status{position:absolute;z-index:4;left:12px;bottom:10px;padding:5px 9px;border-radius:999px;background:rgba(5,8,20,.5);color:rgba(255,255,255,.72);font:800 9px system-ui;letter-spacing:.08em;pointer-events:none}";document.head.appendChild(st);
function app(){const root=appRoot();const x=root?.getState?.()||{};x.dojo=x.dojo||{};S.keys=(Array.isArray(x.dojo.keys)?x.dojo.keys:["D","F","J","K"]).slice(0,4);while(S.keys.length<4)S.keys.push(["D","F","J","K"][S.keys.length]);return x}
async function j(u){const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json()}
function beatSec(b,c){let x=c[0]||{beat:0,bpm:120,sec:0};for(let i=1;i<c.length;i++){if(c[i].beat>b)break;x=c[i]}return x.sec+(b-x.beat)*60/x.bpm}
function sus(text){
 const valid=String(text).split(/\r?\n/).filter(line=>line.slice(0,1)==="#").map(line=>line.slice(1).trim());
 const meta=new Map();
 for(const line of valid){
   const p=line.indexOf(":"); if(p<0)continue;
   meta.set(line.slice(0,p).trim().toUpperCase(),line.slice(p+1).trim());
 }
 const tpb=480;
 const measure=(valid.filter(line=>/^\d{3}[1-5][0-9a-fA-F][0-9a-zA-Z]?:/.test(line)).map(line=>+line.slice(0,3)).reduce((a,b)=>Math.max(a,b),0))+1;
 const lineToDef=(re,s1,s2)=>valid.filter(x=>re.test(x)).reduce((a,line)=>{a[Number(line.slice(s1,s2))]=Number(line.split(":")[1].trim());return a},[]);
 const fill=(def,len,base)=>{const out=[];let last=base;for(let i=0;i<len;i++){if(Number.isFinite(def[i]))last=def[i];out[i]=last}return out};
 const baseBpm=Number(meta.get("BASEBPM"))>0?Number(meta.get("BASEBPM")):120;
 const bpmDef=lineToDef(/^BPM\d{2}:/,3,5);
 const bpmRef=lineToDef(/^\d{3}08:/,0,3);
 const bpmByMeasure=fill(bpmRef.map(k=>Number.isFinite(bpmDef[k])?bpmDef[k]:undefined),measure,baseBpm).map(v=>v>0?v:baseBpm);
 const beatDef=lineToDef(/^\d{3}02:/,0,3);
 const beats=fill(beatDef,measure,4).map(v=>v>0?v:4);
 const startSec=new Array(measure).fill(0),startBeat=new Array(measure).fill(0);
 for(let i=1;i<measure;i++)startBeat[i]=startBeat[i-1]+beats[i-1];
 for(let i=1;i<measure;i++)startSec[i]=startSec[i-1]+beats[i-1]*60/bpmByMeasure[i-1];
 const parseLines=valid.filter(line=>/^\d{3}[1-5][0-9a-fA-F][0-9a-zA-Z]?:/.test(line));
 const notes=[];
 for(const line of parseLines){
   const pair=line.split(":",2),h=pair[0],raw=String(pair[1]||"").trim().replace(/\s+/g,""),m=Number(h.slice(0,3)),laneType=Number(h[3]),lane=parseInt(h[4],16),channel=h.length>=6?h[5].toUpperCase().charCodeAt(0):0;
   if(m<0||m>=measure||lane<0||lane>15||!raw||raw.length%2)continue;
   const count=raw.length/2,slotBeats=beats[m]/count;
   for(let i=0;i<count;i++){
     const a=raw.slice(i*2,i*2+2),type=parseInt(a[0],36),width=parseInt(a[1],17);
     if(!width||!Number.isFinite(type)||!Number.isFinite(lane))continue;
     const beat=i*slotBeats+((0)),sec=startSec[m]+i*slotBeats*60/bpmByMeasure[m];
     notes.push({lane,laneType,channel,measure:m,tick:Math.round(i*tpb*slotBeats),type,width,sec});
   }
 }
 const byKey=new Map(),shortMap=new Map(),airMap=new Map();
 const key=n=>n.measure+"_"+n.tick+"_"+n.lane;
 for(const n of notes)if(n.laneType===1)shortMap.set(key(n),n);
 for(const n of notes)if(n.laneType===5)airMap.set(key(n),n);
 const out=[];
 for(const n of notes.filter(x=>x.laneType===1)){
   if(n.type===1)out.push({k:"tap",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:false,f:null,t:false});
   else if(n.type===2)out.push({k:"tap",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:true,f:null,t:false});
   else if(n.type===3)out.push({k:"trace",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:false,f:null,t:true});
 }
 for(const n of notes.filter(x=>x.laneType===5)){
   const dir=n.type===3?"left":n.type===4?"right":n.type===5?"down":"up";
   const existing=shortMap.get(key(n));
   if(existing)shortMap.delete(key(n));
   if(!existing)out.push({k:"tap",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:false,f:dir,t:true});
 }
 const buildLong=(laneType,kind,guide)=>{
   const groups=new Map();
   for(const n of notes.filter(x=>x.laneType===laneType&&x.channel)){
     const gkey=laneType===3?String(n.channel):n.lane+"_"+n.channel,g=groups.get(gkey)||[];g.push(n);groups.set(gkey,g);
   }
   for(const arr of groups.values()){
     arr.sort((a,b)=>a.sec-b.sec);
     const si=arr.findIndex(n=>n.type===1);if(si<0)continue;
     const tail=arr.slice(si),ei=tail.findIndex(n=>n.type===2),path=ei>=0?tail.slice(0,ei+1):tail;
     if(path.length<2)continue;
     const points=path.map(n=>({l:cl(n.lane-2,0,11),b:startBeat[n.measure]+n.tick/tpb,w:n.width,type:n.type,diamond:n.type===3,sec:n.sec}));
     out.push({k:guide?"traceHold":kind,l:points[0].l,w:points[0].w,b:points[0].sec,e:points[points.length-1].sec,c:points[0].type===3||points[0].type===6,path:points,guide});
   }
 };
 buildLong(2,"hold",false);
 buildLong(3,"hold",false);
 const consumed=new Set(out.filter(n=>n.path).flatMap(n=>n.path.map(p=>p.b+":"+p.l)));
 const remaining=[];
 for(const n of shortMap.values()){
   if(n.type===1)remaining.push({k:"tap",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:false,f:null,t:false});
   else if(n.type===2)remaining.push({k:"tap",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:true,f:null,t:false});
   else if(n.type===3)remaining.push({k:"trace",l:cl(n.lane-2,0,11),w:n.width,b:n.sec,c:false,f:null,t:true});
 }
 out.push(...remaining);
 out.sort((a,b)=>a.b-b.b);
 const waveOffset=Number(meta.get("WAVEOFFSET"))/1000||0;
 return{changes:bpmByMeasure.map((b,i)=>({beat:startBeat[i],bpm:b,sec:startSec[i],rawTick:Math.round(startBeat[i]*tpb)})),notes:out.map((n,i)=>({...n,id:i,hit:n.b+waveOffset,end:n.e==null?0:n.e+waveOffset})),filler:0};
}
function setup(){
 const c=$("dojoGameCanvas"),w=$("dojoGameStageWrap");if(!c||!w)throw Error("Dojo 畫面不存在");
 S.gl=c.getContext("webgl",{antialias:true,alpha:false});if(!S.gl)throw Error("瀏覽器不支援 WebGL");
 const g=S.gl,v="attribute vec2 p;attribute vec4 c;varying vec4 v;void main(){gl_Position=vec4(p,0.,1.);v=c;}",f="precision mediump float;varying vec4 v;void main(){gl_FragColor=v;}";
 const sh=(t,s)=>{const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error("WebGL shader");return x};
 S.pr=g.createProgram();g.attachShader(S.pr,sh(g.VERTEX_SHADER,v));g.attachShader(S.pr,sh(g.FRAGMENT_SHADER,f));g.linkProgram(S.pr);S.buf=g.createBuffer();S.pp=g.getAttribLocation(S.pr,"p");S.cc=g.getAttribLocation(S.pr,"c");
 const rs=()=>{const r=w.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=r.width*d;c.height=r.height*d;g.viewport(0,0,c.width,c.height);S.geom={w:r.width,h:r.height,top:r.height*.11,hit:r.height*.88,tl:r.width*.30,tr:r.width*.70,bl:r.width*.045,br:r.width*.955}};rs();addEventListener("resize",rs,{passive:true});if(window.ResizeObserver){const ro=new ResizeObserver(rs);ro.observe(w);S.ro=ro}
 if(!w.querySelector(".dojo-wgl-overlay")){const o=document.createElement("div");o.className="dojo-wgl-overlay";w.appendChild(o);const q=document.createElement("div");q.className="dojo-wgl-status";q.textContent="WEBGL · DOJO";w.appendChild(q);S.status=q;const p=document.createElement("button");p.className="dojo-wgl-pause";p.type="button";p.textContent="Ⅱ";p.hidden=true;p.onclick=pause;w.appendChild(p);S.pause=p}
}
function V(x,y,c,a=1){return[x/S.geom.w*2-1,1-y/S.geom.h*2,...c,a]}
function poly(p,c,a=1){const g=S.gl,d=[];p.forEach(x=>d.push(...V(x[0],x[1],c,a)));g.bindBuffer(g.ARRAY_BUFFER,S.buf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);g.useProgram(S.pr);g.enableVertexAttribArray(S.pp);g.enableVertexAttribArray(S.cc);g.vertexAttribPointer(S.pp,2,g.FLOAT,false,24,0);g.vertexAttribPointer(S.cc,4,g.FLOAT,false,24,8);g.drawArrays(g.TRIANGLE_FAN,0,p.length)}
function ln(p,c,a=1){if(p.length<2)return;const g=S.gl,d=[];p.forEach(x=>d.push(...V(x[0],x[1],c,a)));g.bindBuffer(g.ARRAY_BUFFER,S.buf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);g.useProgram(S.pr);g.enableVertexAttribArray(S.pp);g.enableVertexAttribArray(S.cc);g.vertexAttribPointer(S.pp,2,g.FLOAT,false,24,0);g.vertexAttribPointer(S.cc,4,g.FLOAT,false,24,8);g.drawArrays(g.LINE_STRIP,0,p.length)}
function P(t){const g=S.geom,p=Math.pow(cl(t,0,1),.82);return{y:g.top+(g.hit-g.top)*p,l:g.tl+(g.bl-g.tl)*p,r:g.tr+(g.br-g.tr)*p}}
function X(l,t){const q=P(t),m=!!app().dojo?.mirror,l2=m?11-l:l;return q.l+(q.r-q.l)*(l2+.5)/12}
function W(t){const q=P(t);return(q.r-q.l)/12}
function drawScene(){
 const g=S.gl,h=S.geom;g.clearColor(.008,.012,.035,1);g.clear(g.COLOR_BUFFER_BIT);
 const pulse=S.running?(.5+.5*Math.sin((S.audio.currentTime||0)*Math.PI*2*2)):0;
 poly([[0,0],[h.w,0],[h.w,h.h],[0,h.h]],[.008,.012,.035]);
 poly([[h.tl,h.top],[h.tr,h.top],[h.br,h.h],[h.bl,h.h]],[.025,.055,.12]);
 poly([[h.tl+8,h.top+6],[h.tr-8,h.top+6],[h.br-18,h.hit-5],[h.bl+18,h.hit-5]],[.04,.085,.17],.48);
 for(let i=0;i<7;i++){const p=(i+1)/8,y=h.top+(h.hit-h.top)*Math.pow(p,.82),l=h.tl+(h.bl-h.tl)*Math.pow(p,.82),r=h.tr+(h.br-h.tr)*Math.pow(p,.82);ln([[l,y],[r,y]],[.34,.62,.95],.045+.02*p)}
 for(let i=0;i<=12;i++){const a=(i===0||i===12)?0.5:(0.12+0.08*pulse);ln([[h.tl+(h.tr-h.tl)*i/12,h.top],[h.bl+(h.br-h.bl)*i/12,h.hit]],[.28,.72,1],a)}
 for(let i=1;i<9;i++){const p=i/9,y=h.top+(h.hit-h.top)*Math.pow(p,.82),l=h.tl+(h.bl-h.tl)*Math.pow(p,.82),r=h.tr+(h.br-h.tr)*Math.pow(p,.82);ln([[l,y],[r,y]],[.3,.55,.85],.08)}
 ln([[h.bl,h.hit],[h.br,h.hit]],[.55,.92,1],.9);
 ln([[h.tl,h.top],[h.tr,h.top]],[.25,.55,.9],.42);
 const hitY=h.hit;
 for(let k=0;k<4;k++){const flash=Math.max(0,(S.keyFlash[k]-(performance.now()))/.14);if(flash>0){const l0=k*3,l1=l0+3,x1=h.bl+(h.br-h.bl)*l0/12,x2=h.bl+(h.br-h.bl)*l1/12;poly([[x1,hitY-9],[x2,hitY-9],[x2,hitY+9],[x1,hitY+9]],[.4,.9,1],Math.min(.38,flash*.38));}}
 for(let i=0;i<12;i++){const q1=P(1),x1=q1.l+(q1.r-q1.l)*i/12,x2=q1.l+(q1.r-q1.l)*(i+1)/12;ln([[x1,q1.y-1],[x2,q1.y-1]],[.55,.9,1],i%3===0?0.35:0.14)}
}
function noteDraw(n,now){const p=cl(1-(n.hit-now)/S.lead,0,1),settings=app().dojo||{};if(settings.sudden&&p<.34)return;const q=P(p),x=X(n.l,p),w=Math.max(10,W(p)*n.w*.92),h=Math.max(6,w*.18),alpha=settings.hidden?cl((p-.18)/.48,.05,1):1,c=n.c?[1,.83,.15]:n.f?[1,.28,.42]:n.t?[.25,1,.73]:[.18,.88,1];poly([[x-w*.78,q.y-h*1.7],[x+w*.78,q.y-h*1.7],[x+w*.78,q.y+h*1.7],[x-w*.78,q.y+h*1.7]],c,.10*alpha);poly([[x-w*.58,q.y-h*1.25],[x+w*.58,q.y-h*1.25],[x+w*.58,q.y+h*1.25],[x-w*.58,q.y+h*1.25]],c,.22*alpha);if(n.c)poly([[x,q.y-h*1.55],[x+w*.62,q.y],[x,q.y+h*1.55],[x-w*.62,q.y]],[1,.84,.18],.98*alpha);else poly([[x-w/2,q.y-h],[x+w/2,q.y-h],[x+w/2,q.y+h],[x-w/2,q.y+h]],c,.98*alpha);poly([[x-w*.22,q.y-h*.42],[x+w*.22,q.y-h*.42],[x+w*.22,q.y+h*.42],[x-w*.22,q.y+h*.42]],[1,1,1],.20*alpha);if(n.f){const d=n.f==="left"?-1:n.f==="right"?1:0;if(d)ln([[x-d*w*.16,q.y-h*1.9],[x+d*w*.34,q.y-h*1.9],[x+d*w*.16,q.y-h*1.9+h]],[1,.58,.72],.98*alpha);else ln([[x,q.y-h*1.95],[x-w*.22,q.y-h*1.58],[x+w*.22,q.y-h*1.58]],[1,.58,.72],.98*alpha)}}
function holdDraw(n,now){if(n.end<=now)return;const path=n.path||[{l:n.l,b:n.b},{l:n.l,b:n.e}],pts=[];for(const z of path){const bt=beatSec(z.b,S.prep.changes),t=cl(1-(bt-now)/S.lead,0,1),q=P(t);pts.push({x:X(z.l,t),y:q.y,w:W(t)*n.w*.46})}for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],c=n.guide?[.15,.95,1]:n.c?[1,.82,.18]:[.10,.92,.68];poly([[a.x-a.w,a.y],[a.x+a.w,a.y],[b.x+b.w,b.y],[b.x-b.w,b.y]],c,n.guide?.56:.80);if(n.guide)ln([[a.x,a.y],[b.x,b.y]],[.78,1,1],.74)}const h=pts[0];poly([[h.x-h.w*1.15,h.y-8],[h.x+h.w*1.15,h.y-8],[h.x+h.w*1.15,h.y+8],[h.x-h.w*1.15,h.y+8]],n.c?[1,.82,.18]:[.10,.92,.68],.28)}
function fx(l){const x=X(l,1),y=S.geom.hit;S.fx.push({x,y,t:0});for(let i=0;i<14;i++){const a=Math.random()*6.28,v=60+Math.random()*130;S.pt.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:0})}}
function effects(dt){for(const e of S.fx){e.t+=dt;const k=e.t/.45,r=12+65*k;ln([[e.x-r,e.y],[e.x+r,e.y]],[.55,.9,1],1-k);ln([[e.x,e.y-r],[e.x,e.y+r]],[1,.8,.3],1-k)}S.fx=S.fx.filter(e=>e.t<.45);for(const p of S.pt){p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;const a=1-p.t/.42;if(a>0)poly([[p.x-2,p.y-2],[p.x+2,p.y-2],[p.x+2,p.y+2],[p.x-2,p.y+2]],[.65,.95,1],a)}S.pt=S.pt.filter(p=>p.t<.42)}
function hud(j){const put=(id,v)=>{const e=$(id);if(e)e.textContent=v};put("dojoGameScore",String(Math.floor(S.score)).padStart(7,"0"));put("dojoGameCombo",S.combo);put("dojoGameAccuracy",(S.tn?Math.max(0,100-S.timing/S.tn*420):100).toFixed(2)+"%");const l=$("dojoGameLifeBar");if(l)l.style.width=cl(S.life/10,0,100)+"%";const x=$("dojoJudgeText");if(x)x.textContent=j||""}
function judge(n,d,allowFinish=true){const a=Math.abs(d),j=a<=.045?"PERFECT":a<=.085?"GREAT":a<=.11?"GOOD":a<=.14?"BAD":"MISS";S.counts[j]++;S.timing+=Math.min(a,.2);S.tn++;S.combo=j==="MISS"||j==="BAD"?0:S.combo+1;S.best=Math.max(S.best,S.combo);S.score+=j==="PERFECT"?1000:j==="GREAT"?700:j==="GOOD"?400:j==="BAD"?150:0;S.life=cl(S.life+(j==="MISS"?-65:j==="BAD"?-30:1),0,1000);n.done=true;S.judged++;hud(j);fx(n.l);if(allowFinish&&S.judged>=S.total)finish()}
function hit(l,type="tap",exact=false){if(!S.running||S.paused)return;S.keyFlash[exact?Math.floor(l/3):l]=performance.now()+140;const settings=app().dojo||{},now=S.audio.currentTime-S.seek+N(settings.audioOffset,0)/1000;let best=null,bd=.17;for(const n of S.notes)if(!n.done&&!(n.k==="hold"&&n.started)){const match=exact?Math.abs(n.l-l)<=Math.max(0,(n.w||1)-1)/2:Math.floor(n.l/3)===l;if(!match)continue;const dd=Math.abs(n.hit-now);if(dd<bd){bd=dd;best=n}}if(!best)return;if(type==="flick"&&!best.f)return;if(best.k==="hold"||best.k==="traceHold"){best.started=true;S.held.set(l,best);judge({...best,k:"tap"},now-best.hit,false);return}judge(best,now-best.hit)}
function release(l){const n=S.held.get(l);if(!n)return;S.held.delete(l);const now=S.audio.currentTime-S.seek+N(app().dojo?.audioOffset,0)/1000;if(now<n.end-.08){n.done=true;S.judged++;S.combo=0;S.life=Math.max(0,S.life-45);hud("MISS");return}n.done=true;judge({...n,k:"tap",hit:n.end},now-n.end)}
function sweep(now){for(const n of S.notes)if(!n.done&&!n.started&&now-n.hit>.16)judge(n,.2);for(const [l,n] of S.held)if(now>n.end+.16)release(l);if(S.life<=0)finish()}
function loop(t){S.raf=requestAnimationFrame(loop);const dt=Math.min(.05,(t-(S.last||t))/1000);S.last=t;drawScene();if(!S.running)return;const rawNow=S.audio.currentTime-S.seek,settings=app().dojo||{},visualNow=rawNow+N(settings.visualOffset,0)/1000;for(const n of S.notes){if(n.k==="hold"||n.k==="traceHold")holdDraw(n,visualNow);else if(visualNow>n.hit-S.lead&&visualNow<n.hit+.17)noteDraw(n,visualNow)}sweep(rawNow+N(settings.audioOffset,0)/1000);effects(dt);const p=S.notes.length?cl(now/(S.notes[S.notes.length-1].end||S.notes[S.notes.length-1].hit),0,1):0;if($("dojoGameProgressBar"))$("dojoGameProgressBar").style.width=p*100+"%";if(now>S.endAt+.5)finish()}
function finish(){if(!S.running)return;S.running=false;S.audio.pause();if(S.pause)S.pause.hidden=true;const rank=S.counts.MISS===0&&S.counts.BAD===0?"ALL PERFECT":S.counts.MISS<5?"CLEAR":"FAILED",r=$("dojoGameResult");if(r){r.hidden=false;r.innerHTML="<strong>"+rank+"</strong><span>"+S.best+" COMBO · "+String(Math.floor(S.score)).padStart(7,"0")+"</span><small>PERFECT "+S.counts.PERFECT+"　GREAT "+S.counts.GREAT+"　GOOD "+S.counts.GOOD+"　BAD "+S.counts.BAD+"　MISS "+S.counts.MISS+"</small>"}if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="↻ 再玩一次";if($("dojoGameMessage"))$("dojoGameMessage").textContent=rank+" · "+S.best+" COMBO"}
function pause(){if(S.paused){S.audio.play().then(()=>{S.paused=false;S.running=true;if(S.pause)S.pause.textContent="Ⅱ";if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";}).catch(()=>{});return}if(!S.running)return;S.audio.pause();S.running=false;S.paused=true;if(S.pause)S.pause.textContent="▶";if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="繼續打歌"}
async function data(){if(!S.songs){const [a,b,c]=await Promise.all([j("dojo-musics.json"),j("dojo-difficulties.json"),j("dojo-vocals.json").catch(()=>[])]);S.songs=a;S.diffs=b;S.vocals=c;const m=new Map();for(const d of b){const id=+d.musicId;if(!m.has(id))m.set(id,{});m.get(id)[String(d.musicDifficulty).toLowerCase()]=d}S.songs=S.songs.map(x=>({...x,difficulties:m.get(+x.id)||{}}))}}
function selection(){
 const title=$("dojoSelectedTitle")?.textContent?.trim()||"",id=+(localStorage.getItem("pjsekai-chart-last-song")||1);
 const m=S.songs.find(x=>x.title===title)||S.songs.find(x=>+x.id===id)||S.songs[0];
 if(!m)return null;
 let d=S.selDiff;
 const box=$("dojoDifficultyButtons");
 if(box){const a=box.querySelector(".active,[aria-pressed='true'],button.selected");if(a){const raw=(a.dataset.dojoDiff||a.dataset.difficulty||a.textContent||"").toLowerCase();const k=DIFF.find(x=>raw.includes(x));if(k)d=k}}
 if(!m.difficulties[d])d=DIFF.find(x=>m.difficulties[x])||"expert";
 return{m,d};
}

function expose(){
 window.__PJSEKAI_DOJO__={
  start,
  pause,
  finish,
  state:{
   get prepared(){if(!S.prep)return null;return{music:S.prep.music,difficulty:S.prep.difficulty,audioUrl:S.prep.audioUrl||"",vocal:S.prep.vocal||null,notes:S.prep.notes||[]}},
   get notes(){return S.notes.map(n=>({lane:n.l,kind:n.k,hit:n.hit,judged:!!n.done}))},
   get audio(){return S.audio},
   get running(){return S.running},
   get starting(){return S.starting},
   get score(){return S.score},
   get combo(){return S.combo},
   get judged(){return S.judged},
   get error(){return S.error||""},get settings(){const d=app().dojo||{};return{speed:N(d.speed,10),audioOffset:N(d.audioOffset,0),visualOffset:N(d.visualOffset,0),mirror:!!d.mirror,hidden:!!d.hidden,sudden:!!d.sudden}},
   get noteStats(){
    const hits=S.notes.map(n=>n.hit).filter(Number.isFinite);
    const future=S.notes.filter(n=>Number.isFinite(n.hit)&&n.hit>(S.audio.currentTime||0)+0.1).slice(0,12);
    return{count:S.notes.length,finite:hits.length,min:hits.length?Math.min(...hits):null,max:hits.length?Math.max(...hits):null,now:S.audio.currentTime||0,future:future.map(n=>({hit:n.hit,lane:n.l,kind:n.k,end:n.end||0}))};
   }
  }
 };
}
async function prepareDefault(){try{await data();const q=selection();if(!q?.m)throw Error("歌曲資料尚未就緒");const url="https://assets.unipjsk.com/startapp/music/music_score/"+String(q.m.id).padStart(4,"0")+"_01/"+q.d,r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("官方譜面載入失敗 HTTP "+r.status);const score=sus(await r.text()),filler=N(q.m.fillerSec,0);score.filler=filler;score.notes.forEach(n=>{n.hit+=filler;if(n.end)n.end+=filler});const v=S.vocals.find(x=>+x.musicId===+q.m.id&&x.musicVocalType==="original_song")||S.vocals.find(x=>+x.musicId===+q.m.id);const vn=v?.assetbundleName||String(q.m.id).padStart(4,"0")+"_01",jacket="https://assets.unipjsk.com/startapp/music/jacket/"+vn+"/"+vn+".png";S.prep={...score,music:q.m,difficulty:q.d,vocal:v||null,audioUrl:"https://storage.sekai.best/sekai-jp-assets/music/long/"+vn+"/"+vn+".wav",jacket};return S.prep}catch(e){console.warn("[Dojo default prepare]",e);throw e}}
async function ensurePrepared(){if(S.prep?.notes?.length)return S.prep;const q=selection();if(!q?.m)throw Error("歌曲資料尚未就緒");const url="https://assets.unipjsk.com/startapp/music/music_score/"+String(q.m.id).padStart(4,"0")+"_01/"+q.d,r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("官方譜面載入失敗 HTTP "+r.status);const score=sus(await r.text()),filler=N(q.m.fillerSec,0);score.filler=filler;score.notes.forEach(n=>{n.hit+=filler;if(n.end)n.end+=filler});const v=S.vocals.find(x=>+x.musicId===+q.m.id&&x.musicVocalType==="original_song")||S.vocals.find(x=>+x.musicId===+q.m.id),vn=v?.assetbundleName||String(q.m.id).padStart(4,"0")+"_01",jacket="https://assets.unipjsk.com/startapp/music/jacket/"+vn+"/"+vn+".png";return S.prep={...score,music:q.m,difficulty:q.d,vocal:v||null,audioUrl:"https://storage.sekai.best/sekai-jp-assets/music/long/"+vn+"/"+vn+".wav",jacket}}

async function start(){if(S.starting)return;if(S.running){pause();if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="繼續打歌";return}if(S.paused&&S.audio.src){try{await S.audio.play();S.paused=false;S.running=true;if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";return}catch(_){if(appRoot()?.toast)appRoot().toast("無法繼續播放，請再點一次");return}}S.starting=true;try{const b=$("dojoOpenPracticeBtn");if(b){b.disabled=true;b.textContent="載入中…"}await data();const q=selection();await ensurePrepared();const prep=S.prep;const vn=prep.vocal?.assetbundleName||String(q.m.id).padStart(4,"0")+"_01";S.notes=prep.notes.map(x=>({...x}));S.total=S.notes.reduce((n,x)=>n+(x.k==="hold"||x.k==="traceHold"?2:1),0);S.score=0;S.combo=0;S.best=0;S.life=1000;S.judged=0;S.counts={PERFECT:0,GREAT:0,GOOD:0,BAD:0,MISS:0};S.timing=0;S.tn=0;S.held.clear();S.fx=[];S.pt=[];S.audio.pause();S.audio.src="https://storage.sekai.best/sekai-jp-assets/music/long/"+vn+"/"+vn+".wav";S.audio.load();const speed=N(app().dojo?.speed,10);S.lead=cl(3.1-(speed-1)*.14,1.5,3.1);S.seek=0;await new Promise((resolve,reject)=>{if(S.audio.readyState>=2){resolve();return}const ok=()=>{cleanup();resolve()};const bad=()=>{cleanup();reject(Error("官方音源載入失敗"))};const cleanup=()=>{S.audio.removeEventListener("canplay",ok);S.audio.removeEventListener("error",bad)};S.audio.addEventListener("canplay",ok,{once:true});S.audio.addEventListener("error",bad,{once:true});S.audio.load()});await S.audio.play();S.running=true;S.paused=false;S.endAt=Math.max(...S.notes.map(x=>x.end||x.hit),0)+.6;S.pause.hidden=false;S.status.textContent="PLAY · "+LAB[q.d];if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";if($("dojoGameResult"))$("dojoGameResult").hidden=true;if($("dojoGameSongTitle"))$("dojoGameSongTitle").textContent=q.m.title;if($("dojoGameSongMeta"))$("dojoGameSongMeta").textContent="官方音源 · "+LAB[q.d];const cover=$("dojoGameCover");if(cover){cover.src=prep.jacket||"";cover.alt=q.m.title}const stage=$("dojoGameStageWrap");if(stage&&prep.jacket)stage.style.backgroundImage="linear-gradient(180deg,rgba(4,6,18,.92),rgba(4,7,18,.98)),url(\""+prep.jacket+"\")";hud("");}catch(e){S.error=e?.stack||e?.message||String(e);if($("dojoGameMessage"))$("dojoGameMessage").textContent="⚠ "+(e.message||"開始失敗");if(appRoot()?.toast)appRoot().toast(e.message||"Dojo 啟動失敗")}finally{S.starting=false;const b=$("dojoOpenPracticeBtn");if(b){b.disabled=false;if(!S.running)b.textContent="▶ 開始打歌"}}}
function bind(){const touch=new Map();document.addEventListener("click",e=>{if(e.target.closest("#dojoOpenPracticeBtn")){e.preventDefault();start()}},{capture:true});document.addEventListener("keydown",e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||""))return;const i=S.keys.findIndex(k=>String(k).toUpperCase()===e.key.toUpperCase());if(i<0||e.repeat)return;e.preventDefault();hit(i)});document.addEventListener("keyup",e=>{const i=S.keys.findIndex(k=>String(k).toUpperCase()===e.key.toUpperCase());if(i>=0)release(i)});document.addEventListener("pointerdown",e=>{
 const z=e.target.closest("[data-dojo-lane-zone]");
 if(z){e.preventDefault();const lane=cl(+z.dataset.dojoLaneZone|0,0,11);touch.set(e.pointerId,{l:lane,exact:true,x:e.clientX,y:e.clientY,t:performance.now()});hit(lane,"tap",true);return}
 const w=$("dojoGameStageWrap");if(!w||!S.running)return;
 const r=w.getBoundingClientRect(),x=cl((e.clientX-r.left)/r.width,0,0.999),lane=cl(Math.floor(x*12),0,11);
 touch.set(e.pointerId,{l:lane,exact:true,x:e.clientX,y:e.clientY,t:performance.now()});hit(lane,"tap",true);
},{passive:false});document.addEventListener("pointermove",e=>{const q=touch.get(e.pointerId);if(!q||!S.running)return;const dx=e.clientX-q.x,dy=e.clientY-q.y;if(Math.hypot(dx,dy)>24){hit(q.l,"flick",!!q.exact);touch.delete(e.pointerId)}},{passive:false});document.addEventListener("pointerup",e=>{const q=touch.get(e.pointerId);touch.delete(e.pointerId);if(q)release(q.l)});document.addEventListener("pointercancel",e=>{const q=touch.get(e.pointerId);touch.delete(e.pointerId);if(q)release(q.l)});document.addEventListener("click",e=>{const d=e.target.closest("[data-dojo-diff]");if(d)S.selDiff=d.dataset.dojoDiff||"expert"});$("dojoGameFullscreenBtn")?.addEventListener("click",async()=>{try{await $("dojoGameStageWrap")?.requestFullscreen?.()}catch(_){}});$("dojoGameResetBtn")?.addEventListener("click",()=>{S.running=false;S.audio.pause();if($("dojoGameResult"))$("dojoGameResult").hidden=true});}
async function boot(){if(booted)return;booted=true;try{expose();setup();bind();if(!S.raf)S.raf=requestAnimationFrame(loop);await data();await prepareDefault()}catch(e){S.error=e?.stack||e?.message||String(e);console.warn("[Dojo WebGL]",e);const m=$("dojoGameMessage");if(m)m.textContent="⚠ Dojo 初始化失敗："+(e?.message||"未知錯誤")}}
function startBoot(){A=window.__PJSEKAI_APP__||A;if(appRoot())boot();}
window.addEventListener("pjsekai-app-ready",startBoot);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startBoot,{once:true});else queueMicrotask(startBoot);
})();