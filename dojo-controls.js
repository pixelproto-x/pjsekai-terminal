/* Dojo Controls v2 - external Sonolus wrapper */
(function(){
'use strict';
const B=window.__PJSEKAI_APP__;
if(!B)return;
const $=id=>document.getElementById(id);
const n=(v,d=0)=>{const x=Number(String(v??'').replace(/[^\d.-]/g,''));return Number.isFinite(x)?x:d};
const SERVERS=[
 {id:'sekai-best',name:'Sekai Viewer',kind:'Project SEKAI 官方譜面環境',url:'https://sonolus.sekai.best/',deep:'https://sonolus.sekai.best/',tone:'CYAN'},
 {id:'next-sekai',name:'Next SEKAI',kind:'Project SEKAI 社群自製譜面',url:'https://coconut.sonolus.com/next-sekai',deep:'https://coconut.sonolus.com/next-sekai',tone:'VIOLET'},
 {id:'untitled-charts',name:'UntitledCharts',kind:'Project SEKAI 社群自製譜面',url:'https://untitledcharts.com/',deep:'https://untitledcharts.com/',tone:'PINK'},
 {id:'bestdori-official',name:'Bestdori Official',kind:'Bestdori 官方譜面環境',url:'https://sonolus.bestdori.com/official',deep:'https://sonolus.bestdori.com/official',tone:'ORANGE'},
 {id:'bestdori-community',name:'Bestdori Community',kind:'Bestdori 社群自製譜面',url:'https://sonolus.bestdori.com/community',deep:'https://sonolus.bestdori.com/community',tone:'YELLOW'}
];
const DEFAULT_KEYS=['D','F','J','K'];
const DEFAULTS={server:'sekai-best',speed:10,mirror:false,sudden:false,hidden:false,audioOffset:0,visualOffset:0,keys:DEFAULT_KEYS.slice(),selectedSong:'',selectedDifficulty:'Expert'};
function ensure(){
 const s=B.getState();s.dojo=s.dojo&&typeof s.dojo==='object'?s.dojo:{};
 s.dojo={...DEFAULTS,...s.dojo,keys:Array.isArray(s.dojo.keys)?s.dojo.keys.slice(0,4):DEFAULT_KEYS.slice()};
 while(s.dojo.keys.length<4)s.dojo.keys.push(DEFAULT_KEYS[s.dojo.keys.length]);
 s.dojo.speed=Math.max(1,Math.min(12,n(s.dojo.speed,10)));s.dojo.audioOffset=n(s.dojo.audioOffset);s.dojo.visualOffset=n(s.dojo.visualOffset);
 s.dojo.server=SERVERS.some(x=>x.id===s.dojo.server)?s.dojo.server:'sekai-best';return s;
}
function save(){try{B.save()}catch(_){}}
function getConfig(){const s=ensure();const song=$('dojoSelectedTitle')?.textContent?.trim()||s.dojo.selectedSong||'';const difficulty=$('dojoSelectedDifficulty')?.textContent?.trim()||s.dojo.selectedDifficulty||'Expert';s.dojo.selectedSong=song==='尚未選擇歌曲'?'':song;s.dojo.selectedDifficulty=difficulty||'Expert';return{version:1,server:s.dojo.server,speed:s.dojo.speed,mirror:!!s.dojo.mirror,sudden:!!s.dojo.sudden,hidden:!!s.dojo.hidden,audioOffset:n(s.dojo.audioOffset),visualOffset:n(s.dojo.visualOffset),keys:s.dojo.keys.slice(0,4),song:s.dojo.selectedSong,difficulty:s.dojo.selectedDifficulty}}
function status(mode,text){
 const el=$('dojoBridgeStatus');if(!el)return;
 el.className='dojo-bridge-status '+mode;
 const strong=el.querySelector('strong'),span=el.querySelector('span');
 if(strong)strong.textContent=mode==='ack'?'打歌控制已連線':mode==='loaded'?'本地播放器已載入':mode==='unsupported'?'部分控制尚未接通':'等待本地播放器';
 if(span)span.textContent=text;
}
function log(msg){const el=$('dojoApiLog');if(el)el.innerHTML='<strong>LOCAL CORE</strong> '+String(msg).replace(/[<>]/g,'')}
function runtime(){
 const frame=$('dojoSonolusIframe');
 try{return frame?.contentWindow?.__pjPracticeRuntime||null}catch(_){return null}
}
function selectedPractice(){
 try{
   if(typeof dojoState!=='undefined'&&dojoState.song){
     const diff=String(dojoState.difficulty||'Expert');
     const playLevel=Number(dojoState.song.diffs?.[diff]||0);
     return {title:String(dojoState.song.title||''),difficulty:diff.toLowerCase(),playLevel};
   }
 }catch(_){}
 const title=$('dojoSelectedTitle')?.textContent?.trim()||'';
 const difficulty=$('dojoSelectedDifficulty')?.textContent?.trim()||'Expert';
 return {title:title==='尚未選擇歌曲'?'':title,difficulty:difficulty.toLowerCase(),playLevel:0};
}
function practiceUrl(){
 const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0],sel=selectedPractice();
 const u=new URL('./sonolus-web/',location.href);
 u.searchParams.set('server',x.url.replace(/\/$/,''));
 if(sel.title)u.searchParams.set('title',sel.title);
 if(sel.difficulty)u.searchParams.set('difficulty',sel.difficulty);
 if(sel.playLevel)u.searchParams.set('playLevel',String(sel.playLevel));
 return u.href;
}
function openPractice(force=false){
 const frame=$('dojoSonolusIframe');if(!frame)return false;
 const url=practiceUrl();
 if(force||frame.src!==url)frame.src=url;
 practiceRecoveryAttempts=0;
 $('dojoFrameShell')?.scrollIntoView({behavior:'smooth',block:'center'});
 status('', '正在載入同源 Sonolus 打歌核心，並依目前歌曲與難度初始化。');
 log('load '+url);
 return true;
}

let practiceRecoveryAttempts=0;
let practiceRecoveryTimer=0;
function armPracticeRecovery(){
 const frame=$('dojoSonolusIframe');
 if(!frame)return;
 if(practiceRecoveryTimer)window.clearTimeout(practiceRecoveryTimer);
 const expected=frame.src;
 const started=Date.now();
 const check=()=>{
   if(!frame || frame.src!==expected)return;
   let disabled=false,hasStart=false,ready=false;
   try{
     const doc=frame.contentDocument;
     const btn=doc?.querySelector('.start-play-trg');
     hasStart=!!btn;
     disabled=!!btn?.hasAttribute('disabled');
     const r=frame.contentWindow?.__pjPracticeRuntime;
     ready=!!r&&Number(r.getDuration?.()||0)>0;
   }catch(_){}
   if(ready||((hasStart&&!disabled)&&Date.now()-started>1000)){
     practiceRecoveryAttempts=0;
     return;
   }
   if(Date.now()-started<15000){
     practiceRecoveryTimer=window.setTimeout(check,1000);
     return;
   }
   if(hasStart&&disabled&&practiceRecoveryAttempts<2){
     practiceRecoveryAttempts++;
     status('','Sonolus 載入卡住，正在自動重新載入核心（'+practiceRecoveryAttempts+'/2）……');
     log('auto-retry SourceLoad '+practiceRecoveryAttempts);
     frame.src='';
     window.setTimeout(()=>{ if(frame)frame.src=expected; },80);
     practiceRecoveryTimer=window.setTimeout(armPracticeRecovery,120);
     return;
   }
   if(hasStart&&disabled){
     status('unsupported','播放器的 START 持續停用，載入流程可能卡住。請查看下方引擎紀錄，或重新載入練習核心。');
     log('SourceLoad remained disabled after automatic recovery');
     return;
   }
   status('unsupported','在等待期間尚未取得有效播放時鐘；歌曲載入可能仍在進行，或發生錯誤。請查看引擎紀錄後再重試。');
   log('runtime readiness timeout');
 };
 practiceRecoveryTimer=window.setTimeout(check,1000);
}
function practiceTime(){
 try{return Number(runtime()?.getTime?.()||0)}catch(_){return 0}
}
function practiceDuration(){
 try{return Number(runtime()?.getDuration?.()||0)}catch(_){return 0}
}
const practice={a:0,b:1,loop:false,speed:1,duration:0,busy:false,lastKey:''};
function fmtPracticeTime(v){
 v=Math.max(0,Number(v)||0);
 const m=Math.floor(v/60),s=(v-m*60).toFixed(1).padStart(4,'0');
 return String(m).padStart(2,'0')+':'+s;
}
function renderPracticeControls(){
 const dur=practice.duration;
 const a=$('dojoLoopA'),b=$('dojoLoopB'),ao=$('dojoLoopAValue'),bo=$('dojoLoopBValue');
 if(a){a.max=String(Math.max(.01,dur||1));a.value=String(Math.min(practice.a,Math.max(.01,dur||1)));}
 if(b){b.max=String(Math.max(.01,dur||1));b.value=String(Math.max(practice.a+.01,Math.min(practice.b,Math.max(.01,dur||1))));}
 if(ao)ao.textContent=fmtPracticeTime(practice.a);
 if(bo)bo.textContent=fmtPracticeTime(practice.b);
 const lt=$('dojoLoopToggle');
 if(lt){lt.classList.toggle('active',practice.loop);lt.setAttribute('aria-pressed',String(practice.loop));}
 document.querySelectorAll('[data-practice-speed]').forEach(x=>x.classList.toggle('active',Number(x.dataset.practiceSpeed)===practice.speed));
}
async function resetPractice(time=0){
 const r=runtime();if(!r||typeof r.reset!=='function'||practice.busy){noRuntimeMessage('瞬發重置');return false}
 practice.busy=true;
 status('ack','正在重置同源 Sonolus 播放核心……');
 try{
   await r.reset(Math.max(0,Number(time)||0));
   practice.duration=practiceDuration()||practice.duration;
   renderPracticeControls();
   status('ack','已重置到 '+fmtPracticeTime(time)+'。');
   log('reset('+fmtPracticeTime(time)+')');
   return true;
 }catch(e){
   console.error('[Dojo local reset]',e);
   status('', '播放器尚未完成初始化，請稍後再試。');
   log('reset error');
   return false;
 }finally{practice.busy=false;}
}
function sendConfig(reason){
 const r=runtime();
 const cfg=getConfig();
 if(!r){
   status('', '設定已保存於本機；等待同源 Sonolus 播放核心就緒後再套用。');
   log(reason+' → saved locally; runtime not ready');
   return false;
 }
 try{
   const applied=[];
   if(typeof r.setSettings==='function'){r.setSettings(cfg);applied.push('設定');}
   else if(typeof r.setConfig==='function'){r.setConfig(cfg);applied.push('設定');}
   else{
     if(typeof r.setNoteSpeed==='function'){r.setNoteSpeed(Number(cfg.speed));applied.push('Note Speed');}
     if(typeof r.setMirror==='function'){r.setMirror(!!cfg.mirror);applied.push('Mirror');}
     if(typeof r.setSudden==='function'){r.setSudden(!!cfg.sudden);applied.push('Sudden');}
     if(typeof r.setHidden==='function'){r.setHidden(!!cfg.hidden);applied.push('Hidden');}
     if(typeof r.setAudioOffset==='function'){r.setAudioOffset(Number(cfg.audioOffset));applied.push('Audio Offset');}
     if(typeof r.setVisualOffset==='function'){r.setVisualOffset(Number(cfg.visualOffset));applied.push('Visual Offset');}
     if(typeof r.setKeys==='function'){r.setKeys(cfg.keys.slice());applied.push('Key Mapping');}
   }
   if(!applied.length){
     status('unsupported','播放器已連線。播放時間、定位、重置和 0.5×／0.75×／1.0×播放倍率由 runtime 支援；Note Speed、Mirror、Sudden／Hidden、偏移與按鍵映射尚無對應 setter，這些值目前只保存於本機。');
     log(reason+' → persisted; unsupported setters: speed/mirror/visibility/offsets/keys');
     return false;
   }
   status('ack','播放器已接受：'+applied.join('、')+'。其他設定仍未確認生效。');
   log(reason+' → runtime: '+applied.join(', '));
   return true;
 }catch(e){
   console.error('[Dojo local config]',e);
   status('unsupported','播放器拒絕設定；資料仍保存在本機，但沒有套用到遊戲。');
   log(reason+' → runtime config error');
   return false;
 }
}
function noRuntimeMessage(action){
 const ready=!!runtime();
 const why=ready?'目前打歌 runtime 沒有提供此控制方法':'同源打歌 runtime 尚未初始化完成';
 status('unsupported',why+'；'+action+'沒有套用。播放倍率與時間定位只會在播放器回報相對應的方法時執行。');
 log(action+' unavailable: '+(ready?'unsupported runtime method':'runtime not ready'));
}
function runtimeHas(...methods){
 const r=runtime();
 return !!r&&methods.every(name=>typeof r[name]==='function')?r:null;
}
function updatePracticeSelection(){
 const sel=selectedPractice(),key=sel.title+'|'+sel.difficulty+'|'+sel.playLevel;
 if(key===practice.lastKey)return;
 const hadSelection=!!practice.lastKey;
 practice.lastKey=key;
 const frame=$('dojoSonolusIframe');
 const hasLoadedFrame=!!frame&&frame.src&&!/about:blank$/.test(frame.src);
 // Prevent background polling from repeatedly restarting SourceLoad. Song/difficulty
 // are passed on the next explicit click of "開啟練習室".
 if(hadSelection&&hasLoadedFrame&&sel.title){
   status('loaded','歌曲或難度已更新；按「開啟練習室」即可載入新選擇。');
   log('selection changed; waiting for explicit practice launch');
 }
}function renderServers(){
 const s=ensure(),box=$('dojoServerGrid');if(!box)return;
 box.innerHTML=SERVERS.map(x=>'<button class="dojo-server-option '+(x.id===s.dojo.server?'active':'')+'" type="button" data-dojo-server="'+x.id+'"><strong>'+x.name+'</strong><span>'+x.kind+'</span><b class="dojo-server-badge">'+x.tone+'</b></button>').join('');
 const cur=SERVERS.find(x=>x.id===s.dojo.server)||SERVERS[0];$('dojoSelectedServerName').textContent=cur.name;$('dojoSelectedServerUrl').textContent=cur.url;
}
function renderSettings(){
 const s=ensure(),d=s.dojo;
 $('dojoSpeedRange').value=d.speed;$('dojoSpeedValue').textContent=Number(d.speed).toFixed(1);
 $('dojoAudioOffset').value=d.audioOffset;$('dojoVisualOffset').value=d.visualOffset;
 ['mirror','sudden','hidden'].forEach(k=>{const el=$('dojoToggle_'+k);el.classList.toggle('active',!!d[k]);el.setAttribute('aria-pressed',String(!!d[k]))});
 const keys=d.keys.slice(0,4);document.querySelectorAll('[data-dojo-key]').forEach((el,i)=>el.value=keys[i]||'');document.querySelectorAll('[data-virtual-lane]').forEach((el,i)=>el.textContent=keys[i]||DEFAULT_KEYS[i]);
}
function render(){
 renderServers();renderSettings();
 const s=ensure(),cur=SERVERS.find(x=>x.id===s.dojo.server)||SERVERS[0];const quick=$('dojoServerQuickName');if(quick)quick.textContent=cur.name;
}
function setServer(id){
 const s=ensure(),x=SERVERS.find(v=>v.id===id);if(!x)return;s.dojo.server=id;save();render();
 $('dojoSelectedServerName').textContent=x.name;
 status('', '伺服器已選定：'+x.name+'。Sonolus Web 官方目前沒有公開證實的跨 iframe 遠端伺服器切換 API，因此這裡提供「選定 + 深連結」而不是偽裝成 iframe 已切換。');
 log('server='+x.url);
}
async function copyText(v){try{await navigator.clipboard.writeText(v);B.toast('已複製伺服器網址')}catch(_){B.toast('無法自動複製，請手動複製')}} 
function nativeServerLink(serverUrl){
 const u=new URL(serverUrl);
 return 'sonolus://'+u.host+u.pathname.replace(/\/+$/,'')+u.search+u.hash;
}
function openNative(){
 const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0];
 const target=nativeServerLink(x.url);
 status('', '正在嘗試開啟 Sonolus App。若沒有跳出 App，請先安裝／開啟 Sonolus，再按一次。');
 log('open native '+target);
 window.location.href=target;
}
function bind(){
 $('dojoServerGrid')?.addEventListener('click',e=>{const b=e.target.closest('[data-dojo-server]');if(b)setServer(b.dataset.dojoServer)});
 $('dojoCopyServerBtn')?.addEventListener('click',()=>{const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0];copyText(x.url)});
 $('dojoOpenServerBtn')?.addEventListener('click',openNative);
 $('dojoOpenServerWebBtn')?.addEventListener('click',()=>{const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0];window.open(x.url,'_blank','noopener,noreferrer')});
 $('dojoSpeedRange')?.addEventListener('input',e=>{ensure().dojo.speed=Math.max(1,Math.min(12,n(e.target.value,10)));$('dojoSpeedValue').textContent=Number(e.target.value).toFixed(1);save();sendConfig('note-speed')});
 [['audioOffset','dojoAudioOffset'],['visualOffset','dojoVisualOffset']].forEach(([k,id])=>$(id)?.addEventListener('input',e=>{ensure().dojo[k]=n(e.target.value);save();sendConfig(k)}));
 ['mirror','sudden','hidden'].forEach(k=>$('dojoToggle_'+k)?.addEventListener('click',()=>{const s=ensure();s.dojo[k]=!s.dojo[k];save();renderSettings();sendConfig(k)}));
 document.querySelectorAll('[data-dojo-key]').forEach(el=>el.addEventListener('input',e=>{const i=n(e.target.dataset.dojoKey),s=ensure();let v=String(e.target.value||'').trim().slice(0,2).toUpperCase();if(!v)v=DEFAULT_KEYS[i];s.dojo.keys[i]=v;const vk=document.querySelector('[data-virtual-lane="'+i+'"]');if(vk)vk.textContent=v;save();sendConfig('key-map')}));
 document.querySelectorAll('[data-virtual-lane]').forEach(btn=>btn.addEventListener('click',()=>{const i=n(btn.dataset.virtualLane);btn.classList.add('pressed');setTimeout(()=>btn.classList.remove('pressed'),120);log('virtual lane '+(i+1));}));
 $('dojoResetSettingsBtn')?.addEventListener('click',()=>{const s=ensure();s.dojo={...s.dojo,...DEFAULTS,keys:DEFAULT_KEYS.slice()};save();render();sendConfig('reset-settings')});
 $('dojoBridgeRetryBtn')?.addEventListener('click',()=>openPractice(true));
 $('dojoFullscreenBtn')?.addEventListener('click',async()=>{const x=$('dojoFrameShellInner');try{if(!document.fullscreenElement)await x.requestFullscreen();else await document.exitFullscreen()}catch(_){B.toast('此瀏覽器不允許全螢幕')}});
 $('dojoSonolusIframe')?.addEventListener('load',()=>{practiceRecoveryAttempts=0;status('loaded','本地 Sonolus 頁面已載入，正在等待歌曲引擎與有效播放時長。');log('iframe load');setTimeout(()=>{sendConfig('iframe-ready');armPracticeRecovery();},350)});
 $('dojoOpenPracticeBtn')?.addEventListener('click',()=>openPractice(true));

 $('dojoLoopToggle')?.addEventListener('click',()=>{if(!practice.loop&&!runtimeHas('getTime','getDuration','reset')){noRuntimeMessage('A-B 循環');return;}practice.loop=!practice.loop;renderPracticeControls();status('ack',practice.loop?'A-B 循環已開啟。':'A-B 循環已關閉。');});
 $('dojoLoopA')?.addEventListener('input',e=>{const dur=practice.duration||practiceDuration()||1;practice.a=Math.max(0,Math.min(Number(e.target.value)||0,Math.max(.0,practice.b-.01)));$('dojoLoopAValue').textContent=fmtPracticeTime(practice.a);const r=runtimeHas('seek');if(r)r.seek(practice.a);else noRuntimeMessage('A 起點定位');});
 $('dojoLoopB')?.addEventListener('input',e=>{const dur=practice.duration||practiceDuration()||1;practice.b=Math.min(dur,Math.max(practice.a+.01,Number(e.target.value)||dur));$('dojoLoopBValue').textContent=fmtPracticeTime(practice.b);if(!runtimeHas('getDuration'))noRuntimeMessage('B 終點設定');});
 $('dojoLoopASet')?.addEventListener('click',()=>{const r=runtimeHas('getTime','seek');if(!r){noRuntimeMessage('目前位置設為 A');return;}practice.a=Math.min(practiceDuration()||practice.b||1,Math.max(0,practiceTime()));renderPracticeControls();r.seek(practice.a);});
 $('dojoLoopBSet')?.addEventListener('click',()=>{const r=runtimeHas('getTime','getDuration');if(!r){noRuntimeMessage('目前位置設為 B');return;}practice.b=Math.max(practice.a+.01,Math.min(practiceDuration()||practice.b||1,practiceTime()));renderPracticeControls();});
 document.querySelectorAll('[data-practice-speed]').forEach(btn=>btn.addEventListener('click',()=>{const r=runtimeHas('setRate');if(!r){noRuntimeMessage('播放速度');return;}practice.speed=Number(btn.dataset.practiceSpeed)||1;document.querySelectorAll('[data-practice-speed]').forEach(x=>x.classList.toggle('active',x===btn));r.setRate(practice.speed);status('ack','播放速度 '+practice.speed+'×');}));
 $('dojoPracticeResetBtn')?.addEventListener('click',()=>resetPractice(0));
 window.addEventListener('message',e=>{if(e.source!==$('dojoSonolusIframe')?.contentWindow)return;if(e.data?.source!=='pjsekai-local-sonolus')return;if(e.data.type==='ready'){practice.duration=Number(e.data.duration||practiceDuration()||practice.duration||1);practice.b=practice.duration;renderPracticeControls();status('ack','同源 Sonolus 特訓核心已就緒。');}});
 window.addEventListener('keydown',e=>{const tag=document.activeElement?.tagName||'';const inSongs=!!document.querySelector('.page[data-page="songs"].active');if(inSongs&&e.key.toLowerCase()==='r'&&!/input|textarea|select|button/i.test(tag)&&!document.activeElement?.isContentEditable&&runtimeHas('reset')){e.preventDefault();resetPractice(0)}});
 setInterval(updatePracticeSelection,700);
 function loopTick(){
   const r=runtime(),d=r?Number(r.getDuration?.()||0):0;
   if(d>0&&practice.duration!==d){practice.duration=d;if(practice.b<=0||practice.b>1e9)practice.b=d;renderPracticeControls();}
   if(r&&!practice.busy&&practice.loop&&practice.duration>0){
     const t=Number(r.getTime?.()||0);
     if(t>=practice.b-.025)resetPractice(practice.a);
   }
   requestAnimationFrame(loopTick);
 }
 requestAnimationFrame(loopTick);
}function boot(){ensure();render();bind();window.setTimeout(()=>sendConfig('boot'),500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
