/* Dojo Real Engine Bridge v1
 * The website no longer pretends to be a Project SEKAI renderer.
 * It launches the real Next SEKAI engine through Sonolus deep links.
 */
(function(){
  'use strict';

  const SERVER='coconut.sonolus.com/next-sekai';
  const WEB='https://coconut.sonolus.com/next-sekai';
  const $=id=>document.getElementById(id);

  function selected(){
    const title=String($('dojoSelectedTitle')?.textContent||'').trim();
    const diff=String(document.querySelector('[data-dojo-diff].active')?.dataset?.dojoDiff||$('dojoSelectedDifficulty')?.textContent||'Expert').trim()||'Expert';
    return {title:title==='尚未選擇歌曲'?'':title,diff};
  }

  function render(){
    const x=selected();
    const title=$('dojoGameSongTitle');
    const meta=$('dojoGameSongMeta');
    const hud=$('dojoHudSongMeta');
    const message=$('dojoGameMessage');
    if(title) title.textContent=x.title||'尚未選擇歌曲';
    if(meta) meta.textContent=x.title?(('譜面 · '+x.diff)): '請先選擇歌曲與難度';
    if(hud) hud.textContent=x.diff;
    if(message) message.textContent=x.title
      ? '已選擇「'+x.title+'」· '+x.diff+'。按「用 Next SEKAI 開始」進入實際遊玩。'
      : '請先選擇歌曲與難度。';
  }

  function deepLink(){
    const x=selected();
    if(!x.title){
      window.__PJSEKAI_APP__?.toast?.('請先選擇歌曲與難度');
      return;
    }
    const q=new URLSearchParams({type:'quick',keywords:x.title});
    const native='sonolus://'+SERVER+'/levels/list?'+q.toString();
    const web=WEB+'/levels/list?'+q.toString();
    const status=$('dojoGameStatus');
    if(status)status.textContent='OPENING SONOLUS';
    // Sonolus deep links are the supported bridge from a web page to the actual engine.
    location.href=native;
    setTimeout(()=>{
      if(status)status.textContent='NEXT SEKAI READY';
      window.open(web,'_blank','noopener,noreferrer');
    },900);
  }

  function openWeb(){
    const x=selected();
    const q=x.title?new URLSearchParams({type:'quick',keywords:x.title}).toString():'';
    window.open(WEB+'/levels/list'+(q?'?'+q:''),'_blank','noopener,noreferrer');
  }

  function fullscreen(){
    const stage=$('dojoGameStageWrap');
    if(!stage)return;
    if(document.fullscreenElement) document.exitFullscreen?.();
    else stage.requestFullscreen?.().catch(()=>window.__PJSEKAI_APP__?.toast?.('此瀏覽器不允許全螢幕'));
  }

  function reset(){
    render();
    const status=$('dojoGameStatus');
    if(status)status.textContent='ENGINE READY';
  }

  function bind(){
    $('dojoOpenPracticeBtn')?.addEventListener('click',deepLink);
    $('dojoOpenPracticeWebBtn')?.addEventListener('click',openWeb);
    $('dojoGameFullscreenBtn')?.addEventListener('click',fullscreen);
    $('dojoGameResetBtn')?.addEventListener('click',reset);

    // Selection UI is rendered by the existing Dojo song controller.
    document.addEventListener('click',e=>{
      if(e.target.closest('.dojo-song,[data-dojo-diff],#dojoDifficultyButtons')){
        setTimeout(render,0);
      }
    });
    new MutationObserver(render).observe(document.body,{subtree:true,childList:true,characterData:true});
    render();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
