/* Dojo WebGL runtime — Project SEKAI-style browser practice engine. */
/* renderer revision: 2026-09-30 */
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
  lead:2.5,seek:0,chartOffset:0,score:0,combo:0,best:0,life:1000,judged:0,total:0,
  counts:{PERFECT:0,GREAT:0,GOOD:0,MISS:0},
  timing:0,tn:0,held:new Map(),fx:[],particles:[],keyFlash:[0,0,0,0],
  gl:null,buf:null,program:null,pp:null,cc:null,geom:null,raf:0,last:0,
  keys:["D","F","J","K"],ro:null,status:null,pause:null,error:"",
  inputFlash:[],lastJudge:"",lastJudgeAt:0,backdrop:new Image(),backdropReady:false,
  touch:new Map(),songStartPerf:0,lastNow:0,judgementHistory:[],lastInput:null,audioCtx:null,sfxGain:null,judgeTimer:null,
  skin:null,tex:null,texProgram:null,texBuf:null,texLoc:null
};
S.audio.preload="auto";
S.audio.crossOrigin="anonymous";

const style=document.createElement("style");
style.textContent=[
"#dojoGameStageWrap{position:relative;overflow:hidden;aspect-ratio:16/9;min-height:320px;background:#03040b;touch-action:none;isolation:isolate}","#dojoGameStageWrap:fullscreen{width:100vw;height:100vh;background:#03040b}","#dojoGameStageWrap:fullscreen .dojo-input-pad{display:grid}",".dojo-input-pad{position:absolute;inset:auto 0 0;height:24%;z-index:4;display:grid;grid-template-columns:repeat(12,1fr);pointer-events:auto}",".dojo-input-zone{background:transparent;border:0;position:relative;touch-action:none}",".dojo-input-zone:active{background:rgba(120,210,255,.08)}",
"#dojoGameCanvas{position:absolute;inset:0;width:100%;height:100%;display:block}","#dojoGameScore{font-variant-numeric:tabular-nums;letter-spacing:.06em;text-shadow:0 2px 8px rgba(0,0,0,.48)}",
"#dojoGameAccuracy{font-variant-numeric:tabular-nums}",
"#dojoGameCombo{font-variant-numeric:tabular-nums;text-shadow:0 0 24px rgba(255,255,255,.4)}",
"#dojoJudgeText{font-weight:1000;letter-spacing:.04em}",
"#dojoGameResult{backdrop-filter:blur(18px);background:rgba(3,5,14,.78);border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 80px rgba(0,0,0,.45)}",
".dojo-wgl-overlay{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 72%,rgba(44,70,130,.05),rgba(2,4,14,.46) 80%,rgba(0,0,0,.78) 100%);z-index:2}",
".dojo-wgl-status{position:absolute;z-index:5;left:12px;bottom:10px;padding:5px 9px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(5,8,20,.46);color:rgba(255,255,255,.72);font:800 9px system-ui;letter-spacing:.1em;pointer-events:none;backdrop-filter:blur(8px)}",
".dojo-wgl-pause{position:absolute;z-index:6;right:12px;top:12px;width:40px;height:40px;border:1px solid rgba(255,255,255,.25);background:rgba(9,12,28,.58);color:#fff;border-radius:12px;font-weight:900;font-size:17px;backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,.24)}",
".dojo-wgl-pause:active{transform:scale(.95)}",
"#dojoJudgeText{transition:transform .12s ease,opacity .18s ease;text-shadow:0 0 18px currentColor;position:relative}",
"#dojoJudgeText[data-timing]:after{content:attr(data-timing);display:block;font:900 8px/10px system-ui;letter-spacing:.16em;opacity:.9;margin-top:2px}",
"#dojoJudgeText[data-timing='FAST']:after{color:#8bdcff}",
"#dojoJudgeText[data-timing='LATE']:after{color:#ffb2d3}",
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
    offset:-N(meta.get("WAVEOFFSET"),0),
    ticksPerBeat,
    timeScaleChanges,
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
  const atTick=t=>beatToSec(t/score.ticksPerBeat,changes,baseBpm);  const timeScaleChanges=score.timeScaleChanges.map(x=>({tick:x.tick,sec:atTick(x.tick),timeScale:N(x.timeScale,1)})).sort((a,b)=>a.sec-b.sec);
  const key=n=>n.lane+"-"+Math.round(n.tick);
  const flick=new Map(),trace=new Set(),critical=new Set(),removeSE=new Set(),easeIn=new Set(),easeOut=new Set();
  // Public Next-SEKAI SUS semantics: directional types are 1=up, 3=left, 4=right.
  // Types 2/5/6 are easing modifiers and are not flick directions.
  const directionName=t=>({1:"up",3:"left",4:"right"}[Number(t)]||null);
  for(const n of score.directionalNotes){
    const k=key(n),dir=directionName(n.type);
    if(dir)flick.set(k,dir);
    else if(n.type===2)easeIn.add(k);
    else if(n.type===5||n.type===6)easeOut.add(k);
  }
  for(const n of score.tapNotes){
    const k=key(n);
    if(n.type===2)critical.add(k);
    else if(n.type===5)trace.add(k);
    else if(n.type===6){trace.add(k);critical.add(k);}
    else if(n.type===3||n.type===7||n.type===8)removeSE.add(k);
    if(n.type===8)critical.add(k);
  }
  const preventSingles=new Set();
  for(const slide of score.slides)if(slide.type===3){
    for(const n of slide.notes)if([1,2,3,5].includes(n.type))preventSingles.add(key(n));
  }
  const notes=[],guides=[],used=new Set(),slideHeads=new Map();
  const lane12=n=>cl(n.lane-2+Math.max(0,(n.width||1)-1)*.5,0,11);
  const pushSingle=n=>{
    const k=key(n);if(preventSingles.has(k)||used.has(k))return;
    if(![1,2,3,5,6].includes(n.type))return;
    used.add(k);
    notes.push({
      id:notes.length,k:"tap",l:lane12(n),w:Math.max(1,n.width||1),
      b:atTick(n.tick),hit:atTick(n.tick),end:0,c:n.type===2||n.type===6,
      f:flick.get(k)||null,t:trace.has(k)||n.type===5||n.type===6,
      dir:flick.get(k)||null,tick:n.tick,ease:"linear"
    });
  };
  for(const n of score.tapNotes)pushSingle(n);
  for(const n of score.directionalNotes){
    const k=key(n),dir=directionName(n.type);
    if(!dir)continue;
    const existing=notes.find(x=>Math.round(x.tick)===Math.round(n.tick)&&Math.abs(x.l-lane12(n))<0.51);
    if(existing){
      existing.f=dir;existing.dir=dir;
      continue;
    }
    if(!used.has(k)){
      pushSingle({...n,type:1});
      const x=notes[notes.length-1];
      if(x){x.f=dir;x.dir=dir;x.c=critical.has(k);x.t=trace.has(k);}
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
      ease:easeIn.has(key(n))?"in":easeOut.has(key(n))?"out":"linear",dir:flick.get(key(n))||null
    }));
    if(slide.type===9){
      guides.push({
        start:path[0]?.sec||0,
        end:path[path.length-1]?.sec||path[0]?.sec||0,
        path
      });
      continue;
    }
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
        if(p.type!==5 && p.type!==4 && !removeSE.has(key(ns[i]))){
          slideNote.checkpoints.push({sec:p.sec,lane:p.l,type:p.type,critical:p.critical,trace:p.trace,judged:false});
        }
      }
      const stepTicks=Math.max(1,Math.round(score.ticksPerBeat*.5));
      for(let tick=start.tick+stepTicks;tick<last.tick-stepTicks*.25;tick+=stepTicks){
        const sec=atTick(tick);
        if(!Number.isFinite(sec)||sec<=path[0].sec+.006||sec>=last.sec-.006)continue;
        const z=pointOnPath(path,sec);
        if(!z)continue;
        if(!slideNote.checkpoints.some(cp=>Math.abs(cp.sec-sec)<.018)){
          slideNote.checkpoints.push({sec,lane:z.l,type:z.type,critical:z.critical,trace:z.trace,judged:false});
        }
      }
      slideNote.checkpoints.sort((a,b)=>a.sec-b.sec);
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
    guides,
    filler:0,
    offset:score.offset,
    ticksPerBeat:score.ticksPerBeat
  };
}

