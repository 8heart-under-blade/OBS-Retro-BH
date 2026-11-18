/* Display-only compression and a seeded, illustrative sunspot cycle. */
(function(root){
'use strict';
const TAU=Math.PI*2;
const orbitRadii=[175,240,310,390,485,590,700,815];
// Deliberate opening composition, NOT a shared historical-date alignment.
const openingLongitudes=[70,230,335,140,195,25,290,105].map(deg=>deg*Math.PI/180);
function displayPosition(orbits,index,days){
  const p=orbits.planets[index];
  return orbits.position(p,days+(openingLongitudes[index]-p.L)*p.period/TAU);
}
// sqrt(real radius / solar radius): preserves ordering, compresses huge size differences.
const bodyRadii=[2439.7,6051.8,6371,3389.5,69911,58232,25362,24622].map(r=>110*Math.sqrt(r/695700));
function layout(width,height,orbits){
  // Use the full scene beneath the header, including behind the lower overlay.
  const box={left:width*.035,right:width*.965,top:height*.105,bottom:height*.90};
  const target=(box.right-box.left)/(box.bottom-box.top);
  const raw=orbits.planets.map(p=>Array.from({length:361},(_,j)=>orbits.position(p,0,j/360*TAU)));
  function measure(elevation){
    let minX=-110,maxX=110,minY=-110,maxY=110;
    const paths=raw.map((points,i)=>{
      const margin=bodyRadii[i]*(i===5?2.1:1)+3;
      return points.map(p=>{
        const q=orbits.project(p,elevation),factor=orbitRadii[i]/orbits.planets[i].a;
        const x=q.x*factor,y=q.y*factor;
        minX=Math.min(minX,x-margin);maxX=Math.max(maxX,x+margin);
        minY=Math.min(minY,y-margin);maxY=Math.max(maxY,y+margin);
        return {x,y};
      });
    });
    return {paths,bounds:{minX,maxX,minY,maxY},ratio:(maxX-minX)/(maxY-minY)};
  }
  // Tilt the camera to match the available aspect ratio, rather than leaving a flat strip.
  let low=.08,high=1.45;
  for(let i=0;i<15;i++){const mid=(low+high)/2;if(measure(mid).ratio>target)low=mid;else high=mid;}
  const elevation=(low+high)/2,{paths,bounds}=measure(elevation),{minX,maxX,minY,maxY}=bounds;
  const scale=Math.min((box.right-box.left)/(maxX-minX),(box.bottom-box.top)/(maxY-minY));
  return {scale,cx:(box.left+box.right)/2-(minX+maxX)*scale/2,cy:(box.top+box.bottom)/2-(minY+maxY)*scale/2,paths,box,bounds,elevation,project:p=>orbits.project(p,elevation)};
}
// Align enhancement with the Great Red Spot already present in the bundled map.
// Map-space center (~u .367, v .612), not a present-day System II longitude.
const jupiterStorm={longitude:(.367-.5)*TAU,latitude:(.612-.5)*Math.PI};
jupiterStorm.openingPhase=jupiterStorm.longitude-.35;
function jupiterAlbedo(longitude,latitude,base,activity=0,phase=0){
  const delta=Math.atan2(Math.sin(longitude-jupiterStorm.longitude),Math.cos(longitude-jupiterStorm.longitude));
  const scale=1+.08*activity,x=delta/(.18*scale),y=(latitude-jupiterStorm.latitude)/(.085*scale),q=Math.hypot(x,y);
  if(q>=1.35)return base;
  const theta=Math.atan2(y,x),swirl=.5+.5*Math.sin(theta*2-q*11+phase);
  const rim=Math.exp(-Math.pow((q-.96)/.14,2));
  const storm=.16+.10*swirl+.38*rim;
  const blend=q<=1?1:1-((q-1)/.35)**2*(3-2*(q-1)/.35);
  return base+(storm-base)*blend;
}
function ringPoint(angle,radius){
  const roll=-.45,q=.38,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
  return {x:x*Math.cos(roll)-y*q*Math.sin(roll),y:x*Math.sin(roll)+y*q*Math.cos(roll),z:y*Math.sqrt(1-q*q)};
}
function ringShadow(point,light){
  const len=Math.hypot(light.x,light.y,light.z);
  const along=(point.x*light.x+point.y*light.y+point.z*light.z)/len;
  if(along>=0)return 1; // Sun is outward: the planet cannot block this ray.
  const closest=Math.sqrt(Math.max(0,point.x**2+point.y**2+point.z**2-along*along));
  // Sphere-ray shadow, softly feathered to avoid jagged edges at stream resolution.
  const t=Math.max(0,Math.min(1,(closest-.96)/.10));
  return .045+.955*t*t*(3-2*t);
}
function ringIllumination(light){
  const q=.38,v=Math.sqrt(1-q*q),roll=-.45,len=Math.hypot(light.x,light.y,light.z);
  return .24+.76*Math.abs((Math.sin(roll)*v*light.x-Math.cos(roll)*v*light.y+q*light.z)/len);
}
function earthAlbedo(r,g,b){
  // Preserve the real day map's geography; blue-dominant ocean is deliberately subdued.
  const lum=(.2126*r+.7152*g+.0722*b)/255;
  const water=Math.max(Math.max(0,Math.min(1,(b-Math.max(r,g)-2)/16)),1-Math.max(0,Math.min(1,(lum-.01)/.04)));
  const land=.68+.32*Math.sqrt(lum),ocean=.075+.10*Math.sqrt(lum);
  return land*(1-water)+ocean*water;
}
const earthObliquity=23.43928*Math.PI/180,lunarInclination=5.145*Math.PI/180;
function earthMoonView(p,elevation=.36){
  // One rigid camera transform for Earth, orbit, normals and the lunar attitude.
  const roll=-.15,x=p.x,y=-p.y*Math.cos(elevation)-p.z*Math.sin(elevation);
  return {x:x*Math.cos(roll)-y*Math.sin(roll),y:x*Math.sin(roll)+y*Math.cos(roll),z:p.y*Math.sin(elevation)-p.z*Math.cos(elevation)};
}
function earthMoonFrame(node=Math.PI/4,elevation=.36){
  const e=earthObliquity,i=lunarInclination,view=p=>earthMoonView(p,elevation);
  const rotateNode=p=>({x:p.x*Math.cos(node)+p.z*Math.sin(node),y:p.y,z:-p.x*Math.sin(node)+p.z*Math.cos(node)});
  const orbitU=rotateNode({x:1,y:0,z:0}),orbitV=rotateNode({x:0,y:Math.sin(i),z:-Math.cos(i)});
  const orbitNormal=view(rotateNode({x:0,y:Math.cos(i),z:Math.sin(i)}));
  const earthBasis=[{x:Math.cos(e),y:-Math.sin(e),z:0},{x:-Math.sin(e),y:-Math.cos(e),z:0},{x:0,y:0,z:-1}].map(view);
  const south=earthBasis[1];
  return {earthBasis,earthAxis:{x:-south.x,y:-south.y,z:-south.z},eclipticNormal:view({x:0,y:1,z:0}),orbitNormal,orbitU,orbitV};
}
function earthMoon(time,node=Math.PI/4,elevation=.36){
  const radius=320,angle=-.5+time*TAU/60,frame=earthMoonFrame(node,elevation),a=Math.cos(angle)*radius,b=Math.sin(angle)*radius;
  const p=earthMoonView({x:frame.orbitU.x*a+frame.orbitV.x*b,y:frame.orbitU.y*a+frame.orbitV.y*b,z:frame.orbitU.z*a+frame.orbitV.z*b},elevation);
  const near={x:-p.x/radius,y:-p.y/radius,z:-p.z/radius},n=frame.orbitNormal,south={x:-n.x,y:-n.y,z:-n.z};
  const right={x:south.y*near.z-south.z*near.y,y:south.z*near.x-south.x*near.z,z:south.x*near.y-south.y*near.x};
  return {...p,earthBasis:frame.earthBasis,moonBasis:[right,south,near]};
}
function goodbyeLayout(width,height){
  const elevation=.22,box={left:width*.045,right:width*.955,top:height*.115,bottom:height*.675};
  const earthRadius=Math.min(height*.265,width*.24),moonRadius=earthRadius*1737.4/6371;
  // Exact projected amplitudes of the circular orbit from two perpendicular phases.
  const a=earthMoon(0,Math.PI/4,elevation),b=earthMoon(15,Math.PI/4,elevation);
  const extentX=Math.hypot(a.x,b.x)/320,extentY=Math.hypot(a.y,b.y)/320;
  const orbitRadius=Math.min(((box.right-box.left)/2-moonRadius)/extentX,((box.bottom-box.top)/2-moonRadius)/extentY);
  return {cx:(box.left+box.right)/2,cy:(box.top+box.bottom)/2,earthRadius,moonRadius,orbitScale:orbitRadius/320,elevation,box};
}
function noise3(x,y,z,seed=173){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const smooth=t=>t*t*(3-2*t),u=smooth(x-ix),v=smooth(y-iy),w=smooth(z-iz);
  const hash=(a,b,c)=>{let h=Math.imul(a,1597334677)^Math.imul(b,3812015801)^Math.imul(c,95868973)^seed;h=Math.imul(h^(h>>>16),2246822519);return((h^(h>>>13))>>>0)/4294967296;};
  const mix=(a,b,t)=>a+(b-a)*t;
  return mix(mix(mix(hash(ix,iy,iz),hash(ix+1,iy,iz),u),mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),u),v),mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),u),mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),u),v),w);
}
function photosphere(x,y,z,time,seed=173){
  const angle=time*.025,co=Math.cos(angle),si=Math.sin(angle),bx=x*co+z*si,bz=-x*si+z*co;
  // Isotropic body-space detail: smooth rotation and slow cellular evolution, not frame-random flicker.
  const convection=noise3(bx*24+time*.045,y*24,bz*24-time*.025,seed+1);
  const grain=Math.max(0,Math.min(1,(noise3(bx*96,y*96+time*.02,bz*96,seed)-.25)*2));
  return {bx,bz,grain,tone:(.84+.12*z)*(.90+.10*convection)};
}
function grainOpacity(grain,tone){
  // Continuous coverage replaces binary on/off dots to suppress temporal aliasing.
  const t=Math.max(0,Math.min(1,(tone*.94-grain+.24)/.48));
  return t*t*(3-2*t)*(.45+tone*.5)*Math.sqrt(Math.max(0,tone));
}
function rng(seed){return()=>{seed=Math.imul(seed^seed>>>16,0x45d9f3b);seed=Math.imul(seed^seed>>>16,0x45d9f3b);seed^=seed>>>16;return(seed>>>0)/4294967296;};}
function sunspots(time,seed=173){
  // 90 seconds represents an 11-year cycle. Independent of the orbital clock.
  const t=time+45,cycle=Math.floor(t/90),spots=[];
  for(let k=cycle-1;k<=cycle;k++){
    const rand=rng((seed^Math.imul(k+17,7919))|0);
    for(let i=0;i<42;i++){
      const phase=rand(),birth=k*90+phase*90,life=12+rand()*20;
      const accept=rand()<Math.sin(Math.PI*phase)**2,longitude=rand()*TAU;
      const latitude=(rand()<.5?-1:1)*((32-25*phase)+(rand()-.5)*8)*Math.PI/180;
      const radius=.025+rand()*.035,age=(t-birth)/life;
      if(!accept||age<=0||age>=1)continue;
      const strength=Math.sin(Math.PI*age)**.7;
      // Paired spots share a latitude band; butterfly bands migrate toward the equator.
      for(let j=0;j<2;j++){
        const lon=longitude+j*.065,lat=latitude+j*.015;
        spots.push({x:Math.cos(lat)*Math.sin(lon),y:Math.sin(lat),z:Math.cos(lat)*Math.cos(lon),radius:radius*(j?.7:1),strength});
      }
    }
  }
  return spots;
}
const api={orbitRadii,bodyRadii,layout,sunspots,displayPosition,noise3,photosphere,grainOpacity,jupiterStorm,jupiterAlbedo,ringPoint,ringShadow,ringIllumination,earthAlbedo,earthMoon,earthMoonFrame,earthObliquity,lunarInclination,goodbyeLayout};root.CelestialSolar=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
