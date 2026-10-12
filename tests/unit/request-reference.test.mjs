import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDevReadHandler } from '../../services/api/dev-read-handler.mjs';
const origin = 'https://dev-lm.mw-credit.com';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function invoke({ logger = () => {}, fail = false, headers = {}, url = '/api/borrowers?q=PRIVATE_NAME', method = 'GET' } = {}) {
 const response = new EventEmitter(); const saved = {};
 response.setHeader = (key, value) => saved[key] = value;
 response.end = body => { response.body = body; };
 const handler = createDevReadHandler({ config: { origins: [origin] }, completionLogger: logger,
 verifyPrincipal: async () => ({ok:true,email:'PRIVATE_EMAIL'}),
 store: { listBorrowers: async () => { if(fail) throw Error('PRIVATE_EXCEPTION'); return {ok:true,source:'dev',items:[]}; } } });
 await handler({url,method,headers:{origin,authorization:'Bearer PRIVATE_TOKEN','x-request-id':'CLIENT_SPOOF',...headers}},response);
 return {response,saved};
}
test('reference generated independently; completion logs only after finish exactly once without private inputs', async () => {
 const records=[];const {response,saved}=await invoke({logger:r=>records.push(r)});
 assert.match(saved['X-Request-ID'],uuid);assert.equal(saved['Access-Control-Expose-Headers'],'X-Request-ID');
 assert.equal(records.length,0);response.emit('finish');response.emit('finish');assert.equal(records.length,1);
 assert.deepEqual(Object.keys(records[0]),['event','requestId','operation','method','status','code','durationMs']);
 assert.equal(records[0].requestId,saved['X-Request-ID']);assert.equal(records[0].operation,'borrowers_list');
 assert.equal(JSON.stringify(records).includes('PRIVATE'),false);assert.equal(JSON.stringify(records).includes('CLIENT_SPOOF'),false);
 assert.ok(Number.isFinite(records[0].durationMs)&&records[0].durationMs>=0);
 const other=await invoke();assert.notEqual(other.saved['X-Request-ID'],saved['X-Request-ID']);
});
test('exceptions and hostile route or method never enter diagnostics; logger failure does not escape finish', async()=>{
 const records=[];const failed=await invoke({fail:true,logger:r=>records.push(r)});failed.response.emit('finish');
 assert.equal(records[0].code,'read_unavailable');assert.equal(JSON.stringify(records).includes('PRIVATE_EXCEPTION'),false);
 const denied=await invoke({method:'PRIVATE_METHOD',url:'/PRIVATE_PATH',logger:r=>records.push(r)});denied.response.emit('finish');
 assert.equal(records[1].method,'OTHER');assert.equal(records[1].operation,'unknown');
 const broken=await invoke({logger:()=>{throw Error('PRIVATE_LOG_ERROR')}});assert.doesNotThrow(()=>broken.response.emit('finish'));
});
test('denied origins still receive unique reference but never CORS exposure',async()=>{
 const {response,saved}=await invoke({headers:{origin:'https://evil.invalid'}});
 assert.equal(response.statusCode,403);assert.match(saved['X-Request-ID'],uuid);assert.equal(saved['Access-Control-Expose-Headers'],undefined);
});