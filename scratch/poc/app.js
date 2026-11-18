'use strict';
const params = new URLSearchParams(location.search);
const scenes = {
  starting: ['01 / THE ARRIVAL','Starting soon.','SETTLE IN · A NEW ORBIT BEGINS','KEPLERIAN ORBITS / 12 DAYS PER SECOND'],
  brb: ['02 / THE INTERMISSION','Be right back.','JUST BEYOND THE EVENT HORIZON','BLACK HOLE / SCHWARZSCHILD GEOMETRY'],
  goodbye: ['03 / THE RETURN','Until next orbit.','THANK YOU FOR SHARING THIS LITTLE WORLD','EARTH + MOON / HOMEWARD']
};
const requested = params.get('scene');
const initial = Object.hasOwn(scenes,requested) ? requested : 'starting';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new CelestialInk.Scene(document.querySelector('canvas'), {scene:initial,motion:!reduced});
if(params.get('obs')==='1') document.body.classList.add('obs');
function select(name) {
  scene.setScene(name);
  const [chapter,title,subtitle,label]=scenes[name];
  document.querySelector('#chapter').textContent=chapter;
  document.querySelector('#heading').textContent=params.get('title') || title;
  document.querySelector('#subtitle').textContent=params.get('subtitle') || subtitle;
  document.querySelector('#coordinates').textContent=label;
  document.querySelector('#footer-label').textContent=name==='starting'?'KEPLERIAN PATHS / COMPOSED PHASES / COMPRESSED SCALE':'MONOCHROME / MAPPED SURFACES';
  document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.scene===name));
}
select(initial);
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>select(b.dataset.scene));
const motion=document.querySelector('#motion');
function motionLabel(){motion.textContent=scene.options.motion?'PAUSE':'RESUME';}
motionLabel();
motion.onclick=()=>{scene.options.motion=!scene.options.motion;motionLabel();};
const audioControls=CelestialAudioUI.mount(scene,params);
window.addEventListener('pagehide',()=>{audioControls.destroy();scene.destroy();},{once:true});
