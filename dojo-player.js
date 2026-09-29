/* Direct Dojo gameplay engine
 * Chart parsing logic adapted from the MIT-licensed mkpoli/sus-js and
 * Next-SEKAI Project SEKAI SUS analysis/conversion approach.
 */
(function(){
'use strict';
const B=window.__PJSEKAI_APP__;
if(!B)return;

const MUSIC_URL='https://cdn.jsdelivr.net/gh/Sekai-World/sekai-master-db-diff@main/musics.json';
const VOCAL_URL='https://cdn.jsdelivr.net/gh/Sekai-World/sekai-master-db-diff@main/musicVocals.json';
const ASSETS='https://assets.unipjsk.com';
const DIFFS=['easy','normal','hard','expert','master','append'];
const DIFF_LABEL={easy:'Easy',normal:'Normal',hard:'Hard',expert:'Expert',master:'Master',append:'Append'};
const JUDGE={perfect:.045,great:.085,good:.11,bad:.125};

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};

const state={
  songs:null,vocals:null,prepared:null,prepareKey:'',
  pixi:null,app:null,stage:null,laneLayer:null,noteLayer:null,effectLayer:null,
  audio:new Audio(),running:false,starting:false,raf:0,
  notes:[],score:0,combo:0,bestCombo:0,judged:0,lastJudgeToken:0,
  startSeek:0,leadTime:2.1,selected:null,
  held:new Map(),pointers:new Map(),lastFrame:0,
  effects:[]
};

state.audio.preload='auto';
state.audio.addEventListener('ended',()=>finishGame());
state.audio.addEventListener('error',()=>showGameError('歌曲音訊無法載入，但仍可使用靜音譜面練習。'));
state.audio.addEventListener('canplay',()=>{const m=$('dojoGameMessage');if(m&&state.running)m.textContent='遊玩中 · 觸控下方區域或使用 D / F / J / K';});

function appState(){
  const s=B.getState()||{};
  s.dojo=s.dojo&&typeof s.dojo==='object'?s.dojo:{};
  s.dojo.keys=Array.isArray(s.dojo.keys)?s.dojo.keys.slice(0,4):['D','F','J','K'];
  while(s.dojo.keys.length<4)s.dojo.keys.push(['D','F','J','K'][s.dojo.keys.length]);
  return s;
}

async function json(url){
  const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}

function splitSus(text){
  const lines=[];
  const measureChanges=[];
  const meta=new Map();
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();
    if(!line.startsWith('#'))continue;
    const isData=line.includes(':');
    const at=line.indexOf(isData?':':' ');
    if(at<0)continue;
    const left=line.slice(1,at).trim();
    const right=line.slice(at+1).trim();
    if(isData)lines.push([left,right]);
    else if(left==='MEASUREBS')measureChanges.unshift([lines.length,Number(right)]);
    else meta.set(left,right.replace(/^"(.*)"$/,'$1'));
  }
  return {lines,measureChanges,meta};
}

