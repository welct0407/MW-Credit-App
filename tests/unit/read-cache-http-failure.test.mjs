import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/read-cache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({status=503,cached=null,repository=true,onFetch=()=>{},revision=()=>1,cacheRevision=()=>1}={}){
 const exports={},denials=[],response=new Response(JSON.stringify({code:'temporarily_unavailable'}),{status,headers:{'Content-Type':'application/json','X-Request-ID':'synthetic-http-reference'}});
 const repo={environment:'synthetic',scopeName:'synthetic-owner',readCacheRevision:async()=>cacheRevision(),readRevision:async()=>revision(),syncAuthorized:async()=>true,readCachedResponse:async()=>cached,saveCachedResponse:async()=>{throw Error('Error responses must not be saved')},remove:async()=>{}};
 const dependencies={'./client-events':{recordClientEvent:()=>{}},'./request-activity':{beginRequest:()=>()=>{}},'./offline-dataset':{readOfflineDataset:async()=>null,isOfflineDatasetCursor:()=>false},'./environment':{commandOriginAllowed:()=>false}};
 runInNewContext(source,{exports,require:name=>dependencies[name],Response,Blob,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,navigator:{onLine:true},location:{origin:'https://synthetic.invalid'},window:new EventTarget(),fetch:async()=>{onFetch();return status===200?new Response(JSON.stringify({id:'fresh'}),{status,headers:{'Content-Type':'application/json'}}):response}});
 return {read:options=>exports.readCachedJson({origin:'https://synthetic.invalid',...(repository?{offline:repo}:{}),token:async()=>'synthetic-token',authFailure:status=>denials.push(status)},'/api/loan-records/synthetic',options),response,denials};
}
for(const status of [429,503])test(`cold HTTP ${status} retains original response, body and request reference`,async()=>{
 const f=fixture({status}),result=await f.read();assert.equal(result.response,f.response);assert.equal(result.response.status,status);assert.equal(result.response.headers.get('X-Request-ID'),'synthetic-http-reference');assert.equal(result.data.code,'temporarily_unavailable');assert.equal(result.fromCache,false);
});
test('uncached request retains HTTP failure while valid saved data remains the preferred fallback',async()=>{
 const cold=fixture({repository:false});assert.equal((await cold.read()).response,cold.response);
 const warm=fixture({cached:{data:{id:'saved'},format:'json',contentType:'application/json',savedAt:1,revision:1}}),result=await warm.read();assert.equal(result.fromCache,true);assert.equal(result.data.id,'saved');assert.equal(result.response.status,200);
});
test('authorization denial never returns saved data or an ordinary HTTP result',async()=>{
 const f=fixture({status:403,cached:{data:{id:'saved'},format:'json',contentType:'application/json',savedAt:1,revision:1}});await assert.rejects(f.read(),/authorization denied/);assert.deepEqual(f.denials,[403]);
});
test('explicit cancellation does not return an HTTP response or cached fallback',async()=>{
 const controller=new AbortController(),f=fixture({onFetch:()=>controller.abort()});await assert.rejects(f.read({signal:controller.signal}),error=>error.name==='AbortError');
});
test('a mutation after the failed response was checked rejects that obsolete response',async()=>{
 let reads=0;const f=fixture({revision:()=>++reads<4?1:2});await assert.rejects(f.read(),/temporarily unavailable/);
});
test('a read keeps retrying while settled-command and dataset revisions are still changing',async()=>{
 // Read revision changes after fetches 1-2 and cache revision after fetch 3: four fetches, then success.
 let fetches=0;const f=fixture({status:200,onFetch:()=>fetches++,revision:()=>Math.min(fetches,2),cacheRevision:()=>fetches>=3?2:1}),result=await f.read();
 assert.equal(fetches,4);assert.equal(result.data.id,'fresh');assert.equal(result.fromCache,false);
});
