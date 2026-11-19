import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'; import path from 'node:path'; import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {request as httpRequest} from 'node:http';
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'retro-server-')), publicDir = path.join(dir, 'public'); await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'config.html'), '<h1>Configuration fixture</h1>'); await writeFile(path.join(dir, 'private.txt'), 'not public');
  const app = await createApp({stateFile: path.join(dir, 'state.json'), publicDir, enableAudio: false});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(async () => { await app.close(); await rm(dir, {recursive: true, force: true}); }); return {...app, base};
}
test('config APIs expose versioned state and require a same-origin write token', async t => {
  const {base} = await fixture(t), response = await fetch(base + '/api/state'); assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  const state = await response.json(); assert.equal(state.revision, 0); assert.ok(Number.isFinite(state.serverNow));
  let r = await fetch(base + '/api/config', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({revision: 0, config: state.config})}); assert.equal(r.status, 403);
  const {writeToken} = await (await fetch(base + '/api/session')).json(); state.config.scenes.goodbye.title.text = 'See you next time';
  const headers = {'Content-Type': 'application/json', 'X-Config-Token': writeToken};
  r = await fetch(base + '/api/config', {method: 'PUT', headers, body: JSON.stringify({revision: 0, config: state.config})}); assert.equal(r.status, 200); assert.equal((await r.json()).revision, 1);
  r = await fetch(base + '/api/config', {method: 'PUT', headers, body: JSON.stringify({revision: 0, config: state.config})}); assert.equal(r.status, 409);
});
test('cross-origin/rebinding requests, malformed JSON and path traversal are rejected', async t => {
  const {base} = await fixture(t), {writeToken} = await (await fetch(base + '/api/session')).json();
  const rebindingStatus = await new Promise((resolve, reject) => { const request = httpRequest(base + '/api/state', {headers: {Host: 'evil.example'}, agent: false}, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end(); });
  assert.equal(rebindingStatus, 403);
  assert.equal((await fetch(base + '/api/session', {headers: {Origin: 'https://evil.example'}})).status, 403);
  assert.equal((await fetch(base + '/api/session', {headers: {Origin: 'null'}})).status, 403);
  const r = await fetch(base + '/api/config', {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Config-Token': writeToken}, body: '{broken'}); assert.equal(r.status, 400);
  assert.equal((await fetch(base + '/%2e%2e%2fprivate.txt')).status, 403);
  assert.equal((await fetch(base + '/config')).status, 200);
});
test('SSE immediately provides state, then delivers saved changes to connected outputs', {timeout: 10000}, async t => {
  const {base} = await fixture(t), abort = new AbortController(); t.after(() => abort.abort());
  const stream = await fetch(base + '/api/events', {signal: abort.signal}), reader = stream.body.getReader(), decoder = new TextDecoder();
  const first = decoder.decode((await reader.read()).value); assert.match(first, /event: state/); assert.match(first, /"revision":0/);
  const {writeToken} = await (await fetch(base + '/api/session')).json(); const state = await (await fetch(base + '/api/state')).json(); state.config.scenes.brb.title.text = 'Live update';
  const r = await fetch(base + '/api/config', {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Config-Token': writeToken}, body: JSON.stringify({revision: state.revision, config: state.config})}); assert.equal(r.status, 200);
  const event = decoder.decode((await reader.read()).value); assert.match(event, /Live update/); assert.match(event, /"revision":1/); abort.abort();
});
test('audio authentication is write-protected and never enters exported state', async t => {
  const {base, bridge} = await fixture(t);
  const unauthorized = await fetch(base + '/api/audio/connect', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'session-test'})});assert.equal(unauthorized.status,403);
  const {writeToken}=await (await fetch(base+'/api/session')).json();
  const response=await fetch(base+'/api/audio/connect',{method:'POST',headers:{'Content-Type':'application/json','X-Config-Token':writeToken},body:JSON.stringify({password:'session-test'})});assert.equal(response.status,200);assert.equal(bridge.password,'session-test');
  assert.ok(!JSON.stringify(await (await fetch(base+'/api/state')).json()).includes('session-test'));
});
test('oversized JSON imports fail before changing saved configuration', async t=>{
  const {base}=await fixture(t),{writeToken}=await (await fetch(base+'/api/session')).json();
  const response=await fetch(base+'/api/config',{method:'PUT',headers:{'Content-Type':'application/json','X-Config-Token':writeToken},body:JSON.stringify({large:'x'.repeat(263000)})});assert.equal(response.status,413);assert.equal((await (await fetch(base+'/api/state')).json()).revision,0);
});
test('shared timer actions use the persisted revision and return server-clock deadlines', async t => {
  const {base} = await fixture(t), {writeToken} = await (await fetch(base + '/api/session')).json();
  const r = await fetch(base + '/api/timers/starting/start', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Config-Token': writeToken}, body: JSON.stringify({revision: 0})}); assert.equal(r.status, 200); const state = await r.json();
  assert.equal(state.timers.starting.status, 'running'); assert.ok(Math.abs(state.timers.starting.deadline - state.serverNow - 300000) < 1000);
});
