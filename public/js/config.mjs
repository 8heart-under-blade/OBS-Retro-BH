import {SCENES, defaultConfig, validateConfig, normalizeTimeZone} from './config-schema.mjs';
import {timerReading, formatDuration} from './timers.mjs';
import {liveConnection, LocalAPI} from './live.mjs';
const $ = id => document.getElementById(id), api = new LocalAPI(), preview = $('scene-preview');
let selected = 'starting', latest = null, draft = null, baseConfig = null, baseRevision = 0;
let dirty = false, saving = false, conflict = false, sent = '', valid = false, clockOffset = 0;
let previewMotion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const serialize = value => JSON.stringify(value), clone = value => structuredClone(value);
const pathFor = path => path.replace('scenes.$.', 'scenes.' + selected + '.');
function get(path) { return pathFor(path).split('.').reduce((value, key) => value?.[key], draft); }
function set(path, value) { const keys = pathFor(path).split('.'); let target = draft; for (const key of keys.slice(0, -1)) target = target[key]; target[keys.at(-1)] = value; }
function message(text) { $('message').textContent = text; }
function hydrate() {
  if (!draft) return;
  for (const el of document.querySelectorAll('[data-path]')) { const value = get(el.dataset.path); if (el.type === 'checkbox') el.checked = value; else el.value = value; }
  $('css-editor').value = $('css-scope').value === 'global' ? draft.customCss : draft.scenes[selected].customCss;
}
function check() {
  try { validateConfig(draft); valid = true; }
  catch (error) { valid = false; message(error.message); }
  return valid;
}
function postPreview() {
  if (!draft || !valid) return;
  preview.contentWindow?.postMessage({type: 'preview-config', config: draft}, location.origin);
  preview.contentWindow?.postMessage({type: 'preview-motion', enabled: previewMotion}, location.origin);
}
function timerStatus() {
  if (!latest) return;
  const timer = latest.timers[selected], r = timerReading(timer, Date.now() + clockOffset);
  $('timer-status').textContent = timer.status[0].toUpperCase() + timer.status.slice(1) + ' · ' + formatDuration(timer.mode === 'elapsed' ? r.elapsed : r.remaining);
  for (const button of document.querySelectorAll('[data-timer]')) button.disabled = dirty || saving || (button.dataset.timer === 'pause' && timer.status !== 'running') || (button.dataset.timer === 'resume' && timer.status !== 'paused');
}
function status() {
  $('save').disabled = !dirty || saving || conflict || !valid;
  $('load-defaults').disabled = !draft || saving;
  $('save').textContent = saving ? 'Saving…' : 'Save to OBS';
  $('audio-connect').disabled = dirty || saving || !draft?.audio.enabled;
  $('save-state').textContent = conflict ? 'Changed in another window — reload saved settings' : saving ? 'Saving to OBS…' : dirty ? 'Unsaved changes · preview only' : latest ? 'All changes saved' : 'Loading settings…';
  $('revision-label').textContent = latest ? 'Revision ' + latest.revision + ' · configuration shared across OBS outputs' : '';
  timerStatus();
}
function receive(state) {
  latest = state; clockOffset = state.serverNow - Date.now();
  if (!draft || !dirty) { draft = clone(state.config); baseConfig = clone(state.config); baseRevision = state.revision; conflict = false; hydrate(); }
  else if (serialize(state.config) === serialize(baseConfig)) baseRevision = state.revision;
  else if (saving && serialize(state.config) === sent) { baseConfig = clone(state.config); baseRevision = state.revision; conflict = false; }
  else conflict = true;
  check(); postPreview(); status();
}
function edited() {
  dirty = serialize(draft) !== serialize(baseConfig); message(''); check(); status(); postPreview();
}
function choose(name) {
  if (!SCENES.includes(name)) return; selected = name;
  for (const button of document.querySelectorAll('[data-scene]')) button.setAttribute('aria-current', button.dataset.scene === name);
  $('scene-name').textContent = {starting: 'Starting', brb: 'Intermission', goodbye: 'Goodbye'}[name];
  const url = location.origin + '/scene/' + name; $('obs-url').value = url; $('open-output').href = url;
  if (new URL(preview.src || location.href, location.href).pathname !== '/scene/' + name) preview.src = '/scene/' + name + '?preview=1';
  hydrate(); timerStatus();
}
async function save() {
  if (!draft || !dirty || saving || conflict || !check()) return;
  draft=validateConfig(draft);hydrate();
  saving = true; sent = serialize(draft); status();
  try {
    const response = await api.request('/api/config', {revision: baseRevision, config: JSON.parse(sent)}, 'PUT');
    receive(response);
    if (serialize(draft) === sent) { dirty = false; draft = clone(response.config); hydrate(); }
    baseConfig = clone(response.config); baseRevision = response.revision; conflict = false;
    message(dirty ? 'Earlier edits saved. Your newer edits are still in preview.' : 'Saved. Connected OBS outputs updated without restarting the artwork.');
  } catch (error) { if (error.status === 409) conflict = true; message(error.message); }
  finally { saving = false; sent = ''; status(); }
}
for (const el of document.querySelectorAll('[data-path]')) el.addEventListener('input', () => {
  if (!draft) return;
  set(el.dataset.path, el.type === 'checkbox' ? el.checked : ['number', 'range'].includes(el.type) ? el.valueAsNumber : el.value); edited();
});
document.querySelector('[data-path="time.timeZone"]').addEventListener('change',event=>{
  if(!draft)return;
  try{const zone=normalizeTimeZone(event.target.value);event.target.value=zone;draft.time.timeZone=zone;edited();}
  catch(error){message(error.message);}
});
for (const button of document.querySelectorAll('[data-scene]')) button.onclick = () => choose(button.dataset.scene);
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => {
  for (const tab of document.querySelectorAll('[data-tab]')) { const active = tab === button; tab.setAttribute('aria-selected', active); tab.tabIndex = active ? 0 : -1; $('panel-' + tab.dataset.tab).hidden = !active; }
};
$('tab-content').click();
$('css-scope').onchange = () => hydrate();
$('css-editor').oninput = () => { if (!draft) return; if ($('css-scope').value === 'global') draft.customCss = $('css-editor').value; else draft.scenes[selected].customCss = $('css-editor').value; edited(); };
$('css-example').onclick = () => {
  $('css-editor').value += '\n/* Example: larger title, smaller timer */\n#scene-title { font-size: 72px; letter-spacing: .01em; }\n#timer-value { font-size: 48px; }\n'; $('css-editor').dispatchEvent(new Event('input'));
};
$('copy-css-guide').onclick = async () => {
  const brief = 'Create CSS only for a 1920x1080 OBS text overlay. Theme: restrained 1970s astronomy print, ivory ink stipple, no HUD/neon/panels. Preserve readable titles and wrap long text. Hooks: .scene-root[data-scene="starting"] (or brb/goodbye), #captions, #scene-title, #scene-subtitle, #scene-timer, #timer-label, #timer-value, #scene-clock, #scene-date, #scene-announcement, #scene-social, #scene-next-stream. Variables on :root: --ink, --muted, --title-size, --title-width, --module-size, --font-title, --font-body, --caption-x, --caption-y, --align. Bundled fonts: Jost (100–900) and Spectral (400). Style only the text overlay. No HTML/JS or external URLs/imports. User-selected modules must not be silently hidden. Artwork and controls are in separate documents. Provide a complete CSS stylesheet.';
  try { await navigator.clipboard.writeText(brief); message('AI styling brief copied.'); } catch { message('Clipboard unavailable. The hooks are listed below and in docs/CSS-STYLING.md.'); }
};
$('save').onclick = save;
$('revert').onclick = async () => {
  if (dirty && !confirm('Discard unsaved changes and load the saved configuration?')) return;
  try { const response = await fetch('/api/state'); if (!response.ok) throw new Error('Cannot reload settings'); dirty = false; conflict = false; receive(await response.json()); message('Loaded the saved configuration.'); } catch (error) { message(error.message); }
};
$('load-defaults').onclick = () => {
  if (!draft || saving) return;
  if (!confirm('Load default settings for ALL scenes, custom CSS, clocks and audio into the preview? Unsaved edits will be replaced. Live OBS outputs stay unchanged until you Save.')) return;
  draft = defaultConfig(); hydrate(); edited();
  message(dirty ? 'Defaults loaded into preview. Save to apply them to all OBS outputs.' : 'Defaults loaded. Saved settings already match the defaults.');
};
$('reset-scene').onclick = () => { if (!draft) return; if (!confirm('Reset this scene in the preview? Save to apply it to OBS.')) return; draft.scenes[selected] = defaultConfig().scenes[selected]; hydrate(); edited(); };
$('show-guides').onchange = () => { $('safe-guide').hidden = !$('show-guides').checked; };
$('preview-motion').onclick = () => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) { message('Preview motion follows your reduced-motion preference.'); return; } previewMotion = !previewMotion; $('preview-motion').textContent = previewMotion ? 'Pause preview' : 'Resume preview'; postPreview(); };
$('preview-motion').textContent = previewMotion ? 'Pause preview' : 'Resume preview';
$('copy-url').onclick = async () => { try { await navigator.clipboard.writeText($('obs-url').value); message('OBS URL copied. Unsaved settings remain in preview only.'); } catch { $('obs-url').select(); message('URL selected; copy it manually.'); } };
$('export-config').onclick = () => {
  if (!draft || !check()) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2) + '\n'], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'obs-retro-bh-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import-config').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0]; if (!file) return;
  try { if (file.size > 262144) throw new Error('Import exceeds 256 KB'); const config = validateConfig(JSON.parse(await file.text())); if (dirty && !confirm('Replace unsaved edits with this imported configuration?')) return; draft = config; hydrate(); edited(); message('Imported into preview. Save to apply to OBS.'); }
  catch (error) { message('Import rejected: ' + error.message); } finally { $('import-file').value = ''; }
};
for (const button of document.querySelectorAll('[data-timer]')) button.onclick = async () => {
  if (dirty || !latest) { message('Save your settings before using timer controls.'); return; }
  try { receive(await api.request('/api/timers/' + selected + '/' + button.dataset.timer, {revision: baseRevision})); }
  catch (error) { message(error.message); }
};
$('audio-connect').onclick = async () => {
  if (dirty) { message('Save the audio settings before reconnecting.'); return; }
  const password = $('audio-password').value; $('audio-password').value = '';
  try { await api.request('/api/audio/connect', {password}); message('OBS connection requested. The password is session-only.'); } catch (error) { message(error.message); }
};
preview.addEventListener('load', postPreview);
const layout = event => {
  if (event.source !== preview.contentWindow || event.origin !== location.origin || event.data?.scene !== selected) return;
  if(event.data.type==='render-health'){if(event.data.errors?.length)message('Renderer: '+event.data.errors.join('; '));return;}
  if(event.data.type!=='layout-report')return;
  const issues = Array.isArray(event.data.issues) ? event.data.issues : [];
  $('layout-warnings').replaceChildren(...(issues.length ? issues : ['Within the measured text safe area. Check moving objects before going live.']).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  document.querySelector('.warnings').dataset.warning = !!issues.length;
};
addEventListener('message', layout);
const keyboard = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); } };
addEventListener('keydown', keyboard);
const leave = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; addEventListener('beforeunload', leave);
const connection = liveConnection({onState: receive, onAudio: audio => { $('audio-level').value = audio.level; }, onAudioInfo: info => {
  $('audio-status').textContent = info.status;
  $('audio-inputs').replaceChildren(...info.sources.map(name => { const option = document.createElement('option'); option.value = name; return option; }));
}, onStatus: status => { $('connection-state').textContent = {online: 'Local server connected', offline: 'Reconnecting to local server…', invalid: 'Invalid state received'}[status]; $('connection-state').dataset.state = status; }});
const timer = setInterval(timerStatus, 500);
choose(selected); status();
addEventListener('pagehide', () => { clearInterval(timer); connection.close(); removeEventListener('message', layout); removeEventListener('keydown', keyboard); removeEventListener('beforeunload', leave); }, {once: true});
