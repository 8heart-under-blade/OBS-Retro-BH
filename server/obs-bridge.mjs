import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {Meter, OBSMeters} = require('../public/celestial/audio-reactive.js');
export class AudioBridge extends EventEmitter {
  constructor({enabled = true, password = process.env.OBS_PASSWORD || ''} = {}) {
    super(); this.available = enabled; this.password = password;
    this.meter = new Meter(); this.info = {status: enabled ? 'AUDIO OFF' : 'AUDIO DISABLED FOR TEST', sources: []};
    this.values = {level: 0, swell: 0, accent: 0};
    if (enabled) { this.interval = setInterval(() => { this.values = this.meter.step(.05, performance.now() / 1000); this.emit('audio', this.values); }, 50); this.interval.unref(); }
  }
  configure(config, force = false) {
    const previous = this.config; this.config = structuredClone(config);
    this.meter.source = config.source; this.meter.strength = config.strength;
    if (previous?.source !== config.source) this.meter.silence();
    if (!this.available) return;
    if (force || !previous || previous.url !== config.url || previous.enabled !== config.enabled) {
      if (this.client) this.client.destroy();
      if (previous && previous.url !== config.url) this.password = '';
      this.client = null; this.meter.silence();
      if (!config.enabled) { this.setInfo({status: 'AUDIO OFF'}); return; }
      this.client = new OBSMeters({url: config.url, password: this.password, meter: this.meter,
        onStatus: status => this.setInfo({status}),
        onSources: sources => this.setInfo({sources})});
      this.client.connect();
    }
  }
  setInfo(partial) { this.info = {...this.info, ...partial}; this.emit('info', structuredClone(this.info)); }
  reconnect(password) { this.password = password; this.configure(this.config, true); }
  destroy() { clearInterval(this.interval); this.client?.destroy(); this.password = ''; this.meter.reset(); }
}
