const {test}=require('node:test');
const assert=require('node:assert/strict');
const {random,spherePoints}=require('./celestial-ink.js');
test('grain is deterministic and bounded',()=>{const a=random(42),b=random(42);for(let i=0;i<1000;i++){const x=a();assert.equal(x,b());assert.ok(x>=0&&x<1);}});
test('sphere samples lie on unit sphere',()=>{const p=spherePoints(1000,10);assert.equal(p.length,1000);for(const v of p)assert.ok(Math.abs(v.x*v.x+v.y*v.y+v.z*v.z-1)<1e-12);});
test('different seeds produce different fields',()=>assert.notDeepEqual(spherePoints(10,1),spherePoints(10,2)));
