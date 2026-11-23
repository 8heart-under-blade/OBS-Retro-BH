import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, rmdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createApp} from '../server/index.mjs';

export function userDataDir(env = process.env, platform = process.platform, home = os.homedir()) {
  const override = env.OBS_RETRO_BH_HOME;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const absolute = value => !!value && paths.isAbsolute(value) && (platform !== 'win32' || paths.parse(value).root.length > 1);
  if (override !== undefined) {
    if (!absolute(override)) throw new Error('OBS_RETRO_BH_HOME must be an absolute path.');
    return paths.normalize(override);
  }
  if (platform === 'win32') return paths.join(absolute(env.LOCALAPPDATA) ? env.LOCALAPPDATA : paths.join(home, 'AppData', 'Local'), 'obs-retro-bh');
  if (platform === 'darwin') return paths.join(home, 'Library', 'Application Support', 'obs-retro-bh');
  return paths.join(absolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : paths.join(home, '.local', 'share'), 'obs-retro-bh');
}

export function parsePort(value = '8090') {
  if (!/^\d{1,5}$/.test(value) || Number(value) > 65535) throw new Error('PORT must be an integer from 0 to 65535 (default 8090).');
  return Number(value);
}

function openStudio(url) {
  const windows = process.platform === 'win32';
  const command = windows ? 'cmd.exe' : process.platform === 'darwin' ? '/usr/bin/open' : 'xdg-open';
  const args = windows ? ['/d', '/v:off', '/c', 'start', '""', url] : [url];
  const child = spawn(command, args, {stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: windows});
  child.once('error', () => console.error('Could not open your browser. Open ' + url + ' manually.'));
  child.once('exit', code => { if (code) console.error('Could not open your browser. Open ' + url + ' manually.'); });
  child.unref();
}

async function run() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--no-open')) throw new Error('Usage: portable.mjs [--no-open]');
  const port = parsePort(process.env.PORT), dir = userDataDir(), lock = path.join(dir, '.studio-lock');
  await mkdir(dir, {recursive: true, mode: 0o700});
  try { await mkdir(lock, {mode: 0o700}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('Settings directory is already locked. Stop the other studio. After a crash, verify no portable studio is still using this directory before removing: ' + lock);
  }
  let app, signal;
  const stopped = new Promise(resolve => { signal = resolve; });
  process.once('SIGINT', signal);
  process.once('SIGTERM', signal);
  let deadline;
  try {
    app = await createApp({stateFile: path.join(dir, 'state.json'), initialAudioEnabled: false});
    await new Promise((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(port, '127.0.0.1', resolve);
    }).catch(error => {
      if (error.code === 'EADDRINUSE') throw new Error('Port ' + port + ' is already in use. Stop the other listener or select a different PORT explicitly.');
      throw error;
    });
    const url = 'http://127.0.0.1:' + app.server.address().port + '/config';
    console.log('OBS Retro-BH: ' + url);
    console.log('Settings: ' + dir + ' | Press Ctrl+C to stop.');
    if (!args.includes('--no-open')) openStudio(url);
    await stopped;
  } finally {
    // If shutdown stalls, fail closed and leave the lock for explicit recovery.
    deadline = setTimeout(() => { console.error('Shutdown timed out; the app left its settings lock in place.'); process.exit(1); }, 5000);
    try {
      if (app) { await app.close(); await app.store.pending; }
      await rmdir(lock);
    } finally {
      clearTimeout(deadline);
      process.removeListener('SIGINT', signal);
      process.removeListener('SIGTERM', signal);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error('OBS Retro-BH: ' + error.message); process.exitCode = 1; });
}