function analyzeSus(text){
  const {lines,measureChanges,meta}=splitSus(text);
  const ticksPerBeat=Number(meta.get('REQUEST')?.match(/ticks_per_beat\s+(\d+)/)?.[1]||480);
  const barLengths=[];
  for(const [index,line] of lines.entries()){
    const [header,data]=line;
    if(header.length!==5||!header.endsWith('02'))continue;
    const measure=Number(header.slice(0,3))+(measureChanges.find(([i])=>i<=index)?.[1]||0);
    if(Number.isFinite(measure))barLengths.push({measure,length:Number(data)});
  }
  if(!barLengths.length)barLengths.push({measure:0,length:4});
  barLengths.sort((a,b)=>a.measure-b.measure);
  let ticks=0,prev=null;
  const bars=barLengths.map(b=>{
    if(prev)ticks+=(b.measure-prev.measure)*prev.length*ticksPerBeat;
    prev=b;
    return {measure:b.measure,ticksPerMeasure:b.length*ticksPerBeat,ticks};
  }).reverse();
  const toTick=(measure,p,q)=>{
    const bar=bars.find(x=>measure>=x.measure)||bars[bars.length-1];
    return bar.ticks+(measure-bar.measure)*bar.ticksPerMeasure+(p*bar.ticksPerMeasure)/q;
  };
  const bpms=new Map(),bpmChanges=[],timeScaleChanges=[],tapNotes=[],directionalNotes=[],streams=new Map();
  const rawObjects=(header,data)=>{
    const measure=Number(header.slice(0,3))+(measureChanges.find(([i])=>i<=lines.indexOf([header,data]))?.[1]||0);
    const pieces=String(data).match(/.{2}/g)||[];
    return pieces.map((value,i)=>value!=='00'?{tick:toTick(measure,i,pieces.length),value}:null).filter(Boolean);
  };
  const localMeasureOffset=(idx)=>measureChanges.find(([i])=>i<=idx)?.[1]||0;
  const noteObjects=(header,data,offset)=>{
    const measure=Number(header.slice(0,3))+offset;
    const lane=parseInt(header[4],36);
    const pieces=String(data).match(/.{2}/g)||[];
    return pieces.map((value,i)=>value!=='00'?{
      tick:toTick(measure,i,pieces.length),lane,width:parseInt(value[1],36),type:parseInt(value[0],36)
    }:null).filter(Boolean);
  };
  lines.forEach(([header,data],idx)=>{
    if(header.length===5&&header.startsWith('BPM')){bpms.set(header.slice(3),Number(data));return;}
    if(header.length===5&&header.endsWith('08')){
      for(const x of noteObjects(header,data,localMeasureOffset(idx)))bpmChanges.push({tick:x.tick,bpm:bpms.get(data)||Number(data)||0});
      return;
    }
    if(header.length===5&&header[3]==='1'){tapNotes.push(...noteObjects(header,data,localMeasureOffset(idx)));return;}
    if(header.length===6&&(header[3]==='3'||header[3]==='9')){
      const key=header[5]+'-'+header[3];
      const cur=streams.get(key)||{type:Number(header[3]),notes:[]};
      cur.notes.push(...noteObjects(header,data,localMeasureOffset(idx)));streams.set(key,cur);return;
    }
    if(header.length===5&&header[3]==='5')directionalNotes.push(...noteObjects(header,data,localMeasureOffset(idx)));
  });
  const slides=[];
  for(const stream of streams.values()){
    let current=null;
    for(const note of stream.notes.sort((a,b)=>a.tick-b.tick)){
      if(!current){current=[];slides.push({type:stream.type,notes:current});}
      current.push(note);
      if(note.type===2)current=null;
    }
  }
  return {
    ticksPerBeat,
    offset:-Number(meta.get('WAVEOFFSET')||0),
    tapNotes,directionalNotes,
    slides,
    bpmChanges:bpmChanges.sort((a,b)=>a.tick-b.tick),
    metadata:Object.fromEntries(meta)
  };
}

function tempoTimeline(score,fallback=120){
  const changes=(score.bpmChanges||[]).filter(x=>Number.isFinite(x.bpm)&&x.bpm>0).map(x=>({beat:x.tick/score.ticksPerBeat,bpm:x.bpm})).sort((a,b)=>a.beat-b.beat);
  if(!changes.length)changes.push({beat:0,bpm:fallback});
  if(changes[0].beat>0)changes.unshift({beat:0,bpm:changes[0].bpm});
  const out=[];let seconds=0;
  for(let i=0;i<changes.length;i++){
    const cur=changes[i],prev=changes[i-1];
    if(prev)seconds+=(cur.beat-prev.beat)*60/prev.bpm;
    out.push({beat:cur.beat,bpm:cur.bpm,seconds});
  }
  return out;
}
function beatToSeconds(beat,timeline){
  let lo=0,hi=timeline.length-1,best=0;
  while(lo<=hi){const m=(lo+hi)>>1;if(timeline[m].beat<=beat){best=m;lo=m+1;}else hi=m-1;}
  const p=timeline[best];
  return p.seconds+(beat-p.beat)*60/p.bpm;
}

function laneIndex(raw){return clamp(parseInt(raw,36)-2,0,11);}
function noteKey(lane,tick){return lane+'@'+tick.toFixed(4);}

