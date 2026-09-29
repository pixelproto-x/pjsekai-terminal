/* Stage 3 — Event Rush Calculator 26-40 */
(function(){
'use strict';
const APP=window.__PJSEKAI_APP__;
if(!APP)return;
const $=s=>document.querySelector(s);
const fmt=n=>Math.round(Number(n)||0).toLocaleString('en-US');
const num=(v,d=0)=>{const n=Number(String(v??'').replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:d};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const KEY='pjsekaiEventRushPro';
const ENERGY_CAP=25;
const ENERGY_RATE_MIN=30;
const BOOST_RATES={0:1,1:5,2:10,3:15,4:19,5:23,6:26,7:29,8:31,9:33,10:35};
const RANKS=[100,500,1000,5000,10000,50000,100000];
const DEFAULT={
 region:'tw',eventId:'',target:100000,current:0,bonus:250,basePt:500,mode:'measured',
 selfScore:250000,otherScore:1000000,musicRate:100,energyPerRun:5,runSeconds:110,overheadSeconds:20,
 liveBonus:10,largeDrinks:0,smallDrinks:0,crystals:0,warningMinutes:30,notifyEnabled:false,
 leaderSkill:120,memberSkills:[100,100,100,100,100],pureExtra:25,mixedExtra:125,
 inventory:[],event:null,lastBorder:null
};
let state=load();
let eventTimer=null,notifyTicker=null;

function load(){
  try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return {...DEFAULT,...(x&&typeof x==='object'?x:{})};}catch(_){return {...DEFAULT};}
}
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch(_){}
  APP.update(d=>{d.strategyPro=JSON.parse(JSON.stringify(state));},true);
}
function mount(){
  const host=$('#eventCalcProMount'); if(!host)return;
  host.innerHTML=`
  <div class="event-pro">
    <section class="event-pro-hero">
      <div class="event-pro-kicker">STAGE 3 · EVENT RUSH / 26—40</div>
      <div class="event-pro-title">
        <div><h2>活動衝榜精算機 PRO</h2><p>把 Live Bonus、活動 P、隊伍加成、資源消耗、時速與榜線資料集中在同一個精算面板。</p></div>
        <span class="event-pro-badge">LOCAL + HISEKAI</span>
      </div>
      <div class="event-pro-metrics">
        <div class="event-pro-metric"><small>目前活動</small><strong id="ecpEventName">尚未同步</strong></div>
        <div class="event-pro-metric"><small>活動剩餘</small><strong id="ecpEventCountdown">—</strong></div>
        <div class="event-pro-metric"><small>目前 Live Bonus</small><strong id="ecpLiveBonusNow">—</strong></div>
        <div class="event-pro-metric"><small>每日目標 Pt</small><strong id="ecpDailyQuota">—</strong></div>
      </div>
    </section>

    <div class="event-pro-grid">
      <section class="event-pro-card span-12">
        <h3>① 活動資料同步與目標</h3><p>HiSekai 目前公開的 TW 活動端點可取得目前活動、結束時間與 Border；也可指定 event_id 讀歷史資料。</p>
        <div class="event-pro-row four">
          <div class="event-pro-field"><label>Region</label><select id="ecpRegion"><option value="tw">TW（HiSekai 目前支援）</option></select></div>
          <div class="event-pro-field"><label>目前活動</label><select id="ecpEventSelect"><option value="">尚未載入</option></select></div>
          <div class="event-pro-field"><label>目標活動 Pt</label><input id="ecpTarget" type="number" min="0"></div>
          <div class="event-pro-field"><label>目前活動 Pt</label><input id="ecpCurrent" type="number" min="0"></div>
        </div>
        <div class="event-pro-actions"><button class="event-pro-btn primary" id="ecpLoadLive">↻ 同步目前活動</button><button class="event-pro-btn" id="ecpLoadList">☷ 載入歷史活動</button><button class="event-pro-btn" id="ecpOpenApi">↗ API 說明</button></div>
        <div class="event-pro-status" id="ecpEventStatus">尚未同步。</div>
        <div class="event-pro-source">資料端點：<code>api.hisekai.org/tw/event/live/border</code>、<code>/tw/event/list</code>；官方 FAQ 目前說明 Live Bonus 每 30 分鐘回復 1、時間回復上限 25。 citeturn223815view0turn769939search1</div>
      </section>

      <section class="event-pro-card span-4">
        <h3>② Live Bonus 1～10 火倍率表</h3><p>不再把「火數直接當倍率」。以下是活動 P 倍率；0 火也列入。</p>
        <table class="event-pro-table"><thead><tr><th>消耗</th><th>活動P</th><th>每 10 火等效</th></tr></thead><tbody id="ecpBoostTable"></tbody></table>
        <div class="event-pro-note">目前公開資料列出的 1～10 火活動 P 倍率為 5/10/15/19/23/26/29/31/33/35 倍；一般活動與 World Link 的可用上限可能不同，計算器仍保留完整表格。</div>
      </section>

      <section class="event-pro-card span-4">
        <h3>③ 單場收益與周回</h3><p>「實測」模式直接輸入 0 火 Pt；「公式」模式用 Multi/Solo 社群逆向公式估算基底。</p>
        <div class="event-pro-row three">
          <div class="event-pro-field"><label>計算模式</label><select id="ecpMode"><option value="measured">實測 0 火 Pt</option><option value="formula">公式估算</option></select></div>
          <div class="event-pro-field"><label>0 火 Pt</label><input id="ecpBasePt" type="number" min="0"></div>
          <div class="event-pro-field"><label>活動加成 %</label><input id="ecpBonus" type="number" min="0"></div>
          <div class="event-pro-field"><label>自己 Score</label><input id="ecpSelfScore" type="number" min="0"></div>
          <div class="event-pro-field"><label>其他 4 人總 Score</label><input id="ecpOtherScore" type="number" min="0"></div>
          <div class="event-pro-field"><label>歌曲 event_rate %</label><input id="ecpMusicRate" type="number" min="1"></div>
        </div>
        <div class="event-pro-row three" style="margin-top:8px">
          <div class="event-pro-field"><label>每場消耗 Live Bonus</label><input id="ecpEnergyPerRun" type="number" min="0" max="10"></div>
          <div class="event-pro-field"><label>每場演奏秒數</label><input id="ecpRunSeconds" type="number" min="1"></div>
          <div class="event-pro-field"><label>房間/結算額外秒數</label><input id="ecpOverhead" type="number" min="0"></div>
        </div>
        <div class="event-pro-metrics">
          <div class="event-pro-metric"><small>本場活動P</small><strong id="ecpPtRun">—</strong></div>
          <div class="event-pro-metric"><small>需要場數</small><strong id="ecpRuns">—</strong></div>
          <div class="event-pro-metric"><small>總遊戲時間</small><strong id="ecpTotalTime">—</strong></div>
          <div class="event-pro-metric"><small>Pt / hr</small><strong id="ecpPtHr">—</strong></div>
        </div>
      </section>

      <section class="event-pro-card span-4">
        <h3>④ 自然回復與溢出通知</h3><p>以 25 為時間回復上限；你可以設定提前幾分鐘提醒。通知只在本機瀏覽器觸發。</p>
        <div class="event-pro-row three">
          <div class="event-pro-field"><label>目前 Live Bonus</label><input id="ecpLiveBonus" type="number" min="0" max="25"></div>
          <div class="event-pro-field"><label>提前提醒（分鐘）</label><input id="ecpWarning" type="number" min="1" max="240"></div>
          <div class="event-pro-field"><label>通知</label><select id="ecpNotify"><option value="off">關閉</option><option value="on">開啟</option></select></div>
        </div>
        <div class="event-pro-mini"><span>預計到 25/25</span><strong id="ecpOverflowTime">—</strong></div>
        <div class="event-pro-actions"><button class="event-pro-btn" id="ecpNotifyBtn">🔔 授權通知</button></div>
        <div class="event-pro-status" id="ecpNotifyStatus">尚未設定。</div>
      </section>

      <section class="event-pro-card span-6">
        <h3>⑤ 碎鑽／吃罐資源模擬</h3><p>把「目前存火＋剩餘活動期間可自然回復」先算進去，再扣大火罐、小火罐，最後把不足量換算成水晶。</p>
        <div class="event-pro-row four">
          <div class="event-pro-field"><label>大火罐庫存（每罐10）</label><input id="ecpLarge" type="number" min="0"></div>
          <div class="event-pro-field"><label>小火罐庫存（每罐1）</label><input id="ecpSmall" type="number" min="0"></div>
          <div class="event-pro-field"><label>現有水晶</label><input id="ecpCrystals" type="number" min="0"></div>
          <div class="event-pro-field"><label>水晶 / 1 火</label><input value="10" disabled></div>
        </div>
        <div class="event-pro-metrics">
          <div class="event-pro-metric"><small>總需求火數</small><strong id="ecpEnergyNeed">—</strong></div>
          <div class="event-pro-metric"><small>自然回復可用</small><strong id="ecpNatural">—</strong></div>
          <div class="event-pro-metric"><small>需要吃罐</small><strong id="ecpDrinkNeed">—</strong></div>
          <div class="event-pro-metric"><small>需額外水晶</small><strong id="ecpCrystalNeed">—</strong></div>
        </div>
        <div id="ecpResourceBreakdown" class="event-pro-status">—</div>
      </section>

      <section class="event-pro-card span-6">
        <h3>⑥ 活動剩餘時間＋每日 Pt 配額</h3><p>依 API 回傳的 close time 自動分配每日累計目標；沒有活動資料時仍可手動輸入。</p>
        <div class="event-pro-countdown" id="ecpBigCountdown">—</div>
        <div class="event-pro-metrics">
          <div class="event-pro-metric"><small>剩餘日數</small><strong id="ecpDaysLeft">—</strong></div>
          <div class="event-pro-metric"><small>每日最低 Pt</small><strong id="ecpDayPt">—</strong></div>
          <div class="event-pro-metric"><small>目前進度</small><strong id="ecpProgress">—</strong></div>
          <div class="event-pro-metric"><small>目標完成率</small><strong id="ecpProgressPct">—</strong></div>
        </div>
        <div id="ecpDailyPlan" class="event-pro-status">—</div>
      </section>

      <section class="event-pro-card span-6">
        <h3>⑦ 牌組活動加成最大化＋背包自動選卡</h3><p>把你實際擁有的卡輸入後，系統以「活動加成優先、綜合力次之、角色不重複」做本機選卡；不擅自猜你的背包。</p>
        <div class="event-pro-actions"><button class="event-pro-btn" id="ecpAddCard">＋ 新增卡牌</button><button class="event-pro-btn primary" id="ecpOptimize">✦ 自動選最高加成</button></div>
        <div class="event-pro-section-label">卡牌欄位：名稱／角色／屬性／稀有／MR／Skill／活動加成／綜合力</div>
        <div class="event-pro-inventory" id="ecpInventory"></div>
        <div class="event-pro-metrics">
          <div class="event-pro-metric"><small>最佳總加成</small><strong id="ecpBestBonus">—</strong></div>
          <div class="event-pro-metric"><small>最佳總合力</small><strong id="ecpBestTalent">—</strong></div>
          <div class="event-pro-metric"><small>純色方案</small><strong id="ecpPureBonus">—</strong></div>
          <div class="event-pro-metric"><small>混色方案</small><strong id="ecpMixedBonus">—</strong></div>
        </div>
      </section>

      <section class="event-pro-card span-6">
        <h3>⑧ 純色隊 vs 混色隊收益雷達</h3><p>雷達軸以可量化的活動加成、總合力、Skill、屬性覆蓋與 Pt/hr 代理值比較；實際分數仍會受歌曲、技能觸發與操作影響。</p>
        <div class="event-pro-svg-wrap"><svg id="ecpRadar" class="event-pro-svg" viewBox="0 0 460 330" aria-label="純色隊與混色隊收益雷達"></svg></div>
      </section>

      <section class="event-pro-card span-6">
        <h3>⑨ 協力 Multi-Live 隊長技效益</h3><p>Multi-Live 的隊長技能為 100% 發動，其餘 4 張卡的 Score UP 以 20% 比例加入；這裡把你的技能值直接換算成「有效技能加總」。</p>
        <div class="event-pro-row three">
          <div class="event-pro-field"><label>隊長 Score UP %</label><input id="ecpLeaderSkill" type="number" min="0"></div>
          <div class="event-pro-field"><label>隊員1</label><input data-ecp-skill="0" type="number" min="0"></div>
          <div class="event-pro-field"><label>隊員2</label><input data-ecp-skill="1" type="number" min="0"></div>
          <div class="event-pro-field"><label>隊員3</label><input data-ecp-skill="2" type="number" min="0"></div>
          <div class="event-pro-field"><label>隊員4</label><input data-ecp-skill="3" type="number" min="0"></div>
          <div class="event-pro-field"><label>隊員5（若有）</label><input data-ecp-skill="4" type="number" min="0"></div>
        </div>
        <div class="event-pro-metrics">
          <div class="event-pro-metric"><small>有效 Skill</small><strong id="ecpEffectiveSkill">—</strong></div>
          <div class="event-pro-metric"><small>隊員貢獻</small><strong id="ecpMemberContribution">—</strong></div>
          <div class="event-pro-metric"><small>替換 20% 比較</small><strong id="ecpSkillDelta">—</strong></div>
          <div class="event-pro-metric"><small>粗估分數代理</small><strong id="ecpSkillProxy">—</strong></div>
        </div>
      </section>

      <section class="event-pro-card span-6">
        <h3>⑩ 活動 Border 歷史資料 API</h3><p>可直接查目前活動或歷史 event_id 的 Border；若該活動 API 沒有某個名次，會保留「無資料」而不是猜值。</p>
        <div class="event-pro-row three">
          <div class="event-pro-field"><label>事件 ID</label><input id="ecpBorderEventId" type="number" min="1"></div>
          <div class="event-pro-field"><label>查看名次</label><select id="ecpBorderRank"></select></div>
          <div class="event-pro-field"><label>快速填目前活動</label><button class="event-pro-btn" id="ecpUseLiveEvent" type="button">使用目前活動</button></div>
        </div>
        <div class="event-pro-actions"><button class="event-pro-btn primary" id="ecpLoadBorder">⌕ 查 Border</button></div>
        <div id="ecpBorderResult" class="event-pro-status">尚未查詢。</div>
        <div id="ecpBorderList" class="event-pro-status" style="margin-top:8px">—</div>
        <div class="event-pro-source">HiSekai 文件目前列出：<code>/tw/event/live/border</code> 查當期、<code>/tw/event/[event_id]/border</code> 查特定歷史活動。 citeturn223815view0turn848099view0</div>
      </section>

      <section class="event-pro-card span-12">
        <h3>⑪ 精算結果摘要</h3><p>把所有核心數值合併到一個可快速截圖／檢查的區塊。</p>
        <div id="ecpSummary" class="event-pro-status">—</div>
        <div class="event-pro-actions"><button class="event-pro-btn" id="ecpReset">↺ 重設 Stage 3</button></div>
        <div class="event-pro-note">活動 P 公式部分依目前公開的社群逆向實作與公開資料建立「估算模式」；官方活動資料、玩家分數與特殊活動類型仍可能造成差異。這也是為什麼「實測 0 火 Pt」模式預留在工具內。</div>
      </section>
    </div>
  </div>`;
  bind();
}
function setVal(id,v){const x=$('#'+id);if(x&&v!=null)x.value=String(v);}
function syncInputs(){
  setVal('ecpRegion',state.region);setVal('ecpTarget',state.target);setVal('ecpCurrent',state.current);setVal('ecpMode',state.mode);
  setVal('ecpBasePt',state.basePt);setVal('ecpBonus',state.bonus);setVal('ecpSelfScore',state.selfScore);setVal('ecpOtherScore',state.otherScore);setVal('ecpMusicRate',state.musicRate||100);
  setVal('ecpEnergyPerRun',state.energyPerRun);setVal('ecpRunSeconds',state.runSeconds);setVal('ecpOverhead',state.overheadSeconds);
  setVal('ecpLiveBonus',state.liveBonus);setVal('ecpWarning',state.warningMinutes);setVal('ecpNotify',state.notifyEnabled?'on':'off');
  setVal('ecpLarge',state.largeDrinks);setVal('ecpSmall',state.smallDrinks);setVal('ecpCrystals',state.crystals);setVal('ecpLeaderSkill',state.leaderSkill);
  document.querySelectorAll('[data-ecp-skill]').forEach((x,i)=>x.value=String(state.memberSkills?.[i]??0));
}
function bind(){
  const ids=['ecpRegion','ecpTarget','ecpCurrent','ecpMode','ecpBasePt','ecpBonus','ecpSelfScore','ecpOtherScore','ecpMusicRate','ecpEnergyPerRun','ecpRunSeconds','ecpOverhead','ecpLiveBonus','ecpWarning','ecpNotify','ecpLarge','ecpSmall','ecpCrystals','ecpLeaderSkill'];
  ids.forEach(id=>$('#'+id)?.addEventListener('input',readInputs));
  ids.forEach(id=>$('#'+id)?.addEventListener('change',readInputs));
  document.querySelectorAll('[data-ecp-skill]').forEach(x=>x.addEventListener('input',readInputs));
  $('#ecpLoadLive')?.addEventListener('click',loadLive);
  $('#ecpLoadList')?.addEventListener('click',loadEventList);
  $('#ecpOpenApi')?.addEventListener('click',()=>window.open('https://docs.hisekai.org/en/docs/api/event/border','_blank','noopener'));
  $('#ecpNotifyBtn')?.addEventListener('click',requestNotify);
  $('#ecpAddCard')?.addEventListener('click',()=>{state.inventory.push({name:'新卡',character:'',attr:'',rarity:4,mr:0,skill:1,bonus:0,talent:30000});persist();renderInventory();renderAll();});
  $('#ecpOptimize')?.addEventListener('click',optimizeDeck);
  $('#ecpLoadBorder')?.addEventListener('click',loadBorder);
  $('#ecpUseLiveEvent')?.addEventListener('click',()=>{if(state.event?.id){setVal('ecpBorderEventId',state.event.id);loadBorder();}});
  $('#ecpReset')?.addEventListener('click',resetState);
  $('#ecpEventSelect')?.addEventListener('change',async e=>{state.eventId=e.target.value;persist();if(state.eventId)await loadBorder(true);});
  renderBoostTable();renderRanks();syncInputs();renderInventory();renderAll();
}
function readInputs(){
  state.region='tw';state.target=Math.max(0,num($('#ecpTarget')?.value));state.current=Math.max(0,num($('#ecpCurrent')?.value));state.mode=$('#ecpMode')?.value||'measured';
  state.basePt=Math.max(0,num($('#ecpBasePt')?.value));state.bonus=Math.max(0,num($('#ecpBonus')?.value));state.selfScore=Math.max(0,num($('#ecpSelfScore')?.value));state.otherScore=Math.max(0,num($('#ecpOtherScore')?.value));state.musicRate=Math.max(1,num($('#ecpMusicRate')?.value,100));
  state.energyPerRun=Math.max(0,Math.min(10,num($('#ecpEnergyPerRun')?.value)));state.runSeconds=Math.max(1,num($('#ecpRunSeconds')?.value));state.overheadSeconds=Math.max(0,num($('#ecpOverhead')?.value));
  state.liveBonus=Math.max(0,Math.min(25,num($('#ecpLiveBonus')?.value)));state.warningMinutes=Math.max(1,num($('#ecpWarning')?.value));state.notifyEnabled=$('#ecpNotify')?.value==='on';
  state.largeDrinks=Math.max(0,num($('#ecpLarge')?.value));state.smallDrinks=Math.max(0,num($('#ecpSmall')?.value));state.crystals=Math.max(0,num($('#ecpCrystals')?.value));state.leaderSkill=Math.max(0,num($('#ecpLeaderSkill')?.value));
  state.memberSkills=[0,1,2,3,4].map(i=>Math.max(0,num(document.querySelector('[data-ecp-skill="'+i+'"]')?.value)));
  persist();renderAll();
}
function renderBoostTable(){
  const box=$('#ecpBoostTable');if(!box)return;
  box.innerHTML=Object.entries(BOOST_RATES).map(([energy,rate])=>`<tr class="${Number(energy)===5||Number(energy)===10?'hot':''}"><td>${energy}</td><td>${rate}×</td><td>${(rate*10/Math.max(1,Number(energy))).toFixed(1)}×</td></tr>`).join('');
}
function renderRanks(){
  const s=$('#ecpBorderRank');if(s)s.innerHTML=RANKS.map(r=>`<option value="${r}">T${r.toLocaleString()}</option>`).join('');
}
async function api(path){
  const r=await fetch('https://api.hisekai.org'+path,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}
function parseISO(x){const t=Date.parse(x||'');return Number.isFinite(t)?t:0}
function eventName(e){return e?.name||e?.title||('Event #'+(e?.id??''))}
function renderEventMeta(){
  const e=state.event;
  $('#ecpEventName').textContent=e?eventName(e):'尚未同步';
  const end=parseISO(e?.closed_at);
  if(end>0){
    const left=Math.max(0,end-Date.now());$('#ecpEventCountdown').textContent=timeHuman(left);$('#ecpBigCountdown').textContent=clockHuman(left);
    const days=Math.max(1,Math.ceil(left/86400000));$('#ecpDaysLeft').textContent=String(days);
    const gap=Math.max(0,state.target-state.current);const day=Math.ceil(gap/days);$('#ecpDayPt').textContent=fmt(day);
    const pct=state.target>0?Math.min(100,state.current/state.target*100):100;$('#ecpProgressPct').textContent=pct.toFixed(1)+'%';$('#ecpProgress').textContent=fmt(state.current)+' / '+fmt(state.target);
    const plan=[];for(let i=0;i<days;i++){const d=new Date(Date.now()+i*86400000);const goal=state.current+Math.min(gap,Math.ceil(gap/days*(i+1)));plan.push(d.toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'})+'：累计 '+fmt(goal)+' Pt');}$('#ecpDailyPlan').textContent=plan.join('　');
  }else{$('#ecpEventCountdown').textContent='—';$('#ecpBigCountdown').textContent='—';$('#ecpDaysLeft').textContent='—';$('#ecpDayPt').textContent=fmt(Math.max(0,state.target-state.current));$('#ecpProgress').textContent=fmt(state.current)+' / '+fmt(state.target);$('#ecpProgressPct').textContent=state.target?Math.min(100,state.current/state.target*100).toFixed(1)+'%':'—';$('#ecpDailyPlan').textContent='尚未取得活動 close time。';}
  $('#ecpLiveBonusNow').textContent=Math.round(state.liveBonus)+'/25';
  if(eventTimer)clearTimeout(eventTimer);eventTimer=setTimeout(renderEventMeta,1000);
}
function timeHuman(ms){const sec=Math.floor(ms/1000),d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60);return d+'d '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function clockHuman(ms){const sec=Math.floor(ms/1000),d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60;return [d+'d',String(h).padStart(2,'0'),String(m).padStart(2,'0'),String(s).padStart(2,'0')].join(' ')}
function formulaBase(){
  const deck=1+state.bonus/100;
  const rate=Math.max(0.01,state.musicRate/100);
  if(state.mode!=='formula')return Math.max(0,state.basePt);
  const self=Math.floor(state.selfScore/20000);
  if((state.liveType||'multi')==='solo')return Math.floor((100+self)*rate*deck);
  const other=Math.min(13,Math.floor(state.otherScore/340000));
  return Math.floor((110+Math.floor(state.selfScore/17000)+other)*rate*deck);
}
function calcRuns(){
  const gap=Math.max(0,state.target-state.current);
  const e=Math.max(0,Math.min(10,state.energyPerRun));
  const mult=BOOST_RATES[e]??1;
  const base=formulaBase(),pt=e===0?base:Math.floor(base*mult);
  const runs=gap>0&&pt>0?Math.ceil(gap/pt):0;
  const sec=runs*(state.runSeconds+state.overheadSeconds);
  const ptHr=sec>0?(pt*3600/(state.runSeconds+state.overheadSeconds)):0;
  $('#ecpPtRun').textContent=fmt(pt);$('#ecpRuns').textContent=fmt(runs);$('#ecpTotalTime').textContent=clockHuman(sec*1000);$('#ecpPtHr').textContent=fmt(ptHr);
  return {gap,e,mult,base,pt,runs,sec,ptHr};
}
function naturalEnergyAvailable(){
  const end=parseISO(state.event?.closed_at);
  if(!end)return 0;
  const mins=Math.max(0,Math.floor((end-Date.now())/60000));
  return Math.floor(mins/ENERGY_RATE_MIN);
}
function calcResources(c){
  const need=c.runs*c.e;
  const natural=naturalEnergyAvailable();
  let missing=Math.max(0,need-state.liveBonus-natural),large=Math.min(state.largeDrinks,Math.ceil(missing/10));missing-=large*10;
  let small=Math.min(state.smallDrinks,missing);missing-=small;
  const crystals=Math.max(0,missing)*10;
  const enough=crystals<=state.crystals;
  $('#ecpEnergyNeed').textContent=fmt(need);$('#ecpNatural').textContent=fmt(natural);$('#ecpDrinkNeed').textContent=fmt(large*10+small);$('#ecpCrystalNeed').textContent=fmt(crystals);
  $('#ecpResourceBreakdown').textContent='現有火 '+fmt(state.liveBonus)+' + 自然回復 '+fmt(natural)+' + 大火罐 '+fmt(large)+'罐 + 小火罐 '+fmt(small)+'罐，最後還需 '+fmt(crystals)+' 水晶。'+(enough?'　現有水晶足夠。':'　現有水晶不足，差 '+fmt(crystals-state.crystals)+' 顆。');
  return {need,natural,large,small,crystals,enough};
}
function overflowInfo(){
  const missing=Math.max(0,ENERGY_CAP-state.liveBonus);const ms=missing*ENERGY_RATE_MIN*60000;
  $('#ecpOverflowTime').textContent=missing<=0?'已經 25/25':timeHuman(ms);
  if(state.notifyEnabled&&missing>0&&missing*ENERGY_RATE_MIN<=state.warningMinutes){
    $('#ecpNotifyStatus').textContent='已進入提醒區間：距滿溢約 '+timeHuman(ms)+'。';
    if('Notification'in window&&Notification.permission==='granted'){
      if(!notifyTicker)notifyTicker=setInterval(()=>{if(state.notifyEnabled){const m=Math.max(0,ENERGY_CAP-state.liveBonus)*ENERGY_RATE_MIN;if(m<=state.warningMinutes)new Notification('Project SEKAI Live Bonus 即將溢出',{body:'剩餘約 '+timeHuman(m*60000)+'，目前 '+state.liveBonus+'/25。'});}},60000);
    }
  }else $('#ecpNotifyStatus').textContent=state.notifyEnabled?'通知已開啟，尚未進入提醒區間。':'通知目前關閉。';
}
async function requestNotify(){
  if(!('Notification'in window)){toast('此瀏覽器不支援通知');return}
  const p=await Notification.requestPermission();state.notifyEnabled=p==='granted';setVal('ecpNotify',state.notifyEnabled?'on':'off');persist();toast(p==='granted'?'已開啟活動溢出通知':'通知權限未開啟');renderAll();
}
function cardValue(c){return {bonus:num(c.bonus),talent:num(c.talent),character:String(c.character||'').trim(),attr:String(c.attr||'').trim()}}
function optimizedCards(filter){
  const pool=state.inventory.map((x,i)=>({...x,_i:i})).filter(x=>!filter||filter(x));
  pool.sort((a,b)=>num(b.bonus)-num(a.bonus)||num(b.talent)-num(a.talent)||num(b.mr)-num(a.mr));
  const out=[],chars=new Set();
  for(const c of pool){const k=String(c.character||c.name||c._i);if(chars.has(k))continue;out.push(c);chars.add(k);if(out.length>=5)break}
  return out;
}
function teamScore(cards){return {bonus:cards.reduce((s,c)=>s+num(c.bonus),0),talent:cards.reduce((s,c)=>s+num(c.talent),0),skill:cards.reduce((s,c)=>s+num(c.skill),0),attrs:new Set(cards.map(c=>c.attr).filter(Boolean)).size}}
function optimizeDeck(){
  const best=optimizedCards();const pureAttr=best[0]?.attr||'';
  const pure=optimizedCards(c=>pureAttr&&c.attr===pureAttr);
  const mixed=optimizedCards();
  state.bestTeam=best.map(x=>x._i);state.pureTeam=pure.map(x=>x._i);state.mixedTeam=mixed.map(x=>x._i);persist();
  $('#ecpEventStatus').textContent='已用「活動加成 → 綜合力 → 不重複角色」排序，完成本機最佳化。';renderAll();
}
function renderInventory(){
  const box=$('#ecpInventory');if(!box)return;
  if(!state.inventory.length){box.innerHTML='<div class="event-pro-status">尚未輸入背包卡牌。按「新增卡牌」開始。</div>';return}
  box.innerHTML=state.inventory.map((c,i)=>`<div class="event-pro-inv">
    <input data-inv="${i}" data-key="name" value="${esc(c.name)}" placeholder="名稱">
    <input data-inv="${i}" data-key="character" value="${esc(c.character)}" placeholder="角色">
    <input data-inv="${i}" data-key="attr" value="${esc(c.attr)}" placeholder="屬性">
    <input data-inv="${i}" data-key="rarity" type="number" min="1" max="4" value="${num(c.rarity)}" title="稀有度">
    <input data-inv="${i}" data-key="mr" type="number" min="0" max="5" value="${num(c.mr)}" title="MR">
    <input data-inv="${i}" data-key="skill" type="number" min="1" max="10" value="${num(c.skill)}" title="Skill">
    <input data-inv="${i}" data-key="bonus" type="number" step=".1" min="0" value="${num(c.bonus)}" title="活動加成">
    <input data-inv="${i}" data-key="talent" type="number" min="0" value="${num(c.talent)}" title="綜合力">
    <button type="button" data-del-inv="${i}" title="刪除">×</button>
  </div>`).join('');
  box.querySelectorAll('[data-inv]').forEach(x=>x.addEventListener('input',e=>{const i=Number(e.target.dataset.inv),k=e.target.dataset.key;state.inventory[i][k]=e.target.value;persist();renderAll();}));
  box.querySelectorAll('[data-del-inv]').forEach(x=>x.addEventListener('click',()=>{state.inventory.splice(Number(x.dataset.delInv),1);persist();renderInventory();renderAll();}));
}
function radarPoint(cx,cy,r,i,n,value){const a=(-Math.PI/2)+(Math.PI*2*i/n);const rr=r*Math.max(0,Math.min(100,value))/100;return [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]}
function radarPolygon(values,cx,cy,r,n){return values.map((v,i)=>radarPoint(cx,cy,r,i,n,v).join(',')).join(' ')}
function norm(v,max){return max>0?Math.max(0,Math.min(100,v/max*100)):0}
function drawRadar(){
  const svg=$('#ecpRadar');if(!svg)return;const best=state.inventory.filter((_,i)=>state.bestTeam?.includes(i));const pure=state.inventory.filter((_,i)=>state.pureTeam?.includes(i));const mixed=state.inventory.filter((_,i)=>state.mixedTeam?.includes(i));const a=teamScore(pure.length?pure:optimizedCards(c=>c.attr===(pure[0]?.attr||''))),b=teamScore(mixed.length?mixed:optimizedCards());const calcVals=t=>[norm(t.bonus,250),norm(t.talent,300000),norm(t.skill,50),norm(t.attrs,5),norm(calcRuns().ptHr,50000)];
  const va=calcVals(a),vb=calcVals(b),cx=230,cy=160,r=105,n=5;let html='';
  [20,40,60,80,100].forEach(k=>{html+=`<polygon class="grid" points="${Array.from({length:n},(_,i)=>radarPoint(cx,cy,r,i,n,k).join(',')).join(' ')}"/>`});
  for(let i=0;i<n;i++){const [x,y]=radarPoint(cx,cy,r,i,n,100);html+=`<line class="axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;}
  html+=`<polygon class="pure" points="${radarPolygon(va,cx,cy,r,n)}"/><polygon class="mixed" points="${radarPolygon(vb,cx,cy,r,n)}"/>`;
  ['活動加成','總合力','Skill','屬性覆蓋','Pt/hr'].forEach((label,i)=>{const [x,y]=radarPoint(cx,cy,r+22,i,n,100);html+=`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;});
  html+='<g transform="translate(145 300)"><rect x="0" y="-8" width="12" height="12" rx="3" fill="#ec5e97"/><text x="18" y="2">純色</text><rect x="90" y="-8" width="12" height="12" rx="3" fill="#5e9cec"/><text x="108" y="2">混色</text></g>';svg.innerHTML=html;
  $('#ecpPureBonus').textContent=fmt(a.bonus)+'%';$('#ecpMixedBonus').textContent=fmt(b.bonus)+'%';
  $('#ecpBestBonus').textContent=fmt((best.length?teamScore(best):b).bonus)+'%';$('#ecpBestTalent').textContent=fmt((best.length?teamScore(best):b).talent);
}
function calcSkill(){
  const all=[state.leaderSkill,...state.memberSkills].filter(v=>Number.isFinite(v));const effective=(all[0]||0)+state.memberSkills.reduce((s,v)=>s+v*.2,0);const member=state.memberSkills.reduce((s,v)=>s+v*.2,0);const delta=member-state.memberSkills.reduce((s,v)=>s+v,0)*.2;
  $('#ecpEffectiveSkill').textContent=effective.toFixed(1)+'%';$('#ecpMemberContribution').textContent='+'+member.toFixed(1)+'%';$('#ecpSkillDelta').textContent=delta.toFixed(1)+'%';$('#ecpSkillProxy').textContent=((1+effective/100)).toFixed(3)+'×';
}
function renderSummary(c,res){
  const end=state.event?.closed_at?new Date(state.event.closed_at).toLocaleString('zh-TW'):'未同步';const border=state.lastBorder?.find?.(x=>x.rank===1000);$('#ecpSummary').innerHTML='目標 '+fmt(state.target)+' Pt；目前 '+fmt(state.current)+' Pt；每場 '+fmt(c.pt)+' Pt；'+fmt(c.runs)+' 場；Pt/hr '+fmt(c.ptHr)+'；總需求 '+fmt(res.need)+' 火；自然回復預估 '+fmt(res.natural)+'；需水晶 '+fmt(res.crystals)+'；活動結束 '+esc(end)+(border?'；T1000 目前資料 '+fmt(border.score)+' Pt':'')+'。';
}
async function loadLive(){
  try{
    $('#ecpEventStatus').textContent='正在同步目前活動…';const data=await api('/tw/event/live/border');state.event=data;state.eventId=String(data?.id??'');persist();await loadEventList(true);setVal('ecpBorderEventId',state.eventId);toast('目前活動已同步');renderAll();await loadBorder(true);
  }catch(e){$('#ecpEventStatus').textContent='同步失敗：'+(e?.message||'unknown')+'。保留本機計算模式。';toast('HiSekai 目前無法連線');}
}
async function loadEventList(selectCurrent=false){
  try{
    const list=await api('/tw/event/list');const arr=Array.isArray(list)?list:(list?.events||list?.data||[]);const sel=$('#ecpEventSelect');if(!sel)return;
    sel.innerHTML='<option value="">選擇歷史活動</option>'+arr.slice().sort((a,b)=>parseISO(b.start_at)-parseISO(a.start_at)).map(e=>`<option value="${esc(e.id)}">${esc(eventName(e))} (#${esc(e.id)})</option>`).join('');
    if(selectCurrent&&state.eventId)sel.value=String(state.eventId); 
    $('#ecpEventStatus').textContent='活動清單已載入 '+arr.length+' 筆。';
  }catch(e){$('#ecpEventStatus').textContent='歷史活動清單載入失敗：'+(e?.message||'unknown');}
}
async function loadBorder(fromSelect=false){
  const id=String($('#ecpBorderEventId')?.value||state.eventId||'').trim();if(!id){toast('請先填 Event ID');return}
  try{
    $('#ecpBorderResult').textContent='正在查詢 Border…';const data=await api('/tw/event/'+encodeURIComponent(id)+'/border');const rows=Array.isArray(data?.player_border_rankings)?data.player_border_rankings:[];state.lastBorder=rows;persist();
    const rank=num($('#ecpBorderRank')?.value,1000);const hit=rows.find(x=>Number(x.rank)===rank);$('#ecpBorderResult').textContent=hit?'T'+fmt(rank)+'：'+fmt(hit.score)+' Pt · '+esc(hit.name||''):'T'+fmt(rank)+'：API 沒有這個名次資料。';
    $('#ecpBorderList').innerHTML=rows.length?rows.filter(x=>RANKS.includes(Number(x.rank))).map(x=>'<span class="event-pro-pill" style="margin:2px">T'+fmt(x.rank)+' '+fmt(x.score)+'</span>').join(''):'API 未回傳 border。';
  }catch(e){$('#ecpBorderResult').textContent='Border 查詢失敗：'+(e?.message||'unknown')+'。';}
}
function resetState(){state={...DEFAULT,memberSkills:[100,100,100,100,100]};persist();syncInputs();renderInventory();renderAll();toast('Stage 3 已重設');}
function renderAll(){const c=calcRuns();const res=calcResources(c);overflowInfo();renderEventMeta();drawRadar();calcSkill();renderSummary(c,res);}
function toast(m){try{APP.toast(m)}catch(_){/* noop */}}
function start(){
  if(!state.inventory.length&&Array.isArray(APP.getState?.().team)&&APP.getState().team.length){
    state.inventory=APP.getState().team.slice(0,5).map((x,i)=>({name:x.card||('隊伍卡'+(i+1)),character:x.character||'',attr:x.attribute||'',rarity:x.rarity||4,mr:x.mr||0,skill:x.skill||1,bonus:x.bonus||0,talent:x.talent||0}));
    persist();
  }
  setVal('ecpBasePt',state.basePt);setVal('ecpMusicRate',state.musicRate||100);syncInputs();renderInventory();renderAll();
  if(state.notifyEnabled)requestNotify();
}
window.EventRushPro={reload:()=>{state=load();mount();start()}};
mount();start();
})();