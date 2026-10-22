import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

test('actual browser notification denial/unsupported states cause no enrollment and deep links require current auth',async()=>{
 const event='aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{Notifications}from'./apps/pwa/src/Notifications';globalThis.targets=[];globalThis.authFailures=[];const access={origin:location.origin,token:async()=>globalThis.session==='signed-out'?Promise.reject(Error('signed_out')):globalThis.session==='other'?'synthetic-other':'synthetic-owner',authFailure:code=>globalThis.authFailures.push(code)};createRoot(document.getElementById('root')).render(React.createElement(Notifications,{access,thai:false,onTarget:value=>globalThis.targets.push(value)}));`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 const requests=[];const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/notifications')){requests.push({method:req.method,path:req.url,owner:req.headers.authorization==='Bearer synthetic-owner'});res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.headers.authorization!=='Bearer synthetic-owner'){res.statusCode=403;res.end('{"error":"access_denied"}');}else if(req.url==='/api/notifications/'+event)res.end(JSON.stringify({kind:'payment',id:'opaque-synthetic-payment'}));else res.end(JSON.stringify({items:[{eventId:event,type:'payment.posted',state:'uncertain'}],nextCursor:null}));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></body></html>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});const base=`http://127.0.0.1:${server.address().port}`;
  const denied=await browser.newContext();await denied.addInitScript(()=>{Notification.requestPermission=async()=> 'denied';});const p=await denied.newPage();await p.goto(base);await p.getByText('Notifications',{exact:true}).click();await p.getByRole('button',{name:'Enable on this device'}).click();await p.getByRole('status').filter({hasText:'Notifications remain off.'}).waitFor();assert.equal(requests.length,0);await denied.close();
  const unsupported=await browser.newContext();await unsupported.addInitScript(()=>{delete globalThis.PushManager;});const u=await unsupported.newPage();await u.goto(base);await u.getByText('Notifications',{exact:true}).click();await u.getByRole('button',{name:'Enable on this device'}).click();await u.getByRole('status').filter({hasText:'Push notifications are unavailable in this browser.'}).waitFor();assert.equal(requests.length,0);await unsupported.close();
  const signedOut=await browser.newContext();await signedOut.addInitScript(()=>{globalThis.session='signed-out';});const o=await signedOut.newPage();await o.goto(base+'/?notification='+event);await o.getByText('Notifications',{exact:true}).click();await o.getByRole('status').filter({hasText:'Sign in with an authorized account'}).waitFor();assert.deepEqual(await o.evaluate(()=>globalThis.targets),[]);assert.equal(requests.length,0);await signedOut.close();
  const wrong=await browser.newContext();await wrong.addInitScript(()=>{globalThis.session='other';});const w=await wrong.newPage();await w.goto(base+'/?notification='+event);await w.getByText('Notifications',{exact:true}).click();await w.getByRole('status').filter({hasText:'Sign in with an authorized account'}).waitFor();assert.deepEqual(await w.evaluate(()=>globalThis.targets),[]);assert.deepEqual(await w.evaluate(()=>globalThis.authFailures),[403]);await wrong.close();
  const valid=await browser.newContext();const v=await valid.newPage();await v.goto(base+'/?notification='+event);await v.waitForFunction(()=>globalThis.targets.length===1);assert.deepEqual(await v.evaluate(()=>globalThis.targets),[{kind:'payment',id:'opaque-synthetic-payment'}]);await v.getByText('Notifications',{exact:true}).click();await v.getByRole('button',{name:'Notification history'}).click();await v.getByRole('button',{name:/MW Credit.*New activity.*Not confirmed/}).waitFor();await valid.close();
  assert.ok(requests.every(r=>r.method==='GET'));assert.equal(requests.filter(r=>r.owner).length,2);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
