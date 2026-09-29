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
 const el=$('dojoBridgeStatus');if(!el)return;el.className='dojo-bridge-status '+mode;el.querySelector('strong').textContent=mode==='ack'?'引擎橋接已回應':mode==='loaded'?'iframe 已載入':'等待引擎橋接';
 el.querySelector('span').textContent=text;
}
function log(msg){const el=$('dojoApiLog');if(el)el.innerHTML='<strong>BRIDGE</strong> '+String(msg).replace(/[<>]/g,'')}
function sendConfig(reason){
 const frame=$('dojoSonolusIframe');if(!frame||!frame.contentWindow)return false;
 const payload={source:'pjsekai-terminal',channel:'sonolus-dojo',type:'config',version:1,reason,config:getConfig()};
 try{
  frame.contentWindow.postMessage(payload,'https://sonolus.com');
  status('loaded','已送出候選設定；只有引擎端明確回 ACK 才會顯示「已套用」。');
  log(reason+' → postMessage 已送出（等待 ACK）');return true;
 }catch(_){status('','瀏覽器拒絕跨來源訊息');return false}
}
function renderServers(){
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
 const s=ensure(),cur=SERVERS.find(x=>x.id===s.dojo.server)||SERVERS[0];$('dojoServerQuickName').textContent=cur.name;
}
function setServer(id){
 const s=ensure(),x=SERVERS.find(v=>v.id===id);if(!x)return;s.dojo.server=id;save();render();
 $('dojoSelectedServerName').textContent=x.name;
 status('', '伺服器已選定：'+x.name+'。Sonolus Web 官方目前沒有公開證實的跨 iframe 遠端伺服器切換 API，因此這裡提供「選定 + 深連結」而不是偽裝成 iframe 已切換。');
 log('server='+x.url);
}
async function copyText(v){try{await navigator.clipboard.writeText(v);B.toast('已複製伺服器網址')}catch(_){B.toast('無法自動複製，請手動複製')}} 
function openNative(){
 const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0];
 const host=x.deep.replace(/^https?:\/\//,'').replace(/\/$/,'');
 const link='sonolus://'+host;
 location.href=link;
 setTimeout(()=>window.open(x.url,'_blank','noopener,noreferrer'),700);
}
function bind(){
 $('dojoServerGrid')?.addEventListener('click',e=>{const b=e.target.closest('[data-dojo-server]');if(b)setServer(b.dataset.dojoServer)});
 $('dojoCopyServerBtn')?.addEventListener('click',()=>{const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0];copyText(x.url)});
 $('dojoOpenServerBtn')?.addEventListener('click',openNative);
 $('dojoOpenServerWebBtn')?.addEventListener('click',()=>{const s=ensure(),x=SERVERS.find(v=>v.id===s.dojo.server)||SERVERS[0];window.open(x.url,'_blank','noopener,noreferrer')});
 $('dojoSpeedRange')?.addEventListener('input',e=>{ensure().dojo.speed=Math.max(1,Math.min(12,n(e.target.value,10)));$('dojoSpeedValue').textContent=Number(e.target.value).toFixed(1);save();sendConfig('note-speed')});
 [['audioOffset','dojoAudioOffset'],['visualOffset','dojoVisualOffset']].forEach(([k,id])=>$(id)?.addEventListener('input',e=>{ensure().dojo[k]=n(e.target.value);save();sendConfig(k)}));
 ['mirror','sudden','hidden'].forEach(k=>$('dojoToggle_'+k)?.addEventListener('click',()=>{const s=ensure();s.dojo[k]=!s.dojo[k];save();renderSettings();sendConfig(k)}));
 document.querySelectorAll('[data-dojo-key]').forEach(el=>el.addEventListener('input',e=>{const i=n(e.target.dataset.dojoKey);const s=ensure();let v=String(e.target.value||'').trim().slice(0,2).toUpperCase();if(!v)v=DEFAULT_KEYS[i];s.dojo.keys[i]=v;const vk=document.querySelector('[data-virtual-lane="'+i+'"]');if(vk)vk.textContent=v;save();sendConfig('key-map')}));
 document.querySelectorAll('[data-virtual-lane]').forEach(btn=>btn.addEventListener('click',()=>{const i=n(btn.dataset.virtualLane),s=ensure();btn.classList.add('pressed');setTimeout(()=>btn.classList.remove('pressed'),120);sendConfig('virtual-key-'+i)}));
 $('dojoResetSettingsBtn')?.addEventListener('click',()=>{const s=ensure();s.dojo={...s.dojo,...DEFAULTS,keys:DEFAULT_KEYS.slice()};save();render();sendConfig('reset')});
 $('dojoBridgeRetryBtn')?.addEventListener('click',()=>sendConfig('manual-retry'));
 $('dojoFullscreenBtn')?.addEventListener('click',async()=>{const x=$('dojoFrameShellInner');try{if(!document.fullscreenElement)await x.requestFullscreen();else await document.exitFullscreen()}catch(_){B.toast('此瀏覽器不允許全螢幕')}});
 $('dojoSonolusIframe')?.addEventListener('load',()=>{status('loaded','Sonolus Web iframe 已載入。正在等待引擎端橋接回 ACK。');sendConfig('iframe-load')});
 window.addEventListener('message',e=>{
   if(e.origin!=='https://sonolus.com')return;
   if(e.data?.source!=='sonolus')return;
   if(e.data?.channel!=='sonolus-dojo')return;
   if(e.data?.type==='config-ack'){status('ack','引擎已回覆 ACK。只有收到這個回應才視為設定已套用。');log('ACK '+JSON.stringify(e.data.config||{}).slice(0,900));}
 });
}
function boot(){ensure();render();bind();window.setTimeout(()=>sendConfig('boot'),500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
