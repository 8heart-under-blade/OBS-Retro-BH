import {SCENES, validateConfig} from './config-schema.mjs';
import {timerReading, formatDuration} from './timers.mjs';
const $ = id => document.getElementById(id), root = $('scene-root');
let state = null, name = 'starting', offset = 0, reportQueued = false, lastAudio = -Infinity;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function setAudio(value) {
  const enabled = state?.config.audio.enabled && state.config.scenes[name].reactToAudio && !reduced.matches;
  const amount = key => { const n = value?.[key]; return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; };
  for (const key of ['level', 'swell', 'accent']) root.style.setProperty('--obs-' + key, enabled ? amount(key).toFixed(3) : '0');
  lastAudio = value && enabled ? performance.now() : -Infinity;
}
const resetAudio = () => setAudio(null);
function fit() { const scale = Math.min(innerWidth / 1920, innerHeight / 1080); root.style.transform = 'translate(-50%,-50%) scale(' + scale + ')'; report(); }
function assign(id, widget) { $(id).hidden = !widget.enabled; $(id).textContent = widget.text; }
function apply(payload) {
  if (!SCENES.includes(payload.scene)) return;
  const config = validateConfig(payload.state.config);
  state = {...payload.state, config}; name = payload.scene; offset = Number.isFinite(payload.clockOffset) ? payload.clockOffset : 0;
  const s = config.scenes[name], l = s.layout;
  root.dataset.scene = name; root.dataset.theme = s.theme;
  root.dataset.audioMotion = String(s.reactToAudio && config.audio.enabled);
  if (root.dataset.audioMotion !== 'true') resetAudio();
  const right = l.preset.endsWith('right'), center = l.preset === 'lower-center', upper = l.preset.startsWith('upper');
  const x = (center ? 960 : right ? 1805 : 115) + l.offsetX, y = (upper ? 130 : 950) + l.offsetY;
  $('basic-style').textContent = ':root{--ink:' + config.appearance.ink + ';--muted:' + config.appearance.muted + ';--title-size:' + l.titleSize + 'px;--title-width:' + l.titleWidth + 'px;--caption-x:' + x + 'px;--caption-y:' + y + 'px;--caption-transform:translate(' + (center ? '-50%' : right ? '-100%' : '0') + ',' + (upper ? '0' : '-100%') + ');--align:' + (center ? 'center' : right ? 'right' : 'left') + ';}';
  $('global-style').textContent = config.customCss; $('custom-style').textContent = s.customCss;
  $('scene-mark').hidden = !s.title.enabled || !s.title.text.trim() || !['transit', 'ephemeris', 'contact-sheet'].includes(s.theme);
  assign('scene-title', s.title); assign('scene-subtitle', s.subtitle); assign('scene-next-stream', s.nextStream); assign('scene-announcement', s.announcement); assign('scene-social', s.social);
  $('scene-timer').hidden = !s.timer.enabled; $('timer-label').textContent = s.timer.label; $('timer-label').hidden = !s.timer.label;
  $('scene-clock').hidden = !s.clock.enabled; $('scene-date').hidden = !s.date.enabled;
  tick(); fit(); document.fonts.ready.then(report);
}
function tick() {
  if (!state) return;
  if (lastAudio !== -Infinity && performance.now() - lastAudio > 600) resetAudio();
  const now = Date.now() + offset, s = state.config.scenes[name], {locale, timeZone, hour12} = state.config.time;
  if (s.timer.enabled) { const reading = timerReading(state.timers[name], now); $('timer-value').textContent = reading.complete ? s.timer.completeText : formatDuration(s.timer.mode === 'elapsed' ? reading.elapsed : reading.remaining); }
  if (s.clock.enabled) $('scene-clock').textContent = new Intl.DateTimeFormat(locale, {timeZone, hour12, hour: '2-digit', minute: '2-digit', ...(s.clock.showSeconds ? {second: '2-digit'} : {})}).format(now);
  if (s.date.enabled) $('scene-date').textContent = new Intl.DateTimeFormat(locale, {timeZone, dateStyle: s.date.format === 'long' ? 'long' : 'short'}).format(now);
  report();
}
function report() {
  if (!state || reportQueued) return; reportQueued = true;
  requestAnimationFrame(() => {
    reportQueued = false; const bounds = root.getBoundingClientRect(), scale = bounds.width / 1920, issues = [], rectangles = [];
    if(scale<=0){parent.postMessage({type:'layout-report',scene:name,issues:['Overlay has zero size; check custom CSS.'],rectangles},location.origin);return;}
    for (const el of root.querySelectorAll('.module')) {
      if (el.hidden || !el.textContent.trim()) continue;
      const style=getComputedStyle(el);
      if(el.getClientRects().length===0||style.visibility==='hidden'||style.opacity==='0'){issues.push(el.id+' is enabled but hidden by custom CSS.');continue;}
      const r = el.getBoundingClientRect(), x = (r.left - bounds.left) / scale, y = (r.top - bounds.top) / scale, width = r.width / scale, height = r.height / scale;
      if (x < 48 || y < 48 || x + width > 1872 || y + height > 1032) issues.push(el.id + ' extends beyond the recommended 48 px safe margin.');
      if (el.scrollWidth > el.clientWidth + 1) issues.push(el.id + ' overflows its width by ' + (el.scrollWidth - el.clientWidth) + ' px.');
      if (el.id === 'scene-title' && height > parseFloat(getComputedStyle(el).lineHeight) * 3 + 1) issues.push('Title uses more than three lines; increase width or adjust the font.');
      rectangles.push({id: el.id, x, y, width, height});
    }
    const caption = rectangles.filter(r => ['scene-title', 'scene-subtitle', 'scene-announcement', 'scene-next-stream', 'scene-social'].includes(r.id));
    for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){const a=rectangles[i],b=rectangles[j];if(a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1)issues.push(a.id+' overlaps '+b.id+'. Adjust the layout or custom CSS.');}
    if (caption.some(r => r.y < (name === 'brb' ? 750 : 730) && r.y > 300)) issues.push('Caption enters the artwork area; check it against the moving objects.');
    parent.postMessage({type: 'layout-report', scene: name, issues: [...new Set(issues)], rectangles}, location.origin);
  });
}
const message = event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  if (event.data?.type === 'render-audio') setAudio(event.data.value);
  if (event.data?.type === 'render-state') { try { apply(event.data); } catch {} }
};
reduced.addEventListener('change', resetAudio);
addEventListener('message', message); addEventListener('resize', fit); fit();
const timer = setInterval(tick, 250);
addEventListener('pagehide', () => { clearInterval(timer); reduced.removeEventListener('change', resetAudio); removeEventListener('message', message); removeEventListener('resize', fit); }, {once: true});
