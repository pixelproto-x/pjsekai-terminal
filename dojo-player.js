/* Direct Dojo gameplay engine
 * Chart parsing logic adapted from the MIT-licensed mkpoli/sus-js and
 * Next-SEKAI Project SEKAI SUS analysis/conversion approach.
 */
(function(){
'use strict';
const B=window.__PJSEKAI_APP__;
if(!B)return;

const MUSIC_URL='dojo-musics.json';
const VOCAL_URL='dojo-vocals.json';
const DIFFICULTY_URL='dojo-difficulties.json';
const ASSETS='https://assets.unipjsk.com';
const DIFFS=['easy','normal','hard','expert','master','append'];
const DIFF_LABEL={easy:'Easy',normal:'Normal',hard:'Hard',expert:'Expert',master:'Master',append:'Append'};
const JUDGE={perfect:.045,great:.085,good:.11,bad:.125};

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};

const state={
  songs:null,vocals:null,difficulties:null,prepared:null,prepareKey:'',
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
  const localTitle=$('dojoSelectedTitle')?.textContent?.trim()||'';
  const detailTitle=document.querySelector('#caDetail .ca-detail-title h3')?.textContent?.trim()||'';
  const title=(localTitle && !/尚未選擇/.test(localTitle))?localTitle:(detailTitle&&!/選擇|未命名/.test(detailTitle)?detailTitle:'');
  const activeDiff=document.querySelector('#caDiffTable .selected,[data-ca-diff].selected,.ca-row.selected[data-ca-diff]');
  const chip=document.querySelector('#caDetail .ca-detail-title .ca-chip')?.textContent?.trim()||'';
  const difficulty=(activeDiff?.dataset?.caDiff||chip||'Expert').toLowerCase();
  return {title,difficulty};
}
function musicBySelection(list){
  const s=selectedSong();
  const remembered=Number(localStorage.getItem('pjsekai-chart-last-song')||0);
  let m=null;
  if(s.title && !/尚未選擇/.test(s.title)){
    m=list.find(x=>x.title===s.title)
      ||list.find(x=>String(x.title||'').toLowerCase()===String(s.title||'').toLowerCase())
      ||list.find(x=>String(x.title||'').toLowerCase().includes(String(s.title||'').toLowerCase()));
  }
  if(!m && remembered)m=list.find(x=>Number(x.id)===remembered);
  if(!m)m=list.find(x=>Number(x.id)===1)||list[0];
  return {music:m,difficulty:DIFFS.includes(s.difficulty)?s.difficulty:(DIFFS.includes('expert')?'expert':DIFFS[0])};
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
    const rank=v=>v.musicVocalType==='original_song'?0:(v.musicVocalType==='sekai'?1:2);
    return rank(a)-rank(b)||Number(a.seq||0)-Number(b.seq||0)||Number(a.id||0)-Number(b.id||0);
  })[0]||null;
}
function audioUrl(vocal){
  const name=vocal?.assetbundleName;
  return name?ASSETS+'/ondemand/music/long/'+name+'/'+name+'.mp3':'';
}

async function loadData(){
  if(!state.songs){
    const [songs,difficulties]=await Promise.all([json(MUSIC_URL),json(DIFFICULTY_URL)]);
    state.songs=Array.isArray(songs)?songs:[];
    state.difficulties=Array.isArray(difficulties)?difficulties:[];
    const byMusic=new Map();
    for(const d of state.difficulties){
      const id=Number(d.musicId);if(!Number.isFinite(id))continue;
      if(!byMusic.has(id))byMusic.set(id,{});
      const key=String(d.musicDifficulty||'').toLowerCase();
      if(DIFFS.includes(key))byMusic.get(id)[key]=d;
    }
    state.songs=state.songs.map(m=>({...m,difficulties:byMusic.get(Number(m.id))||{}}));
  }
  if(!state.vocals){
    try{
      const vocals=await json(VOCAL_URL);
      state.vocals=Array.isArray(vocals)?vocals:[];
    }catch(_){state.vocals=[];}
  }
  if(!state.songs.length)throw new Error('歌曲資料載入失敗');
}

