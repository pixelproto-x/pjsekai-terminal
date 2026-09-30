/* Project SEKAI reference layout/asset renderer.
 * Derived from the public Next-SEKAI layout model and pjsekai-web chart asset set.
 * This module owns the reference coordinate system and real note sprite quads;
 * the Dojo input/audio/game-state layer remains in dojo-webgl.js.
 */
(()=>{"use strict";
const BASE="https://cdn.jsdelivr.net/gh/pjsek-ai/pjsekai-web@master/public/images/song/chart/";
const TARGET=16/9, APPROACH_SCALE=Math.pow(1.06,-45);
const assets={
  normal:["notes_normal_left.png","notes_normal_middle.png","notes_normal_right.png"],
  crtcl:["notes_crtcl_left.png","notes_crtcl_middle.png","notes_crtcl_right.png"],
  flick:["notes_flick_left.png","notes_flick_middle.png","notes_flick_right.png"],
  long:["notes_long_left.png","notes_long_middle.png","notes_long_right.png"],
  among:"notes_long_among.png",
  amongC:"notes_long_among_crtcl.png"
};
const arrowSize={
 straight:[[144,158],[188,174],[248,194],[312,216],[374,236],[436,258]],
 diagonal:[[176,160],[228,182],[298,212],[376,242],[444,270],[514,300]]
};
const images=new Map(),textures=new Map(),state={gl:null,program:null,buf:null,loc:null,geom:null};

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function approach(progress){return Math.pow(APPROACH_SCALE,1-clamp(progress,0,1))}
function preempt(speed){const u=cl((speed-12)/(1-12),0,1);return .35+3.65*Math.pow(u,1.31)}
function layout(width,height){
  const fieldW=height*TARGET>width?width:height*TARGET;
  const fieldH=fieldW/TARGET,ox=(width-fieldW)*.5,oy=(height-fieldH)*.5;
  const t=fieldH*(.5+1.15875*(47/1176));
  const b=fieldH*(.5-1.15875*(803/1176));
  const hs=b-t;
  const ws=fieldW*((1.15875*(1420/1176))/TARGET/12);
  const noteH=(75/850/2), scaledNoteH=noteH*hs;
  state.geom={width,height,fieldW,fieldH,ox,oy,t,b,hs,ws,noteH,scaledNoteH,
    laneTop:47/850,laneBottom:1176/850+.4};
  return state.geom;
}
function p2s(x,y){
  const g=state.geom;
  return {x:g.ox+g.fieldW*.5+x,y:g.oy+g.fieldH*.5-y};
}
function persp(l,r,t,b,travel){
  const g=state.geom;
  const cv=(x,y)=>p2s(x*y*travel*g.ws,y*travel*g.hs+g.t);
  return [cv(l,t),cv(r,t),cv(r,b),cv(l,b)];
}
function noteBodyQuads(lane,size,travel,slim=false){
  const g=state.geom, margin=0.0, edge=slim?0.0625:0.25;
  const h=g.noteH;
  const l=lane-size+margin,r=lane+size-margin,m=(l+r)/2;
  const ml=Math.min(l+edge,m),mr=Math.max(r-edge,m);
  return {
    left:persp(l,ml,1-h,1+h,travel),
    middle:persp(ml,mr,1-h,1+h,travel),
    right:persp(mr,r,1-h,1+h,travel),
    whole:persp(l,r,1-h,1+h,travel)
  };
}
function tickQuad(lane,travel){
  const g=state.geom,center=p2s(lane*travel*g.ws,travel*g.hs+g.t);
  const center2=p2s((lane+1.0)*travel*g.ws,travel*g.hs+g.t);
  const w=Math.max(6,(center2.x-center.x)*.95);
  const h=Math.max(6,w*.95);
  return [{x:center.x-w,y:center.y-h},{x:center.x+w,y:center.y-h},{x:center.x+w,y:center.y+h},{x:center.x-w,y:center.y+h}];
}
function loadImage(name){
  if(!images.has(name)){
    const im=new Image();im.crossOrigin="anonymous";im.decoding="async";
    im.src=BASE+name;
    images.set(name,im);
  }
  return images.get(name);
}
function loadAll(){
  const names=new Set();
  Object.values(assets).flat().forEach(x=>x&&names.add(x));
  for(let i=1;i<=6;i++)for(const p of ["","_diagonal","_diagonal_left","_diagonal_right","_crtcl","_crtcl_diagonal","_crtcl_diagonal_left","_crtcl_diagonal_right"])
    names.add("notes_flick_arrow_"+String(i).padStart(2,"0")+p+".png");
  names.forEach(loadImage);
  return Promise.all([...names].map(n=>new Promise(r=>{const im=loadImage(n);if(im.complete)return r();im.onload=()=>r();im.onerror=()=>r()})));
}
function attach(gl,program,buf,loc){state.gl=gl;state.program=program;state.buf=buf;state.loc=loc}
function textureFor(name){
  const g=state.gl,im=images.get(name);if(!g||!im||!im.complete||!im.naturalWidth)return null;
  let t=textures.get(name);if(t)return t;
  t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
  g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,im);
  g.bindTexture(g.TEXTURE_2D,null);textures.set(name,t);return t;
}
function drawImage(name,q,alpha=1){
  const g=state.gl,loc=state.loc,t=textureFor(name);
  if(!g||!loc||!t||!Array.isArray(q)||q.length!==4)return;
  const d=[
    ...toClip(q[0]),0,1,...toClip(q[1]),1,1,
    ...toClip(q[3]),0,0,...toClip(q[2]),1,0
  ];
  g.bindBuffer(g.ARRAY_BUFFER,state.buf);g.bufferData(g.ARRAY_BUFFER,new Float32Array(d),g.STREAM_DRAW);
  g.useProgram(state.program);g.enableVertexAttribArray(loc.p);g.enableVertexAttribArray(loc.uv);
  g.vertexAttribPointer(loc.p,2,g.FLOAT,false,16,0);g.vertexAttribPointer(loc.uv,2,g.FLOAT,false,16,8);
  g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,t);g.uniform1i(loc.tex,0);
  if(loc.alpha)g.uniform1f(loc.alpha,alpha);g.drawArrays(g.TRIANGLE_STRIP,0,4);
}
function toClip(p){const g=state.geom;return[p.x/g.width*2-1,1-p.y/g.height*2]}
function drawBody(kind,lane,size,travel,alpha=1){
  const map=assets[kind]||assets.normal, q=noteBodyQuads(lane,size,travel,(kind==="trace"));
  drawImage(map[0],q.left,alpha);drawImage(map[1],q.middle,alpha);drawImage(map[2],q.right,alpha);
}
function drawArrow(kind,lane,size,travel,direction,alpha=1){
  const g=state.geom,dir=String(direction||"up"),diagonal=dir==="left"||dir==="right",
    n=Math.max(1,Math.min(6,Math.round(Math.max(1,size)*2))),sz=arrowSize[diagonal?"diagonal":"straight"][n-1],
    arrowW=clamp(size,0,3)*g.ws*2,arrowH=arrowW*sz[1]/sz[0],
    center=stagePoint(lane,travel),x=center.x+(dir==="left"?-g.ws*.12:dir==="right"?g.ws*.12:0),
    y=center.y-arrowH*.5-g.fieldH/32;
  let suffix="";
  if(diagonal)suffix="_diagonal_"+dir;
  const name="notes_flick_arrow_"+String(n).padStart(2,"0")+(kind==="crtcl"?"_crtcl":"")+suffix+".png";
  drawImage(name,[{x:x-arrowW/2,y},{x:x+arrowW/2,y},{x:x+arrowW/2,y: y+arrowH},{x:x-arrowW/2,y:y+arrowH}],alpha);
}
function stagePoint(lane,travel){
  const g=state.geom,p=persp(lane+.0,lane+.0,1,1,travel),a=p[0];return {x:a.x,y:a.y};
}
function drawTick(kind,lane,travel,alpha=1){drawImage(kind==="crtcl"?"notes_long_among_crtcl.png":"notes_long_among.png",tickQuad(lane,travel),alpha)}
function drawStage(spriteDraw){
  const g=state.geom;
  if(!g)return;
  const left=persp(-6.5,-6.0,g.laneTop,g.laneBottom,1),right=persp(6,6.5,g.laneTop,g.laneBottom,1);
  spriteDraw("#STAGE_LEFT_BORDER",(left[0].x+left[2].x)/2,(left[0].y+left[2].y)/2,Math.abs(left[2].x-left[0].x)+8,Math.abs(left[2].y-left[0].y),.72);
  spriteDraw("#STAGE_RIGHT_BORDER",(right[0].x+right[2].x)/2,(right[0].y+right[2].y)/2,Math.abs(right[2].x-right[0].x)+8,Math.abs(right[2].y-right[0].y),.72);
  for(const lane of [-5,-3,-1,1,3,5]){
    const q=persp(lane-1,lane+1,g.laneTop,g.laneBottom,1);
    spriteDraw("#LANE",(q[0].x+q[2].x)/2,(q[0].y+q[2].y)/2,Math.max(8,Math.abs(q[1].x-q[0].x)),Math.max(8,Math.abs(q[2].y-q[0].y)),.24);
  }
}
window.__PJSEKAI_SEKAI_REF__={
  BASE,assets,arrowSize,layout,approach,preempt,noteBodyQuads,tickQuad,loadAll,attach,drawImage,drawBody,drawArrow,drawTick,stagePoint,screenPoint,persp,
  get geom(){return state.geom}
};
})();