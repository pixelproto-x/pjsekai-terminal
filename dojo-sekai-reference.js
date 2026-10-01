/* Project SEKAI reference layout/asset renderer.
 * Derived from the public Next-SEKAI layout model and pjsekai-web chart asset set.
 * This module owns the reference coordinate system and real note sprite quads;
 * the Dojo input/audio/game-state layer remains in dojo-webgl.js.
 */
(()=>{"use strict";
const BASE="https://cdn.jsdelivr.net/gh/pjsek-ai/pjsekai-web@master/public/images/song/chart/";
const TARGET=16/9, APPROACH_SCALE=Math.pow(1.06,-45);
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const assets={
  normal:["notes_normal_left.png","notes_normal_middle.png","notes_normal_right.png"],
  crtcl:["notes_crtcl_left.png","notes_crtcl_middle.png","notes_crtcl_right.png"],
  flick:["notes_flick_left.png","notes_flick_middle.png","notes_flick_right.png"],
  long:["notes_long_left.png","notes_long_middle.png","notes_long_right.png"],
  trace:["notes_normal_left.png","notes_normal_middle.png","notes_normal_right.png"],
  traceC:["notes_crtcl_left.png","notes_crtcl_middle.png","notes_crtcl_right.png"],
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
function preempt(speed){const u=clamp((speed-12)/(1-12),0,1);return .35+3.65*Math.pow(u,1.31)}
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
function arcAdjust(v){
  const g=state.geom,vp={x:0,y:g.t},r=(vp.y-v.y)*1.05||1;
  let theta=(v.x-vp.x)/r;theta=clamp(theta,-Math.PI/2,Math.PI/2);
  return {x:vp.x+Math.sin(theta)*r,y:vp.y-Math.cos(theta)*r};
}
function rawLogical(x,y){
  const g=state.geom;
  return{x:g.ox+g.fieldW*.5+x,y:g.oy+g.fieldH*.5-y};
}
function transformRaw(x,y){
  return{x:x,y:y};
}
function arcRaw(v){
  const g=state.geom,vp={x:0,y:g.t},r=(vp.y-v.y)*1.05||1;
  let theta=(v.x-vp.x)/r;theta=clamp(theta,-Math.PI/2,Math.PI/2);
  return{x:vp.x+Math.sin(theta)*r,y:vp.y-Math.cos(theta)*r};
}
function arcScreen(x,y){
  return rawLogical(x,y);
}
function p2s(x,y){
  const g=state.geom,a=arcRaw({x,y});
  return{x:g.ox+g.fieldW*.5+a.x,y:g.oy+g.fieldH*.5-a.y};
}
function transformPoint(x,y){
  const g=state.geom;return{x,y};
}
function perspRaw(l,r,t,b,travel){
  const g=state.geom,cv=(x,y)=>transformPoint(x*y*travel*g.ws,y*travel*g.hs+g.t);
  return[cv(l,t),cv(r,t),cv(r,b),cv(l,b)];
}
function persp(l,r,t,b,travel){
  return perspRaw(l,r,t,b,travel).map(arcRaw).map(rawLogical);
}
function arcQuad(q){
  return q.map(v=>rawLogical(arcRaw(v).x,arcRaw(v).y));
}
function noteBodyQuads(lane,size,travel,slim=false){
  const g=state.geom,margin=0,edge=slim?.125:.25,h=g.noteH;
  const l=lane-size+margin,r=lane+size-margin,m=(l+r)/2,ml=Math.min(l+edge,m),mr=Math.max(r-edge,m);
  const rect=(a,b)=>perspRaw(a,b,1-h,1+h,travel);
  const left=rect(l,ml),right=rect(mr,r),mid=rect(ml,mr);
  return{left:arcQuad(left),middle:arcMiddle(mid,g),right:arcQuad(right),whole:arcQuad(rect(l,r))};
}
function arcN(bl,br,quality=1){
  const g=state.geom;if(!g)return 1;
  const radius=Math.abs(g.t-br.y)||1;
  const wScale=Math.abs(br.x-bl.x)*20;
  const hAdj=wScale/radius*.5;
  return Math.max(1,Math.ceil(Math.min(wScale,Math.abs(hAdj))*quality));
}
function arcMiddle(q,g){
  const a=q[0],b=q[1],c=q[2],d=q[3];
  const span=arcN(a,b,1);
  const out=[];
  for(let i=0;i<span;i++){
    const l=i/span,r=(i+1)/span;
    const raw=[
      {x:a.x+(b.x-a.x)*l,y:a.y+(b.y-a.y)*l},
      {x:a.x+(b.x-a.x)*r,y:a.y+(b.y-a.y)*r},
      {x:d.x+(c.x-d.x)*r,y:d.y+(c.y-d.y)*r},
      {x:d.x+(c.x-d.x)*l,y:d.y+(c.y-d.y)*l}
    ];
    out.push(raw.map(v=>rawLogical(arcRaw(v).x,arcRaw(v).y)));
  }
  return out;
}
function logicalPoint(lane,travel){
  const g=state.geom,v={x:lane*travel*g.ws,y:travel*g.hs+g.t},a=arcRaw(v);
  return rawLogical(a.x,a.y);
}
function mapLogical(v){
  return v;
}
function tickQuad(lane,travel){
  const g=state.geom,raw={x:lane*travel*g.ws,y:travel*g.hs+g.t};
  const center=arcRaw(raw);
  const l=arcRaw({x:raw.x-g.scaledNoteH*travel,y:raw.y});
  const rr=arcRaw({x:raw.x+g.scaledNoteH*travel,y:raw.y});
  const dx=rr.x-l.x,dy=rr.y-l.y,ox=-dy/2,oy=dx/2;
  return[
    rawLogical(l.x-ox,l.y-oy),rawLogical(rr.x-ox,rr.y-oy),
    rawLogical(rr.x+ox,rr.y+oy),rawLogical(l.x+ox,l.y+oy)
  ];
}
function arrowQuad(lane,size,travel,direction,animationProgress){
  const g=state.geom;
  const d=String(direction||"up");
  const isDown=d==="down"||d==="down-left"||d==="down-right";
  const reverse=d==="right"||d==="down-right";
  const topOffset=d==="left"?-1:d==="right"?1:d==="up-left"?-1:d==="up-right"?1:d==="down-left"?1:d==="down-right"?-1:0;
  const w=cl(size,0,3)/2;
  const baseL=arcRaw({x:(lane-w)*travel*g.ws,y:travel*g.hs+g.t});
  const baseR=arcRaw({x:(lane+w)*travel*g.ws,y:travel*g.hs+g.t});
  const dx=baseR.x-baseL.x,dy=baseR.y-baseL.y;
  const up=rotate({x:dx,y:dy},Math.PI/2);
  const baseTL={x:baseL.x+up.x,y:baseL.y+up.y};
  const baseTR={x:baseR.x+up.x,y:baseR.y+up.y};
  const offsetScale=isDown?1-animationProgress:animationProgress;
  const oa=rotate({x:topOffset*g.ws,y:2*g.ws},Math.atan2(up.y,up.x)-Math.PI/2);
  const offset={x:oa.x*offsetScale*travel,y:oa.y*offsetScale*travel};
  let q=[
    {x:baseL.x+offset.x,y:baseL.y+offset.y},
    {x:baseR.x+offset.x,y:baseR.y+offset.y},
    {x:baseTR.x+offset.x,y:baseTR.y+offset.y},
    {x:baseTL.x+offset.x,y:baseTL.y+offset.y}
  ];
  if(reverse){
    q=[q[1],q[0],q[3],q[2]];
  }
  return q.map(v=>rawLogical(v.x,v.y));
}
function rotate(v,a){const c=Math.cos(a),s=Math.sin(a);return{x:v.x*c-v.y*s,y:v.x*s+v.y*c};}

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
  for(let i=1;i<=6;i++)for(const p of ["","_diagonal","_diagonal_left","_diagonal_right"]){
    names.add("notes_flick_arrow_"+String(i).padStart(2,"0")+p+".png");
    names.add("notes_flick_arrow_crtcl_"+String(i).padStart(2,"0")+p+".png");
  }
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
  const map=assets[kind]||assets.normal,q=noteBodyQuads(lane,size,travel,kind==="trace"||kind==="traceC");
  drawImage(map[0],q.left,alpha);
  for(const seg of q.middle)drawImage(map[1],seg,alpha);
  drawImage(map[2],q.right,alpha);
}

function drawArrow(kind,lane,size,travel,direction,alpha=1){
  const markerAnimation=!!(window.__PJSEKAI_APP__?.getState?.()?.dojo?.markerAnimation);
  const animationProgress=markerAnimation?(performance.now()/1000/.5)%1:(String(direction||"up").startsWith("down")?.8:.2);
  const nameKind=kind==="crtcl"?"crtcl":"normal",n=Math.max(1,Math.min(6,Math.round(Math.max(1,size)*2)));
  const d=String(direction||"up");
  const diagonal=d==="up-left"||d==="up-right"||d==="down-left"||d==="down-right";
  const suffix=d==="down"?"_diagonal":(d==="up-left"||d==="down-right"?"_diagonal_left":(d==="up-right"||d==="down-left"?"_diagonal_right":""));
  const name="notes_flick_arrow_"+(nameKind==="crtcl"?"crtcl_":"")+String(n).padStart(2,"0")+suffix+".png";
  const safe=images.has(name)?name:("notes_flick_arrow_"+(nameKind==="crtcl"?"crtcl_":"")+String(n).padStart(2,"0")+".png");
  drawImage(safe,arrowQuad(lane,size,travel,d,animationProgress),alpha*(1-Math.pow(animationProgress,3)*.9));
}

function screenPoint(x,y,travel=1){
  const g=state.geom,v=arcRaw({x:x*y*travel*g.ws,y:y*travel*g.hs+g.t});
  return rawLogical(v.x,v.y);
}
function stagePoint(lane,travel){
  const g=state.geom,p=persp(lane+.0,lane+.0,1,1,travel),a=p[0];return {x:a.x,y:a.y};
}
function drawTick(kind,lane,travel,alpha=1){drawImage(kind==="crtcl"?"notes_long_among_crtcl.png":"notes_long_among.png",tickQuad(lane,travel),alpha)}
function arcStrip(q,n=12){
  const count=Math.max(1,Math.min(32,Math.round(n)));
  const out=[];
  const a=q[0],b=q[1],c=q[2],d=q[3];
  for(let i=0;i<count;i++){
    const u=i/count,v=(i+1)/count;
    const p0={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};
    const p1={x:a.x+(b.x-a.x)*v,y:a.y+(b.y-a.y)*v};
    const p2={x:d.x+(c.x-d.x)*v,y:d.y+(c.y-d.y)*v};
    const p3={x:d.x+(c.x-d.x)*u,y:d.y+(c.y-d.y)*u};
    out.push([p0,p1,p2,p3].map(x=>rawLogical(arcRaw(x).x,arcRaw(x).y)));
  }
  return out;
}
function layoutSlideConnectorSegment(startLane,startSize,startTravel,endLane,endSize,endTravel,n){
  if(startTravel<endTravel){
    [startLane,endLane]=[endLane,startLane];
    [startSize,endSize]=[endSize,startSize];
    [startTravel,endTravel]=[endTravel,startTravel];
  }
  const g=state.geom;
  const q=[
    {x:(startLane-startSize)*startTravel*g.ws,y:startTravel*g.hs+g.t},
    {x:(startLane+startSize)*startTravel*g.ws,y:startTravel*g.hs+g.t},
    {x:(endLane+endSize)*endTravel*g.ws,y:endTravel*g.hs+g.t},
    {x:(endLane-endSize)*endTravel*g.ws,y:endTravel*g.hs+g.t}
  ];
  return arcStrip(q,Number.isFinite(n)?n:arcN(q[0],q[1],1));
}
function connectorN(startLane,startSize,startTravel,endLane,endSize,endTravel){
  let sl=startLane,ss=startSize,st=startTravel,el=endLane,es=endSize,et=endTravel;
  if(st<et){[sl,el]=[el,sl];[ss,es]=[es,ss];[st,et]=[et,st]}
  const g=state.geom,bl={x:(sl-ss)*st*g.ws,y:st*g.hs+g.t},br={x:(sl+ss)*st*g.ws,y:st*g.hs+g.t};
  const radius=Math.abs(g.t-br.y)||1,wScale=Math.abs(br.x-bl.x)*20,hAdj=wScale/radius*.5;
  return Math.max(1,Math.ceil(Math.min(wScale,Math.abs(hAdj))));
}
function drawConnection(kind,laneA,sizeA,travelA,laneB,sizeB,travelB,alpha=1){
  const n=connectorN(laneA,sizeA,travelA,laneB,sizeB,travelB);
  const qa=layoutSlideConnectorSegment(laneA,sizeA,travelA,laneB,sizeB,travelB,n);
  const sprite=kind==="crtcl"?"notes_crtcl_middle.png":"notes_long_middle.png";
  for(const q of qa)drawImage(sprite,q,alpha);
}
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
  BASE,assets,arrowSize,layout,approach,preempt,noteBodyQuads,tickQuad,arcN,arcStrip,connectorN,loadAll,attach,drawImage,drawBody,drawArrow,drawTick,drawConnection,layoutSlideConnectorSegment,stagePoint,screenPoint,persp,
  get geom(){return state.geom},
  get ready(){return [...images.values()].filter(im=>im.complete&&im.naturalWidth).length}
};})();