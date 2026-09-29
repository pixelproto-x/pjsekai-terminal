/* Stage 5 — Gacha Simulator 61-75 */
(function(){
'use strict';
const APP=window.__PJSEKAI_APP__; if(!APP)return;
const $=id=>document.getElementById(id);
const API='https://api.sekai.best/api/v1';
const CACHE='pjsekaiGachaSim:v2';
const LOGKEY='pjsekaiGachaHistory:v2';
const DEFAULT={region:'jp',gachaId:'',pullCost:300,tenCost:3000,crystals:60000,seals:0,sealTickets:0,sparkGoal:300,gachaBonus:0,history:[],pool:null};
let state=loadState(), current=null, cardsMap=new Map(), source='api';

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function fmt(v){return n(v).toLocaleString('en-US')}
function dtime(v){if(!v)return '—';const d=new Date(typeof v==='number'?v:(String(v).match(/^\d+$/)?Number(v):v));return Number.isNaN(d.getTime())?String(v):d.toLocaleString('zh-TW')}
function idOf(c){return String(c?.id??c?.cardId??'')}
function bundle(c){return c?.assetbundleName||c?.assetBundleName||''}
function art(c,tr=false){const b=bundle(c);return b?'https://storage.sekai.best/sekai-jp-assets/thumbnail/chara/'+encodeURIComponent(b)+'_'+(tr?'after_training':'normal')+'.webp':''}
function kind(g){const s=(String(g?.gachaType||'')+' '+String(g?.name||'')+' '+String(g?.summary||'')).toLowerCase();if(s.includes('fes')||s.includes('festival'))return 'fes';if(s.includes('birthday')||s.includes('anniversary'))return 'birthday';if(s.includes('rerun')||s.includes('復刻'))return 'rerun';return 'normal'}
function ratesFor(g){const rs=Array.isArray(g?.gachaCardRarityRates)?g.gachaCardRarityRates:[];const by={};rs.forEach(x=>{const k=String(x?.cardRarityType||'').toLowerCase();if(k)by[k]=n(x.rate)});const four=by.rarity_4??by.rarity4??(kind(g)==='fes'?6:3);const three=by.rarity_3??by.rarity3??8.5;return {four,three,two:Math.max(0,100-four-three)}}
function activeDate(g){const now=Date.now();const st=Date.parse(g?.startAt||g?.start_at||'');const en=Date.parse(g?.endAt||g?.end_at||'');return (!st||st<=now)&&(!en||en>=now)}
function loadState(){try{const x=JSON.parse(localStorage.getItem(LOGKEY)||'null');return {...DEFAULT,...(x&&typeof x==='object'?x:{})}}catch(_){return {...DEFAULT}}}
function persist(){try{localStorage.setItem(LOGKEY,JSON.stringify(state))}catch(_){}}
async function fetchJson(url){const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
async function loadGachas(){
 const items=[];
 for(let page=1;page<=100;page++){
  const x=await fetchJson(API+'/gachas/'+state.region+'/list?page='+page+'&page_size=100&spoiler=false&sort_by=startAt&sort_order=desc');
  const a=x?.items||x?.data?.items||[]; if(!Array.isArray(a)||!a.length)break; items.push(...a);
  const p=x?.pagination||{}; if(p.has_next===false||a.length<100)break;
 }
 if(!items.length)throw new Error('沒有取得卡池清單');
 return items;
}
async function loadGachaDetail(id){
 const x=await fetchJson(API+'/gachas/'+state.region+'/'+encodeURIComponent(id));
 return x?.data||x?.gacha||x;
}
async function loadCard(id){
 const k=String(id);if(cardsMap.has(k))return cardsMap.get(k);
 try{const x=await fetchJson(API+'/cards/'+state.region+'/'+encodeURIComponent(k));const c=x?.card||x?.data?.card||x?.data||x;cardsMap.set(k,c);return c}catch(_){cardsMap.set(k,null);return null}
}
async function enrichPool(g){
 const ids=new Set([...(g?.gachaPickups||[]).map(x=>idOf(x)).filter(Boolean),...(g?.gachaDetails||[]).map(x=>idOf(x)).filter(Boolean)]);
 const arr=[];for(const id of ids){const c=await loadCard(id);if(c)arr.push(c)}return arr;
}
function selectedGacha(){
 const raw=state.pool?.find?.(x=>idOf(x)===String(state.gachaId));return raw||null;
}
function mount(host){
 host.innerHTML=`
 <div class="gacha-pro">
  <section class="gacha-hero">
   <div class="gacha-kicker">STAGE 5 · GACHA SIMULATOR / 61—75</div>
   <div class="gacha-head"><div><h2>抽卡模擬器</h2><p>即時讀取卡池資料與提供割合，模擬單抽／十連、保底、Spark、Seal、抽卡紀錄與機率分析。</p></div><span class="gacha-badge">DATA DRIVEN</span></div>
   <div class="gacha-controls">
    <div class="gacha-field"><label>卡池</label><select id="gsGacha"><option value="">同步後選擇</option></select></div>
    <div class="gacha-field"><label>卡池類型</label><select id="gsType"><option value="all">全部</option><option value="normal">一般</option><option value="fes">Fes</option><option value="birthday">生日/紀念</option><option value="rerun">復刻</option></select></div>
    <div class="gacha-field"><label>目前水晶</label><input id="gsCrystals" type="number" min="0"></div>
    <div class="gacha-field"><label>目前 Gacha Seal</label><input id="gsSeals" type="number" min="0"></div>
   </div>
   <div class="gacha-actions"><button class="gacha-btn primary" id="gsSync">↻ 同步最新卡池</button><button class="gacha-btn" id="gsOpenViewer">↗ 開啟 Gacha Archive</button><button class="gacha-btn" id="gsReset">↺ 重設模擬器</button></div>
   <div class="gacha-status" id="gsStatus">尚未同步。</div>
  </section>
  <div class="gacha-grid">
   <section class="gacha-card span-12"><h3>61–64｜卡池同步與切換</h3><p>最新池會依 startAt 排序；歷史復刻、Fes、生日／紀念池皆可切換。詳細頁提供該池實際提供割合時，模擬器優先使用 API 數值。</p><div id="gsCurrentStatus" class="gacha-status">選擇一個卡池查看詳細資料。</div><div class="gacha-source">資料來源：Sekai master API 的 gachas list/detail。官方 FAQ 說明 birthday / anniversary 是特殊 rarity 與技能，Fes 類型的部分池 ★4 提供割合可達 6%。 citeturn457407search0</div></section>
   <section class="gacha-card">
    <h3>65–70｜1 抽／10 連＋官方式確定枠</h3><p>通常 10 連的第 10 格在前 9 格完全沒有 ★3 以上時進行「★3 以上」再抽；不把它誤寫成 ★4 保底。</p>
    <div class="gacha-actions"><button class="gacha-btn primary" id="gsSingle">✦ 1 Pull</button><button class="gacha-btn primary" id="gsTen">✦ 10 Pulls</button></div>
    <div class="gacha-metrics" style="margin-top:10px"><div class="gacha-metric"><small>本次花費</small><strong id="gsCost">0</strong></div><div class="gacha-metric"><small>累計抽數</small><strong id="gsTotalPulls">0</strong></div><div class="gacha-metric"><small>本池 ★4</small><strong id="gsFourCount">0</strong></div><div class="gacha-metric"><small>本池 ★3</small><strong id="gsThreeCount">0</strong></div></div>
    <div id="gsPulls" class="gacha-pulls" style="margin-top:10px"></div>
   </section>
   <section class="gacha-card">
    <h3>67–68｜3% / 8.5% ＋ Fes 6%</h3><p>介面顯示 API 的實際比例；若資料缺失，才使用一般池 3% / 8.5%、Fes 6% 的保守 fallback。</p>
    <table class="gacha-rate"><thead><tr><th>稀有度</th><th>提供割合</th><th>說明</th></tr></thead><tbody id="gsRates"></tbody></table>
    <div id="gsSpecial" class="gacha-status">—</div>
   </section>
   <section class="gacha-card span-12">
    <h3>69｜Pickup 卡面翻轉展示</h3><p>最新同步的 pickup 卡會直接顯示；每次結果點擊卡片可重新翻面查看。</p><div id="gsPickups" class="gacha-pickups"><div class="gacha-empty">尚未選擇卡池。</div></div>
   </section>
   <section class="gacha-card">
    <h3>70｜水晶／Seal 成本統計</h3>
    <div class="gacha-metrics"><div class="gacha-metric"><small>本次消耗</small><strong id="gsSpend">0</strong></div><div class="gacha-metric"><small>剩餘水晶</small><strong id="gsCrystalLeft">—</strong></div><div class="gacha-metric"><small>累計 Seal</small><strong id="gsSealTotal">0</strong></div><div class="gacha-metric"><small>Seal 券</small><strong id="gsTicketTotal">0</strong></div></div>
    <div class="gacha-note">官方 FAQ：通常每抽 1 張 Gacha Seal；Seal Ticket 可用於交換所，1 張等價 10 張 Seal，單次交換最多使用 10 張券。特殊池可能不發 Seal，以池公告為準。 citeturn129117search0</div>
   </section>
   <section class="gacha-card">
    <h3>71｜4★ 機率分析</h3>
    <div class="gacha-radar-wrap"><div class="gacha-luck"><div>模擬總抽數</div><strong id="gsLuckPulls">0</strong><div style="margin-top:8px">實際 ★4 率</div><strong id="gsLuckRate">0.00%</strong><div style="margin-top:8px">理論 ★4 率</div><strong id="gsTheoryRate">3.00%</strong></div><div class="gacha-donut" id="gsDonut"></div></div>
   </section>
   <section class="gacha-card span-12">
    <h3>72｜Gacha History</h3><div class="gacha-actions"><button class="gacha-btn" id="gsExportHistory">⇩ 匯出紀錄</button><button class="gacha-btn" id="gsClearHistory">清空紀錄</button></div><div id="gsHistory" class="gacha-history" style="margin-top:8px"><div class="gacha-empty">尚無紀錄。</div></div>
   </section>
   <section class="gacha-card">
    <h3>73｜Spark 進度</h3>
    <div class="gacha-progress-block"><div class="gacha-progress-label"><span>標準天井</span><strong id="gsSparkLabel">0 / 300</strong></div><div class="gacha-progress"><i id="gsSparkBar" style="width:0%"></i></div><div class="gacha-progress-label"><span>使用 10 張 Seal Ticket 後最低</span><strong>200 抽等值</strong></div></div>
    <div class="gacha-note">一般 Gacha Seal exchange 的 300 枚交換線，可搭配最多 10 張 Seal Ticket 降低實際水晶抽數；Ticket 每張按 10 Seal 等值計。 citeturn326368search1</div>
   </section>
   <section class="gacha-card">
    <h3>74｜Gacha Seal 換算</h3>
    <div class="gacha-form-grid"><div class="gacha-field"><label>Seal</label><input id="gsSealInput" type="number" min="0"></div><div class="gacha-field"><label>Seal Ticket</label><input id="gsTicketInput" type="number" min="0" max="10"></div><div class="gacha-field"><label>可抵扣抽數</label><input id="gsTicketValue" disabled></div></div>
    <div class="gacha-status" id="gsSealCalc" style="margin-top:8px">—</div>
   </section>
   <section class="gacha-card span-12">
    <h3>75｜分享／匯出本次結果</h3><textarea id="gsShare" class="gacha-share" readonly placeholder="抽卡後會產生可分享 JSON"></textarea><div class="gacha-actions"><button class="gacha-btn" id="gsCopyShare">複製結果 JSON</button><button class="gacha-btn" id="gsUseHash">建立分享連結</button></div>
    <div class="gacha-note">結果分享只包含池 ID、池名、模式、抽數、稀有度統計與近期結果，不包含帳號或其他本機個資。</div>
   </section>
  </div>
 </div>`;
 bind();
}
function bind(){
 ['gsCrystals','gsSeals','gsSealInput','gsTicketInput'].forEach(id=>$(id)?.addEventListener('input',readInputs));
 $('gsType')?.addEventListener('change',renderGachaOptions);
 $('gsGacha')?.addEventListener('change',async e=>{state.gachaId=e.target.value;persist();await selectGacha();});
 $('gsSync')?.addEventListener('click',sync);
 $('gsOpenViewer')?.addEventListener('click',()=>window.open('https://sekai.best/gachas/jp','_blank','noopener'));
 $('gsReset')?.addEventListener('click',resetAll);
 $('gsSingle')?.addEventListener('click',()=>pull(1));
 $('gsTen')?.addEventListener('click',()=>pull(10));
 $('gsExportHistory')?.addEventListener('click',exportHistory);
 $('gsClearHistory')?.addEventListener('click',()=>{if(!confirm('確定清空抽卡紀錄？'))return;state.history=[];persist();renderHistory();});
 $('gsCopyShare')?.addEventListener('click',async()=>{const t=$('gsShare')?.value||'';try{await navigator.clipboard.writeText(t);status('結果 JSON 已複製')}catch(_){status('瀏覽器不允許剪貼簿操作')}});
 $('gsUseHash')?.addEventListener('click',shareHash);
}
function readInputs(){state.crystals=Math.max(0,n($('gsCrystals')?.value));state.seals=Math.max(0,n($('gsSeals')?.value));const t=Math.max(0,Math.min(10,n($('gsTicketInput')?.value)));state.sealTickets=t;persist();renderAll();}
function renderGachaOptions(){
 const sel=$('gsGacha');if(!sel||!Array.isArray(state.pool))return;
 const wanted=$('gsType')?.value||'all';
 const arr=state.pool.filter(g=>wanted==='all'||kind(g)===wanted);
 sel.innerHTML='<option value="">選擇卡池</option>'+arr.slice().sort((a,b)=>Date.parse(b.startAt||'')-Date.parse(a.startAt||'')).map(g=>'<option value="'+esc(idOf(g))+'">'+esc(g.name||('Gacha #'+idOf(g)))+'</option>').join('');
 if(state.gachaId)sel.value=state.gachaId;
}
function status(m,ok=false){const x=$('gsStatus');if(x){x.textContent=m;x.className='gacha-status'+(ok?' ok':'')}}
async function sync(){
 try{status('正在同步卡池…');source='api';state.pool=await loadGachas();persist();renderGachaOptions();if(!state.gachaId){const current=state.pool.find(activeDate);if(current)state.gachaId=idOf(current)}renderGachaOptions();if(state.gachaId)$('gsGacha').value=state.gachaId;await selectGacha();status('已同步 '+fmt(state.pool.length)+' 個卡池',true)}
 catch(e){status('同步失敗：'+(e?.message||'unknown')+'。保留本機模擬。')}
}
async function selectGacha(){
 const id=String(state.gachaId||'');if(!id)return;
 try{status('正在載入卡池詳細資料…');current=await loadGachaDetail(id);current.pickupCards=await enrichPool(current);renderAll();status('已載入：'+(current.name||('Gacha #'+id)),true)}
 catch(e){status('卡池詳細資料載入失敗：'+(e?.message||'unknown'))}
}
function drawRarity(forceThree=false){
 const r=ratesFor(current||{});const p=forceThree?Math.random()*100:rnd(100);if(forceThree)return p<r.four?4:3;if(p<r.four)return 4;if(p<r.four+r.three)return 3;return 2;
}
function rnd(max){return Math.random()*max}
function pickupFor(rarity){
 const picks=(current?.gachaPickups||[]).filter(x=>idOf(x));const cards=current?.pickupCards||[];const by=new Map(cards.map(c=>[idOf(c),c]));
 if(rarity!==4||!picks.length)return null;
 const total=picks.reduce((s,x)=>s+Math.max(0,n(x.weight,1)),0);let q=rnd(total);for(const p of picks){q-=Math.max(0,n(p.weight,1));if(q<=0)return by.get(idOf(p))||null}return by.get(idOf(picks[0]))||null;
}
function pull(count){
 if(!current){status('請先同步並選擇卡池');return}
 const rate=ratesFor(current), cost=count===10?n(current.costCount||DEFAULT.tenCost):n(current.costCount||DEFAULT.pullCost);
 const totalCost=count===10?(n(current.costCount||0)||DEFAULT.tenCost):((n(current.costCount||0)||DEFAULT.pullCost));
 if(state.crystals<totalCost){status('水晶不足：本次需要 '+fmt(totalCost));return}
 const out=[];let four=0,three=0;
 for(let i=0;i<count;i++){const forceThree=count===10&&i===9&&out.every(x=>x.rarity===2);const rarity=drawRarity(forceThree);if(rarity===4)four++;if(rarity===3)three++;out.push({rarity,card:pickupFor(rarity),time:Date.now()})}
 state.crystals-=totalCost;state.seals+=count;state.gachaBonus+=count;
 const record={at:Date.now(),gachaId:String(current.id),gachaName:current.name||'',mode:count===10?'10':'1',cost:totalCost,results:out.map(x=>({rarity:x.rarity,cardId:idOf(x.card),cardName:x.card?.prefix||x.card?.name||x.card?.title||''}))};
 state.history=[record,...state.history].slice(0,500);persist();renderLastPull(out);renderAll();
}
function renderLastPull(out){const box=$('gsPulls');box.innerHTML=out.map((x,i)=>'<div class="gacha-pull" data-reveal="'+i+'"><div class="gacha-pull-inner"><div class="gacha-pull-front">✦</div><div class="gacha-pull-back">'+(x.card?'<img src="'+esc(art(x.card,x.rarity===4&&false))+'" alt=""><span class="gacha-pull-label">★'+x.rarity+' '+esc(x.card.prefix||x.card.name||'Pickup')+'</span>':'<span class="gacha-pull-label">★'+x.rarity+' · '+(x.rarity===4?'★4':'基本Pool')+'</span>')+'</div></div></div>').join('');box.querySelectorAll('.gacha-pull').forEach(x=>x.addEventListener('click',()=>x.classList.toggle('reveal')));setTimeout(()=>box.querySelectorAll('.gacha-pull').forEach(x=>x.classList.add('reveal')),180)}
function renderRates(){
 const r=ratesFor(current||{}),box=$('gsRates');if(!box)return;box.innerHTML='<tr><td>★4</td><td>'+r.four.toFixed(2)+'%</td><td>'+((r.four>=6)?'Fes/高★4率':'一般基準')+'</td></tr><tr><td>★3</td><td>'+r.three.toFixed(2)+'%</td><td>通常提供割合</td></tr><tr><td>★2</td><td>'+r.two.toFixed(2)+'%</td><td>補足割合</td></tr>';const special=kind(current)==='fes'?'本池判定：Fes／Festival 類型':kind(current)==='birthday'?'本池判定：Birthday / Anniversary 類型':kind(current)==='rerun'?'本池判定：復刻／再登場':'本池判定：一般';$('gsSpecial').textContent=special+' · 資料來源：'+source;}
function renderCurrent(){
 if(!current){$('gsCurrentStatus').textContent='選擇一個卡池查看詳細資料。';return}
 const r=ratesFor(current);$('gsCurrentStatus').textContent=(current.name||'Gacha')+' · '+dtime(current.startAt)+' ～ '+dtime(current.endAt)+' · ★4 '+r.four.toFixed(2)+'% · Pickup '+(current.gachaPickups?.length||0)+' · cost '+fmt(current.costCount||DEFAULT.pullCost);
 renderPickups();
}
function renderPickups(){
 const box=$('gsPickups');if(!box)return;const picks=current?.pickupCards||[];if(!picks.length){box.innerHTML='<div class="gacha-empty">此卡池沒有取得 pickup 卡詳細資料。</div>';return}box.innerHTML=picks.map(c=>'<div class="gacha-pickup"><img loading="lazy" src="'+esc(art(c,false))+'" alt="'+esc(c.prefix||c.name||idOf(c))+'"><div>'+esc(c.prefix||c.name||('#'+idOf(c)))+'</div></div>').join('');
}
function renderStats(){
 const hist=state.history||[], total=hist.reduce((s,r)=>s+(Array.isArray(r.results)?r.results.length:0),0), f=hist.reduce((s,r)=>s+(r.results||[]).filter(x=>x.rarity===4).length,0), t=hist.reduce((s,r)=>s+(r.results||[]).filter(x=>x.rarity===3).length,0), spend=hist.reduce((s,r)=>s+n(r.cost),0);
 const rt=total?f/total*100:0, theory=ratesFor(current||{}).four;
 $('gsCost').textContent=fmt(hist[0]?.cost||0);$('gsTotalPulls').textContent=fmt(total);$('gsFourCount').textContent=fmt(f);$('gsThreeCount').textContent=fmt(t);$('gsSpend').textContent=fmt(spend);$('gsCrystalLeft').textContent=fmt(state.crystals);$('gsSealTotal').textContent=fmt(state.seals);$('gsTicketTotal').textContent=fmt(state.sealTickets);$('gsLuckPulls').textContent=fmt(total);$('gsLuckRate').textContent=rt.toFixed(2)+'%';$('gsTheoryRate').textContent=theory.toFixed(2)+'%';$('gsDonut').style.background='conic-gradient(#9179f5 0 '+Math.max(theory,.001)+'%,#52cfe8 '+Math.max(theory,.001)+'% '+Math.max(theory+8.5,.001)+'%,#ffd34f '+Math.max(theory+8.5,.001)+'% 100%)';
 const spark=Math.min(300,total+(state.sealTickets*10));$('gsSparkLabel').textContent=fmt(Math.min(300,total))+' / 300';$('gsSparkBar').style.width=Math.min(100,total/300*100)+'%';$('gsSealInput').value=state.seals;$('gsTicketInput').value=state.sealTickets;$('gsTicketValue').value=fmt(state.sealTickets*10);
 const effective=Math.max(0,300-state.seals-state.sealTickets*10);$('gsSealCalc').textContent='目前 Seal 等值 '+fmt(state.seals+state.sealTickets*10)+'，距 300 Seal exchange 尚差 '+fmt(effective)+' 等值；最多 10 張 Ticket 可在一次交換中使用。';
 $('gsShare').value=JSON.stringify({gachaId:current?.id||'',gachaName:current?.name||'',mode:current?kind(current):'',pulls:total,four:f,three:t,cost:spend,recent:(hist.slice(0,10)||[])},null,2);
}
function renderHistory(){
 const box=$('gsHistory');const h=(state.history||[]);box.innerHTML=h.length?h.slice(0,80).map(x=>'<div class="gacha-history-row"><span>'+esc(new Date(x.at).toLocaleString('zh-TW'))+' · '+esc(x.mode==='10'?'10連':'1抽')+' · '+fmt(x.cost)+' Crystal</span><strong>★4 '+fmt((x.results||[]).filter(y=>y.rarity===4).length)+' / ★3 '+fmt((x.results||[]).filter(y=>y.rarity===3).length)+'</strong></div>').join(''):'<div class="gacha-empty">尚無紀錄。</div>';
}
function renderAll(){renderCurrent();renderRates();renderStats();renderHistory();}
function exportHistory(){const payload={exportedAt:new Date().toISOString(),app:'Project SEKAI Player Toolbox',history:state.history||[]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pjsekai-gacha-history-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function shareHash(){const payload={gachaId:current?.id||'',name:current?.name||'',history:(state.history||[]).slice(0,20)};const enc=btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=location.origin+location.pathname+'#gacha='+enc;try{history.replaceState({},'', '#gacha='+enc);await navigator.clipboard.writeText(url);status('分享連結已建立並複製')}catch(_){$('gsShare').value=url;status('分享連結已建立，請手動複製')}}
function resetAll(){state={...DEFAULT,history:[]};persist();current=null;cardsMap.clear();syncInputs();renderGachaOptions();renderAll();status('模擬器已重設')}
function syncInputs(){$('gsCrystals').value=state.crystals;$('gsSeals').value=state.seals;$('gsTicketInput').value=state.sealTickets}
async function start(){
 const host=$('gachaSimulatorMount');if(!host)return;mount(host);syncInputs();renderGachaOptions();renderAll();
 try{state.pool=await loadGachas();source='api';persist();renderGachaOptions();if(!state.gachaId){const currentG=state.pool.find(activeDate);if(currentG)state.gachaId=idOf(currentG)}renderGachaOptions();if(state.gachaId){$('gsGacha').value=state.gachaId;await selectGacha()}else{status('已同步卡池，但目前沒有進行中的池。',true)}}catch(_){status('初次同步失敗，可按「同步最新卡池」重試。')}
}
start();
})();