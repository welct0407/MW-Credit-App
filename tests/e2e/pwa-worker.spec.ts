import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {startWorkerFixture} from './fixtures/worker-server';
const prefix='mw-credit-dev-public-';
const allowlist=['/icons/apple-touch-icon.png','/icons/icon-192.png','/icons/icon-512.png','/offline.html'];
const cacheEntries=(page:Page)=>page.evaluate(async()=>Object.fromEntries(await Promise.all((await caches.keys()).map(async name=>[name,(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname).sort()]))));

test('real worker public-only cache, explicit update, failed install and rollback',async({browser},info)=>{
 test.skip(info.project.name.startsWith('mobile'),'Worker lifecycle runs once; responsive application checks run separately');
 const fixture=await startWorkerFixture(resolve('apps/pwa/pwa'));
 const context=await browser.newContext();const page=await context.newPage();
 try{
  await page.goto(fixture.base);await page.evaluate(async()=>{localStorage.setItem('synthetic-auth-marker','preserve');await(await caches.open('unrelated-test-cache')).put('/unrelated',new Response('public unrelated'));await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  expect((await cacheEntries(page))[prefix+'A']).toEqual(allowlist);
  for(const url of ['/api/borrowers','/__/auth/handler','/?code=synthetic'])await page.evaluate(async path=>{await fetch(path,{headers:{Authorization:'Bearer synthetic'}})},url);
  await page.evaluate(async()=>{await fetch('/',{method:'POST',body:'synthetic only'})});
  expect((await cacheEntries(page))[prefix+'A']).toEqual(allowlist);
  fixture.setRootStatus(503);const error=await page.reload();expect(error!.status()).toBe(503);await expect(page.locator('body')).not.toContainText('Connection required');fixture.setRootStatus(200);await page.reload();
  const second=await context.newPage();await second.goto(fixture.base);await second.evaluate(()=>document.body.dataset.context='retained');
  fixture.setVersion('B');await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update()});await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  expect(await page.evaluate(()=>navigator.serviceWorker.controller!.state)).toBe('activated');expect(Object.keys(await cacheEntries(page))).toContain(prefix+'A');
  await page.evaluate(async()=>{(await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({type:'ACTIVATE_UPDATE'})});
  await expect.poll(async()=>Object.keys(await cacheEntries(page))).not.toContain(prefix+'A');expect((await cacheEntries(page))[prefix+'B']).toEqual(allowlist);expect(await second.evaluate(()=>document.body.dataset.context)).toBe('retained');expect(await page.evaluate(()=>localStorage.getItem('synthetic-auth-marker'))).toBe('preserve');expect(Object.keys(await cacheEntries(page))).toContain('unrelated-test-cache');
  fixture.setVersion('C');fixture.setFailedAsset('/icons/icon-512.png');await page.evaluate(async()=>{const reg=(await navigator.serviceWorker.getRegistration())!;await reg.update();await new Promise<void>(resolve=>{const worker=reg.installing;if(!worker){resolve();return}worker.addEventListener('statechange',()=>{if(worker.state==='redundant')resolve()})})});expect(Object.keys(await cacheEntries(page))).toContain(prefix+'B');expect(Object.keys(await cacheEntries(page))).not.toContain(prefix+'C');
  fixture.setFailedAsset(null);fixture.setVersion('A');await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update()});await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);await page.evaluate(async()=>{(await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({type:'ACTIVATE_UPDATE'})});await expect.poll(async()=>Object.keys(await cacheEntries(page))).toContain(prefix+'A');await expect.poll(async()=>Object.keys(await cacheEntries(page))).not.toContain(prefix+'B');
  await context.setOffline(true);await page.goto(fixture.base);await expect(page.locator('body')).toContainText('Connection required');await expect(page.locator('script[src]')).toHaveCount(0);await context.setOffline(false);await page.reload();await expect(page.locator('body')).toContainText('Synthetic online page');expect(await page.evaluate(()=>localStorage.getItem('synthetic-auth-marker'))).toBe('preserve');
 fixture.setWorkerOverride(readFileSync('scripts/pwa-retirement-worker.js','utf8'));await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update()});await expect.poll(()=>page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length)).toBe(0);expect(Object.keys(await cacheEntries(page))).toEqual(['unrelated-test-cache']);expect(await page.evaluate(()=>localStorage.getItem('synthetic-auth-marker'))).toBe('preserve');
 }finally{await context.close();await fixture.close()}
});
