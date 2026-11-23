import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const START_CMD = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'packaging', 'windows', 'Start.cmd');

async function stageBundle(t, { includeRuntime = true, includeEntry = true, entrySource = '' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'obs retro & bundle! -'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (includeRuntime) {
    await mkdir(path.join(root, 'runtime'), { recursive: true });
    await cp(process.execPath, path.join(root, 'runtime', 'node.exe'));
  }
  if (includeEntry) {
    await mkdir(path.join(root, 'app', 'scripts'), { recursive: true });
    await writeFile(path.join(root, 'app', 'scripts', 'portable.mjs'), entrySource);
  }
  await cp(START_CMD, path.join(root, 'Start.cmd'));
  return root;
}

function run(root, args, cwd = root) {
  // cmd.exe consumes command text, not argv encoded with the Win32 CRT rules.
  const command = '""' + path.join(root, 'Start.cmd') + '"' + args.map(arg => ' "' + arg + '"').join('') + '"';
  return spawnSync('cmd.exe', ['/d', '/v:off', '/s', '/c', command], { cwd, encoding: 'utf8', windowsVerbatimArguments: true });
}

const windowsTest = (name, fn) => test(name, {skip: process.platform !== 'win32'}, fn);

windowsTest('Start.cmd runs the bundled Node entry with arguments and preserves its exit code', async t => {
  const root = await stageBundle(t, {
    entrySource: 'console.log(JSON.stringify(process.argv.slice(2)));\nprocess.exit(42);\n'
  });
  const result = run(root, ['--no-open', 'first arg', 'x&y'], os.tmpdir());
  assert.equal(result.status, 42);
  assert.match(result.stdout, /\["--no-open","first arg","x&y"\]/);
});

windowsTest('Start.cmd reports a missing bundled runtime and exits 1', async t => {
  const root = await stageBundle(t, { includeRuntime: false, entrySource: 'process.exit(0);\n' });
  const result = run(root, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundled Node runtime not found/);
});

windowsTest('Start.cmd reports a missing portable entry and exits 1', async t => {
  const root = await stageBundle(t, { includeRuntime: true, includeEntry: false });
  const result = run(root, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /portable entry not found/);
});

windowsTest('Start.cmd launches from an arbitrary working directory', async t => {
  const root = await stageBundle(t, {
    entrySource: 'console.log(process.cwd());\nprocess.exit(7);\n'
  });
  const result = run(root, [], os.tmpdir());
  assert.equal(result.status, 7, result.stderr);
  assert.equal(path.resolve(result.stdout.trim()).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
});
