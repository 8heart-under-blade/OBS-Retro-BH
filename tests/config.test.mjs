import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig, validateConfig, ConfigError, CANVAS} from '../public/js/config-schema.mjs';
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
