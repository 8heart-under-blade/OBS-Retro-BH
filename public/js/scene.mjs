import {SCENES, validateConfig} from './config-schema.mjs';
import {initialTimer} from './timers.mjs';
import {liveConnection, RemoteAudio} from './live.mjs';
const segment = location.pathname.split('/').pop(), params = new URLSearchParams(location.search);
const name = SCENES.includes(segment) ? segment : SCENES.includes(params.get('scene')) ? params.get('scene') : 'starting';
const viewport = document.querySelector('#viewport'), overlay = document.querySelector('#overlay');
function fit() { const width = Math.min(innerWidth, innerHeight * 16 / 9); viewport.style.width = width + 'px'; viewport.style.height = width * 9 / 16 + 'px'; }
fit(); addEventListener('resize', fit);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const scene = new CelestialInk.Scene(document.querySelector('#artwork'), {scene: name, motion: !reduced.matches});
const audio = new RemoteAudio(); scene.setAudioSource(audio);
let saved = null, draft = null, offset = 0, overlayReady = false, previewMotion = true;
function sendOverlayAudio(value = null) {
  if (!overlayReady) return;
  const config = draft || saved?.config;
  const active = config?.audio.enabled && config.scenes[name].reactToAudio && scene.options.motion;
  overlay.contentWindow.postMessage({type: 'render-audio', value: active ? value : null}, location.origin);
}
function post() {
  if (!saved || !overlayReady) return;
  const timers = {...saved.timers};
  if (draft && (draft.scenes[name].timer.mode !== saved.config.scenes[name].timer.mode || draft.scenes[name].timer.durationSeconds !== saved.config.scenes[name].timer.durationSeconds)) timers[name] = initialTimer(draft.scenes[name].timer);
  overlay.contentWindow.postMessage({type: 'render-state', scene: name, state: {...saved, config: draft || saved.config, timers}, clockOffset: offset}, location.origin);
}
const connection = liveConnection({
  onState(state) { saved = state; offset = state.serverNow - Date.now(); post(); },
  onAudio(value) {
    audio.ingest(draft?.audio.enabled === false ? {level: 0, swell: 0, accent: 0} : value);
    if ((draft || saved?.config)?.scenes[name].reactToAudio) sendOverlayAudio(value);
  },
  onStatus(status) { if (status !== 'online') sendOverlayAudio(); }
});
overlay.addEventListener('load', () => { overlayReady = true; post(); });
const message = event => {
  if (event.origin !== location.origin) return;
  if (event.source === overlay.contentWindow && event.data?.type === 'layout-report') {
    if (parent !== window) parent.postMessage({...event.data, scene: name}, location.origin);
  } else if (event.source === parent && event.data?.type === 'preview-config') {
    try { draft = event.data.config ? validateConfig(event.data.config) : null; post(); } catch {}
  } else if (event.source === parent && event.data?.type === 'preview-motion') {
    previewMotion = !!event.data.enabled;
    motion();
  }
};
addEventListener('message', message);
if (overlay.contentDocument?.readyState === 'complete') { overlayReady = true; post(); }
const motion = () => { scene.options.motion = previewMotion && !reduced.matches; if (!scene.options.motion) sendOverlayAudio(); }; reduced.addEventListener('change', motion);
const health = setInterval(() => { if(parent !== window){const errors=[...scene.assetErrors.map(name=>'Map unavailable: '+name),...(scene.traceError?['Black-hole worker unavailable']:[])];parent.postMessage({type:'render-health',scene:name,errors},location.origin);}},1000);
addEventListener('pagehide', () => { clearInterval(health); connection.close(); scene.destroy(); removeEventListener('resize', fit); removeEventListener('message', message); reduced.removeEventListener('change', motion); }, {once: true});
