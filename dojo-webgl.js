/* Dojo WebGL runtime — Project SEKAI-style browser practice engine. */
/*
 * Chart conversion logic follows the public Next-SEKAI SUS concepts:
 * ticks/measure lengths, directional notes, active slide streams and
 * note categories are interpreted in-browser so the site can play charts
 * without a launcher or external app.
 */
(()=>{"use strict";
let A=window.__PJSEKAI_APP__||null,booted=false;
const $=id=>document.getElementById(id);
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const N=(v,d=0)=>Number.isFinite(+v)?+v:d;
const DIFF=["easy","normal","hard","expert","master","append"];
const LAB={easy:"Easy",normal:"Normal",hard:"Hard",expert:"Expert",master:"Master",append:"Append"};
const KEYS=["D","F","J","K"];

const S={
  songs:null,diffs:null,vocals:null,selDiff:"expert",prep:null,
  audio:new Audio(),notes:[],running:false,paused:false,starting:false,
  lead:2.5,seek:0,score:0,combo:0,best:0,life:1000,judged:0,total:0,
  counts:{PERFECT:0,GREAT:0,GOOD:0,BAD:0,MISS:0},
  timing:0,tn:0,held:new Map(),fx:[],particles:[],keyFlash:[0,0,0,0],
  gl:null,buf:null,program:null,pp:null,cc:null,geom:null,raf:0,last:0,
  keys:["D","F","J","K"],ro:null,status:null,pause:null,error:"",
  inputFlash:[],lastJudge:"",lastJudgeAt:0,backdrop:new Image(),backdropReady:false,
  touch:new Map(),songStartPerf:0,lastNow:0
};
S.audio.preload="auto";
S.audio.crossOrigin="anonymous";

const style=document.createElement("style");
style.textContent=[
"#dojoGameStageWrap{position:relative;overflow:hidden;aspect-ratio:16/9;min-height:320px;background:#050713;touch-action:none;isolation:isolate}",
"#dojoGameCanvas{position:absolute;inset:0;width:100%;height:100%;display:block}",
".dojo-wgl-overlay{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 72%,rgba(44,70,130,.05),rgba(2,4,14,.46) 80%,rgba(0,0,0,.78) 100%);z-index:2}",
".dojo-wgl-status{position:absolute;z-index:5;left:12px;bottom:10px;padding:5px 9px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(5,8,20,.46);color:rgba(255,255,255,.72);font:800 9px system-ui;letter-spacing:.1em;pointer-events:none;backdrop-filter:blur(8px)}",
".dojo-wgl-pause{position:absolute;z-index:6;right:12px;top:12px;width:40px;height:40px;border:1px solid rgba(255,255,255,.25);background:rgba(9,12,28,.58);color:#fff;border-radius:12px;font-weight:900;font-size:17px;backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,.24)}",
".dojo-wgl-pause:active{transform:scale(.95)}",
"#dojoJudgeText{transition:transform .12s ease,opacity .18s ease;text-shadow:0 0 18px currentColor}",
"#dojoJudgeText[data-j='"+"PERFECT"+"']{color:#fff}",
"#dojoJudgeText[data-j='"+"GREAT"+"']{color:#98dcff}",
"#dojoJudgeText[data-j='"+"GOOD"+"']{color:#8effcf}",
"#dojoJudgeText[data-j='"+"BAD"+"']{color:#ffd26b}",
"#dojoJudgeText[data-j='"+"MISS"+"']{color:#ff7995}"
].join("");
document.head.appendChild(style);

function appRoot(){return window.__PJSEKAI_APP__||(A&&A.getState?A:null)||null;}
function app(){
  const root=appRoot();
  const x=root?.getState?.()||{};
  x.dojo=x.dojo||{};
  S.keys=(Array.isArray(x.dojo.keys)?x.dojo.keys:KEYS).slice(0,4);
  while(S.keys.length<4)S.keys.push(KEYS[S.keys.length]);
  return x;
}
async function j(u){
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.json();
}

function parseSus(text){
  const lines=[],measureChanges=[],meta=new Map();
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.trim();
    if(!line.startsWith("#"))continue;
    const isLine=line.includes(":");
    const idx=line.indexOf(isLine?":":" ");
    if(idx<0)continue;
    const left=line.substring(1,idx).trim();
    const right=line.substring(idx+1).trim();
    if(isLine)lines.push([left,right]);
    else if(left==="MEASUREBS")measureChanges.unshift([lines.length,N(right,0)]);
    else meta.set(left,right);
  }
  const ticksPerBeat=(meta.get("REQUEST")||"").startsWith('"ticks_per_beat ')?
    N((meta.get("REQUEST")||"").slice(16,-1),480):480;
  const getBarLengths=()=>{
    const out=[];
    for(let i=0;i<lines.length;i++){
      const [h,d]=lines[i];
      if(h.length!==5||!h.endsWith("02"))continue;
      const off=(measureChanges.find(([idx])=>idx<=i)||[])[1]||0;
      const measure=+h.substring(0,3)+off;
      if(Number.isFinite(measure))out.push({measure,length:N(d,4)});
    }
    if(!out.length)out.push({measure:0,length:4});
    return out.sort((a,b)=>a.measure-b.measure);
  };
  const bars=getBarLengths();
  let cumulative=0;
  const barMap=bars.map((b,i)=>{
    const prev=bars[i-1];
    if(prev)cumulative+=(b.measure-prev.measure)*prev.length*ticksPerBeat;
    return{measure:b.measure,ticksPerMeasure:b.length*ticksPerBeat,ticks:cumulative};
  }).reverse();
  const toTick=(measure,p,q)=>{
    const bar=barMap.find(x=>measure>=x.measure);
    if(!bar)throw Error("SUS bar timing unavailable");
    return bar.ticks+(measure-bar.measure)*bar.ticksPerMeasure+(p*bar.ticksPerMeasure)/q;
  };
  const bpms=new Map();
  const bpmChanges=[];
  const timeScaleChanges=[];
  const tapNotes=[];
  const directionalNotes=[];
  const streams=new Map();
  const toRaws=(h,d,idx)=>{
    const measure=+h.substring(0,3)+(measureChanges.find(([i])=>i<=idx)||[])[1]||0;
    const vals=d.match(/.{2}/g)||[];
    const out=[];
    for(let i=0;i<vals.length;i++){
      if(vals[i]==="00")continue;
      out.push({tick:toTick(measure,i,vals.length),value:vals[i]});
    }
    return out;
  };
  const offsetFn=(index)=>{
    const off=(measureChanges.find(([idx])=>idx<=index)||[])[1]||0;
    return off;
  };
  // Re-iterate with stable indexes; this avoids relying on array identity.
  for(let idx=0;idx<lines.length;idx++){
    const [h,d]=lines[idx];
    const mo=offsetFn(idx);
    if(h.length===5&&h.startsWith("TIL")){
      const body=d.startsWith('"')&&d.endsWith('"')?d.slice(1,-1):"";
      if(body){
        for(const segment of body.split(",")){
          const seg=segment.trim();if(!seg)continue;
          const parts=seg.split("'"),a=parts[0],rest=parts[1]||"";
          const rr=rest.split(":");
          if(rr.length<2)continue;
          const measure=+a,tick=+rr[0],timeScale=+rr[1];
          if(Number.isFinite(measure)&&Number.isFinite(tick)&&Number.isFinite(timeScale))
            timeScaleChanges.push({tick:toTick(measure,0,1)+tick,timeScale});
        }
      }
      continue;
    }
    if(h.length===5&&h.startsWith("BPM")){bpms.set(h.substring(3),+d);continue;}
    if(h.length===5&&h.endsWith("08")){
      for(const x of toRaws(h,d,idx).map(x=>({...x,value:String(x.value)}))){
        bpmChanges.push({tick:x.tick,bpm:N(bpms.get(x.value),0)});
      }
      continue;
    }
    if(h.length===5&&h[3]==="1"){tapNotes.push(...toRaws(h,d,idx).map(x=>noteFromRaw(h,x)));continue;}
    if(h.length===6&&(h[3]==="3"||h[3]==="9")){
      const key=(h[5]||"")+"-"+h[3];
      const stream=streams.get(key)||{type:+h[3],notes:[]};
      stream.notes.push(...toRaws(h,d,idx).map(x=>noteFromRaw(h,x)));
      streams.set(key,stream);continue;
    }
    if(h.length===5&&h[3]==="5"){directionalNotes.push(...toRaws(h,d,idx).map(x=>noteFromRaw(h,x)));continue;}
    // Keep meta-linked lanes even when non-standard headers appear.
    void mo;
  }
  const slides=[];
  for(const stream of streams.values()){
    let current=null;
    for(const n of stream.notes.sort((a,b)=>a.tick-b.tick)){
      if(!current){current=[];slides.push({type:stream.type,notes:current});}
      current.push(n);
      if(n.type===2)current=null;
    }
  }
  return{
    offset:-N(meta.get("WAVEOFFSET"),0)/1000,
    ticksPerBeat,
    timeScaleChanges:timeScaleChanges.sort((a,b)=>a.tick-b.tick),
    bpmChanges:bpmChanges.sort((a,b)=>a.tick-b.tick),
    tapNotes,directionalNotes,slides,
    bars,meta
  };
  function noteFromRaw(h,x){
    return{tick:x.tick,lane:parseInt(h[4]||"0",36),width:parseInt(x.value[1]||"0",36),type:parseInt(x.value[0]||"0",36)};
  }
}

function beatToSec(beat,changes,baseBpm){
  const bpm=changes?.length?changes: [{beat:0,bpm:baseBpm||120,sec:0}];
  let sec=0,prevBeat=0,prevBpm=N(bpm[0].bpm,120);
  if(N(beat,0)<=0)return Math.max(0,N(beat,0)*60/prevBpm);
  for(let i=1;i<bpm.length;i++){
    const b=N(bpm[i].beat,0);
    if(beat<=b)return sec+(beat-prevBeat)*60/prevBpm;
    sec+=(b-prevBeat)*60/prevBpm;
    prevBeat=b;prevBpm=N(bpm[i].bpm,prevBpm);
  }
  return sec+(beat-prevBeat)*60/prevBpm;
}

function susToPlayable(text,baseBpm=120){
  const score=parseSus(text);
  const changes=[];
  for(const b of score.bpmChanges){
    changes.push({beat:b.tick/score.ticksPerBeat,bpm:b.bpm||baseBpm});
  }
  if(!changes.length)changes.push({beat:0,bpm:baseBpm});
  changes.sort((a,b)=>a.beat-b.beat);
  let sec=0,prevBeat=changes[0].beat,prevBpm=changes[0].bpm;
  changes[0].sec=0;
  for(let i=1;i<changes.length;i++){
    const c=changes[i];
    sec+=(c.beat-prevBeat)*60/prevBpm;
    c.sec=sec;prevBeat=c.beat;prevBpm=c.bpm||prevBpm;
  }
  const atTick=t=>beatToSec(t/score.ticksPerBeat,changes,baseBpm);
  const key=n=>n.lane+"-"+Math.round(n.tick);
  const flick=new Map(),trace=new Set(),critical=new Set(),removeTick=new Set(),removeSE=new Set(),ease=new Map();
  for(const n of score.directionalNotes){
    const k=key(n);
    if(n.type===1)flick.set(k,"up");
    else if(n.type===3)flick.set(k,"left");
    else if(n.type===4)flick.set(k,"right");
    else if(n.type===2)ease.set(k,"in");
    else if(n.type===5||n.type===6)ease.set(k,"out");
  }
  for(const n of score.tapNotes){
    const k=key(n);
    if(n.type===2)critical.add(k);
    else if(n.type===5)trace.add(k);
    else if(n.type===6){trace.add(k);critical.add(k);}
    else if(n.type===3)removeTick.add(k);
    else if(n.type===7)removeSE.add(k);
    else if(n.type===8){critical.add(k);removeSE.add(k);}
  }
  const preventSingles=new Set();
  for(const slide of score.slides)if(slide.type===3){
    for(const n of slide.notes)if([1,2,3,5].includes(n.type))preventSingles.add(key(n));
  }
  const notes=[],used=new Set(),slideHeads=new Map();
  const lane12=n=>cl(n.lane-2,0,11);
  const pushSingle=n=>{
    const k=key(n);if(preventSingles.has(k)||used.has(k))return;
    if(![1,2,5,6].includes(n.type))return;
    used.add(k);
    notes.push({
      id:notes.length,k:"tap",l:lane12(n),w:Math.max(1,n.width||1),
      b:atTick(n.tick),hit:atTick(n.tick),end:0,c:n.type===2||n.type===6,
      f:flick.get(k)||null,t:trace.has(k)||n.type===5||n.type===6,
      dir:flick.get(k)||null,tick:n.tick,ease:ease.get(k)||"linear"
    });
  };
  for(const n of score.tapNotes)pushSingle(n);
  for(const n of score.directionalNotes){
    const k=key(n);if([1].includes(n.type)){if(!critical.has(k)&&!trace.has(k))pushSingle(n);}
    else if(!used.has(k)&&n.type===3){
      pushSingle({...n,type:1});const x=notes[notes.length-1];if(x)x.f="left";
    }else if(!used.has(k)&&n.type===4){
      pushSingle({...n,type:1});const x=notes[notes.length-1];if(x)x.f="right";
    }
  }
  for(const slide of score.slides){
    const ns=slide.notes.slice().sort((a,b)=>a.tick-b.tick);
    const start=ns.find(n=>n.type===1||n.type===2);
    if(!start)continue;
    const sk=key(start);const active=slide.type===3;
    const path=ns.map(n=>({
      l:lane12(n),rawLane:n.lane,b:n.tick/score.ticksPerBeat,sec:atTick(n.tick),
      w:Math.max(1,n.width||1),type:n.type,
      trace:trace.has(key(n)),critical:critical.has(key(n))||critical.has(sk),
      ease:ease.get(key(n))||"linear",dir:flick.get(key(n))||null
    }));
    const last=path[path.length-1];
    if(path.length>=2){
      const slideNote={
        id:notes.length,k:"hold",l:path[0].l,w:path[0].w,b:path[0].sec,
        hit:path[0].sec,end:last.sec,c:path[0].critical||critical.has(sk),
        f:flick.get(key(last))||null,t:path.some(p=>p.trace),
        path,active,slideType:slide.type,tick:start.tick,checkpoints:[],started:false
      };
      for(let i=1;i<path.length-1;i++){
        const p=path[i];
        if(!removeTick.has(key(ns[i]))){
          slideNote.checkpoints.push({sec:p.sec,lane:p.l,type:p.type,critical:p.critical,trace:p.trace,judged:false});
        }
      }
      const dupe=slideHeads.get(sk);
      if(dupe){const at=notes.indexOf(dupe);if(at>=0)notes.splice(at,1);}
      notes.push(slideNote);slideHeads.set(sk,slideNote);
      if(active&&!removeSE.has(key(last))){
        // Tail is judged separately at release time; its visual metadata lives on the slide.
        slideNote.tail={sec:last.sec,lane:last.l,critical:last.critical,dir:last.dir,trace:last.trace};
      }
    }else{
      pushSingle(start);
    }
  }
  notes.sort((a,b)=>a.hit-b.hit);
  notes.forEach((n,i)=>n.id=i);
  return{
    changes:changes.map(c=>({beat:c.beat,bpm:c.bpm,sec:c.sec,rawTick:Math.round(c.beat*score.ticksPerBeat)})),
    notes,
    filler:0,
    offset:score.offset,
    ticksPerBeat:score.ticksPerBeat
  };
}

function setup(){
  const c=$("dojoGameCanvas"),w=$("dojoGameStageWrap");
  if(!c||!w)throw Error("Dojo 畫面不存在");
  S.gl=c.getContext("webgl2",{antialias:true,alpha:false,preserveDrawingBuffer:false})||
        c.getContext("webgl",{antialias:true,alpha:false,preserveDrawingBuffer:false});
  if(!S.gl)throw Error("瀏覽器不支援 WebGL");
  const g=S.gl;
  const vs="attribute vec2 p;attribute vec4 c;varying vec4 v;varying vec2 q;void main(){gl_Position=vec4(p,0.,1.);v=c;q=p;}";
  const fs="precision highp float;varying vec4 v;varying vec2 q;void main(){float edge=smoothstep(1.1,.15,length(q));gl_FragColor=vec4(v.rgb,v.a*edge);}";
  const sh=(t,s)=>{
    const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);
    if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x)||"WebGL shader");
    return x;
  };
  S.program=g.createProgram();g.attachShader(S.program,sh(g.VERTEX_SHADER,vs));g.attachShader(S.program,sh(g.FRAGMENT_SHADER,fs));g.linkProgram(S.program);
  if(!g.getProgramParameter(S.program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(S.program)||"WebGL link");
  S.buf=g.createBuffer();S.pp=g.getAttribLocation(S.program,"p");S.cc=g.getAttribLocation(S.program,"c");
  g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.disable(g.DEPTH_TEST);
  const rs=()=>{
    const r=w.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
    c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));
    g.viewport(0,0,c.width,c.height);
    S.geom={w:r.width,h:r.height,top:r.height*.10,far:r.height*.18,hit:r.height*.875,
      tl:r.width*.28,tr:r.width*.72,bl:r.width*.035,br:r.width*.965};
  };
  rs();addEventListener("resize",rs,{passive:true});
  if(window.ResizeObserver){S.ro=new ResizeObserver(rs);S.ro.observe(w);}
  if(!w.querySelector(".dojo-wgl-overlay")){
    const o=document.createElement("div");o.className="dojo-wgl-overlay";w.appendChild(o);
    const q=document.createElement("div");q.className="dojo-wgl-status";q.textContent="DOJO · WEBGL";w.appendChild(q);S.status=q;
    const p=document.createElement("button");p.className="dojo-wgl-pause";p.type="button";p.textContent="Ⅱ";p.hidden=true;p.setAttribute("aria-label","暫停");p.onclick=pause;w.appendChild(p);S.pause=p;
  }
}
function xy(x,y,c,a=1){return[x/S.geom.w*2-1,1-y/S.geom.h*2,c[0],c[1],c[2],a]}
function poly(points,c,a=1){
  const g=S.gl,d=[];for(const p of points)d.push(...xy(p[0],p[1],c,a));
  g.bindBuffer(g.ARRAY_BUFFER,S.buf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);
  g.useProgram(S.program);g.enableVertexAttribArray(S.pp);g.enableVertexAttribArray(S.cc);
  g.vertexAttribPointer(S.pp,2,g.FLOAT,false,24,0);g.vertexAttribPointer(S.cc,4,g.FLOAT,false,24,8);
  g.drawArrays(g.TRIANGLE_FAN,0,points.length);
}
function line(points,c,a=1,width=1){
  if(points.length<2)return;const g=S.gl,d=[];for(const p of points)d.push(...xy(p[0],p[1],c,a));
  g.bindBuffer(g.ARRAY_BUFFER,S.buf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);
  g.useProgram(S.program);g.enableVertexAttribArray(S.pp);g.enableVertexAttribArray(S.cc);
  g.vertexAttribPointer(S.pp,2,g.FLOAT,false,24,0);g.vertexAttribPointer(S.cc,4,g.FLOAT,false,24,8);
  g.lineWidth(width);g.drawArrays(g.LINE_STRIP,0,points.length);
}
function stageAt(p){
  const g=S.geom,t=Math.pow(cl(p,0,1),.76);
  return{y:g.far+(g.hit-g.far)*t,l:g.tl+(g.bl-g.tl)*t,r:g.tr+(g.br-g.tr)*t};
}
function laneX(l,p){
  const q=stageAt(p),mirror=!!app().dojo?.mirror,l2=mirror?11-l:l;
  return q.l+(q.r-q.l)*(l2+.5)/12;
}
function laneW(p){const q=stageAt(p);return(q.r-q.l)/12}
function pointOnPath(path,sec){
  if(!path?.length)return null;
  if(sec<=path[0].sec)return{...path[0]};
  if(sec>=path[path.length-1].sec)return{...path[path.length-1]};
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];
    if(sec>=a.sec&&sec<=b.sec){
      const d=Math.max(1e-5,b.sec-a.sec),u=(sec-a.sec)/d;
      const eased=b.ease==="in"?u*u:b.ease==="out"?1-(1-u)*(1-u):u;
      return{l:a.l+(b.l-a.l)*eased,w:a.w+(b.w-a.w)*eased,sec,trace:a.trace||b.trace,critical:a.critical||b.critical};
    }
  }
  return{...path[path.length-1]};
}
function bg(){
  const h=S.geom;
  poly([[0,0],[h.w,0],[h.w,h.h],[0,h.h]],[.008,.012,.035],1);
  for(let i=0;i<9;i++){
    const y=i*h.h/9;
    poly([[0,y],[h.w,y],[h.w,y+h.h/10],[0,y+h.h/10]],[.015+i*.002,.025+i*.004,.07+i*.006],.22);
  }
  const t=S.running?S.audio.currentTime:0;
  const pulse=.5+.5*Math.sin(t*3.2);
  // soft spotlights
  poly([[h.w*.16,0],[h.w*.30,0],[h.bl,h.hit],[h.w*.42,h.hit]],[.22,.52,1],.045+.02*pulse);
  poly([[h.w*.84,0],[h.w*.70,0],[h.br,h.hit],[h.w*.58,h.hit]],[1,.25,.65],.035+.02*pulse);
  // floating stage panels
  for(let i=0;i<10;i++){
    const xx=((i*137)%100)/100*h.w, yy=(18+i*29)%h.h;
    const s=10+(i%3)*8;
    poly([[xx,yy],[xx+s,yy-3],[xx+s+2,yy+5],[xx+2,yy+8]],[.32,.55,1],.035);
  }
}
function drawStage(){
  const h=S.geom,pulse=.5+.5*Math.sin((S.audio.currentTime||0)*Math.PI*2*2);
  poly([[h.tl,h.far],[h.tr,h.far],[h.br,h.hit+42],[h.bl,h.hit+42]],[.025,.065,.14],.92);
  poly([[h.tl+8,h.far+5],[h.tr-8,h.far+5],[h.br-20,h.hit-8],[h.bl+20,h.hit-8]],[.05,.12,.23],.46);
  for(let i=0;i<=12;i++){
    const x1=h.tl+(h.tr-h.tl)*i/12,x2=h.bl+(h.br-h.bl)*i/12;
    line([[x1,h.far],[x2,h.hit]],[.30,.75,1],i===0||i===12?.55:.12+.06*pulse);
  }
  for(let i=1;i<=8;i++){
    const p=i/9,q=stageAt(p);
    line([[q.l,q.y],[q.r,q.y]],[.38,.66,1],.05+.02*p);
  }
  // lane-bottom slots
  const q=stageAt(1);
  for(let i=0;i<12;i++){
    const x1=q.l+(q.r-q.l)*i/12,x2=q.l+(q.r-q.l)*(i+1)/12;
    const c=i%3===0?[.35,.82,1]:i%3===1?[.72,.40,1]:[1,.35,.72];
    poly([[x1,q.y-3],[x2,q.y-3],[x2,q.y+13],[x1,q.y+13]],c,.10);
    line([[x1,q.y-3],[x2,q.y-3]],c,.45);
  }
  // hit bar and neon side rails
  poly([[h.bl,h.hit-8],[h.br,h.hit-8],[h.br,h.hit+3],[h.bl,h.hit+3]],[.52,.88,1],.25+.18*pulse);
  line([[h.bl,h.hit-3],[h.br,h.hit-3]],[.70,.95,1],.85);
  line([[h.bl,h.hit+5],[h.br,h.hit+5]],[1,.30,.76],.35);
  line([[h.tl,h.far],[h.bl,h.hit+10]],[.55,.82,1],.55);
  line([[h.tr,h.far],[h.br,h.hit+10]],[1,.35,.78],.42);
  // Key-group flashes.
  for(let k=0;k<4;k++){
    const f=Math.max(0,(S.keyFlash[k]-performance.now())/.18);
    if(f<=0)continue;
    const x1=h.bl+(h.br-h.bl)*(k*3)/12,x2=h.bl+(h.br-h.bl)*((k+1)*3)/12;
    poly([[x1,h.hit-22],[x2,h.hit-22],[x2,h.hit+12],[x1,h.hit+12]],[.56,.94,1],cl(f*.34,0,.34));
  }
}
function drawNote(n,now){
  const p=cl(1-(n.hit-now)/S.lead,0,1),settings=app().dojo||{};
  if(settings.sudden&&p<.34)return;
  const alpha=settings.hidden?cl((p-.16)/.44,.06,1):1;
  const q=stageAt(p),x=laneX(n.l,p),w=Math.max(9,laneW(p)*n.w*.94),hh=Math.max(5,w*.16);
  const col=n.c?[1,.84,.16]:n.f?[1,.35,.48]:n.t?[.22,1,.72]:[.20,.88,1];
  // shadow + bloom
  poly([[x-w*.86,q.y-hh*1.8],[x+w*.86,q.y-hh*1.8],[x+w*.86,q.y+hh*1.8],[x-w*.86,q.y+hh*1.8]],col,.09*alpha);
  poly([[x-w*.66,q.y-hh*1.4],[x+w*.66,q.y-hh*1.4],[x+w*.66,q.y+hh*1.4],[x-w*.66,q.y+hh*1.4]],col,.20*alpha);
  if(n.c){
    poly([[x,q.y-hh*1.65],[x+w*.64,q.y],[x,q.y+hh*1.65],[x-w*.64,q.y]],[1,.86,.18],.95*alpha);
    line([[x-w*.42,q.y],[x,q.y-hh*.92],[x+w*.42,q.y]], [1,1,1],.35*alpha);
  }else{
    poly([[x-w*.52,q.y-hh],[x+w*.52,q.y-hh],[x+w*.52,q.y+hh],[x-w*.52,q.y+hh]],col,.98*alpha);
    poly([[x-w*.24,q.y-hh*.42],[x+w*.24,q.y-hh*.42],[x+w*.24,q.y+hh*.42],[x-w*.24,q.y+hh*.42]],[1,1,1],.16*alpha);
  }
  if(n.f){
    const d=n.f==="left"?-1:n.f==="right"?1:0;
    if(d){
      line([[x-d*w*.18,q.y-hh*2.0],[x+d*w*.36,q.y-hh*2.0],[x+d*w*.18,q.y-hh*1.1]],[1,.58,.78],.95*alpha);
    }else{
      line([[x,q.y-hh*2.15],[x-w*.26,q.y-hh*1.58],[x+w*.26,q.y-hh*1.58]],[1,.58,.78],.95*alpha);
    }
  }
  if(n.t&&!n.f){
    for(let i=0;i<3;i++){
      const yy=q.y-hh*(1.6-i*.5),ww=w*(.17+i*.08);
      line([[x-ww,yy],[x+ww,yy]],[.7,1,.9],.55*alpha);
    }
  }
}
function drawHold(n,now){
  if(!n.path?.length||n.end<now-.02)return;
  const settings=app().dojo||{};
  const samples=[];
  const step=Math.max(.028,(n.end-n.b)/32);
  for(let sec=Math.max(n.b-now,-S.lead);sec<=n.end-now+.02;sec+=step){
    const abs=now+sec,z=pointOnPath(n.path,abs);if(!z)continue;
    const p=cl(1-(abs-now)/S.lead,0,1);const q=stageAt(p);
    samples.push({x:laneX(z.l,p),y:q.y,w:laneW(p)*(z.w||n.w)*.47});
  }
  if(samples.length<2)return;
  const c=n.t?[.20,1,.72]:n.c?[1,.82,.18]:[.12,.92,.63];
  for(let i=0;i<samples.length-1;i++){
    const a=samples[i],b=samples[i+1];
    poly([[a.x-a.w,a.y],[a.x+a.w,a.y],[b.x+b.w,b.y],[b.x-b.w,b.y]],c,settings.hidden?0.42:0.72);
  }
  for(let i=0;i<samples.length-1;i++)line([[samples[i].x,samples[i].y],[samples[i+1].x,samples[i+1].y]],[.82,1,1],.26);
  const head=pointOnPath(n.path,Math.max(n.b,now)),hp=stageAt(cl(1-(head.sec-now)/S.lead,0,1)),hx=laneX(head.l,cl(1-(head.sec-now)/S.lead,0,1)),hw=laneW(cl(1-(head.sec-now)/S.lead,0,1))*n.w*.9;
  poly([[hx-hw,hp.y-7],[hx+hw,hp.y-7],[hx+hw,hp.y+8],[hx-hw,hp.y+8]],n.c?[1,.82,.18]:c,.82);
  const tail=n.tail||n.path[n.path.length-1];
  if(n.end>now-.05){
    const tp=cl(1-(n.end-now)/S.lead,0,1),tq=stageAt(tp),tx=laneX(tail.l,tp),tw=laneW(tp)*(tail.w||n.w)*.78;
    if(tail.dir||tail.type===2)drawTailArrow(tx,tq.y,tw,tail.dir||n.f,c,1);
  }
  if(n.active&&settings.sudden){ /* visual kept; gameplay still runs */ }
}
function drawTailArrow(x,y,w,dir,c,a){
  const d=dir==="left"?-1:dir==="right"?1:0;
  if(d)line([[x-d*w*.16,y-10],[x+d*w*.44,y-10],[x+d*w*.22,y-28]],c,a);
  else line([[x,y-10],[x-w*.28,y-28],[x+w*.28,y-28]],c,a);
}
function spawnFx(lane,judgeKind,critical=false){
  const x=laneX(lane,1),y=S.geom.hit-2;
  S.fx.push({x,y,t:0,j:judgeKind,c:critical});
  const count=critical?24:16;
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,v=55+Math.random()*185;
    S.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:0,life:.36+Math.random()*.28,size:1.5+Math.random()*3,c:critical?[1,.82,.18]:[.55,.92,1]});
  }
}
function effects(dt){
  for(const e of S.fx){
    e.t+=dt;const k=e.t/.48,r=8+74*k,c=e.c?[1,.82,.18]:[.55,.90,1];
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      line([[e.x+Math.cos(a)*r*.25,e.y+Math.sin(a)*r*.25],[e.x+Math.cos(a)*r,e.y+Math.sin(a)*r]],c,(1-k)*.9);
    }
  }
  S.fx=S.fx.filter(x=>x.t<.48);
  for(const p of S.particles){
    p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=150*dt;
    const a=1-p.t/p.life;if(a>0){
      const s=p.size*(1+.5*(1-a));
      poly([[p.x-s,p.y-s],[p.x+s,p.y-s],[p.x+s,p.y+s],[p.x-s,p.y+s]],p.c,a);
    }
  }
  S.particles=S.particles.filter(p=>p.t<p.life);
}
function hud(judgment){
  const put=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  put("dojoGameScore",String(Math.max(0,Math.floor(S.score))).padStart(7,"0"));
  put("dojoGameCombo",S.combo);
  const acc=S.tn?cl(100-(S.timing/S.tn)*120,0,100):100;
  put("dojoGameAccuracy",acc.toFixed(2)+"%");
  const life=$("dojoGameLifeBar");if(life)life.style.width=cl(S.life/10,0,100)+"%";
  const jt=$("dojoJudgeText");
  if(jt){
    jt.textContent=judgment||"";
    jt.dataset.j=judgment||"";
    if(judgment){
      jt.style.opacity="1";jt.style.transform="translateY(-2px) scale(1.03)";
      clearTimeout(S.judgeTimer);
      S.judgeTimer=setTimeout(()=>{jt.style.opacity=".86";jt.style.transform="translateY(0) scale(1)"},120);
    }
  }
}
const WINDOWS={
  tap:{P:.04167,G:.08333,D:.10833,B:.125},
  critical:{P:.055,G:.08333,D:.10833,B:.125},
  flick:{P:.05833,G:.125,D:.13333,B:.142},
  trace:{P:.08333,G:.08333,D:.08333,B:.100},
  slideEnd:{P:.06667,G:.13333,D:.142,B:.142}
};
function classify(diff,type){
  const w=type==="trace"?WINDOWS.trace:type==="flick"?WINDOWS.flick:type==="slideEnd"?WINDOWS.slideEnd:type==="critical"?WINDOWS.critical:WINDOWS.tap;
  const a=Math.abs(diff);
  return a<=w.P?"PERFECT":a<=w.GREAT?"GREAT":a<=w.D?"GOOD":a<=w.B?"BAD":"MISS";
}
function award(n,d,type="tap",allowFinish=true){
  const kind=type==="flick"?"flick":n.c?"critical":n.t?"trace":"tap";
  const jg=classify(d,kind);
  S.counts[jg]++;S.timing+=Math.min(Math.abs(d),.2);S.tn++;
  if(jg==="MISS"||jg==="BAD")S.combo=0;else S.combo++;
  S.best=Math.max(S.best,S.combo);
  const weight=n.c?1.35:n.f?1.15:n.t?.35:1;
  S.score+=Math.round((jg==="PERFECT"?1000:jg==="GREAT"?700:jg==="GOOD"?400:jg==="BAD"?150:0)*weight);
  S.life=cl(S.life+(jg==="MISS"?-65:jg==="BAD"?-28:1),0,1000);
  n.done=true;n.judged=true;S.judged++;
  S.lastJudge=jg;S.lastJudgeAt=performance.now();hud(jg);spawnFx(n.l,jg,!!n.c);
  if(allowFinish&&S.judged>=S.total)finish();
  return jg;
}
function expectedLane(n,time){
  const z=pointOnPath(n.path,time);
  return z?z.l:n.l;
}
function findCandidate(inputLane,now,mode="tap",exact=false,direction="up"){
  let best=null,bestAbs=999;
  for(const n of S.notes){
    if(n.done||n.started)continue;
    if(mode==="flick"&&!n.f)continue;
    if(mode!=="flick"&&n.f)continue;
    const nl=expectedLane(n,now);
    const match=exact?Math.abs(nl-inputLane)<=Math.max(.5,(n.w||1)/2):Math.floor(nl/3)===inputLane;
    if(!match)continue;
    const d=now-n.hit,a=Math.abs(d),w=n.f?WINDOWS.flick.B:(n.c?WINDOWS.critical.B:WINDOWS.tap.B);
    if(a<=w&&a<bestAbs){bestAbs=a;best=n;}
  }
  return best;
}
function startHold(n,inputId,now){
  n.started=true;
  S.held.set(inputId,{note:n,lane:n.l});
  const head=award({...n,k:"tap"},now-n.hit,false);
  // The copied head award marks the clone done, not the real hold.
  n.done=false;n.judged=false;
  S.combo=Math.max(0,S.combo-(head==="MISS"?0:1));
  // Explicit head scoring without consuming the entire slide.
  n.headJudged=true;S.judged=Math.max(0,S.judged-1);
  // Tick schedule
  for(const cp of n.checkpoints||[])cp.judged=false;
  return head;
}
function hit(lane,mode="tap",exact=false,direction="up",inputId="kbd"){
  if(!S.running||S.paused)return;
  const group=exact?Math.floor(lane/3):lane;
  S.keyFlash[cl(group,0,3)]=performance.now()+180;
  const settings=app().dojo||{},now=S.audio.currentTime-S.seek+N(settings.audioOffset,0)/1000;
  let n=findCandidate(lane,now,mode,exact,direction);
  if(!n&&mode==="flick")n=findCandidate(lane,now,"tap",exact,direction);
  if(!n)return;
  if(n.f){
    if(n.f==="left"&&direction!=="left")return;
    if(n.f==="right"&&direction!=="right")return;
  }
  if(n.k==="hold"){
    n.started=true;n.headJudged=true;
    const head=award(n,now-n.hit,n.f?"flick":"tap",false);
    n.done=false;n.judged=true;
    S.held.set(inputId,{note:n,lane:n.l,touchedLane:n.l,head});
    for(const cp of n.checkpoints||[])cp.judged=false;
    return;
  }
  award(n,now-n.hit,n.f?"flick":n.t?"trace":"tap");
}
function release(inputId){
  const held=S.held.get(inputId);if(!held)return;
  S.held.delete(inputId);
  const n=held.note;
  const settings=app().dojo||{},now=S.audio.currentTime-S.seek+N(settings.audioOffset,0)/1000;
  const tail=n.tail||n.path?.[n.path.length-1];if(!tail)return;
  const d=now-tail.sec;
  if(Math.abs(d)<=WINDOWS.slideEnd.B){
    if(n.done)return;
    const fake={...n,l:tail.l,c:tail.critical,t:tail.trace,f:tail.dir,done:false};
    const jg=award(fake,d,tail.dir?"flick":tail.trace?"trace":"slideEnd",false);
    n.done=true;n.judged=true;S.judged++;
    if(jg==="MISS")S.combo=0;
    if(S.judged>=S.total)finish();
  }else{
    n.done=true;n.judged=true;S.judged++;S.combo=0;S.life=cl(S.life-48,0,1000);S.counts.MISS++;S.tn++;hud("MISS");spawnFx(tail.l,"MISS",!!tail.critical);
  }
}
function processHeld(now){
  for(const [id,h] of S.held){
    const n=h.note;
    const target=expectedLane(n,now);
    h.targetLane=target;
    // Check all path checkpoints once their time has passed.
    for(const cp of n.checkpoints||[]){
      if(cp.judged||now<cp.sec-WINDOWS.trace.B)continue;
      const laneNow=h.lane;
      const delta=Math.abs(laneNow-cp.lane);
      if(delta<=Math.max(1,(n.w||1)/2)+.35){
        cp.judged=true;S.judged++;S.combo++;S.best=Math.max(S.best,S.combo);S.score+=cp.critical?400:100;S.life=cl(S.life+1,0,1000);
      }else{
        cp.judged=true;S.judged++;S.combo=0;S.life=cl(S.life-12,0,1000);S.counts.MISS++;S.tn++;hud("MISS");
      }
    }
  }
}
function sweep(now){
  for(const n of S.notes){
    if(n.done||n.started)continue;
    const win=n.f?WINDOWS.flick.B:n.t?WINDOWS.trace.B:(n.c?WINDOWS.critical.B:WINDOWS.tap.B);
    if(now-n.hit>win){S.counts.MISS++;S.tn++;S.combo=0;S.life=cl(S.life-65,0,1000);n.done=true;n.judged=true;S.judged++;hud("MISS");spawnFx(n.l,"MISS",!!n.c);}
  }
  if(S.life<=0)finish();
}
function loop(t){
  S.raf=requestAnimationFrame(loop);
  const dt=Math.min(.05,(t-(S.last||t))/1000);S.last=t;
  bg();drawStage();
  if(S.running){
    const rawNow=S.audio.currentTime-S.seek,settings=app().dojo||{};
    const visualNow=rawNow+N(settings.visualOffset,0)/1000;
    for(const n of S.notes){
      if(n.k==="hold")drawHold(n,visualNow);
      else if(visualNow>n.hit-S.lead&&visualNow<n.hit+.16)drawNote(n,visualNow);
    }
    const judgeNow=rawNow+N(settings.audioOffset,0)/1000;
    processHeld(judgeNow);sweep(judgeNow);
    const endBase=S.notes.length?Math.max(...S.notes.map(n=>n.end||n.hit)):0;
    const p=endBase?cl(judgeNow/endBase,0,1):0;
    const pb=$("dojoGameProgressBar");if(pb)pb.style.width=(p*100)+"%";
    if(judgeNow>S.endAt+.55)finish();
  }
  effects(dt);
}
function resultCounts(){
  return"PERFECT "+S.counts.PERFECT+"　GREAT "+S.counts.GREAT+"　GOOD "+S.counts.GOOD+"　BAD "+S.counts.BAD+"　MISS "+S.counts.MISS;
}
function finish(){
  if(!S.running)return;
  S.running=false;S.audio.pause();S.held.clear();
  if(S.pause)S.pause.hidden=true;
  const ap=S.counts.MISS===0&&S.counts.BAD===0,rank=ap?"ALL PERFECT":S.counts.MISS<5?"CLEAR":"FAILED";
  const r=$("dojoGameResult");
  if(r){
    r.hidden=false;
    r.innerHTML="<strong>"+rank+"</strong><span>"+S.best+" COMBO · "+String(Math.floor(S.score)).padStart(7,"0")+"</span><small>"+resultCounts()+"</small><button type=\"button\" data-dojo-result-replay>再玩一次</button>";
    r.querySelector("[data-dojo-result-replay]")?.addEventListener("click",()=>{r.hidden=true;start()},{once:true});
  }
  const b=$("dojoOpenPracticeBtn");if(b)b.textContent="↻ 再玩一次";
  const m=$("dojoGameMessage");if(m)m.textContent=rank+" · "+S.best+" COMBO";
  if(S.status)S.status.textContent=rank+" · DOJO";
}
function pause(){
  if(S.starting)return;
  if(S.paused){
    S.audio.play().then(()=>{S.paused=false;S.running=true;if(S.pause)S.pause.textContent="Ⅱ";if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停"}).catch(()=>{});
    return;
  }
  if(!S.running)return;
  S.audio.pause();S.running=false;S.paused=true;
  if(S.pause)S.pause.textContent="▶";if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="繼續打歌";
}
async function data(){
  if(S.songs)return;
  const [a,b,c]=await Promise.all([j("dojo-musics.json"),j("dojo-difficulties.json"),j("dojo-vocals.json").catch(()=>[])]);
  S.songs=a;S.diffs=b;S.vocals=c;
  const m=new Map();
  for(const d of b){const id=+d.musicId;if(!m.has(id))m.set(id,{});m.get(id)[String(d.musicDifficulty).toLowerCase()]=d;}
  S.songs=S.songs.map(x=>({...x,difficulties:m.get(+x.id)||{}}));
}
function selection(){
  const title=$("dojoSelectedTitle")?.textContent?.trim()||"";
  const last=+(localStorage.getItem("pjsekai-chart-last-song")||1);
  const m=S.songs.find(x=>x.title===title)||S.songs.find(x=>+x.id===last)||S.songs[0];
  if(!m)return null;
  let d=S.selDiff;
  const box=$("dojoDifficultyButtons");
  if(box){
    const a=box.querySelector(".active,[aria-pressed='true'],button.selected");
    if(a){
      const raw=((a.dataset.dojoDiff||a.dataset.difficulty||a.textContent||"")+"").toLowerCase();
      const k=DIFF.find(x=>raw.includes(x));if(k)d=k;
    }
  }
  if(!m.difficulties[d])d=DIFF.find(x=>m.difficulties[x])||"expert";
  return{m,d};
}
async function prepare(){
  await data();const q=selection();if(!q?.m)throw Error("歌曲資料尚未就緒");
  const url="https://assets.unipjsk.com/startapp/music/music_score/"+String(q.m.id).padStart(4,"0")+"_01/"+q.d;
  const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("官方譜面載入失敗 HTTP "+r.status);
  const parsed=susToPlayable(await r.text(),N(q.m.bpm,120));
  const filler=N(q.m.fillerSec,0);parsed.filler=filler;
  for(const n of parsed.notes){
    n.hit+=filler;n.b+=filler;if(n.end)n.end+=filler;
    if(n.path)for(const p of n.path)p.sec+=filler;
    if(n.tail)n.tail.sec+=filler;
    if(n.checkpoints)for(const cp of n.checkpoints)cp.sec+=filler;
  }
  // Some legacy SUS exports contain a duplicated zero-time metadata cluster.
  // Ignore that cluster only when a real chart start is clearly separated from it.
  const ordered=parsed.notes.filter(n=>Number.isFinite(n.hit)).sort((a,b)=>a.hit-b.hit);
  const early=ordered.filter(n=>n.hit<0.25);
  const next=ordered.find(n=>n.hit>=0.25);
  if(early.length>=4&&next&&next.hit-early[early.length-1].hit>1.5){
    parsed.notes=ordered.filter(n=>n.hit>=0.25);
  }
  const vocal=S.vocals.find(x=>+x.musicId===+q.m.id&&x.musicVocalType==="original_song")||S.vocals.find(x=>+x.musicId===+q.m.id);
  const vn=vocal?.assetbundleName||String(q.m.id).padStart(4,"0")+"_01";
  parsed.music=q.m;parsed.difficulty=q.d;parsed.vocal=vocal||null;
  parsed.audioUrl="https://storage.sekai.best/sekai-jp-assets/music/long/"+vn+"/"+vn+".wav";
  parsed.jacket="https://assets.unipjsk.com/startapp/music/jacket/"+vn+"/"+vn+".png";
  S.prep=parsed;return parsed;
}
async function ensurePrepared(){
  const q=selection();
  if(S.prep?.music?.id===q?.m?.id&&S.prep?.difficulty===q?.d)return S.prep;
  return prepare();
}
async function start(){
  if(S.starting)return;
  if(S.running){pause();return;}
  if(S.paused&&S.audio.src){
    try{await S.audio.play();S.paused=false;S.running=true;if(S.pause)S.pause.textContent="Ⅱ";if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";}catch(_){}
    return;
  }
  S.starting=true;
  try{
    const b=$("dojoOpenPracticeBtn");if(b){b.disabled=true;b.textContent="載入中…";}
    const q=selection();if(!q?.m)throw Error("請先選擇歌曲");
    await data();const prep=await ensurePrepared();
    S.notes=prep.notes.map(x=>({...x,path:x.path?.map(p=>({...p})),tail:x.tail?{...x.tail}:null,checkpoints:x.checkpoints?.map(p=>({...p}))}));
    S.total=S.notes.reduce((n,x)=>n+((x.k==="hold"?2:1)+(x.checkpoints?.length||0)),0);
    S.score=0;S.combo=0;S.best=0;S.life=1000;S.judged=0;
    S.counts={PERFECT:0,GREAT:0,GOOD:0,BAD:0,MISS:0};S.timing=0;S.tn=0;
    S.held.clear();S.fx=[];S.particles=[];S.lastJudge="";S.error="";
    const vn=prep.vocal?.assetbundleName||String(q.m.id).padStart(4,"0")+"_01";
    S.audio.pause();S.audio.src="https://storage.sekai.best/sekai-jp-assets/music/long/"+vn+"/"+vn+".wav";S.audio.load();
    const speed=N(app().dojo?.speed,10);
    S.lead=cl(3.25-(speed-1)*.16,1.6,3.25);S.seek=0;
    await new Promise((resolve,reject)=>{
      if(S.audio.readyState>=2){resolve();return;}
      const ok=()=>{cleanup();resolve()},bad=()=>{cleanup();reject(Error("官方音源載入失敗"))};
      const cleanup=()=>{S.audio.removeEventListener("canplay",ok);S.audio.removeEventListener("error",bad)};
      S.audio.addEventListener("canplay",ok,{once:true});S.audio.addEventListener("error",bad,{once:true});
    });
    await S.audio.play();
    S.running=true;S.paused=false;
    S.endAt=Math.max(...S.notes.map(x=>x.end||x.hit),0)+.8;
    if(S.pause)S.pause.hidden=false;
    if(S.status)S.status.textContent="PLAY · "+LAB[q.d];
    if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";
    if($("dojoGameResult"))$("dojoGameResult").hidden=true;
    if($("dojoGameSongTitle"))$("dojoGameSongTitle").textContent=q.m.title;
    if($("dojoGameSongMeta"))$("dojoGameSongMeta").textContent="官方音源 · "+LAB[q.d];
    const cover=$("dojoGameCover");if(cover){cover.src=prep.jacket||"";cover.alt=q.m.title;}
    const stage=$("dojoGameStageWrap");if(stage&&prep.jacket){
      stage.style.backgroundImage="linear-gradient(180deg,rgba(4,6,18,.84),rgba(4,7,18,.98)),url(\""+prep.jacket+"\")";
      stage.style.backgroundSize="cover";stage.style.backgroundPosition="center";
    }
    hud("");
  }catch(e){
    S.error=e?.stack||e?.message||String(e);
    if($("dojoGameMessage"))$("dojoGameMessage").textContent="⚠ "+(e?.message||"開始失敗");
    if(appRoot()?.toast)appRoot().toast(e?.message||"Dojo 啟動失敗");
  }finally{
    S.starting=false;const b=$("dojoOpenPracticeBtn");if(b){b.disabled=false;if(!S.running)b.textContent="▶ 開始打歌";}
  }
}
function bind(){
  document.addEventListener("click",e=>{
    const btn=e.target.closest("#dojoOpenPracticeBtn");
    if(btn){e.preventDefault();start();return;}
    const d=e.target.closest("[data-dojo-diff]");if(d)S.selDiff=d.dataset.dojoDiff||"expert";
  },{capture:true});
  document.addEventListener("keydown",e=>{
    if(/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||""))return;
    const i=S.keys.findIndex(k=>String(k).toUpperCase()===String(e.key).toUpperCase());
    if(i<0||e.repeat)return;e.preventDefault();
    hit(i,"tap",false,"up","key:"+e.key.toUpperCase());
  });
  document.addEventListener("keyup",e=>{
    const i=S.keys.findIndex(k=>String(k).toUpperCase()===String(e.key).toUpperCase());
    if(i>=0)release("key:"+e.key.toUpperCase());
  });
  document.addEventListener("pointerdown",e=>{
    const z=e.target.closest("[data-dojo-lane-zone]");
    if(z){
      e.preventDefault();const lane=cl(+z.dataset.dojoLaneZone|0,0,11);
      S.touch.set(e.pointerId,{l:lane,x:e.clientX,y:e.clientY,t:performance.now(),exact:true});
      hit(lane,"tap",true,"up","ptr:"+e.pointerId);return;
    }
    const w=$("dojoGameStageWrap");if(!w||!S.running)return;
    const r=w.getBoundingClientRect(),x=cl((e.clientX-r.left)/r.width,0,.999),lane=cl(Math.floor(x*12),0,11);
    S.touch.set(e.pointerId,{l:lane,x:e.clientX,y:e.clientY,t:performance.now(),exact:true});
    hit(lane,"tap",true,"up","ptr:"+e.pointerId);
  },{passive:false});
  document.addEventListener("pointermove",e=>{
    const q=S.touch.get(e.pointerId);if(!q)return;
    const dx=e.clientX-q.x,dy=e.clientY-q.y;
    if(S.held.has("ptr:"+e.pointerId)){
      const w=$("dojoGameStageWrap"),r=w?.getBoundingClientRect();
      if(r)q.l=cl(Math.floor(cl((e.clientX-r.left)/r.width,0,.999)*12),0,11);
      const h=S.held.get("ptr:"+e.pointerId);if(h)h.lane=q.l;
      if(Math.hypot(dx,dy)>20){
        const dir=Math.abs(dx)>Math.abs(dy)?(dx<0?"left":"right"):"up";
        if(h?.note?.tail?.dir&&h.note.tail.dir===dir)h.flicked=true;
      }
      return;
    }
    if(Math.hypot(dx,dy)>22&&S.running){
      const dir=Math.abs(dx)>Math.abs(dy)?(dx<0?"left":"right"):"up";
      hit(q.l,"flick",true,dir,"ptr:"+e.pointerId);q.x=e.clientX;q.y=e.clientY;
    }
  },{passive:false});
  const endPointer=e=>{const q=S.touch.get(e.pointerId);S.touch.delete(e.pointerId);if(q)release("ptr:"+e.pointerId);};
  document.addEventListener("pointerup",endPointer);document.addEventListener("pointercancel",endPointer);
  $("dojoGameFullscreenBtn")?.addEventListener("click",async()=>{try{await $("dojoGameStageWrap")?.requestFullscreen?.()}catch(_){}});
  $("dojoGameResetBtn")?.addEventListener("click",()=>{S.running=false;S.paused=false;S.audio.pause();S.audio.currentTime=0;if(S.pause)S.pause.hidden=true;if($("dojoGameResult"))$("dojoGameResult").hidden=true;if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="▶ 開始打歌";});
}
function expose(){
  window.__PJSEKAI_DOJO__={
    start,pause,finish,
    state:{
      get prepared(){if(!S.prep)return null;return{music:S.prep.music,difficulty:S.prep.difficulty,audioUrl:S.prep.audioUrl||"",vocal:S.prep.vocal||null,notes:S.prep.notes||[]};},
      get notes(){return S.notes.map(n=>({lane:n.l,kind:n.k,hit:n.hit,judged:!!n.done}));},
      get audio(){return S.audio},
      get running(){return S.running},
      get starting(){return S.starting},
      get score(){return S.score},
      get combo(){return S.combo},
      get judged(){return S.judged},
      get error(){return S.error||""},
      get settings(){const d=app().dojo||{};return{speed:N(d.speed,10),audioOffset:N(d.audioOffset,0),visualOffset:N(d.visualOffset,0),mirror:!!d.mirror,hidden:!!d.hidden,sudden:!!d.sudden};},
      get noteStats(){
        const hits=S.notes.map(n=>n.hit).filter(Number.isFinite);
        const now=S.audio.currentTime||0;
        const future=S.notes.filter(n=>Number.isFinite(n.hit)&&n.hit>now+.1).slice(0,12);
        return{count:S.notes.length,finite:hits.length,min:hits.length?Math.min(...hits):null,max:hits.length?Math.max(...hits):null,now,future:future.map(n=>({hit:n.hit,lane:n.l,kind:n.k,end:n.end||0}))};
      }
    }
  };
}
async function boot(){
  if(booted)return;booted=true;
  try{expose();setup();bind();if(!S.raf)S.raf=requestAnimationFrame(loop);await data();await prepare();}
  catch(e){S.error=e?.stack||e?.message||String(e);console.warn("[Dojo WebGL]",e);const m=$("dojoGameMessage");if(m)m.textContent="⚠ Dojo 初始化失敗："+(e?.message||"未知錯誤");}
}
function startBoot(){A=window.__PJSEKAI_APP__||A;if(appRoot())boot();}
window.addEventListener("pjsekai-app-ready",startBoot);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startBoot,{once:true});else queueMicrotask(startBoot);
})();