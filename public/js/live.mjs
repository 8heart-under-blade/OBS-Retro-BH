export function liveConnection({onState = () => {}, onAudio = () => {}, onAudioInfo = () => {}, onStatus = () => {}} = {}) {
  let revision = -1; const controller = new AbortController();
  const receive = state => { if (state.revision < revision) return; revision = state.revision; onState(state); };
  fetch('/api/state', {signal: controller.signal}).then(r => { if (!r.ok) throw new Error('State unavailable'); return r.json(); }).then(receive).catch(error => { if (error.name !== 'AbortError') onStatus('offline'); });
  const events = new EventSource('/api/events');
  events.addEventListener('state', event => { try { receive(JSON.parse(event.data)); } catch { onStatus('invalid'); } });
  events.addEventListener('audio', event => { try { onAudio(JSON.parse(event.data)); } catch {} });
  events.addEventListener('audio-info', event => { try { onAudioInfo(JSON.parse(event.data)); } catch {} });
  events.onopen = () => onStatus('online'); events.onerror = () => onStatus('offline');
  return {close() { controller.abort(); events.close(); }};
}
export class LocalAPI {
  async request(path, body, method = 'POST', retry = true) {
    if (!this.token) { const session = await fetch('/api/session'); if (!session.ok) throw new Error('Cannot open local configuration session'); this.token = (await session.json()).writeToken; }
    const response = await fetch(path, {method, headers: {'Content-Type': 'application/json', 'X-Config-Token': this.token}, body: JSON.stringify(body)});
    if (response.status === 403 && retry) { this.token = null; return this.request(path, body, method, false); }
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || 'Request failed'); error.status = response.status; error.revision = result.revision; throw error; }
    return result;
  }
}
export class RemoteAudio {
  constructor() { this.value = {level: 0, swell: 0, accent: 0}; this.received = -Infinity; }
  ingest(value) {
    this.value = Object.fromEntries(['level', 'swell', 'accent'].map(key => [key, Math.max(0, Math.min(1, Number(value[key]) || 0))]));
    this.received = performance.now() / 1000;
  }
  step(dt, now) {
    if (now - this.received > .5) for (const key of Object.keys(this.value)) this.value[key] *= Math.exp(-dt / .7);
    return {...this.value};
  }
}
