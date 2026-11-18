(function(root){
'use strict';
function mount(scene,params){
  const $=id=>document.getElementById(id),panel=$('audio-panel');
  const meter=new root.CelestialAudio.Meter({source:params.get('source')||'',strength:.65});
  let client=null,demoSource=null;
  $('audio-mode').value=['off','demo'].includes(params.get('audio'))?params.get('audio'):'obs';
  $('audio-url').value=params.get('obsws')||'ws://127.0.0.1:4445';$('audio-source').value=meter.source;
  const status=message=>{$('audio-state').textContent=message;$('audio-open').textContent=message==='LIVE OBS AUDIO'?'AUDIO ●':message==='VISUAL DEMO — NOT LIVE AUDIO'?'AUDIO DEMO':'AUDIO';};
  function apply(){
    if(client){client.destroy();client=null;}demoSource=null;
    meter.source=$('audio-source').value.trim();meter.strength=Number($('audio-strength').value);meter.silence();
    const mode=$('audio-mode').value;
    if(mode==='demo'){
      demoSource=root.CelestialAudio.demo();scene.setAudioSource({step(dt){const a=demoSource.step(dt),gain=meter.strength/.65;return{level:a.level*gain,swell:a.swell*gain,accent:a.accent*gain};}});
      status('VISUAL DEMO — NOT LIVE AUDIO');
    }else{
      scene.setAudioSource(meter);
      if(mode==='off'){status('AUDIO OFF');return;}
      try{
        client=new root.CelestialAudio.OBSMeters({url:$('audio-url').value.trim(),password:$('audio-password').value,meter,onStatus:status,onSources:names=>{
          $('audio-sources').replaceChildren(...names.map(name=>{const option=document.createElement('option');option.value=name;return option;}));
        }});
        $('audio-password').value='';client.connect();
      }catch{status('INVALID OBS WEBSOCKET ADDRESS');}
    }
  }
  const open=()=>{if(!panel.open)panel.showModal();};
  const key=event=>{if(event.key.toLowerCase()==='a'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)){event.preventDefault();open();}};
  $('audio-open').onclick=open;$('audio-close').onclick=()=>panel.close();$('audio-apply').onclick=apply;
  $('audio-strength').oninput=()=>{meter.strength=Number($('audio-strength').value);};
  $('audio-source').onchange=()=>{meter.source=$('audio-source').value.trim();meter.silence();};
  document.addEventListener('keydown',key);
  const timer=setInterval(()=>{if(panel.open)$('audio-meter').value=scene.audio.level;},200);
  apply();
  return {destroy(){if(client)client.destroy();clearInterval(timer);document.removeEventListener('keydown',key);panel.close();}};
}
root.CelestialAudioUI={mount};
})(window);
