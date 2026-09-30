/* System Settings Center · features 95-103 */
(function(){
"use strict";
var ROOT=document.documentElement;
var REPO="pixelproto-x/pjsekai-terminal";
var GITHUB="https://github.com/"+REPO;
var CHANGES_API="https://api.github.com/repos/"+REPO+"/commits?per_page=30";
var KEY={unit:"pjsekai-unit-theme-v1",dark:"pjsekai-dark-mode-v1",perf:"pjsekai-performance-mode-v1"};
var UNIT_THEMES={
 "leo":"Leo/need","mmj":"MORE MORE JUMP!","vbs":"Vivid BAD SQUAD","wxs":"Wonderlands×Showtime","25ji":"25時、ナイトコードで。"
};
var UNIT_COLORS={
 leo:["#52cfe8","#6aa4ff"],mmj:["#ff5b9d","#ff9bcb"],vbs:["#ff9450","#ffd34f"],wxs:["#9179f5","#ff70bd"],"25ji":["#5967a8","#b9b9d5"]
};
function $(id){return document.getElementById(id)}
function json(k,d){try{var x=JSON.parse(localStorage.getItem(k)||"null");return x==null?d:x}catch(_){return d}}
function setJson(k,v){localStorage.setItem(k,JSON.stringify(v))}
function toast(s){window.__PJSEKAI_APP__?.toast?.(s)}
function makeMount(){
 var settings=document.querySelector('.page[data-page="settings"]');if(!settings||$("systemSettingsMount"))return;
 var section=document.createElement("section");section.className="settings-card";section.id="systemSettingsMount";
 section.innerHTML='<div class="ssc-head"><div><div class="ssc-kicker">SYSTEM CENTER · 95—103</div><h2>系統設定中心</h2><p>團體主題、暗黑顯示、效能模式、完整備份、版本紀錄與 GitHub 開發者入口。</p></div><span class="ssc-badge">LOCAL + GITHUB</span></div>'+
 '<div class="ssc-block"><div class="ssc-title"><strong>95 · 團體主題色</strong><span>即時套用主要 UI 色彩；保留原本六大 SEKAI 主題功能。</span></div><div class="ssc-unit-grid" id="sscUnitGrid"></div><div class="ssc-status" id="sscUnitStatus"></div></div>'+
 '<div class="ssc-block"><div class="ssc-title"><strong>96 · Dark Mode</strong><span>手動／跟隨系統；設定保存在本機。</span></div><div class="ssc-segment" id="sscDarkMode"><button data-dark="light" type="button">☀ 淺色</button><button data-dark="dark" type="button">☾ 深色</button><button data-dark="system" type="button">◐ 跟隨系統</button></div><div class="ssc-status" id="sscDarkStatus"></div></div>'+
 '<div class="ssc-block"><div class="ssc-title"><strong>97 · 效能模式</strong><span>關閉毛玻璃、陰影與非必要動畫，適合低階裝置。</span></div><label class="ssc-switch"><input id="sscPerf" type="checkbox"><span></span><b>效能模式</b></label><div class="ssc-status" id="sscPerfStatus"></div></div>'+
 '<div class="ssc-block"><div class="ssc-title"><strong>98 · UI 語言框架</strong><span>沿用現有 AI 翻譯框架，支援繁中／日文／英文及更多語言；目前語言選擇仍由 Settings 主頁保存。</span></div><div class="ssc-lang-status" id="sscLangStatus"></div><button class="ssc-action" id="sscLangJump" type="button">前往語言設定</button></div><div class="ssc-block"><div class="ssc-title"><strong>99–101 · 全站資料中心</strong><span>完整備份此網站建立的 LocalStorage 資料；不會上傳到伺服器。</span></div><div class="ssc-data-grid"><button class="ssc-action primary" id="sscExportAll" type="button">⇩ 匯出全站 JSON</button><button class="ssc-action" id="sscImportAll" type="button">⇧ 匯入全站 JSON</button><button class="ssc-action" id="sscCopyStorage" type="button">⧉ 複製儲存摘要</button><button class="ssc-action danger" id="sscResetExtras" type="button">↺ 重設新增設定</button></div><input id="sscImportFile" type="file" accept="application/json,.json" hidden><div class="ssc-status" id="sscDataStatus"></div></div>'+
 '<div class="ssc-block"><div class="ssc-title"><strong>102 · 系統更新與 Changelog</strong><span>從 GitHub 公開 Repository 即時讀取最近提交紀錄。</span></div><div class="ssc-change-actions"><button class="ssc-action" id="sscChangesRefresh" type="button">↻ 更新紀錄</button><a class="ssc-action" href="'+GITHUB+'/commits/main" target="_blank" rel="noopener noreferrer">完整 Commit 紀錄 ↗</a></div><div id="sscChanges" class="ssc-changes"><div class="ssc-loading">尚未載入</div></div></div>'+
 '<div class="ssc-block"><div class="ssc-title"><strong>103 · GitHub Repo / 開發者回報</strong><span>直接前往原始碼、Issues 與回報頁。</span></div><div class="ssc-link-grid"><a href="'+GITHUB+'" target="_blank" rel="noopener noreferrer"><b>GitHub Repo</b><small>檢視原始碼與版本</small></a><a href="'+GITHUB+'/issues" target="_blank" rel="noopener noreferrer"><b>Issues</b><small>查看公開問題</small></a><a href="'+GITHUB+'/issues/new?labels=bug&title=%5BBug%5D%20" target="_blank" rel="noopener noreferrer"><b>回報 Bug</b><small>建立新問題</small></a><a href="'+GITHUB+'/issues/new?labels=enhancement&title=%5BFeature%5D%20" target="_blank" rel="noopener noreferrer"><b>功能建議</b><small>提出新功能</small></a></div></div>';
 settings.insertBefore(section,settings.querySelector('.page-head')?.nextSibling||settings.firstChild);
}
function readUnit(){return localStorage.getItem(KEY.unit)||"leo"}
function applyUnit(id,save){
 id=UNIT_THEMES[id]?id:"leo";var c=UNIT_COLORS[id];
 var targets=[ROOT,document.body];targets.forEach(function(t){if(!t)return;t.style.setProperty("--unit-primary",c[0]);t.style.setProperty("--unit-secondary",c[1]);t.style.setProperty("--theme-accent",c[0]);t.style.setProperty("--theme-accent-2",c[1]);t.style.setProperty("--theme-glow","rgba("+parseInt(c[0].slice(1,3),16)+","+parseInt(c[0].slice(3,5),16)+","+parseInt(c[0].slice(5,7),16)+",.28)");t.style.setProperty("--theme-glow-2","rgba("+parseInt(c[1].slice(1,3),16)+","+parseInt(c[1].slice(3,5),16)+","+parseInt(c[1].slice(5,7),16)+",.20)")});ROOT.dataset.unitTheme=id;
 var st=$("sscUnitStatus");if(st)st.textContent="目前團體主題："+UNIT_THEMES[id];
 document.querySelectorAll("[data-ssc-unit]").forEach(function(b){b.classList.toggle("active",b.dataset.sscUnit===id)});
 if(save)localStorage.setItem(KEY.unit,id)
}
function renderUnit(){
 var g=$("sscUnitGrid");if(!g)return;
 g.innerHTML=Object.keys(UNIT_THEMES).map(function(id){var c=UNIT_COLORS[id];return'<button type="button" class="ssc-unit" data-ssc-unit="'+id+'"><i style="background:linear-gradient(135deg,'+c[0]+','+c[1]+')"></i><b>'+UNIT_THEMES[id]+'</b><small>'+id.toUpperCase()+'</small></button>'}).join("");
 g.querySelectorAll("[data-ssc-unit]").forEach(function(b){b.onclick=function(){applyUnit(b.dataset.sscUnit,true);toast("團體主題已切換")}})
 applyUnit(readUnit(),false)
}
function effectiveDark(mode){if(mode==="system")return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches?"dark":"light";return mode}
function applyDark(mode,save){
 mode=["light","dark","system"].includes(mode)?mode:"system";ROOT.dataset.darkMode=effectiveDark(mode);ROOT.classList.toggle("is-dark",effectiveDark(mode)==="dark");
 document.querySelectorAll("[data-dark]").forEach(function(b){b.classList.toggle("active",b.dataset.dark===mode)});
 var st=$("sscDarkStatus");if(st)st.textContent="目前模式："+({"light":"淺色","dark":"深色","system":"跟隨系統"}[mode]);
 if(save)localStorage.setItem(KEY.dark,mode)
}
function initDark(){var m=localStorage.getItem(KEY.dark)||"system";applyDark(m,false);window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change",function(){if((localStorage.getItem(KEY.dark)||"system")==="system")applyDark("system",false)});$("sscDarkMode")?.addEventListener("click",function(e){var b=e.target.closest("[data-dark]");if(b)applyDark(b.dataset.dark,true)})}
function applyPerf(on,save){ROOT.classList.toggle("perf-mode",!!on);if($("sscPerf"))$("sscPerf").checked=!!on;var st=$("sscPerfStatus");if(st)st.textContent=on?"已關閉 Blur、陰影與主要動畫":"標準視覺效果";if(save)localStorage.setItem(KEY.perf,on?"1":"0")}
function bindData(){
 $("sscPerf")?.addEventListener("change",function(){applyPerf(this.checked,true)});
 $("sscExportAll")?.addEventListener("click",exportAll);
 $("sscImportAll")?.addEventListener("click",()=>$("sscImportFile")?.click());
 $("sscImportFile")?.addEventListener("change",importAll);
 $("sscCopyStorage")?.addEventListener("click",copyStorage);
 $("sscResetExtras")?.addEventListener("click",function(){if(!confirm("確定只重設本次新增的系統設定嗎？My SEKAI、卡片、抽卡等資料不會刪除。"))return;[KEY.unit,KEY.dark,KEY.perf].forEach(function(k){localStorage.removeItem(k)});applyUnit("leo",false);applyDark("system",false);applyPerf(false,false);toast("新增系統設定已重設")});
 $("sscChangesRefresh")?.addEventListener("click",loadChanges);
 $("sscLangJump")?.addEventListener("click",function(){document.getElementById("languageSelect")?.scrollIntoView({behavior:"smooth",block:"center"});document.getElementById("languageSelect")?.focus()});
}
function buildBackup(){
 var all={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k!=null)all[k]=localStorage.getItem(k)}
 return {format:"pjsekai-terminal-full-backup",version:2,exportedAt:new Date().toISOString(),repository:REPO,localStorage:all};
}
function download(name,data){var b=new Blob([data],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000)}
function exportAll(){var payload=JSON.stringify(buildBackup(),null,2),date=new Date().toISOString().slice(0,10);download("pjsekai-terminal-full-backup-"+date+".json",payload);$("sscDataStatus").textContent="已匯出 "+Object.keys(buildBackup().localStorage).length+" 個 LocalStorage 項目";toast("全站 JSON 備份已匯出")}
function importAll(e){var f=e.target.files?.[0];e.target.value="";if(!f)return;f.text().then(function(t){var p=JSON.parse(t);if(p.format!=="pjsekai-terminal-full-backup"||!p.localStorage)throw Error("格式");var keep={};Object.keys(p.localStorage).forEach(function(k){keep[k]=String(p.localStorage[k])});if(!confirm("匯入後會覆蓋同名本機資料並重新整理頁面，確定嗎？"))return;Object.keys(keep).forEach(function(k){localStorage.setItem(k,keep[k])});location.reload()}).catch(function(){toast("JSON 備份格式無效")})}
function renderLanguageStatus(){var s=$("sscLangStatus"),lang=localStorage.getItem("sekaiLanguage")||"auto";if(!s)return;var labels={"auto":"自動（瀏覽器語言）","zh-TW":"繁體中文（台灣）","zh-CN":"简体中文",en:"English",ja:"日本語",ko:"한국어"};s.textContent="目前："+(labels[lang]||lang)+" · 語言設定仍由主頁設定元件管理"}
function copyStorage(){var list=[],bytes=0;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i),v=localStorage.getItem(k)||"";if(k){list.push(k);bytes+=k.length+v.length}}var txt="Project SEKAI 工具箱\nLocalStorage keys: "+list.length+"\nApprox chars: "+bytes+"\nUnit theme: "+readUnit()+"\nDark mode: "+(localStorage.getItem(KEY.dark)||"system")+"\nPerformance: "+(localStorage.getItem(KEY.perf)==="1"?"on":"off");var clip=navigator.clipboard?.writeText;if(typeof clip==="function"){clip.call(navigator.clipboard,txt).then(function(){$("sscDataStatus").textContent="儲存摘要已複製";toast("儲存摘要已複製")}).catch(function(){$("sscDataStatus").textContent=txt})}else{$("sscDataStatus").textContent=txt}}
async function loadChanges(){
 var box=$("sscChanges");if(!box)return;box.innerHTML='<div class="ssc-loading">從 GitHub 讀取中…</div>';
 try{
  var r=await fetch(CHANGES_API,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);var rows=await r.json();
  box.innerHTML=rows.slice(0,20).map(function(x){var msg=String(x.commit?.message||"").split("\n")[0],date=x.commit?.author?.date?new Date(x.commit.author.date).toLocaleString("zh-TW"):"";return'<article class="ssc-change"><div><time>'+esc(date)+'</time><strong>'+esc(msg)+'</strong><small>'+esc(x.sha.slice(0,7))+' · '+esc(x.author?.login||x.commit?.author?.name||"GitHub")+'</small></div><a href="'+esc(x.html_url)+'" target="_blank" rel="noopener">查看 ↗</a></article>'}).join("")||'<div class="ssc-loading">目前沒有 Commit。</div>';
  $("sscDataStatus")?.setAttribute("data-ok","1");
 }catch(_){box.innerHTML='<div class="ssc-loading">GitHub API 暫時無法讀取。可用上方「完整 Commit 紀錄」開啟 GitHub 查看。</div>'}
}
function esc(v){return String(v??"").replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
makeMount();renderUnit();initDark();applyPerf(localStorage.getItem(KEY.perf)==="1",false);bindData();renderLanguageStatus();loadChanges();document.addEventListener("click",function(e){if(e.target.closest(".theme-choice[data-theme]"))setTimeout(function(){applyUnit(readUnit(),false)},0)});
})();