function getDifficultyForMusic(music){
  const available=DIFFS.filter(d=>{
    const row=(music?.difficulties&&music.difficulties[d])||null;
    return !!row;
  });
  return available.includes('expert')?'expert':(available[available.length-1]||'expert');
}
function renderDojoSelection(){
  const list=$('dojoSongList');
  if(!list||!state.songs?.length)return;
  const q=String($('dojoSongSearch')?.value||'').trim().toLowerCase();
  const attr=String($('dojoAttrFilter')?.value||'').trim().toLowerCase();
  const bpm=num($('dojoBpmFilter')?.value,0);
  const remembered=Number(localStorage.getItem('pjsekai-chart-last-song')||0);
  if(!state.uiSongId)state.uiSongId=remembered||1;
  const filtered=state.songs.filter(m=>{
    const text=[m.title,m.artist,m.composer,m.lyricist,m.unit].join(' ').toLowerCase();
    const a=String(m.attr||m.attribute||m.unit||'').toLowerCase();
    return (!q||text.includes(q))&&(!attr||a.includes(attr))&&(Number(m.bpm||m.bpmMin||0)>=bpm);
  });
  const shown=filtered.slice(0,120);
  if($('dojoSongCount'))$('dojoSongCount').textContent=filtered.length.toLocaleString('en-US');
  list.innerHTML=shown.map(m=>{
    const active=Number(m.id)===Number(state.uiSongId);
    return '<button type="button" class="dojo-song-row '+(active?'active':'')+'" data-dojo-local-song="'+String(m.id)+'"><strong>'+escapeHtml(String(m.title||'未命名歌曲'))+'</strong><span>'+escapeHtml(String(m.artist||m.composer||'Project SEKAI'))+'</span><em>'+String(m.bpm||'—')+' BPM</em></button>';
  }).join('')||'<div class="search-empty">找不到符合條件的歌曲</div>';
}
function setUiSelection(id,difficulty){
  const music=state.songs?.find(x=>Number(x.id)===Number(id));
  if(!music)return;
  state.uiSongId=Number(music.id);
  const next=DIFFS.includes(String(difficulty||''))&&music?.difficulties?.[String(difficulty||'')]?String(difficulty):getDifficultyForMusic(music);
  if($('dojoSelectedTitle'))$('dojoSelectedTitle').textContent=music.title||'未命名歌曲';
  if($('dojoSelectedMeta'))$('dojoSelectedMeta').textContent=(music.artist||music.composer||'Project SEKAI')+' · 選擇難度後直接打歌';
  const row=music?.difficulties?.[next]||{};
  if($('dojoSelectedBpm'))$('dojoSelectedBpm').textContent=music.bpm||music.bpmMin||'—';
  if($('dojoSelectedNotes'))$('dojoSelectedNotes').textContent=row.totalNoteCount||row.noteCount||'—';
  if($('dojoSelectedNps')){
    const sec=num(music.duration||music.musicTime,0);
    const notes=num(row.totalNoteCount||row.noteCount,0);
    $('dojoSelectedNps').textContent=sec>0&&notes>0?(notes/sec).toFixed(2):'—';
  }
  const box=$('dojoDifficultyButtons');
  if(box)box.innerHTML=DIFFS.filter(d=>music?.difficulties?.[d]).map(d=>'<button type="button" class="'+(d===next?'active':'')+'" data-dojo-diff="'+d+'">'+DIFF_LABEL[d]+'</button>').join('');
  try{localStorage.setItem('pjsekai-chart-last-song',String(music.id));}catch(_){}
  if(state.prepared && Number(state.prepared.music.id)!==Number(music.id))state.prepared=null;
  state.uiDifficulty=next;
  renderDojoSelection();
}
function renderDifficultyButtons(music){
  const box=$('dojoDifficultyButtons');
  if(!box)return;
  const available=new Set((state.difficulties||[]).filter(d=>Number(d.musicId)===Number(music?.id)).map(d=>String(d.musicDifficulty).toLowerCase()));
  const supported=DIFFS.filter(d=>available.size?available.has(d):true);
  box.innerHTML=supported.map((d,i)=>'<button type="button" class="dojo-difficulty-btn '+(d===selectedSong().difficulty?'active':'')+'" data-dojo-diff="'+d+'">'+DIFF_LABEL[d]+(available.size?(function(){const x=state.difficulties.find(v=>Number(v.musicId)===Number(music.id)&&String(v.musicDifficulty).toLowerCase()===d);return x?' · '+x.playLevel:''})():'')+'</button>').join('');
  box.querySelectorAll('[data-dojo-diff]').forEach(btn=>btn.addEventListener('click',()=>{
    box.querySelectorAll('[data-dojo-diff]').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const s=appState();s.dojo.selectedDifficulty=btn.dataset.dojoDiff;try{B.save();}catch(_){}
    prepareSelection().then(()=>showGameReady('準備完成 · 按「開始打歌」')).catch(e=>showGameError(e?.message||'譜面載入失敗'));
  }));
}
function renderSongList(){
  const box=$('dojoSongList');if(!box||!Array.isArray(state.songs))return;
  const q=String($('dojoSongSearch')?.value||'').trim().toLowerCase();
  const filtered=state.songs.filter(m=>!q||String(m.title||'').toLowerCase().includes(q)||String(m.composer||'').toLowerCase().includes(q)||String(m.lyricist||'').toLowerCase().includes(q));
  const list=filtered.slice(0,120);
  box.innerHTML=list.map(m=>'<button type="button" class="dojo-song-option '+(String(m.title).toLowerCase()===String(selectedSong().title).toLowerCase()?'active':'')+'" data-dojo-song-id="'+m.id+'"><strong>'+String(m.title||'').replace(/[&<>"]/g,'')+'</strong><span>'+String(m.composer||m.lyricist||'').replace(/[&<>"]/g,'')+'</span></button>').join('');
  if($('dojoSongCount'))$('dojoSongCount').textContent=filtered.length+' 首';
  box.querySelectorAll('[data-dojo-song-id]').forEach(btn=>btn.addEventListener('click',()=>{
    const m=state.songs.find(x=>String(x.id)===String(btn.dataset.dojoSongId));if(!m)return;
    if($('dojoSelectedTitle'))$('dojoSelectedTitle').textContent=m.title;
    if($('dojoSelectedMeta'))$('dojoSelectedMeta').textContent=(m.composer||'Project SEKAI')+' · BPM '+(m.bpm||'—');
    renderDifficultyButtons(m);
    const s=appState();s.dojo.selectedSong=m.title; s.dojo.selectedDifficulty='expert';try{B.save();}catch(_){}
    renderSongList();
    prepareSelection().then(()=>showGameReady('準備完成 · 按「開始打歌」')).catch(e=>showGameError(e?.message||'譜面載入失敗'));
  }));
  const clear=$('dojoClearSearch');if(clear&&!clear.dataset.bound){clear.dataset.bound='1';clear.addEventListener('click',()=>{$('dojoSongSearch').value='';renderSongList();});}
  const search=$('dojoSongSearch');if(search&&!search.dataset.bound){search.dataset.bound='1';search.addEventListener('input',renderSongList);}
}
async function prepareSelection(){
  await loadData();
  const {music,difficulty}=musicBySelection(state.songs);
  if(!music)throw new Error('找不到預設歌曲資料');
  if($('dojoSelectedTitle')&&($('dojoSelectedTitle').textContent.trim()==='尚未選擇歌曲'))$('dojoSelectedTitle').textContent=music.title;
  if($('dojoSelectedMeta'))$('dojoSelectedMeta').textContent=(music.composer||'Project SEKAI')+' · BPM '+(music.bpm||'—');
  renderDifficultyButtons(music);
  renderSongList();
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
  if(state.ctx)return;
  const wrap=$('dojoGameStageWrap'),canvas=$('dojoGameCanvas');
  if(!wrap||!canvas)throw new Error('Dojo 遊戲畫面初始化失敗');
  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!ctx)throw new Error('此瀏覽器不支援 Canvas 2D');
  state.ctx=ctx;state.canvas=canvas;state.renderMode='2d';
  const resize=()=>{
    const rect=wrap.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr));
    canvas.height=Math.max(1,Math.round(rect.height*dpr));
    canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  resize();
  if(window.ResizeObserver){const ro=new ResizeObserver(resize);ro.observe(wrap);state.resizeObserver=ro;}
  else window.addEventListener('resize',resize,{passive:true});
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
function roundNote2d(ctx,x,y,w,color,alpha){
  const r=Math.min(6,w*.25);
  ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();
  ctx.roundRect(x-w/2,y-6,w,12,r);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.28)';ctx.roundRect(x-w/2,y-3,w,3,2);ctx.fill();ctx.globalAlpha=1;
}
function drawScene(now){
  const ctx=state.ctx;if(!ctx)return;
  const g=laneGeom(),w=g.w,h=g.h;
  ctx.clearRect(0,0,w,h);
  const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0b1020');bg.addColorStop(1,'#151a2a');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='rgba(5,9,20,.74)';
  ctx.beginPath();ctx.moveTo(g.topL,g.topY);ctx.lineTo(g.topR,g.topY);ctx.lineTo(g.bottomR,g.hitY);ctx.lineTo(g.bottomL,g.hitY);ctx.closePath();ctx.fill();
  for(let i=0;i<=12;i++){
    const x1=laneEdge(i,0,g),x2=laneEdge(i,1,g);
    ctx.strokeStyle=i===0||i===12?'rgba(190,205,235,.45)':'rgba(183,198,231,.18)';
    ctx.lineWidth=i===0||i===12?2:1;
    ctx.beginPath();ctx.moveTo(x1,g.topY);ctx.lineTo(x2,g.hitY);ctx.stroke();
  }
  ctx.strokeStyle='rgba(102,227,255,.82)';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(g.bottomL,g.hitY);ctx.lineTo(g.bottomR,g.hitY);ctx.stroke();
  const settings=appState().dojo,lead=state.leadTime;
  for(const note of state.notes){
    const primaryDelta=note.hit-now,tailDelta=note.kind==='hold'?note.end-now:null;
    if(note.kind==='hold'){
      const headP=1-clamp(primaryDelta/lead,0,1),tailP=1-clamp(tailDelta/lead,0,1);
      if(tailDelta<-JUDGE.bad||primaryDelta>lead)continue;
      const xh=laneX(note.lane,headP,g),xe=laneX(note.path?.at(-1)?.lane??note.lane,tailP,g);
      const wh=Math.max(8,(g.bottomR-g.bottomL)/12*note.width*.72);
      ctx.fillStyle=note.started?'rgba(98,220,161,.66)':'rgba(98,220,161,.44)';
      ctx.beginPath();ctx.moveTo(xh-wh/2,g.topY+(1-headP)*(g.hitY-g.topY));ctx.lineTo(xh+wh/2,g.topY+(1-headP)*(g.hitY-g.topY));ctx.lineTo(xe+wh/2,g.topY+(1-tailP)*(g.hitY-g.topY));ctx.lineTo(xe-wh/2,g.topY+(1-tailP)*(g.hitY-g.topY));ctx.closePath();ctx.fill();
      const headY=g.topY+(1-headP)*(g.hitY-g.topY);
      roundNote2d(ctx,xh,headY,wh,note.critical?'#ffd34f':'#62dca1',.96);
      continue;
    }
    if(primaryDelta<-JUDGE.bad||primaryDelta>lead)continue;
    const p=1-clamp(primaryDelta/lead,0,1);
    if(settings.sudden&&p<.28)continue;
    const x=laneX(note.lane,p,g),y=g.topY+(1-p)*(g.hitY-g.topY),wh=Math.max(10,(g.bottomR-g.bottomL)/12*note.width*.72);
    const col=note.flick?'#ff6f91':(note.critical?'#ffd34f':'#58d6ef');
    const alpha=settings.hidden?clamp(p/.8,.18,1):1;
    roundNote2d(ctx,x,y,wh,col,.96*alpha);
    if(note.flick){ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-wh*.2,y);ctx.lineTo(x+wh*.2,y);ctx.stroke();}
  }
}
function spawnEffect(kind){
  const g=laneGeom(),color=kind==='PERFECT'?'#74e6ff':kind==='GREAT'?'#8fe6b8':kind==='GOOD'?'#ffd34f':'#ff6f91';
  state.effects.push({created:performance.now(),color,x:g.w/2,y:g.hitY});
}
function drawEffects(){
  const ctx=state.ctx;if(!ctx)return;
  const now=performance.now();
  state.effects=state.effects.filter(e=>now-e.created<420);
  for(const e of state.effects){
    const age=(now-e.created)/420,r=18+age*55;
    ctx.globalAlpha=1-age;ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
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
  $('dojoOpenPracticeBtn')?.addEventListener('click',()=>{
    if(state.finished){startGame();return;}
    if(state.prepared&&state.audio.src){togglePause();return;}
    startGame();
  });
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
    await loadData();
    renderDojoSelection();
    if(!state.uiSongId)state.uiSongId=Number(localStorage.getItem('pjsekai-chart-last-song')||1)||1;
    setUiSelection(state.uiSongId,state.uiDifficulty||'expert');
    await initPixi();
    setLoading('正在準備預設歌曲…');
    await prepareSelection();
    showGameReady('準備完成 · 按「開始打歌」即可進入遊玩');
  }catch(e){
    showGameError(e?.message||'Dojo 初始化失敗');
  }
  $('dojoSongList')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-dojo-local-song]');if(!b)return;
    setUiSelection(b.dataset.dojoLocalSong,state.uiDifficulty||'expert');
  });
  $('dojoDifficultyButtons')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-dojo-diff]');if(!b)return;
    setUiSelection(state.uiSongId,b.dataset.dojoDiff);
    schedulePrepare();
  });
  ['dojoSongSearch','dojoAttrFilter','dojoBpmFilter'].forEach(id=>$(id)?.addEventListener('input',renderDojoSelection));
  $('caSongList')?.addEventListener('click',()=>schedulePrepare());
  $('caDetail')?.addEventListener('click',e=>{if(e.target.closest('[data-ca-diff]'))schedulePrepare();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();