function buildNotes(score,music,difficulty){
  const timeline=tempoTimeline(score,150);
  const filler=Math.max(0,Number(music.fillerSec)||0);
  const chartOffset=Number(score.offset||0)/1000;
  const flicks=new Map();
  for(const d of score.directionalNotes||[]){
    const li=laneIndex(d.lane),k=noteKey(li,d.tick);
    if([1,3,4].includes(d.type))flicks.set(k,d.type===1?'up':d.type===3?'left':'right');
  }
  const notes=[];
  for(const x of score.tapNotes||[]){
    if(x.lane<=1||x.lane>=14)continue;
    if(![1,2,5,6].includes(x.type))continue;
    const li=laneIndex(x.lane);
    notes.push({
      id:'tap-'+notes.length,kind:'tap',lane:li,width:clamp(Number(x.width)||1,1,3),
      hit:filler+beatToSeconds(x.tick/score.ticksPerBeat,timeline)+chartOffset,
      critical:x.type===2||x.type===6,trace:x.type===5||x.type===6,
      flick:flicks.get(noteKey(li,x.tick))||null,judged:false
    });
  }
  for(const slide of score.slides||[]){
    if(slide.type!==3)continue;
    const pts=(slide.notes||[]).filter(x=>x.lane>1&&x.lane<14).sort((a,b)=>a.tick-b.tick);
    const start=pts.find(x=>[1,2].includes(x.type)),end=[...pts].reverse().find(x=>x.type===2);
    if(!start||!end||end.tick<=start.tick)continue;
    const path=pts.map(x=>({lane:laneIndex(x.lane),width:clamp(Number(x.width)||1,1,3),beat:x.tick/score.ticksPerBeat}));
    const startLane=laneIndex(start.lane);
    notes.push({
      id:'hold-'+notes.length,kind:'hold',lane:startLane,width:clamp(Number(start.width)||1,1,3),
      hit:filler+beatToSeconds(start.tick/score.ticksPerBeat,timeline)+chartOffset,
      end:filler+beatToSeconds(end.tick/score.ticksPerBeat,timeline)+chartOffset,
      path,critical:start.type===2,started:false,judged:false
    });
  }
  return notes.sort((a,b)=>a.hit-b.hit);
}

function selectedSong(){
  const title=$('dojoSelectedTitle')?.textContent?.trim()||'';
  const diffEl=document.querySelector('[data-dojo-diff].active');
  const difficulty=(diffEl?.dataset?.dojoDiff||'expert').toLowerCase();
  return {title,difficulty};
}
function musicBySelection(list){
  const s=selectedSong();
  let m=list.find(x=>x.title===s.title);
  if(!m)m=list.find(x=>String(x.title||'').toLowerCase()===String(s.title||'').toLowerCase());
  if(!m)m=list.find(x=>String(x.title||'').includes(String(s.title||'')));
  return {music:m,difficulty:s.difficulty};
}

function scoreUrl(id,difficulty){
  return ASSETS+'/startapp/music/music_score/'+String(id).padStart(4,'0')+'_01/'+difficulty;
}
function jacketUrl(music){
  const name=music?.assetbundleName||'';
  return name?ASSETS+'/startapp/music/jacket/'+name+'/'+name+'.png':'';
}
function vocalFor(music){
  return (state.vocals||[]).filter(v=>Number(v.musicId)===Number(music.id)).sort((a,b)=>{
    const ao=a.musicVocalType==='original_song'?0:1,bo=b.musicVocalType==='original_song'?0:1;
    return ao-bo||Number(a.seq||0)-Number(b.seq||0);
  })[0]||null;
}
function audioUrl(vocal){
  const name=vocal?.assetbundleName;
  return name?ASSETS+'/ondemand/music/long/'+name+'/'+name+'.mp3':'';
}

async function loadData(){
  if(state.songs&&state.vocals)return;
  const [songs,vocals]=await Promise.all([json(MUSIC_URL),json(VOCAL_URL)]);
  state.songs=Array.isArray(songs)?songs:[];
  state.vocals=Array.isArray(vocals)?vocals:[];
}

