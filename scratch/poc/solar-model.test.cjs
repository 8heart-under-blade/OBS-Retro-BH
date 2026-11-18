const {test}=require('node:test');const assert=require('node:assert/strict');
const O=require('./orbits.js'),S=require('./solar-model.js');
test('all orbit paths, body extents and rings fit the safe screen region',()=>{
for(const [w,h] of [[1920,1080],[2560,1440],[1280,720],[800,1000],[3440,1440]]){
const L=S.layout(w,h,O),{scale:s,cx,cy,box,bounds:b}=L;
assert.ok(cx+b.minX*s>=box.left-1e-8);assert.ok(cx+b.maxX*s<=box.right+1e-8);
assert.ok(cy+b.minY*s>=box.top-1e-8);assert.ok(cy+b.maxY*s<=box.bottom+1e-8);
for(let i=0;i<8;i++)for(let day=0;day<60200;day+=197){const q=L.project(S.displayPosition(O,i,day)),factor=S.orbitRadii[i]/O.planets[i].a;const x=cx+q.x*factor*s,y=cy+q.y*factor*s;assert.ok(x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom);}
}});
test('sizes follow one compressed physical radius scale, Sun remains largest',()=>{assert.ok(110>S.bodyRadii[4]);assert.ok(S.bodyRadii[4]>S.bodyRadii[5]);assert.ok(S.bodyRadii[2]>S.bodyRadii[1]);assert.ok(Math.abs(S.bodyRadii[4]/S.bodyRadii[2]-Math.sqrt(69911/6371))<1e-12);});
test('sunspots are seeded, finite, on sphere and fade over time',()=>{assert.deepEqual(S.sunspots(10),S.sunspots(10));assert.notDeepEqual(S.sunspots(10),S.sunspots(45));let count=0;for(let t=0;t<270;t++){for(const p of S.sunspots(t)){count++;assert.ok(Math.abs(p.x*p.x+p.y*p.y+p.z*p.z-1)<1e-12);assert.ok(p.strength>0&&p.strength<=1);assert.ok(p.radius>0);}}assert.ok(count>0);});
test('landscape composition fills both axes and opening planets are spread out',()=>{
const L=S.layout(1920,1080,O),b=L.bounds;
assert.ok((b.maxX-b.minX)*L.scale>1920*.92);
assert.ok((b.maxY-b.minY)*L.scale>1080*.78);
const points=O.planets.map((p,i)=>{const q=L.project(S.displayPosition(O,i,0)),f=S.orbitRadii[i]/p.a*L.scale;return{x:L.cx+q.x*f,y:L.cy+q.y*f};});
assert.ok(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))>1920*.55);
assert.ok(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))>1080*.55);
});
test('photosphere detail moves continuously and freezes at a fixed time',()=>{
const p={x:.2,y:.3,z:Math.sqrt(1-.2*.2-.3*.3)};
const sample=t=>S.photosphere(p.x,p.y,p.z,t);
assert.deepEqual(sample(4),sample(4));
assert.notEqual(sample(0).grain,sample(1).grain);
assert.ok(Math.abs(sample(4).grain-sample(4.000001).grain)<.001);
for(let t=0;t<100;t+=.7){const v=sample(t);assert.ok(v.grain>=0&&v.grain<=1);assert.ok(v.tone>0&&v.tone<=1);}
});
test('solar grain fades continuously instead of switching on and off',()=>{
for(let g=0;g<=1;g+=.01){const a=S.grainOpacity(g,.85),b=S.grainOpacity(g+.0001,.85);assert.ok(a>=0&&a<=1);assert.ok(Math.abs(a-b)<.001);}
assert.equal(S.grainOpacity(0,0),0);
let total=0,count=0;
for(let x=-.8;x<.9;x+=.1)for(let y=-.8;y<.9;y+=.1){if(x*x+y*y>=1)continue;const z=Math.sqrt(1-x*x-y*y);for(let t=0;t<5;t+=.25){const a=S.photosphere(x,y,z,t),b=S.photosphere(x,y,z,t+1/30);total+=Math.abs(S.grainOpacity(a.grain,a.tone)-S.grainOpacity(b.grain,b.tone));count++;}}
assert.ok(total/count<.025,'average 30 FPS opacity change should remain subtle');
});
test('Jupiter storm enhances only the mapped oval and wraps longitude',()=>{
const {longitude:x,latitude:y}=S.jupiterStorm;
assert.ok(S.jupiterAlbedo(x,y,.7)<.35);
assert.equal(S.jupiterAlbedo(x+1,y,.7),.7);
assert.equal(S.jupiterAlbedo(x,y-.4,.7),.7);
assert.ok(Math.abs(S.jupiterAlbedo(x+.1,y,.7)-S.jupiterAlbedo(x+.1+2*Math.PI,y,.7))<1e-12);
for(let dx=-.3;dx<=.3;dx+=.01){const a=S.jupiterAlbedo(x+dx,y,.7);assert.ok(a>=0&&a<=1);}
const front=Math.cos(x-S.jupiterStorm.openingPhase);assert.ok(front>.9,'storm faces camera in opening composition');
});
test('Saturn blocks sunlight on its rings only on the shadowed side',()=>{
const p=S.ringPoint(0,1.7),toward={x:-p.x,y:-p.y,z:-p.z},away={x:p.x,y:p.y,z:p.z};
assert.ok(S.ringShadow(p,toward)<.05);
assert.equal(S.ringShadow(p,away),1);
assert.equal(S.ringShadow(p,{x:0,y:0,z:1}),1);
for(let a=0;a<Math.PI*2;a+=.1){const v=S.ringPoint(a,1.7);assert.ok(Math.abs(Math.hypot(v.x,v.y,v.z)-1.7)<1e-12);}
assert.ok(S.ringPoint(Math.PI/2,1.7).z>0);assert.ok(S.ringPoint(Math.PI*1.5,1.7).z<0);
const L=S.layout(1920,1080,O),sun=O.sunDirection(L.project(S.displayPosition(O,5,0)));
const samples=Array.from({length:360},(_,i)=>S.ringShadow(S.ringPoint(i/360*Math.PI*2,1.7),sun));
assert.ok(Math.min(...samples)<.1);assert.ok(Math.max(...samples)>.99);
assert.ok(S.ringIllumination(sun)>=.24&&S.ringIllumination(sun)<=1);
});
test('activity varies through each cycle',()=>{const counts=Array.from({length:180},(_,i)=>S.sunspots(i).length);assert.ok(Math.max(...counts)>Math.min(...counts)+4);});
