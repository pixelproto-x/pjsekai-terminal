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
function arcAdjust(v){
  const g=state.geom,vp={x:0,y:g.t},r=(vp.y-v.y)*1.05||1;
  let theta=(v.x-vp.x)/r;theta=clamp(theta,-Math.PI/2,Math.PI/2);
  return {x:vp.x+Math.sin(theta)*r,y:vp.y-Math.cos(theta)*r};
}
function p2s(x,y){
  const g=state.geom,a=arcAdjust({x,y});
  return {x:g.ox+g.fieldW*.5+a.x,y:g.oy+g.fieldH*.5-a.y};
}
function persp(l,r,t,b,travel){
  const g=state.geom;
  const cv=(x,y)=>p2s(x*y*travel*g.ws,y*travel*g.hs+g.t);
  return [cv(l,t),cv(r,t),cv(r,b),cv(l,b)];
}
function noteBodyQuads(lane,size,travel,slim=false){
  const g=state.geom,margin=0,edge=slim?.125:.25,h=g.noteH;
  const l=lane-size+margin,r=lane+size-margin,m=(l+r)/2,ml=Math.min(l+edge,m),mr=Math.max(r-edge,m);
  const rect=(a,b)=>persp(a,b,1-h,1+h,travel);
  return{left:rect(l,ml),middle:arcSlices(rect(ml,mr),g),right:rect(mr,r),whole:rect(l,r)};
}
function arcSlices(q,g){
  const a=q[0],b=q[1],c=q[2],d=q[3],span=Math.max(1,Math.min(18,Math.ceil((Math.abs(b.x-a.x)+Math.abs(d.x-c.x))*20/Math.max(20,Math.abs(a.y)))));
  const out=[];
  for(let i=0;i<span;i++){const l=i/span,r=(i+1)/span;out.push([
    {x:a.x+(b.x-a.x)*l,y:a.y+(b.y-a.y)*l},{x:a.x+(b.x-a.x)*r,y:a.y+(b.y-a.y)*r},
    {x:d.x+(c.x-d.x)*r,y:d.y+(c.y-d.y)*r},{x:d.x+(c.x-d.x)*l,y:d.y+(c.y-d.y)*l}
  ])}
  return out;
}
function logicalPoint(lane,travel){
  const g=state.geom;return arcAdjust({x:lane*travel*g.ws,y:travel*g.hs+g.t});
}
function mapLogical(v){
  const g=state.geom;return{x:g.ox+g.fieldW*.5+v.x,y:g.oy+g.fieldH*.5-v.y};
}
function tickQuad(lane,travel){
  const g=state.geom,center=logicalPoint(lane,travel),half=g.scaledNoteH*travel;
  const l=arcAdjust({x:center.x-half,y:center.y}),r=arcAdjust({x:center.x+half,y:center.y});
  const dx=r.x-l.x,dy=r.y-l.y,ox=-dy/2,oy=dx/2;
  return[
    mapLogical({x:l.x-ox,y:l.y-oy}),mapLogical({x:r.x-ox,y:r.y-oy}),
    mapLogical({x:r.x+ox,y:r.y+oy}),mapLogical({x:l.x+ox,y:l.y+oy})
  ];
}
function arrowQuad(lane,size,travel,direction,animationProgress){
  const g=state.geom,w=clamp(size,0,3)/2,bl=logicalPoint(lane-w,travel),br=logicalPoint(lane+w,travel);
  const up=rotate({x:br.x-bl.x,y:br.y-bl.y},Math.PI/2);
  const baseTL={x:bl.x+up.x,y:bl.y+up.y},baseTR={x:br.x+up.x,y:br.y+up.y};
  const dir=String(direction||"up"),down=dir==="down",left=dir==="left",right=dir==="right";
  const topX=left?-1:right?1:0,offsetScale=down?1-animationProgress:animationProgress;
  const off=rotate({x:topX*g.ws,y:2*g.ws},Math.atan2(up.y,up.x)-Math.PI/2);
  const O={x:off.x*offsetScale*travel,y:off.y*offsetScale*travel};
  let q=[
    {x:bl.x+O.x,y:bl.y+O.y},{x:br.x+O.x,y:br.y+O.y},
    {x:baseTR.x+O.x,y:baseTR.y+O.y},{x:baseTL.x+O.x,y:baseTL.y+O.y}
  ];
  if(right)q=[q[1],q[0],q[3],q[2]];
  return q.map(mapLogical);
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
  const map=assets[kind]||assets.normal,q=noteBodyQuads(lane,size,travel,kind==="trace");
  drawImage(map[0],q.left,alpha);
  for(const seg of q.middle)drawImage(map[1],seg,alpha);
  drawImage(map[2],q.right,alpha);
}

function drawArrow(kind,lane,size,travel,direction,alpha=1){
  const animationProgress=(performance.now()/1000/.5)%1;
  const nameKind=kind==="crtcl"?"crtcl":"normal",n=Math.max(1,Math.min(6,Math.round(Math.max(1,size)*2)));
  const d=String(direction||"up"),diagonal=d==="left"||d==="right",suffix=diagonal?"_diagonal_"+d:"";
  const name="notes_flick_arrow_"+String(n).padStart(2,"0")+(nameKind==="crtcl"?"_crtcl":"")+suffix+".png";
  drawImage(name,arrowQuad(lane,size,travel,d,animationProgress),alpha*(1-Math.pow(animationProgress,3)*.9));
}

function screenPoint(x,y,travel=1){
  const g=state.geom;return mapLogical(p2sLogical(x*y*travel*g.ws,y*travel*g.hs+g.t));
}
function p2sLogical(v){return mapLogical(arcAdjust(v));}
function stagePoint(lane,travel){
  const g=state.geom,p=persp(lane+.0,lane+.0,1,1,travel),a=p[0];return {x:a.x,y:a.y};
}
function drawTick(kind,lane,travel,alpha=1){drawImage(kind==="crtcl"?"notes_long_among_crtcl.png":"notes_long_among.png",tickQuad(lane,travel),alpha)}
function drawConnection(kind,laneA,travelA,laneB,travelB,thickness=10,alpha=1){
  const a=stagePoint(laneA,travelA),b=stagePoint(laneB,travelB);
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len*thickness*.5,ny=dx/len*thickness*.5;
  drawImage(kind==="crtcl"?"notes_long_middle.png":"notes_long_middle.png",[
    {x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},
    {x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}
  ],alpha);
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
  BASE,assets,arrowSize,layout,approach,preempt,noteBodyQuads,tickQuad,loadAll,attach,drawImage,drawBody,drawArrow,drawTick,drawConnection,stagePoint,screenPoint,persp,
  get geom(){return state.geom}
};
})();