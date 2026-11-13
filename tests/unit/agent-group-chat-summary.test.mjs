// R146: the agent's group chat summary endpoint (POST /internal/agent/group-chat-summaries) and its canonicaliser, in
// process with a stubbed token verifier and a stubbed pool. Invented text only.
import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {canonicalGroupChatSummary,groupChatSummaryRequestId} from '../../services/agent-receipts/contract.mjs';
import {createAgentReceiptHandler} from '../../services/agent-receipts/runtime.mjs';
const key='a'.repeat(32),sha='1'.repeat(64),requestId=groupChatSummaryRequestId('dev',key,sha);
const summary={windowFrom:'2026-11-09T07:32:00Z',lastMessageAt:'2026-11-12T07:05:00Z',generatedAt:'2026-11-12T07:32:00Z',messageCount:12,model:'claude-opus-5-5',
 lastSpeaker:{role:'borrower',borrowerId:'B-A'},headline:{th:'ผู้กู้ขอเลื่อนจ่ายเป็นวันศุกร์ หุ้นส่วนตกลง',en:'Borrower asks to pay on Friday; partner agreed.'},
 points:[{speaker:{role:'borrower',borrowerId:'B-A'},th:'เงินเดือนออกช้า จะโอนวันศุกร์',en:'Salary is late, will transfer on Friday.'},{speaker:{role:'partner'},th:'ตกลง',en:'Agreed.'}]};
const command={schemaVersion:1,requestId,environment:'dev',conversationKey:key,borrowerIds:['B-A'],sourceSha256:sha,summary};
const set=(path,value)=>{const copy=structuredClone(command);let at=copy;for(const part of path.slice(0,-1))at=at[part];if(value===undefined)delete at[path.at(-1)];else at[path.at(-1)]=value;return copy;};

test('request id: the agent derivation (uuid_from_sha256 of salt, environment, conversation key, source digest)',()=>{
 assert.equal(requestId,'b1549f89-7b1e-4fbb-8db4-dc075048eb53');
 assert.notEqual(groupChatSummaryRequestId('prod',key,sha),requestId);assert.notEqual(groupChatSummaryRequestId('dev',key,'2'.repeat(64)),requestId);
});

test('canonical form: section 7 key order, summary copied field by field, prune-only null summary',()=>{
 const canonical=canonicalGroupChatSummary(command);
 assert.deepEqual(Object.keys(canonical),['schemaVersion','requestId','environment','conversationKey','borrowerIds','sourceSha256','summary']);
 assert.deepEqual(Object.keys(canonical.summary),['windowFrom','lastMessageAt','generatedAt','messageCount','model','lastSpeaker','headline','points']);
 assert.deepEqual(canonical,command);assert.notEqual(canonical.summary,command.summary);
 // Key order of the input does not matter; the output order is fixed.
 const shuffled=Object.fromEntries(Object.entries(command).reverse());assert.equal(JSON.stringify(canonicalGroupChatSummary(shuffled)),JSON.stringify(canonical));
 assert.equal(canonicalGroupChatSummary({...command,summary:null}).summary,null);
 assert.deepEqual(canonicalGroupChatSummary({...command,borrowerIds:[],summary:null}).borrowerIds,[]);
 // Limits are code points: 160 Thai characters (480 bytes) and 200 in a point pass; four points; every role.
 const edge=set(['summary','headline','th'],'ก'.repeat(160));edge.summary.points=['partner','business','other'].map(role=>({speaker:{role},th:'ข'.repeat(200),en:'y'.repeat(200)})).concat([{speaker:{role:'referrer',borrowerId:'B-X'},th:'x',en:'y'}]);
 edge.summary.lastSpeaker={role:'business'};edge.summary.messageCount=100;edge.summary.lastMessageAt='2026-11-12T07:05:00.250Z';
 assert.equal(canonicalGroupChatSummary(edge).summary.points.length,4);
 const prod={...command,environment:'prod',requestId:groupChatSummaryRequestId('prod',key,sha)};assert.equal(canonicalGroupChatSummary(prod).environment,'prod');
});

