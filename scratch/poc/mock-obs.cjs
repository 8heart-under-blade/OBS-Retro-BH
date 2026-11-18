// TEST FIXTURE ONLY. Minimal local OBS v5 meter server; never controls a real OBS instance.
const http=require('node:http'),crypto=require('node:crypto');
const server=http.createServer();
function frame(object){const data=Buffer.from(JSON.stringify(object));if(data.length<126)return Buffer.concat([Buffer.from([0x81,data.length]),data]);const header=Buffer.alloc(4);header[0]=0x81;header[1]=126;header.writeUInt16BE(data.length,2);return Buffer.concat([header,data]);}
server.on('upgrade',(req,socket)=>{
const key=req.headers['sec-websocket-key'];if(!key){socket.destroy();return;}
const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
socket.write(frame({op:0,d:{rpcVersion:1,obsWebSocketVersion:'5.0.0-test'}}));
let buffer=Buffer.alloc(0),timer,step=0;
socket.on('data',data=>{buffer=Buffer.concat([buffer,data]);while(buffer.length>=2){
const opcode=buffer[0]&15;let size=buffer[1]&127,offset=2;const masked=!!(buffer[1]&128);
if(size===126){if(buffer.length<4)return;size=buffer.readUInt16BE(2);offset=4;}if(size===127){socket.destroy();return;}
if(buffer.length<offset+(masked?4:0)+size)return;
const mask=masked?buffer.subarray(offset,offset+4):null;if(masked)offset+=4;
const payload=Buffer.from(buffer.subarray(offset,offset+size));buffer=buffer.subarray(offset+size);
if(mask)for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
if(opcode===8){socket.end();return;}if(opcode!==1)continue;
try{const message=JSON.parse(payload.toString());if(message.op!==1||message.d.eventSubscriptions!==65536||timer){socket.destroy();return;}
socket.write(frame({op:2,d:{negotiatedRpcVersion:1}}));
timer=setInterval(()=>{const level=.05+.2*(.5+.5*Math.sin(step++*.12));socket.write(frame({op:5,d:{eventType:'InputVolumeMeters',eventIntent:65536,eventData:{inputs:[{inputName:'Music',inputUuid:'mock-music',inputLevelsMul:[[level,level*1.3,level*1.4],[level*.9,level*1.2,level*1.5]]},{inputName:'Mic',inputLevelsMul:[[.01,.02,.03]]}]}}}));},50);
}catch{socket.destroy();return;}
}});
socket.on('close',()=>clearInterval(timer));socket.on('error',()=>clearInterval(timer));
});
server.listen(0,'127.0.0.1',()=>console.log('ws://127.0.0.1:'+server.address().port));
