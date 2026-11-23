import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile, stat, realpath} from 'node:fs/promises';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {ConfigStore} from './store.mjs';
import {AudioBridge} from './obs-bridge.mjs';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8'};
function dated(state) { return {...state, serverNow: Date.now()}; }
function json(response, code, body) { response.writeHead(code, {'Content-Type': 'application/json; charset=utf-8'}); response.end(JSON.stringify(body)); }
function securityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
}
async function readJson(request) {
  if ((request.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') { const error = new Error('Use application/json'); error.status = 415; throw error; }
  if (Number(request.headers['content-length']) > 262144) { request.resume(); const error = new Error('Configuration exceeds 256 KB'); error.status = 413; throw error; }
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 262144) { const error = new Error('Configuration exceeds 256 KB'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('Malformed JSON'); error.status = 400; throw error; }
}
export async function createApp({stateFile = path.join(projectRoot, '.local/state.json'), publicDir = path.join(projectRoot, 'public'), heartbeatMs = 15000, enableAudio = true, initialAudioEnabled = true} = {}) {
  const publicRoot = await realpath(publicDir);
  const store = await new ConfigStore(stateFile).init({initialAudioEnabled}), token = randomBytes(32).toString('hex'), streams = new Set();
  const bridge = new AudioBridge({enabled: enableAudio});
  const broadcast = (event, data) => {
    const message = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
    for (const response of streams) if (!response.write(message)) response.destroy();
  };
  const notify = snapshot => { bridge.configure(snapshot.config.audio); broadcast('state', dated(snapshot)); };
  store.on('change', notify); bridge.on('audio', data => broadcast('audio', data)); bridge.on('info', data => broadcast('audio-info', data));
  bridge.configure(store.snapshot().config.audio);
  const server = http.createServer(async (request, response) => {
    securityHeaders(response);
    try {
      const port = server.address().port;
      const hosts = new Set(['127.0.0.1:' + port, 'localhost:' + port, '[::1]:' + port]);
      if (!hosts.has(request.headers.host)) { json(response, 403, {error: 'Loopback Host required'}); return; }
      if (request.headers.origin && !new Set([...hosts].map(host => 'http://' + host)).has(request.headers.origin)) { json(response, 403, {error: 'Same-origin request required'}); return; }
      const url = new URL(request.url, 'http://' + request.headers.host);
      if (request.method === 'GET' && url.pathname === '/api/session') { json(response, 200, {writeToken: token}); return; }
      if (request.method === 'GET' && url.pathname === '/api/audio') { json(response, 200, bridge.info); return; }
      if (request.method === 'GET' && url.pathname === '/api/state') { json(response, 200, dated(store.snapshot())); return; }
      if (request.method === 'GET' && url.pathname === '/api/events') {
        response.writeHead(200, {'Content-Type': 'text/event-stream', Connection: 'keep-alive'});
        response.write('retry: 1500\n\nevent: state\ndata: ' + JSON.stringify(dated(store.snapshot())) + '\n\nevent: audio-info\ndata: ' + JSON.stringify(bridge.info) + '\n\n'); streams.add(response);
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), heartbeatMs); heartbeat.unref();
        response.on('close', () => { clearInterval(heartbeat); streams.delete(response); }); return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/config' || request.method === 'POST' && (url.pathname.startsWith('/api/timers/') || url.pathname === '/api/audio/connect')) {
        const candidate = Buffer.from(request.headers['x-config-token'] || '');
        const expected = Buffer.from(token);
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) { json(response, 403, {error: 'Local configuration token required'}); return; }
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) { json(response, 400, {error: 'Expected an object'}); return; }
        if (url.pathname === '/api/audio/connect') {
          if (typeof body.password !== 'string' || body.password.length > 1000) { json(response, 400, {error: 'Expected a password string'}); return; }
          bridge.reconnect(body.password); json(response, 200, {status: 'CONNECTING TO OBS'}); return;
        }
        if (request.method === 'PUT') { json(response, 200, dated(await store.update(body.config, body.revision))); return; }
        const match = url.pathname.match(/^\/api\/timers\/(starting|brb|goodbye)\/(start|pause|resume|reset)$/);
        if (!match) { json(response, 404, {error: 'Unknown timer action'}); return; }
        json(response, 200, dated(await store.timer(match[1], match[2], body.revision))); return;
      }
      if (url.pathname.startsWith('/api/')) { json(response, 404, {error: 'Unknown API route'}); return; }
      if (!['GET', 'HEAD'].includes(request.method)) { json(response, 405, {error: 'Method not allowed'}); return; }
      let name; try { name = decodeURIComponent(url.pathname); } catch { json(response, 400, {error: 'Invalid path encoding'}); return; }
      if (name === '/') name = '/config.html';
      if (name === '/config') name = '/config.html';
      if (/^\/scene\/(starting|brb|goodbye)$/.test(name)) name = '/scene.html';
      const filename = path.resolve(publicDir, '.' + name);
      if (!filename.startsWith(path.resolve(publicDir) + path.sep)) { json(response, 403, {error: 'Invalid path'}); return; }
      let data;
      try { const resolved = await realpath(filename); if (!resolved.startsWith(publicRoot + path.sep)) { json(response, 403, {error: 'Invalid public path'}); return; } if (!(await stat(resolved)).isFile()) throw new Error('Not a file'); data = await readFile(resolved); }
      catch (error) { if (error.code === 'EACCES') throw error; json(response, 404, {error: 'Not found'}); return; }
      if(name.startsWith('/fonts/')||name.startsWith('/celestial/assets/'))response.setHeader('Cache-Control','public, max-age=3600');
      response.writeHead(200, {'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream', 'Content-Length': data.length});
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) { json(response, error.status || 500, {error: error.status ? error.message : 'Local server error', ...(error.revision !== undefined ? {revision: error.revision} : {})}); }
  });
  const close = async () => { bridge.destroy(); store.off('change', notify); for (const stream of streams) stream.end(); streams.clear(); server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); };
  return {server, store, bridge, close};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp(), port = Number(process.env.PORT || 8090);
  app.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  app.server.listen(port, '127.0.0.1', () => console.log('OBS Retro-BH main project: http://127.0.0.1:' + app.server.address().port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
