// Real-time headless Chrome smoke runner (workers must not race a virtual clock).
const {spawn}=require('node:child_process');const path=require('node:path');
const server=spawn(process.execPath,[path.join(__dirname,'serve.cjs')],{env:{...process.env,PORT:'0'}});
let chrome,socket,mock,finished=false;
const timeout=setTimeout(()=>finish('FAIL: browser smoke timeout'),30000);
function finish(result){if(finished)return;finished=true;clearTimeout(timeout);console.log(result);process.exitCode=result.startsWith('PASS:')?0:1;if(socket)socket.close();if(chrome)chrome.kill();if(mock)mock.kill();server.kill();}
server.on('error',e=>finish('FAIL: '+e.message));
server.stderr.on('data',d=>process.stderr.write(d));
server.stdout.once('data',async data=>{
try{
const base=String(data).match(/http:\/\/127\.0\.0\.1:\d+/)[0];
let page=process.argv[2]||'smoke.html';
if(page==='audio-smoke.html'){
  mock=spawn(process.execPath,[path.join(__dirname,'mock-obs.cjs')]);
  const endpoint=await new Promise((resolve,reject)=>{mock.stdout.once('data',d=>resolve(String(d).trim()));mock.on('error',reject);});
  page+='?mock='+encodeURIComponent(endpoint);
}
chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(__dirname,'../research/chrome-smoke-profile'),'about:blank']);
chrome.on('error',e=>finish('FAIL: '+e.message));
let buffer='';const address=await new Promise(resolve=>{chrome.stderr.on('data',d=>{buffer+=d;const m=buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});});
socket=new WebSocket(address);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map();
socket.onmessage=event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(new Error(m.error.message));else resolve(m.result);}};
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,sessionId}));});}
const {targetId}=await send('Target.createTarget',{url:base+'/'+page});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
for(let attempt=0;attempt<240&&!finished;attempt++){
const r=await send('Runtime.evaluate',{expression:"document.querySelector('#result')?.textContent",returnByValue:true},sessionId);
const value=r.result?.value;if(typeof value==='string'&&/^(PASS|FAIL):/.test(value)){await send('Target.closeTarget',{targetId});finish(value);return;}
await new Promise(resolve=>setTimeout(resolve,100));
}
finish('FAIL: page never completed');
}catch(e){finish('FAIL: '+e.message);}
});
