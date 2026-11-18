const {test}=require('node:test');const assert=require('node:assert/strict');const S=require('./solar-model.js');
test('mapped continents and ice contrast strongly against ocean',()=>{const sea=S.earthAlbedo(10,30,75);assert.ok(S.earthAlbedo(35,75,25)>sea*4);assert.ok(S.earthAlbedo(170,135,85)>sea*4);assert.ok(S.earthAlbedo(245,245,245)>.9);assert.ok(S.earthAlbedo(0,0,0)<.1);});
test('Moon completes a continuous 60-second orbit with front/back depth',()=>{const a=S.earthMoon(0),b=S.earthMoon(60);for(const k of ['x','y','z'])assert.ok(Math.abs(a[k]-b[k])<1e-10);for(let t=0;t<60;t+=.5){const p=S.earthMoon(t);assert.ok(Math.abs(Math.hypot(p.x,p.y,p.z)-320)<1e-10);}assert.ok(S.earthMoon(15).z>0);assert.ok(S.earthMoon(45).z<0);});
test('Goodbye expands across the screen while keeping Earth and the entire lunar orbit clear of title/footer',()=>{
for(const [w,h] of [[1920,1080],[1908,932],[1280,720],[800,1000],[3440,1440]]){
const L=S.goodbyeLayout(w,h),b=L.box;assert.ok(L.cx-L.earthRadius>=b.left);assert.ok(L.cx+L.earthRadius<=b.right);assert.ok(L.cy-L.earthRadius>=b.top);assert.ok(L.cy+L.earthRadius<=b.bottom);
let minX=Infinity,maxX=-Infinity;
for(let t=0;t<60;t+=.1){const p=S.earthMoon(t,Math.PI/4,L.elevation),x=L.cx+p.x*L.orbitScale,y=L.cy+p.y*L.orbitScale,r=L.moonRadius;assert.ok(x-r>=b.left-1e-7&&x+r<=b.right+1e-7);assert.ok(y-r>=b.top-1e-7&&y+r<=b.bottom+1e-7);minX=Math.min(minX,x-r);maxX=Math.max(maxX,x+r);}
if(w/h<2.5)assert.ok(maxX-minX>w*.88);
}
});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))))*180/Math.PI;
test('Moon keeps its near-side normal pointed at Earth and its pole normal to the orbit',()=>{for(let t=0;t<60;t+=.25){const p=S.earthMoon(t),n=p.moonBasis[2],frame=S.earthMoonFrame();assert.ok(Math.abs(n.x*p.x+n.y*p.y+n.z*p.z+320)<1e-9);assert.ok(Math.abs(dot(p.moonBasis[1],frame.orbitNormal)+1)<1e-12);}});
test('wider Goodbye camera preserves physical relative plane tilts',()=>{const L=S.goodbyeLayout(1920,1080),f=S.earthMoonFrame(Math.PI/4,L.elevation);assert.ok(Math.abs(angle(f.earthAxis,f.eclipticNormal)-23.43928)<1e-9);assert.ok(Math.abs(angle(f.orbitNormal,f.eclipticNormal)-5.145)<1e-9);});
test('Earth axis and lunar orbit enforce their ecliptic tilts in the same camera frame',()=>{for(let node=-Math.PI;node<=Math.PI;node+=Math.PI/24){const f=S.earthMoonFrame(node);assert.ok(Math.abs(angle(f.earthAxis,f.eclipticNormal)-23.43928)<1e-9);assert.ok(Math.abs(angle(f.orbitNormal,f.eclipticNormal)-5.145)<1e-9);const mutual=angle(f.earthAxis,f.orbitNormal);assert.ok(mutual>=18.29428-1e-9&&mutual<=28.58428+1e-9);for(let t=0;t<60;t+=5){const p=S.earthMoon(t,node);assert.ok(Math.abs(dot(p,f.orbitNormal))<1e-9);}}});
test('render bases remain orthonormal and Earth actually rotates around the enforced pole',()=>{for(let t=0;t<60;t+=2){const p=S.earthMoon(t);for(const basis of [p.earthBasis,p.moonBasis]){for(let i=0;i<3;i++){assert.ok(Math.abs(dot(basis[i],basis[i])-1)<1e-12);for(let j=i+1;j<3;j++)assert.ok(Math.abs(dot(basis[i],basis[j]))<1e-12);}}const north={x:-p.earthBasis[1].x,y:-p.earthBasis[1].y,z:-p.earthBasis[1].z};assert.ok(Math.abs(dot(north,S.earthMoonFrame().earthAxis)-1)<1e-12);}});
