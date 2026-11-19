/* Read-only obs-websocket v5 audio meters. No audio recording or OBS control requests. */
(function(root){
'use strict';
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
function normalized(multiplier){return multiplier>0?clamp((20*Math.log10(multiplier)+50)/44):0;}
function levels(inputs,source=''){
  let rms=0,peak=0;
  for(const input of Array.isArray(inputs)?inputs:[]){
    if(!input||typeof input!=='object')continue;
    if(source&&input.inputName!==source&&input.inputUuid!==source)continue;
    for(const channel of Array.isArray(input.inputLevelsMul)?input.inputLevelsMul:[]){
      if(!Array.isArray(channel))continue;
      rms=Math.max(rms,clamp(channel[0]));peak=Math.max(peak,clamp(channel[1]));
    }
  }
  return {rms:normalized(rms),peak:normalized(peak)};
}
class Meter {
  constructor({source='',strength=.65}={}){this.source=source;this.strength=strength;this.reset();}
  reset(){this.raw=0;this.peak=0;this.received=-Infinity;this.level=0;this.swell=0;this.accent=0;}
  ingest(inputs,now){const value=levels(inputs,this.source);this.raw=value.rms;this.peak=value.peak;this.received=now;}
  silence(){this.raw=0;this.peak=0;this.received=-Infinity;}
  step(dt,now){
    dt=Math.max(0,Math.min(.1,dt));const stale=now-this.received>.4;
    const target=stale?0:this.raw;
    const ease=(a,b,t)=>a+(b-a)*(1-Math.exp(-dt/t));
    this.level=ease(this.level,target,target>this.level?.20:.85);
    this.swell=ease(this.swell,this.level,1.6);
    const transient=stale?0:clamp((this.peak-this.swell-.12)*1.6);
    this.accent=ease(this.accent,transient,transient>this.accent?.16:.9);
    const strength=clamp(this.strength);
    return {level:this.level*strength,swell:this.swell*strength,accent:this.accent*strength};
  }
}
async function authentication(password,salt,challenge){
  const hash=async text=>{const bytes=new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return btoa(String.fromCharCode(...bytes));};
  return hash(await hash(password+salt)+challenge);
}
class OBSMeters {
  constructor({url='ws://127.0.0.1:4455',password='',meter=new Meter(),onStatus=()=>{},onSources=()=>{},WebSocketClass=root.WebSocket}={}){
    const parsed=new URL(url);if(!['ws:','wss:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Use a ws:// or wss:// URL without credentials');
    this.url=url;this.password=password;this.meter=meter;this.onStatus=onStatus;this.onSources=onSources;this.WebSocketClass=WebSocketClass;this.stopped=true;this.retry=0;
  }
  connect(){this.disconnect(false);this.stopped=false;this.open();}
  status(message){this.onStatus(message);}
  open(){
    if(this.stopped)return;
    this.status('CONNECTING TO OBS');let socket;
    try{socket=new this.WebSocketClass(this.url);}catch{this.schedule();return;}
    this.socket=socket;this.identified=false;
    const timeout=setTimeout(()=>{if(this.socket===socket)socket.close();},8000);
    socket.onmessage=async event=>{
      if(this.socket!==socket||this.stopped)return;
      try{
        const msg=JSON.parse(event.data),d=msg.d||{};
        if(msg.op===0){
          const identify={rpcVersion:1,eventSubscriptions:1<<16};
          if(d.authentication){
            if(!this.password){this.stopped=true;this.status('PASSWORD REQUIRED — OPEN AUDIO SETTINGS');socket.close();return;}
            identify.authentication=await authentication(this.password,d.authentication.salt,d.authentication.challenge);
          }
          if(this.socket===socket&&!this.stopped)socket.send(JSON.stringify({op:1,d:identify}));
        }else if(msg.op===2){clearTimeout(timeout);this.identified=true;this.retry=0;this.status('LIVE OBS AUDIO');}
        else if(msg.op===5&&this.identified&&d.eventType==='InputVolumeMeters'){
          const inputs=Array.isArray(d.eventData?.inputs)?d.eventData.inputs:[];
          this.meter.ingest(inputs,performance.now()/1000);
          const names=inputs.map(i=>i?.inputName).filter(n=>typeof n==='string');
          const key=names.join('\n');if(key!==this.names){this.names=key;this.onSources(names);}
        }
      }catch{this.stopped=true;this.meter.silence();this.status('OBS PROTOCOL/AUTH ERROR');socket.close();}
    };
    socket.onerror=()=>{if(this.socket===socket)this.status('OBS UNAVAILABLE');};
    socket.onclose=event=>{
      clearTimeout(timeout);if(this.socket!==socket)return;this.socket=null;this.meter.silence();
      if(this.stopped)return;
      if([4009,4010,4011].includes(event.code)){this.stopped=true;this.status(event.code===4009?'AUTHENTICATION FAILED':'OBS SESSION STOPPED');return;}
      this.schedule();
    };
  }
  schedule(){if(this.stopped)return;const delay=Math.min(10000,1000*2**this.retry++);this.status('OBS OFFLINE — RETRYING');this.timer=setTimeout(()=>this.open(),delay);}
  disconnect(report=true){this.stopped=true;clearTimeout(this.timer);if(this.socket){const socket=this.socket;this.socket=null;socket.close();}this.meter.silence();if(report)this.status('AUDIO OFF');}
  destroy(){this.disconnect(false);this.password='';}
}
function demo(){let time=0;return {step(dt){time+=dt;const pulse=(.5+.5*Math.sin(time*TAU*.65))**4;return {level:.18+.35*pulse,swell:.3+.12*Math.sin(time*.4),accent:.45*pulse};}};}
const TAU=Math.PI*2,api={Meter,OBSMeters,levels,normalized,authentication,demo};root.CelestialAudio=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
