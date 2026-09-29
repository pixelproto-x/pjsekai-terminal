/* Dojo Controls v3 - simple, defensive, no fake engine integration */
(function(){
'use strict';
const B=window.__PJSEKAI_APP__;
if(!B)return;
const $=id=>document.getElementById(id);
const n=(v,d=0)=>{const x=Number(String(v??'').replace(/[^\d.-]/g,''));return Number.isFinite(x)?x:d;};

const SERVERS=[
 {id:'sekai-best',name:'Sekai Viewer',kind:'Project SEKAI 官方 / 社群譜面',url:'https://sonolus.sekai.best/',deep:'https://sonolus.sekai.best/'},
 {id:'next-sekai',name:'Next SEKAI',kind:'Project SEKAI 社群譜面',url:'https://coconut.sonolus.com/next-sekai',deep:'https://coconut.sonolus.com/next-sekai'},
 {id:'untitled-charts',name:'UntitledCharts',kind:'Project SEKAI 社群譜面',url:'https://untitledcharts.com/',deep:'https://untitledcharts.com/'},
 {id:'bestdori-official',name:'Bestdori Official',kind:'Bestdori 官方譜面環境',url:'https://sonolus.bestdori.com/official',deep:'https://sonolus.bestdori.com/official'},
 {id:'bestdori-community',name:'Bestdori Community',kind:'Bestdori 社群自製譜面',url:'https://sonolus.bestdori.com/community',deep:'https://sonolus.bestdori.com/community'}
];
const DEFAULT_KEYS=['D','F','J','K'];
const DEFAULTS={server:'sekai-best',speed:10,mirror:false,sudden:false,hidden:false,audioOffset:0,visualOffset:0,keys:DEFAULT_KEYS.slice(),selectedSong:'',selectedDifficulty:'Expert'};

function ensure(){
 const s=B.getState();
 s.dojo=s.dojo&&typeof s.dojo==='object'?s.dojo:{};
 s.dojo={...DEFAULTS,...s.dojo,keys:Array.isArray(s.dojo.keys)?s.dojo.keys.slice(0,4):DEFAULT_KEYS.slice()};
 while(s.dojo.keys.length<4)s.dojo.keys.push(DEFAULT_KEYS[s.dojo.keys.length]);
 s.dojo.speed=Math.max(1,Math.min(12,n(s.dojo.speed,10)));
 s.dojo.audioOffset=n(s.dojo.audioOffset);
 s.dojo.visualOffset=n(s.dojo.visualOffset);
 s.dojo.server=SERVERS.some(x=>x.id===s.dojo.server)?s.dojo.server:'sekai-best';
 return s;
}
function save(){try{B.save();}catch(_){}}
function currentDifficulty(){
 const active=document.querySelector('[data-dojo-diff].active');
 return active?.dataset?.dojoDiff||$('dojoSelectedDifficulty')?.textContent?.trim()||ensure().dojo.selectedDifficulty||'Expert';
}
function getConfig(){
 const s=ensure();
 const title=$('dojoSelectedTitle')?.textContent?.trim()||s.dojo.selectedSong||'';
 const difficulty=currentDifficulty();
 s.dojo.selectedSong=title==='尚未選擇歌曲'?'':title;
 s.dojo.selectedDifficulty=difficulty||'Expert';
 return {
  version:1,server:s.dojo.server,speed:s.dojo.speed,
  mirror:!!s.dojo.mirror,sudden:!!s.dojo.sudden,hidden:!!s.dojo.hidden,
  audioOffset:n(s.dojo.audioOffset),visualOffset:n(s.dojo.visualOffset),
  keys:s.dojo.keys.slice(0,4),song:s.dojo.selectedSong,difficulty:s.dojo.selectedDifficulty
 };
}
function status(mode,message){
 const el=$('dojoBridgeStatus');if(!el)return;
 el.className='dojo-bridge-status '+(mode||'');
 const strong=el.querySelector('strong'),span=el.querySelector('span');
 if(strong)strong.textContent=mode==='ack'?'引擎已回應':mode==='loaded'?'Sonolus Web 已載入':'等待引擎回應';
 if(span)span.textContent=String(message??'');
}
function log(message){
 const el=$('dojoApiLog');if(el)el.innerHTML='<strong>BRIDGE</strong> '+String(message).replace(/[<>]/g,'');
}
function sendConfig(reason){
 const frame=$('dojoSonolusIframe');
 if(!frame?.contentWindow){status('','練習區尚未載入');return false;}
 const payload={source:'pjsekai-terminal',channel:'sonolus-dojo',type:'config',version:1,reason,config:getConfig()};
 try{
   frame.contentWindow.postMessage(payload,'https://sonolus.com');
   status('loaded','已送出設定；外部 Sonolus Web 沒有回 ACK 時，不會顯示「已套用」。');
   log(reason+' → 設定已送出');
   return true;
 }catch(_){
   status('','瀏覽器拒絕跨來源訊息');
   return false;
 }
}
function renderServers(){
 const s=ensure(),selected=s.dojo.server;
 const select=$('dojoServerSelect');
 if(select){
   select.innerHTML=SERVERS.map(x=>'<option value="'+x.id+'">'+x.name+' · '+x.kind+'</option>').join('');
   select.value=selected;
 }
 const box=$('dojoServerGrid');
 if(box){
   box.innerHTML=SERVERS.map(x=>'<button class="dojo-server-option '+(x.id===selected?'active':'')+'" type="button" data-dojo-server="'+x.id+'"><strong>'+x.name+'</strong><span>'+x.kind+'</span></button>').join('');
 }
 const cur=SERVERS.find(x=>x.id===selected)||SERVERS[0];
 if($('dojoSelectedServerName'))$('dojoSelectedServerName').textContent=cur.name;
 if($('dojoSelectedServerUrl'))$('dojoSelectedServerUrl').textContent=cur.url;
 if($('dojoServerQuickName'))$('dojoServerQuickName').textContent=cur.name;
}
function renderSettings(){
 const d=ensure().dojo;
 if($('dojoSpeedRange'))$('dojoSpeedRange').value=String(d.speed);
 if($('dojoSpeedValue'))$('dojoSpeedValue').textContent=Number(d.speed).toFixed(1);
 if($('dojoAudioOffset'))$('dojoAudioOffset').value=String(d.audioOffset);
 if($('dojoVisualOffset'))$('dojoVisualOffset').value=String(d.visualOffset);
 ['mirror','sudden','hidden'].forEach(k=>{
   const el=$('dojoToggle_'+k);if(!el)return;
   el.classList.toggle('active',!!d[k]);el.setAttribute('aria-pressed',String(!!d[k]));
 });
 document.querySelectorAll('[data-dojo-key]').forEach((el,i)=>el.value=d.keys[i]||DEFAULT_KEYS[i]);
 document.querySelectorAll('[data-virtual-lane]').forEach((el,i)=>el.textContent=d.keys[i]||DEFAULT_KEYS[i]);
}
function render(){renderServers();renderSettings();}
function setServer(id){
 const s=ensure(),x=SERVERS.find(v=>v.id===id);if(!x)return;
 s.dojo.server=x.id;save();render();
 status('','已選擇 '+x.name+'。按「在 Sonolus 開啟」前往該譜面伺服器。');
 log('server='+x.url);
}
async function copyText(value){
 try{await navigator.clipboard.writeText(value);B.toast('已複製伺服器網址');}
 catch(_){B.toast('無法自動複製，請手動複製網址');}
}
function openNative(){
 const x=SERVERS.find(v=>v.id===ensure().dojo.server)||SERVERS[0];
 location.href='sonolus://'+x.deep.replace(/^https?:\/\//,'').replace(/\/$/,'');
 setTimeout(()=>window.open(x.url,'_blank','noopener,noreferrer'),700);
}
function openWeb(){
 const x=SERVERS.find(v=>v.id===ensure().dojo.server)||SERVERS[0];
 window.open(x.url,'_blank','noopener,noreferrer');
}
function bind(){
 $('dojoServerSelect')?.addEventListener('change',e=>setServer(e.target.value));
 $('dojoServerGrid')?.addEventListener('click',e=>{
   const b=e.target.closest('[data-dojo-server]');if(b)setServer(b.dataset.dojoServer);
 });
 $('dojoCopyServerBtn')?.addEventListener('click',()=>{
   const x=SERVERS.find(v=>v.id===ensure().dojo.server)||SERVERS[0];copyText(x.url);
 });
 $('dojoOpenServerBtn')?.addEventListener('click',openNative);
 const webBtn=$('dojoOpenServerWebBtn');
 if(webBtn)webBtn.addEventListener('click',openWeb);

 $('dojoSpeedRange')?.addEventListener('input',e=>{
   const s=ensure();s.dojo.speed=Math.max(1,Math.min(12,n(e.target.value,10)));
   if($('dojoSpeedValue'))$('dojoSpeedValue').textContent=Number(s.dojo.speed).toFixed(1);
   save();sendConfig('note-speed');
 });
 [['audioOffset','dojoAudioOffset'],['visualOffset','dojoVisualOffset']].forEach(([key,id])=>{
   $(id)?.addEventListener('input',e=>{ensure().dojo[key]=n(e.target.value);save();sendConfig(key);});
 });
 ['mirror','sudden','hidden'].forEach(k=>{
   $('dojoToggle_'+k)?.addEventListener('click',()=>{
     const s=ensure();s.dojo[k]=!s.dojo[k];save();renderSettings();sendConfig(k);
   });
 });
 document.querySelectorAll('[data-dojo-key]').forEach(el=>el.addEventListener('input',e=>{
   const i=n(e.target.dataset.dojoKey),s=ensure();let value=String(e.target.value||'').trim().slice(0,2).toUpperCase();
   if(!value)value=DEFAULT_KEYS[i];s.dojo.keys[i]=value;save();
   const virtual=document.querySelector('[data-virtual-lane="'+i+'"]');if(virtual)virtual.textContent=value;
   sendConfig('key-map');
 }));
 document.querySelectorAll('[data-virtual-lane]').forEach(btn=>btn.addEventListener('click',()=>{
   btn.classList.add('pressed');setTimeout(()=>btn.classList.remove('pressed'),120);
   sendConfig('virtual-key-'+btn.dataset.virtualLane);
 }));
 $('dojoResetSettingsBtn')?.addEventListener('click',()=>{
   const s=ensure();s.dojo={...s.dojo,...DEFAULTS,keys:DEFAULT_KEYS.slice()};save();render();sendConfig('reset');B.toast('遊玩設定已恢復預設');
 });
 $('dojoBridgeRetryBtn')?.addEventListener('click',()=>sendConfig('manual-retry'));
 $('dojoFullscreenBtn')?.addEventListener('click',async()=>{
   const x=$('dojoFrameShellInner');if(!x)return;
   try{if(!document.fullscreenElement)await x.requestFullscreen();else await document.exitFullscreen();}
   catch(_){B.toast('此瀏覽器不允許全螢幕');}
 });
 $('dojoSonolusIframe')?.addEventListener('load',()=>{
   status('loaded','Sonolus Web 已載入。練習時請在 Sonolus 內選擇伺服器與 LEVEL。');
   sendConfig('iframe-load');
 });
 window.addEventListener('message',e=>{
   if(e.origin!=='https://sonolus.com'||e.data?.source!=='sonolus'||e.data?.channel!=='sonolus-dojo')return;
   if(e.data?.type==='config-ack'){status('ack','外部引擎已回覆 ACK；設定已收到。');log('ACK');}
 });
}
function boot(){ensure();render();bind();window.setTimeout(()=>sendConfig('boot'),700);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();