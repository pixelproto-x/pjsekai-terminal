/* Project SEKAI Web Dojo Engine — gameplay renderer / timing / touch foundation
 * Inspired by the public architecture of Next-SEKAI. No official game assets are bundled.
 */
(()=>{"use strict";
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const Engine={
  notes:[],audio:null,canvas:null,ctx:null,raf:0,running:false,startOffset:0,offset:0,
  speed:1,mirror:false,reverse:false,sudden:false,score:0,combo:0,maxCombo:0,
  counts:{perfect:0,great:0,good:0,bad:0,miss:0},active:new Map(),effects:[],pointers:new Map(),lastTime:-1,
  laneCount:12,judgment:{perfect:45,great:90,good:140,bad:200},lastHit:null,
  chartName:"Web Dojo Chart",chartBpm:120,duration:60,loaded:false,
  audioCtx:null,sfxGain:null,
  init(){
    const stage=$("#dojoStage"); if(!stage)return;
    this.audio=$("#dojoAudio");
    this.canvas=document.createElement("canvas"); this.canvas.className="pjsk-engine-canvas";
    this.ctx=this.canvas.getContext("2d",{alpha:false});
    stage.innerHTML="";
    stage.classList.add("pjsk-engine-stage");
    stage.appendChild(this.canvas);
    const hud=document.createElement("div");hud.className="pjsk-hud";
    hud.innerHTML='<div><b id="pjskCombo">0</b><span>COMBO</span></div><div><b id="pjskScore">0000000</b><span>SCORE</span></div><div><b id="pjskJudge">—</b><span>JUDGMENT</span></div>';
    stage.appendChild(hud);
    const overlay=document.createElement("div");overlay.className="pjsk-overlay";
    overlay.innerHTML='<div class="pjsk-ready" id="pjskReady">READY</div><div class="pjsk-touch-hint">12-LANE PRACTICE</div>';
    stage.appendChild(overlay);
    this.resize();addEventListener("resize",()=>this.resize());
    this.bindInput(stage);this.bindControls();this.bindAudio();
    this.makeDemoChart();
    this.render();
  },
  resize(){if(!this.canvas)return;const r=this.canvas.getBoundingClientRect(),d=devicePixelRatio||1;this.canvas.width=Math.max(1,Math.floor(r.width*d));this.canvas.height=Math.max(1,Math.floor(r.height*d));this.ctx.setTransform(d,0,0,d,0,0);},
  bindAudio(){
    this.audio?.addEventListener("play",()=>{this.running=true;this.lastTime=-1;cancelAnimationFrame(this.raf);this.loop();});
    this.audio?.addEventListener("pause",()=>{this.running=false;cancelAnimationFrame(this.raf);this.render();});
    this.audio?.addEventListener("seeked",()=>{this.active.clear();this.combo=0;this.lastHit=null;this.render();});
    this.audio?.addEventListener("ratechange",()=>{this.speed=this.audio.playbackRate||1;});
    this.audio?.addEventListener("loadedmetadata",()=>{this.duration=this.audio.duration||this.duration;});
  },
  bindControls(){
    const file=$("#dojoAudioFile");
    file?.addEventListener("change",e=>{const f=e.target.files?.[0];if(!f)return;this.loadAudio(f);});
    $("#dojoPracticePlay")?.addEventListener("click",()=>this.togglePlay());
    $("#dojoPracticeStop")?.addEventListener("click",()=>this.stop());
    $("#dojoSpeed")?.addEventListener("input",e=>{this.speed=+e.target.value||1;if(this.audio)this.audio.playbackRate=this.speed;});
    $("#dojoMirror")?.addEventListener("change",e=>{this.mirror=e.target.checked;this.render();});
    $("#dojoReverse")?.addEventListener("change",e=>{this.reverse=e.target.checked;this.render();});
    $("#dojoSudden")?.addEventListener("change",e=>{this.sudden=e.target.checked;this.render();});
  },
  bindInput(stage){
    const input=e=>{

      const r=this.canvas.getBoundingClientRect();
      let x=e.clientX-r.left;
      if(this.mirror)x=r.width-x;
      const lane=clamp(Math.floor(x/r.width*this.laneCount),0,this.laneCount-1);
      const y=e.clientY-r.top;
      if(y<r.height*.68)return;
      this.hit(lane,e.type==="pointerdown"?"tap":"release",performance.now());
    };
    stage.addEventListener("pointerdown",e=>{stage.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,t:performance.now()});input(e);},{passive:true});
    stage.addEventListener("pointermove",e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.get(e.pointerId).x=e.clientX;this.pointers.get(e.pointerId).y=e.clientY;},{passive:true});
    stage.addEventListener("pointerup",e=>{input(e);this.pointers.delete(e.pointerId);},{passive:true});
    stage.addEventListener("pointercancel",e=>{this.pointers.delete(e.pointerId);input(e);},{passive:true});
    stage.addEventListener("pointercancel",e=>input(e),{passive:true});
    addEventListener("keydown",e=>{
      if(e.repeat)return;
      const map={"d":2,"f":3,"j":8,"k":9,"a":1,"s":2,"l":10,";":11};
      if(map[e.key.toLowerCase()]!=null)this.hit(map[e.key.toLowerCase()],"tap",performance.now());
      if(e.key===" "){e.preventDefault();this.togglePlay();}
    });
  },
  loadAudio(file){if(this.audio._objectUrl)URL.revokeObjectURL(this.audio._objectUrl);const u=URL.createObjectURL(file);this.audio._objectUrl=u;this.audio.src=u;this.audio.load();$("#dojoAudioName").textContent=file.name;},
  togglePlay(){if(!this.audio)return;if(this.audio.paused){this.audio.play().catch(()=>{});}else this.audio.pause();},
  stop(){if(!this.audio)return;this.audio.pause();this.audio.currentTime=0;this.active.clear();this.combo=0;this.score=0;this.counts={perfect:0,great:0,good:0,bad:0,miss:0};this.render();},
  makeDemoChart(){
    const arr=[];let t=1.2;for(let i=0;i<180;i++){const lane=(i*5+i%3)%12;const type=i%17===0?"flick":i%9===0?"hold":i%5===0?"trace":"tap";const dur=type==="hold"?.55:0;arr.push({id:i,time:t,lane,type,duration:dur,endLane:(lane+(i%7===0?2:0))%12,critical:i%13===0,hit:false});t+=i%11===0?.22:i%7===0?.32:.48;}this.notes=arr;this.duration=Math.max(this.duration,t+2);this.loaded=true;},
  parseSUS(text){
    const out=[];const lines=String(text).split(/\r?\n/);let bpm=120;
    for(const line of lines){const l=line.trim();if(!l||l[0]==="#")continue;
      const bm=l.match(/^BPM[\s:]*(\d+(?:\.\d+)?)/i);if(bm)bpm=+bm[1];
      // common SUS note form: #mmmcc: lane data, with comma-separated 4-char objects
      const m=l.match(/^#(\d{3})(\d{2}):(.+)$/);if(!m)continue;
      const measure=+m[1],channel=+m[2],data=m[3].trim().split(/[;,:]/)[0];
      if(!/^(1[0-9]|2[0-9]|3[0-9]|4[0-9])$/.test(String(channel)))continue;
      const step=4/Math.max(1,data.length/2);for(let i=0;i<data.length;i+=2){const token=data.slice(i,i+2);if(token==="00")continue;
        const lane=(parseInt(token,16)||0)%12;const beat=measure*4+(i/2)*step;out.push({id:out.length,time:beat*60/bpm,lane,type:"tap",duration:0,critical:false,hit:false});
      }
    }
    if(out.length){this.notes=out.sort((a,b)=>a.time-b.time);this.chartBpm=bpm;this.duration=Math.max(10,this.notes.at(-1).time+5);this.loaded=true;return true;}return false;
  },
  chartToJSON(){
    return JSON.stringify({version:1,bpm:this.chartBpm,duration:this.duration,notes:this.notes.map(n=>({time:n.time,lane:n.lane,type:n.type,duration:n.duration,endLane:n.endLane,critical:n.critical}))},null,2);
  },
  importChartText(text){
    let ok=false;try{const j=JSON.parse(text);if(Array.isArray(j)){this.notes=j;ok=true;}else if(Array.isArray(j.notes)){this.notes=j.notes.map((n,i)=>({...n,id:i,lane:clamp(+n.lane||0,0,11),time:+n.time||0,duration:+n.duration||0,type:n.type||"tap",critical:!!n.critical,hit:false}));this.chartBpm=+j.bpm||120;this.duration=+j.duration||this.duration;ok=true;}}catch(_){}
    if(!ok)ok=this.parseSUS(text);
    if(ok){this.active.clear();this.combo=0;this.score=0;this.counts={perfect:0,great:0,good:0,bad:0,miss:0};this.render();return true;}return false;
  },
  currentTime(){return this.audio?.currentTime||0;},
  judgeWindow(ms){const a=Math.abs(ms);if(a<=this.judgment.perfect)return"perfect";if(a<=this.judgment.great)return"great";if(a<=this.judgment.good)return"good";if(a<=this.judgment.bad)return"bad";return null;},
  hit(lane,type){const t=this.currentTime()*1000;let best=null,bestAbs=Infinity;
    for(const n of this.notes){if(n.hit||n.lane!==lane)continue;const d=(n.time*1000-t)-this.offset;if(Math.abs(d)<bestAbs&&Math.abs(d)<=this.judgment.bad+40){best=n;bestAbs=Math.abs(d);}}
    if(!best){this.playSfx("miss");return;}
    const j=this.judgeWindow(bestAbs);if(!j){this.playSfx("miss");return;}
    best.hit=true;best.judgment=j;this.counts[j]++;
    if(best.type==="hold"&&best.duration){best.holdUntil=best.time+best.duration;}
    this.effects.push({x:lane,y:.84,kind:j,life:0.42,max:.42,lane,critical:!!best.critical});this.combo=j==="miss"?0:this.combo+1;this.maxCombo=Math.max(this.maxCombo,this.combo);
    this.score+=j==="perfect"?1000:j==="great"?800:j==="good"?500:100;this.lastHit=j.toUpperCase();this.playSfx(best.type==="flick"?"flick":"tap");this.render();
  },
  updateMisses(t){
    for(const n of this.notes){if(n.hit)continue;if((t-n.time)*1000-this.offset>this.judgment.bad){n.hit=true;n.judgment="miss";this.counts.miss++;this.combo=0;this.lastHit="MISS";this.effects.push({x:n.lane/12+.04,y:.84,kind:"miss",life:0.5,max:.5,lane:n.lane});}}
  },
  loop(){if(!this.running)return;this.updateMisses(this.currentTime());this.render();this.raf=requestAnimationFrame(()=>this.loop());},
  playSfx(kind){
    try{if(!this.audioCtx)this.audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(this.audioCtx.state==="suspended")this.audioCtx.resume();const o=this.audioCtx.createOscillator(),g=this.audioCtx.createGain();o.type="triangle";o.frequency.value=kind==="flick"?920:kind==="miss"?150:720;g.gain.setValueAtTime(.035,this.audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.audioCtx.currentTime+.065);o.connect(g).connect(this.audioCtx.destination);o.start();o.stop(this.audioCtx.currentTime+.07);}catch(_){}},
  project(lane,progress,w,h){
    const p=clamp(progress,0,1),pers=Math.pow(p,1.55),center=w/2,spread=w*.72*(.08+.92*pers),x=center+((lane+0.5)/12-.5)*spread;
    const y=h*.08+(1-pers)*h*.78;return{x,y,w:Math.max(12,spread/12),p};
  },
  render(){
    if(!this.ctx)return;const c=this.canvas,r=c.getBoundingClientRect(),w=r.width,h=r.height,ctx=this.ctx;ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,"#080a13");g.addColorStop(.55,"#171d34");g.addColorStop(1,"#070910");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    // stage glow
    const rg=ctx.createRadialGradient(w/2,h*.82,5,w/2,h*.82,w*.65);rg.addColorStop(0,"rgba(100,220,255,.18)");rg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=rg;ctx.fillRect(0,0,w,h);
    // perspective lanes
    ctx.lineWidth=1;for(let i=0;i<=12;i++){const x0=w*.14+i*w*.72/12;ctx.strokeStyle=i===0||i===12?"rgba(255,255,255,.20)":"rgba(255,255,255,.08)";ctx.beginPath();ctx.moveTo(w/2+(x0-w/2)*.08,h*.05);ctx.lineTo(x0,h*.93);ctx.stroke();}
    ctx.strokeStyle="rgba(255,255,255,.34)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w*.09,h*.84);ctx.lineTo(w*.91,h*.84);ctx.stroke();
    const now=this.currentTime(),travel=.95/(this.speed||1);
    this.effects=this.effects.filter(e=>{e.life-=1/60;return e.life>0;});
    for(const n of this.notes){if(n.hit)continue;let p=1-(n.time-now)/travel;if(p<0||p>1.08)continue;if(this.sudden&&p<.45)continue;
      const q=this.project(this.mirror?11-n.lane:n.lane,p,w,h),size=q.w*(n.critical?1.05:.9);
      if(n.type==="hold"&&n.duration){const tailP=1-(n.time+n.duration-now)/travel,qt=this.project(this.mirror?11-(n.endLane??n.lane):n.endLane??n.lane,tailP,w,h);ctx.strokeStyle=n.critical?"#ffd84d":"#55d7ef";ctx.lineWidth=Math.max(5,size*.65);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(qt.x,qt.y);ctx.stroke();}
      ctx.save();ctx.translate(q.x,q.y);if(n.type==="flick")ctx.rotate(n.reverse?Math.PI:0);ctx.shadowBlur=14;ctx.shadowColor=n.critical?"#ffd84d":"#5ee7ff";ctx.fillStyle=n.critical?"#ffd84d":n.type==="trace"?"#70e7c0":"#eafaff";ctx.beginPath();ctx.roundRect(-size*.7,-size*.7,size*1.4,size*1.4,Math.max(3,size*.28));ctx.fill();ctx.strokeStyle=n.critical?"#fff0a8":"#fff";ctx.lineWidth=1.5;ctx.stroke();if(n.type==="flick"){ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(0,-size*1.2);ctx.lineTo(size*.45,-size*.35);ctx.lineTo(-size*.45,-size*.35);ctx.closePath();ctx.fill();}ctx.restore();
    }
    for(const e of this.effects){const life=1-e.life/e.max;const x=w*(.14+e.lane/12*.72),y=h*.79-life*34;ctx.save();ctx.globalAlpha=Math.max(0,1-life);ctx.translate(x,y);ctx.scale(1+life*.7,1+life*.7);ctx.font="900 15px sans-serif";ctx.textAlign="center";ctx.fillStyle=e.kind==="perfect"?"#fff":e.kind==="great"?"#ffe76b":e.kind==="good"?"#7ee7ff":e.kind==="miss"?"#ff6b8a":"#fff";ctx.shadowBlur=14;ctx.shadowColor=ctx.fillStyle;ctx.fillText(String(e.kind).toUpperCase(),0,0);ctx.restore();}
    const combo=$("#pjskCombo"),score=$("#pjskScore"),judge=$("#pjskJudge");if(combo)combo.textContent=this.combo; if(score)score.textContent=String(Math.round(this.score)).padStart(7,"0");if(judge)judge.textContent=this.lastHit||"—";
  }
};
window.PJSekaiWebDojo=Engine;
function boot(){Engine.init();const stage=$("#dojoStage");if(!stage)return;
  // chart import panel
  const box=document.createElement("div");box.className="pjsk-import-box";box.innerHTML='<div><b>譜面引擎</b><span>匯入 SUS / Web Dojo JSON</span></div><label class="pjsk-file-btn">選擇譜面<input id="pjskChartFile" type="file" accept=".sus,.json,text/plain,application/json"></label><button id="pjskDemoChart" type="button">載入測試譜面</button><button id="pjskExportChart" type="button">匯出目前譜面</button>';
  stage.parentElement.appendChild(box);
  $("#pjskChartFile")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;const ok=Engine.importChartText(await f.text());showToast?.(ok?"譜面載入成功":"譜面格式無法解析");});
  $("#pjskDemoChart")?.addEventListener("click",()=>{Engine.makeDemoChart();Engine.render();showToast?.("已載入測試譜面");});
  $("#pjskExportChart")?.addEventListener("click",()=>{const b=new Blob([Engine.chartToJSON()],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="pjsekai-dojo-chart.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),500);});
}
if(document.readyState==="loading")addEventListener("DOMContentLoaded",boot);else boot();
})();