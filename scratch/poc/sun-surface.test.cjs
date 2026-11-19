const {test}=require('node:test');const assert=require('node:assert/strict');
require('./solar-model.js');require('./celestial-ink.js');
function draw(audio){const dots=[],ctx={beginPath(){},arc(){},fill(){}};globalThis.CelestialInk.Scene.prototype.sun.call({ctx,audio,time:15,options:{seed:173},dot(x,y,alpha){dots.push({x,y,alpha});}},50,60,24);return dots;}
test('audio-reactive Sun stays on its photosphere without exterior hoop particles',()=>{const dots=draw({level:1,swell:1,accent:1});assert.ok(dots.length>100);for(const p of dots)assert.ok(Math.hypot(p.x-50,p.y-60)<=24+1e-9);});
test('Sun still responds through surface grain without drawn flares',()=>{const silent=draw({level:0,swell:0,accent:0}),active=draw({level:1,swell:1,accent:1});assert.ok(active.reduce((n,p)=>n+p.alpha,0)>silent.reduce((n,p)=>n+p.alpha,0));});
