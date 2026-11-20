import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig, validateConfig, normalizeTimeZone, ConfigError, CANVAS} from '../public/js/config-schema.mjs';
test('versioned Full HD defaults validate without shared mutable objects', () => {
  const original = defaultConfig(), validated = validateConfig(original); assert.deepEqual(CANVAS, {width: 1920, height: 1080}); assert.deepEqual(validated, original);
  validated.scenes.starting.title.text = 'Changed'; assert.equal(original.scenes.starting.title.text, 'Starting soon.');
});
test('custom CSS and multilingual text remain editable data rather than markup', () => {
  const c = defaultConfig(); c.customCss = '#scene-title { font-size: 72px; }'; c.scenes.brb.title.text = '<img onerror=alert(1)> مرحباً'; assert.deepEqual(validateConfig(c), c);
});
test('invalid locale, timezone and unsupported schema versions are rejected', () => {
  for (const edit of [c => c.time.timeZone = 'Moon/Sea', c => c.time.locale = 'not_a_locale', c => c.schemaVersion = 2]) { const c = defaultConfig(); edit(c); assert.throws(() => validateConfig(c), ConfigError); }
});
test('Manila and Philippines aliases normalize without mutating imported data',()=>{
  for(const alias of ['Manila','Philippines','Philippines Manila','Philippines/Manila','Manila, Philippines','Asia/Manila','PHT']){const c=defaultConfig();c.time.timeZone=alias;const valid=validateConfig(c);assert.equal(valid.time.timeZone,'Asia/Manila');assert.equal(c.time.timeZone,alias);}
});
test('UTC offsets use the correct IANA sign and reject unsupported offsets',()=>{
  for(const value of ['UTC+8','UTC +8','utc +08:00','GMT+8'])assert.equal(normalizeTimeZone(value),'Etc/GMT-8');
  assert.equal(normalizeTimeZone('UTC-5'),'Etc/GMT+5');assert.equal(normalizeTimeZone('UTC+0'),'UTC');
  for(const value of ['UTC+15','UTC-13','UTC+8:30','Moon/Sea'])assert.throws(()=>normalizeTimeZone(value),ConfigError);
});
test('UTC+8 and Manila clocks agree across a UTC date boundary',()=>{
  const now=new Date('2026-01-01T16:30:00Z');
  const format=zone=>new Intl.DateTimeFormat('en-GB',{timeZone:normalizeTimeZone(zone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  assert.equal(format('UTC+8'),format('Philippines Manila'));assert.match(format('Manila'),/02\/01\/2026, 00:30/);
});
test('new presets accept opt-in audio motion and old imports remain static', () => {
  const c = defaultConfig(); delete c.scenes.starting.reactToAudio;
  assert.equal(validateConfig(c).scenes.starting.reactToAudio, false);
  for (const theme of ['transit', 'ephemeris', 'contact-sheet']) {
    c.scenes.starting.theme = theme; c.scenes.starting.reactToAudio = true;
    assert.equal(validateConfig(c).scenes.starting.reactToAudio, true);
  }
  c.scenes.starting.reactToAudio = 'true'; assert.throws(() => validateConfig(c), ConfigError);
});
test('unknown fields including passwords and prototype keys are rejected', () => {
  for (const edit of [c => c.audio.password = 'not-a-real-secret', c => c.scenes.starting.title.extra = true, c => Object.defineProperty(c, '__proto__', {value: {}, enumerable: true})]) { const c = defaultConfig(); edit(c); assert.throws(() => validateConfig(c), ConfigError); }
});
test('audio config permits loopback only and never embeds credentials', () => {
  for (const url of ['http://127.0.0.1:4455', 'ws://example.com', 'ws://user:pass@localhost:4455', 'ws://127.0.0.1:4455/?password=bad', 'ws://localhost:4455/private']) { const c = defaultConfig(); c.audio.url = url; assert.throws(() => validateConfig(c), ConfigError); }
  for (const url of ['ws://127.0.0.1:4455', 'wss://localhost:4455', 'ws://[::1]:4455']) { const c = defaultConfig(); c.audio.url = url; validateConfig(c); }
});
test('timer/text/CSS/position constraints reject bad imported configurations', () => {
  for (const edit of [c => c.scenes.starting.timer.durationSeconds = 1.5, c => c.scenes.brb.timer.durationSeconds = -2, c => c.scenes.starting.title.enabled = 'yes', c => c.customCss = 'x'.repeat(32769), c => c.appearance.ink = 'url(http://bad)', c => c.scenes.starting.layout.offsetX = Infinity]) { const c = defaultConfig(); edit(c); assert.throws(() => validateConfig(c), ConfigError); }
});
