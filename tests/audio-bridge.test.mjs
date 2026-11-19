import {test} from 'node:test'; import assert from 'node:assert/strict';
import {AudioBridge} from '../server/obs-bridge.mjs';
test('audio bridge keeps configuration metadata free of credentials and applies shared input settings', () => {
  const bridge = new AudioBridge({enabled: false, password: 'test-session-only'});
  try { bridge.configure({enabled: true, url: 'ws://127.0.0.1:4455', source: 'Music', strength: .4}); assert.equal(bridge.meter.source, 'Music'); assert.equal(bridge.meter.strength, .4); assert.equal(bridge.client, undefined); assert.ok(!JSON.stringify(bridge.info).includes('test-session-only')); }
  finally { bridge.destroy(); assert.equal(bridge.password, ''); }
});
