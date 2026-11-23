import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import http from 'node:http';

const entry = fileURLToPath(new URL('../scripts/portable.mjs', import.meta.url));
async function fixture(t) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'retro portable test - '));
  t.after(() => rm(cwd, {recursive: true, force: true}));
  return {cwd, home: path.join(cwd, 'user data')};
}
function start(cwd, home, port) {
  const child = spawn(process.execPath, [entry, '--no-open'], {
    cwd, env: {...process.env, OBS_RETRO_BH_HOME: home, PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise(resolve => {
    child.once('error', error => { stderr += error.message; });
    child.once('close', (code, signal) => resolve({code, signal, stdout, stderr}));
  });
  return {child, closed, diagnostics: () => stdout + stderr};
}
async function within(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(label)), ms);})]); }
  finally { clearTimeout(timer); }
}
async function terminate(run) {
  if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
  try { return await within(run.closed, 6000, 'Portable process did not stop'); }
  catch (error) { run.child.kill('SIGKILL'); await run.closed; throw error; }
}
async function listener() {
  const server = http.createServer((_, res) => res.end('occupant'));
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  return {server, port: server.address().port, close: () => new Promise(resolve => server.close(resolve))};
}

test('portable entry boots from another directory with fresh external state, audio off and clean HTTP routes', {timeout: 20000}, async t => {
  const {cwd, home} = await fixture(t);
  const socket = await listener(); await socket.close();
  const run = start(cwd, home, socket.port), base = `http://127.0.0.1:${socket.port}`;
  try {
    const expires = Date.now() + 8000;
    while (!run.diagnostics().includes(base)) {
      if (run.child.exitCode !== null || Date.now() > expires) assert.fail('Portable app did not become ready: ' + run.diagnostics());
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const response = await fetch(base + '/api/state', {signal: AbortSignal.timeout(3000)});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal((await response.json()).config.audio.enabled, false);
    assert.equal(JSON.parse(await readFile(path.join(home, 'state.json'), 'utf8')).config.audio.enabled, false);
    const second = start(cwd, home, 0);
    try {
      const result = await within(second.closed, 5000, 'Second studio did not reject the shared data directory');
      assert.equal(result.code, 1); assert.match(result.stderr, /settings directory is already locked/i);
    } finally { await terminate(second); }
    for (const route of ['/config', '/scene/starting', '/scene/brb', '/scene/goodbye']) {
      const res = await fetch(base + route, {signal: AbortSignal.timeout(3000)});
      assert.equal(res.status, 200); await res.text();
    }
  } finally {
    const result = await terminate(run);
    if (process.platform !== 'win32') assert.equal(result.code, 0, result.stderr);
  }
});

test('portable entry exits nonzero without disturbing a listener on the requested port', {timeout: 14000}, async t => {
  const {cwd, home} = await fixture(t), occupant = await listener();
  const run = start(cwd, home, occupant.port);
  try {
    const result = await within(run.closed, 8000, 'Port conflict did not exit');
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /EADDRINUSE|already in use|occupied/i);
    assert.equal(await (await fetch(`http://127.0.0.1:${occupant.port}/`)).text(), 'occupant');
  } finally {
    await terminate(run); await occupant.close();
  }
});
