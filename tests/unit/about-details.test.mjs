import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {releaseLabel,environmentLabel,copyText}=await load('about-details.ts'),{readRunningBuildVersion}=await load('build-version.ts');
// R072 About: production shows the bare release; DEV says it is still in development, in both languages.
test('release and environment labels for production and DEV in English and Thai',()=>{
 assert.equal(releaseLabel('R072','prod',false),'R072');assert.equal(releaseLabel('R072','prod',true),'R072');
 assert.equal(releaseLabel('R072','dev',false),'R072 · in development');assert.equal(releaseLabel('R072','dev',true),'R072 · กำลังพัฒนา');
 assert.equal(environmentLabel('prod',false),'Production · lm.mw-credit.com');assert.equal(environmentLabel('prod',true),'ระบบจริง · lm.mw-credit.com');
 assert.equal(environmentLabel('dev',false),'DEV · dev-lm.mw-credit.com');assert.equal(environmentLabel('dev',true),'DEV · dev-lm.mw-credit.com');
});
test('copied details have the exact English support format and no account data',()=>{
 const dev=copyText({release:'R072',environment:'dev',build:null,commit:'abc1234',standalone:false,online:true,pending:0,email:'owner@example.com',uid:'synthetic-owner'});
 assert.equal(dev,'MW Credit\nRelease: R072 · in development\nBuild: unavailable\nCommit: abc1234\nEnvironment: Development (https://dev-lm.mw-credit.com)\nApp mode: Browser tab\nConnection: Online\nWaiting to sync: 0');
 const prod=copyText({release:'R072',environment:'prod',build:'0123456789abcdef01234567',commit:'unknown',standalone:true,online:false,pending:3});
 assert.equal(prod,'MW Credit\nRelease: R072\nBuild: 0123456789abcdef01234567\nCommit: unknown\nEnvironment: Production (https://lm.mw-credit.com)\nApp mode: Installed app\nConnection: Offline\nWaiting to sync: 3');
 for(const text of [dev,prod]){assert.equal(text.includes('@'),false);assert.equal(text.includes('synthetic-owner'),false)}
});
const worker=reply=>({posted:[],postMessage(message,[port]){this.posted.push(message);if(reply!==undefined)port.postMessage(reply)}});
test('running build version comes from the controlling worker over GET_BUILD_VERSION',async()=>{
 const valid=worker({version:'0123456789abcdef01234567'});
 assert.equal(await readRunningBuildVersion(valid,1000),'0123456789abcdef01234567');assert.deepEqual(valid.posted,[{type:'GET_BUILD_VERSION'}]);
});
test('running build version is null without a controller, on timeout, invalid reply or post failure',async()=>{
 assert.equal(await readRunningBuildVersion(null),null);
 assert.equal(await readRunningBuildVersion(worker(undefined),20),null);
 for(const reply of [{version:'__BUILD_VERSION__'},{version:'0123456789ABCDEF01234567'},{version:'0123'},{},null])assert.equal(await readRunningBuildVersion(worker(reply),1000),null);
 assert.equal(await readRunningBuildVersion({postMessage(){throw Error('detached')}},1000),null);
});
