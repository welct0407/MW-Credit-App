import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDeliveryArguments,verifyFullCheckpoint,verifyOperatorCredential,publishHostingDelivery} from '../../scripts/production/deploy-foundation-hosting.mjs';
const sha='a'.repeat(40);
const run={id:1,head_sha:sha,status:'completed',conclusion:'success',workflow_id:12,repository:{full_name:'welct0407/MW-Credit-App'}};
const workflow={path:'.github/workflows/ci.yml'};
const jobs={total_count:1,jobs:[{conclusion:'success',steps:[{name:'npm run test:e2e',conclusion:'success'}]}]};
function requestFixture(objects){let count=0;return async()=>({ok:true,json:async()=>objects[count++]});}
test('delivery CLI requires exact package/roots/run and defaults to no apply',()=>{
 const args=['--manifest','package.json','--artifact-root','current','--rollback-root','rollback','--ci-run','1'];assert.equal(parseDeliveryArguments(args)['--apply'],undefined);
 for(const extra of [['--force'],['--manifest','other'],['--apply','--apply']])assert.throws(()=>parseDeliveryArguments([...args,...extra]));
 assert.throws(()=>parseDeliveryArguments(args.slice(0,-2)));
});
test('actual exact-source CI and executed browser step required before operator credential',async()=>{
 const result=await verifyFullCheckpoint({runId:'1',sourceCommit:sha,githubToken:'synthetic-read-token',request:requestFixture([run,workflow,jobs])});assert.equal(result.fullCheckpoint,'success');
 for(const candidate of [{...run,head_sha:'b'.repeat(40)},{...run,status:'in_progress'},{...run,conclusion:'failure'},{...run,repository:{full_name:'wrong/repo'}}])await assert.rejects(verifyFullCheckpoint({runId:'1',sourceCommit:sha,githubToken:'synthetic',request:requestFixture([candidate,workflow,jobs])}));
 await assert.rejects(verifyFullCheckpoint({runId:'1',sourceCommit:sha,githubToken:'synthetic',request:requestFixture([run,{path:'.github/workflows/database.yml'},jobs])}));
 await assert.rejects(verifyFullCheckpoint({runId:'1',sourceCommit:sha,githubToken:'synthetic',request:requestFixture([run,workflow,{total_count:1,jobs:[{conclusion:'success',steps:[{name:'npm run test:e2e',conclusion:'skipped'}]}]}])}));
});
function prepared(){return{site:'mw-credit-prod-737787224638',sourceCommit:sha,targetSha256:'b'.repeat(64),phase:'foundation',headers:[{glob:'**',headers:{'Cache-Control':'no-store'}}],files:{'/index.html':'c'.repeat(64)},contents:new Map([['c'.repeat(64),Buffer.from('synthetic-gzip')]])};}
function apiFixture(overrides={}){const calls=[];const site='sites/mw-credit-prod-737787224638';const responses=[{name:site+'/versions/synthetic'},overrides.populate??{uploadRequiredHashes:['c'.repeat(64)],uploadUrl:'https://upload-firebasehosting.googleapis.com/upload'}, {},overrides.finalize??{name:site+'/versions/synthetic',status:'FINALIZED'},overrides.release??{name:site+'/releases/synthetic',version:{name:site+'/versions/synthetic'}}];return{calls,request:async(url,options)=>{calls.push({url,options});const body=responses.shift();return{ok:true,status:200,text:async()=>JSON.stringify(body)};}};}
test('operator publish targets only PROD immutable content/no-store and no DEV rewrite',async()=>{
 const fixture=apiFixture();const result=await publishHostingDelivery({prepared:prepared(),token:'synthetic-operator-token',request:fixture.request});assert.equal(result.worker,false);assert.match(result.version,/mw-credit-prod-737787224638/);
 assert.equal(fixture.calls.length,5);assert.equal(fixture.calls[0].options.redirect,'error');assert.deepEqual(JSON.parse(fixture.calls[0].options.body).config.headers,prepared().headers);assert.equal(Object.hasOwn(JSON.parse(fixture.calls[0].options.body).config,'rewrites'),false);
 let calls=0;await assert.rejects(publishHostingDelivery({prepared:{...prepared(),site:'mw-credit-app-dev-737787224638'},token:'synthetic',request:async()=>{calls++;}}));assert.equal(calls,0);
});
test('upload host/content mismatch stops without finalization/release',async()=>{
 for(const populate of [{uploadRequiredHashes:['unknown'],uploadUrl:'https://upload-firebasehosting.googleapis.com/upload'},{uploadRequiredHashes:['c'.repeat(64)],uploadUrl:'https://untrusted.example/upload'}]){const fixture=apiFixture({populate});await assert.rejects(publishHostingDelivery({prepared:prepared(),token:'synthetic',request:fixture.request}));assert.equal(fixture.calls.length,2);}
});

test('existing token must identify the verified human and both actual sites before delivery',async()=>{
 const prod={name:'projects/clever-oasis-508610-n7/sites/mw-credit-prod-737787224638'};
 const dev={name:'projects/clever-oasis-508610-n7/sites/mw-credit-app-dev-737787224638'};
 const result=await verifyOperatorCredential({token:'synthetic',request:requestFixture([{email:'welct0407@mw-credit.com',email_verified:true},prod,dev])});assert.equal(result.readback,'passed');
 for(const identity of [{email:'automation@example.test',email_verified:true},{email:'welct0407@mw-credit.com',email_verified:false}])await assert.rejects(verifyOperatorCredential({token:'synthetic',request:requestFixture([identity,prod,dev])}));
 await assert.rejects(verifyOperatorCredential({token:'synthetic',request:requestFixture([{email:'welct0407@mw-credit.com',email_verified:true},{name:dev.name},dev])}));
 await assert.rejects(verifyOperatorCredential({request:requestFixture([])}));
});
test('finalized and released immutable version must equal the created version',async()=>{
 const wrongFinalize=apiFixture({finalize:{name:'sites/mw-credit-prod-737787224638/versions/wrong',status:'FINALIZED'}});await assert.rejects(publishHostingDelivery({prepared:prepared(),token:'synthetic',request:wrongFinalize.request}));assert.equal(wrongFinalize.calls.length,4);
 for(const release of [{name:'sites/mw-credit-prod-737787224638/releases/synthetic',version:{name:'sites/mw-credit-prod-737787224638/versions/wrong'}},{name:'sites/mw-credit-prod-737787224638/releases/synthetic'}]){const fixture=apiFixture({release});await assert.rejects(publishHostingDelivery({prepared:prepared(),token:'synthetic',request:fixture.request}));}
});