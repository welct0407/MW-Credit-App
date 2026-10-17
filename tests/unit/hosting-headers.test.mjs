import test from 'node:test';import assert from 'node:assert/strict';import {readFile,stat} from 'node:fs/promises';
import {hostingHeaders} from '../../scripts/hosting-headers.mjs';
// APP-SEC-01: clickjacking and script-injection headers; APP-PERF-01: immutable hashed assets.
const rule=(rules,glob)=>rules.find(r=>r.glob===glob)?.headers;
test('DEV Hosting headers: CSP with frame-ancestors none, both DEV API origins, X-Frame-Options DENY',()=>{
 const all=rule(hostingHeaders('live-dev'),'**'),csp=all['Content-Security-Policy'];
 assert.match(csp,/frame-ancestors 'none'/);assert.equal(all['X-Frame-Options'],'DENY');assert.equal(all['Cache-Control'],'no-store');
 for(const origin of ['https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app','https://mw-credit-app-command-dev-pvrgvyg3oq-as.a.run.app','https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com'])assert.ok(csp.includes(origin),origin);
 assert.match(csp,/script-src 'self' https:\/\/apis\.google\.com;/);assert.match(csp,/frame-src https:\/\/clever-oasis-508610-n7\.firebaseapp\.com https:\/\/accounts\.google\.com/);
 assert.doesNotMatch(csp,/-prod-|unsafe-eval|script-src[^;]*unsafe-inline/);
});
test('PROD Hosting headers carry the PROD origins and no DEV origin',()=>{
 const csp=rule(hostingHeaders('live-prod'),'**')['Content-Security-Policy'];
 assert.ok(csp.includes('https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app')&&csp.includes('https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app'));
 assert.doesNotMatch(csp,/-dev-/);assert.equal(rule(hostingHeaders('live-prod'),'**')['X-Frame-Options'],'DENY');
});
test('hashed assets are immutable; entry points stay no-store and come after the asset rule',()=>{
 for(const mode of ['live-dev','live-prod']){
  const rules=hostingHeaders(mode);assert.equal(rule(rules,'/assets/**')['Cache-Control'],'public,max-age=31536000,immutable');
  for(const glob of ['/build-version.json','/sw.js','/manifest.webmanifest','/offline.html'])assert.equal(rule(rules,glob)['Cache-Control'],'no-store',glob);
  assert.equal(rule(rules,'**')['Cache-Control'],'no-store');// '/', '/index.html' and SPA routes (rewrite to index.html)
  assert.ok(rules.findIndex(r=>r.glob==='/assets/**')>rules.findIndex(r=>r.glob==='**'));
 }
 assert.throws(()=>hostingHeaders('other'));
});
test('firebase.json mirrors the live DEV Hosting header rules exactly',async()=>{
 const mirror=JSON.parse(await readFile(new URL('../../firebase.json',import.meta.url),'utf8')).hosting.headers;
 assert.deepEqual(mirror.map(r=>({glob:r.source,headers:Object.fromEntries(r.headers.map(h=>[h.key,h.value]))})),hostingHeaders('live-dev'));
});
test('brand logos stay small after resizing',async()=>{
 for(const name of ['loan-manager-logo-dev-orange.png','loan-manager-logo-prod-pink.png'])assert.ok((await stat(new URL('../../apps/pwa/src/assets/'+name,import.meta.url))).size<100*1024,name);
});