function setup(){
  const c=$("dojoGameCanvas"),w=$("dojoGameStageWrap");
  if(!c||!w)throw Error("Dojo 畫面不存在");
  S.gl=c.getContext("webgl2",{antialias:true,alpha:true,preserveDrawingBuffer:false})||
        c.getContext("webgl",{antialias:true,alpha:true,preserveDrawingBuffer:false});
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
  const tvs="attribute vec2 p;attribute vec2 uv;varying vec2 vuv;void main(){gl_Position=vec4(p,0.,1.);vuv=uv;}";
  const tfs="precision mediump float;varying vec2 vuv;uniform sampler2D tex;uniform float alpha;void main(){vec4 c=texture2D(tex,vuv);gl_FragColor=vec4(c.rgb,c.a*alpha);}";
  S.texProgram=g.createProgram();g.attachShader(S.texProgram,sh(g.VERTEX_SHADER,tvs));g.attachShader(S.texProgram,sh(g.FRAGMENT_SHADER,tfs));g.linkProgram(S.texProgram);
  if(!g.getProgramParameter(S.texProgram,g.LINK_STATUS))throw Error(g.getProgramInfoLog(S.texProgram)||"WebGL texture link");
  S.texBuf=g.createBuffer();S.texLoc={
    p:g.getAttribLocation(S.texProgram,"p"),uv:g.getAttribLocation(S.texProgram,"uv"),
    tex:g.getUniformLocation(S.texProgram,"tex"),alpha:g.getUniformLocation(S.texProgram,"alpha")
  };
  g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.disable(g.DEPTH_TEST);g.clearColor(0,0,0,0);
  const rs=()=>{
    const r=w.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
    c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));
    g.viewport(0,0,c.width,c.height);
    const ref=window.__PJSEKAI_SEKAI_REF__;
    if(ref){
      const rg=ref.layout(c.width,c.height);
      const far=ref.screenPoint(0,rg.laneTop,1).y,hit=ref.screenPoint(0,1,1).y;
      S.geom={w:c.width,h:c.height,top:far,far,hit,
        tl:ref.screenPoint(-6,rg.laneTop,1).x,tr:ref.screenPoint(6,rg.laneTop,1).x,
        bl:ref.screenPoint(-6,1,1).x,br:ref.screenPoint(6,1,1).x};
    }else{
      const aspect=Math.max(0.001,r.width/r.height),target=16/9;
      const fh=c.height,fw=aspect>target?fh*target:c.width,ox=(c.width-fw)*.5;
      S.geom={w:c.width,h:c.height,top:fh*.10,far:fh*.18,hit:fh*.875,
        tl:ox+fw*.28,tr:ox+fw*.72,bl:ox+fw*.035,br:ox+fw*.965};
    }
  };
  rs();g.clear(g.COLOR_BUFFER_BIT);addEventListener("resize",rs,{passive:true});loadSkin();
  if(window.__PJSEKAI_SEKAI_REF__){
    try{
      window.__PJSEKAI_SEKAI_REF__.attach(g,S.texProgram,S.texBuf,S.texLoc);
      S.refReady=window.__PJSEKAI_SEKAI_REF__.loadAll().catch(()=>{});
    }catch(_){S.refReady=Promise.resolve();}
  }else S.refReady=Promise.resolve();
  if(window.ResizeObserver){S.ro=new ResizeObserver(rs);S.ro.observe(w);}
  if(!w.querySelector(".dojo-wgl-overlay")){
    const o=document.createElement("div");o.className="dojo-wgl-overlay";w.appendChild(o);
    const q=document.createElement("div");q.className="dojo-wgl-status";q.textContent="DOJO · WEBGL";w.appendChild(q);S.status=q;
    const p=document.createElement("button");p.className="dojo-wgl-pause";p.type="button";p.textContent="Ⅱ";p.hidden=true;p.setAttribute("aria-label","暫停");p.onclick=pause;w.appendChild(p);S.pause=p;
    const menu=document.createElement("div");menu.className="dojo-wgl-pause-menu";menu.hidden=true;menu.innerHTML="<div class=\"dojo-wgl-pause-panel\"><strong>遊戲暫停</strong><span>選擇要繼續、重開或離開打歌。</span><div><button type=\"button\" data-dojo-resume>▶ 繼續</button><button type=\"button\" data-dojo-retry>↻ 重開</button><button type=\"button\" data-dojo-exit>‹ 離開</button></div></div>";w.appendChild(menu);
    menu.addEventListener("click",e=>{
      if(e.target.closest("[data-dojo-resume]")){pause();return;}
      if(e.target.closest("[data-dojo-retry]")){menu.hidden=true;S.paused=false;S.running=false;S.audio.pause();S.audio.currentTime=0;start();return;}
      if(e.target.closest("[data-dojo-exit]")){window.__PJSEKAI_DOJO__?.stop?.();document.dispatchEvent(new CustomEvent("pjsekai-dojo-exit"));return;}
    });
    S.pauseMenu=menu;
  }
}
function xy(x,y,c,a=1){return[x/S.geom.w*2-1,1-y/S.geom.h*2,c[0],c[1],c[2],a]}
function spriteQuad(x,y,w,h,sp,alpha=1){
  if(!S.tex||!sp||!S.texProgram)return;
  const g=S.gl,W=S.skin?.width||128,H=S.skin?.height||128;
  const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2;
  const u0=sp.x/W,u1=(sp.x+sp.w)/W;
  const v0=1-(sp.y+sp.h)/H,v1=1-sp.y/H;
  const d=[
    ...xy2(x0,y0),u0,v1,...xy2(x1,y0),u1,v1,
    ...xy2(x0,y1),u0,v0,...xy2(x1,y1),u1,v0
  ];
  g.bindBuffer(g.ARRAY_BUFFER,S.texBuf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);
  g.useProgram(S.texProgram);g.enableVertexAttribArray(S.texLoc.p);g.enableVertexAttribArray(S.texLoc.uv);
  g.vertexAttribPointer(S.texLoc.p,2,g.FLOAT,false,16,0);g.vertexAttribPointer(S.texLoc.uv,2,g.FLOAT,false,16,8);
  g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,S.tex);g.uniform1i(S.texLoc.tex,0);g.uniform1f(S.texLoc.alpha,alpha);
  g.drawArrays(g.TRIANGLE_STRIP,0,4);
}
function xy2(x,y){return[x/S.geom.w*2-1,1-y/S.geom.h*2]}
function drawSkinSprite(name,x,y,w,h,alpha=1){
  const sp=S.skin?.sprites?.[name];if(sp)spriteQuad(x,y,w,h,sp,alpha);
}
function drawSkinPerspective(name,q,alpha=1){
  const sp=S.skin?.sprites?.[name],tex=S.tex,g=S.gl,loc=S.texLoc;
  if(!sp||!tex||!g||!loc||!Array.isArray(q)||q.length!==4)return;
  const W=S.skin?.width||128,H=S.skin?.height||128,u0=sp.x/W,u1=(sp.x+sp.w)/W,v0=1-(sp.y+sp.h)/H,v1=1-sp.y/H;
  const Q=[q[0],q[1],q[3],q[2]];
  const d=[...xy2(Q[0].x,Q[0].y),u0,v1,...xy2(Q[1].x,Q[1].y),u1,v1,...xy2(Q[2].x,Q[2].y),u0,v0,...xy2(Q[3].x,Q[3].y),u1,v0];
  g.bindBuffer(g.ARRAY_BUFFER,S.texBuf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);
  g.useProgram(S.texProgram);g.enableVertexAttribArray(S.texLoc.p);g.enableVertexAttribArray(S.texLoc.uv);
  g.vertexAttribPointer(S.texLoc.p,2,g.FLOAT,false,16,0);g.vertexAttribPointer(S.texLoc.uv,2,g.FLOAT,false,16,8);
  g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,tex);g.uniform1i(S.texLoc.tex,0);g.uniform1f(S.texLoc.alpha,alpha);
  g.drawArrays(g.TRIANGLE_STRIP,0,4);
}

