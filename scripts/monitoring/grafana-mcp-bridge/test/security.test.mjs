import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyGrafana,publicAddress,safeCallback,logEvent} from '../dist/security.js';
import {config} from './helpers.mjs';

test('Grafana raw-body HMAC validates both rotation keys and rejects tampering, stale/future timestamps',()=>{
  const raw=Buffer.from('{"text":"\u0e01"}'),ts='1790942400',key='synthetic-secret';
  const signature=createHmac('sha256',key).update(ts+':').update(raw).digest('hex'),now=Number(ts)*1000;
  assert.doesNotThrow(()=>verifyGrafana(raw,ts,signature,['previous',key],now));
  for(const [b,t,s,n] of [[Buffer.from('{}'),ts,signature,now],[raw,ts,'bad',now],[raw,ts,signature,now+301000],[raw,ts,signature,now-301000],[raw,ts+'junk',signature,now]])assert.throws(()=>verifyGrafana(b,t,s,[key],n));
});
test('every special-use IPv4/IPv6 address is blocked',()=>{
  for(const address of ['127.0.0.1','10.0.0.1','172.16.1.2','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','192.0.2.1','198.51.100.1','203.0.113.1','::1','::','fc00::1','fe80::1','ff02::1','::ffff:8.8.8.8','2001:db8::1','2002:0808:0808::1'])assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('callback validation pins each fresh DNS result, blocks mixed/private rebinding and redirects',async()=>{
  let dns=0,sends=0;
  const send=safeCallback(['callbacks.example'],async()=>[{address:++dns===1?'8.8.8.8':'127.0.0.1',family:4}],async (url,pinned)=>{assert.equal(url.hostname,'callbacks.example');assert.equal(pinned.address,'8.8.8.8');sends++;return {status:200,body:'{}'};});
  await send('https://callbacks.example/path','{}',{});await assert.rejects(()=>send('https://callbacks.example/path','{}',{}));assert.equal(sends,1);
  for(const url of ['http://callbacks.example','https://user:pass@callbacks.example','https://callbacks.example:444','https://other.example','https://callbacks.example/#frag'])await assert.rejects(()=>send(url,'{}',{}));
  const mixed=safeCallback(['callbacks.example'],async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],async()=>{throw new Error('must not send');});await assert.rejects(()=>mixed('https://callbacks.example','{}',{}));
  const redirect=safeCallback(['callbacks.example'],async()=>[{address:'8.8.8.8',family:4}],async()=>({status:302,body:'redirect'}));await assert.rejects(()=>redirect('https://callbacks.example','{}',{}),/redirect_blocked/);
});
test('structured logger drops sensitive fields rather than printing exceptions',()=>{
  const old=process.stdout.write;let output='';process.stdout.write=(s)=>{output+=s;return true;};
  try{logEvent('test',{status:200,url:'sentinel-secret',token:'sentinel-secret',body:'sentinel-secret'});}finally{process.stdout.write=old;}
  assert.equal(output.includes('sentinel-secret'),false);assert.equal(JSON.parse(output).status,200);
});
