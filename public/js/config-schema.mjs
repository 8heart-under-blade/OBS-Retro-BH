export const SCENES = ['starting', 'brb', 'goodbye'];
export const CANVAS = Object.freeze({width: 1920, height: 1080});
export class ConfigError extends Error {
  constructor(message) { super(message); this.name = 'ConfigError'; this.status = 400; }
}
const defaultsFor = (name, title, subtitle) => ({
  title: {enabled: true, text: title},
  subtitle: {enabled: false, text: subtitle},
  timer: {enabled: false, mode: name === 'brb' ? 'elapsed' : 'countdown', durationSeconds: 300, label: '', completeText: name === 'starting' ? 'Starting now.' : 'Back shortly.'},
  clock: {enabled: false, showSeconds: false},
  date: {enabled: false, format: 'long'},
  announcement: {enabled: false, text: ''},
  social: {enabled: false, text: ''},
  nextStream: {enabled: false, text: ''},
  layout: {preset: name === 'brb' ? 'lower-left' : 'lower-center', titleSize: 64, titleWidth: name === 'brb' ? 700 : 1100, offsetX: 0, offsetY: 0},
  theme: 'meridian',
  customCss: ''
});
export function defaultConfig() {
  return {
    schemaVersion: 1,
    time: {locale: 'en-US', timeZone: 'UTC', hour12: false},
    audio: {enabled: true, url: 'ws://127.0.0.1:4455', source: '', strength: .65},
    appearance: {ink: '#d9dac0', muted: '#a0a58e'},
    customCss: '',
    scenes: {
      starting: defaultsFor('starting', 'Starting soon.', 'A new orbit begins.'),
      brb: defaultsFor('brb', 'Be right back.', 'Just beyond the event horizon.'),
      goodbye: defaultsFor('goodbye', 'Until next orbit.', 'Thank you for being here.')
    }
  };
}
function fail(path, message) { throw new ConfigError(path + ': ' + message); }
function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(path + '.' + key, 'unknown field');
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(path + '.' + key, 'required');
}
function text(value, max, path) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail(path, 'expected text, maximum ' + max + ' characters');
}
function bool(value, path) { if (typeof value !== 'boolean') fail(path, 'expected true or false'); }
function number(value, min, max, path) { if (!Number.isFinite(value) || value < min || value > max) fail(path, 'expected a number between ' + min + ' and ' + max); }
function choice(value, values, path) { if (!values.includes(value)) fail(path, 'expected one of ' + values.join(', ')); }
function widget(value, max, path) { object(value, ['enabled', 'text'], path); bool(value.enabled, path + '.enabled'); text(value.text, max, path + '.text'); }
export function validateConfig(config) {
  object(config, ['schemaVersion', 'time', 'audio', 'appearance', 'customCss', 'scenes'], 'config');
  if (config.schemaVersion !== 1) fail('schemaVersion', 'unsupported configuration version');
  object(config.time, ['locale', 'timeZone', 'hour12'], 'time');
  text(config.time.locale, 50, 'time.locale'); text(config.time.timeZone, 100, 'time.timeZone'); bool(config.time.hour12, 'time.hour12');
  try { new Intl.DateTimeFormat(config.time.locale, {timeZone: config.time.timeZone}).format(); }
  catch { fail('time', 'invalid locale or time zone'); }
  object(config.audio, ['enabled', 'url', 'source', 'strength'], 'audio');
  bool(config.audio.enabled, 'audio.enabled'); text(config.audio.url, 200, 'audio.url'); text(config.audio.source, 200, 'audio.source'); number(config.audio.strength, 0, 1, 'audio.strength');
  let url; try { url = new URL(config.audio.url); } catch { fail('audio.url', 'invalid WebSocket URL'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname))
    fail('audio.url', 'use a loopback ws:// or wss:// endpoint without credentials, query or path');
  object(config.appearance, ['ink', 'muted'], 'appearance');
  for (const key of ['ink', 'muted']) if (!/^#[0-9a-f]{6}$/i.test(config.appearance[key])) fail('appearance.' + key, 'expected a six-digit hex color');
  text(config.customCss, 32768, 'customCss');
  object(config.scenes, SCENES, 'scenes');
  for (const name of SCENES) {
    const s = config.scenes[name], path = 'scenes.' + name;
    object(s, ['title', 'subtitle', 'timer', 'clock', 'date', 'announcement', 'social', 'nextStream', 'layout', 'theme', 'customCss'], path);
    widget(s.title, 160, path + '.title'); widget(s.subtitle, 320, path + '.subtitle');
    for (const key of ['announcement', 'social', 'nextStream']) widget(s[key], 320, path + '.' + key);
    object(s.timer, ['enabled', 'mode', 'durationSeconds', 'label', 'completeText'], path + '.timer');
    bool(s.timer.enabled, path + '.timer.enabled'); choice(s.timer.mode, ['countdown', 'elapsed'], path + '.timer.mode');
    number(s.timer.durationSeconds, 1, 86400, path + '.timer.durationSeconds');
    if (!Number.isInteger(s.timer.durationSeconds)) fail(path + '.timer.durationSeconds', 'expected whole seconds');
    text(s.timer.label, 100, path + '.timer.label'); text(s.timer.completeText, 160, path + '.timer.completeText');
    object(s.clock, ['enabled', 'showSeconds'], path + '.clock'); bool(s.clock.enabled, path + '.clock.enabled'); bool(s.clock.showSeconds, path + '.clock.showSeconds');
    object(s.date, ['enabled', 'format'], path + '.date'); bool(s.date.enabled, path + '.date.enabled'); choice(s.date.format, ['short', 'long'], path + '.date.format');
    object(s.layout, ['preset', 'titleSize', 'titleWidth', 'offsetX', 'offsetY'], path + '.layout');
    choice(s.layout.preset, ['lower-center', 'lower-left', 'lower-right', 'upper-left', 'upper-right'], path + '.layout.preset');
    number(s.layout.titleSize, 24, 160, path + '.layout.titleSize'); number(s.layout.titleWidth, 240, 1728, path + '.layout.titleWidth');
    number(s.layout.offsetX, -1728, 1728, path + '.layout.offsetX'); number(s.layout.offsetY, -972, 972, path + '.layout.offsetY');
    choice(s.theme, ['meridian', 'plate'], path + '.theme'); text(s.customCss, 32768, path + '.customCss');
  }
  return structuredClone(config);
}