const invalid=[
 ['not an object','text'],['null',null],['array',[command]],
 ['extra key',{...command,extra:1}],['missing key',set(['sourceSha256'])],['schema version',set(['schemaVersion'],2)],['schema version text',set(['schemaVersion'],'1')],
 ['environment',set(['environment'],'test')],['request id of another digest',set(['requestId'],groupChatSummaryRequestId('dev',key,'2'.repeat(64)))],
 ['conversation key length',set(['conversationKey'],'a'.repeat(31))],['conversation key case',set(['conversationKey'],'A'.repeat(32))],['digest',set(['sourceSha256'],'1'.repeat(63))],
 ['borrower ids not a list',set(['borrowerIds'],'B-A')],['unsorted',set(['borrowerIds'],['B-C','B-A'])],['duplicate',set(['borrowerIds'],['B-A','B-A'])],['empty id',set(['borrowerIds'],[''])],
 ['numeric id',set(['borrowerIds'],[1])],['21 ids',set(['borrowerIds'],Array.from({length:21},(_,i)=>'B-'+String(i).padStart(2,'0')))],
 ['summary array',set(['summary'],[])],['summary extra key',set(['summary','extra'],1)],['summary missing key',set(['summary','model'])],
 ['window format',set(['summary','windowFrom'],'2026-11-09 07:32:00')],['impossible time',set(['summary','lastMessageAt'],'2026-13-40T07:05:00Z')],
 ['last message before the window',set(['summary','lastMessageAt'],'2026-11-08T07:05:00Z')],['generated at number',set(['summary','generatedAt'],1)],
 ['message count 0',set(['summary','messageCount'],0)],['message count 101',set(['summary','messageCount'],101)],['message count 1.5',set(['summary','messageCount'],1.5)],['message count text',set(['summary','messageCount'],'12')],
 ['model',set(['summary','model'],'Claude Opus')],['headline empty',set(['summary','headline','th'],'')],['headline blank',set(['summary','headline','en'],'   ')],
 ['headline 161',set(['summary','headline','th'],'ก'.repeat(161))],['headline line break',set(['summary','headline','en'],'two\nlines')],['headline carriage return',set(['summary','headline','en'],'two\rlines')],
 ['headline NUL',set(['summary','headline','en'],'a\0b')],['headline tab',set(['summary','headline','en'],'a\tb')],['headline lone surrogate',set(['summary','headline','en'],'a\ud800b')],
 ['headline number',set(['summary','headline','en'],7)],['headline missing language',set(['summary','headline','th'])],['headline extra language',set(['summary','headline','fr'],'x')],
 ['points object',set(['summary','points'],{})],['five points',set(['summary','points'],Array(5).fill(summary.points[1]))],['point text',set(['summary','points',0],'text')],
 ['point 201',set(['summary','points',0,'en'],'x'.repeat(201))],['point null text',set(['summary','points',0,'th'],null)],['point extra key',set(['summary','points',0,'extra'],1)],
 ['point without speaker',set(['summary','points',0,'speaker'])],['speaker text',set(['summary','points',0,'speaker'],'borrower')],['unknown role',set(['summary','points',0,'speaker','role'],'owner')],
 ['borrower without id',set(['summary','points',0,'speaker','borrowerId'])],['borrower empty id',set(['summary','points',0,'speaker','borrowerId'],'')],
 ['partner with id',set(['summary','points',1,'speaker','borrowerId'],'B-A')],['speaker extra key',set(['summary','points',1,'speaker','name'],'x')],
 ['last speaker partner with id',set(['summary','lastSpeaker'],{role:'partner',borrowerId:'B-A'})],['last speaker without id',set(['summary','lastSpeaker'],{role:'referrer'})],['last speaker null',set(['summary','lastSpeaker'],null)]];
test('canonicaliser refuses every malformed command',()=>{
 for(const [name,value] of invalid)assert.throws(()=>canonicalGroupChatSummary(value),/invalid_summary_command/,name);
});

