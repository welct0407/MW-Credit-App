import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticHostname,createRejectedHostCapture} from '../dist/callback-host-diagnostic.js';
import {application,authorize,tokenExchange,mcpRequest,subscription} from './helpers.mjs';

const filters=()=>({alert_names:['MW Grafana Bridge Synthetic Test'],statuses:['firing','resolved']});
function capture(t) {
  const rows=[],write=process.stdout.write.bind(process.stdout);
  t.mock.method(process.stdout,'write',(chunk,...args)=>{
    if(typeof chunk==='string' && chunk.startsWith('{"event":')){rows.push(JSON.parse(chunk));return true;}
    return write(chunk,...args);
  });return rows;
}
test('strict hostname extraction drops path/query and skips malformed, encoded, credential-like and non-DNS authorities',()=>{
  assert.equal(diagnosticHostname('https://CALLBACKS.Example:443/sentinel-secret/path?token=sentinel-private-token'),'callbacks.example');
  const label='host-'.repeat(12)+'abc',long=[label,label,label,'host-'.repeat(11)+'ab','com'].join('.');
  assert.equal(long.length,253);assert.equal(diagnosticHostname('https://'+long+'/'),long);
  for(const url of [null,{},'not a URL','http://callbacks.example/path','https://user:sentinel-secret@callbacks.example/path',
    'https://callbacks.example/path#sentinel-secret','https://callbacks.example:444/path','https://callbacks.example./',
    'https://callbacks..example/','https://-callbacks.example/','https://callbacks-.example/','https://callbacks_example/',
    'https://%63allbacks.example/','https://xn--opaque.example/','https://callbacké.example/','https://callbacks.example\\@other.example/',
    'https://callbacks.example/\nprivate','https://127.0.0.1/','https://127.1/','https://[::1]/','https://localhost/',
    'https://sentinel-secret.example/','https://token-value.example/','https://whsec-private.example/','https://sk-private.example/',
    'https://eyJhbGciOiJSUzI1NiJ9.example/','https://aabbccddeeff0011.example/','https://123456789012.example/',
    'https://prefix-'+'g'.repeat(24)+'.example/','https://12345678-abcd-abcd-abcd-123456789abc.example/',
    'https://'+'x'.repeat(64)+'.example/','https://x.'+long+'/', 'https://callbacks.example/'+ 'x'.repeat(2048)])
    assert.equal(diagnosticHostname(url),undefined,String(url));
});
test('capture is opt-in, exact synthetic-only, capped and never records payload values',t=>{
  const rows=capture(t),url='https://callbacks.example/sentinel-path?token=sentinel-secret';
  const observe=createRejectedHostCapture(true);
  for(const args of [{}, {...filters(),components:[]},{...filters(),alert_names:['other']},{...filters(),statuses:['firing']},
    {...filters(),alert_names:['MW Grafana Bridge Synthetic Test','MW Grafana Bridge Synthetic Test']},{...filters(),statuses:['firing','firing']}])observe(args,url);
  createRejectedHostCapture(false)(filters(),url);assert.equal(rows.length,0);
  observe(filters(),'https://sentinel-secret.example/private');assert.equal(rows.length,0);
  observe(filters(),url);observe(filters(),'https://second.example/private');
  assert.deepEqual(rows,[{event:'callback_host_rejected',hostname:'callbacks.example'}]);
  assert.equal(JSON.stringify(rows).includes('sentinel'),false);
});
test('logger failure does not throw or expand capture scope',t=>{
  let calls=0;t.mock.method(process.stdout,'write',()=>{calls++;throw new Error('sentinel-logger-secret');});
  const observe=createRejectedHostCapture(true);
  assert.doesNotThrow(()=>observe(filters(),'https://callbacks.example/private'));
  assert.doesNotThrow(()=>observe(filters(),'https://second.example/private'));assert.equal(calls,1);
});
test('owner-authenticated synthetic rejection captures hostname while preserving -32015, no sends and no subscription writes',async t=>{
  const rows=capture(t);let sends=0,writes=0,subscriptionReads=0;
  const app=await application({config:{captureRejectedCallbackHost:true,callbackHosts:[]},send:async()=>{sends++;throw new Error('must not send');}});t.after(()=>app.close());
  const params=subscription('whsec_c2VudGluZWwtc2VjcmV0LW9ubHktMzJjaGFyYWN0ZXJz',filters());
  params.delivery.url='https://callbacks.example/sentinel-private-path?token=sentinel-private-token';
  assert.equal((await mcpRequest(app,'events/subscribe',params,'sentinel-invalid-token')).status,401);
  assert.equal(rows.some(r=>r.event==='callback_host_rejected'),false);
  const grant=await authorize(app),token=(await tokenExchange(app,grant.code,grant.verifier)).json().access_token;
  const get=app.store.get.bind(app.store),atomic=app.store.atomic.bind(app.store);
  t.mock.method(app.store,'get',async path=>{if(path.startsWith('subscriptions/') || path.startsWith('subscriptionControls/'))subscriptionReads++;return get(path);});
  t.mock.method(app.store,'atomic',async fn=>atomic(async tx=>{
    const originalGet=tx.get.bind(tx),originalSet=tx.set.bind(tx);
    tx.get=async path=>{if(path.startsWith('subscriptions/') || path.startsWith('subscriptionControls/'))subscriptionReads++;return originalGet(path);};
    tx.set=(path,value)=>{if(path.startsWith('subscriptions/') || path.startsWith('subscriptionControls/') || path==='indexes/subscriptions')writes++;return originalSet(path,value);};
    return fn(tx);
  }));
  const response=await mcpRequest(app,'events/subscribe',params,token);
  assert.equal(response.status,200);assert.equal(response.json().error.code,-32015);assert.equal(response.json().error.message,'callback_not_allowed');
  assert.equal(sends,0);assert.equal(writes,0);assert.equal(subscriptionReads,0);
  const again=await mcpRequest(app,'events/subscribe',params,token);assert.equal(again.json().error.code,-32015);
  const unsubscribe=await mcpRequest(app,'events/unsubscribe',{name:params.name,arguments:params.arguments,delivery:{mode:'webhook',url:params.delivery.url}},token);assert.equal(unsubscribe.json().error.code,-32015);
  assert.deepEqual(rows.filter(r=>r.event==='callback_host_rejected'),[{event:'callback_host_rejected',hostname:'callbacks.example'}]);
  assert.equal(writes,0);assert.equal(subscriptionReads,0);
  for(const sentinel of ['sentinel-',token,grant.code,app.conf.ownerSub,app.conf.ownerEmail,app.conf.clientId,'whsec_'])assert.equal(JSON.stringify(rows).includes(sentinel),false);
});
test('nonsynthetic and owner-disabled calls never capture, and a nonempty allowlist disables observation',async t=>{
  const rows=capture(t),app=await application({config:{captureRejectedCallbackHost:true,callbackHosts:[]}});t.after(()=>app.close());
  const grant=await authorize(app),token=(await tokenExchange(app,grant.code,grant.verifier)).json().access_token;
  assert.equal((await mcpRequest(app,'events/subscribe',subscription(),token)).json().error.code,-32015);
  await app.store.atomic(async tx=>tx.set('control/owner',{enabled:false}));
  assert.equal((await mcpRequest(app,'events/subscribe',subscription(undefined,filters()),token)).status,401);
  assert.equal(rows.some(r=>r.event==='callback_host_rejected'),false);
  const allowed=await application({config:{captureRejectedCallbackHost:true,callbackHosts:['callbacks.example']}});t.after(()=>allowed.close());
  const auth=await authorize(allowed),issued=(await tokenExchange(allowed,auth.code,auth.verifier)).json().access_token;
  const denied=subscription(undefined,filters());denied.delivery.url='https://other.example/private';
  assert.equal((await mcpRequest(allowed,'events/subscribe',denied,issued)).json().error.code,-32015);
  assert.equal(rows.some(r=>r.event==='callback_host_rejected'),false);
});
