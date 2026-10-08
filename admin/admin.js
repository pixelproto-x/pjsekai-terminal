import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const C=window.PJSEKAI_ADMIN_CONFIG||{};
const DENIED=new URL(C.deniedPath||"/pjsekai-terminal/__admin_denied__",location.origin).href;
const S={supabase:null,user:null,profile:null,errors:[],api:[],commit:"—"};

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function toast(m){const e=$("toast");if(!e)return;e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function gate(m,d=""){if($("gateText"))$("gateText").textContent=m;if($("gateDetail"))$("gateDetail").textContent=d}
function deny(){location.replace(DENIED)}
function addError(type,message,source){S.errors.unshift({type,message,source,time:new Date().toLocaleString("zh-TW")});S.errors=S.errors.slice(0,50);renderErrors()}

async function init(){
  if(!C.supabaseUrl||!C.supabaseAnonKey){gate("後台尚未完成後端連線。","請建立 Supabase 專案、啟用 Google 登入，再填入 admin/config.js 的 URL 與 anon key。");return}
  S.supabase=createClient(C.supabaseUrl,C.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data:{session}}=await S.supabase.auth.getSession();
  if(!session){
    gate("正在開啟 Google 登入…");
    const r=await S.supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:new URL(C.redirectPath||"/pjsekai-terminal/admin/",location.origin).href}});
    if(r.error)gate("Google 登入失敗。",r.error.message);
    return;
  }
  S.user=session.user;
  await authorize();
}

async function authorize(){
  gate("正在確認白名單…",S.user.email||"");
  const r=await S.supabase.from("admin_users").select("id,email,display_name,role,status,created_at,updated_at").eq("id",S.user.id).maybeSingle();
  if(r.error){gate("後端權限檢查失敗。",r.error.message);return}
  if(!r.data||r.data.status!=="active"){await S.supabase.auth.signOut();setTimeout(deny,150);return}
  S.profile=r.data;
  $("gate").classList.add("hidden");$("app").classList.remove("hidden");
  $("roleBadge").textContent=r.data.role.toUpperCase();
  $("signedUser").textContent=(r.data.display_name||r.data.email)+" · "+r.data.email;
  applyRoleRules();bind();await refreshAll();
}

function applyRoleRules(){
  const owner=S.profile.role==="owner",staff=owner||S.profile.role==="admin";
  $("addUserBtn").classList.toggle("hidden",!owner);
  document.querySelector('[data-view="users"]').classList.toggle("hidden",!owner);
  if(!staff)document.querySelectorAll('[data-view="dojo"],[data-view="data"],[data-view="settings"]').forEach(e=>e.classList.add("hidden"));
}

function bind(){
  document.querySelectorAll(".side-item").forEach(b=>b.addEventListener("click",function(){
    document.querySelectorAll(".side-item").forEach(x=>x.classList.toggle("active",x===b));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.panel===b.dataset.view));
    if(b.dataset.view==="users")loadUsers();
    if(b.dataset.view==="errors")renderErrors();
    if(b.dataset.view==="analytics")renderLocalStats();
  }));
  $("refreshBtn").onclick=refreshAll;$("apiRefresh").onclick=checkApis;$("dataRefresh").onclick=checkData;
  $("logoutBtn").onclick=async()=>{await S.supabase.auth.signOut();location.reload()};
  $("clearErrorsBtn").onclick=()=>{S.errors=[];renderErrors();toast("已清除")};
  $("addUserBtn").onclick=()=>$("userDialog").showModal();
  $("userForm").addEventListener("submit",async e=>{if(e.submitter&&e.submitter.value==="cancel")return;e.preventDefault();await createUser()});
  $("saveDojoBtn").onclick=saveDojo;$("saveSiteBtn").onclick=saveSite;
  window.addEventListener("error",e=>addError("window.error",e.message,e.filename?e.filename+":"+e.lineno:""));
  window.addEventListener("unhandledrejection",e=>addError("unhandledrejection",(e.reason&&e.reason.message)||String(e.reason||"Unknown rejection"),""));
}

async function refreshAll(){renderErrors();renderLocalStats();await Promise.all([checkApis(),checkData(),loadRecentLogs(),loadSiteSettings(),loadLatestCommit(),loadUsers()])}

