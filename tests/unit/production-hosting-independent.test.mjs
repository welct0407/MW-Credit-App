import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFullCheckpoint,verifyOperatorCredential,prepareHostingDelivery,publishHostingDelivery} from '../../scripts/production/deploy-foundation-hosting.mjs';
const commit='a'.repeat(40),site='mw-credit-prod-737787224638',version='sites/'+site+'/versions/immutable-fixture';
function readFixture(values){const calls=[];return{calls,request:async(url,options)=>{calls.push({url,options});const value=values.shift();assert.ok(value,'unexpected read');return{ok:true,json:async()=>value};}};}
const goodRun={id:8,head_sha:commit,status:'completed',conclusion:'success',workflow_id:20,repository:{full_name:'welct0407/MW-Credit-App'}};
const goodWorkflow={path:'.github/workflows/ci.yml'};
const goodJobs={total_count:1,jobs:[{conclusion:'success',steps:[{name:'npm run test:e2e',conclusion:'success'}]}]};
test('exact GitHub named and default browser steps require successful job and step; aliases cannot qualify',async()=>{
 for(const name of ['npm run test:e2e','Run npm run test:e2e']){
  const f=readFixture([goodRun,goodWorkflow,{total_count:1,jobs:[{conclusion:'success',steps:[{name,conclusion:'success'}]}]}]);
  assert.equal((await verifyFullCheckpoint({runId:'8',sourceCommit:commit,githubToken:'synthetic',request:f.request})).fullCheckpoint,'success');
  for(const [job,step] of [['success','skipped'],['success','failure'],['failure','success'],['cancelled','success']]){
   const denied=readFixture([goodRun,goodWorkflow,{total_count:1,jobs:[{conclusion:job,steps:[{name,conclusion:step}]}]}]);
   await assert.rejects(verifyFullCheckpoint({runId:'8',sourceCommit:commit,githubToken:'synthetic',request:denied.request}));assert.equal(denied.calls.length,3);
  }
 }
 for(const name of ['Run npm run test:e2e --project=desktop-chromium','run npm run test:e2e','Run npm run test:e2e ','npm run test:e2e:affected','Run npm test']){
  const f=readFixture([goodRun,goodWorkflow,{total_count:1,jobs:[{conclusion:'success',steps:[{name,conclusion:'success'}]}]}]);
  await assert.rejects(verifyFullCheckpoint({runId:'8',sourceCommit:commit,githubToken:'synthetic',request:f.request}));
 }
});
test('checkpoint failures stop at their stage and skipped/missing browser proof cannot unlock operator delivery',async()=>{
 for(const [run,workflow,jobs,expected] of [
  [{...goodRun,head_sha:'b'.repeat(40)},goodWorkflow,goodJobs,1],
  [goodRun,{path:'.github/workflows/deploy-dev.yml'},goodJobs,2],
  [goodRun,goodWorkflow,{total_count:101,jobs:goodJobs.jobs},3],
  [goodRun,goodWorkflow,{total_count:1,jobs:[{conclusion:'success',steps:[{name:'npm run test:e2e',conclusion:'skipped'}]}]},3],
  [goodRun,goodWorkflow,{total_count:0,jobs:[]},3]]){
  const f=readFixture([run,workflow,jobs]);await assert.rejects(verifyFullCheckpoint({runId:'8',sourceCommit:commit,githubToken:'SYNTHETIC_PRIVATE_GITHUB',request:f.request}));assert.equal(f.calls.length,expected);
  assert.ok(f.calls.every(call=>call.url.startsWith('https://api.github.com/repos/welct0407/MW-Credit-App/')&&call.options.method==='GET'&&call.options.redirect==='error'));
 }
 const f=readFixture([]);await assert.rejects(verifyFullCheckpoint({runId:'8',sourceCommit:commit,request:f.request}));assert.equal(f.calls.length,0);
});
test('approved human verification checks both exact sites with no credential forwarding outside fixed Google reads',async()=>{
 const prod={name:'projects/clever-oasis-508610-n7/sites/'+site},dev={name:'projects/clever-oasis-508610-n7/sites/mw-credit-app-dev-737787224638'};
 const f=readFixture([{email:'welct0407@mw-credit.com',email_verified:true},prod,dev]);assert.equal((await verifyOperatorCredential({token:'SYNTHETIC_PRIVATE_OPERATOR',request:f.request})).readback,'passed');
 assert.equal(f.calls.length,3);assert.equal(f.calls[0].url,'https://www.googleapis.com/oauth2/v3/userinfo');assert.equal(f.calls[0].options.headers['x-goog-user-project'],undefined);
 for(const call of f.calls.slice(1)){assert.equal(new URL(call.url).hostname,'firebasehosting.googleapis.com');assert.equal(call.options.headers['x-goog-user-project'],'clever-oasis-508610-n7');assert.equal(call.options.redirect,'error');}
 for(const identity of [{email:'automation@example.invalid',email_verified:true},{email:'welct0407@mw-credit.com',email_verified:false}]){const denied=readFixture([identity]);await assert.rejects(verifyOperatorCredential({token:'synthetic',request:denied.request}));assert.equal(denied.calls.length,1);}
 const wrongDev=readFixture([{email:'welct0407@mw-credit.com',email_verified:true},prod,{name:prod.name}]);await assert.rejects(verifyOperatorCredential({token:'synthetic',request:wrongDev.request}));assert.equal(wrongDev.calls.length,3);
});
function prepared(){return{site,sourceCommit:commit,targetSha256:'b'.repeat(64),phase:'foundation',headers:[{glob:'**',headers:{'Cache-Control':'no-store'}}],files:{'/index.html':'c'.repeat(64)},contents:new Map([['c'.repeat(64),Buffer.from('synthetic compressed bytes')]])};}
function writeFixture(fault){const calls=[];const values=[{name:version},{uploadRequiredHashes:['c'.repeat(64)],uploadUrl:'https://upload-firebasehosting.googleapis.com/upload'}, {},{name:version,status:'FINALIZED'},{name:'sites/'+site+'/releases/fixture',version:{name:version}}];fault?.(values);return{calls,request:async(url,options)=>{calls.push({url,options});const value=values.shift();assert.ok(value,'unexpected write');return{ok:true,status:200,text:async()=>JSON.stringify(value)};}};}
test('stage failures cannot finalize/release wrong bytes or claim a different immutable version, and never destroy',async()=>{
 for(const [fault,count] of [
  [values=>values[0]={name:'sites/mw-credit-app-dev-737787224638/versions/wrong'},1],
  [values=>values[1].uploadRequiredHashes=['unlisted'],2],
  [values=>values[1].uploadUrl='https://firebasehosting.googleapis.com.attacker.invalid/upload',2],
  [values=>values[3]={name:'sites/'+site+'/versions/wrong',status:'FINALIZED'},4],
  [values=>values[4]={name:'sites/'+site+'/releases/fixture',version:{name:'sites/'+site+'/versions/wrong'}},5]]){
  const f=writeFixture(fault);await assert.rejects(publishHostingDelivery({prepared:prepared(),token:'synthetic',request:f.request}));assert.equal(f.calls.length,count);assert.ok(f.calls.every(call=>call.options.method!=='DELETE'));
 }
 const f=writeFixture();const result=await publishHostingDelivery({prepared:prepared(),token:'synthetic',request:f.request});assert.equal(result.version,version);assert.equal(result.worker,false);assert.equal(f.calls.length,5);
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{config:{headers:prepared().headers}});assert.equal(Object.hasOwn(JSON.parse(f.calls[0].options.body).config,'rewrites'),false);
});
test('malformed preparation and wrong production site fail before any publish request',async()=>{
 await assert.rejects(prepareHostingDelivery({manifest:{schemaVersion:1,environment:'dev'},artifactRoot:'unread',rollbackRoot:'unread'}));
 let calls=0;await assert.rejects(publishHostingDelivery({prepared:{...prepared(),site:'mw-credit-app-dev-737787224638'},token:'synthetic',request:async()=>{calls++;}}));assert.equal(calls,0);
});
