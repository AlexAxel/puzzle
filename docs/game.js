(() => {
"use strict";
const $=id=>document.getElementById(id),stage=$("stage"),game=$("game"),file=$("file-input"),slider=$("size-range");
const hit=document.createElement("canvas").getContext("2d");
const s={image:null,url:null,cut:false,cols:0,rows:0,g:null,H:[],V:[],corners:null,cutStyle:"classic",pieces:[],groups:new Map(),seq:0,z:0,active:null,hover:null,drag:null,animating:false};
let toastTimer=0,resizeTimer=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rot=(x,y,a)=>{const r=a*Math.PI/180;return{x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)}};
const angleDiff=(a,b)=>((a-b+540)%360+360)%360-180;
function toast(t){$("toast").textContent=t;$("toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").hidden=true,2500)}
function settings(open){game.classList.toggle("settings-open",open);$("settings-toggle").setAttribute("aria-expanded",String(open))}
$("settings-toggle").onclick=()=>settings(!game.classList.contains("settings-open"));$("settings-close").onclick=()=>settings(false);
function measure(){
const sw=stage.clientWidth,sh=stage.clientHeight,margin=clamp(Math.min(sw,sh)*.065,17,48);
const aspect=s.image.naturalWidth/s.image.naturalHeight;
const w=Math.max(40,Math.min(sw-2*margin,(sh-2*margin)*aspect)),h=w/aspect;
return{sw,sh,w,h,x:(sw-w)/2,y:(sh-h)/2,cw:w/(s.cols||1),ch:h/(s.rows||1)};
}
function pickGrid(size,g){
let best=null;
for(let r=2;r<=Math.min(28,Math.max(2,Math.ceil(g.h/32)));r++)
for(let c=2;c<=Math.min(32,Math.max(2,Math.ceil(g.w/32)));c++){
if(r*c>240)continue;
const w=g.w/c,h=g.h/r;
const score=2.8*Math.abs(Math.log(w/h))+Math.abs(Math.log(Math.sqrt(w*h)/size))+(r*c>160?(r*c-160)*.014:0);
if(!best||score<best.score)best={r,c,score,w,h};
}
return best||{r:2,c:2,w:g.w/2,h:g.h/2};
}
function sizeLabel(){
const val=+slider.value;$("size-value").textContent=val+" пикс.";
slider.style.setProperty("--progress",((val-54)/114*100).toFixed(1)+"%");
if(!s.image)return;
const gr=pickGrid(val,measure());
$("grid-label").textContent=gr.c+" × "+gr.r+" · "+(gr.r*gr.c)+" деталей · ~"+Math.round(gr.w)+" × "+Math.round(gr.h)+" пикс.";
}
function randomEdge(){return{sign:Math.random()>.5?1:-1,center:.465+Math.random()*.07,span:.32+Math.random()*.05,depth:.24+Math.random()*.045}}
function edges(){
if(s.cutStyle==="ornate"){
const layout=window.OrnateCut.generate(s.rows,s.cols,s.g.cw,s.g.ch);
s.H=layout.H;s.V=layout.V;s.corners=layout.corners;
return;
}
s.corners=null;
s.H=Array.from({length:s.rows-1},()=>Array.from({length:s.cols},randomEdge));
s.V=Array.from({length:s.rows},()=>Array.from({length:s.cols-1},randomEdge));
}
// Each boundary is generated only once and then traversed backwards
// by its neighboring piece, guaranteeing a geometrically exact fit.
function trace(p,x0,y0,x1,y1,e,back,m){
if(e&&e.kind==="ornate"){window.OrnateCut.trace(p,x0,y0,x1,y1,e,back,m);return}
if(!e){p.lineTo(x1,y1);return}
const sx=back?x1:x0,sy=back?y1:y0,dx=(back?x0:x1)-sx,dy=(back?y0:y1)-sy;
const len=Math.hypot(dx,dy),nx=dy/len,ny=-dx/len,d=e.sign*e.depth*m;
const a=e.center-e.span/2,b=e.center+e.span/2,t=e.span;
const pt=q=>[sx+dx*q[0]+nx*d*q[1],sy+dy*q[0]+ny*d*q[1]];
const seg=[
["L",[0,0],[a,0]],
["C",[a,0],[a+t*.11,0],[a+t*.19,.03],[a+t*.18,.22]],
["C",[a+t*.18,.22],[a+t*.18,.4],[a-t*.10,.33],[a+t*.03,.67]],
["C",[a+t*.03,.67],[a+t*.07,.95],[a+t*.29,1.07],[a+t*.5,1]],
["C",[a+t*.5,1],[a+t*.71,1.07],[a+t*.93,.95],[a+t*.97,.67]],
["C",[a+t*.97,.67],[b+t*.10,.33],[b-t*.18,.4],[b-t*.18,.22]],
["C",[b-t*.18,.22],[b-t*.19,.03],[b-t*.11,0],[b,0]],
["L",[b,0],[1,0]]
];
for(const v of back?seg.slice().reverse():seg){
if(v[0]==="L")p.lineTo(...pt(back?v[1]:v[2]));
else p.bezierCurveTo(...pt(back?v[3]:v[2]),...pt(back?v[2]:v[3]),...pt(back?v[1]:v[4]));
}
}
function pathFor(r,c){
const w=s.g.cw,h=s.g.ch,m=Math.min(w,h),p=new Path2D();
// Ornate cuts gently perturb four-way junctions; their positions are shared
// by all adjacent pieces, while the original classic shape stays untouched.
if(s.cutStyle==="ornate"&&s.corners){
const at=(rr,cc)=>{
const v=s.corners[rr][cc];return{x:v.x-c*w,y:v.y-r*h};
};
const a=at(r,c),b=at(r,c+1),d=at(r+1,c+1),e=at(r+1,c);
p.moveTo(a.x,a.y);
trace(p,a.x,a.y,b.x,b.y,r?s.H[r-1][c]:null,false,m);
trace(p,b.x,b.y,d.x,d.y,c<s.cols-1?s.V[r][c]:null,false,m);
trace(p,d.x,d.y,e.x,e.y,r<s.rows-1?s.H[r][c]:null,true,m);
trace(p,e.x,e.y,a.x,a.y,c?s.V[r][c-1]:null,true,m);
p.closePath();return p;
}
p.moveTo(0,0);
trace(p,0,0,w,0,r?s.H[r-1][c]:null,false,m);
trace(p,w,0,w,h,c<s.cols-1?s.V[r][c]:null,false,m);
trace(p,w,h,0,h,r<s.rows-1?s.H[r][c]:null,true,m);
trace(p,0,h,0,0,c?s.V[r][c-1]:null,true,m);
p.closePath();return p;
}
function renderPiece(piece){
const g=s.g,w=g.cw,h=g.ch,pad=Math.max(4,Math.min(w,h)*.36),fw=w+pad*2,fh=h+pad*2;
const dpr=Math.min(devicePixelRatio||1,2),cv=document.createElement("canvas");
cv.className="piece-canvas";cv.width=Math.ceil(fw*dpr);cv.height=Math.ceil(fh*dpr);
cv.style.width=fw+"px";cv.style.height=fh+"px";
cv.style.left=(piece.cx-piece.group.ax-fw/2)+"px";cv.style.top=(piece.cy-piece.group.ay-fh/2)+"px";
const ctx=cv.getContext("2d");ctx.setTransform(cv.width/fw,0,0,cv.height/fh,0,0);
ctx.translate(pad,pad);ctx.imageSmoothingQuality="high";
ctx.save();ctx.clip(piece.path);
ctx.drawImage(s.image,-piece.c*w,-piece.r*h,g.w,g.h);
// Preserve the original image's colors. All physical detail lives at
// the cut edge, so a completed image reads as one uninterrupted picture.
ctx.save();
ctx.translate(.32,.36);
ctx.lineWidth=.55;
ctx.strokeStyle="rgba(25,18,13,.12)";
ctx.stroke(piece.path);
ctx.restore();
ctx.save();
ctx.translate(-.32,-.36);
ctx.lineWidth=.5;
ctx.strokeStyle="rgba(255,255,242,.21)";
ctx.stroke(piece.path);
ctx.restore();
ctx.restore();
ctx.lineWidth=.38;
ctx.strokeStyle="rgba(38,27,19,.13)";
ctx.stroke(piece.path);
piece.canvas=cv;return cv;
}
function newGroup(ids,ax,ay,x,y,a=0){
const gr={id:++s.seq,ids:new Set(ids),ax,ay,x,y,a,z:++s.z,node:null};
s.groups.set(gr.id,gr);for(const i of ids)s.pieces[i].group=gr;return gr;
}
function position(gr){
if(!gr.node)return;
gr.node.style.transform="translate3d("+gr.x.toFixed(2)+"px,"+gr.y.toFixed(2)+"px,0) rotate("+gr.a.toFixed(3)+"deg)";
gr.node.style.zIndex=gr.z;
const q=rot(gr.ax,gr.ay,gr.a);
gr.node.classList.toggle("detached",Math.hypot(gr.x-s.g.x-q.x,gr.y-s.g.y-q.y)>2||Math.abs(angleDiff(gr.a,0))>1);
}
function buildGroup(gr){
const node=document.createElement("div");node.className="piece-group";gr.node=node;
for(const id of gr.ids){
const p=s.pieces[id];p.group=gr;p.cx=(p.c+.5)*s.g.cw;p.cy=(p.r+.5)*s.g.ch;
p.path=pathFor(p.r,p.c);node.appendChild(renderPiece(p));
}position(gr);stage.appendChild(node);
}
function render(reset){
stage.replaceChildren();
if(reset){
s.groups.clear();s.pieces=[];s.active=null;s.hover=null;
for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
const id=r*s.cols+c,cx=(c+.5)*s.g.cw,cy=(r+.5)*s.g.ch;
s.pieces.push({id,r,c,cx,cy,path:null,canvas:null,group:null});
newGroup([id],cx,cy,s.g.x+cx,s.g.y+cy);
}
}
for(const gr of s.groups.values())buildGroup(gr);
status();
}
function preview(){
if(!s.image)return;s.cut=false;stage.replaceChildren();s.g=measure();
const g=s.g,cv=document.createElement("canvas"),dpr=Math.min(devicePixelRatio||1,2);
cv.width=Math.round(g.w*dpr);cv.height=Math.round(g.h*dpr);
cv.style.cssText="position:absolute;left:"+g.x+"px;top:"+g.y+"px;width:"+g.w+"px;height:"+g.h+"px;pointer-events:none;box-shadow:0 10px 25px #180c0855";
cv.getContext("2d").drawImage(s.image,0,0,cv.width,cv.height);stage.appendChild(cv);
$("status").textContent="Изображение загружено · нажмите «Разрезать»";
}
function cut(close=true){
if(!s.image||s.animating)return;
const m=measure(),grid=pickGrid(+slider.value,m);
s.cutStyle=$("cut-style").value==="ornate"?"ornate":"classic";
s.cols=grid.c;s.rows=grid.r;s.g={...m,cw:m.w/grid.c,ch:m.h/grid.r};s.cut=true;s.drag=null;
edges();render(true);if(close)settings(false);
}
function status(){
if(!s.cut)return;
const joined=s.pieces.length-s.groups.size;
$("status").textContent=s.pieces.length+" деталей · "+s.groups.size+" групп"+(s.groups.size===1?" · пазл собран!":joined?" · соединено "+joined:" · можно перемешать");
}
function center(p){const gr=p.group,q=rot(p.cx-gr.ax,p.cy-gr.ay,gr.a);return{x:gr.x+q.x,y:gr.y+q.y}}
function pick(x,y){
for(const gr of [...s.groups.values()].sort((a,b)=>b.z-a.z))
for(const id of gr.ids){
const p=s.pieces[id],c=center(p),v=rot(x-c.x,y-c.y,-gr.a);
if(hit.isPointInPath(p.path,v.x+s.g.cw/2,v.y+s.g.ch/2))return gr;
}return null;
}
function point(e){const b=stage.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top}}
function select(gr){s.active=gr.id;s.hover=gr.id;gr.z=++s.z;position(gr)}
function neighbors(gr){
const groups=new Set();
for(const id of gr.ids){
const r=Math.floor(id/s.cols),c=id%s.cols;
const ns=[];if(r>0)ns.push(id-s.cols);if(r<s.rows-1)ns.push(id+s.cols);
if(c>0)ns.push(id-1);if(c<s.cols-1)ns.push(id+1);
for(const n of ns){const other=s.pieces[n].group;if(other.id!==gr.id)groups.add(other.id)}
}
return groups;
}
function snap(gr){
let count=0,threshold=Math.min(s.g.cw,s.g.ch)*.22;
for(let k=0;k<s.pieces.length;k++){
let target=null;
for(const id of neighbors(gr)){
const next=s.groups.get(id);if(!next||Math.abs(angleDiff(gr.a,next.a))>11)continue;
const d=rot(gr.ax-next.ax,gr.ay-next.ay,next.a);
if(Math.hypot(gr.x-next.x-d.x,gr.y-next.y-d.y)<threshold){target=next;break}
}
if(!target)break;
for(const id of gr.ids){
const p=s.pieces[id];target.ids.add(id);p.group=target;target.node.appendChild(p.canvas);
p.canvas.style.left=(p.cx-target.ax-parseFloat(p.canvas.style.width)/2)+"px";
p.canvas.style.top=(p.cy-target.ay-parseFloat(p.canvas.style.height)/2)+"px";
}
gr.node.remove();s.groups.delete(gr.id);target.z=++s.z;gr=target;position(gr);s.active=gr.id;s.hover=gr.id;count++;
}
if(count)toast(s.groups.size===1?"Пазл собран! Детали соединены навсегда.":"Детали соединились!");
status();
}
stage.addEventListener("pointerdown",e=>{
if(!s.cut||s.animating||s.drag||(e.pointerType==="mouse"&&e.button!==0))return;
const v=point(e),gr=pick(v.x,v.y);if(!gr)return;select(gr);
s.drag={id:e.pointerId,gr,px:v.x,py:v.y,x:gr.x,y:gr.y};
stage.classList.add("dragging");stage.setPointerCapture(e.pointerId);e.preventDefault();
});
stage.addEventListener("pointermove",e=>{
if(!s.cut||s.animating)return;
if(s.drag&&s.drag.id===e.pointerId){
const v=point(e),d=s.drag;d.gr.x=d.x+v.x-d.px;d.gr.y=d.y+v.y-d.py;position(d.gr);e.preventDefault();
}else if(e.pointerType==="mouse"){const v=point(e),gr=pick(v.x,v.y);s.hover=gr?gr.id:null}
});
function release(e){
if(!s.drag||s.drag.id!==e.pointerId)return;
const d=s.drag,gr=d.gr,moved=Math.hypot(gr.x-d.x,gr.y-d.y)>3;s.drag=null;stage.classList.remove("dragging");
try{if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId)}catch(err){}
if(moved)snap(gr);
}
stage.addEventListener("pointerup",release);stage.addEventListener("pointercancel",release);
stage.addEventListener("lostpointercapture",e=>{if(s.drag&&s.drag.id===e.pointerId){const gr=s.drag.gr;s.drag=null;stage.classList.remove("dragging");snap(gr)}});
function turn(deg,at){
if(!s.cut||s.animating||s.drag)return;
let gr=at?pick(point(at).x,point(at).y):null;
if(!gr)gr=s.groups.get(s.hover)||s.groups.get(s.active);
if(!gr){toast("Выберите деталь на доске.");return}
select(gr);gr.a+=deg;position(gr);snap(gr);
}
stage.addEventListener("wheel",e=>{
if(!s.cut||s.animating)return;const v=point(e),gr=pick(v.x,v.y);if(!gr)return;
e.preventDefault();turn(e.deltaY>0?15:-15,e);
},{passive:false});
$("rotate-left").onclick=()=>turn(-15);$("rotate-right").onclick=()=>turn(15);
window.addEventListener("keydown",e=>{
if(e.altKey||e.ctrlKey||e.metaKey||/input|textarea/i.test(e.target.tagName))return;
const k=e.key.toLowerCase();if(k==="q"||k==="e"){e.preventDefault();turn(k==="q"?-15:15)}
if(k==="escape")settings(false);
});
function shuffle(){
if(!s.cut||s.animating)return;
if(s.groups.size===1&&s.pieces.length>1){toast("Пазл уже соединён. Разрежьте изображение заново.");settings(true);return}
s.active=null;s.hover=null;s.animating=true;
for(const id of ["shuffle-button","cut-button","reset-button"])$(id).disabled=true;
const jobs=[...s.groups.values()].map(gr=>{
let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
for(const id of gr.ids){const p=s.pieces[id];xmin=Math.min(xmin,p.cx);xmax=Math.max(xmax,p.cx);ymin=Math.min(ymin,p.cy);ymax=Math.max(ymax,p.cy)}
const radius=Math.hypot(xmax-xmin+s.g.cw,ymax-ymin+s.g.ch)/2;
const margin=clamp(radius*.65,22,Math.min(s.g.sw,s.g.sh)*.23);
return{gr,x:margin+Math.random()*Math.max(0,s.g.sw-2*margin),y:margin+Math.random()*Math.max(0,s.g.sh-2*margin),a:gr.a+(Math.floor(Math.random()*24)-12)*15,delay:Math.random()*.24,duration:1.1+Math.random()*.6};
});
function done(){s.animating=false;for(const id of ["shuffle-button","cut-button","reset-button"])$(id).disabled=false;status()}
if(window.gsap&&!matchMedia("(prefers-reduced-motion: reduce)").matches){
const timeline=window.gsap.timeline({onComplete:done});
for(const j of jobs)timeline.to(j.gr,{x:j.x,y:j.y,a:j.a,duration:j.duration,delay:j.delay,ease:"power3.inOut",onUpdate:()=>position(j.gr)},0);
}else if(matchMedia("(prefers-reduced-motion: reduce)").matches){
for(const j of jobs){Object.assign(j.gr,{x:j.x,y:j.y,a:j.a});position(j.gr)}done();
}else{
const start=performance.now(),initial=jobs.map(j=>({x:j.gr.x,y:j.gr.y,a:j.gr.a}));
function tick(now){let finished=true;
jobs.forEach((j,i)=>{const t=clamp((now-start-j.delay*1000)/(j.duration*1000),0,1);
if(t<1)finished=false;const u=t<.5?4*t*t*t:1-Math.pow(2-2*t,3)/2;
j.gr.x=initial[i].x+(j.x-initial[i].x)*u;j.gr.y=initial[i].y+(j.y-initial[i].y)*u;j.gr.a=initial[i].a+(j.a-initial[i].a)*u;position(j.gr)});
if(finished)done();else requestAnimationFrame(tick)}requestAnimationFrame(tick);
}
}
function reset(){
if(!s.cut||s.animating)return;
for(const gr of s.groups.values())gr.node.remove();
s.groups.clear();const first=s.pieces[0],gr=newGroup(s.pieces.map(p=>p.id),first.cx,first.cy,s.g.x+first.cx,s.g.y+first.cy);
render(false);s.active=gr.id;s.hover=null;toast("Все детали соединены. Для новой игры разрежьте изображение.");
}
$("shuffle-button").onclick=shuffle;$("reset-button").onclick=reset;$("cut-button").onclick=()=>cut(true);
slider.addEventListener("input",sizeLabel);
function upload(f){
if(!f)return;
if(!f.type.startsWith("image/")&&!/\.(jpe?g|png|webp|bmp|avif|gif|svg)$/i.test(f.name)){toast("Нужен файл изображения.");return}
if(f.size>35*1024*1024){toast("Максимальный размер файла — 35 МБ.");return}
const url=URL.createObjectURL(f),img=new Image();
img.onload=()=>{
if(s.url)URL.revokeObjectURL(s.url);s.url=url;s.image=img;
$("file-name").textContent=f.name;$("file-hint").textContent=img.naturalWidth+" × "+img.naturalHeight;
const thumb=document.createElement("img");thumb.src=url;thumb.alt="";$("upload-preview").replaceChildren(thumb);
sizeLabel();preview();file.value="";toast("Картинка готова. Нажмите «Разрезать».");
};
img.onerror=()=>{URL.revokeObjectURL(url);file.value="";toast("Не удалось прочитать изображение.")};
img.src=url;
}
file.onchange=e=>upload(e.target.files[0]);
for(const evt of ["dragenter","dragover"])$("dropzone").addEventListener(evt,e=>{e.preventDefault();$("dropzone").classList.add("drag-over")});
for(const evt of ["dragleave","drop"])$("dropzone").addEventListener(evt,e=>{e.preventDefault();$("dropzone").classList.remove("drag-over")});
$("dropzone").addEventListener("drop",e=>upload(e.dataTransfer.files[0]));
let oldW=0,oldH=0;
new ResizeObserver(()=>{
if(Math.abs(oldW-stage.clientWidth)<2&&Math.abs(oldH-stage.clientHeight)<2)return;
oldW=stage.clientWidth;oldH=stage.clientHeight;
clearTimeout(resizeTimer);
resizeTimer=setTimeout(()=>{
if(!s.image||!stage.clientWidth||!stage.clientHeight||s.animating||s.drag)return;
if(!s.cut){preview();sizeLabel();return}
const old=s.g,g=measure(),scale=g.w/old.w;
for(const gr of s.groups.values()){
gr.ax*=scale;gr.ay*=scale;gr.x=g.x+(gr.x-old.x)*scale;gr.y=g.y+(gr.y-old.y)*scale;
}
s.g={...g,cw:g.w/s.cols,ch:g.h/s.rows};render(false);sizeLabel();
},120);
}).observe(stage);
const demo='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#648d9d"/><stop offset=".65" stop-color="#c8d3bc"/><stop offset="1" stop-color="#f3d4a4"/></linearGradient><linearGradient id="l" x2="0" y2="1"><stop stop-color="#82aba4"/><stop offset="1" stop-color="#244a56"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><circle cx="868" cy="184" r="85" fill="#ffe6b0" opacity=".76"/><g fill="#fffbdf" opacity=".47"><ellipse cx="291" cy="146" rx="140" ry="18"/><ellipse cx="360" cy="130" rx="82" ry="23"/></g><path d="m0 440 168-159 92 97 176-196 135 216 149-162 162 186 116-207 202 225v360H0Z" fill="#809d9a"/><path d="m332 299 104-117 135 216-137-110-56 54ZM807 307l75-92 124 180-124-96-46 32Z" fill="#e6e2d1" opacity=".83"/><path d="M0 499Q173 380 351 447t352-25 497 41v337H0Z" fill="#537d73"/><path d="M0 563Q200 438 460 507t740-28v321H0Z" fill="#719080"/><path d="M0 547q330-60 616-7t584-32v292H0Z" fill="url(#l)"/><path d="M0 631Q128 593 262 654t370 84 568-108v170H0Z" fill="#799477"/><path d="M0 731Q214 683 348 763t460 17 392-78v98H0Z" fill="#355e52"/><g stroke="#ffe7b8" stroke-width="5" opacity=".24" fill="none"><path d="M590 581q231-18 470-3"/><path d="M338 638q406-28 747 1"/><path d="M500 698q333-24 674 4"/></g><g fill="#24463f"><path d="m77 606 44-171 49 171h-27v94H98v-94Z"/><path d="m116 603 44-149 44 149h-24v111h-41V603Z"/><path d="m1086 599 51-183 52 183h-30v129h-50V599Z"/><path d="m1148 604 40-133 39 133h-21v115h-42V604Z"/></g><g fill="none" stroke="#3a5153" stroke-width="4" stroke-linecap="round"><path d="m235 166 16-7 17 8"/><path d="m287 143 15-6 17 7"/></g></svg>';
const sample=new Image();
sample.onload=()=>{if(s.image)return;s.image=sample;const im=document.createElement("img");im.src=sample.src;im.alt="";$("upload-preview").replaceChildren(im);sizeLabel();cut(true)};
sample.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(demo);
sizeLabel();
})();