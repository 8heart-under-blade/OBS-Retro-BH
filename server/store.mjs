import {mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {defaultConfig, validateConfig, SCENES, ConfigError} from '../public/js/config-schema.mjs';
import {initialTimer, timerAction} from '../public/js/timers.mjs';
export class ConflictError extends Error {
  constructor(revision) { super('Configuration changed in another window. Reload before saving.'); this.status = 409; this.revision = revision; }
}
function timersFor(config) { return Object.fromEntries(SCENES.map(name => [name, initialTimer(config.scenes[name].timer)])); }
function validateState(state) {
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Invalid saved revision');
  state.config = validateConfig(state.config);
  if (!state.timers || Object.keys(state.timers).length !== SCENES.length) throw new Error('Invalid saved timer collection');
  for (const name of SCENES) {
    const t = state.timers[name];
    if (!t || !['idle', 'running', 'paused'].includes(t.status) || t.mode !== state.config.scenes[name].timer.mode ||
        !Number.isFinite(t.elapsedBefore) || t.elapsedBefore < 0 || !Number.isFinite(t.remainingSeconds) || t.remainingSeconds < 0 ||
        (t.status === 'running' ? !Number.isFinite(t.startedAt) : t.startedAt !== null) ||
        (t.status === 'running' && t.mode === 'countdown' ? !Number.isFinite(t.deadline) : t.deadline !== null)) throw new Error('Invalid saved timer: ' + name);
  }
  return state;
}
export class ConfigStore extends EventEmitter {
  constructor(filename) { super(); this.filename = filename; this.pending = Promise.resolve(); this.serial = 0; }
  async init() {
    try { this.state = validateState(JSON.parse(await readFile(this.filename, 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot load local state; existing file was not overwritten: ' + error.message);
      const config = defaultConfig(); this.state = {revision: 0, config, timers: timersFor(config)}; await this.persist(this.state);
    }
    return this;
  }
  snapshot() { return structuredClone(this.state); }
  async persist(state) {
    const directory = path.dirname(this.filename); await mkdir(directory, {recursive: true, mode: 0o700});
    const temp = this.filename + '.tmp-' + process.pid + '-' + ++this.serial;
    try { await writeFile(temp, JSON.stringify(state, null, 2) + '\n', {mode: 0o600}); await rename(temp, this.filename); }
    finally { await rm(temp, {force: true}); }
  }
  transaction(expectedRevision, change) {
    const operation = this.pending.then(async () => {
      if (!Number.isSafeInteger(expectedRevision)) throw new ConfigError('A numeric revision is required');
      if (expectedRevision !== this.state.revision) throw new ConflictError(this.state.revision);
      const next = change(this.snapshot()); next.revision++;
      await this.persist(next); this.state = next; const snapshot = this.snapshot(); this.emit('change', snapshot); return snapshot;
    });
    this.pending = operation.catch(() => {}); return operation;
  }
  update(config, revision) {
    const validated = validateConfig(config);
    return this.transaction(revision, state => {
      for (const name of SCENES) {
        const before = state.config.scenes[name].timer, after = validated.scenes[name].timer;
        if (before.mode !== after.mode || before.durationSeconds !== after.durationSeconds) state.timers[name] = initialTimer(after);
      }
      state.config = validated; return state;
    });
  }
  timer(name, action, revision, now = Date.now()) {
    if (!SCENES.includes(name) || !['start', 'pause', 'resume', 'reset'].includes(action)) throw new ConfigError('Unknown scene or timer action');
    return this.transaction(revision, state => { state.timers[name] = timerAction(state.timers[name], action, state.config.scenes[name].timer, now); return state; });
  }
}