async function checkApis(){
  const targets=[
    ["Musics raw","https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/musics.json"],
    ["Music Difficulties","https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/musicDifficulties.json"],
    ["MoeSekai BPM","https://raw.githubusercontent.com/StarMoe-org/MoeSekai-Hub/main/data/music_bpm/music_bpms.json"],
    ["Dojo local list",new URL("../dojo-musics.json",import.meta.url).href]
  ];
  const box=$("apiStatusList");
  box.innerHTML=targets.map(t=>'<div class="status-row"><span class="dot"></span><span class="status-name">'+esc(t[0])+'</span><span class="status-note">檢查中…</span><span class="latency">—</span></div>').join("");
  const rows=[...box.children],results=[];
  for(let i=0;i<targets.length;i++){
    const start=performance.now();
    try{
      const r=await fetch(targets[i][1],{cache:"no-store"}),ms=Math.round(performance.now()-start),ok=r.ok;
      rows[i].querySelector(".dot").classList.add(ok?"ok":"bad");
      rows[i].querySelector(".status-note").textContent="HTTP "+r.status;
      rows[i].querySelector(".status-note").classList.add(ok?"ok":"bad");
      rows[i].querySelector(".latency").textContent=ms+" ms";
      results.push({name:targets[i][0],ok,status:r.status,ms});
    }catch(e){
      const ms=Math.round(performance.now()-start);
      rows[i].querySelector(".dot").classList.add("bad");
      rows[i].querySelector(".status-note").textContent="Network Error";
      rows[i].querySelector(".status-note").classList.add("bad");
      rows[i].querySelector(".latency").textContent=ms+" ms";
      results.push({name:targets[i][0],ok:false,status:0,ms,error:e.message});
    }
  }
  S.api=results;
  const bad=results.filter(x=>!x.ok).length;
  $("metricData").textContent=(results.length-bad)+"/"+results.length;
}

async function checkData(){
  const targets=[
    ["Songs","musics.json","https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/musics.json"],
    ["Charts","musicDifficulties.json","https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/musicDifficulties.json"],
    ["BPM","music_bpms.json","https://raw.githubusercontent.com/StarMoe-org/MoeSekai-Hub/main/data/music_bpm/music_bpms.json"],
    ["Dojo","dojo-musics.json",new URL("../dojo-musics.json",import.meta.url).href],
    ["Jacket","1/1.webp","https://storage.sekai.best/sekai-jp-assets/music/jacket/1/1.webp"]
  ];
  const box=$("dataCards");
  box.innerHTML=targets.map(t=>'<article class="data-card"><b>'+esc(t[0])+'</b><small>'+esc(t[1])+'</small><div class="mini-status">檢查中…</div></article>').join("");
  const cards=[...box.children];
  for(let i=0;i<targets.length;i++){
    try{
      const r=await fetch(targets[i][2],{method:i===4?"HEAD":"GET",cache:"no-store"});
      const e=cards[i].querySelector(".mini-status");e.textContent=r.ok?"可用 · HTTP "+r.status:"異常 · HTTP "+r.status;e.style.color=r.ok?"#61d69a":"#ff718a";
    }catch(e){cards[i].querySelector(".mini-status").textContent="網路無法連線";cards[i].querySelector(".mini-status").style.color="#ff718a"}
  }
}

async function loadLatestCommit(){
  try{
    const r=await fetch("https://api.github.com/repos/pixelproto-x/pjsekai-terminal/commits/main",{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
    const x=await r.json();S.commit=(x.sha||"").slice(0,7)||"—";$("metricCommit").textContent=S.commit;
  }catch{$("metricCommit").textContent="—"}
}

async function loadUsers(){
  const r=await S.supabase.from("admin_users").select("*").order("created_at",{ascending:false});
  if(r.error){$("usersTable").innerHTML='<tr><td colspan="6">無法讀取白名單。</td></tr>';return}
  const rows=r.data||[];$("metricAdmins").textContent=rows.filter(x=>x.status==="active").length;
  $("usersTable").innerHTML=rows.length?rows.map(x=>{
    const actions=S.profile.role==="owner"&&x.id!==S.profile.id?'<div class="row-actions"><button type="button" data-toggle="'+esc(x.id)+'" data-status="'+esc(x.status)+'">'+(x.status==="active"?"停用":"啟用")+'</button><button type="button" data-role="'+esc(x.id)+'">角色</button></div>':"—";
    return '<tr><td>'+esc(x.email)+'</td><td>'+esc(x.display_name||"—")+'</td><td><span class="role-chip '+esc(x.role)+'">'+esc(x.role.toUpperCase())+'</span></td><td><span class="state-chip '+esc(x.status)+'">'+esc(x.status==="active"?"ACTIVE":"DISABLED")+'</span></td><td>'+esc(new Date(x.created_at).toLocaleDateString("zh-TW"))+'</td><td>'+actions+'</td></tr>';
  }).join(""):'<tr><td colspan="6">尚未建立管理員。</td></tr>';
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>toggleUser(b.dataset.toggle,b.dataset.status));
  document.querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>changeRole(b.dataset.role));
}