async function loadSkin(){
  try{
    const data=await j("dojo-skin.json");
    S.skin=data;
    const img=new Image();img.crossOrigin="anonymous";
    img.onload=()=>{
      try{
        const g=S.gl,t=g.createTexture();S.tex=t;
        g.bindTexture(g.TEXTURE_2D,t);
        g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
        g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,img);
        g.bindTexture(g.TEXTURE_2D,null);
      }catch(e){console.warn("[Dojo skin]",e)}
    };
    img.onerror=()=>console.warn("[Dojo skin] texture unavailable");
    img.src=data.textureUrl;
  }catch(e){console.warn("[Dojo skin metadata]",e)}
}

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
const APPROACH_SCALE=Math.pow(1.06,-45);
function stageAt(p){
  const ref=window.__PJSEKAI_SEKAI_REF__;
  if(ref?.geom){
    const travel=cl(ref.approach(p),0,1.25);
    const l=ref.screenPoint(-6,1,travel),r=ref.screenPoint(6,1,travel),m=ref.screenPoint(0,1,travel);
    return{y:m.y,l:l.x,r:r.x};
  }
  const g=S.geom,t=Math.pow(APPROACH_SCALE,1-cl(p,0,1));
  return{y:g.far+(g.hit-g.far)*t,l:g.tl+(g.bl-g.tl)*t,r:g.tr+(g.br-g.tr)*t};
}
function laneX(l,p){
  const q=stageAt(p),mirror=!!app().dojo?.mirror,l2=mirror?11-l:l;
  return q.l+(q.r-q.l)*(l2+.5)/12;
}
function laneW(p){const q=stageAt(p);return(q.r-q.l)/12}
function preemptForSpeed(speed){
  const ref=window.__PJSEKAI_SEKAI_REF__;
  return ref?ref.preempt(N(speed,6)):(.35+(4-.35)*Math.pow(cl((N(speed,6)-12)/(1-12),0,1),1.31));
}
function scrollRateAt(t){
  const ev=S.prep?.timeScaleChanges||[];
  let rate=1;
  for(const e of ev){if(e.sec<=t)rate=N(e.timeScale,rate);else break;}
  return Math.max(.01,rate);
}
function scrollDistance(now,hit){
  if(!Number.isFinite(now)||!Number.isFinite(hit))return 0;
  if(now===hit)return 0;
  const reverse=now>hit,lo=reverse?hit:now,hi=reverse?now:hit;
  const ev=S.prep?.timeScaleChanges||[];
  let cur=lo,rate=scrollRateAt(lo),sum=0;
  for(const e of ev){
    if(e.sec<=lo)continue;
    if(e.sec>=hi)break;
    sum+=(e.sec-cur)*rate;cur=e.sec;rate=Math.max(.01,N(e.timeScale,rate));
  }
  sum+=(hi-cur)*rate;
  return reverse?-sum:sum;
}
function travelAt(now,target){
  return cl(1-scrollDistance(now,target)/Math.max(.001,S.lead),-.35,1.2);
}
function pointOnPath(path,sec){
  if(!path?.length)return null;
  if(sec<=path[0].sec)return{...path[0]};
  if(sec>=path[path.length-1].sec)return{...path[path.length-1]};
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];
    if(sec>=a.sec&&sec<=b.sec){
      const d=Math.max(1e-5,b.sec-a.sec),u=cl((sec-a.sec)/d,0,1);
      const mode=b.ease||a.ease||"linear";
      const ei=mode==="in"?.5:0,eo=mode==="out"?.5:0;
      const t0=u,t1=u*u*(3-2*u);
      const t3=Math.pow(1-u,3)*a.l+3*Math.pow(1-u,2)*u*(a.l+(b.l-a.l)*ei)+3*(1-u)*u*u*(b.l+(a.l-b.l)*eo)+Math.pow(u,3)*b.l;
      const tw=mode==="linear"?u:t1;
      const ww=a.w+(b.w-a.w)*tw;
      return{l:t3,w:ww,sec,trace:a.trace||b.trace,critical:a.critical||b.critical,ease:mode,dir:b.dir||a.dir||null};
    }
  }
  return{...path[path.length-1]};
}
function circle(x,y,r,col,a=1,segments=18){
  const pts=[[x,y]];
  for(let i=0;i<=segments;i++){const t=i/segments*Math.PI*2;pts.push([x+Math.cos(t)*r,y+Math.sin(t)*r]);}
  poly(pts,col,a);
}
function roundedRect(x,y,w,h,r,col,a=1){
  const rr=Math.min(r,w*.5,h*.5),pts=[];
  for(let k=0;k<4;k++){
    const cx=x+(k===0||k===3?rr:w-rr),cy=y+(k<2?rr:h-rr);
    const base=k===0?Math.PI: k===1?1.5*Math.PI: k===2?0:0.5*Math.PI;
    for(let i=0;i<=5;i++){const t=base+i*(Math.PI/2)/5;pts.push([cx+Math.cos(t)*rr,cy+Math.sin(t)*rr]);}
  }
  poly(pts,col,a);
}
function stagePoint(lane,p,mirror=false){
  const q=stageAt(cl(p,0,1)),m=mirror?11-lane:lane;
  return q.l+(q.r-q.l)*(m+.5)/12;
}
function noteColor(n){
  if(n.c)return [1,.80,.18];
  if(n.f)return [1,.25,.46];
  if(n.t)return [.16,1,.67];
  return [.94,.96,1];
}
function drawDirectionalArrow(x,y,w,dir,col,a=1){
  const s=Math.max(7,w*.22),pts=[];
  switch(dir){
    case"left":pts.push([x+w*.42,y],[x-w*.16,y-s*.72],[x-w*.05,y-s*.72],[x-w*.05,y-s],[x-w*.58,y],[x-w*.05,y+s],[x-w*.05,y+s*.72],[x-w*.16,y+s*.72]);break;
    case"right":pts.push([x-w*.42,y],[x+w*.16,y-s*.72],[x+w*.05,y-s*.72],[x+w*.05,y-s],[x+w*.58,y],[x+w*.05,y+s],[x+w*.05,y+s*.72],[x+w*.16,y+s*.72]);break;
    case"up-left":
    case"down-right":{
      const sg=dir==="up-left"?-1:1,dy=sg*s*.85;
      pts.push([x+w*.38,y+dy*.12],[x-w*.10,y-dy*.72],[x-w*.52,y-dy*.28],[x-w*.10,y+dy*.18],[x-w*.42,y+dy*.72],[x+w*.14,y+dy*.08]);break;
    }
    case"up-right":
    case"down-left":{
      const sg=dir==="up-right"?-1:1,dy=sg*s*.85;
      pts.push([x-w*.38,y+dy*.12],[x+w*.10,y-dy*.72],[x+w*.52,y-dy*.28],[x+w*.10,y+dy*.18],[x+w*.42,y+dy*.72],[x-w*.14,y+dy*.08]);break;
    }
    case"down":pts.push([x,y+w*.34],[x-s*.72,y-w*.02],[x-s*.72,y-.1*w],[x-s,y-.1*w],[x,y-w*.46],[x+s,y-.1*w],[x+s*.72,y-.1*w],[x+s*.72,y-w*.02]);break;
    default:pts.push([x,y-w*.34],[x-s*.72,y+.02*w],[x-s*.72,y+.1*w],[x-s,y+.1*w],[x,y+w*.46],[x+s,y+.1*w],[x+s*.72,y+.1*w],[x+s*.72,y+.02*w]);
  }
  poly(pts,col,a);
}
function drawNote(n,now){
  const travel=travelAt(now,n.hit),settings=app().dojo||{},ref=window.__PJSEKAI_SEKAI_REF__;
  if(settings.sudden&&travel<0.34)return;
  const alpha=settings.hidden?cl((travel-0.14)/0.40,0.025,1):1,p=cl(travel,0,1);
  if(ref?.geom?.ws){
    const mirror=!!settings.mirror,lane=(mirror?11-n.l:n.l)-5.5,size=Math.max(.5,(n.w||1)*.5);
    const kind=n.f?(n.t?(n.c?"traceFlickC":"traceFlick"):(n.c?"crtcl":"flick")):(n.t?(n.c?"traceC":"trace"):(n.c?"crtcl":"normal"));
    ref.drawBody(kind,lane,size,p,alpha);
    if(n.f)ref.drawArrow(n.c?"crtcl":"normal",lane,size,p,mirroredDirection(n.f,mirror),alpha);
    if(n.t&&!n.f)ref.drawTick(n.c?"crtcl":"normal",lane,p,alpha*.86);
    return;
  }
  const q=stageAt(p),x=laneX(n.l,p),lw=laneW(p),w=Math.max(11,lw*(n.w||1)*1.08),h=Math.max(11,w*.74);
  const head=n.c?"#NOTE_HEAD_YELLOW":n.f?"#NOTE_HEAD_RED":n.t?"#NOTE_HEAD_GREEN":"#NOTE_HEAD_CYAN";
  const conn=n.c?"#NOTE_CONNECTION_YELLOW":n.f?"#NOTE_CONNECTION_RED":n.t?"#NOTE_CONNECTION_GREEN":"#NOTE_CONNECTION_CYAN";
  if((n.w||1)>1.05)drawSkinSprite(conn,x,q.y,Math.max(8,w*1.55),Math.max(8,h*.48),.96*alpha);
  drawSkinSprite(head,x,q.y,Math.max(16,w*1.58),Math.max(16,h*1.32),.99*alpha);
  if(n.f)drawSkinSprite(n.c?"criticalMarker":"flickMarker",x,q.y-h*.72,Math.max(18,w*1.52),Math.max(18,w*1.52),.96*alpha);
  if(n.t)drawSkinSprite(n.c?"#NOTE_TICK_YELLOW":"#NOTE_TICK_GREEN",x,q.y,Math.max(15,w*.92),Math.max(15,w*.92),.84*alpha);
}
function drawSlideRibbon(n,now,tailOnly=false){
  if(!n.path?.length)return;
  const ref=window.__PJSEKAI_SEKAI_REF__,first=Math.max(n.b,now-S.lead),last=Math.min(n.end,now+S.lead*.30);
  if(last<first)return;
  const hidden=!!app().dojo?.hidden,settings=app().dojo||{},mirror=!!settings.mirror;
  const samples=[],segments=32;
  for(let i=0;i<=segments;i++){
    const sec=first+(last-first)*(i/segments),z=pointOnPath(n.path,sec);if(!z)continue;
    const p=cl(travelAt(now,sec),0,1),q=stageAt(p),x=laneX(z.l,p),w=laneW(p)*Math.max(.5,z.w||n.w)*.48;
    samples.push({sec,l:z.l,x,y:q.y,w,p,trace:z.trace||n.t,critical:z.critical||n.c});
  }
  if(samples.length<2)return;
  const base=n.c?[1,.80,.16]:n.f?[1,.20,.28]:n.t?[.16,1,.62]:[.16,.86,1],glow=n.c?[1,.86,.26]:n.f?[1,.28,.34]:n.t?[.22,1,.70]:[.42,.94,1];
  // Canonical Next-SEKAI particle families: cyan tap, green slide/trace, red flick, yellow critical.
  const particleColor=n.c?[1,.82,.16]:n.f?[1,.20,.28]:n.t?[.20,1,.70]:[.20,.86,1];
  for(let i=0;i<samples.length-1;i++){
    const a=samples[i],b=samples[i+1],alpha=(hidden?.40:.78)*(0.44+0.56*(i/(samples.length-1)));
    if(ref?.geom?.ws){
      const sa=Math.max(.12,(a.w/Math.max(1,ref.geom.ws))*1.35);
      const sb=Math.max(.12,(b.w/Math.max(1,ref.geom.ws))*1.35);
      const kind=n.c?"crtcl":"normal";
      const sprite=n.c?"#NOTE_CONNECTION_YELLOW":"#NOTE_CONNECTION_GREEN";
      const qa=ref.layoutSlideConnectorSegment(
        (mirror?11-a.l:a.l)-5.5,sa,cl(a.p,0,1),
        (mirror?11-b.l:b.l)-5.5,sb,cl(b.p,0,1),
        ref.connectorN?.(
          (mirror?11-a.l:a.l)-5.5,sa,cl(a.p,0,1),
          (mirror?11-b.l:b.l)-5.5,sb,cl(b.p,0,1)
        )||12
      );
      if(S.skin?.sprites?.[sprite]){
        for(const q of qa)drawSkinPerspective(sprite,q,alpha);
      }else{
        ref.drawConnection(kind,
          (mirror?11-a.l:a.l)-5.5,sa,cl(a.p,0,1),
          (mirror?11-b.l:b.l)-5.5,sb,cl(b.p,0,1),alpha);
      }
    }else{
      poly([[a.x-a.w,a.y],[a.x+a.w,a.y],[b.x+b.w,b.y],[b.x-b.w,b.y]],base,alpha*.22);
      line([[a.x-a.w*.72,a.y],[b.x-b.w*.72,b.y]],glow,.24*alpha);
      line([[a.x+a.w*.72,a.y],[b.x+b.w*.72,b.y]],glow,.24*alpha);
    }
  }
  if(tailOnly)return;
  const head=pointOnPath(n.path,Math.max(n.b,now));
  const hp=cl(travelAt(now,head.sec),0,1),hx=(mirror?11-head.l:head.l)-5.5,hs=Math.max(.5,(head.w||n.w)*.5);
  if(ref?.geom?.ws){
    const headKind=n.f?(n.t?(n.c?"traceFlickC":"traceFlick"):(n.c?"crtcl":"flick")):(n.c?(head?.trace?"traceC":"crtcl"):(head?.trace?"trace":"long"));
    ref.drawBody(headKind,hx,hs,hp,hidden?.70:.98);
  }
  const tail=n.tail||n.path[n.path.length-1],tp=cl(travelAt(now,n.end),0,1),tx=(mirror?11-tail.l:tail.l)-5.5,ts=Math.max(.5,(tail.w||n.w)*.5);
  if(n.end>=now-S.lead&&ref?.geom?.ws){
    if(tail.dir)ref.drawArrow(n.c?"crtcl":"normal",tx,ts,tp,tail.dir,1);
    else if(tail.trace&&tail.dir)ref.drawBody(tail.critical?"traceFlickC":"traceFlick",tx,ts,tp,.92);
    else if(tail.trace)ref.drawBody(n.c?"traceC":"trace",tx,ts,tp,.92);
    else ref.drawBody(n.c?"crtcl":"long",tx,ts,tp,.98);
  }
  if(n.end>=now-S.lead&&tailOnly===false){
    for(const cp of n.checkpoints||[]){
      if(cp.judged)continue;
      const pp=cl(travelAt(now,cp.sec),0,1),lane=(mirror?11-cp.lane:cp.lane)-5.5;
      if(ref?.geom?.ws)ref.drawTick(cp.critical||n.c?"crtcl":"normal",lane,pp,.86);
      else{
        const qq=stageAt(pp),cx=laneX(cp.lane,pp),cw=Math.max(5,laneW(pp)*.28);
        drawSkinSprite(cp.critical||n.c?"criticalTick":"tick",cx,qq.y,Math.max(14,cw*2.2),Math.max(14,cw*2.2),.88);
      }
    }
  }
}
function drawHold(n,now){
  drawSlideRibbon(n,now);
}
function bg(){
  S.gl.clearColor(0,0,0,0);
  S.gl.clear(S.gl.COLOR_BUFFER_BIT);
}
function drawGuideSlides(now){
  const guides=S.prep?.guides||[];
  if(!guides.length)return;
  const ref=window.__PJSEKAI_SEKAI_REF__,settings=app().dojo||{},mirror=!!settings.mirror;
  for(const guide of guides){
    const path=guide.path;
    if(!path?.length||guide.start>now+S.lead||guide.end<now-S.lead)continue;
    for(let i=0;i<path.length-1;i++){
      const a=path[i],b=path[i+1],pa=cl(travelAt(now,a.sec),0,1),pb=cl(travelAt(now,b.sec),0,1);
      const ax=(mirror?11-a.l:a.l)-5.5,bx=(mirror?11-b.l:b.l)-5.5;
      if(ref?.geom?.ws){
        const qa=ref.layoutSlideConnectorSegment(ax,.20,pa,bx,.20,pb,8);
        const gname={
          0:"#NOTE_CONNECTION_NEUTRAL",
          1:"#NOTE_CONNECTION_RED",
          2:"#NOTE_CONNECTION_GREEN",
          3:"#NOTE_CONNECTION_BLUE",
          4:"#NOTE_CONNECTION_YELLOW",
          5:"#NOTE_CONNECTION_PURPLE",
          6:"#NOTE_CONNECTION_CYAN",
          7:"#NOTE_CONNECTION_NEUTRAL"
        }[guide.color||0]||"#NOTE_CONNECTION_NEUTRAL";
        if(S.skin?.sprites?.[gname])for(const q of qa)drawSkinPerspective(gname,q,.20);
        else ref.drawConnection("normal",ax,.20,pa,bx,.20,pb,.20);
      }else{
        const aa=stageAt(pa),bb=stageAt(pb);
        line([[laneX(a.l,pa),aa.y],[laneX(b.l,pb),bb.y]],[.78,.58,1],.18);
      }
    }
  }
}
function drawMultiTapGuide(now){
  const groups=new Map();
  for(const n of S.notes){
    if(n.done||n.started||!Number.isFinite(n.hit))continue;
    if(Math.abs(n.hit-now)>S.lead*.98)continue;
    const key=Math.round(n.hit*1000);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(n);
  }
  for(const group of groups.values()){
    if(group.length<2)continue;
    const pts=group.map(n=>{const p=cl(travelAt(now,n.hit),0,1),q=stageAt(p);return{n,x:laneX(n.l,p),y:q.y,p}}).sort((a,b)=>a.x-b.x);
    for(let i=0;i<pts.length-1;i++){
      line([[pts[i].x,pts[i].y],[pts[i+1].x,pts[i+1].y]],[.82,.92,1],.28);
      line([[pts[i].x,pts[i].y-2],[pts[i+1].x,pts[i+1].y-2]],[1,1,1],.14);
    }
    for(const z of pts){
      const bucket=z.n.c?"YELLOW":"NEUTRAL";
      const marker="#SIMULTANEOUS_MARKER_"+bucket;
      if(S.skin?.sprites?.[marker])drawSkinSprite(marker,z.x,z.y,Math.max(16,laneW(z.p)*1.55),Math.max(16,laneW(z.p)*1.55),.55);
    }
  }
}
function drawStage(){
  const ref=window.__PJSEKAI_SEKAI_REF__,h=S.geom;
  if(ref?.geom?.ws){
    const g=ref.geom,laneQuad=(l,r)=>ref.perspRaw?ref.perspRaw(l,r,g.laneTop,g.laneBottom,1).map(v=>{const a=ref.arcPoint(v);return a}):ref.persp(l,r,g.laneTop,g.laneBottom,1);
    poly([[h.tl,h.far],[h.tr,h.far],[h.br,h.hit+30],[h.bl,h.hit+30]],[.012,.025,.065],.96);
    const left=ref.persp(-6.5,-6,g.laneTop,g.laneBottom,1);
    const right=ref.persp(6,6.5,g.laneTop,g.laneBottom,1);
    drawSkinPerspective("#STAGE_LEFT_BORDER",left,.98);
    drawSkinPerspective("#STAGE_RIGHT_BORDER",right,.98);
    const laneSprite=S.skin?.sprites?.["#LANE"];
    for(const lane of [-5,-3,-1,1,3,5]){
      const q=ref.persp(lane-1,lane+1,g.laneTop,g.laneBottom,1);
      if(laneSprite)drawSkinPerspective("#LANE",q,.88);
      else poly(q.map(p=>[p.x,p.y]),[.08,.13,.24],.055);
    }
    const judge=ref.persp(-6,6,1-g.noteH,1+g.noteH,1);
    drawSkinPerspective("#JUDGMENT_LINE",judge,.98);
    for(let i=1;i<12;i++){
      const q=ref.persp(-6+i-0.015,-6+i+0.015,g.laneTop,g.laneBottom,1);
      if(!laneSprite)continue;
      drawSkinPerspective("#LANE",q,.20);
    }
    const bottom=ref.persp(-6,6,g.laneBottom,g.laneBottom+.06,1);
    if(S.skin?.sprites?.["#STAGE_BOTTOM_BORDER"])drawSkinPerspective("#STAGE_BOTTOM_BORDER",bottom,.72);
    const top=ref.persp(-6,6,g.laneTop-.045,g.laneTop,1);
    if(S.skin?.sprites?.["#STAGE_TOP_BORDER"])drawSkinPerspective("#STAGE_TOP_BORDER",top,.42);

    // Exact Next-SEKAI cover geometry. Hidden/Sudden are clipped in the same
    // reference coordinate space rather than approximated in screen space.
    const settings=app().dojo||{};
    const stageCover=cl(N(settings.stageCover,0),0,1);
    const hidden=cl(N(settings.hidden,0),0,1);
    if(stageCover>0&&ref.layoutStageCover&&S.skin?.sprites?.["#STAGE_COVER"]){
      for(const q of ref.layoutStageCover(stageCover))drawSkinPerspective("#STAGE_COVER",q,1);
    }
    if(hidden>0&&ref.layoutHiddenCover&&S.skin?.sprites?.["#STAGE_COVER"]){
      for(const q of ref.layoutHiddenCover(hidden,stageCover))drawSkinPerspective("#STAGE_COVER",q,1);
    }
    return;
  }
  const tm=S.audio.currentTime||0,pulse=.5+.5*Math.sin(tm*Math.PI*2*2.2);
  poly([[h.tl,h.far],[h.tr,h.far],[h.br,h.hit+34],[h.bl,h.hit+34]],[.015,.038,.090],.95);
  for(let i=0;i<12;i++){const x1=h.tl+(h.tr-h.tl)*i/12,x2=h.tl+(h.tr-h.tl)*(i+1)/12,bx1=h.bl+(h.br-h.bl)*i/12,bx2=h.bl+(h.br-h.bl)*(i+1)/12;poly([[x1,h.far],[x2,h.far],[bx2,h.hit+18],[bx1,h.hit+18]],[.08,.12,.22],i%2?.035:.065);}
  for(let i=1;i<=10;i++){const q=stageAt(i/11);line([[q.l,q.y],[q.r,q.y]],[.45,.68,1],.028+.012*pulse);}
  if(S.skin?.sprites?.["#JUDGMENT_LINE"])drawSkinSprite("#JUDGMENT_LINE",(h.bl+h.br)/2,h.hit,h.br-h.bl,Math.max(10,h.h*.018),.92);
  line([[h.bl,h.hit-5],[h.br,h.hit-5]],[.82,.96,1],1.15);
}
function spawnLaneFx(lane){
  const x=laneX(lane,1),y=S.geom.hit-2;
  S.fx.push({x,y,t:0,j:"",c:false,kind:"lane",dir:"up",seed:Math.random()*Math.PI*2});
}
function spawnFx(lane,judgeKind,critical=false){
  const x=laneX(lane,1),y=S.geom.hit-2;
  const input=S.lastInput||{};
  const kind=String(input.kind||"tap");
  S.fx.push({x,y,t:0,j:judgeKind,c:critical,kind,dir:input.direction||"up",seed:Math.random()*Math.PI*2});
  const count=critical?28:(kind.includes("flick")?22:18);
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2;
    const v=(kind.includes("flick")?75:55)+Math.random()*(critical?230:175);
    const spread=kind.includes("flick")?.72:1;
    S.particles.push({
      x,y,vx:Math.cos(a)*v*spread,vy:Math.sin(a)*v,
      t:0,life:.34+Math.random()*.30,size:1.2+Math.random()*3.2,
      c:critical?[1,.82,.16]:kind.includes("flick")?[1,.20,.28]:kind.includes("trace")?[.20,1,.70]:[.20,.86,1]
    });
  }
}
function drawJudgeFeedback(judgment){
  const el=$("dojoJudgeText");
  if(!el)return;
  el.textContent=judgment||"";
  el.dataset.j=judgment||"";
  el.classList.remove("dojo-judgment-pop");
  if(judgment){
    void el.offsetWidth;
    el.classList.add("dojo-judgment-pop");
  }
}
function effects(dt){
  const ref=window.__PJSEKAI_SEKAI_REF__;
  for(const e of S.fx){
    e.t+=dt;
    const k=cl(e.t/.48,0,1);
    const p=cl(1-k,0,1);
    // Keep the hit response anchored to the same projected judge point as
    // the note skin. The public reference uses distinct critical/flick/trace
    // effect families; use the corresponding sprite family when available.
    const g=ref?.geom;
    const lane=(app().dojo?.mirror?11-e.lane:e.lane)-5.5;
    if(g?.ws){
      const sp=ref.logicalPoint?ref.logicalPoint(lane,1):ref.screenPoint(lane,1,1);
      const effectLane=sp;
      const kind=String(e.kind||"tap");
      const critical=!!e.c;
      const effectName=kind.includes("trace")?(critical?"#EFFECT_CRITICAL_TRACE":"#EFFECT_TRACE")
        :kind.includes("flick")?(critical?"#EFFECT_CRITICAL_FLICK":"#EFFECT_FLICK")
        :(critical?"#EFFECT_CRITICAL_TAP":"#EFFECT_TAP");
      if(ref.drawEffect && ref.hasSprite?.(effectName)){
        ref.drawEffect(effectName,effectLane.x,effectLane.y,p,critical,kind);
      }else{
        const rr=10+74*k;
        circle(effectLane.x,effectLane.y,rr,critical?[1,.84,.2]:kind.includes("trace")?[.2,1,.7]:[.48,.86,1],p*.5,24);
      }
    }
  }
  S.fx=S.fx.filter(x=>x.t<.48);
  for(const p of S.particles){
    p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=135*dt;
    const a=cl(1-p.t/p.life,0,1);
    if(a>0){
      const s=p.size*(.7+1.1*(1-a));
      poly([[p.x-s,p.y-s],[p.x+s,p.y-s],[p.x+s,p.y+s],[p.x-s,p.y+s]],p.c,a*.92);
    }
  }
  S.particles=S.particles.filter(p=>p.t<p.life);
}
function hud(judgment,error=0){
  const put=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const ratio=cl(S.score/Math.max(1,S.total*20),0,1),rank=ratio>=.9?"S":ratio>=.8?"A":ratio>=.7?"B":"C";
  put("dojoGameScore",String(Math.max(0,Math.floor(S.score))).padStart(7,"0"));
  put("dojoScoreRank",rank);put("dojoScoreRankFill",(ratio*100).toFixed(1)+"%");put("dojoGameScoreDelta","+"+Math.max(0,Math.floor(S.score-(S.lastHudScore||0))));S.lastHudScore=S.score;
  put("dojoGameCombo",S.combo);
  const acc=S.tn?cl(100-(S.timing/S.tn)*120,0,100):100;
  put("dojoGameAccuracy",acc.toFixed(2)+"%");
  const life=$("dojoGameLifeBar");if(life)life.style.width=cl(S.life/10,0,100)+"%";
  const combo=$("dojoGameCombo");
  if(combo&&judgment){
    const inPlayPage=!!document.querySelector(".dojo-play-page.active");
    combo.style.transform=inPlayPage?"scale(.6)":"translateX(-50%) scale(.6)";
    combo.style.opacity="1";
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      combo.style.transform=inPlayPage?"scale(1)":"translateX(-50%) scale(1)";
    }));
  }
  const jt=$("dojoJudgeText");
  if(jt){
    jt.dataset.timing=judgment&&judgment!=="MISS"?(error<-.012?"FAST":error>.012?"LATE":""):"";
    clearTimeout(S.judgeTimer);
    if(judgment){
      drawJudgeFeedback(judgment);
      jt.style.opacity="1";
      jt.style.transform="translateX(-50%) translateY(-2px) scale(.05)";
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        jt.style.transform="translateX(-50%) translateY(0) scale(1)";
      }));
      S.judgeTimer=setTimeout(()=>{
        jt.style.opacity="0";
        jt.style.transform="translateX(-50%) translateY(0) scale(1)";
      },300);
    }
  }
}
const WINDOWS={
  // Next-SEKAI's public bucket windows are frame-based at 60 FPS.
  tap:{P:2.5/60,G:5/60,D:6.5/60,B:7.5/60},
  critical:{P:3.3/60,G:4.5/60,D:6.5/60,B:7.5/60},
  flick:{P:2.5/60,G:[6.5/60,7.5/60],D:[7/60,8/60],B:[7.5/60,8.5/60]},
  criticalFlick:{P:3.5/60,G:[6.5/60,7.5/60],D:[7/60,8/60],B:[7.5/60,8.5/60]},
  trace:{P:5/60,G:5/60,D:5/60,B:5/60},
  traceFlick:{P:[6.5/60,7.5/60],G:[6.5/60,7.5/60],D:[6.5/60,7.5/60],B:[6.5/60,7.5/60]},
  slideEnd:{P:[3.5/60,4/60],G:[6.5/60,8/60],D:[7.5/60,8.5/60],B:[7.5/60,8.5/60]},
  slideEndTrace:{P:[6.5/60,8/60],G:[6.5/60,8/60],D:[6.5/60,8/60],B:[6.5/60,8/60]},
  slideEndFlick:{P:[3.5/60,4/60],G:[6.5/60,8/60],D:[7.5/60,8.5/60],B:[7.5/60,8.5/60]},
  slideTick:{P:[7.5/60,0],G:[7.5/60,0],D:[7.5/60,0],B:[7.5/60,0]}
};
function classify(diff,type){
  const w=type==="criticalFlick"?WINDOWS.criticalFlick:type==="traceFlick"?WINDOWS.traceFlick:type==="trace"?WINDOWS.trace:type==="slideEndFlick"?WINDOWS.slideEndFlick:type==="slideEndTrace"?WINDOWS.slideEndTrace:type==="slideEnd"?WINDOWS.slideEnd:type==="critical"?WINDOWS.critical:WINDOWS.tap;
  const d=N(diff,0);
  const inside=(range)=>Array.isArray(range)?(d>=-range[0]&&d<=range[1]):Math.abs(d)<=range;
  if(inside(w.P))return"PERFECT";
  if(inside(w.G))return"GREAT";
  if(inside(w.D))return"GOOD";
  return"MISS";
}
function ensureSfx(){
  if(S.audioCtx)return;
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    const ctx=new C(),gain=ctx.createGain();gain.gain.value=.035;gain.connect(ctx.destination);
    S.audioCtx=ctx;S.sfxGain=gain;
  }catch(_){}
}
function sfx(jg,critical=false){
  const ctx=S.audioCtx;if(!ctx||!S.sfxGain)return;
  try{
    const o=ctx.createOscillator(),g=ctx.createGain(),now=ctx.currentTime;
    const freq=jg==="PERFECT"?(critical?1180:980):jg==="GREAT"?760:jg==="GOOD"?540:320;
    o.type=critical?"sine":"triangle";o.frequency.setValueAtTime(freq,now);
    o.frequency.exponentialRampToValueAtTime(freq*.76,now+.055);
    g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(.12,now+.006);g.gain.exponentialRampToValueAtTime(.001,now+.07);
    o.connect(g);g.connect(S.sfxGain);o.start(now);o.stop(now+.075);
  }catch(_){}
}
function award(n,d,type="tap",allowFinish=true,wrongWay=false){
  const kind=type==="criticalFlick"?"criticalFlick":type==="traceFlick"?"traceFlick":type==="slideEndFlick"?"slideEndFlick":type==="slideEndTrace"?"slideEndTrace":type==="flick"?(n.c?"criticalFlick":"flick"):n.c?"critical":n.t?(n.f?"traceFlick":"trace"):"tap";
  let jg=classify(d,kind);
  if(wrongWay&&jg==="PERFECT")jg="GREAT";
  S.counts[jg]++;S.timing+=Math.min(Math.abs(d),.2);S.tn++;
  if(jg==="MISS")S.combo=0;else S.combo++;
  S.best=Math.max(S.best,S.combo);
  const traceLike=type==="trace"||type==="traceFlick"||type==="slideEndTrace";
  // Public Next-SEKAI score weights: tap 10, critical tap 20,
  // flick 10/30, trace 1/2, trace-flick 10/30.
  const weight=traceLike?(n.c?2:1):(n.f?(n.c?30:10):(n.c?20:10));
  const multiplier=jg==="PERFECT"?1:jg==="GREAT"?.7:jg==="GOOD"?.5:0;
  // Next-SEKAI weighted-combo scoring: the archetype weight already carries
  // the base tap value (normal tap 10, critical 20, flick 10/30, trace 1/2).
  const comboBoost=1+Math.min(Math.max(S.combo-1,0),100)/100;
  S.score+=Math.round(weight*multiplier*comboBoost);
  S.life=cl(S.life+(jg==="MISS"?-80:1),0,1000);
  n.done=true;n.judged=true;S.judged++;
  S.judgementHistory.push({time:nowTime(),lane:n.l,kind:jg,error:d});
  S.lastJudge=jg;S.lastJudgeAt=performance.now();S.lastInput={lane:n.l,kind:type,judgement:jg,error:d};
  hud(jg,d);spawnFx(n.l,jg,!!n.c);ensureSfx();if(jg!=="MISS"){sfx(jg,!!n.c);try{navigator.vibrate?.(jg==="PERFECT"&&n.c?8:5)}catch(_){}}
  if(allowFinish&&S.judged>=S.total)finish();
  return jg;
}
function pointInQuad(x,y,q){
  if(!Array.isArray(q)||q.length<3)return false;
  let inside=false;
  for(let i=0,j=q.length-1;i<q.length;j=i++){
    const xi=q[i].x,yi=q[i].y,xj=q[j].x,yj=q[j].y;
    const cross=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi);
    if(cross)inside=!inside;
  }
  return inside;
}
function screenLaneFromClient(x,wrap,y=null){
  const r=wrap?.getBoundingClientRect?.();
  if(!r)return cl(Math.floor(cl(x,0,.999)*12),0,11);
  const nx=cl(x-r.left,0,r.width),ny=cl((y==null?r.height*.88:y-r.top),0,r.height),ref=window.__PJSEKAI_SEKAI_REF__;
  const scaleX=S.gl?.canvas?.width&&r.width?S.gl.canvas.width/r.width:1;
  const scaleY=S.gl?.canvas?.height&&r.height?S.gl.canvas.height/r.height:1;
  const px=nx*scaleX,py=ny*scaleY;
  if(ref?.hitboxAtLane){
    const gw=S.gl?.canvas?.height||r.height*scaleY;
    const laneY=cl(py,0,gw);
    for(let lane=0;lane<12;lane++){
      const center=(lane-5.5);
      const mirror=!!app().dojo?.mirror;
      const logical=mirror?-center:center;
      const polys=ref.hitboxAtLane(logical,.5);
      if(polys.some(q=>pointInQuad(px,py,q)))return lane;
    }
  }
  if(!ref?.screenPoint)return cl(Math.floor(nx/r.width*12),0,11);
  const targetY=S.geom?.hit??(S.gl?.canvas?.height||1)*.875;
  let lo=-5.5,hi=5.5;
  for(let i=0;i<18;i++){
    const mid=(lo+hi)/2,q=ref.screenPoint(mid,1,1);
    if(q.x<px)lo=mid;else hi=mid;
  }
  return cl(Math.floor(((lo+hi)/2)+5.5),0,11);
}
function gestureDirection(dx,dy){
  const a=Math.atan2(dy,dx),pi=Math.PI;
  const dirs=["right","down-right","down","down-left","left","up-left","up","up-right"];
  return dirs[Math.round(a/(pi/4)+8)%8];
}
function nowTime(){return Number.isFinite(S.audio.currentTime)?S.audio.currentTime:0;}
function expectedLane(n,time){
  const z=pointOnPath(n.path,time);
  const raw=z?z.l:n.l;
  return app().dojo?.mirror?11-raw:raw;
}
function mirroredDirection(direction,mirror=false){
  if(!mirror)return direction;
  return ({
    left:"right",right:"left",
    "up-left":"up-right","up-right":"up-left",
    "down-left":"down-right","down-right":"down-left",
    up:"up",down:"down"
  })[direction]||direction;
}
function directionMatches(direction,dx,dy){
  const len=Math.hypot(dx,dy);
  if(len<1)return true;
  const vectors={
    up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],
    "up-left":[-Math.SQRT1_2,-Math.SQRT1_2],
    "up-right":[Math.SQRT1_2,-Math.SQRT1_2],
    "down-left":[-Math.SQRT1_2,Math.SQRT1_2],
    "down-right":[Math.SQRT1_2,Math.SQRT1_2]
  };
  const v=vectors[direction]||vectors.up;
  // Match the public engine's directional intent while rejecting clearly
  // sideways/reversed gestures.  Diagonal arrows remain usable on touch.
  return (dx/len)*v[0]+(dy/len)*v[1]>=Math.cos(Math.PI*3/8);
}
function flickDirectionOk(required,motion){
  if(!required)return true;
  return directionMatches(required,motion.dx,motion.dy);
}
function findCandidate(inputLane,now,mode="tap",exact=false,direction="up"){
  let best=null,bestAbs=999;
  for(const n of S.notes){
    if(n.done||n.started)continue;
    if(mode==="flick"&&!n.f)continue;
    if(mode!=="flick"&&n.f)continue;
    const nl=expectedLane(n,now);
    const laneTolerance=mode==="flick"&&exact?Math.max(1.5,(n.w||1)/2+1.0):Math.max(.75,(n.w||1)/2+.75);
    const match=exact?Math.abs(nl-inputLane)<=laneTolerance:Math.floor(nl/3)===inputLane;
    if(!match)continue;
    const d=now-n.hit,a=Math.abs(d),w=n.f?(n.c?WINDOWS.criticalFlick.B:WINDOWS.flick.B):(n.c?WINDOWS.critical.B:WINDOWS.tap.B);
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
function vectorsForDirection(direction){
  const v={
    up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],
    "up-left":[-1,-1],"up-right":[1,-1],"down-left":[-1,1],"down-right":[1,1]
  }[direction];
  return v||[0,-1];
}
function hit(lane,mode="tap",exact=false,direction="up",inputId="kbd",motion=null){
  if(!S.running||S.paused)return false;
  const group=exact?Math.floor(lane/3):lane;
  S.keyFlash[cl(group,0,3)]=performance.now()+180;
  const settings=app().dojo||{},now=S.audio.currentTime-S.seek+S.chartOffset+N(settings.audioOffset,0)/1000;
  const recovered=attachMissedHold(lane,now,exact,inputId);
  if(recovered)return true;
  let n=findCandidate(lane,now,mode,exact,direction);
  if(!n&&mode==="flick"){
    // Touch events can arrive a frame late on mobile. Keep the same directional
    // note semantics but allow a small transport slack before declaring no hit.
    let best=null,bestAbs=Infinity;
    for(const candidate of S.notes){
      if(candidate.done||candidate.started||!candidate.f)continue;
      const nl=expectedLane(candidate,now);
      const tol=exact?Math.max(2.0,(candidate.w||1)/2+1.25):1.5;
      if(Math.abs(nl-lane)>tol)continue;
      const a=Math.abs(now-candidate.hit);
      if(a<=0.20&&a<bestAbs){bestAbs=a;best=candidate;}
    }
    n=best;
  }
  if(!n)return false;
  let wrongWay=false;
  if(n.f){
    S.lastInput={lane:n.l,kind:mode==="flick"?"flick":n.f?"flick":"tap",direction,directionRequired:n.f,error:now-n.hit};
    wrongWay=false;
    // For keyboard/group input we do not have a gesture vector; the requested
    // semantic direction is checked explicitly where available.
    if(motion&&Number.isFinite(motion.dx)&&Number.isFinite(motion.dy)){
      wrongWay=!directionMatches(mirroredDirection(n.f,!!settings.mirror),motion.dx,motion.dy);
    }else if(direction&&direction!=="up"){
      const v=vectorsForDirection(direction);
      wrongWay=!directionMatches(mirroredDirection(n.f,!!settings.mirror),v[0],v[1]);
    }
  }
  if(n.k==="hold"){
    n.started=true;n.headJudged=true;
    const head=award(n,now-n.hit,n.f?"flick":"tap",false,wrongWay);
    n.done=false;n.judged=true;
    S.held.set(inputId,{note:n,lane:n.l,touchedLane:n.l,inputLane:lane,exactInput:exact,head});
    for(const cp of n.checkpoints||[])cp.judged=false;
    return true;
  }
  award(n,now-n.hit,n.f?"flick":n.t?"trace":"tap",true,wrongWay);
  return true;
}
function release(inputId){
  const held=S.held.get(inputId);if(!held)return;
  S.held.delete(inputId);
  const n=held.note;
  const settings=app().dojo||{},now=S.audio.currentTime-S.seek+S.chartOffset+N(settings.audioOffset,0)/1000;
  const tail=n.tail||n.path?.[n.path.length-1];if(!tail)return;
  const d=now-tail.sec;
  if(Math.abs(d)<=WINDOWS.slideEnd.B){
    if(n.done)return;
    if(tail.dir&&!held.flicked){
      n.done=true;n.judged=true;S.judged++;S.combo=0;S.life=cl(S.life-80,0,1000);S.counts.MISS++;S.tn++;hud("MISS");spawnFx(tail.l,"MISS",!!tail.critical);
      if(S.judged>=S.total)finish();
      return;
    }
    const fake={...n,l:tail.l,c:tail.critical,t:tail.trace,f:tail.dir,done:false};
    const endType=tail.dir?(tail.critical?"criticalFlick":"flick"):tail.trace?(tail.critical?"slideEndTrace":"trace"):"slideEnd";
    const jg=award(fake,d,endType,false,false);
    n.done=true;n.judged=true;
    if(jg==="MISS")S.combo=0;
    if(S.judged>=S.total)finish();
  }else{
    n.done=true;n.judged=true;S.judged++;S.combo=0;S.life=cl(S.life-48,0,1000);S.counts.MISS++;S.tn++;hud("MISS");spawnFx(tail.l,"MISS",!!tail.critical);
  }
}
function processHeld(now){
  for(const [id,h] of S.held){
    const n=h.note;
    h.targetLane=expectedLane(n,now);
    const inputLane=N(h.inputLane,h.lane);
    const laneMatches=(target)=>{
      const span=Math.max(.62,(n.w||1)/2+.42);
      return h.exactInput ? Math.abs(inputLane-target)<=span : Math.floor(inputLane/3)===Math.floor(target/3);
    };
    for(const cp of n.checkpoints||[]){
      if(cp.judged)continue;
      const early=7.5/60,late=0;
      if(now<cp.sec-early)continue;
      const laneNow=expectedLane(n,cp.sec);
      const d=now-cp.sec;
      if(laneMatches(laneNow)&&d<=late+1e-4){
        // Next-SEKAI's slide ticks use a one-sided 7.5-frame window: early input is
        // accepted, late input is not. A held finger is evaluated at the tick time.
        const jg="PERFECT";
        cp.judged=true;S.judged++;S.timing+=Math.min(Math.abs(d),.2);S.tn++;
        S.combo++;S.best=Math.max(S.best,S.combo);S.counts.PERFECT++;
        // Next-SEKAI slide ticks use the tick weight (1), including critical ticks.
        const tickMultiplier=1+Math.min(Math.max(S.combo-1,0),100)/100;
        S.score+=Math.round((cp.critical?2:1)*tickMultiplier);S.life=cl(S.life+1,0,1000);
        S.lastJudge=jg;S.lastJudgeAt=performance.now();S.lastInput={lane:cp.lane,kind:"tick",judgement:jg,error:d};
        hud(jg);ensureSfx();sfx(jg,!!cp.critical);spawnFx(cp.lane,jg,!!cp.critical);
      }else if(now>cp.sec+early){
        cp.judged=true;S.judged++;S.tn++;S.combo=0;S.life=cl(S.life-40,0,1000);S.counts.MISS++;hud("MISS");spawnFx(cp.lane,"MISS",!!cp.critical);
      }
    }
  }
}
function sweep(now){
  for(const n of S.notes){
    if(n.done||n.started)continue;
    if(n.k==="hold"){
      const win=n.f?(n.c?WINDOWS.criticalFlick.B:WINDOWS.flick.B):(n.c?WINDOWS.critical.B:WINDOWS.tap.B);
      if(!n.headJudged&&now-n.hit>win){
        // Project SEKAI permits a missed hold head to be picked up while the finger
        // is already inside the active hold area; keep the tail/checkpoints alive.
        n.headJudged=true;n.headMissed=true;n.judged=true;
        S.counts.MISS++;S.tn++;S.combo=0;S.life=cl(S.life-80,0,1000);S.judged++;
        hud("MISS",now-n.hit);spawnFx(n.l,"MISS",!!n.c);
      }
      continue;
    }
    const win=n.f?(n.c?WINDOWS.criticalFlick.B:WINDOWS.flick.B):n.t?(n.f?WINDOWS.traceFlick.B:WINDOWS.trace.B):(n.c?WINDOWS.critical.B:WINDOWS.tap.B);
    if(now-n.hit>win){
      S.counts.MISS++;S.tn++;S.combo=0;S.life=cl(S.life-80,0,1000);
      n.done=true;n.judged=true;S.judged++;hud("MISS",now-n.hit);spawnFx(n.l,"MISS",!!n.c);
    }
  }
  if(S.life<=0){S.life=0;hud("");finish(true);}
}
function attachMissedHold(inputLane,now,exact,inputId){
  for(const n of S.notes){
    if(n.k!=="hold"||n.done||n.started||!n.headMissed||!Number.isFinite(n.end))continue;
    if(now<=n.hit+WINDOWS.tap.B||now>=n.end+WINDOWS.slideEnd.B)continue;
    const nl=expectedLane(n,now);
    const match=exact?Math.abs(nl-inputLane)<=Math.max(1.5,(n.w||1)/2+1.25):Math.floor(nl/3)===Math.floor(inputLane/3);
    if(!match)continue;
    n.started=true;
    n.judged=true;
    S.held.set(inputId,{note:n,lane:n.l,touchedLane:n.l,inputLane,exactInput:exact,head:"MISS"});
    for(const cp of n.checkpoints||[])cp.judged=false;
    return n;
  }
  return null;
}
function loop(t){
  S.raf=requestAnimationFrame(loop);
  const dt=Math.min(.05,(t-(S.last||t))/1000);S.last=t;
  bg();drawStage();
  if(S.running){
    const guideNow=S.audio.currentTime-S.seek+S.chartOffset+N((app().dojo||{}).visualOffset,0)/1000;
    drawGuideSlides(guideNow);
    drawMultiTapGuide(guideNow);
  }
  if(S.running){
    const rawNow=S.audio.currentTime-S.seek,settings=app().dojo||{};
    const visualNow=rawNow+S.chartOffset+N(settings.visualOffset,0)/1000;
    for(const n of S.notes){
      if(n.k==="hold")drawHold(n,visualNow);
      else if(visualNow>n.hit-S.lead&&visualNow<n.hit+.18)drawNote(n,visualNow);
    }
    const judgeNow=rawNow+S.chartOffset+N(settings.audioOffset,0)/1000;
    processHeld(judgeNow);sweep(judgeNow);
    const endBase=S.notes.length?Math.max(...S.notes.map(n=>n.end||n.hit)):0;
    const p=endBase?cl(judgeNow/endBase,0,1):0;
    const pb=$("dojoGameProgressBar");if(pb)pb.style.width=(p*100)+"%";
    if(judgeNow>S.endAt+.55)finish();
  }
  effects(dt);
}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&S.running)pause()},{passive:true});
function resultCounts(){
  return"PERFECT "+S.counts.PERFECT+"　GREAT "+S.counts.GREAT+"　GOOD "+S.counts.GOOD+"　MISS "+S.counts.MISS;
}
function finalizePending(){
  for(const n of S.notes){
    if(n.k==="hold"){
      for(const cp of n.checkpoints||[]){
        if(cp.judged)continue;
        cp.judged=true;S.judged++;S.tn++;S.counts.MISS++;S.combo=0;S.life=cl(S.life-40,0,1000);
      }
      if(!n.done){
        n.done=true;n.judged=true;S.judged++;S.tn++;S.counts.MISS++;S.combo=0;S.life=cl(S.life-80,0,1000);
      }
    }else if(!n.done){
      n.done=true;n.judged=true;S.judged++;S.tn++;S.counts.MISS++;S.combo=0;S.life=cl(S.life-80,0,1000);
    }
  }
}
function finish(failed=false){
  if(!S.running)return;
  finalizePending();
  S.running=false;S.audio.pause();S.held.clear();
  if(S.pause)S.pause.hidden=true;
  const ap=S.counts.PERFECT>0&&S.counts.GREAT===0&&S.counts.GOOD===0&&S.counts.MISS===0,fc=S.counts.MISS===0;
  const rank=failed?"GAME OVER":ap?"ALL PERFECT":fc?"FULL COMBO":"CLEAR";
  const r=$("dojoGameResult");
  if(r){
    r.hidden=false;
    r.innerHTML="<strong>"+rank+"</strong><span>"+S.best+" COMBO · "+String(Math.floor(S.score)).padStart(7,"0")+"</span><small>"+resultCounts()+"</small><em>"+(S.tn?((100-(S.timing/S.tn)*120).toFixed(2)):"100.00")+"% ACC</em><button type=\"button\" data-dojo-result-replay>再玩一次</button>";
    r.querySelector("[data-dojo-result-replay]")?.addEventListener("click",()=>{r.hidden=true;start()},{once:true});
  }
  const b=$("dojoOpenPracticeBtn");if(b)b.textContent="↻ 再玩一次";
  const m=$("dojoGameMessage");if(m)m.textContent=rank+" · "+S.best+" COMBO";
  if(S.status)S.status.textContent=rank+" · DOJO";
}
function pause(){
  if(S.starting)return;
  if(S.paused){
    S.audio.play().then(()=>{S.paused=false;S.running=true;if(S.pause)S.pause.textContent="Ⅱ";if(S.pauseMenu)S.pauseMenu.hidden=true;if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停"}).catch(()=>{});
    return;
  }
  if(!S.running)return;
  S.audio.pause();S.running=false;S.paused=true;
  if(S.pause)S.pause.textContent="▶";
  if(S.pauseMenu)S.pauseMenu.hidden=false;
  if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="繼續打歌";
}
function stop(){
  S.running=false;S.paused=false;S.starting=false;S.audio.pause();
  try{S.audio.currentTime=0}catch(_){}
  S.held.clear();S.touch.clear();S.fx=[];S.particles=[];S.judgementHistory=[];S.lastInput=null;
  if(S.pause)S.pause.hidden=true;
  if(S.pauseMenu)S.pauseMenu.hidden=true;
  if($("dojoGameResult"))$("dojoGameResult").hidden=true;
  if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="▶ 開始打歌";
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
    try{ensureSfx();if(S.audioCtx?.state==="suspended")await S.audioCtx.resume();await S.audio.play();S.paused=false;S.running=true;if(S.pause)S.pause.textContent="Ⅱ";if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";}catch(_){}
    return;
  }
  S.starting=true;
  try{
    ensureSfx();if(S.audioCtx?.state==="suspended")await S.audioCtx.resume();
    const b=$("dojoOpenPracticeBtn");if(b){b.disabled=true;b.textContent="載入中…";}
    const q=selection();if(!q?.m)throw Error("請先選擇歌曲");
    await data();const prep=await ensurePrepared();await (S.refReady||Promise.resolve());
    S.notes=prep.notes.map(x=>({...x,path:x.path?.map(p=>({...p})),tail:x.tail?{...x.tail}:null,checkpoints:x.checkpoints?.map(p=>({...p}))}));
    S.total=S.notes.reduce((n,x)=>n+((x.k==="hold"?2:1)+(x.checkpoints?.length||0)),0);
    S.score=0;S.combo=0;S.best=0;S.life=1000;S.judged=0;S.chartOffset=N(prep.offset,0);
    S.counts={PERFECT:0,GREAT:0,GOOD:0,MISS:0};S.timing=0;S.tn=0;
    S.held.clear();S.fx=[];S.particles=[];S.lastJudge="";S.error="";
    const vn=prep.vocal?.assetbundleName||String(q.m.id).padStart(4,"0")+"_01";
    S.audio.pause();S.audio.src="https://storage.sekai.best/sekai-jp-assets/music/long/"+vn+"/"+vn+".wav";S.audio.load();
    const speed=N(app().dojo?.speed,6);
    S.lead=preemptForSpeed(speed);S.seek=0;
    await new Promise((resolve,reject)=>{
      if(S.audio.readyState>=2){resolve();return;}
      const ok=()=>{cleanup();resolve()},bad=()=>{cleanup();reject(Error("官方音源載入失敗"))};
      const cleanup=()=>{S.audio.removeEventListener("canplay",ok);S.audio.removeEventListener("error",bad)};
      S.audio.addEventListener("canplay",ok,{once:true});S.audio.addEventListener("error",bad,{once:true});
    });
    await S.audio.play();
    S.running=true;S.paused=false;
    const loading=$("dojoGameLoading");if(loading)loading.classList.add("hidden");
    S.endAt=Math.max(...S.notes.map(x=>x.end||x.hit),0)+.8;
    if(S.pause)S.pause.hidden=false;
    if(S.status)S.status.textContent="PLAY · "+LAB[q.d];
    if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="⏸ 暫停";
    if($("dojoGameResult"))$("dojoGameResult").hidden=true;
    if($("dojoGameSongTitle"))$("dojoGameSongTitle").textContent=q.m.title;
    if($("dojoHudSongTitle"))$("dojoHudSongTitle").textContent=q.m.title;
    if($("dojoGameSongMeta"))$("dojoGameSongMeta").textContent="官方音源 · "+LAB[q.d];
    if($("dojoHudSongMeta"))$("dojoHudSongMeta").textContent=LAB[q.d];
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
      try{z.setPointerCapture(e.pointerId)}catch(_){}
      S.touch.set(e.pointerId,{l:lane,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),exact:true,fired:false});
      if(!hit(lane,"tap",true,"up","ptr:"+e.pointerId))spawnLaneFx(lane);return;
    }
    const w=$("dojoGameStageWrap");if(!w||!S.running)return;
    const lane=screenLaneFromClient(e.clientX,w,e.clientY);
    S.touch.set(e.pointerId,{l:lane,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),exact:true,fired:false});
    if(!hit(lane,"tap",true,"up","ptr:"+e.pointerId))spawnLaneFx(lane);
  },{passive:false});
  document.addEventListener("pointermove",e=>{
    const q=S.touch.get(e.pointerId);if(!q)return;
    const dx=e.clientX-q.x,dy=e.clientY-q.y;
    if(S.held.has("ptr:"+e.pointerId)){
      const w=$("dojoGameStageWrap");
      if(w)q.l=screenLaneFromClient(e.clientX,w);
      const h=S.held.get("ptr:"+e.pointerId);if(h){h.lane=q.l;h.inputLane=q.l;h.exactInput=true;}
      if(Math.hypot(dx,dy)>20&&h){
        const dir=gestureDirection(dx,dy);
        if(h.note?.tail?.dir){
          if(dir===h.note.tail.dir)h.flicked=true;
          else h.wrongFlick=true;
        }
      }
      return;
    }
    if(Math.hypot(e.clientX-q.sx,e.clientY-q.sy)>22&&S.running&&!q.fired){
      const totalDx=e.clientX-q.sx,totalDy=e.clientY-q.sy;
      const dir=gestureDirection(totalDx,totalDy);
      const dt=Math.max(.008,(performance.now()-q.t)/1000),speed=Math.hypot(totalDx,totalDy)/dt;
      // Flicks are judged against the lane where the gesture started; the
      // gesture vector itself carries the directional intent. Do not remap the
      // lane to the gesture endpoint, otherwise diagonal/horizontal flicks can
      // jump into a neighbouring lane before the chart bucket is evaluated.
      if(speed>120){
        q.fired=true;
        hit(q.l,"flick",true,dir,"ptr:"+e.pointerId,{dx:totalDx,dy:totalDy});
      }
    }
  },{passive:false});
  const endPointer=e=>{
    const q=S.touch.get(e.pointerId);S.touch.delete(e.pointerId);if(!q)return;
    // Some mobile/WebKit pointer stacks coalesce the final move event. Retry the
    // flick on pointerup from the original lane so a valid gesture cannot vanish.
    if(S.running&&!q.fired){
      const dx=e.clientX-q.sx,dy=e.clientY-q.sy;
      if(Math.hypot(dx,dy)>22){
        const dir=gestureDirection(dx,dy);
        q.fired=true;
        hit(q.l,"flick",true,dir,"ptr:"+e.pointerId,{dx,dy});
      }
    }
    release("ptr:"+e.pointerId);
  };
  document.addEventListener("pointerup",endPointer);document.addEventListener("pointercancel",endPointer);
  // Mouse fallback is only needed on legacy browsers without PointerEvent;
  // modern browsers must not receive both pointer and synthetic mouse hits.
  if(!window.PointerEvent){
    // Mouse fallback for browsers that expose mouse input without a usable
    // PointerEvent stream. It shares the exact flick judge path.
    let mouseGesture=null;
    document.addEventListener("mousedown",e=>{
      if(e.button!==0||!S.running)return;
      const w=$("dojoGameStageWrap");if(!w)return;
      const lane=screenLaneFromClient(e.clientX,w,e.clientY);
      mouseGesture={lane,sx:e.clientX,sy:e.clientY,fired:false};
    },{passive:false});
    document.addEventListener("mousemove",e=>{
      const q=mouseGesture;if(!q||q.fired||!S.running)return;
      const dx=e.clientX-q.sx,dy=e.clientY-q.sy;
      if(Math.hypot(dx,dy)<=22)return;
      const dir=gestureDirection(dx,dy);
      q.fired=true;
      hit(q.lane,"flick",true,dir,"mouse",{dx,dy});
    },{passive:false});
    document.addEventListener("mouseup",e=>{
      if(!mouseGesture)return;
      if(!mouseGesture.fired){
        const dx=e.clientX-mouseGesture.sx,dy=e.clientY-mouseGesture.sy;
        if(Math.hypot(dx,dy)>22){
          const dir=gestureDirection(dx,dy);
          mouseGesture.fired=true;
          hit(mouseGesture.lane,"flick",true,dir,"mouse",{dx,dy});
        }
      }
      release("mouse");mouseGesture=null;
    },{passive:false});
    }
  $("dojoGameFullscreenBtn")?.addEventListener("click",async()=>{try{await $("dojoGameStageWrap")?.requestFullscreen?.()}catch(_){}});
  $("dojoGameResetBtn")?.addEventListener("click",()=>{S.running=false;S.paused=false;S.audio.pause();S.audio.currentTime=0;S.held.clear();S.touch.clear();S.fx=[];S.particles=[];const st=$("dojoGameStageWrap");
    if(st&&prep.jacket){st.style.backgroundImage='linear-gradient(rgba(3,5,14,.18),rgba(3,5,14,.58)),url("'+prep.jacket+'")';st.style.backgroundSize="cover";st.style.backgroundPosition="center";}S.judgementHistory=[];S.lastInput=null;if(S.pause)S.pause.hidden=true;if($("dojoGameResult"))$("dojoGameResult").hidden=true;if($("dojoOpenPracticeBtn"))$("dojoOpenPracticeBtn").textContent="▶ 開始打歌";});
}
function expose(){
  window.__PJSEKAI_DOJO__={
    start,pause,stop,finish,
    state:{
      get prepared(){if(!S.prep)return null;return{music:S.prep.music,difficulty:S.prep.difficulty,audioUrl:S.prep.audioUrl||"",vocal:S.prep.vocal||null,notes:S.prep.notes||[]};},
      get notes(){return S.notes.map(n=>({lane:n.l,kind:n.k,hit:n.hit,judged:!!n.done,direction:n.f||null,critical:!!n.c,trace:!!n.t,end:n.end||0}));},
      get audio(){return S.audio},
      get running(){return S.running},
      get starting(){return S.starting},
      get score(){return S.score},
      get combo(){return S.combo},
      get judged(){return S.judged},
      get error(){return S.error||""},
      get lastInput(){return S.lastInput},
      get counts(){return {...S.counts}},
      get life(){return S.life},
      get accuracy(){return S.tn?cl(100-(S.timing/S.tn)*120,0,100):100},
      get settings(){const d=app().dojo||{};return{speed:N(d.speed,10),audioOffset:N(d.audioOffset,0),visualOffset:N(d.visualOffset,0),mirror:!!d.mirror,hidden:!!d.hidden,sudden:!!d.sudden};},
      get noteStats(){
        const hits=S.notes.map(n=>n.hit).filter(Number.isFinite);
        const now=(S.audio.currentTime||0)-S.chartOffset;
        const future=S.notes.filter(n=>Number.isFinite(n.hit)&&n.hit>now+.1).slice(0,12);
        return{count:S.notes.length,finite:hits.length,min:hits.length?Math.min(...hits):null,max:hits.length?Math.max(...hits):null,now,future:future.map(n=>({hit:n.hit,lane:n.l,kind:n.k,end:n.end||0,direction:n.f||null,critical:!!n.c,trace:!!n.t}))};
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
