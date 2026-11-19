/* Display-resolution stippling and visual tracer advection over the original ray map. */
(function(root){
'use strict';
const clamp=x=>Math.max(0,Math.min(1,x));
function random(seed){return()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
function interpolate(map,x,y){
  const fx=Math.max(0,Math.min(map.width-1,x)),fy=Math.max(0,Math.min(map.height-1,y));
  const ix=Math.floor(fx),iy=Math.floor(fy),dx=fx-ix,dy=fy-iy;
  let flux=0,radius=0,cos=0,sin=0,weight=0;
  for(let j=0;j<2;j++)for(let k=0;k<2;k++){
    const i=Math.min(map.height-1,iy+j)*map.width+Math.min(map.width-1,ix+k),w=(k?dx:1-dx)*(j?dy:1-dy);
    flux+=map.flux[i]*w;
    if(map.radius[i]>0){radius+=map.radius[i]*w;cos+=Math.cos(map.azimuth[i])*w;sin+=Math.sin(map.azimuth[i])*w;weight+=w;}
  }
  return {flux,radius:weight?radius/weight:0,azimuth:Math.atan2(sin,cos),weight};
}
function samples(map,width,height,seed=173){
  const rand=random(seed),out=[],sx=width/map.width,sy=height/map.height;
  const nx=Math.max(1,Math.ceil(sx/1.7)),ny=Math.max(1,Math.ceil(sy/1.7));
  for(let row=0;row<map.height;row++)for(let col=0;col<map.width;col++){
    const i=row*map.width+col;if(map.radius[i]<=0)continue;
    for(let j=0;j<ny;j++)for(let k=0;k<nx;k++){
      const x=col-.5+(k+rand())/nx,y=row-.5+(j+rand())/ny,hit=interpolate(map,x,y);
      if(hit.flux<=0||hit.radius<=0)continue;
      const u=(x+.5)/map.width,v=(y+.5)/map.height,grain=rand(),life=5+rand()*3;
      const seedTone=tone(hit.flux,hit.radius,hit.azimuth,0);
      const age=life*(.2+rand()*.6);
      out.push({x:u,y:v,seedX:u,seedY:v,...hit,grain,size:1.45+rand()*.35,age,initialAge:age,life,seedTone,baseOpacity:opacity(grain,seedTone),luminance:1,support:1});
    }
  }
  return out;
}
function flowField(map){
  const vx=new Float32Array(map.flux.length),vy=new Float32Array(map.flux.length),w=map.width;
  const angle=d=>Math.atan2(Math.sin(d),Math.cos(d));
  for(let y=1;y<map.height-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,r=map.radius[i];if(!r)continue;
    const neighbors=[i-1,i+1,i-w,i+w];
    if(neighbors.some(n=>!map.radius[n]||Math.abs(map.radius[n]-r)>r*.22||Math.abs(angle(map.azimuth[n]-map.azimuth[i]))>.65))continue;
    const rx=(map.radius[i+1]-map.radius[i-1])/2,ry=(map.radius[i+w]-map.radius[i-w])/2;
    const ax=angle(map.azimuth[i+1]-map.azimuth[i-1])/2,ay=angle(map.azimuth[i+w]-map.azimuth[i-w])/2,det=rx*ay-ry*ax;
    if(Math.abs(det)<1e-7)continue;
    // Positive disk azimuth: upper arc right→left, foreground left→right.
    const omega=1.4/Math.pow(r,1.5);let dx=-ry*omega/det,dy=rx*omega/det;
    const speed=Math.hypot(dx,dy),cap=w*.012;if(speed>cap){dx*=cap/speed;dy*=cap/speed;}
    vx[i]=dx/w;vy[i]=dy/map.height;
  }
  return {vx,vy,secondary:secondaryCurve(map)};
}
function secondaryCurve(map){
  // Fit the lower image's flux-weighted centerline; retain each grain's offset from it.
  const rows=[];
  for(let x=0;x<map.width;x++){
    let sum=0,ySum=0;
    for(let y=Math.ceil(map.height*.66);y<map.height;y++){const i=y*map.width+x,w=map.flux[i];if(map.radius[i]>0){sum+=w;ySum+=w*(y+.5)/map.height;}}
    if(sum>.02){const u=((x+.5)/map.width-.49)*10;rows.push({u,y:ySum/sum});}
  }
  const matrix=Array.from({length:3},()=>[0,0,0,0]);
  for(const {u,y} of rows){const v=[u*u,u,1];for(let i=0;i<3;i++){for(let j=0;j<3;j++)matrix[i][j]+=v[i]*v[j];matrix[i][3]+=v[i]*y;}}
  for(let i=0;i<3;i++){
    let pivot=i;for(let j=i+1;j<3;j++)if(Math.abs(matrix[j][i])>Math.abs(matrix[pivot][i]))pivot=j;
    [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];
    if(Math.abs(matrix[i][i])<1e-9)return {a:-6,b:0};
    const scale=matrix[i][i];for(let k=i;k<4;k++)matrix[i][k]/=scale;
    for(let j=0;j<3;j++)if(j!==i){const factor=matrix[j][i];for(let k=i;k<4;k++)matrix[j][k]-=factor*matrix[i][k];}
  }
  return {a:Math.max(-16,Math.min(-1,matrix[0][3]*100)),b:Math.max(-.3,Math.min(.3,matrix[1][3]*10))};
}
function velocity(map,field,x,y){
  const fx=Math.max(0,Math.min(map.width-1,x*map.width-.5)),fy=Math.max(0,Math.min(map.height-1,y*map.height-.5)),ix=Math.floor(fx),iy=Math.floor(fy),dx=fx-ix,dy=fy-iy;
  let vx=0,vy=0;
  for(let j=0;j<2;j++)for(let k=0;k<2;k++){
    const i=Math.min(map.height-1,iy+j)*map.width+Math.min(map.width-1,ix+k),w=(k?dx:1-dx)*(j?dy:1-dy);vx+=field.vx[i]*w;vy+=field.vy[i]*w;
  }
  return {vx,vy};
}
function advanceSecondary(p,map,field,dt){
  if(p.lowerVX===undefined){
    const {a,b}=field.secondary,slope=2*a*(p.seedX-.49)+b;
    // Always right→left along the curved underside, not the image-parity-dependent field.
    p.lowerVX=-.0013/Math.sqrt(1+slope*slope);p.stationary=false;
  }
  p.age=(p.age+dt)%p.life;
  const travel=p.age-p.initialAge;
  p.x=p.seedX+p.lowerVX*travel;
  const {a,b}=field.secondary,dx=p.x-.49,seedDX=p.seedX-.49;
  p.y=p.seedY+a*(dx*dx-seedDX*seedDX)+b*(dx-seedDX);
  const hit=interpolate(map,p.x*map.width-.5,p.y*map.height-.5);
  const mask=clamp((hit.weight-.7)/.3),targetSupport=mask*mask*(3-2*mask);
  p.support+=(targetSupport-p.support)*(1-Math.exp(-dt/.35));
  const target=Math.min(1.25,Math.sqrt(tone(hit.flux,Math.max(1,hit.radius),hit.azimuth,0)/Math.max(.001,p.seedTone)));
  p.luminance+=(target-p.luminance)*(1-Math.exp(-dt/.6));
}
function advance(p,map,field,dt){
  if(dt<=0)return;
  if(p.seedY>.66){advanceSecondary(p,map,field,dt);return;}
  if(p.stationary===undefined){
    const initial=velocity(map,field,p.seedX,p.seedY);
    p.seedSpeed=Math.hypot(initial.vx,initial.vy);p.stationary=p.seedSpeed<.00008;
  }
  if(p.stationary)return;
  p.age+=dt;
  if(p.age>=p.life){p.x=p.seedX;p.y=p.seedY;p.age=0;p.retiring=false;p.luminance=1;const hit=interpolate(map,p.x*map.width-.5,p.y*map.height-.5);Object.assign(p,hit);}
  if(p.retiring)return;
  const v=velocity(map,field,p.x,p.y),mx=p.x+v.vx*dt*.5,my=p.y+v.vy*dt*.5,mid=velocity(map,field,mx,my);
  const x=p.x+mid.vx*dt,y=p.y+mid.vy*dt;
  const hit=interpolate(map,x*map.width-.5,y*map.height-.5);
  const speed=Math.hypot(mid.vx,mid.vy);
  if(x<0||x>1||y<0||y>.66||hit.weight<.94||!hit.radius||Math.abs(hit.radius-p.radius)>Math.max(.3,p.radius*.035)||speed<p.seedSpeed*.4||speed>p.seedSpeed*2.5||Math.hypot(x-p.seedX,y-p.seedY)>.035){
    p.retiring=true;p.age=Math.max(p.age,p.life-1.4);return;
  }
  p.x=x;p.y=y;p.flux=hit.flux;p.radius=hit.radius;p.azimuth=hit.azimuth;
  const target=Math.min(1.4,Math.sqrt(tone(hit.flux,hit.radius,hit.azimuth,0)/Math.max(.001,p.seedTone)));
  p.luminance+=(target-p.luminance)*(1-Math.exp(-dt/.45));
}
function envelope(p){if(p.stationary)return 1;const a=clamp(p.age/1.4),b=clamp((p.life-p.age)/1.4);return a*a*(3-2*a)*b*b*(3-2*b);}
function displayX(x){const d=x-.49,t=clamp((Math.abs(d)-.085)/.20);return .49+d*(1+.18*t*t*(3-2*t));}
function tone(flux,radius,azimuth,time){
  const phase=azimuth-time*10/Math.pow(radius,1.5);
  return 1-Math.exp(-flux*(.88+.08*Math.sin(phase*9+radius*2.4)+.04*Math.sin(phase*17-radius*3.1))*2.8);
}
function opacity(grain,t){const a=clamp((t*.92-grain+.055)/.11);return a*a*(3-2*a)*(.55+.45*t)*Math.sqrt(t);}
const api={samples,tone,opacity,flowField,advance,envelope,displayX};root.BlackHoleInk=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
