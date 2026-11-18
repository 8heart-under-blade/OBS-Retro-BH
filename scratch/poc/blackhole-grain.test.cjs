const {test}=require('node:test');const assert=require('node:assert/strict');const G=require('./blackhole-grain.js');
const map={width:3,height:2,flux:new Float32Array([0,1,2,0,1,2]),radius:new Float32Array([0,8,10,0,8,10]),azimuth:new Float32Array([0,3.13,-3.13,0,3.13,-3.13])};
test('display grains are seeded, subpixel-jittered and not enlarged with the ray map',()=>{
const a=G.samples(map,300,200),b=G.samples(map,300,200);assert.deepEqual(a,b);assert.ok(a.length>0);
for(const p of a){assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);assert.ok(p.radius>0&&p.flux>0);assert.ok(p.size>=1.45&&p.size<=1.8);}
assert.ok(a.some(p=>Math.abs(p.x*300-Math.round(p.x*300))>.01));
});
test('higher output resolution adds grains rather than larger squares',()=>{
const a=G.samples(map,12,8),b=G.samples(map,24,16);assert.ok(b.length>a.length);assert.equal(a[0].size>=1.45,true);assert.equal(b[0].size<=1.8,true);
});
function disk(){const width=80,height=60,flux=new Float32Array(width*height),radius=new Float32Array(flux.length),azimuth=new Float32Array(flux.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const dx=x-40,dy=(y-30)/.55,i=y*width+x;radius[i]=6+Math.hypot(dx,dy)*.25;azimuth[i]=Math.atan2(-dy,dx);flux[i]=1;}return{width,height,flux,radius,azimuth};}
test('tracers flow right-to-left above and left-to-right below the shadow',()=>{const m=disk(),f=G.flowField(m);assert.ok(f.vx[20*m.width+40]<0);assert.ok(f.vx[36*m.width+40]>0);});
test('tracer positions move along mapped disk contours, with pause and smooth recycling',()=>{
const m=disk(),f=G.flowField(m),p=G.samples(m,160,120).find(p=>Math.abs(p.x-.65)<.01&&Math.abs(p.y-.35)<.01);const x=p.x,y=p.y,r=p.radius;
p.age=5;p.life=30;const frozen={...p};G.advance(p,m,f,0);assert.deepEqual(p,frozen);
for(let i=0;i<60;i++)G.advance(p,m,f,1/30);
assert.ok(Math.hypot(p.x-x,p.y-y)>.005);assert.ok(Math.abs(p.radius-r)<.15);assert.ok(G.envelope(p)>0);
p.age=p.life;G.advance(p,m,f,.01);assert.ok(G.envelope(p)<.001);
});
test('lower lensed grains move smoothly on bounded tangents without accumulating',()=>{
const m=disk(),f=G.flowField(m),points=G.samples(m,160,120).filter(p=>p.seedY>.66).slice(0,50),before=points.map(p=>[p.x,p.y,p.baseOpacity]);
for(const p of points){const frozen={...p};G.advance(p,m,f,0);assert.deepEqual(p,frozen);}
for(let i=0;i<1800;i++)for(const p of points){
const x=p.x,y=p.y,a=G.envelope(p);G.advance(p,m,f,1/30);
assert.ok(Math.hypot(p.x-p.seedX,p.y-p.seedY)<.015);
if(a>.05&&G.envelope(p)>.05)assert.ok(Math.hypot(p.x-x,p.y-y)<.0001);
assert.ok(Number.isFinite(p.luminance));assert.ok(p.support>=0&&p.support<=1);
}
assert.ok(points.some((p,i)=>Math.hypot(p.x-before[i][0],p.y-before[i][1])>.0001));
assert.deepEqual(points.map(p=>p.baseOpacity),before.map(p=>p[2]));
});
test('lower arc follows the requested right-to-left curved flow',()=>{
const m=disk(),f=G.flowField(m),points=G.samples(m,160,120);
for(const target of [.43,.56]){const p=points.find(p=>Math.abs(p.seedX-target)<.01&&p.seedY>.7&&p.seedY<.8);const x=p.x,y=p.y;G.advance(p,m,f,1/30);assert.ok(p.x<x);if(target<.49)assert.ok(p.y<y);else assert.ok(p.y>y);}
});
test('moving grain coverage stays fixed and travel stays bounded through recycling',()=>{
const m=disk(),f=G.flowField(m),points=G.samples(m,160,120).filter(p=>p.seedY<.6).slice(100,150),coverage=points.map(p=>p.baseOpacity);
for(let frame=0;frame<900;frame++)for(const p of points){G.advance(p,m,f,1/30);assert.ok(Math.hypot(p.x-p.seedX,p.y-p.seedY)<=.035001);assert.ok(Number.isFinite(p.luminance));}
assert.deepEqual(points.map(p=>p.baseOpacity),coverage);
});
test('outer disk widens but central shadow coordinates remain unchanged',()=>{assert.equal(G.displayX(.49),.49);assert.ok(Math.abs(G.displayX(.55)-.55)<1e-12);assert.ok(G.displayX(.8)>.8);assert.ok(G.displayX(.18)<.18);});
test('grain opacity is smooth, bounded and deterministic',()=>{
for(let f=0;f<3;f+=.1){const t=G.tone(f,8,1,25);assert.ok(t>=0&&t<=1);for(let g=0;g<=1;g+=.05){const a=G.opacity(g,t);assert.ok(a>=0&&a<=1);assert.ok(Math.abs(a-G.opacity(g+.00001,t))<.001);}}
assert.equal(G.opacity(.1,0),0);
});