async function prepareSelection(){
  await loadData();
  const {music,difficulty}=musicBySelection(state.songs);
  if(!music)throw new Error('找不到這首歌曲的官方資料');
  if(!DIFFS.includes(difficulty))throw new Error('此難度尚未支援');
  const key=music.id+':'+difficulty;
  if(state.prepareKey===key&&state.prepared)return state.prepared;
  setLoading('正在載入 '+music.title+' · '+DIFF_LABEL[difficulty]+'…');
  const response=await fetch(scoreUrl(music.id,difficulty),{cache:'no-store'});
  if(!response.ok)throw new Error('官方譜面載入失敗：HTTP '+response.status);
  const sus=await response.text();
  const score=analyzeSus(sus);
  const notes=buildNotes(score,music,difficulty);
  const vocal=vocalFor(music);
  const prepared={music,difficulty,score,notes,vocal,audioUrl:audioUrl(vocal),jacket:jacketUrl(music)};
  state.prepareKey=key;state.prepared=prepared;state.selected=prepared;
  renderHeader(prepared);
  hideLoading();
  return prepared;
}

function setLoading(msg){const x=$('dojoGameLoading'),s=x?.querySelector('span');if(s)s.textContent=msg;x?.classList.remove('hidden');}
function hideLoading(){$('dojoGameLoading')?.classList.add('hidden');}
function showGameError(msg){
  const card=$('dojoGameCard');if(card)card.classList.add('error');
  const x=$('dojoGameMessage');if(x)x.textContent='⚠ '+msg;
  hideLoading();
}
function showGameReady(msg){
  const card=$('dojoGameCard');if(card){card.classList.remove('error');card.classList.add('ready');}
  const x=$('dojoGameMessage');if(x)x.textContent=msg;
}
function renderHeader(prep){
  const title=$('dojoGameSongTitle'),meta=$('dojoGameSongMeta'),cover=$('dojoGameCover');
  if(title)title.textContent=prep.music.title;
  if(meta)meta.textContent=(prep.vocal?.caption||'官方音源')+' · '+DIFF_LABEL[prep.difficulty];
  if($('dojoHudSongTitle'))$('dojoHudSongTitle').textContent=prep.music.title;
  if($('dojoHudSongMeta'))$('dojoHudSongMeta').textContent=DIFF_LABEL[prep.difficulty];
  if(cover){cover.src=prep.jacket||'';cover.alt=prep.music.title;}
}

async function initPixi(){
  if(state.app)return;
  if(!window.PIXI)throw new Error('PixiJS 載入失敗');
  const wrap=$('dojoGameStageWrap'),canvas=$('dojoGameCanvas');
  if(!wrap||!canvas)throw new Error('Dojo 遊戲畫面初始化失敗');
  const app=new PIXI.Application();
  await app.init({canvas,resizeTo:wrap,antialias:true,backgroundAlpha:0,resolution:Math.min(window.devicePixelRatio||1,2),autoDensity:true});
  const stage=new PIXI.Container(),lane=new PIXI.Graphics(),notes=new PIXI.Container(),fx=new PIXI.Container();
  app.stage.addChild(stage);stage.addChild(lane);stage.addChild(notes);stage.addChild(fx);
  state.app=app;state.stage=stage;state.laneLayer=lane;state.noteLayer=notes;state.effectLayer=fx;
  const ro=window.ResizeObserver?new ResizeObserver(()=>{
    const w=wrap.clientWidth,h=wrap.clientHeight;
    if(w&&h)app.renderer.resize(w,h);
  }):null;
  ro?.observe(wrap);
  app.ticker.add(()=>frame());
}

