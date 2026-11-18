/* Shared visual POC. BRB uses the owner's Retro-BH ray tracer and grain treatment. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = x => Math.max(0, Math.min(1, x));
  function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function spherePoints(count, seed) {
    const rand = random(seed);
    return Array.from({length: count}, () => { const y = rand()*2-1, a = rand()*TAU, r = Math.sqrt(1-y*y); return {x:r*Math.cos(a), y, z:r*Math.sin(a), grain:rand()}; });
  }
  function frameDelta(now,clock,fps){
    const interval=1000/fps;
    if(clock.next===undefined){clock.next=now;clock.last=now;}
    if(now+.25<clock.next)return null;
    const delta=Math.min((now-clock.last)/1000,.1);clock.last=now;
    clock.next+=interval;if(clock.next<now-.25)clock.next=now+interval;
    return delta;
  }
  class Scene {
    constructor(canvas, options = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d', {alpha:false});
      this.options = {scene:'starting', fps:30, seed:173, motion:true, ...options};
      this.points = spherePoints(32000, this.options.seed);
      this.audio={level:0,swell:0,accent:0};this.audioPhase=0;
      this.maps = {}; this.assetErrors = [];
      for(const name of ['mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune']) {
        const image = new Image();
        image.onload = () => {
          const surface=document.createElement('canvas');surface.width=1024;surface.height=512;
          const ctx=surface.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,1024,512);
          const rgba=ctx.getImageData(0,0,1024,512).data,values=new Float32Array(1024*512);
          for(let i=0;i<values.length;i++) values[i]=name==='earth'?root.CelestialSolar.earthAlbedo(rgba[i*4],rgba[i*4+1],rgba[i*4+2]):(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])/255;
          this.maps[name]=values;this.render();
        };
        image.onerror=()=>{this.assetErrors.push(name);this.render();};
        image.src='assets/'+(name==='venus'?'venus_atmosphere':name)+'.jpg';
      }
      const rand = random(this.options.seed);
      this.stars = Array.from({length:150}, () => [rand(),rand(),rand()]);
      this.belt=Array.from({length:420},()=>[408+rand()*57,rand()*TAU,rand()]);
      this.time = 0; this.last = null; this.running = false;
      this.resize = () => { const b = canvas.getBoundingClientRect(); this.w = Math.max(1, Math.round(b.width)); this.h = Math.max(1, Math.round(b.height)); const d = Math.min(root.devicePixelRatio || 1, 1.5); canvas.width = Math.round(this.w*d); canvas.height = Math.round(this.h*d); this.ctx.setTransform(d,0,0,d,0,0); this.solarLayout=root.CelestialSolar.layout(this.w,this.h,root.CelestialOrbits); this.goodbyeLayout=root.CelestialSolar.goodbyeLayout(this.w,this.h); if(this.options.scene==='brb') this.traceBlackHole(); this.render(); };
      this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas); this.resize();
      this.tick = now => { if (!this.running) return; const delta=frameDelta(now,this.clock,this.options.fps); if(delta!==null){if(!document.hidden&&this.options.motion){this.time+=delta;this.updateAudio(delta);}if(!document.hidden)this.render();} this.raf=requestAnimationFrame(this.tick); };
      this.start();
    }
    setAudioSource(source){this.audioSource=source;}
    updateAudio(dt){
      if(this.audioSource){const a=this.audioSource.step(dt,performance.now()/1000);this.audio={level:clamp(a.level),swell:clamp(a.swell),accent:clamp(a.accent)};}
      this.audioPhase+=dt*this.audio.swell*.5;
    }
    setScene(scene) { if (!['starting','brb','goodbye'].includes(scene)) throw new Error('Unknown scene'); this.options.scene=scene; if(scene==='brb') this.traceBlackHole(); this.render(); }
    start() { if (this.running) return; this.running=true; this.clock={}; this.raf=requestAnimationFrame(this.tick); }
    pause() { this.running=false; cancelAnimationFrame(this.raf); }
    destroy() { this.pause(); this.observer.disconnect(); if(this.worker) this.worker.terminate(); }
    traceBlackHole() {
      if(!this.w || !this.h) return;
      const ratio=Math.min(1,Math.sqrt(180000/(this.w*this.h)));
      const width=Math.max(1,Math.round(this.w*ratio)),height=Math.max(1,Math.round(this.h*ratio));
      const key=width+'x'+height;
      if(this.traceKey===key) return;
      this.traceKey=key;
      if(!this.worker) {
        this.worker=new Worker('blackhole/raytracer-worker.js');
        this.worker.onmessage=({data})=>{
          if(data.id!==this.traceJob)return;
          this.map=data;
          this.field=document.createElement('canvas');this.field.width=data.width;this.field.height=data.height;
          this.fieldContext=this.field.getContext('2d',{alpha:false});
          this.fieldPixels=this.fieldContext.createImageData(data.width,data.height);
          this.blackHoleSamples=root.BlackHoleInk.samples(data,this.w,this.h,this.options.seed);
          this.blackHoleFlow=root.BlackHoleInk.flowField(data);this.blackHoleTime=this.time;
          if(!this.grainSprite){
            this.grainSprite=document.createElement('canvas');this.grainSprite.width=32;this.grainSprite.height=32;
            const sprite=this.grainSprite.getContext('2d'),gradient=sprite.createRadialGradient(16,16,0,16,16,16);
            gradient.addColorStop(0,'rgba(234,236,205,1)');gradient.addColorStop(.45,'rgba(234,236,205,.9)');
            gradient.addColorStop(.8,'rgba(234,236,205,.3)');gradient.addColorStop(1,'rgba(234,236,205,0)');
            sprite.fillStyle=gradient;sprite.fillRect(0,0,32,32);
          }
          this.render();
        };
        this.worker.onerror=()=>{this.traceError=true;this.render();};
      }
      this.worker.postMessage({id:this.traceJob=(this.traceJob||0)+1,width,height,inclination:75*Math.PI/180,curved:true});
    }
    dot(x,y,alpha,size=1) { this.ctx.globalAlpha=clamp(alpha); this.ctx.fillRect(x,y,size,size); }
    sphere(cx,cy,r,kind,phase=0,lightDirection={x:-.65,y:-.24,z:.7},tilt=0,spinAngle=null,basis=null) {
      const c=this.ctx, angle=spinAngle??(phase+this.time*.035), co=Math.cos(angle), si=Math.sin(angle);
      const length=Math.hypot(lightDirection.x,lightDirection.y,lightDirection.z),lx=lightDirection.x/length,ly=lightDirection.y/length,lz=lightDirection.z/length;
      const ct=Math.cos(tilt),st=Math.sin(tilt),map=this.maps[kind];
      c.globalAlpha=1; c.fillStyle='#090c0b'; c.beginPath(); c.arc(cx,cy,r+1,0,TAU); c.fill(); c.fillStyle='#dddcc0';
      const count=r>220?128000:r>170?72000:32000;
      if(!this.pointBanks)this.pointBanks={32000:this.points};
      if(!this.pointBanks[count])this.pointBanks[count]=spherePoints(count,this.options.seed);
      for (const p of this.pointBanks[count]) {
        const xr=p.x*co-p.z*si,zr=p.x*si+p.z*co;
        const x=basis?basis[0].x*xr+basis[1].x*p.y+basis[2].x*zr:xr*ct-p.y*st;
        const y=basis?basis[0].y*xr+basis[1].y*p.y+basis[2].y*zr:xr*st+p.y*ct;
        const z=basis?basis[0].z*xr+basis[1].z*p.y+basis[2].z*zr:zr;if(z<0)continue;
        let light=clamp(x*lx+y*ly+z*lz),texture=.48;
        if(map) {
          // North at image top; longitude is sampled in body space before rotation.
          const u=((Math.atan2(p.x,p.z)/TAU+.5)%1+1)%1,v=clamp(.5+Math.asin(p.y)/Math.PI);
          const lum=map[Math.min(511,Math.floor(v*512))*1024+Math.floor(u*1024)];
          texture=kind==='earth' ? lum : clamp(.18+lum*1.15);
        }
        if(kind==='jupiter')texture=root.CelestialSolar.jupiterAlbedo(Math.atan2(p.x,p.z),Math.asin(p.y),texture,this.audio.swell,this.audioPhase);
        if(kind==='earth'&&texture<.25){
          const wave=.5+.5*Math.sin(Math.atan2(p.x,p.z)*12+p.y*18-this.time*.8);
          texture+=this.audio.level*(.10+.10*wave)+this.audio.accent*.035;
        }
        if(kind==='moon')texture*=1+this.audio.swell*.10;
        const tone=clamp(light*texture),coverage=clamp((tone*.91-p.grain+.08)/.16);
        const opacity=coverage*coverage*(3-2*coverage)*(.35+tone*.6)*Math.sqrt(clamp(tone/.08));
        if(opacity>.001)this.dot(cx+x*r,cy+y*r,opacity,r>110?1.25:1);
      }
      c.globalAlpha=1;
    }
    orbit(cx,cy,rx,ry) { const c=this.ctx; c.strokeStyle='#747b65'; c.globalAlpha=.23; c.lineWidth=.7; c.setLineDash([1,5]); c.beginPath(); c.ellipse(cx,cy,rx,ry,-.14,0,TAU); c.stroke(); c.setLineDash([]); c.globalAlpha=1; }
    sun(cx,cy,r) {
      const c=this.ctx,spots=root.CelestialSolar.sunspots(this.time,this.options.seed);
      c.globalAlpha=1;c.fillStyle='#090c0b';c.beginPath();c.arc(cx,cy,r+1,0,TAU);c.fill();c.fillStyle='#dddcc0';
      const extent=Math.ceil(r);
      for(let py=-extent;py<=extent;py++)for(let px=-extent;px<=extent;px++){
        const x=px/r,y=py/r,d=x*x+y*y;if(d>1)continue;
        const z=Math.sqrt(1-d),surface=root.CelestialSolar.photosphere(x,y,z,this.time,this.options.seed);
        const {bx,bz,grain}=surface;
        let tone=surface.tone;
        for(const spot of spots){
          const distance=2*(1-(bx*spot.x+y*spot.y+bz*spot.z)),rr=spot.radius*spot.radius*(1+this.audio.swell*.16);
          if(distance<rr*6.25){
            const q=Math.sqrt(Math.max(0,distance))/spot.radius;
            const u=clamp((1.2-q)/.5),v=clamp((2.5-q)/1.6);
            const darkness=.4*u*u*(3-2*u)+.51*v*v*(3-2*v);
            tone*=1-Math.min(.98,darkness*(1+this.audio.accent*.10))*spot.strength;
          }
        }
        const opacity=root.CelestialSolar.grainOpacity(grain,clamp(tone*(1+this.audio.level*.12)));
        if(opacity>.002)this.dot(cx+px,cy+py,opacity,1);
      }
      c.globalAlpha=1;
      const energy=this.audio.level*.45+this.audio.accent*.55;
      if(energy>.001){
        c.fillStyle='#dddcc0';
        for(let loop=0;loop<3;loop++)for(let i=0;i<110;i++){
          const u=i/109,a=loop*2.17+.5+(u-.5)*.32,arch=Math.sin(Math.PI*u);
          const radius=r*(1+.015+arch*(.07+energy*.18));
          this.dot(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,energy*.25*arch,1.1);
        }
      }
      c.globalAlpha=1;
    }
    aurora(cx,cy,r,basis){
      const energy=this.audio.swell*.6+this.audio.accent*.4;if(energy<.001)return;
      this.ctx.fillStyle='#cdd5b3';
      for(const pole of [-1,1])for(let ribbon=0;ribbon<3;ribbon++)for(let i=0;i<160;i++){
        const lon=i/160*TAU+this.audioPhase,lat=pole*(1.18+ribbon*.035+.035*Math.sin(lon*5+this.time*.3));
        const p={x:Math.cos(lat)*Math.sin(lon),y:-Math.sin(lat),z:Math.cos(lat)*Math.cos(lon)};
        const x=basis[0].x*p.x+basis[1].x*p.y+basis[2].x*p.z,y=basis[0].y*p.x+basis[1].y*p.y+basis[2].y*p.z,z=basis[0].z*p.x+basis[1].z*p.y+basis[2].z*p.z;
        if(z>0)this.dot(cx+x*r*1.025,cy+y*r*1.025,energy*(.13+.1*Math.sin(lon*3)**2),1.3);
      }
      this.ctx.globalAlpha=1;
    }
    saturnRing(planet,front) {
      const c=this.ctx,S=root.CelestialSolar,segments=144,step=Math.PI/segments;
      const start=front?0:Math.PI,illumination=S.ringIllumination(planet.light);
      c.globalAlpha=1;
      for(let band=0;band<12;band++){
        const inner=1.32+band*.06,outer=inner+.06;
        if(inner>=1.74&&inner<1.82)continue; // Cassini-style division.
        const density=.55+.14*Math.sin(band*1.8);
        for(let j=0;j<segments;j++){
          const a=start+j*step,b=a+step,mid=S.ringPoint((a+b)/2,(inner+outer)/2);
          const wave=.5+.5*Math.sin((a+b)*4-this.time*.8+band*.55);
          const shade=density*illumination*S.ringShadow(mid,planet.light)*(1+this.audio.level*.24+this.audio.accent*.16*wave);
          c.fillStyle='rgb('+Math.round(9+shade*205)+','+Math.round(12+shade*202)+','+Math.round(11+shade*174)+')';
          c.beginPath();
          [S.ringPoint(a,inner),S.ringPoint(b,inner),S.ringPoint(b,outer),S.ringPoint(a,outer)].forEach((p,k)=>{
            const ripple=1+this.audio.swell*.014*Math.sin((a+b)*3+band*.6-this.time*.5);
            const x=planet.x+p.x*planet.r*ripple,y=planet.y+p.y*planet.r*ripple;
            if(k===0)c.moveTo(x,y);else c.lineTo(x,y);
          });
          c.closePath();c.fill();
        }
      }
      const energy=this.audio.level*.7+this.audio.accent*.3;
      if(energy>.001){
        c.fillStyle='#dddcc0';
        for(let i=0;i<96;i++){
          const angle=(i/96*TAU+this.audioPhase*.12)%TAU;if((Math.sin(angle)>=0)!==front)continue;
          const radius=1.34+((i*.61803398875)%1)*.68;if(radius>1.74&&radius<1.82)continue;
          const p=S.ringPoint(angle,radius),shade=S.ringShadow(p,planet.light);
          this.dot(planet.x+p.x*planet.r,planet.y+p.y*planet.r,energy*.25*shade*illumination,1.05);
        }
      }
      c.globalAlpha=1;
    }
    solar() {
      const O=root.CelestialOrbits,c=this.ctx,L=this.solarLayout;
      const {cx,cy,scale:s}=L;
      // Each ellipse keeps its true e and inclination. Separate AU scales keep inner planets legible.
      const radii=root.CelestialSolar.orbitRadii,sizes=root.CelestialSolar.bodyRadii;
      c.fillStyle='#c5c6ab';
      for(const [r,a,g] of this.belt){const angle=a+this.time*.008+this.audioPhase*.02,q=L.project({x:Math.cos(angle)*r,y:Math.sin(angle)*r,z:0});this.dot(cx+q.x*s,cy+q.y*s,(.025+this.audio.level*.18+this.audio.accent*.08)*(.4+g*.6),g>.8?1.2:.8);}
      const planets=O.planets.map((p,i)=>{
        const scale=radii[i]*s/p.a;
        c.strokeStyle='#747b65';c.globalAlpha=.36;c.lineWidth=.85;c.setLineDash([1,4]);c.beginPath();
        L.paths[i].forEach((q,j)=>{const x=cx+q.x*s,y=cy+q.y*s;if(j===0)c.moveTo(x,y);else c.lineTo(x,y);});c.stroke();c.setLineDash([]);c.globalAlpha=1;
        const q=L.project(root.CelestialSolar.displayPosition(O,i,this.time*12));
        return {x:cx+q.x*scale,y:cy+q.y*scale,z:q.z,r:sizes[i]*s,i,name:p.name,light:O.sunDirection(q)};
      });
      const draw=p=>{
        if(p.name==='saturn')this.saturnRing(p,false);
        this.sphere(p.x,p.y,Math.max(3,p.r),p.name,p.name==='jupiter'?root.CelestialSolar.jupiterStorm.openingPhase:p.i,p.light,([.03,3.09,.409,.44,.055,.466,1.706,.494][p.i]));
        if(p.name==='saturn')this.saturnRing(p,true);
      };
      planets.filter(p=>p.z<0).sort((a,b)=>a.z-b.z).forEach(draw);
      this.sun(cx,cy,110*s);
      planets.filter(p=>p.z>=0).sort((a,b)=>a.z-b.z).forEach(draw);
    }
    blackhole(cx,cy,s) {
      const c=this.ctx;
      if(this.map) {
        const map=this.map,data=this.fieldPixels.data,G=root.BlackHoleInk;
        const dt=Math.max(0,Math.min(.1,this.time-(this.blackHoleTime??this.time)));this.blackHoleTime=this.time;
        const baseKey=map.id+'-'+this.w+'x'+this.h;
        if(this.blackHoleBaseKey!==baseKey){
          for(let i=0;i<map.flux.length;i++){
            const value=map.radius[i]>0?G.tone(map.flux[i],map.radius[i],map.azimuth[i],0)*.025:0;
            const offset=i*4;data[offset]=Math.round(9+value*225);data[offset+1]=Math.round(11+value*225);data[offset+2]=Math.round(9+value*196);data[offset+3]=255;
          }
          this.fieldContext.putImageData(this.fieldPixels,0,0);
          this.blackHoleBase=document.createElement('canvas');this.blackHoleBase.width=this.w;this.blackHoleBase.height=this.h;
          const base=this.blackHoleBase.getContext('2d');base.imageSmoothingEnabled=true;
          for(let col=0;col<map.width;col++){
            const x=G.displayX(col/map.width)*this.w,right=G.displayX((col+1)/map.width)*this.w;
            base.drawImage(this.field,col,0,1,map.height,x,0,right-x+.15,this.h);
          }
          this.blackHoleBaseKey=baseKey;
        }
        // Cache the faint base; each frame spends its budget on smooth native-resolution grain.
        c.globalAlpha=1;c.imageSmoothingEnabled=true;c.drawImage(this.blackHoleBase,0,0,this.w,this.h);
        for(const p of this.blackHoleSamples){
          G.advance(p,map,this.blackHoleFlow,dt*(1+this.audio.swell*.25));
          // Carry each grain's coverage with it: crossing a flux threshold must not make it blink.
          const alpha=Math.min(1,p.baseOpacity*p.luminance*p.support*G.envelope(p)*(1+this.audio.level*.20+this.audio.accent*.12))*.68;if(alpha<.0001)continue;
          c.globalAlpha=alpha;
          const size=p.size*1.7;
          c.drawImage(this.grainSprite,G.displayX(p.x)*this.w-size/2,p.y*this.h-size/2,size,size);
        }
        c.globalAlpha=1;return;
      }
      c.globalAlpha=.5;c.fillStyle='#b8bca0';c.font='10px Consolas,monospace';
      c.fillText(this.traceError?'RAY TRACER UNAVAILABLE — USE THE LOCAL SERVER':'TRACING LIGHT PATHS',cx-90*s,cy);c.globalAlpha=1;
    }
    render() {
      const c=this.ctx,w=this.w,h=this.h; if(!w||!h)return;
      c.globalAlpha=1;c.fillStyle='#090c0b';c.fillRect(0,0,w,h);c.fillStyle='#b8bca0';
      for(const [x,y,g] of this.stars)this.dot(x*w,y*h,(.06+g*.18)*(1+this.audio.level*.35+this.audio.accent*.5*g),g>.95?1.5:.8);
      const s=Math.min(w/1440,h/810),cx=w*.56,cy=h*.44;
      if(this.options.scene==='starting')this.solar();
      else if(this.options.scene==='brb')this.blackhole(cx,cy,1.25*s);
      else {
        const sunlight={x:-.65,y:-.24,z:.7},L=this.goodbyeLayout,moon=root.CelestialSolar.earthMoon(this.time,Math.PI/4,L.elevation);
        const drawMoon=()=>this.sphere(L.cx+moon.x*L.orbitScale,L.cy+moon.y*L.orbitScale,L.moonRadius,'moon',0,sunlight,0,0,moon.moonBasis);
        if(moon.z<0)drawMoon();
        this.sphere(L.cx,L.cy,L.earthRadius,'earth',.8,sunlight,0,null,moon.earthBasis);
        this.aurora(L.cx,L.cy,L.earthRadius,moon.earthBasis);
        if(moon.z>=0)drawMoon();
      }
      if(this.assetErrors.length){c.globalAlpha=.7;c.fillStyle='#b8bca0';c.font='10px Consolas,monospace';c.fillText('MAP LOAD FAILED: '+this.assetErrors.join(', '),24,80);}
      c.globalAlpha=1;
    }
  }
  root.CelestialInk={Scene,random,spherePoints,frameDelta};
  if(typeof module!=='undefined')module.exports={random,spherePoints,frameDelta};
})(typeof window!=='undefined'?window:globalThis);