const policy={environment:'dev',audience:'https://command.invalid',callerEmail:'agent@example.invalid',callerSubject:'123456789'};
async function harness(run,{currentPolicy=policy}={}){
 const state={valid:true,calls:[],params:[],result:{kind:'stored',stored:1,unchanged:0,superseded:0,skipped:0,pruned:0},error:null,wakes:0,guards:0};
 const pool={connect:async()=>({query:async(sql,params)=>{state.calls.push(sql);if(sql.includes('pwa_put_group_chat_summary_v1')){state.params.push(params);if(state.error)throw state.error;return{rows:[{value:state.result}]};}return{rows:[]};},release(quarantine){state.calls.push(quarantine?'release-quarantine':'release');}})};
 const handler=createAgentReceiptHandler({next:(_req,res)=>{res.writeHead(401);res.end('human gate');},policy:currentPolicy,pool,guardConnection:async()=>{state.guards++;},afterCommit:async()=>{state.wakes++;},
  verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:state.valid?policy.callerEmail:'other@example.invalid',sub:policy.callerSubject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const post=(body={command},{raw,method='POST',path='/internal/agent/group-chat-summaries',headers={Authorization:'Bearer test'}}={})=>fetch(origin+path,{method,headers:{...headers,'Content-Type':'application/json'},body:method==='GET'?undefined:raw??JSON.stringify(body)});
 try{await run({state,post});}finally{await new Promise(r=>server.close(r));}
}

test('200 {kind}: the canonical {command} reaches pwa_put_group_chat_summary_v1 in one guarded transaction; no wake, no actor',async()=>{
 await harness(async({state,post})=>{
  const response=await post({command:Object.fromEntries(Object.entries(command).reverse())});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{kind:'stored'});assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(state.params,[[JSON.stringify({command})]]);
  assert.deepEqual(state.calls.filter(sql=>!sql.startsWith('SET LOCAL')),['BEGIN','SELECT public.pwa_put_group_chat_summary_v1($1) value','COMMIT','release']);
  assert.equal(state.calls.filter(sql=>sql.startsWith('SET LOCAL')).length,2);assert.equal(state.guards,1);
  assert.equal(state.calls.some(sql=>sql.includes('"Partners"')||sql.includes('pwa_submit')),false,'no actor Partner lookup and no payment path');
  assert.equal(state.wakes,0,'no after-commit effect');
  for(const kind of ['unchanged','superseded','cleared']){state.result={kind};assert.deepEqual(await (await post()).json(),{kind});}
  state.result={kind:'cleared'};assert.equal((await post({command:{...command,borrowerIds:[],summary:null}})).status,200);
 });
});

test('401 for a wrong caller or a missing token, before the body is read or the database touched',async()=>{
 await harness(async({state,post})=>{
  state.valid=false;const response=await post();assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorized'});
  state.valid=true;assert.equal((await post({command},{headers:{}})).status,401);
  assert.equal((await post({command:'not even a command'},{headers:{}})).status,401);
  assert.equal(state.calls.length,0);
 });
});

test('400 for extra or missing keys, an oversize body, bad lengths and an environment mismatch; nothing reaches the database',async()=>{
 await harness(async({state,post})=>{
  const bodies=[{command,actorPartnerId:'reviewer'},{},{command:null},{command,extra:1},[{command}],...invalid.slice(3).map(([,value])=>({command:value})),
   {command:{...command,environment:'prod',requestId:groupChatSummaryRequestId('prod',key,sha)}}];
  for(const body of bodies){const response=await post(body);assert.equal(response.status,400,JSON.stringify(body).slice(0,120));assert.deepEqual(await response.json(),{error:'invalid_summary_command'});}
  for(const raw of ['not json','','{"command":',JSON.stringify({command})+' '.repeat(16384)])assert.equal((await post(null,{raw})).status,400);
  // Exactly 16,384 bytes of a valid body pass; one more byte does not.
  const base=JSON.stringify({command}),padded=size=>base.slice(0,-1)+' '.repeat(size-Buffer.byteLength(base))+'}';
  assert.equal(Buffer.byteLength(padded(16384)),16384);assert.equal((await post(null,{raw:padded(16384)})).status,200);assert.equal((await post(null,{raw:padded(16385)})).status,400);
  assert.equal(state.params.length,1);
 });
});

test('database refusals: 22023 is 400, P0002 unknown_borrower is 422, anything else 503; an unknown commit is quarantined',async()=>{
 await harness(async({state,post})=>{
  const refused=(code,message)=>Object.assign(Error(message),{code});
  state.error=refused('22023','invalid_request');let response=await post();assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_summary_command'});
  state.error=refused('P0002','unknown_borrower');response=await post();assert.equal(response.status,422);assert.deepEqual(await response.json(),{error:'unknown_borrower'});
  state.error=refused('P0002','not_found');assert.equal((await post()).status,503);
  for(const error of [refused('55P03','lock timeout'),refused('42501','permission denied'),Error('connection lost')]){state.error=error;response=await post();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'summary_unavailable'});}
  assert.ok(state.calls.includes('ROLLBACK'));assert.equal(state.calls.includes('release-quarantine'),false);
  state.error=null;state.result={kind:'recorded'};assert.equal((await post()).status,503,'an unexpected result is not a success');
  state.result=null;assert.equal((await post()).status,503);
 });
 // COMMIT fails after it started: the outcome is unknown and the connection is not reused.
 const calls=[];
 const pool={connect:async()=>({query:async sql=>{calls.push(sql);if(sql==='COMMIT')throw Error('socket closed');return sql.includes('pwa_put')?{rows:[{value:{kind:'stored'}}]}:{rows:[]};},release(quarantine){calls.push('release:'+Boolean(quarantine));}})};
 const handler=createAgentReceiptHandler({next:()=>{},policy,pool,guardConnection:async()=>{},verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:policy.callerEmail,sub:policy.callerSubject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/internal/agent/group-chat-summaries',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({command})});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'summary_outcome_unknown'});assert.equal(calls.at(-1),'release:true');
 }finally{await new Promise(r=>server.close(r));}
});

test('404 without a policy, for another method and for a longer path; the other agent routes still need actorPartnerId',async()=>{
 await harness(async({state,post})=>{const response=await post();assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'not_found'});assert.equal(state.calls.length,0);},{currentPolicy:null});
 await harness(async({state,post})=>{
  assert.equal((await post(null,{method:'GET'})).status,404);
  for(const path of ['/internal/agent/group-chat-summaries/'+requestId,'/internal/agent/group-chat-summaries/','/internal/agent/group-chat-summaries?x=1','/internal/agent/group-chat-summary'])assert.equal((await post({command},{path})).status,404,path);
  assert.equal((await post({command},{path:'/internal/agent/receipt-payments'})).status,400,'a summary body is not a receipt command');
  assert.equal(state.calls.length,0);
 });
});
