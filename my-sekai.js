/* My SEKAI v1 */
(function(){
'use strict';
const bridge=window.__PJSEKAI_APP__;
if(!bridge)return;
const DIFFS=['Easy','Normal','Hard','Expert','Master','Append'];
const ATTRS=['Cute','Cool','Pure','Happy','Mysterious'];
const UNITS=['Leo/need','MORE MORE JUMP!','Vivid BAD SQUAD','Wonderlands×Showtime','25時、ナイトコードで。','Virtual Singer'];
const CR_MAX=135;
const PLAYER_MILESTONES=[
  [50,'Real Deal'],[100,'Pro'],[200,'Platinum'],[300,'Diamond'],[400,'Ruby'],[500,'Pearl'],[600,'Sapphire'],[700,'Garnet'],[800,'Emerald']
];
const UNIT_MAP={
 '星乃一歌':'Leo/need','天馬咲希':'Leo/need','望月穗波':'Leo/need','日野森志步':'Leo/need',
 '花里みのり':'MORE MORE JUMP!','桐谷遙':'MORE MORE JUMP!','桃井愛莉':'MORE MORE JUMP!','日野森雫':'MORE MORE JUMP!',
 '小豆沢こはね':'Vivid BAD SQUAD','白石杏':'Vivid BAD SQUAD','東雲彰人':'Vivid BAD SQUAD','青柳冬彌':'Vivid BAD SQUAD',
 '天馬司':'Wonderlands×Showtime','鳳えむ':'Wonderlands×Showtime','草薙寧々':'Wonderlands×Showtime','神代類':'Wonderlands×Showtime',
 '宵崎奏':'25時、ナイトコードで。','朝比奈まふゆ':'25時、ナイトコードで。','東雲絵名':'25時、ナイトコードで。','暁山瑞希':'25時、ナイトコードで。',
 '初音ミク':'Virtual Singer','鏡音リン':'Virtual Singer','鏡音レン':'Virtual Singer','巡音ルカ':'Virtual Singer','MEIKO':'Virtual Singer','KAITO':'Virtual Singer'
};
const TASKS=[
 ['Live Play Count','以該角色作為 Leader 完成 Live。'],['Waiting Room','在 Waiting Room 擁有該角色相關成員。'],['3D Costume','取得該角色的 3D Costume。'],['Another Vocal','收集該角色的 Another Vocal。'],['Character Area Item','提升該角色的 Character Area Item。'],['Cards','收集不同的該角色卡片。'],['Rare Card Skill','提升該角色 ★4 / Birthday / Anniversary 卡片技能。'],['Common Card Skill','提升該角色 ★1 / ★2 / ★3 卡片技能。'],['Rare Card Mastery Rank','提升該角色 ★4 / Birthday / Anniversary 卡片 Master Rank。'],['Common Card Mastery Rank','提升該角色 ★1 / ★2 / ★3 卡片 Master Rank。'],['Unit Area Item','提升該角色所屬團體的 Area Item。'],['Attribute Area Item','提升對應 Attribute Area Item。']
];
const DEFAULT_STATS=()=>Object.fromEntries(DIFFS.map(d=>[d,{plays:0,clear:0,fc:0,ap:0}]));
const CHARACTERS=['星乃一歌','天馬咲希','望月穗波','日野森志步','花里みのり','桐谷遙','桃井愛莉','日野森雫','小豆沢こはね','白石杏','東雲彰人','青柳冬彌','天馬司','鳳えむ','草薙寧々','神代類','宵崎奏','朝比奈まふゆ','東雲絵名','暁山瑞希','初音ミク','鏡音リン','鏡音レン','巡音ルカ','MEIKO','KAITO'];
const $=id=>document.getElementById(id);
const n=(v,d=0)=>{const x=Number(String(v??'').replace(/[^\d.-]/g,''));return Number.isFinite(x)?x:d};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=x=>Math.max(0,n(x)).toLocaleString('en-US');
const state=()=>bridge.getState();
function ensure(){
 const s=state(); const p=s.profile=s.profile||{};
 p.title=String(p.title||'PLAYER'); p.titleSub=String(p.titleSub||''); p.signature=String(p.signature||'');
 p.cardBackground=String(p.cardBackground||''); p.cardBgMode=String(p.cardBgMode||'gradient');
 p.totalPlaysMode=p.totalPlaysMode==='manual'?'manual':'auto'; p.clearCountMode=p.clearCountMode==='manual'?'manual':'auto';
 p.manualPlays=Math.max(0,n(p.manualPlays)); p.manualClear=Math.max(0,n(p.manualClear));
 p.stats=p.stats&&typeof p.stats==='object'?p.stats:DEFAULT_STATS();
 DIFFS.forEach(d=>p.stats[d]={...{plays:0,clear:0,fc:0,ap:0},...(p.stats[d]||{})});
 p.teamTargets=p.teamTargets&&typeof p.teamTargets==='object'?p.teamTargets:{attr:'',unit:''};
 p.characterRanks=p.characterRanks&&typeof p.characterRanks==='object'?p.characterRanks:{};
 CHARACTERS.forEach(c=>{p.characterRanks[c]=Math.max(0,Math.min(CR_MAX,n(p.characterRanks[c])));});
 p.crSelected=CHARACTERS.includes(p.crSelected)?p.crSelected:CHARACTERS[0];
 p.crTasks=p.crTasks&&typeof p.crTasks==='object'?p.crTasks:{};
 CHARACTERS.forEach(c=>{p.crTasks[c]=Array.isArray(p.crTasks[c])?p.crTasks[c]:TASKS.map(()=>({done:false,note:''}));p.crTasks[c]=TASKS.map((_,i)=>({...{done:false,note:''},...(p.crTasks[c][i]||{})}));});
 p.crResource=p.crResource&&typeof p.crResource==='object'?p.crResource:{current:1,target:10,vialPerRank:1,fragPerRank:0,gemPerRank:0,vialOwn:0,fragOwn:0,gemOwn:0};
 p.rankCalc=p.rankCalc&&typeof p.rankCalc==='object'?p.rankCalc:{current:1,currentExp:0,target:50,expPerLevel:1000,liveExp:960};
 s.team=Array.isArray(s.team)?s.team.slice(0,5):[];
 while(s.team.length<5)s.team.push({slot:s.team.length+1});
 s.team=s.team.map((x,i)=>({slot:i+1,characterName:'',characterId:'',cardId:'',cardName:'',attribute:'',unit:'',talent:0,power:0,bonusPct:0,masterRank:0,skillLevel:1,...(x||{})}));
 return s;
}
function save(){ensure();bridge.save();}
let saveTimer=0;
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,180)}
function options(list,current){return list.map(x=>'<option value="'+esc(x)+'"'+(x===current?' selected':'')+'>'+esc(x)+'</option>').join('')}
function calcCrBonus(rank){return Math.min(50,n(rank))*0.001}
function teamTalent(s){
 return s.team.reduce((sum,x)=>{
   const base=Math.max(0,n(x.talent??x.power)); if(!base)return sum;
   const cr=calcCrBonus(s.profile.characterRanks[x.characterName]);
   const extra=Math.max(0,n(x.bonusPct))/100;
   return sum+base*(1+cr)*(1+extra);
 },0);
}
function renderIdentity(){
 const s=ensure(),p=s.profile; const total=teamTalent(s);
 $('mskPlayerId').value=p.playerId||'';$('mskPlayerName').value=p.name||'';$('mskSignature').value=p.signature||'';$('mskTitle').value=p.title||'';$('mskTitleSub').value=p.titleSub||'';
 $('mskProfileSource').textContent=p.source==='api'?'API · CACHE':'LOCAL';
 $('mskProfileStatus').textContent=p.source==='api'?'API 資料已載入並保存於本機。':'資料只保存在這台裝置。';
 $('mskMiniTitle').textContent=p.title||'PLAYER';$('mskMiniRank').textContent='RANK '+(p.rank?fmt(p.rank):'—');$('mskMiniName').textContent=p.name||'Player';$('mskMiniSignature').textContent=p.signature||'還沒有簽名。';$('mskMiniId').textContent='ID '+(p.playerId||'未設定');$('mskMiniPower').textContent='TALENT '+fmt(total);
}
function renderTeam(){
 const s=ensure(),p=s.profile,box=$('mskTeamGrid'); if(!box)return;
 box.innerHTML=s.team.map((x,i)=>{
   const char=x.characterName||'';const unit=x.unit||UNIT_MAP[char]||'';const attr=x.attribute||'';
   const finalTalent=Math.round(Math.max(0,n(x.talent??x.power))*(1+calcCrBonus(p.characterRanks[char]))*(1+Math.max(0,n(x.bonusPct))/100));
   return '<article class="msk-team-slot" data-msk-team="'+i+'"><div class="msk-team-slot-head"><strong>Slot '+(i+1)+'</strong><span class="msk-slot-badge">CR '+n(p.characterRanks[char])+'</span></div>'+
   '<label>角色<select data-team-field="characterName">'+options(['',...CHARACTERS],char)+'</select></label>'+
   '<label>卡片名稱<input data-team-field="cardName" maxlength="60" value="'+esc(x.cardName||'')+'" placeholder="卡片名稱"></label>'+
   '<div class="msk-team-two"><label>屬性<select data-team-field="attribute">'+options(['',...ATTRS],attr)+'</select></label><label>團體<select data-team-field="unit">'+options(['',...UNITS],unit)+'</select></label></div>'+
   '<div class="msk-team-two"><label>Talent<input data-team-field="talent" type="number" min="0" value="'+n(x.talent??x.power)+'"></label><label>Bonus %<input data-team-field="bonusPct" type="number" min="0" step=".1" value="'+n(x.bonusPct)+'"></label></div>'+
   '<div class="msk-team-two"><label>MR<input data-team-field="masterRank" type="number" min="0" max="5" value="'+Math.max(0,Math.min(5,n(x.masterRank)))+'"></label><label>Skill<input data-team-field="skillLevel" type="number" min="1" max="10" value="'+Math.max(1,Math.min(10,n(x.skillLevel,1)))+'"></label></div>'+
   '<div class="msk-slot-talent"><small>EST. FINAL TALENT</small><strong>'+fmt(finalTalent)+'</strong></div></article>';
 }).join('');
 const total=teamTalent(s);$('mskTeamTalent').textContent=fmt(Math.round(total));
 $('mskTargetAttr').value=p.teamTargets.attr||'';$('mskTargetUnit').value=p.teamTargets.unit||'';renderBonusLights();
}
function renderBonusLights(){
 const s=ensure(),p=s.profile,team=s.team.filter(x=>x.characterName||x.cardName||n(x.talent)>0);const attrTarget=p.teamTargets.attr,unitTarget=p.teamTargets.unit;
 const fullAttr=team.length===5&&team.every(x=>x.attribute&&x.attribute===team[0].attribute);
 const fullUnit=team.length===5&&team.every(x=>(x.unit||UNIT_MAP[x.characterName])&&((x.unit||UNIT_MAP[x.characterName])===(team[0].unit||UNIT_MAP[team[0].characterName])));
 const targetAttrOn=!!attrTarget&&team.length===5&&team.every(x=>x.attribute===attrTarget);
 const targetUnitOn=!!unitTarget&&team.length===5&&team.every(x=>(x.unit||UNIT_MAP[x.characterName])===unitTarget);
 const rows=[
  ['純色隊','5 人皆同屬性',fullAttr],['指定屬性','5 人皆符合目標屬性',targetAttrOn],['同團隊','5 人皆同團體',fullUnit],['指定團體','5 人皆符合目標團體',targetUnitOn]
 ];
 $('mskBonusLights').innerHTML=rows.map(r=>'<div class="msk-light '+(r[2]?'on':'')+'"><i class="msk-light-dot"></i><div><strong>'+r[0]+'</strong><span>'+r[1]+'</span></div></div>').join('');
}
function renderCrGrid(){
 const s=ensure(),p=s.profile,box=$('mskCharacterGrid'); if(!box)return;
 const vals=CHARACTERS.map(c=>n(p.characterRanks[c]));const total=vals.reduce((a,b)=>a+b,0);
 $('mskCrTotal').textContent=fmt(total);$('mskCrMax').textContent=fmt(Math.max(...vals));$('mskCrAt50').textContent=fmt(vals.filter(x=>x>=50).length);$('mskCrSummary').textContent='平均 CR '+(total/CHARACTERS.length).toFixed(1);
 box.innerHTML=CHARACTERS.map(c=>{const r=n(p.characterRanks[c]);return '<label class="msk-character"><strong>'+esc(c)+'</strong><small>'+esc(UNIT_MAP[c]||'')+'</small><input class="msk-cr-input" data-cr-character="'+esc(c)+'" type="number" min="0" max="'+CR_MAX+'" value="'+r+'"><div class="msk-progress"><i style="width:'+Math.min(100,r/CR_MAX*100)+'%"></i></div></label>';}).join('');
}
function renderCrTasks(){
 const s=ensure(),p=s.profile,sel=p.crSelected,box=$('mskCrMissions');$('mskCrCharacter').innerHTML=options(CHARACTERS,sel);
 const rows=p.crTasks[sel]||TASKS.map(()=>({done:false,note:''}));
 box.innerHTML=TASKS.map((t,i)=>'<div class="msk-mission"><input type="checkbox" data-cr-done="'+i+'" '+(rows[i]?.done?'checked':'')+'><div><strong>'+esc(t[0])+'</strong><p>'+esc(t[1])+'</p><textarea data-cr-note="'+i+'" placeholder="進度備註……">'+esc(rows[i]?.note||'')+'</textarea></div></div>').join('');
}
function renderCrResource(){
 const s=ensure(),r=s.profile.crResource;
 ['current','target','vialPerRank','fragPerRank','gemPerRank','vialOwn','fragOwn','gemOwn'].forEach(k=>{const ids={current:'mskCrCurrent',target:'mskCrTarget',vialPerRank:'mskVialPerRank',fragPerRank:'mskFragPerRank',gemPerRank:'mskGemPerRank',vialOwn:'mskVialOwn',fragOwn:'mskFragOwn',gemOwn:'mskGemOwn'};if($(ids[k]))$(ids[k]).value=r[k]??0;});
 const steps=Math.max(0,Math.min(CR_MAX,n(r.target))-Math.max(1,Math.min(CR_MAX,n(r.current,1))));
 const needV=steps*n(r.vialPerRank),needF=steps*n(r.fragPerRank),needG=steps*n(r.gemPerRank);
 const out=[['CR 級距',steps],['小瓶需求',needV],['碎片需求',needF],['純結晶需求',needG],['小瓶缺口',Math.max(0,needV-n(r.vialOwn))],['碎片缺口',Math.max(0,needF-n(r.fragOwn))],['純結晶缺口',Math.max(0,needG-n(r.gemOwn))]];
 $('mskCrResourceResult').innerHTML=out.map(x=>'<div class="msk-result"><small>'+x[0]+'</small><strong>'+fmt(x[1])+'</strong></div>').join('');
}
function renderRankCalc(){
 const s=ensure(),r=s.profile.rankCalc;const map={current:'mskRankCurrent',currentExp:'mskRankCurrentExp',target:'mskRankTarget',expPerLevel:'mskRankExpPerLevel',liveExp:'mskRankLiveExp'};Object.keys(map).forEach(k=>$(map[k]).value=r[k]??0);
 const cur=Math.max(1,Math.min(700,n(r.current,1))),target=Math.max(cur,Math.min(700,n(r.target,cur))),exp=Math.max(0,n(r.currentExp)),per=Math.max(1,n(r.expPerLevel,1000)),live=Math.max(1,n(r.liveExp,960));
 const levels=Math.max(0,target-cur),need=Math.max(0,levels*per-exp),lives=Math.ceil(need/live);
 $('mskRankResult').innerHTML=[['目標級距',levels],['剩餘 EXP',need],['預估場數',lives],['校正後單場 EXP',live]].map(x=>'<div class="msk-result"><small>'+x[0]+'</small><strong>'+fmt(x[1])+'</strong></div>').join('');
 $('mskRankMilestones').innerHTML=PLAYER_MILESTONES.map(x=>'<div><small>Rank '+x[0]+'</small><strong>'+esc(x[1])+'</strong></div>').join('');
}
function renderStats(){
 const s=ensure(),p=s.profile;const playMode=p.totalPlaysMode,clearMode=p.clearCountMode;
 $('mskPlayCountMode').value=playMode;$('mskClearCountMode').value=clearMode;$('mskManualPlays').value=p.manualPlays||0;$('mskManualClear').value=p.manualClear||0;
 const autoPlays=DIFFS.reduce((a,d)=>a+n(p.stats[d].plays),0),autoClear=DIFFS.reduce((a,d)=>a+n(p.stats[d].clear),0);
 const totalPlays=playMode==='auto'?autoPlays:n(p.manualPlays),totalClear=clearMode==='auto'?autoClear:n(p.manualClear);
 const fc=DIFFS.reduce((a,d)=>a+n(p.stats[d].fc),0),ap=DIFFS.reduce((a,d)=>a+n(p.stats[d].ap),0);
 $('mskTotalPlays').textContent=fmt(totalPlays);$('mskTotalClear').textContent=fmt(totalClear);$('mskTotalFc').textContent=fmt(fc);$('mskTotalAp').textContent=fmt(ap);
 $('mskStatsTable').innerHTML=DIFFS.map(d=>'<tr><th>'+d+'</th><td><input type="number" min="0" data-stat="'+d+'" data-stat-field="plays" value="'+n(p.stats[d].plays)+'"></td><td><input type="number" min="0" data-stat="'+d+'" data-stat-field="clear" value="'+n(p.stats[d].clear)+'"></td><td><input type="number" min="0" data-stat="'+d+'" data-stat-field="fc" value="'+n(p.stats[d].fc)+'"></td><td><input type="number" min="0" data-stat="'+d+'" data-stat-field="ap" value="'+n(p.stats[d].ap)+'"></td></tr>').join('');
 renderCharts();
}
function renderCharts(){
 const s=ensure(),stats=s.profile.stats; const fc=DIFFS.map(d=>n(stats[d].fc)),ap=DIFFS.map(d=>n(stats[d].ap)),clear=DIFFS.map(d=>n(stats[d].clear));
 const maxFc=Math.max(1,...fc),maxAp=Math.max(1,...ap);$('mskFcChart').innerHTML=DIFFS.map((d,i)=>'<div class="msk-bar-row"><span>'+d+'</span><div class="msk-bar-track"><i style="width:'+(fc[i]/maxFc*100)+'%"></i></div><strong>'+fmt(fc[i])+'</strong></div>').join('');
 $('mskApChart').innerHTML=DIFFS.map((d,i)=>'<div class="msk-bar-row"><span>'+d+'</span><div class="msk-bar-track"><i style="width:'+(ap[i]/maxAp*100)+'%"></i></div><strong>'+fmt(ap[i])+'</strong></div>').join('');
 const total=clear.reduce((a,b)=>a+b,0);let acc=0;const cols=['#52cfe8','#9179f5','#ff5b9d','#ff9450','#61c795','#ffd34f'];
 const stops=total?clear.map((v,i)=>{const a=acc/total*100;acc+=v;const b=acc/total*100;return cols[i]+' '+a+'% '+b+'%';}).join(', '):'#eceef4 0 100%';
 $('mskDifficultyPie').style.background='conic-gradient('+stops+')';
 $('mskPieLegend').innerHTML=DIFFS.map((d,i)=>'<div class="msk-legend-row"><i class="msk-legend-dot" style="background:'+cols[i]+'"></i><span>'+d+'</span><strong>'+fmt(clear[i])+'</strong></div>').join('');
}
function cardBackground(p){
 if(p.cardBgMode==='custom'&&p.cardBackground)return 'url("'+p.cardBackground.replace(/"/g,'&quot;')+'") center/cover no-repeat';
 if(p.cardBgMode==='midnight')return 'linear-gradient(135deg,#121421,#303750)';
 if(p.cardBgMode==='neon')return 'linear-gradient(135deg,#161327,#203b4d)';
 return 'linear-gradient(135deg,#202435,#4a4e78)';
}
function renderCardPreview(){
 const s=ensure(),p=s.profile,total=teamTalent(s),bg=$('mskCardPreview');bg.style.background=cardBackground(p);$('mskCardBgMode').value=p.cardBgMode||'gradient';$('mskCardName').textContent=p.name||'Player';$('mskCardTitle').textContent=p.title||'PLAYER';$('mskCardSignature').textContent=p.signature||'還沒有簽名。';$('mskCardId').textContent='ID '+(p.playerId||'未設定');$('mskCardTalent').textContent='TEAM '+fmt(Math.round(total));
}
function collectIdentity(){
 const s=ensure(),p=s.profile;p.playerId=String($('mskPlayerId').value||'').replace(/\D/g,'').slice(0,32);p.name=String($('mskPlayerName').value||'').trim().slice(0,80);p.signature=String($('mskSignature').value||'').trim().slice(0,120);p.title=String($('mskTitle').value||'PLAYER').trim().slice(0,60)||'PLAYER';p.titleSub=String($('mskTitleSub').value||'').trim().slice(0,60);p.source='local';p.loadedAt=new Date().toISOString();save();bridge.toast('My SEKAI 玩家資料已保存');renderIdentity();renderCardPreview();
}
function normalizeRawTeam(raw){
 let cards=[];for(const key of ['team','cards','members','userDeck','userCards'])if(Array.isArray(raw?.[key])&&raw[key].length){cards=raw[key];break;}
 if(!cards.length)cards=Array.isArray(raw?.user?.team)?raw.user.team:[];
 return Array.from({length:5},(_,i)=>{const x=cards[i]||{};const character=String(x.characterName||x.character_name||x.name||'');return{slot:i+1,characterName:character,characterId:String(x.characterId||x.character_id||''),cardId:String(x.cardId||x.card_id||''),cardName:String(x.cardName||x.card_name||''),attribute:String(x.attribute||x.attr||''),unit:String(x.unit||UNIT_MAP[character]||''),talent:Math.max(0,n(x.talent??x.power??x.cardPower)),power:Math.max(0,n(x.power??x.talent??0)),bonusPct:Math.max(0,n(x.bonusPct)),masterRank:Math.max(0,Math.min(5,n(x.masterRank))),skillLevel:Math.max(1,Math.min(10,n(x.skillLevel,1)))};});
}
function walk(root,fn,limit=300){const out=[],seen=new WeakSet(),stack=[root];while(stack.length&&out.length<limit){const x=stack.pop();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);if(fn(x))out.push(x);for(const v of Object.values(x))if(v&&typeof v==='object')stack.push(v);}return out}
function extractUser(raw){
 const hit=walk(raw,o=>{const keys=Object.keys(o).join(' ');return /(userId|playerId)/i.test(keys)&&/(name|rank|level)/i.test(keys)})[0];return hit||raw;
}
function extractRanks(raw,p){
 const map=new Map(CHARACTERS.map(x=>[x.replace(/\s/g,'').toLowerCase(),x]));const ranks={...p.characterRanks};const scan=o=>{if(!o||typeof o!=='object')return;for(const [k,v] of Object.entries(o)){const hit=map.get(String(k).replace(/\s/g,'').toLowerCase());if(hit&&(typeof v==='number'||/^\d+$/.test(String(v))))ranks[hit]=Math.max(0,Math.min(CR_MAX,n(v)));if(v&&typeof v==='object')scan(v)}};scan(raw);walk(raw,o=>{const name=String(o.characterName||o.character_name||'');const rank=n(o.characterRank??o.character_rank,NaN);const hit=map.get(name.replace(/\s/g,'').toLowerCase());if(hit&&Number.isFinite(rank))ranks[hit]=Math.max(0,Math.min(CR_MAX,rank));return false});return ranks;
}
async function loadPlayer(){
 const id=String($('mskPlayerId').value||'').replace(/\D/g,'');if(!id){bridge.toast('請輸入 Player ID');return}
 $('mskProfileStatus').textContent='正在讀取公開 Profile API……';
 try{
  const res=await fetch(bridge.profileApiBase+encodeURIComponent(id)+'/profile',{headers:{Accept:'application/json'},cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);
  const raw=await res.json(),u=extractUser(raw),s=ensure(),p=s.profile;
  p.playerId=String(u.userId||u.user_id||u.playerId||id).replace(/\D/g,'');p.name=String(u.name||u.nickname||u.userName||u.playerName||u.displayName||'Player');p.rank=Math.max(0,n(u.rank??u.level??u.userLevel??u.userRank));p.bio=String(u.bio||u.introduction||u.profileComment||'');p.power=Math.max(0,n(u.totalPower??u.power??u.teamPower??u.talent));p.source='api';p.loadedAt=new Date().toISOString();p.characterRanks=extractRanks(raw,p);
  const team=normalizeRawTeam(raw);if(team.some(x=>x.characterName||x.cardName||x.characterId||x.cardId||x.talent))s.team=team;
  save();renderAll();$('mskProfileStatus').textContent='API 讀取成功 · 已保存快取。';bridge.toast('玩家資料已載入');
 }catch(e){const s=ensure();s.profile.playerId=id;s.profile.source='local';save();$('mskProfileStatus').textContent='API 讀取失敗，已保留本地資料。';bridge.toast('API 無法讀取，已保留本機模式');}
}
function updateTeamField(el){
 const card=el.closest('[data-msk-team]');if(!card)return;const i=n(card.dataset.mskTeam);const s=ensure(),x=s.team[i],field=el.dataset.teamField;if(!x||!field)return;x[field]=field==='characterName'||field==='cardName'||field==='attribute'||field==='unit'?String(el.value):n(el.value);if(field==='characterName'&&!x.unit)x.unit=UNIT_MAP[x.characterName]||'';if(field==='talent')x.power=x.talent;s.team[i]=x;s.profile.teamTargets=s.profile.teamTargets||{attr:'',unit:''};scheduleSave();renderTeam();
}
function updateCr(el){
 const s=ensure(),p=s.profile,c=el.dataset.crCharacter;if(!c)return;p.characterRanks[c]=Math.max(0,Math.min(CR_MAX,n(el.value)));scheduleSave();renderCrGrid();renderTeam();
}
function updateCrTask(el){
 const s=ensure(),p=s.profile,i=n(el.dataset.crDone??el.dataset.crNote),rows=p.crTasks[p.crSelected];if(!rows)return;if(el.dataset.crDone!=null)rows[i].done=!!el.checked;else rows[i].note=String(el.value||'').slice(0,300);scheduleSave();
}
function updateResource(id,value){const s=ensure();s.profile.crResource[id]=Math.max(0,n(value));scheduleSave();renderCrResource();}
function updateRankCalc(id,value){const s=ensure();s.profile.rankCalc[id]=Math.max(0,n(value));scheduleSave();renderRankCalc();}
function updateStat(d,f,value){const s=ensure();s.profile.stats[d][f]=Math.max(0,n(value));scheduleSave();renderStats();}
function fileToDataURL(file){
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onload=()=>{const maxW=1280,maxH=720,scale=Math.min(maxW/img.width,maxH/img.height,1),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);let out=c.toDataURL('image/jpeg',.78);if(out.length>900000)out=c.toDataURL('image/jpeg',.62);resolve(out)};img.onerror=reject;img.src=reader.result}}); 
}
async function saveCardBg(file){
 try{const p=ensure().profile;p.cardBackground=await fileToDataURL(file);p.cardBgMode='custom';save();renderCardPreview();bridge.toast('背景圖片已保存');}catch(_){bridge.toast('圖片載入失敗');}
}
function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
async function exportCard(){
 const s=ensure(),p=s.profile,canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;const ctx=canvas.getContext('2d');
 if(p.cardBgMode==='custom'&&p.cardBackground){await new Promise(res=>{const im=new Image();im.onload=()=>{const scale=Math.max(canvas.width/im.width,canvas.height/im.height),w=im.width*scale,h=im.height*scale;ctx.drawImage(im,(canvas.width-w)/2,(canvas.height-h)/2,w,h);res()};im.onerror=()=>res();im.src=p.cardBackground;});}else{const g=ctx.createLinearGradient(0,0,1600,900);g.addColorStop(0,'#1f2235');g.addColorStop(1,p.cardBgMode==='neon'?'#1b4c61':p.cardBgMode==='midnight'?'#0b0e18':'#5a4e86');ctx.fillStyle=g;ctx.fillRect(0,0,1600,900)}
 ctx.fillStyle='rgba(8,10,17,.58)';ctx.fillRect(0,0,1600,900);ctx.fillStyle='rgba(82,207,232,.25)';ctx.fillRect(0,0,1600,7);
 ctx.fillStyle='#fff';ctx.font='900 30px sans-serif';ctx.fillText('PROJECT SEKAI · MY SEKAI',70,75);ctx.font='900 82px sans-serif';ctx.fillText(String(p.name||'Player').slice(0,18),70,190);ctx.font='800 23px sans-serif';ctx.fillStyle='rgba(255,255,255,.78)';ctx.fillText(String(p.title||'PLAYER').slice(0,34),72,236);ctx.font='600 24px sans-serif';ctx.fillText(String(p.signature||'').slice(0,58),72,282);ctx.font='700 20px sans-serif';ctx.fillText('ID '+(p.playerId||'UNSET'),72,338);ctx.fillText('RANK '+(p.rank?fmt(p.rank):'—'),72,370);ctx.fillText('TEAM TALENT '+fmt(Math.round(teamTalent(s))),72,402);
 const y=650,w=274,gap=18;s.team.forEach((x,i)=>{const px=70+i*(w+gap);ctx.fillStyle='rgba(255,255,255,.1)';roundedRect(ctx,px,y,w,165,18);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.24)';ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 19px sans-serif';ctx.fillText(String(i+1),px+16,y+30);ctx.font='800 16px sans-serif';ctx.fillText(String(x.characterName||x.cardName||'空卡槽').slice(0,15),px+16,y+62);ctx.font='600 12px sans-serif';ctx.fillStyle='rgba(255,255,255,.72)';ctx.fillText('MR '+n(x.masterRank)+' · SKILL '+n(x.skillLevel,1),px+16,y+91);ctx.fillText('TALENT '+fmt(n(x.talent??x.power)),px+16,y+116);});
 const a=document.createElement('a');a.download='pjsekai-player-card-'+(p.playerId||'local')+'.png';a.href=canvas.toDataURL('image/png');a.click();bridge.toast('16:9 玩家名片已匯出');
}
function bind(){
 $('mskSaveIdentity').onclick=collectIdentity;$('mskLoadPlayer').onclick=loadPlayer;
 ['mskPlayerId','mskPlayerName','mskSignature','mskTitle','mskTitleSub'].forEach(id=>$(id).addEventListener('input',scheduleSave));
 $('mskTargetAttr').addEventListener('change',e=>{ensure().profile.teamTargets.attr=e.target.value;scheduleSave();renderBonusLights()});
 $('mskTargetUnit').addEventListener('change',e=>{ensure().profile.teamTargets.unit=e.target.value;scheduleSave();renderBonusLights()});
 $('mskTeamGrid').addEventListener('change',e=>{if(e.target.matches('[data-team-field]'))updateTeamField(e.target)});
 $('mskTeamGrid').addEventListener('input',e=>{if(e.target.matches('[data-team-field]'))updateTeamField(e.target)});
 $('mskCrCharacter').addEventListener('change',e=>{ensure().profile.crSelected=e.target.value;scheduleSave();renderCrTasks();renderCrResource()});
 $('mskCharacterGrid').addEventListener('input',e=>{if(e.target.matches('[data-cr-character]'))updateCr(e.target)});
 $('mskCrMissions').addEventListener('change',e=>{if(e.target.matches('[data-cr-done]'))updateCrTask(e.target)});
 $('mskCrMissions').addEventListener('input',e=>{if(e.target.matches('[data-cr-note]'))updateCrTask(e.target)});
 ['current','target','vialPerRank','fragPerRank','gemPerRank','vialOwn','fragOwn','gemOwn'].forEach(k=>{const id={current:'mskCrCurrent',target:'mskCrTarget',vialPerRank:'mskVialPerRank',fragPerRank:'mskFragPerRank',gemPerRank:'mskGemPerRank',vialOwn:'mskVialOwn',fragOwn:'mskFragOwn',gemOwn:'mskGemOwn'}[k];$(id).addEventListener('input',e=>updateResource(k,e.target.value))});
 ['current','currentExp','target','expPerLevel','liveExp'].forEach(k=>{const id={current:'mskRankCurrent',currentExp:'mskRankCurrentExp',target:'mskRankTarget',expPerLevel:'mskRankExpPerLevel',liveExp:'mskRankLiveExp'}[k];$(id).addEventListener('input',e=>updateRankCalc(k,e.target.value))});
 $('mskPlayCountMode').addEventListener('change',e=>{ensure().profile.totalPlaysMode=e.target.value;scheduleSave();renderStats()});$('mskClearCountMode').addEventListener('change',e=>{ensure().profile.clearCountMode=e.target.value;scheduleSave();renderStats()});$('mskManualPlays').addEventListener('input',e=>{ensure().profile.manualPlays=n(e.target.value);scheduleSave();renderStats()});$('mskManualClear').addEventListener('input',e=>{ensure().profile.manualClear=n(e.target.value);scheduleSave();renderStats()});
 $('mskStatsTable').addEventListener('input',e=>{const d=e.target.dataset.stat,f=e.target.dataset.statField;if(d&&f)updateStat(d,f,e.target.value)});
 $('mskCardBgMode').addEventListener('change',e=>{ensure().profile.cardBgMode=e.target.value;scheduleSave();renderCardPreview()});$('mskCardBgInput').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)saveCardBg(file)});
 $('mskExportCard').onclick=exportCard;$('mskClearCardBg').onclick=()=>{const p=ensure().profile;p.cardBackground='';p.cardBgMode='gradient';save();renderCardPreview();bridge.toast('已清除自訂背景')};
 document.addEventListener('click',e=>{if(e.target.closest('.page[data-page="profile"]')){renderIdentity();renderCrGrid();renderStats();renderCardPreview();}});
}
function renderAll(){ensure();renderIdentity();renderTeam();renderCrGrid();renderCrTasks();renderCrResource();renderRankCalc();renderStats();renderCardPreview();}
bind();renderAll();
})();
