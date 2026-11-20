import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os'; import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {ConfigStore} from '../server/store.mjs';
const directory = await mkdtemp(path.join(os.tmpdir(), 'retro-browser-'));
let app, chrome, mock, socket, failed = false;
const stateFile = path.join(directory, 'state.json');
const seed = await new ConfigStore(stateFile).init(); const initial = seed.snapshot(); initial.config.audio.enabled = false; await seed.update(initial.config, initial.revision);
const timeout = setTimeout(() => { console.error('Browser test timed out'); failed = true; chrome?.kill(); mock?.kill(); process.exitCode = 1; }, 90000);
const reports = [];
try {
  mock = spawn(process.execPath, ['scratch/poc/mock-obs.cjs'], {stdio: ['ignore', 'pipe', 'pipe']});
  const endpoint = await new Promise((resolve, reject) => { mock.stdout.once('data', d => resolve(String(d).trim())); mock.on('error', reject); });
  app = await createApp({stateFile}); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + app.server.address().port;
  const candidates = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const binary = candidates.find(existsSync); if (!binary) throw new Error('Chrome not found; set CHROME_BIN');
  chrome = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-port=0', '--window-size=1600,1000', '--user-data-dir=' + path.join(directory, 'chrome'), 'about:blank']);
  let log = ''; const address = await new Promise((resolve, reject) => { chrome.on('error', reject); chrome.stderr.on('data', d => { log += d; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) resolve(m[1]); }); });
  socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0; const pending = new Map(), exceptions = [];
  socket.onmessage = event => { const m = JSON.parse(event.data); if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params, sessionId})); });
  const {targetId} = await send('Target.createTarget', {url: base + '/config'}); const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true}); await send('Runtime.enable', {}, sessionId);
  const run = async fn => { const r = await send('Runtime.evaluate', {expression: '(' + fn.toString() + ')()', awaitPromise: true, returnByValue: true}, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  reports.push(await run(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async check => { for (let i = 0; i < 120; i++) { try { if (await check()) return; } catch {} await wait(75); } throw new Error('Condition timed out'); };
    const $ = id => document.getElementById(id), preview = () => $('scene-preview').contentDocument, overlay = () => preview().getElementById('overlay').contentDocument;
    await until(() => $('save-state')?.textContent === 'All changes saved' && overlay()?.getElementById('scene-title')?.textContent === 'Starting soon.');
    await overlay().fonts.ready;if(!overlay().fonts.check('64px Jost'))throw new Error('Jost failed to load');
    if (preview().querySelector('button,nav,header,footer,dialog')) throw new Error('Controls leaked into output');
    if (getComputedStyle(overlay().getElementById('scene-title')).fontFamily.indexOf('Jost') < 0) throw new Error('Local Meridian font missing');
    window.__test = {wait, until, $, preview, overlay};
    const second = document.createElement('iframe'); second.id = 'second-output'; second.style.cssText = 'position:fixed;right:0;bottom:0;width:320px;height:180px;opacity:0;pointer-events:none'; second.src = '/scene/starting'; document.body.append(second);
    await until(() => second.contentDocument?.getElementById('overlay')?.contentDocument?.getElementById('scene-title')?.textContent === 'Starting soon.');
    window.__test.second = () => second.contentDocument.getElementById('overlay').contentDocument;
    window.__test.canvas = preview().getElementById('artwork');
    return 'Clean Full HD outputs, nested overlay and local fonts load';
  }));
  reports.push(await run(async () => {
    const t = window.__test, field = document.querySelector('[data-path="scenes.$.title.text"]');
    field.value = '<b>Our next orbit</b>'; field.dispatchEvent(new Event('input', {bubbles: true}));
    await t.until(() => t.overlay().getElementById('scene-title').textContent === field.value);
    if (t.overlay().getElementById('scene-title').children.length) throw new Error('Title treated as HTML');
    if (t.second().getElementById('scene-title').textContent !== 'Starting soon.') throw new Error('Draft leaked to saved output');
    t.$('save').click(); await t.until(() => t.$('save-state').textContent === 'All changes saved' && t.second().getElementById('scene-title').textContent === field.value);
    if (t.canvas !== t.preview().getElementById('artwork')) throw new Error('Renderer canvas recreated on save');
    return 'Draft preview is isolated; Save updates both outputs without replacing artwork';
  }));
  reports.push(await run(async () => {
    const t = window.__test; t.$('tab-css').click();
    t.$('css-editor').value = '#scene-title { color: rgb(220,160,95); font-size:72px; }\n#artwork,.app-header { display:none!important; }'; t.$('css-editor').dispatchEvent(new Event('input'));
    await t.until(() => getComputedStyle(t.overlay().getElementById('scene-title')).color === 'rgb(220, 160, 95)');
    if (getComputedStyle(document.querySelector('.app-header')).display === 'none' || getComputedStyle(t.canvas).display === 'none') throw new Error('CSS escaped overlay');
    t.$('save').click(); await t.until(() => t.$('save-state').textContent === 'All changes saved' && getComputedStyle(t.second().getElementById('scene-title')).fontSize === '72px');
    return 'Custom CSS updates live and cannot restyle the editor or canvas';
  }));
  reports.push(await run(async()=>{
    const t=window.__test;t.$('tab-layout').click();const theme=document.querySelector('[data-path="scenes.$.theme"]');theme.value='plate';theme.dispatchEvent(new Event('input'));
    await t.until(()=>t.overlay().getElementById('scene-root').dataset.theme==='plate');await t.overlay().fonts.load('64px Spectral');if(!t.overlay().fonts.check('64px Spectral'))throw new Error('Spectral failed to load');
    theme.value='meridian';theme.dispatchEvent(new Event('input'));t.$('tab-css').click();t.$('css-scope').value='global';t.$('css-scope').dispatchEvent(new Event('change'));t.$('css-editor').value='#scene-subtitle { letter-spacing:2px; }';t.$('css-editor').dispatchEvent(new Event('input'));
    await t.until(()=>getComputedStyle(t.overlay().getElementById('scene-subtitle')).letterSpacing==='2px');t.$('save').click();await t.until(()=>t.$('save-state').textContent==='All changes saved');
    let blob;const originalURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=value=>{blob=value;return originalURL.call(URL,value);};HTMLAnchorElement.prototype.click=function(){if(!this.download)return originalClick.call(this);};t.$('export-config').click();URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick;
    const exported=JSON.parse(await blob.text());if(exported.schemaVersion!==1||Object.hasOwn(exported.audio,'password'))throw new Error('Export format contains incorrect settings');
    exported.scenes.goodbye.nextStream.text='Tomorrow, same orbit.';const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(exported)],'settings.json',{type:'application/json'}));t.$('import-file').files=transfer.files;t.$('import-file').dispatchEvent(new Event('change'));await t.until(()=>t.$('message').textContent.startsWith('Imported into preview'));t.$('save').click();await t.until(()=>t.$('save-state').textContent==='All changes saved');
    return 'Both bundled fonts, global CSS and settings export/import work';
  }));
  await run(async () => { const t=window.__test;t.$('tab-content').click();const field=document.querySelector('[data-path="scenes.$.title.text"]');field.value='Unpublished local title';field.dispatchEvent(new Event('input'));await t.until(()=>t.overlay().getElementById('scene-title').textContent==='Unpublished local title'); });
  const competing=app.store.snapshot();competing.config.scenes.goodbye.subtitle.text='Changed from another configuration window';await app.store.update(competing.config,competing.revision);
  reports.push(await run(async()=>{const t=window.__test;await t.until(()=>t.$('save-state').textContent.startsWith('Changed in another'));if(!t.$('save').disabled||t.overlay().getElementById('scene-title').textContent!=='Unpublished local title')throw new Error('Concurrent edit was silently overwritten');const original=window.confirm;window.confirm=()=>true;t.$('revert').click();await t.until(()=>t.$('save-state').textContent==='All changes saved');window.confirm=original;return 'Conflicting edits are reported without losing the local preview';}));
  reports.push(await run(async () => {
    const t = window.__test; t.$('tab-content').click();
    const enabled = document.querySelector('[data-path="scenes.$.timer.enabled"]'), duration = document.querySelector('[data-path="scenes.$.timer.durationSeconds"]'); enabled.checked = true; enabled.dispatchEvent(new Event('input')); duration.value = '90'; duration.dispatchEvent(new Event('input'));
    t.$('save').click(); await t.until(() => t.$('save-state').textContent === 'All changes saved'); document.querySelector('[data-timer=start]').click();
    await t.until(() => t.$('timer-status').textContent.startsWith('Running') && t.overlay().getElementById('timer-value').textContent !== '01:30');
    document.querySelector('[data-timer=pause]').click(); await t.until(() => t.$('timer-status').textContent.startsWith('Paused')); await t.wait(350); const frozen = t.overlay().getElementById('timer-value').textContent; await t.wait(800);
    if (t.overlay().getElementById('timer-value').textContent !== frozen || t.second().getElementById('timer-value').textContent !== frozen) throw new Error('Shared pause not synchronized');
    document.querySelector('[data-timer=resume]').click(); await t.until(() => t.$('timer-status').textContent.startsWith('Running'));
    const second = document.getElementById('second-output'); second.src = '/scene/starting?reload=1'; await t.until(() => t.second()?.getElementById('timer-value')?.textContent && t.second().getElementById('timer-value').textContent !== '01:30');
    return 'Countdown start/pause/resume and reload preserve shared timer state';
  }));
  reports.push(await run(async () => {
    const t = window.__test;
    for (const name of ['brb', 'goodbye']) {
      document.querySelector('[data-scene="' + name + '"]').click();
      await t.until(() => t.overlay()?.getElementById('scene-root')?.dataset.scene === name);
      await t.until(() => { const c = t.preview().getElementById('artwork'), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let bright = 0; for (let i = 0; i < data.length; i += 4) if (data[i] > 60) bright++; return bright > 1000; });
      if (t.preview().querySelector('button,nav,header,footer,dialog')) throw new Error('Output chrome on ' + name);
    }
    const clock = document.querySelector('[data-path="scenes.$.clock.enabled"]'); clock.checked = true; clock.dispatchEvent(new Event('input'));
    const date = document.querySelector('[data-path="scenes.$.date.enabled"]'); date.checked = true; date.dispatchEvent(new Event('input'));
    await t.until(() => t.overlay().getElementById('scene-clock').textContent.match(/\d.*:/) && t.overlay().getElementById('scene-date').textContent.length > 5);
    const zone = document.querySelector('[data-path="time.timeZone"]'); zone.value = 'Moon/Sea'; zone.dispatchEvent(new Event('input')); if (!t.$('save').disabled) throw new Error('Invalid timezone accepted'); zone.value = 'Philippines Manila'; zone.dispatchEvent(new Event('input'));
    await t.until(()=>t.overlay().getElementById('scene-clock').textContent===new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour12:false,hour:'2-digit',minute:'2-digit'}).format(Date.now()));
    t.$('save').click();await t.until(()=>t.$('save-state').textContent==='All changes saved');if((await (await fetch('/api/state')).json()).config.time.timeZone!=='Asia/Manila')throw new Error('Manila alias did not save canonically');
    zone.value='UTC +8';zone.dispatchEvent(new Event('input'));t.$('save').click();await t.until(()=>t.$('save-state').textContent==='All changes saved');if((await (await fetch('/api/state')).json()).config.time.timeZone!=='Etc/GMT-8')throw new Error('UTC+8 alias did not save canonically');
    zone.value='UTC';zone.dispatchEvent(new Event('input'));
    t.$('tab-layout').click(); const offset = document.querySelector('[data-path="scenes.$.layout.offsetX"]'); offset.value = '-1700'; offset.dispatchEvent(new Event('input'));
    await t.until(() => t.$('layout-warnings').textContent.includes('safe margin')); offset.value = '0'; offset.dispatchEvent(new Event('input'));
    t.$('save').click(); await t.until(() => t.$('save-state').textContent === 'All changes saved');
    return 'BRB/Goodbye artwork loads; clock/date, validation and overflow warnings work';
  }));
  reports.push(await run(async()=>{
    const t=window.__test,original=window.confirm,before=await (await fetch('/api/state')).json();
    window.confirm=()=>false;t.$('load-defaults').click();if(t.$('save-state').textContent!=='All changes saved')throw new Error('Cancel changed settings');
    window.confirm=()=>true;t.$('load-defaults').click();window.confirm=original;
    await t.until(()=>t.$('message').textContent.startsWith('Defaults loaded into preview')&&t.overlay().getElementById('scene-clock').hidden);
    document.querySelector('[data-scene=starting]').click();await t.until(()=>t.overlay()?.getElementById('scene-title')?.textContent==='Starting soon.');
    if(t.second().getElementById('scene-title').textContent==='Starting soon.')throw new Error('Defaults changed live OBS before Save');
    const staged=await (await fetch('/api/state')).json();if(staged.revision!==before.revision)throw new Error('Defaults auto-saved');
    t.$('tab-css').click();t.$('css-scope').value='global';t.$('css-scope').dispatchEvent(new Event('change'));if(t.$('css-editor').value!=='')throw new Error('Global CSS not reset');t.$('css-scope').value='scene';t.$('css-scope').dispatchEvent(new Event('change'));if(t.$('css-editor').value!=='')throw new Error('Scene CSS not reset');
    // Keep the test isolated: do not connect to the real default OBS endpoint when saving.
    const audio=document.querySelector('[data-path="audio.enabled"]');audio.checked=false;audio.dispatchEvent(new Event('input'));t.$('save').click();await t.until(()=>t.$('save-state').textContent==='All changes saved'&&t.second().getElementById('scene-title').textContent==='Starting soon.');
    const saved=await (await fetch('/api/state')).json();if(saved.config.customCss!==''||saved.config.scenes.goodbye.clock.enabled||saved.config.scenes.starting.customCss!==''||saved.config.audio.url!=='ws://127.0.0.1:4455')throw new Error('Defaults were not applied across shared settings and scenes');
    return 'Load defaults supports cancel, clears all styles/modules in preview, and applies only on Save';
  }));
  const beforeAudio = app.store.snapshot(); beforeAudio.config.audio = {enabled: true, url: endpoint, source: 'Music', strength: .65}; await app.store.update(beforeAudio.config, beforeAudio.revision);
  reports.push(await run(async () => {
    const t = window.__test; t.$('tab-audio').click();
    await t.until(() => t.$('audio-status').textContent === 'LIVE OBS AUDIO' && t.$('audio-level').value > .05);
    if (document.querySelectorAll('#audio-inputs option').length < 2) throw new Error('Audio source discovery failed');
    return 'Server-side OBS v5 bridge receives simulated live meters';
  }));
  reports.push(await run(async () => {
    const t = window.__test; t.$('tab-layout').click();
    const theme = document.querySelector('[data-path="scenes.$.theme"]'), motion = document.querySelector('[data-path="scenes.$.reactToAudio"]');
    const root = () => t.overlay().getElementById('scene-root');
    const level = () => Number(root().style.getPropertyValue('--obs-level'));
    for (const preset of ['transit','ephemeris','contact-sheet']) {
      theme.value = preset; theme.dispatchEvent(new Event('input'));
      await t.until(() => root().dataset.theme === preset && !t.overlay().getElementById('scene-mark').hidden);
    }
    if (level() !== 0) throw new Error('Audio motion is not opt-in');
    motion.checked = true; motion.dispatchEvent(new Event('input'));
    await t.until(() => level() > 0 && parseFloat(getComputedStyle(t.overlay().getElementById('scene-title')).scale) > 1);
    t.$('preview-motion').click(); await t.until(() => level() === 0);
    t.$('preview-motion').click(); await t.until(() => level() > 0);
    t.$('save').click(); await t.until(() => t.$('save-state').textContent === 'All changes saved');
    const saved = await (await fetch('/api/state')).json();
    const selected = root().dataset.scene;
    if (!saved.config.scenes[selected].reactToAudio || saved.config.scenes[selected].theme !== 'contact-sheet') throw new Error('Preset/audio motion did not save');
    await t.until(() => t.second().getElementById('scene-root').dataset.theme === 'contact-sheet' && Number(t.second().getElementById('scene-root').style.getPropertyValue('--obs-level')) > 0);
    return 'All three new presets render; OBS meter drives opt-in title motion, and preview pause stops it';
  }));
  const priorClient = app.bridge.client;
  const afterAudio = app.store.snapshot(); afterAudio.config.scenes.goodbye.title.text = 'Until the next orbit.'; await app.store.update(afterAudio.config, afterAudio.revision);
  if (app.bridge.client !== priorClient) throw new Error('Text save unnecessarily reconnected OBS');
  const stateJson = JSON.stringify(app.store.snapshot()); if (stateJson.includes('writeToken') || stateJson.includes('password')) throw new Error('Secrets present in public configuration');
  if (exceptions.length) throw new Error('Browser exceptions: ' + exceptions.join('\n'));
  const reset = app.store.snapshot(); const {defaultConfig} = await import('../public/js/config-schema.mjs'); const clean = defaultConfig(); clean.audio.enabled = false; await app.store.update(clean, reset.revision);
  await run(async () => { document.querySelector('[data-scene=starting]').click(); document.getElementById('tab-content').click(); await window.__test.until(() => window.__test.overlay()?.getElementById('scene-title')?.textContent === 'Starting soon.'); await window.__test.wait(400); const doc=window.__test.overlay(),r=doc.getElementById('scene-title').getBoundingClientRect();if(r.left<0||r.top<0||r.right>doc.defaultView.innerWidth||r.bottom>doc.defaultView.innerHeight)throw new Error('Default title is not visually inside the output: '+JSON.stringify({rect:r.toJSON(),width:doc.defaultView.innerWidth,height:doc.defaultView.innerHeight,transform:doc.getElementById('scene-root').style.transform})); });
  await mkdir('.local/browser-results', {recursive: true}); const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId); await writeFile('.local/browser-results/studio.png', Buffer.from(shot.data, 'base64'));
  await send('Target.closeTarget', {targetId});
  for (const report of reports) console.log('PASS: ' + report);
  console.log('PASS: no browser exceptions; state excludes credentials; text saves preserve the OBS connection');
} catch (error) { failed = true; console.error('FAIL: ' + error.stack); }
finally { clearTimeout(timeout); socket?.close(); chrome?.kill(); mock?.kill(); if (app) await app.close(); try { await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); } catch {} }
if (failed) process.exitCode = 1;
