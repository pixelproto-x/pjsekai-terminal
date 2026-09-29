/* Chart Analyzer v1 - Project SEKAI music/charts */
(function(){
'use strict';

const APP=window.__PJSEKAI_APP__;
const ROOT_ID='chartAnalyzerMount';
const DIFFS=['easy','normal','hard','expert','master','append'];
const LABELS={easy:'Easy',normal:'Normal',hard:'Hard',expert:'Expert',master:'Master',append:'Append'};
const COLORS={easy:'var(--cyan)',normal:'var(--green)',hard:'var(--yellow)',expert:'var(--orange)',master:'var(--pink)',append:'var(--violet)'};
const CACHE_KEY='pjsekai-chart-analyzer-cache-v1';
const CACHE_TTL=24*60*60*1000;
const SOURCES={
  musics:'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/master/musics.json',
  diffs:'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/master/musicDifficulties.json',
  apiList:'https://api.sekai.best/api/v1/musics/jp/list'
};

const state={
  songs:[],
  filtered:[],
  selected:null,
  selectedDiff:'expert',
  details:new Map(),
  search:'',
  unit:'',
  diffFilter:'',
  minLevel:'',
  maxLevel:'',
  votes:{}
};

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const arr=v=>Array.isArray(v)?v:(v&&typeof v==='object'?(v.items||v.results||v.data||[]):[]);
function fmtTime(sec){
  const n=Math.max(0,Math.round(num(sec,0))),m=Math.floor(n/60),s=n%60;
  return m+':'+String(s).padStart(2,'0');
}
function levelOf(song,diff){
  const d=song?.difficulties?.[diff];
  return num(d?.level??d?.playLevel,0);
}
function notesOf(song,diff){
  const d=song?.difficulties?.[diff];
  return num(d?.notes??d?.noteCount,0);
}
function unitText(song){
  return [song.unit,song.categories,song.category,song.group,song.groupName].filter(Boolean).join(' ');
}
function getApiItems(payload){
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.items))return payload.items;
  if(Array.isArray(payload?.results))return payload.results;
  if(Array.isArray(payload?.data))return payload.data;
  if(Array.isArray(payload?.music))return payload.music;
  return [];
}
function normalizeMusic(x,diffRows=[]){
  const id=num(x?.id??x?.musicId??x?.seq,0);
  if(!id)return null;
  const difficulties={};
  const rowList=Array.isArray(diffRows)?diffRows:[diffRows];
  rowList.filter(Boolean).forEach(d=>{
    const key=String(d.musicDifficulty??d.difficulty??d.name??'').toLowerCase();
    const mapped=key==='append'?'append':key==='master'?'master':key==='expert'?'expert':key==='hard'?'hard':key==='normal'?'normal':key==='easy'?'easy':'';
    if(mapped)difficulties[mapped]={
      level:num(d.playLevel??d.level,0),
      notes:num(d.noteCount??d.notes,0),
      raw:d
    };
  });
  if(x?.difficulties && typeof x.difficulties==='object'){
    Object.entries(x.difficulties).forEach(([k,d])=>{
      const mapped=k.toLowerCase();
      if(DIFFS.includes(mapped))difficulties[mapped]={
        ...difficulties[mapped],
        level:num(d.playLevel??d.level??difficulties[mapped]?.level,0),
        notes:num(d.noteCount??d.notes??difficulties[mapped]?.notes,0),
        raw:d
      };
    });
  }
  return {
    id,
    title:String(x.title??x.name??x.musicTitle??''),
    pronunciation:String(x.pronunciation??x.furigana??''),
    artist:String(x.artist??x.musicArtist??x.composer??''),
    lyricist:String(x.lyricist??''),
    composer:String(x.composer??''),
    arranger:String(x.arranger??''),
    unit:String(x.unit??x.unitName??''),
    categories:Array.isArray(x.categories)?x.categories.join(' / '):String(x.categories??x.category??''),
    releaseAt:String(x.releaseAt??x.releasedAt??x.releaseDate??x.publishedAt??''),
    duration:(()=>{const raw=num(x.duration??x.musicTime??x.length,0);return raw>1000&&raw<3600000?raw/1000:raw;})(),
    bpm:num(x.bpm??x.musicBpm??x.bpmMin,0),
    bpmMax:num(x.bpmMax??x.maxBpm??x.bpm,0),
    assetbundleName:String(x.assetbundleName??x.assetBundleName??''),
    jacket:String(x.jacket??x.jacketAssetbundleName??x.assetbundleName??''),
    difficulties
  };
}
function mergeSongs(musics,diffRows){
  const grouped=new Map();
  diffRows.forEach(d=>{
    const id=num(d?.musicId??d?.id,0);if(!id)return;
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id).push(d);
  });
  const out=musics.map(x=>normalizeMusic(x,grouped.get(num(x.id,0))||[])).filter(Boolean);
  return out.sort((a,b)=>a.id-b.id);
}
async function fetchJson(url,timeout=18000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{signal:c.signal,cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }finally{clearTimeout(t);}
}
function readCache(){
  try{
    const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(x?.ts && Date.now()-x.ts<CACHE_TTL && Array.isArray(x.songs))return x.songs;
  }catch(_){}
  return null;
}
function writeCache(songs){
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),songs}));}catch(_){}
}
async function loadSongs(){
  const cached=readCache();
  if(cached?.length)return cached;
  let apiSongs=[];
  try{
    const pages=[];
    for(let page=1;page<=8;page++){
      const payload=await fetchJson(SOURCES.apiList+'?page='+page+'&page_size=100&spoiler=false&sort_by=id&sort_order=asc');
      const items=getApiItems(payload);
      if(!items.length)break;
      pages.push(...items);
      if(items.length<100)break;
    }
    apiSongs=pages;
  }catch(_){}
  try{
    if(apiSongs.length){
      let diffRows=[];
      try{ const rawDiffs=await fetchJson(SOURCES.diffs); diffRows=arr(rawDiffs); }catch(_){}
      if(diffRows.length){
        const grouped=new Map();
        diffRows.forEach(d=>{const id=num(d?.musicId??d?.id,0);if(!id)return;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(d);});
        const normalized=apiSongs.map(x=>normalizeMusic(x,grouped.get(num(x.id,0))||[])).filter(Boolean);
        writeCache(normalized);
        return normalized;
      }
      const normalized=apiSongs.map(x=>normalizeMusic(x,[])).filter(Boolean);
      writeCache(normalized);
      return normalized;
    }
  }catch(_){}
  const [musics,diffs]=await Promise.all([fetchJson(SOURCES.musics),fetchJson(SOURCES.diffs)]);
  const merged=mergeSongs(arr(musics),arr(diffs));
  writeCache(merged);
  return merged;
}
function buildUI(){
  const mount=$(ROOT_ID);if(!mount)return;
  mount.innerHTML=
  '<section class="ca-shell">'+
    '<div class="ca-head">'+
      '<div><div class="ca-kicker">CHART ANALYZER · 76—85</div><h2>譜面分析器</h2><p>從 Project SEKAI 主資料庫載入歌曲與難度資料；選曲後可查看等級、Note Count、BPM、時長、NPS、難點熱點與 MV 入口。</p></div>'+
      '<div class="ca-status" id="caStatus">資料載入中…</div>'+
    '</div>'+
    '<div class="ca-toolbar">'+
      '<input id="caSearch" type="search" placeholder="搜尋歌曲 / 作曲 / 歌詞 / 歌手" autocomplete="off">'+
      '<select id="caUnit"><option value="">全部團體 / 類別</option></select>'+
      '<select id="caDiff"><option value="">全部難度</option>'+DIFFS.map(d=>'<option value="'+d+'">'+LABELS[d]+'</option>').join('')+'</select>'+
      '<input id="caMinLevel" type="number" min="1" max="40" placeholder="Lv ≥">'+
      '<input id="caMaxLevel" type="number" min="1" max="40" placeholder="Lv ≤">'+
      '<button class="ca-btn" id="caRefresh" type="button">↻ 更新資料</button>'+
    '</div>'+
    '<div class="ca-layout">'+
      '<div class="ca-list-panel"><div class="ca-list-head"><strong id="caCount">0 首</strong><span>點擊歌曲分析</span></div><div id="caSongList" class="ca-song-list"></div></div>'+
      '<div id="caDetail" class="ca-detail"><div class="ca-empty">選擇左側歌曲開始分析</div></div>'+
    '</div>'+
  '</section>';
}
function setStatus(text,ok=false){
  const el=$('caStatus');if(el){el.textContent=text;el.classList.toggle('ok',!!ok);}
}
function populateUnits(){
  const vals=new Set();
  state.songs.forEach(s=>{
    [s.unit,s.categories].forEach(v=>String(v||'').split(/[\/·,，|]/).map(x=>x.trim()).filter(Boolean).forEach(x=>vals.add(x)));
  });
  $('caUnit').innerHTML='<option value="">全部團體 / 類別</option>'+Array.from(vals).sort((a,b)=>a.localeCompare(b)).map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
}
function filterSongs(){
  const q=state.search.toLowerCase();
  const min=num(state.minLevel,0),max=num(state.maxLevel,999);
  state.filtered=state.songs.filter(s=>{
    const text=[s.title,s.pronunciation,s.artist,s.lyricist,s.composer,s.arranger,s.unit,s.categories].join(' ').toLowerCase();
    if(q&&!text.includes(q))return false;
    if(state.unit&&!unitText(s).includes(state.unit))return false;
    if(state.diffFilter && !state.songs.some(x=>x.id===s.id && levelOf(x,state.diffFilter)>0))return false;
    if(state.diffFilter){
      const lv=levelOf(s,state.diffFilter);if(lv<min || lv>max)return false;
    }else{
      const levels=DIFFS.map(d=>levelOf(s,d)).filter(Boolean);
      if(levels.length && Math.max(min,1)>Math.max(...levels))return false;
      if(max<Math.min(...levels))return false;
    }
    return true;
  });
  renderList();
}
function renderList(){
  const box=$('caSongList'),count=$('caCount');if(!box)return;
  count.textContent=state.filtered.length.toLocaleString('en-US')+' 首';
  box.innerHTML=state.filtered.slice(0,600).map(s=>{
    const master=levelOf(s,'master'),expert=levelOf(s,'expert');
    const active=state.selected?.id===s.id;
    return '<button type="button" class="ca-song '+(active?'active':'')+'" data-ca-song="'+s.id+'">'+
      '<span class="ca-jacket" style="background-image:url(\'https://storage.sekai.best/sekai-jp-assets/thumbnail/music/'+esc(s.assetbundleName||s.jacket)+'_normal.webp\')"></span>'+
      '<span class="ca-song-copy"><strong>'+esc(s.title||('Music #'+s.id))+'</strong><span>'+esc(s.artist||s.composer||'Project SEKAI')+'</span></span>'+
      '<span class="ca-mini-level">EX '+(expert||'—')+'<br>MAS '+(master||'—')+'</span>'+
    '</button>';
  }).join('') || '<div class="ca-empty small">沒有符合條件的歌曲</div>';
}
async function getDetail(song){
  if(state.details.has(song.id))return state.details.get(song.id);
  let detail=null;
  try{detail=await fetchJson('https://api.sekai.best/api/v1/musics/jp/'+song.id+'/detail');}catch(_){}
  let diffs=null;
  try{diffs=await fetchJson('https://api.sekai.best/api/v1/musics/jp/'+song.id+'/difficulties');}catch(_){}
  const merged={song,detail,diffs};
  state.details.set(song.id,merged);
  return merged;
}
function findDeep(obj,keys,depth=0){
  if(depth>4||obj==null)return null;
  if(typeof obj!=='object')return null;
  for(const k of Object.keys(obj)){
    if(keys.includes(k.toLowerCase()))return obj[k];
  }
  for(const v of Object.values(obj)){
    const found=findDeep(v,keys,depth+1);if(found!=null)return found;
  }
  return null;
}
function extractBreakdown(bundle,diff){
  const raw=findDeep(bundle,['notecounts','noteCounts','noteTypeCounts','notesByType','noteBreakdown','breakdown'],0);
  const base={tap:0,hold:0,flick:0,slide:0};
  const aliases={
    tap:['tap','tapcount','tapnotes'],
    hold:['hold','holdcount','holdnotes'],
    flick:['flick','flickcount','flicknotes'],
    slide:['slide','slidecount','slidenotes']
  };
  const scan=o=>{
    if(!o||typeof o!=='object')return;
    Object.entries(aliases).forEach(([type,names])=>names.forEach(name=>{
      const v=findDeep(o,[name]);if(v!=null&&Number.isFinite(Number(v)))base[type]=Math.max(base[type],num(v));
    }));
  };
  scan(raw);scan(bundle.diffs);scan(bundle.detail);
  const total=notesOf(bundle.song,diff);
  const sum=Object.values(base).reduce((a,b)=>a+b,0);
  return sum>0?{...base,total:sum}:null;
}
function extractTiming(bundle,diff){
  const candidates=[
    findDeep(bundle.detail,['timings','noteTimes','notes','timing']),
    findDeep(bundle.diffs,['timings','noteTimes','notes','timing'])
  ];
  for(const c of candidates){
    if(Array.isArray(c)){
      const times=c.map(x=>typeof x==='number'?x:num(x?.time??x?.timing??x?.startTime,NaN)).filter(Number.isFinite).sort((a,b)=>a-b);
      if(times.length>2)return times;
    }
  }
  return null;
}
function calcProjection(song,diff){
  const duration=Math.max(1,num(song.duration,0));
  const total=notesOf(song,diff);
  const bins=Math.min(60,Math.max(18,Math.ceil(duration/5)));
  const counts=Array.from({length:bins},()=>0);
  if(total>0)for(let i=0;i<total;i++){
    const x=i/Math.max(1,total-1);
    const wave=1+0.38*Math.sin(i*0.17)+0.18*Math.sin(i*0.043);
    const idx=Math.max(0,Math.min(bins-1,Math.floor(x*bins)));
    counts[idx]+=Math.max(0,wave);
  }
  const scale=total/(counts.reduce((a,b)=>a+b,0)||1);
  return counts.map(v=>v*scale);
}
function buildTimeline(song,diff,bundle,times){
  const duration=Math.max(1,num(song.duration,0));
  const raw=times||[];
  if(raw.length>2){
    const bins=Math.min(60,Math.max(18,Math.ceil(duration/5)));
    const width=duration/bins,counts=Array.from({length:bins},()=>0);
    raw.forEach(t=>{const i=Math.max(0,Math.min(bins-1,Math.floor(t/width)));counts[i]++;});
    return {counts,width,exact:true};
  }
  return {counts:calcProjection(song,diff),width:duration/Math.max(18,Math.min(60,Math.ceil(duration/5))),exact:false};
}
function renderTimeline(song,diff,bundle,times){
  const tl=buildTimeline(song,diff,bundle,times),peak=Math.max(...tl.counts,1),avg=tl.counts.reduce((a,b)=>a+b,0)/tl.counts.length;
  const html=tl.counts.map((v,i)=>{
    const ratio=v/peak,h=Math.max(4,Math.round(ratio*100));
    return '<span class="ca-bar '+(ratio>.76?'hot':'')+'" style="height:'+h+'%" title="'+fmtTime(i*tl.width)+' · '+Math.round(v)+' notes"></span>';
  }).join('');
  const nps=notesOf(song,diff)/Math.max(1,num(song.duration,0));
  return '<div class="ca-timeline"><div class="ca-bars">'+html+'</div><div class="ca-axis"><span>0:00</span><span>'+fmtTime(song.duration/2)+'</span><span>'+fmtTime(song.duration)+'</span></div><div class="ca-timeline-meta"><span>平均 NPS '+nps.toFixed(2)+'</span><span>峰值區間 '+Math.max(0,Math.round(tl.counts.indexOf(peak)*tl.width))+'s</span><span>'+(tl.exact?'原始時間點':'投影估算')+'</span></div></div>';
}
function renderBreakdown(bundle,diff){
  const bd=extractBreakdown(bundle,diff);
  if(!bd)return '<div class="ca-unavailable">目前公開譜面 metadata 沒有提供 Tap / Hold / Flick / Slide 分類欄位；已保留總 Note Count，並不虛構比例。</div>';
  const total=Math.max(1,bd.total);
  return '<div class="ca-breakdown">'+['tap','hold','flick','slide'].map(k=>'<div class="ca-type"><div><span>'+k.toUpperCase()+'</span><strong>'+bd[k]+'</strong><em>'+((bd[k]/total)*100).toFixed(1)+'%</em></div><i><b style="width:'+((bd[k]/total)*100).toFixed(1)+'%"></b></i></div>').join('')+'</div>';
}
function getVote(songId,diff){
  return state.votes[songId]?.[diff]||{over:0,normal:0,under:0};
}
function vote(songId,diff,key){
  state.votes[songId]=state.votes[songId]||{};
  const v=getVote(songId,diff);v[key]++;state.votes[songId][diff]=v;
  try{localStorage.setItem('pjsekai-chart-votes',JSON.stringify(state.votes));}catch(_){}
  renderDetail();
}
function votePanel(song,diff){
  const v=getVote(song.id,diff),sum=v.over+v.normal+v.under;
  return '<div class="ca-vote">'+
    '<div class="ca-vote-head"><div><strong>體感難度</strong><span>本機投票統計；不冒充全球社群數據</span></div><b>'+sum+' 票</b></div>'+
    '<div class="ca-vote-grid">'+
      '<button data-ca-vote="over">詐稱 <strong>'+v.over+'</strong></button>'+
      '<button data-ca-vote="normal">標準 <strong>'+v.normal+'</strong></button>'+
      '<button data-ca-vote="under">逆詐稱 <strong>'+v.under+'</strong></button>'+
    '</div></div>';
}
function difficultyTable(song){
  return '<div class="ca-diff-table">'+
    '<div class="ca-row ca-row-head"><span>難度</span><span>Lv</span><span>Notes</span><span>NPS</span></div>'+
    DIFFS.map(d=>{
      const n=notesOf(song,d),lv=levelOf(song,d);
      return lv?'<button type="button" class="ca-row '+(d===state.selectedDiff?'selected':'')+'" data-ca-diff="'+d+'"><span>'+LABELS[d]+'</span><span>'+lv+'</span><span>'+n.toLocaleString('en-US')+'</span><span>'+(n/Math.max(1,song.duration)).toFixed(2)+'</span></button>':'';
    }).join('')+'</div>';
}
function mvPanel(song){
  const search=encodeURIComponent((song.title||'')+' Project SEKAI MV');
  const current='';
  return '<div class="ca-mv">'+
    '<div class="ca-section-title"><strong>3D / 2D MV</strong><a href="https://www.youtube.com/results?search_query='+search+'" target="_blank" rel="noopener noreferrer">YouTube 搜尋 ↗</a></div>'+
    '<div class="ca-mv-row"><input id="caMvUrl" type="url" placeholder="貼上 YouTube 影片網址即可內嵌播放" value="'+esc(current)+'"><button class="ca-btn" id="caEmbedMv" type="button">嵌入</button></div>'+
    '<div id="caMvFrame" class="ca-mv-frame"><div>尚未指定影片</div></div>'+
  '</div>';
}
function renderDetail(){
  const box=$('caDetail'),song=state.selected,diff=state.selectedDiff;if(!box||!song)return;
  box.innerHTML='<div class="ca-detail-inner">'+
    '<div class="ca-detail-hero">'+
      '<div class="ca-detail-jacket" style="background-image:url(\'https://storage.sekai.best/sekai-jp-assets/thumbnail/music/'+esc(song.assetbundleName||song.jacket)+'_normal.webp\')"></div>'+
      '<div class="ca-detail-title"><div class="ca-chip">'+LABELS[diff]+'</div><h3>'+esc(song.title||'未命名歌曲')+'</h3><p>'+esc(song.artist||song.composer||'')+'</p><small>ID '+song.id+'</small></div>'+
      '<div class="ca-detail-metrics"><div><small>BPM</small><b>'+(song.bpmMax&&song.bpmMax!==song.bpm?esc(song.bpm)+'–'+esc(song.bpmMax):esc(song.bpm||'—'))+'</b></div><div><small>時長</small><b>'+fmtTime(song.duration)+'</b></div><div><small>Notes</small><b>'+notesOf(song,diff).toLocaleString('en-US')+'</b></div><div><small>NPS</small><b>'+(notesOf(song,diff)/Math.max(1,song.duration)).toFixed(2)+'</b></div></div>'+
    '</div>'+
    '<div class="ca-sections"><section><div class="ca-section-title"><strong>76 / 78 · 難度資料</strong><span>全難度 Level + Note Count</span></div>'+difficultyTable(song)+'</section>'+
    '<section><div class="ca-section-title"><strong>80 / 82 / 83 · 密度分析</strong><span>NPS · 高密度區 · 靜態長條圖</span></div><div id="caTimelineHolder"><div class="ca-loading">讀取詳細譜面資料…</div></div></section>'+
    '<section><div class="ca-section-title"><strong>79 · Note 類型比例</strong><span>Tap / Flick / Hold / Slide</span></div><div id="caBreakdownHolder" class="ca-loading">讀取中…</div></section>'+
    '<section>'+votePanel(song,diff)+'</section>'+
    '<section><div class="ca-section-title"><strong>85 · 歌曲資料</strong><span>實裝日期 / 創作者 / 分類</span></div><div class="ca-meta-grid">'+
      '<div><small>實裝日期</small><strong>'+esc(song.releaseAt?new Date(song.releaseAt).toLocaleString('zh-TW'):'資料未提供')+'</strong></div>'+
      '<div><small>作詞</small><strong>'+esc(song.lyricist||'資料未提供')+'</strong></div>'+
      '<div><small>作曲</small><strong>'+esc(song.composer||'資料未提供')+'</strong></div>'+
      '<div><small>編曲</small><strong>'+esc(song.arranger||'資料未提供')+'</strong></div>'+
      '<div><small>分類</small><strong>'+esc(song.categories||song.unit||'未分類')+'</strong></div>'+
      '<div><small>Artist</small><strong>'+esc(song.artist||'資料未提供')+'</strong></div>'+
    '</div></section>'+
    '<section><div class="ca-section-title"><strong>84 · MV 播放</strong><span>3D / 2D</span></div>'+mvPanel(song)+'</section>'+
    '<section><div class="ca-section-title"><strong>82 · 難點 Highlight</strong><span>依密度自動標記</span></div><div id="caHotspotHolder" class="ca-hotspots">分析中…</div></section>'+
    '</div></div>';
  wireDetail();
  loadDetailContent(song,diff);
}
async function loadDetailContent(song,diff){
  const bundle=await getDetail(song);
  const times=extractTiming(bundle,diff);
  $('caTimelineHolder').innerHTML=renderTimeline(song,diff,bundle,times);
  $('caBreakdownHolder').innerHTML=renderBreakdown(bundle,diff);
  const tl=buildTimeline(song,diff,bundle,times);
  const peak=Math.max(...tl.counts,0);
  const ranked=tl.counts.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0,5).filter(x=>x.v>0);
  $('caHotspotHolder').innerHTML=ranked.map(x=>{
    const start=Math.round(x.i*tl.width),end=Math.round((x.i+1)*tl.width);
    return '<span><b>'+start+'–'+end+'s</b><em>'+Math.round(x.v)+' notes</em><i>密度 '+(x.v/Math.max(1,tl.width)).toFixed(2)+' NPS</i></span>';
  }).join('')||'目前沒有足夠資料形成熱點';
}
function wireDetail(){
  document.querySelectorAll('[data-ca-diff]').forEach(b=>b.addEventListener('click',()=>{state.selectedDiff=b.dataset.caDiff;renderDetail();}));
  document.querySelectorAll('[data-ca-vote]').forEach(b=>b.addEventListener('click',()=>vote(state.selected.id,state.selectedDiff,b.dataset.caVote)));
  $('caEmbedMv')?.addEventListener('click',()=>{
    const raw=String($('caMvUrl').value||'').trim();
    const m=raw.match(/(?:v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
    if(!m){APP?.toast?.('請貼有效的 YouTube 影片網址');return;}
    $('caMvFrame').innerHTML='<iframe src="https://www.youtube.com/embed/'+m[1]+'" title="Project SEKAI MV" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  });
}
function loadVotes(){
  try{state.votes=JSON.parse(localStorage.getItem('pjsekai-chart-votes')||'{}')||{};}catch(_){state.votes={};}
}
async function selectSong(id){
  const s=state.songs.find(x=>x.id===Number(id));if(!s)return;
  state.selected=s;
  if(!levelOf(s,state.selectedDiff) || state.selectedDiff==='')state.selectedDiff=DIFFS.find(d=>levelOf(s,d))||'expert';
  renderList();renderDetail();
  try{localStorage.setItem('pjsekai-chart-last-song',String(s.id));}catch(_){}
  APP?.toast?.('已選擇：'+(s.title||'歌曲'));
}
function bind(){
  $('caSearch')?.addEventListener('input',e=>{state.search=e.target.value;filterSongs();});
  $('caUnit')?.addEventListener('change',e=>{state.unit=e.target.value;filterSongs();});
  $('caDiff')?.addEventListener('change',e=>{state.diffFilter=e.target.value;filterSongs();});
  $('caMinLevel')?.addEventListener('input',e=>{state.minLevel=e.target.value;filterSongs();});
  $('caMaxLevel')?.addEventListener('input',e=>{state.maxLevel=e.target.value;filterSongs();});
  $('caRefresh')?.addEventListener('click',async()=>{
    localStorage.removeItem(CACHE_KEY);setStatus('更新中…');
    try{state.songs=await loadSongs();populateUnits();filterSongs();setStatus('已同步 '+state.songs.length.toLocaleString('en-US')+' 首',true);}catch(_){setStatus('資料更新失敗，請稍後再試');}
  });
  $('caSongList')?.addEventListener('click',e=>{const b=e.target.closest('[data-ca-song]');if(b)selectSong(b.dataset.caSong);});
}
async function boot(){
  buildUI();loadVotes();bind();
  try{
    state.songs=await loadSongs();
    populateUnits();filterSongs();
    const remembered=num(localStorage.getItem('pjsekai-chart-last-song'),0);
    if(remembered)await selectSong(remembered);
    setStatus('已載入 '+state.songs.length.toLocaleString('en-US')+' 首歌曲資料',true);
  }catch(err){
    console.error('[Chart Analyzer]',err);
    setStatus('歌曲資料載入失敗');
    $('caSongList').innerHTML='<div class="ca-empty small">無法讀取公開歌曲資料。既有 Dojo 不受影響。</div>';
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();