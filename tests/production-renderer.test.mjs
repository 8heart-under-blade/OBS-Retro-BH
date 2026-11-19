import {test} from 'node:test'; import assert from 'node:assert/strict'; import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const production = require('../public/celestial/solar-model.js'), reference = require('../scratch/poc/solar-model.js');
const physics = require('../public/celestial/blackhole/physics.js');
require('../public/celestial/celestial-ink.js');
test('production surface maps load on demand with library-relative URLs and no duplicates', t => {
  const previous=globalThis.Image,requests=[];globalThis.Image=class{set src(value){requests.push(value);}};
  t.after(()=>{if(previous===undefined)delete globalThis.Image;else globalThis.Image=previous;});
  const scene={mapLoading:new Set(),options:{assetBase:new URL('http://localhost/celestial/')}};
  const load=globalThis.CelestialInk.Scene.prototype.loadMaps;
  load.call(scene,'brb');assert.equal(requests.length,0);
  load.call(scene,'goodbye');assert.equal(requests.length,2);load.call(scene,'goodbye');assert.equal(requests.length,2);
  load.call(scene,'starting');assert.equal(requests.length,9);assert.ok(requests.every(url=>url.startsWith('http://localhost/celestial/assets/')));
});
test('extracted production renderer preserves Earth/Moon geometry and solar system composition', () => {
  for(let time=0;time<=60;time+=5)assert.deepEqual(production.earthMoon(time), reference.earthMoon(time));
  assert.deepEqual(production.goodbyeLayout(1920,1080),reference.goodbyeLayout(1920,1080));
  assert.deepEqual(production.bodyRadii,reference.bodyRadii);
});
test('production black-hole physics keeps the original critical capture behavior', () => {
  assert.equal(physics.orbitOutcome(physics.CRITICAL_IMPACT*.99).captured,true);
  assert.equal(physics.orbitOutcome(physics.CRITICAL_IMPACT*1.01).captured,false);
});
