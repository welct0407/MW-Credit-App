import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

test('actual Chromium IndexedDB isolates environments and users and fences stale tab writes after purge',async()=>{
 const bundled=await build({stdin:{contents:"import {ownerOfflineRepository} from './apps/pwa/src/owner-offline';globalThis.testRepository=ownerOfflineRepository;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env':'{"MODE":"live-prod"}'}});
 let posts=0;const server=http.createServer((req,res)=>{if(req.method!=='GET')posts++;res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width"><body><script>'+bundled.outputFiles[0].text+'</script></body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext();const one=await context.newPage(),two=await context.newPage();const url=`http://127.0.0.1:${server.address().port}`;await one.goto(url);await two.goto(url);
  const result=await one.evaluate(async()=>{
   const repo=globalThis.testRepository,issuer='https://securetoken.google.com/clever-oasis-508610-n7';
   const dev=repo({issuer,uid:'same-user'},'dev'),prod=repo({issuer,uid:'same-user'},'prod'),other=repo({issuer,uid:'other-user'},'prod');
   globalThis.prodRepo=prod;await dev.saveDraft('same-id',{note:'DEV only'});await prod.saveDraft('same-id',{note:'PROD only'});await other.saveDraft('same-id',{note:'other user only'});
   await prod.savePending('same-request',{requestId:'immutable',value:'original'});let mutationDenied=false;try{await prod.savePending('same-request',{requestId:'immutable',value:'mutated'});}catch{mutationDenied=true;}
   const defaults=repo({issuer,uid:'compile-default'});await defaults.saveDraft('default',{note:'compiled PROD'});
   return{dev:(await dev.draft('same-id')).value,prod:(await prod.draft('same-id')).value,other:(await other.draft('same-id')).value,pending:(await prod.pending('same-request')).value,mutationDenied,names:(await indexedDB.databases()).map(v=>v.name)};
  });
  assert.deepEqual(result.dev,{note:'DEV only'});assert.deepEqual(result.prod,{note:'PROD only'});assert.deepEqual(result.other,{note:'other user only'});assert.equal(result.mutationDenied,true);assert.deepEqual(result.pending,{requestId:'immutable',value:'original'});
  assert.ok(result.names.some(v=>v.startsWith('mw-credit-prod-owner:')&&v.endsWith(':compile-default')));assert.ok(result.names.some(v=>v.startsWith('mw-credit-dev-owner:')&&v.endsWith(':same-user')));
  await two.evaluate(async()=>{globalThis.staleRepo=globalThis.testRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'same-user'},'prod');await globalThis.staleRepo.list('draft');});
  await one.evaluate(()=>globalThis.prodRepo.purge());
  const fenced=await two.evaluate(async()=>{let denied=false;try{await globalThis.staleRepo.saveDraft('late',{note:'must not resurrect'});}catch{denied=true;}return{denied,rows:await globalThis.staleRepo.list('draft')};});assert.equal(fenced.denied,true);assert.deepEqual(fenced.rows,[]);
  const preserved=await one.evaluate(async()=>{const repo=globalThis.testRepository,id={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'same-user'};const fresh=repo(id,'prod');await fresh.saveDraft('fresh',{note:'new authorized session'});return{dev:(await repo(id,'dev').draft('same-id')).value,prod:(await fresh.list('draft')).map(r=>r.value),pending:await fresh.list('pending'),other:(await repo({...id,uid:'other-user'},'prod').draft('same-id')).value};});
  assert.deepEqual(preserved,{dev:{note:'DEV only'},prod:[{note:'new authorized session'}],pending:[],other:{note:'other user only'}});assert.equal(posts,0);
  await context.close();
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