async function createUser(){
  const id=$("newUserId").value.trim(),email=$("newUserEmail").value.trim(),name=$("newUserName").value.trim(),role=$("newUserRole").value;
  const r=await S.supabase.from("admin_users").insert({id,email,display_name:name,role,status:"active"});
  if(r.error){toast(r.error.message);return}
  await log("whitelist.add",id,{email,role});$("userDialog").close();$("userForm").reset();toast("已加入白名單");await loadUsers();await loadRecentLogs();
}
async function toggleUser(id,current){
  const next=current==="active"?"disabled":"active";
  const r=await S.supabase.from("admin_users").update({status:next,updated_at:new Date().toISOString()}).eq("id",id);
  if(r.error){toast(r.error.message);return}
  await log("whitelist.status",id,{status:next});toast(next==="active"?"已啟用":"已停用");await loadUsers();await loadRecentLogs();
}
async function changeRole(id){
  const role=prompt("輸入新角色：owner / admin / viewer");
  if(!role||!["owner","admin","viewer"].includes(role))return;
  const r=await S.supabase.from("admin_users").update({role,updated_at:new Date().toISOString()}).eq("id",id);
  if(r.error){toast(r.error.message);return}
  await log("whitelist.role",id,{role});toast("角色已更新");await loadUsers();await loadRecentLogs();
}
async function log(action,target,metadata){
  try{await S.supabase.from("admin_logs").insert({actor_id:S.user.id,actor_email:S.user.email,action,target_id:String(target||""),metadata:metadata||{}})}catch(e){console.warn("Audit log failed",e)}
}
async function loadRecentLogs(){
  const b=$("recentLogs"),r=await S.supabase.from("admin_logs").select("action,actor_email,created_at").order("created_at",{ascending:false}).limit(8);
  if(r.error){b.innerHTML='<div class="log-row"><strong>尚未有 Audit Log</strong><small>完成 Supabase RLS 後，管理操作會記錄。</small></div>';return}
  b.innerHTML=r.data&&r.data.length?r.data.map(x=>'<div class="log-row"><strong>'+esc(x.action)+'</strong><small>'+esc(x.actor_email||"—")+' · '+esc(new Date(x.created_at).toLocaleString("zh-TW"))+'</small></div>').join(""):'<div class="log-row"><strong>目前沒有紀錄</strong><small>新的管理操作會記錄在這裡。</small></div>';
}

async function loadSiteSettings(){
  const r=await S.supabase.from("site_settings").select("key,value");
  const map=Object.fromEntries((r.data||[]).map(x=>[x.key,x.value]));
  $("maintenanceEnabled").checked=Boolean(map.maintenance_enabled&&map.maintenance_enabled.enabled);
  $("siteNotice").value=(map.site_notice&&map.site_notice.text)||"";
  const dojo=map.dojo_enabled&&map.dojo_enabled.enabled;
  $("dojoEnabled").checked=dojo===undefined||Boolean(dojo);
  $("dojoAllDifficulties").checked=!(map.dojo_all_difficulties&&map.dojo_all_difficulties.enabled===false);
  $("metricDojo").textContent=$("dojoEnabled").checked?"ON":"OFF";
  $("dojoState").textContent=$("dojoEnabled").checked?"Enabled":"Disabled";
  $("dojoSyncBadge").textContent="既有前端同步";
}
async function saveDojo(){
  const now=new Date().toISOString(),enabled=$("dojoEnabled").checked;
  const r=await S.supabase.from("site_settings").upsert([
    {key:"dojo_enabled",value:{enabled},updated_by:S.user.id,updated_at:now},
    {key:"dojo_all_difficulties",value:{enabled:$("dojoAllDifficulties").checked},updated_by:S.user.id,updated_at:now}
  ]);
  if(r.error){toast(r.error.message);return}
  await log("dojo.settings","dojo",{enabled,all_difficulties:$("dojoAllDifficulties").checked});
  $("metricDojo").textContent=enabled?"ON":"OFF";$("dojoState").textContent=enabled?"Enabled":"Disabled";toast("Dojo 設定已儲存");
}
async function saveSite(){
  const now=new Date().toISOString();
  const r=await S.supabase.from("site_settings").upsert([
    {key:"maintenance_enabled",value:{enabled:$("maintenanceEnabled").checked},updated_by:S.user.id,updated_at:now},
    {key:"site_notice",value:{text:$("siteNotice").value.trim()},updated_by:S.user.id,updated_at:now}
  ]);
  if(r.error){toast(r.error.message);return}
  await log("site.settings","site",{maintenance_enabled:$("maintenanceEnabled").checked});toast("網站設定已儲存");
}
function renderErrors(){
  const b=$("errorsList");
  if(!S.errors.length){b.innerHTML='<div class="error-row" style="border-left-color:#61d69a"><strong>目前沒有錯誤</strong><small>此後台工作階段尚未捕捉到 JavaScript Error。</small></div>';return}
  b.innerHTML=S.errors.map(x=>'<article class="error-row"><strong>'+esc(x.type)+' · '+esc(x.message)+'</strong><small>'+esc(x.source)+' · '+esc(x.time)+'</small></article>').join("");
}
function renderLocalStats(){
  const keys=[];for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
  const rows=[["LocalStorage 項目",localStorage.length],["目前頁面",location.pathname],["相關設定 keys",keys.filter(x=>/dojo|sekai/i.test(x||"")).length],["瀏覽器語言",navigator.language]];
  $("localStats").innerHTML=rows.map(x=>'<div class="stat-line"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join("");
}

init().catch(e=>{console.error(e);gate("後台初始化失敗。",e.message||String(e))});
