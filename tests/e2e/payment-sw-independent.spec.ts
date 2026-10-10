import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('P4-09/17 real SW caches public shell; offline restart retains IDB draft and pending',async({browser},info)=>{
 test.skip(info.project.name.startsWith('mobile'),'Worker lifecycle verified once');
 const repository=ts.transpileModule(readFileSync('apps/pwa/src/owner-offline.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("from './viewed-snapshot'","from './viewed-snapshot.js'");
 const projection=ts.transpileModule(readFileSync('apps/pwa/src/viewed-snapshot.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const worker=readFileSync('apps/pwa/pwa/sw.js','utf8').replace('__BUILD_VERSION__','independent-offline').replace('/*APP_ASSETS*/[]','/*APP_ASSETS*/["/","/repository.js","/viewed-snapshot.js"]');
 const shell='<!doctype html><meta charset="utf-8"><title>Synthetic public shell</title><main id="state">Loading</main><button id="seed">Explicit save</button><script type="module">import {ownerOfflineRepository} from "/repository.js";const repo=ownerOfflineRepository({issuer:"https://securetoken.google.com/clever-oasis-508610-n7",uid:"synthetic-prior-session"});document.querySelector("#seed").onclick=async()=>{await repo.authorize();await repo.saveDraft("B",{notes:"ไทย saved"});await repo.savePending("request",{requestId:"request",borrowerId:"B",notes:"immutable"});document.querySelector("#state").textContent="Explicitly saved"};const show=async()=>{const yes=await repo.authorized();const d=await repo.draft("B"),p=await repo.pending("request");document.querySelector("#state").textContent=yes?"Saved copy — not current: "+d?.value.notes+" / "+p?.value.requestId:"Locked without prior session"};await show();await navigator.serviceWorker.register("/sw.js");</script>';
 let writes=0,holdNavigation=false,heldNavigations=0;const held:any[]=[];const server=createServer((req,res)=>{if(req.method!=='GET')writes++;const path=new URL(req.url!,'http://local').pathname;
  if(path==='/'&&holdNavigation){heldNavigations++;held.push(res);return}
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(shell)}else if(path==='/repository.js'||path==='/viewed-snapshot.js'||path==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end(path==='/sw.js'?worker:path==='/viewed-snapshot.js'?projection:repository)}else {try{const bytes=readFileSync('apps/pwa/pwa'+path);res.setHeader('Content-Type',path.endsWith('.png')?'image/png':'text/html');res.end(bytes)}catch{res.statusCode=404;res.end()}}
 });await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address() as any,base=`http://127.0.0.1:${address.port}`;const context=await browser.newContext();let page=await context.newPage();
 try{await page.goto(base);await expect(page.locator('#state')).toHaveText('Locked without prior session');await page.locator('#seed').click();await expect(page.locator('#state')).toHaveText('Explicitly saved');await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  holdNavigation=true;await page.close();page=await context.newPage();await page.goto(base);await expect(page.locator('#state')).toHaveText('Saved copy — not current: ไทย saved / request');expect(heldNavigations).toBe(0);holdNavigation=false;
  await page.evaluate(async()=>{await fetch('/api/private');await fetch('/receipt/private');await fetch('/auth/private')});
  await page.close();await context.setOffline(true);page=await context.newPage();await page.goto(base);await expect(page.locator('#state')).toHaveText('Saved copy — not current: ไทย saved / request');
  const entries=await page.evaluate(async()=>{const names=await caches.keys();return Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)))});expect(entries.flat().filter(p=>/^\/(api|receipt|auth)\//.test(p))).toEqual([]);expect(writes).toBe(0);
  await context.setOffline(false);await page.reload();await expect(page.locator('#state')).toHaveText('Saved copy — not current: ไทย saved / request');expect(writes).toBe(0);
 }finally{for(const res of held)res.end();await context.close();await new Promise<void>(done=>server.close(()=>done()))}
});

