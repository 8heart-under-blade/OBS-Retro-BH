import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import {ConfigStore} from '../server/store.mjs';
async function fixture(t) { const dir = await mkdtemp(path.join(os.tmpdir(), 'retro-store-')); t.after(() => rm(dir, {recursive: true, force: true})); return {dir, store: await new ConfigStore(path.join(dir, 'state.json')).init()}; }
test('settings and shared timers survive reopening the store', async t => {
  const {dir, store} = await fixture(t); let state = store.snapshot(); state.config.scenes.starting.title.text = 'We begin shortly';
  state = await store.update(state.config, state.revision); await store.timer('starting', 'start', state.revision, 5000);
  const loaded = await new ConfigStore(path.join(dir, 'state.json')).init(); assert.equal(loaded.snapshot().config.scenes.starting.title.text, 'We begin shortly'); assert.equal(loaded.snapshot().timers.starting.deadline, 305000);
});
test('serialized writes detect competing revisions instead of silently overwriting', async t => {
  const {store} = await fixture(t), a = store.snapshot().config, b = store.snapshot().config; a.scenes.brb.title.text = 'One'; b.scenes.brb.title.text = 'Two';
  const results = await Promise.allSettled([store.update(a, 0), store.update(b, 0)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(store.snapshot().config.scenes.brb.title.text, 'One');
});
test('visual saves preserve active timers; timing changes reset only the affected timer', async t => {
  const {store} = await fixture(t); let state = await store.timer('starting', 'start', 0, 1000); state.config.scenes.starting.customCss = '#scene-title { color: white; }';
  state = await store.update(state.config, state.revision); assert.equal(state.timers.starting.deadline, 301000);
  state.config.scenes.starting.timer.durationSeconds = 600; state = await store.update(state.config, state.revision); assert.equal(state.timers.starting.status, 'idle'); assert.equal(state.timers.starting.remainingSeconds, 600);
});
test('corrupted state fails safely without replacing the file', async t => {
  const {dir} = await fixture(t), filename = path.join(dir, 'state.json'); await writeFile(filename, '{broken');
  await assert.rejects(new ConfigStore(filename).init(), /not overwritten/); assert.equal(await readFile(filename, 'utf8'), '{broken');
});
