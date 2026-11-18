const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planets,eccentricAnomaly,position,project,sunDirection}=require('./orbits.js');
test('Kepler solver satisfies equation',()=>{for(const e of [0,.0068,.0934,.2056])for(const M of [-3,-1,0,1,3]){const E=eccentricAnomaly(M,e);assert.ok(Math.abs(E-e*Math.sin(E)-M)<1e-10);}});
test('ellipses have perihelion and aphelion at a(1 +/- e)',()=>{for(const p of planets)for(const [E,sign] of [[0,-1],[Math.PI,1]]){const v=position(p,0,E);assert.ok(Math.abs(Math.hypot(v.x,v.y,v.z)-p.a*(1+sign*p.e))<1e-10);}});
test('all planets return after their actual orbital period',()=>{for(const p of planets){const a=position(p),b=position(p,p.period);for(const k of ['x','y','z'])assert.ok(Math.abs(a[k]-b[k])<1e-10);}});
test('camera preserves distance; illumination points toward Sun',()=>{for(const p of planets){const v=position(p,123),q=project(v),l=sunDirection(q);assert.ok(Math.abs(Math.hypot(v.x,v.y,v.z)-Math.hypot(q.x,q.y,q.z))<1e-10);assert.ok(Math.abs(Math.hypot(l.x,l.y,l.z)-1)<1e-12);assert.ok(q.x*l.x+q.y*l.y+q.z*l.z<0);}});
test('Mercury advances faster than Earth, Earth faster than Neptune',()=>assert.ok(planets[0].period<planets[2].period&&planets[2].period<planets[7].period));
