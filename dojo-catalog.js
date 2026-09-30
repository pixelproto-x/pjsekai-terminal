/* Dojo catalog / song selector — data UI only. Gameplay runtime is dojo-webgl.js. */
(function(){
'use strict';

const MUSIC_URL='dojo-musics.json';
const VOCAL_URL='dojo-vocals.json';
const DIFFICULTY_URL='dojo-difficulties.json';
const DIFFS=['easy','normal','hard','expert','master','append'];
const DIFF_LABEL={easy:'Easy',normal:'Normal',hard:'Hard',expert:'Expert',master:'Master',append:'Append'};
const $=id=>document.getElementById(id);
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d;};

const C={
  songs:null,
  difficulties:null,
  vocals:null,
  uiSongId:0,
  uiDifficulty:'expert',
  bound:false
};

async function json(url){
  const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}

function escapeHtml(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getDifficultyForMusic(music){
  const available=DIFFS.filter(d=>!!music?.difficulties?.[d]);
  return available.includes('expert')?'expert':(available[available.length-1]||'expert');
}

async function loadData(){
  if(!C.songs){
    const [songs,difficulties]=await Promise.all([json(MUSIC_URL),json(DIFFICULTY_URL)]);
    C.songs=Array.isArray(songs)?songs:[];
    C.difficulties=Array.isArray(difficulties)?difficulties:[];
    const byMusic=new Map();
    for(const d of C.difficulties){
      const id=num(d.musicId,NaN);
      if(!Number.isFinite(id))continue;
      if(!byMusic.has(id))byMusic.set(id,{});
      const key=String(d.musicDifficulty||'').toLowerCase();
      if(DIFFS.includes(key))byMusic.get(id)[key]=d;
    }
    C.songs=C.songs.map(m=>({...m,difficulties:byMusic.get(num(m.id,NaN))||{}}));
  }
  if(!C.vocals){
    try{
      const vocals=await json(VOCAL_URL);
      C.vocals=Array.isArray(vocals)?vocals:[];
    }catch(_){C.vocals=[];}
  }
  if(!C.songs.length)throw new Error('歌曲資料載入失敗');
  window.__dojoHasCommittedVocals=Array.isArray(C.vocals)&&C.vocals.length>0;
}

function renderDojoSelection(){
  const list=$('dojoSongList');
  if(!list||!C.songs?.length)return;

  const q=String($('dojoSongSearch')?.value||'').trim().toLowerCase();
  const attr=String($('dojoAttrFilter')?.value||'').trim().toLowerCase();
  const diff=String($('dojoDifficultyFilter')?.value||'').trim().toLowerCase();
  const bpm=num($('dojoBpmFilter')?.value,0);
  const remembered=num(localStorage.getItem('pjsekai-chart-last-song'),1);

  if(!C.uiSongId)C.uiSongId=remembered||1;
  const filtered=C.songs.filter(m=>{
    const text=[m.title,m.artist,m.composer,m.lyricist,m.unit].join(' ').toLowerCase();
    const a=String(m.attr||m.attribute||m.unit||'').toLowerCase();
    const minBpm=num(m.bpm||m.bpmMin,0);
    const hasDifficulty=!diff||!!m?.difficulties?.[diff];
    return (!q||text.includes(q))&&(!attr||a.includes(attr))&&hasDifficulty&&(minBpm>=bpm);
  });

  const shown=filtered.slice(0,160);
  if($('dojoSongCount'))$('dojoSongCount').textContent=filtered.length.toLocaleString('en-US');
  list.innerHTML=shown.map(m=>{
    const active=num(m.id)===num(C.uiSongId);
    const artist=m.artist||m.composer||'Project SEKAI';
    return '<button type="button" class="dojo-song-row '+(active?'active':'')+'" data-dojo-local-song="'+escapeHtml(m.id)+'">'+
      '<strong>'+escapeHtml(m.title||'未命名歌曲')+'</strong>'+
      '<span>'+escapeHtml(artist)+'</span>'+
      '<em>'+escapeHtml(m.bpm||'—')+' BPM</em>'+
    '</button>';
  }).join('')||'<div class="search-empty">找不到符合條件的歌曲</div>';
}

function setUiSelection(id,difficulty){
  const music=C.songs?.find(x=>num(x.id)===num(id));
  if(!music)return;

  C.uiSongId=num(music.id);
  const requested=String(difficulty||'').toLowerCase();
  const next=DIFFS.includes(requested)&&music?.difficulties?.[requested] ? requested : getDifficultyForMusic(music);
  C.uiDifficulty=next;

  if($('dojoSelectedTitle'))$('dojoSelectedTitle').textContent=music.title||'未命名歌曲';
  if($('dojoSelectedMeta'))$('dojoSelectedMeta').textContent=(music.artist||music.composer||'Project SEKAI')+' · 選擇難度後直接打歌';
  if($('dojoSelectedBpm'))$('dojoSelectedBpm').textContent=music.bpm||music.bpmMin||'—';

  const row=music?.difficulties?.[next]||{};
  const noteCount=row.totalNoteCount||row.noteCount||'—';
  if($('dojoSelectedNotes'))$('dojoSelectedNotes').textContent=noteCount;

  if($('dojoSelectedNps')){
    const sec=num(music.duration||music.musicTime,0);
    const notes=num(row.totalNoteCount||row.noteCount,0);
    $('dojoSelectedNps').textContent=sec>0&&notes>0?(notes/sec).toFixed(2):'—';
  }

  const box=$('dojoDifficultyButtons');
  if(box){
    box.innerHTML=DIFFS.filter(d=>!!music?.difficulties?.[d])
      .map(d=>'<button type="button" class="'+(d===next?'active':'')+'" aria-pressed="'+(d===next)+'" data-dojo-diff="'+d+'">'+DIFF_LABEL[d]+'</button>')
      .join('');
  }

  try{localStorage.setItem('pjsekai-chart-last-song',String(music.id));}catch(_){}
  renderDojoSelection();

  window.__PJSEKAI_DOJO_CATALOG__?.onSelection?.({
    id:num(music.id),title:music.title||'',difficulty:next
  });
}

function selected(){
  const music=C.songs?.find(x=>num(x.id)===num(C.uiSongId))||C.songs?.[0];
  return {music,difficulty:C.uiDifficulty||getDifficultyForMusic(music)};
}

async function boot(){
  if(C.bound||!$('dojoSongList'))return;
  C.bound=true;
  try{
    await loadData();
    const remembered=num(localStorage.getItem('pjsekai-chart-last-song'),1);
    C.uiSongId=remembered&&C.songs.some(x=>num(x.id)===remembered)?remembered:num(C.songs[0]?.id,1);
    renderDojoSelection();
    setUiSelection(C.uiSongId,'expert');
    window.__PJSEKAI_DOJO_CATALOG__={
      state:C,
      getSelection:selected,
      render:renderDojoSelection,
      setSelection:setUiSelection
    };
  }catch(e){
    const list=$('dojoSongList');
    if(list)list.innerHTML='<div class="search-empty">歌曲資料載入失敗：'+escapeHtml(e.message||'未知錯誤')+'</div>';
    window.__PJSEKAI_DOJO_CATALOG__={state:C,error:e};
    console.warn('[Dojo catalog]',e);
  }

  $('dojoSongList')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-dojo-local-song]');
    if(!b)return;
    setUiSelection(b.dataset.dojoLocalSong,C.uiDifficulty);
  });

  $('dojoDifficultyButtons')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-dojo-diff]');
    if(!b)return;
    C.uiDifficulty=b.dataset.dojoDiff||'expert';
    setUiSelection(C.uiSongId,C.uiDifficulty);
  });

  ['dojoSongSearch','dojoAttrFilter','dojoDifficultyFilter','dojoBpmFilter'].forEach(id=>{
    const el=$(id);
    el?.addEventListener('input',renderDojoSelection);
    el?.addEventListener('change',renderDojoSelection);
  });

  $('dojoClearSearch')?.addEventListener('click',()=>{
    const search=$('dojoSongSearch');
    if(search)search.value='';
    renderDojoSelection();
    search?.focus();
  });
}

function startWhenReady(){
  const run=()=>boot();
  if(window.__PJSEKAI_APP__)run();
  else window.addEventListener('pjsekai-app-ready',run,{once:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startWhenReady,{once:true});
else startWhenReady();
})();