function poly(g,points,color,alpha=1){
  g.poly(points).fill({color,alpha});
}
function stroke(g,points,color,width=1,alpha=1){
  g.poly(points).stroke({color,width,alpha});
}
function laneGeom(){
  const w=$('dojoGameStageWrap')?.clientWidth||960,h=$('dojoGameStageWrap')?.clientHeight||540;
  return {w,h,topY:h*.13,hitY:h*.89,topL:w*.285,topR:w*.715,bottomL:w*.055,bottomR:w*.945};
}
function laneX(index,progress,g){
  const mirror=!!appState().dojo.mirror,index2=mirror?11-index:index;
  const t=clamp(progress,0,1),top=g.topL+(g.topR-g.topL)*(index2+.5)/12,bottom=g.bottomL+(g.bottomR-g.bottomL)*(index2+.5)/12;
  return top+(bottom-top)*t;
}
function laneEdge(index,progress,g){
  const mirror=!!appState().dojo.mirror,index2=mirror?12-index:index;
  const t=clamp(progress,0,1),top=g.topL+(g.topR-g.topL)*index2/12,bottom=g.bottomL+(g.bottomR-g.bottomL)*index2/12;
  return top+(bottom-top)*t;
}
function drawScene(now){
  const g=laneGeom(),l=state.laneLayer;
  l.clear();
  poly(l,[[g.topL,g.topY],[g.topR,g.topY],[g.bottomR,g.hitY],[g.bottomL,g.hitY]],0x0b1020,.93);
  for(let i=0;i<=12;i++){
    const x1=laneEdge(i,0,g),x2=laneEdge(i,1,g);
    stroke(l,[[x1,g.topY],[x2,g.hitY]],0xb7c6e7,i===0||i===12?2:1,i===0||i===12?.45:.18);
  }
  stroke(l,[[g.bottomL,g.hitY],[g.bottomR,g.hitY]],0x66e3ff,3,.8);
  stroke(l,[[g.bottomL,g.hitY+5],[g.bottomR,g.hitY+5]],0xffffff,1,.18);
  const z=state.noteLayer;
  z.removeChildren();
  const lead=state.leadTime;
  const settings=appState().dojo;
  for(const note of state.notes){
    const primaryDelta=note.hit-now;
    const tailDelta=note.kind==='hold'?note.end-now:null;
    if(note.kind==='hold'){
      const headP=1-clamp(primaryDelta/lead,0,1),tailP=1-clamp(tailDelta/lead,0,1);
      if(tailDelta<-JUDGE.bad||primaryDelta>lead)continue;
      const gg=new PIXI.Graphics();
      const xh=laneX(note.lane,headP,g),xe=laneX(note.path?.at(-1)?.lane??note.lane,tailP,g);
      const wh=Math.max(8,(g.bottomR-g.bottomL)/12*note.width*.72);
      poly(gg,[[xh-wh/2,g.topY+(1-headP)*(g.hitY-g.topY)],[xh+wh/2,g.topY+(1-headP)*(g.hitY-g.topY)],[xe+wh/2,g.topY+(1-tailP)*(g.hitY-g.topY)],[xe-wh/2,g.topY+(1-tailP)*(g.hitY-g.topY)]],0x62dca1,note.started?.62:.42);
      const headY=g.topY+(1-headP)*(g.hitY-g.topY);
      roundNote(gg,xh,headY,wh,note.critical?0xffd34f:0x62dca1);
      z.addChild(gg);
      continue;
    }
    if(primaryDelta<-JUDGE.bad||primaryDelta>lead)continue;
    const p=1-clamp(primaryDelta/lead,0,1);
    if(settings.sudden&&p<.28)continue;
    const x=laneX(note.lane,p,g),y=g.topY+(1-p)*(g.hitY-g.topY);
    const wh=Math.max(10,(g.bottomR-g.bottomL)/12*note.width*.72),gg=new PIXI.Graphics();
    const col=note.flick?0xff6f91:(note.critical?0xffd34f:0x58d6ef);
    const noteAlpha=settings.hidden?clamp(p/.8,.18,1):1;
    gg.roundRect(x-wh/2,y-6,wh,12,5).fill({color:col,alpha:.96*noteAlpha});
    gg.roundRect(x-wh/2,y-3,wh,3,2).fill({color:0xffffff,alpha:.28*noteAlpha});
    z.addChild(gg);
  }
}
function roundNote(g,x,y,w,color){
  g.roundRect(x-w/2,y-6,w,12,5).fill({color,alpha:.96});
  g.roundRect(x-w/2,y-3,w,3,2).fill({color:0xffffff,alpha:.28});
}

