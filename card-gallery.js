/* Stage 4 — Card Gallery 41-60 */
(function(){
'use strict';
const APP=window.__PJSEKAI_APP__;
if(!APP)return;
const $=id=>document.getElementById(id);
const RAW='https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/';
const ASSET='https://storage.sekai.best/sekai-jp-assets/';
const API='https://api.sekai.best/api/v1';
const CACHE='pjsekaiCardGallery:v2';
const PAGE=24;
const MASTER_BONUS={rarity_1:150,rarity_2:300,rarity_3:450,rarity_birthday:540,rarity_4:600,rarity_5:600};
const REGIONS=[['jp','日本語/Japan'],['tw','繁體中文/TW'],['en','English/Global'],['kr','한국어/Korea'],['cn','简体中文/CN']];
const ATTR_LABEL={cute:'Cute',cool:'Cool',pure:'Pure',happy:'Happy',mysterious:'Mysterious'};
const UNIT_LABEL={light_sound:'Leo/need',idol:'MORE MORE JUMP!',street:'Vivid BAD SQUAD',theme_park:'Wonderlands×Showtime',school_refusal:'25時、ナイトコードで。',piapro:'Virtual Singer'};
let data=null, filtered=[], page=1, selected=null, trained=false, source='raw';

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function fmt(v){return n(v).toLocaleString('en-US');}
function date(v){if(v===null||v===undefined||v==='')return '—';const d=new Date(typeof v==='number'?v:(String(v).match(/^\d+$/)?Number(v):v));return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('zh-TW');}
function rarityLabel(r){const s=String(r||'').toLowerCase();if(s.includes('birthday'))return '生日';const m=s.match(/(\d+)/);return m?m[1]+'★':s||'—';}
function rarityStars(r){const s=String(r||'').toLowerCase();return s.includes('birthday')?'🎂':(s.match(/\d+/)?.[0]||'');}
function attrLabel(a){const k=String(a||'').toLowerCase();return ATTR_LABEL[k]||a||'—';}
function unitLabel(u){const k=String(u||'').toLowerCase();return UNIT_LABEL[k]||u||'—';}
function cardBundle(c){return c?.assetbundleName||c?.assetBundleName||'';}
function titleOf(c){return c?.prefix||c?.name||c?.title||('#'+c?.id);}
function idOf(c){return String(c?.id??c?.cardId??'');}
function skillText(c){const s=c?.skill;return s?.description||s?.shortDescription||c?.skillDescription||c?.skill?.name||'未提供技能文字';}
function cardArt(c,isTrained=false,kind='small'){const b=cardBundle(c);if(!b)return '';const suffix=isTrained?'after_training':'normal';if(kind==='cutout')return ASSET+'character/member_cutout/'+encodeURIComponent(b)+'/'+suffix+'.png';if(kind==='full')return ASSET+'character/member/'+encodeURIComponent(b)+'/card_'+suffix+'.png';if(kind==='gacha')return ASSET+'character/member_gacha/'+encodeURIComponent(b)+'/'+suffix+'.png';return ASSET+'thumbnail/chara/'+encodeURIComponent(b)+'_'+suffix+'.webp';}
function getParams(c){const p=c?.cardParameters||c?.card_parameters||c?.params; if(!p)return []; if(Array.isArray(p))return p; const out=[]; for(const [key,arr] of Object.entries(p||{})){if(!Array.isArray(arr))continue;const m=String(key).match(/param(\d)/i);if(!m)continue;for(let i=0;i<arr.length;i++){let row=out.find(x=>x.level===i+1);if(!row){row={level:i+1,p1:0,p2:0,p3:0};out.push(row)}row['p'+m[1]]=n(arr[i]);}}return out;}
function normalizedParams(c){const rows=getParams(c);const map=new Map();for(const row of rows){const level=n(row.cardLevel??row.level);if(!level)continue;const type=String(row.cardParameterType||row.type||'').toLowerCase();const power=n(row.power??row.value);let p=map.get(level)||{level,p1:0,p2:0,p3:0};if(type.includes('1')||type.includes('performance'))p.p1=power;else if(type.includes('2')||type.includes('technique'))p.p2=power;else if(type.includes('3')||type.includes('stamina'))p.p3=power;else {if(row.p1!==undefined)p.p1=n(row.p1);if(row.p2!==undefined)p.p2=n(row.p2);if(row.p3!==undefined)p.p3=n(row.p3)}map.set(level,p);}return [...map.values()].sort((a,b)=>a.level-b.level).map(r=>({...r,total:r.p1+r.p2+r.p3}));}
function maxLevel(c){const rar=String(c?.cardRarityType||c?.rarityType||'').toLowerCase();return rar==='rarity_4'?60:rar==='rarity_3'?50:rar==='rarity_birthday'?60:rar==='rarity_2'?30:20;}
function trainedTalent(c){const rows=normalizedParams(c);const target=maxLevel(c);let exact=rows.find(x=>x.level===target);if(!exact)exact=rows[rows.length-1];return exact?.total||0;}
function rank5Talent(c){return trainedTalent(c)+MASTER_BONUS[String(c?.cardRarityType||c?.rarityType||'').toLowerCase()]*5;}
function characterName(c){if(c?.character?.name)return c.character.name;if(c?.characterName)return c.characterName;return c?.character?.firstName&&c?.character?.givenName?c.character.firstName+' '+c.character.givenName:'';}
function normalizeCard(c){return {...c,id:idOf(c),prefix:titleOf(c),assetbundleName:cardBundle(c),cardRarityType:c?.cardRarityType||c?.rarityType||c?.cardRarity?.cardRarityType||'',characterName:characterName(c),unit:c?.unit||c?.character?.unit||'',attr:c?.attr||c?.attribute||'',releaseAt:c?.releaseAt??c?.release_at,skillKey:c?.skillKey||c?.skill?.name||'',skill:c?.skill||null,cardParameters:c?.cardParameters||c?.card_parameters||null};}
async function fetchJson(url){const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function loadRaw(){
  const urls={cards:RAW+'cards.json',episodes:RAW+'cardEpisodes.json',costumes:RAW+'cardCostume3ds.json',rarities:RAW+'cardRarities.json',supplies:RAW+'cardSupplies.json'};
  const [cards,episodes,costumes,rarities,supplies]=await Promise.all(Object.values(urls).map(fetchJson));
  return {cards:Array.isArray(cards)?cards.map(normalizeCard):[],episodes:Array.isArray(episodes)?episodes:[],costumes:Array.isArray(costumes)?costumes:[],rarities:Array.isArray(rarities)?rarities:[],supplies:Array.isArray(supplies)?supplies:[]};
}
async function loadApi(){
  const all=[];for(let p=1;p<=80;p++){const url=API+'/cards/jp/list?page='+p+'&page_size=100&spoiler=false&sort_by=releaseAt&sort_order=desc';const x=await fetchJson(url);const items=x?.items||x?.data?.items||x?.cards||x?.data||[];if(!Array.isArray(items)||!items.length)break;all.push(...items.map(normalizeCard));const pg=x?.pagination||x?.meta?.pagination||{};if(pg.hasNext===false||(pg.has_next===false)||items.length<100)break;}if(!all.length)throw new Error('API returned no cards');return {cards:all,episodes:[],costumes:[],rarities:[],supplies:[]};}
async function load(){
  const cached=sessionStorage.getItem(CACHE);if(cached){try{data=JSON.parse(cached);source=data._source||'raw';return}catch(_){}}
  try{data=await loadApi();source='api'}catch(_){data=await loadRaw();source='raw'}
  data._source=source;try{sessionStorage.setItem(CACHE,JSON.stringify(data));}catch(_){}
}
function renderFilters(){
  const unit=new Set(),char=new Set(),attr=new Set(),rar=new Set(),skill=new Set();
  for(const c of data.cards){if(c.unit)unit.add(unitLabel(c.unit));if(characterName(c))char.add(characterName(c));if(c.attr)attr.add(String(c.attr));if(c.cardRarityType)rar.add(String(c.cardRarityType));const sk=String(c.skillKey||'').toLowerCase();if(sk)skill.add(sk);}
  const fill=(id,arr,labels)=>{$(id).innerHTML='<option value="">全部</option>'+[...arr].sort((a,b)=>String(a).localeCompare(String(b))).map(v=>'<option value="'+esc(v)+'">'+esc(labels?labels(v):v)+'</option>').join('');};
  fill('cgpUnit',unit);fill('cgpCharacter',char);fill('cgpAttr',attr,attrLabel);fill('cgpRarity',rar,rarityLabel);fill('cgpSkill',skill);
}
function matches(c){
  const q=String($('cgpSearch')?.value||'').trim().toLowerCase(),unit=$('cgpUnit')?.value||'',char=$('cgpCharacter')?.value||'',attr=$('cgpAttr')?.value||'',rar=$('cgpRarity')?.value||'',skill=$('cgpSkill')?.value||'';
  const hay=(titleOf(c)+' '+idOf(c)+' '+characterName(c)+' '+unitLabel(c.unit)+' '+skillText(c)).toLowerCase();
  if(q&&!hay.includes(q))return false;if(unit&&unitLabel(c.unit)!==unit)return false;if(char&&characterName(c)!==char)return false;if(attr&&String(c.attr)!==attr)return false;if(rar&&String(c.cardRarityType)!==rar)return false;if(skill&&String(c.skillKey||'').toLowerCase()!==skill)return false;
  const fav=($('cgpFavOnly')?.checked);if(fav&&!APP.getState?.().favorites?.cards?.includes?.(idOf(c)))return false;
  return true;
}
function renderCards(){
  if(!data)return;
  filtered=data.cards.filter(matches);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE));page=Math.min(page,pages);
  const box=$('cgpGrid');const slice=filtered.slice((page-1)*PAGE,page*PAGE);
  $('cgpCount').textContent=fmt(filtered.length)+' 張';$('cgpSource').textContent=source==='api'?'Master API':'Sekai-World master DB fallback';
  $('cgpPageInfo').textContent=page+' / '+pages;
  box.innerHTML=slice.length?slice.map(c=>'<article class="card-gallery-card" data-card-id="'+esc(idOf(c))+'"><img class="card-gallery-art" loading="lazy" src="'+esc(cardArt(c,false,'small'))+'" onerror="this.src=\''+esc(cardArt(c,false,'full'))+'\';this.onerror=null" alt="'+esc(titleOf(c))+'"><div class="card-gallery-card-body"><div class="card-gallery-card-title">'+esc(titleOf(c))+'</div><div class="card-gallery-meta"><span class="card-gallery-pill star">'+esc(rarityStars(c.cardRarityType)+' '+rarityLabel(c.cardRarityType))+'</span><span class="card-gallery-pill">'+esc(attrLabel(c.attr))+'</span><span class="card-gallery-pill">'+esc(unitLabel(c.unit))+'</span></div><div class="card-gallery-card-foot"><span>#'+esc(idOf(c))+'</span><span>'+esc(date(c.releaseAt))+'</span></div></div></article>').join(''):'<div class="card-gallery-empty">沒有符合條件的卡牌。清除部分篩選後再試。</div>';
}
function renderListInfo(c){
  const rows=normalizedParams(c), lvl1=rows.find(x=>x.level===1), max=maxLevel(c), maxRow=rows.find(x=>x.level===max)||rows[rows.length-1];
  const skill=skillText(c), rarity=String(c.cardRarityType||'').toLowerCase(), mr=MASTER_BONUS[rarity]||0;
  const episodes=data.episodes.filter(e=>String(e.cardId??e.card_id)===idOf(c));
  const costumes=data.costumes.filter(e=>String(e.cardId)===idOf(c));
  $('cgdContent').innerHTML=`
    <div class="card-gallery-detail">
      <div class="card-gallery-art-stage">
        <img id="cgdMainArt" class="card-gallery-main-art" src="${esc(cardArt(c,false,'full'))}" alt="${esc(titleOf(c))}">
        <div class="card-gallery-art-switch">
          <button class="active" data-art="normal">覺醒前原畫</button>
          <button data-art="trained">覺醒後原畫</button>
          <button data-art="cutout">去背立繪</button>
        </div>
        <div class="card-gallery-actions">
          <button class="card-gallery-btn primary" id="cgdDownload">⬇ 下載目前圖片</button>
          <a class="card-gallery-btn" target="_blank" rel="noopener" href="${esc(cardArt(c,false,'full'))}">↗ 開啟 PNG</a>
        </div>
      </div>
      <div class="card-gallery-info">
        <section class="card-gallery-info-card"><h4>${esc(titleOf(c))}</h4>
          <div class="card-gallery-data-grid">
            <div><small>Card ID</small><strong>#${esc(idOf(c))}</strong></div><div><small>角色</small><strong>${esc(characterName(c)||'—')}</strong></div>
            <div><small>稀有度</small><strong>${esc(rarityLabel(c.cardRarityType))}</strong></div><div><small>屬性</small><strong>${esc(attrLabel(c.attr))}</strong></div>
            <div><small>團體</small><strong>${esc(unitLabel(c.unit))}</strong></div><div><small>實裝日期</small><strong>${esc(date(c.releaseAt))}</strong></div>
            <div><small>Lv.1 綜合力</small><strong>${esc(fmt(lvl1?.total||0))}</strong></div><div><small>滿級上限</small><strong>${esc(fmt(maxRow?.total||0))}</strong></div>
            <div><small>MR Lv.5 估算上限</small><strong>${esc(fmt((maxRow?.total||0)+mr*5))}</strong></div><div><small>最高 Skill Lv.</small><strong>${esc(fmt(c?.maxSkillLevel||4))}</strong></div>
          </div>
        </section>
        <section class="card-gallery-info-card"><h4>技能</h4><div class="card-gallery-skill">${esc(skill)}</div><div class="card-gallery-formula">技能詳細數值與秒數以 master data 的 skill effect / detail 為準。若目前卡片資料只提供 skill key，本卡不猜測官方公式。</div></section>
        <section class="card-gallery-info-card"><h4>特訓與素材</h4><div class="card-gallery-row"><span>3★/4★ 可特訓</span><strong>${['rarity_3','rarity_4'].includes(rarity)?'是':'否'}</strong></div><div class="card-gallery-row"><span>特訓後最高等級</span><strong>${esc(max)}</strong></div><div class="card-gallery-note">特訓資源需依屬性與稀有度計算；此畫廊會優先顯示 master data 中的明確成本，缺少對應資料時不填假數值。</div></section>
        <section class="card-gallery-info-card"><h4>3D Costume</h4><div class="card-gallery-costume">${costumes.length?costumes.map(x=>'<div class="card-gallery-row"><span>Costume 3D ID</span><strong>#'+esc(x.costume3dId)+'</strong></div>').join(''):'<div class="card-gallery-note">Master DB 沒有直接綁定 Costume 3D。</div>'}</div><div class="card-gallery-note">Costume variant 的解鎖狀態依 Master Rank 與卡片類型而定；本頁不把不存在的服裝資料當成已解鎖。</div></section>
        <section class="card-gallery-info-card"><h4>Side Story / Episodes</h4><div class="card-gallery-episode">${episodes.length?episodes.map(x=>'<div class="card-gallery-row"><span>'+esc(x.title||x.name||('Episode '+(x.episodeNo||'')))+'</span><strong>'+esc(x.id||'')+'</strong></div>').join(''):'<div class="card-gallery-note">此卡未在目前同步的 cardEpisodes 資料中找到。</div>'}</div></section>
        <section class="card-gallery-info-card"><h4>實裝與卡池</h4><div class="card-gallery-history"><div class="card-gallery-row"><span>實裝</span><strong>${esc(date(c.releaseAt))}</strong></div><div class="card-gallery-row"><span>供給類型</span><strong>${esc(c.cardSupplyType||'—')}</strong></div><div class="card-gallery-note">卡池歷史需要 gacha-card 關聯資料；此版本在可取得關聯時顯示，否則提供卡片實裝日與供給類型，不猜卡池。</div></div></section>
      </div>
    </div>`;
  $('cgdDownload').onclick=()=>{const src=$('cgdMainArt').src;const a=document.createElement('a');a.href=src;a.download='card-'+idOf(c)+(trained?'-after_training':'-normal')+'.png';a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();};
  document.querySelectorAll('[data-art]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-art]').forEach(x=>x.classList.toggle('active',x===btn));const k=btn.dataset.art;trained=k==='trained';$('cgdMainArt').src=k==='normal'?cardArt(c,false,'full'):k==='trained'?cardArt(c,true,'full'):cardArt(c,trained,'cutout');$('cgdMainArt').alt=titleOf(c)+' '+k;});
}
function openCard(c){selected=c;trained=false;$('cgdTitle').textContent=titleOf(c);$('cgdModal').classList.add('open');document.body.style.overflow='hidden';renderListInfo(c);}
function closeCard(){$('cgdModal')?.classList.remove('open');document.body.style.overflow='';}
function buildUi(host){
  host.innerHTML=`
  <div class="card-gallery-shell">
    <section class="card-gallery-hero">
      <div class="card-gallery-kicker">STAGE 4 · CARD GALLERY / 41—60</div>
      <div class="card-gallery-head"><div><h2>卡面畫廊</h2><p>連接 Sekai-World master data 與官方資產儲存，提供完整檢索、覺醒前後、去背立繪、能力與培養資料。資料源不可用時會退回已知 master DB，不製造假資料。</p></div><span class="card-gallery-badge">MASTER DATA</span></div>
      <div class="card-gallery-tools">
        <div class="card-gallery-filter-grid">
          <div class="card-gallery-field wide"><label>搜尋卡名／角色／ID</label><input id="cgpSearch" placeholder="例如：Miku / 0310 / 咲希"></div>
          <div class="card-gallery-field"><label>團體</label><select id="cgpUnit"></select></div>
          <div class="card-gallery-field"><label>角色</label><select id="cgpCharacter"></select></div>
          <div class="card-gallery-field"><label>屬性</label><select id="cgpAttr"></select></div>
          <div class="card-gallery-field"><label>稀有度</label><select id="cgpRarity"></select></div>
          <div class="card-gallery-field"><label>技能類型/Key</label><select id="cgpSkill"></select></div>
          <label class="card-gallery-field" style="justify-content:end"><span style="font-size:7px;font-weight:900;color:#747b8d">收藏</span><span><input id="cgpFavOnly" type="checkbox" style="width:auto;margin-right:5px">只看收藏</span></label>
        </div>
        <div class="card-gallery-actions"><button class="card-gallery-btn primary" id="cgpLoad">↻ 同步卡牌資料</button><button class="card-gallery-btn" id="cgpClear">清除篩選</button><a class="card-gallery-btn" target="_blank" rel="noopener" href="https://sekai.best/cards/jp">↗ 開啟 Sekai Viewer</a></div>
        <div class="card-gallery-status"><span id="cgpCount">0 張</span> · 資料：<span id="cgpSource">未載入</span> · <span id="cgpStatus">等待同步</span></div>
      </div>
    </section>
    <section><div id="cgpGrid" class="card-gallery-grid"><div class="card-gallery-empty">正在準備卡牌資料…</div></div><div class="card-gallery-pages"><button id="cgpPrev">‹</button><span id="cgpPageInfo">1 / 1</span><button id="cgpNext">›</button></div></section>
  </div>
  <div class="card-gallery-modal" id="cgdModal" aria-hidden="true"><div class="card-gallery-dialog" role="dialog" aria-modal="true"><div class="card-gallery-dialog-head"><h3 id="cgdTitle">Card</h3><button class="card-gallery-close" id="cgdClose">×</button></div><div id="cgdContent"></div></div></div>`;
  bind(host);
}
function bind(host){
  ['cgpSearch','cgpUnit','cgpCharacter','cgpAttr','cgpRarity','cgpSkill','cgpFavOnly'].forEach(id=>$(id)?.addEventListener('input',()=>{page=1;renderCards();}));
  $('cgpClear')?.addEventListener('click',()=>{['cgpSearch','cgpUnit','cgpCharacter','cgpAttr','cgpRarity','cgpSkill'].forEach(id=>$(id).value='');$('cgpFavOnly').checked=false;page=1;renderCards();});
  $('cgpPrev')?.addEventListener('click',()=>{page=Math.max(1,page-1);renderCards();});
  $('cgpNext')?.addEventListener('click',()=>{const max=Math.max(1,Math.ceil(filtered.length/PAGE));page=Math.min(max,page+1);renderCards();});
  $('cgpGrid')?.addEventListener('click',e=>{const item=e.target.closest('[data-card-id]');if(item){const c=data.cards.find(x=>idOf(x)===item.dataset.cardId);if(c)openCard(c);}});
  $('cgdClose')?.addEventListener('click',closeCard);$('cgdModal')?.addEventListener('click',e=>{if(e.target.id==='cgdModal')closeCard();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('cgdModal')?.classList.contains('open'))closeCard();});
  $('cgpLoad')?.addEventListener('click',async()=>{try{sessionStorage.removeItem(CACHE);data=null;$('cgpStatus').textContent='同步中…';await load();renderFilters();renderCards();$('cgpStatus').textContent='已同步 '+fmt(data.cards.length)+' 張';}catch(e){$('cgpStatus').textContent='同步失敗：'+(e?.message||'unknown');}});
}
async function start(){
  const host=$('cardGalleryMount');if(!host)return;
  buildUi(host);
  try{await load();renderFilters();renderCards();$('cgpStatus').textContent='已載入 '+fmt(data.cards.length)+' 張';}
  catch(e){$('cgpGrid').innerHTML='<div class="card-gallery-empty">卡牌資料載入失敗：'+esc(e?.message||'unknown')+'。可稍後按「同步卡牌資料」重試。</div>';}
}
window.CardGallery={reload:()=>{sessionStorage.removeItem(CACHE);start();}};
start();
})();