function spawnEffect(kind){
  const g=laneGeom(),container=state.effectLayer,centerX=g.w/2,centerY=g.hitY;
  const color=kind==='PERFECT'?0x74e6ff:kind==='GREAT'?0x8fe6b8:kind==='GOOD'?0xffd34f:0xff6f91;
  state.effects.push({created:performance.now(),color,x:centerX,y:centerY});
}
function drawEffects(){
  const c=state.effectLayer;c.removeChildren();const now=performance.now();
  state.effects=state.effects.filter(e=>now-e.created<420);
  for(const e of state.effects){
    const age=(now-e.created)/420,gg=new PIXI.Graphics();
    const r=18+age*55;
    gg.circle(e.x,e.y,r).stroke({color:e.color,width:3,alpha:1-age});
    c.addChild(gg);
  }
}
function frame(){
  if(!state.app)return;
  const s=appState().dojo;
  const audioNow=(state.audio.currentTime||0)+(num(s.visualOffset,0)-num(s.audioOffset,0))/1000;
  if(state.running)processNotes(audioNow);
  drawScene(audioNow);drawEffects();updateHud(audioNow);
}
function updateHud(now){
  const pre=state.prepared,total=state.notes.length;
  const first=state.notes.find(n=>!n.judged);
  const duration=Number.isFinite(state.audio.duration)&&state.audio.duration>0?state.audio.duration:1;
  const progress=state.startSeek>=0?clamp((state.audio.currentTime-state.startSeek)/Math.max(duration-state.startSeek,.1),0,1):0;
  const bar=$('dojoGameProgressBar');if(bar)bar.style.width=(progress*100).toFixed(2)+'%';
  const score=$('dojoGameScore');if(score)score.textContent=String(Math.round(state.score)).padStart(7,'0');
  const combo=$('dojoGameCombo');if(combo)combo.textContent=state.combo>0?String(state.combo):'0';
  const status=$('dojoGameStatus');if(status)status.textContent=state.running?'PLAY':(state.prepared?'READY':'LOAD');
  const remaining=total-state.judged;
  const msg=$('dojoGameMessage');
  if(state.running&&msg&&remaining>=0)msg.textContent='遊玩中 · '+remaining+' 個判定事件剩餘';
  if(!state.running&&!state.starting&&msg&&pre&&!state.finished)msg.textContent='準備完成 · 按「開始打歌」';
}
function processNotes(now){
  for(const note of state.notes){
    if(note.judged)continue;
    if(note.kind==='hold'){
      if(!note.started && now-note.hit>JUDGE.bad){judge(note,'MISS',0);continue;}
      if(note.started && now-note.end>JUDGE.bad){judge(note,'MISS',0);continue;}
      if(note.started){
        for(const g of state.held.values())if(g===Math.floor(note.lane/3)){note.lastHeldAt=now;break;}
      }
    }else if(now-note.hit>JUDGE.bad){
      judge(note,'MISS',0);
    }
  }
}
function scoreValue(j){return j==='PERFECT'?1000:j==='GREAT'?700:j==='GOOD'?400:0;}
function judge(note,label,delta){
  note.judged=true;state.judged++;
  if(label==='MISS'){state.combo=0;}else{state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);}
  state.score+=scoreValue(label);showJudge(label,delta);
}
function showJudge(label){
  const el=$('dojoJudgeText');if(!el)return;
  el.textContent=label;el.className='dojo-judge-text show';
  el.dataset.judge=label;spawnEffect(label);
  clearTimeout(state.lastJudgeToken);state.lastJudgeToken=setTimeout(()=>el.classList.remove('show'),180);
}
function classify(delta){
  const a=Math.abs(delta);
  if(a<=JUDGE.perfect)return'PERFECT';
  if(a<=JUDGE.great)return'GREAT';
  if(a<=JUDGE.good)return'GOOD';
  return'MISS';
}
function laneMatches(note,group){
  const left=group*3,right=left+2;return note.lane<=right&&(note.lane+note.width-1)>=left;
}
function hitGroup(group){
  if(!state.running)return;
  const now=state.audio.currentTime||0;
  let candidate=null,best=Infinity;
  for(const n of state.notes){
    if(n.judged)continue;
    if(!laneMatches(n,group))continue;
    if(n.kind==='hold'&&n.started)continue;
    const d=Math.abs(n.hit-now);
    if(d<=JUDGE.good&&d<best){best=d;candidate=n;}
  }
  if(!candidate)return;
  const delta=now-candidate.hit,label=classify(delta);
  if(candidate.kind==='hold'){
    if(label==='MISS'){judge(candidate,'MISS',delta);return;}
    candidate.started=true;candidate.holding=group;candidate.lastHeldAt=now;
    state.held.set(candidate.id,group);state.score+=scoreValue(label);state.combo++;state.judged++;
    showJudge(label,delta);
  }else judge(candidate,label,delta);
}
function releaseGroup(group){
  if(!state.running)return;
  const now=state.audio.currentTime||0;
  for(const n of state.notes){
    if(n.kind!=='hold'||n.judged||!n.started||n.holding!==group)continue;
    state.held.delete(n.id);
    const label=classify(now-n.end);
    if(label==='MISS'||now<n.end-JUDGE.good){judge(n,'MISS',now-n.end);}
    else{n.judged=true;state.judged++;state.score+=scoreValue(label)*.6;showJudge(label,now-n.end);}
    n.holding=null;
  }
}
function bindInputs(){
  const keys=()=>appState().dojo.keys.map(x=>String(x||'').toUpperCase());
  window.addEventListener('keydown',e=>{
    if(e.repeat)return;
    const k=String(e.key||'').toUpperCase(),i=keys().indexOf(k);
    if(i<0||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
    e.preventDefault();pressZone(i);hitGroup(i);
  });
  window.addEventListener('keyup',e=>{
    const k=String(e.key||'').toUpperCase(),i=keys().indexOf(k);
    if(i<0)return;
    e.preventDefault();releaseZone(i);releaseGroup(i);
  });
  document.querySelectorAll('[data-dojo-lane-zone]').forEach(el=>{
    const group=Number(el.dataset.dojoLaneZone);
    el.addEventListener('pointerdown',e=>{
      e.preventDefault();el.setPointerCapture?.(e.pointerId);state.pointers.set(e.pointerId,group);pressZone(group);hitGroup(group);
    });
    el.addEventListener('pointerup',e=>{e.preventDefault();const g=state.pointers.get(e.pointerId);state.pointers.delete(e.pointerId);if(g!==undefined){releaseZone(g);releaseGroup(g);}});
    el.addEventListener('pointercancel',e=>{const g=state.pointers.get(e.pointerId);state.pointers.delete(e.pointerId);if(g!==undefined)releaseGroup(g);});
  });
}
function pressZone(i){const el=document.querySelector('[data-dojo-lane-zone="'+i+'"]');el?.classList.add('active');}
function releaseZone(i){const el=document.querySelector('[data-dojo-lane-zone="'+i+'"]');el?.classList.remove('active');}

async function startGame(){
  if(state.starting)return;
  try{
    state.starting=true;
    const btn=$('dojoOpenPracticeBtn');if(btn){btn.disabled=true;btn.classList.add('loading');btn.textContent='載入中…';}
    const pre=await prepareSelection();await initPixi();
    if(!pre.audioUrl)throw new Error('找不到這首歌的官方音源');
    state.audio.pause();state.audio.src=pre.audioUrl;state.audio.load();
    const lead=1.8;
    state.startSeek=Math.max(0,(Number(pre.music.fillerSec)||0)-lead);
    const speed=clamp(num(appState().dojo.speed,10),1,12);
    state.leadTime=clamp(3.3-(speed-1)*0.15,1.2,3.3);
    await state.audio.play().catch(e=>{throw new Error('瀏覽器拒絕播放音訊，請再按一次「開始打歌」');});
    state.audio.currentTime=state.startSeek;
    state.notes=pre.notes.map(n=>({...n,judged:false,started:false}));
    state.score=0;state.combo=0;state.bestCombo=0;state.judged=0;state.finished=false;state.running=true;
    showGameReady('遊玩中 · 觸控下方區域或使用 D / F / J / K');
    const msg=$('dojoGameMessage');if(msg)msg.textContent='遊玩中 · 觸控下方區域或使用 D / F / J / K';
  }catch(e){showGameError(e?.message||'開始打歌失敗');}
  finally{
    state.starting=false;
    const btn=$('dojoOpenPracticeBtn');if(btn){btn.disabled=false;btn.classList.remove('loading');btn.textContent=state.running?'⏸ 暫停':'▶ 開始打歌';}
  }
}
function togglePause(){
  if(!state.prepared)return;
  if(state.running){state.audio.pause();state.running=false;const b=$('dojoOpenPracticeBtn');if(b)b.textContent='▶ 繼續打歌';showGameReady('已暫停 · 按「繼續打歌」回到譜面');}
  else if(state.audio.src){state.audio.play().then(()=>{state.running=true;const b=$('dojoOpenPracticeBtn');if(b)b.textContent='⏸ 暫停';}).catch(()=>showGameError('無法繼續播放，請再點一次按鈕'));}}
function finishGame(){
  if(!state.running&&!state.starting)return;
  state.running=false;state.finished=true;
  const b=$('dojoOpenPracticeBtn');if(b){b.textContent='↻ 再玩一次';b.disabled=false;}
  showGameReady('完成！最高 Combo '+state.bestCombo+' · 分數 '+Math.round(state.score));
}
function bindControls(){
  $('dojoOpenPracticeBtn')?.addEventListener('click',()=>state.finished?startGame():(state.prepared&&!state.running&&state.audio.src?togglePause():startGame()));
  $('dojoAnalyzeBtn')?.addEventListener('click',()=>window.setTimeout(()=>{},0));
  $('dojoGameFullscreenBtn')?.addEventListener('click',async()=>{
    const el=$('dojoGameStageWrap');if(!el)return;
    try{if(!document.fullscreenElement)await el.requestFullscreen();else await document.exitFullscreen();}catch(_){B.toast('無法進入全螢幕');}
  });
  $('dojoGameResetBtn')?.addEventListener('click',()=>{
    state.audio.pause();state.running=false;state.finished=false;state.notes=[];state.score=0;state.combo=0;state.judged=0;
    const b=$('dojoOpenPracticeBtn');if(b)b.textContent='▶ 開始打歌';
    showGameReady('已重設 · 按「開始打歌」重新載入');
  });
  document.querySelectorAll('[data-dojo-key]').forEach(el=>el.addEventListener('change',()=>{try{B.save();}catch(_){}}));
  $('dojoSpeedRange')?.addEventListener('input',e=>{
    const s=appState(),v=clamp(num(e.target.value,10),1,12);s.dojo.speed=v;
    if($('dojoSpeedValue'))$('dojoSpeedValue').textContent=v.toFixed(1);
    try{B.save();}catch(_){}
  });
  [['dojoAudioOffset','audioOffset'],['dojoVisualOffset','visualOffset']].forEach(([id,key])=>{
    $(id)?.addEventListener('input',e=>{appState().dojo[key]=clamp(num(e.target.value,0),-1000,1000);try{B.save();}catch(_){}});
  });
  ['mirror','sudden','hidden'].forEach(k=>{
    $('dojoToggle_'+k)?.addEventListener('click',e=>{const s=appState();s.dojo[k]=!s.dojo[k];e.currentTarget.classList.toggle('active',s.dojo[k]);e.currentTarget.setAttribute('aria-pressed',String(s.dojo[k]));try{B.save();}catch(_){}});
  });
  $('dojoResetSettingsBtn')?.addEventListener('click',()=>{
    const s=appState();s.dojo.speed=10;s.dojo.audioOffset=0;s.dojo.visualOffset=0;s.dojo.mirror=false;s.dojo.sudden=false;s.dojo.hidden=false;s.dojo.keys=['D','F','J','K'];try{B.save();}catch(_){}
    document.querySelectorAll('[data-dojo-key]').forEach((el,i)=>el.value=s.dojo.keys[i]);if($('dojoSpeedRange'))$('dojoSpeedRange').value='10';if($('dojoSpeedValue'))$('dojoSpeedValue').textContent='10.0';
  });
}
function schedulePrepare(){
  window.clearTimeout(schedulePrepare.timer);
  schedulePrepare.timer=window.setTimeout(()=>prepareSelection().then(()=>showGameReady('準備完成 · 按「開始打歌」')).catch(()=>{}),220);
}
async function boot(){
  if(!$('dojoGameCanvas'))return;
  window.__PJSEKAI_DOJO__={
    state,
    getAudio:()=>state.audio,
    getPrepared:()=>state.prepared,
    getNotes:()=>state.notes.slice(),
  };
  bindInputs();bindControls();
  try{
    await initPixi();
    setLoading('正在準備預設歌曲…');
    await prepareSelection();
    showGameReady('準備完成 · 按「開始打歌」即可進入遊玩');
  }catch(e){
    showGameError(e?.message||'Dojo 初始化失敗');
  }
  $('dojoSongList')?.addEventListener('click',()=>schedulePrepare());
  $('dojoDifficultyButtons')?.addEventListener('click',()=>schedulePrepare());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();