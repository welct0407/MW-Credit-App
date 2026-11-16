// R165: the group chat summary refresh (V150). The PWA's POST /api/collection/{borrowerId}/chat-refresh, the agent's
// GET and POST /internal/agent/group-chat-refreshes, the read side (detail groupChatRefresh, offline rows and delta) and the
// PWA's pure rules (chat-refresh.ts) with the card's markup contract. Stub pools and fetches; every name is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createPaymentCommandHandler,isReadRoute} from '../../services/payment-command/handler.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {createAgentReceiptHandler,groupChatRefreshesSql} from '../../services/agent-receipts/runtime.mjs';
import {canonicalGroupChatRefresh} from '../../services/agent-receipts/contract.mjs';

const ACTOR={issuer:'https://issuer.example.invalid',subject:'synthetic-subject',partnerId:'P-SYNTHETIC',loginEmail:'synthetic@example.invalid'};
const OPEN={kind:'accepted',requestId:'0c970c97-0c97-4c97-8c97-0c970c970c97',requestedAt:'2026-11-16T08:00:00.000Z',completedAt:null,outcome:null};

// ---- PWA route (command service) ------------------------------------------------------------------------------------
async function fixture({answer=()=>({rows:[{value:OPEN}]}),actor=ACTOR,verify}={}){
 const state={sql:[],params:[],wakes:0,capabilities:[],released:0,revocation:[]};
 const pool={connect:async()=>({release:()=>{state.released++;},query:async(sql,params)=>{state.sql.push(sql);if(sql.includes('pwa_request_group_chat_refresh_v1')){state.params.push(params);return answer();}return {rows:[]};}})};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,actorIssuer:ACTOR.issuer,afterCommit:async()=>{state.wakes++;},
  resolveActor:async(_client,_principal,capability)=>{state.capabilities.push(capability);return actor;}});
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],store,
  verifyPrincipal:verify??(async(_header,options)=>{state.revocation.push(options?.checkRevoked!==false);return {ok:true,subject:ACTOR.subject,email:ACTOR.loginEmail};})});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const post=async(path,body,{method='POST',type='application/json',raw=false}={})=>{
  const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer synthetic',...(type?{'Content-Type':type}:{})},...(method==='GET'?{}:{body:raw?body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 };
 return {state,post,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('R165 chat-refresh: body exactly {}, the Partner from the server actor, capability read, a writing transaction, no wake',async()=>{
 const f=await fixture();
 try{
  assert.deepEqual(await f.post('/api/collection/B%20one/chat-refresh',{}),{status:200,body:{ok:true,...OPEN}});
  assert.deepEqual(f.state.params,[[JSON.stringify(ACTOR),'B one']],'actor from the server, borrower from the path');
  assert.deepEqual(f.state.capabilities,['read'],'any member with the read capability may ask');
  assert.equal(f.state.sql[0],'BEGIN');assert.ok(f.state.sql.includes('COMMIT'));assert.equal(f.state.released,1);
  assert.equal(f.state.wakes,0,'no notification wake');assert.deepEqual(f.state.revocation,[true],'a write keeps the revocation check');
  for(const body of [{partnerId:'P-OTHER'},{actor:ACTOR},{requestId:OPEN.requestId},[],null,'text',1])
   assert.deepEqual(await f.post('/api/collection/B1/chat-refresh',body),{status:400,body:{ok:false,code:'invalid_request'}},JSON.stringify(body));
  assert.equal((await f.post('/api/collection/B1/chat-refresh','{',{raw:true})).status,400);
  assert.equal((await f.post('/api/collection/B1/chat-refresh?borrowerId=B2',{})).status,400,'no query string');
  assert.equal((await f.post('/api/collection/'+'x'.repeat(257)+'/chat-refresh',{})).status,400,'borrower id bound');
  assert.equal((await f.post('/api/collection/B1/chat-refresh',{},{type:'text/plain'})).status,415);
  for(const method of ['GET','PATCH','DELETE'])assert.equal((await f.post('/api/collection/B1/chat-refresh',{},{method})).status,405,method);
  for(const path of ['/api/collection/chat-refresh','/api/collection/B1/B2/chat-refresh','/api/collection/B1/chat-refresh/more'])assert.equal((await f.post(path,{})).status,404,path);
  assert.equal(f.state.params.length,1,'no refused request reached the function');assert.equal(f.state.wakes,0);
 }finally{await f.close();}
 assert.equal(isReadRoute({operation:'chat_refresh',borrowerId:'B1'},'POST'),false);
});

test('R165 chat-refresh: pending and recent are successes (repeat taps are harmless); refusals map to 404, 400, 403, 409, 503',async()=>{
 const coded=(code,message='synthetic')=>()=>{throw Object.assign(Error(message),{code});};
 const recent={...OPEN,kind:'recent',completedAt:'2026-11-16T08:02:00.000Z',outcome:'unchanged'};
 for(const [answer,status,body] of [
  [()=>({rows:[{value:{...OPEN,kind:'pending'}}]}),200,{ok:true,...OPEN,kind:'pending'}],
  [()=>({rows:[{value:recent}]}),200,{ok:true,...recent}],
  [coded('P0002','unknown_borrower'),404,{ok:false,code:'not_found'}],
  [coded('22023','invalid_request'),400,{ok:false,code:'invalid_request'}],
  [coded('42501','access_denied'),403,{ok:false,code:'access_denied'}],
  [coded('55P03'),409,{ok:false,code:'command_busy'}],
  [coded('42883','function does not exist'),503,{ok:false,code:'command_unavailable'}],
  [()=>({rows:[{value:{...OPEN,kind:'stored'}}]}),503,{ok:false,code:'command_unavailable'}],
  [()=>({rows:[{value:{...OPEN,outcome:'done'}}]}),503,{ok:false,code:'command_unavailable'}],
  [()=>({rows:[{value:{...OPEN,requestedAt:'later'}}]}),503,{ok:false,code:'command_unavailable'}],
  [()=>({rows:[]}),503,{ok:false,code:'command_unavailable'}]]){
  const f=await fixture({answer});
  try{
   assert.deepEqual(await f.post('/api/collection/B1/chat-refresh',{}),{status,body},JSON.stringify(body));
   assert.equal(f.state.wakes,0);assert.equal(f.state.released,1);assert.equal(f.state.sql.includes(status===200?'COMMIT':'ROLLBACK'),true);
  }finally{await f.close();}
 }
 const denied=await fixture({actor:null});
 try{assert.deepEqual(await denied.post('/api/collection/B1/chat-refresh',{}),{status:403,body:{ok:false,code:'access_denied'}});assert.equal(denied.state.params.length,0);}finally{await denied.close();}
 const source=readFileSync(new URL('../../services/payment-command/store.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async requestChatRefresh('),end=source.indexOf('/** R149:',start);
 assert.ok(start>0&&end>start);assert.doesNotMatch(source.slice(start,end),/ownerTesting|fixture/,'not gated on ownerTesting');
});

// ---- Agent routes ---------------------------------------------------------------------------------------------------
const policy={environment:'dev',audience:'https://command.invalid',callerEmail:'agent@example.invalid',callerSubject:'123456789'};
async function agent(run,{currentPolicy=policy}={}){
 const state={valid:true,calls:[],params:[],rows:[{borrowerId:'B-A',requestId:OPEN.requestId,requestedAt:OPEN.requestedAt}],result:{kind:'completed'},error:null,wakes:0};
 const pool={connect:async()=>({query:async(sql,params)=>{state.calls.push(sql);
   if(sql===groupChatRefreshesSql){if(state.error)throw state.error;return {rows:state.rows};}
   if(sql.includes('pwa_complete_group_chat_refresh_v1')){state.params.push(params);if(state.error)throw state.error;return {rows:[{value:state.result}]};}
   return {rows:[]};},release(quarantine){state.calls.push(quarantine?'release-quarantine':'release');}})};
 const handler=createAgentReceiptHandler({next:(_req,res)=>{res.writeHead(401);res.end('human gate');},policy:currentPolicy,pool,guardConnection:async()=>{},afterCommit:async()=>{state.wakes++;},
  verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:state.valid?policy.callerEmail:'other@example.invalid',sub:policy.callerSubject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const call=(method,body,{raw,path='/internal/agent/group-chat-refreshes',headers={Authorization:'Bearer test'}}={})=>fetch(origin+path,{method,headers:{...headers,'Content-Type':'application/json'},body:method==='GET'?undefined:raw??JSON.stringify(body)});
 try{await run({state,call});}finally{await new Promise(r=>server.close(r));}
}
const command={schemaVersion:1,environment:'dev',requestId:OPEN.requestId,outcome:'stored'};

test('R165 agent GET: open requests younger than 10 minutes, oldest first, at most 20, read only, for the policy environment',async()=>{
 await agent(async({state,call})=>{
  const response=await call('GET');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{environment:'dev',requests:[{borrowerId:'B-A',requestId:OPEN.requestId,requestedAt:OPEN.requestedAt}]});
  assert.deepEqual(state.calls.filter(sql=>!sql.startsWith('SET LOCAL')),['BEGIN READ ONLY',groupChatRefreshesSql,'COMMIT','release']);
  state.rows=[{borrowerId:'',requestId:'x',requestedAt:'y'},{borrowerId:'B-B',requestId:OPEN.requestId,requestedAt:OPEN.requestedAt}];
  assert.deepEqual((await (await call('GET')).json()).requests.map(row=>row.borrowerId),['B-B'],'an invalid row is left out');
  state.error=Object.assign(Error('relation does not exist'),{code:'42P01'});
  const before=await call('GET');assert.equal(before.status,503);assert.deepEqual(await before.json(),{error:'refresh_unavailable'},'a database before V150');
  assert.equal(state.wakes,0);
 });
 // The TTL filter, order and limit live in the SQL; only open requests are handed out.
 assert.match(groupChatRefreshesSql,/r\.completed_at IS NULL/);assert.match(groupChatRefreshesSql,/r\.requested_at>clock_timestamp\(\)-interval '10 minutes'/);
 assert.match(groupChatRefreshesSql,/ORDER BY r\.requested_at,r\.borrower_id COLLATE "C" LIMIT 20$/);assert.doesNotMatch(groupChatRefreshesSql,/requested_by/);
});

test('R165 agent POST: the canonical command reaches the completion in one transaction; 22023 is 400; an unknown commit is quarantined',async()=>{
 await agent(async({state,call})=>{
  for(const kind of ['completed','replayed','unknown_request']){state.result={kind};const response=await call('POST',{command:Object.fromEntries(Object.entries(command).reverse())});
   assert.equal(response.status,200);assert.deepEqual(await response.json(),{kind});}
  assert.deepEqual(state.params[0],[JSON.stringify({command})],'canonical key order');
  assert.equal(state.calls.some(sql=>sql.includes('"Partners"')),false,'no actor Partner');assert.equal(state.wakes,0);
  state.result={kind:'stored'};assert.equal((await call('POST',{command})).status,503,'an unexpected result is not a success');
  state.result={kind:'completed'};
  state.error=Object.assign(Error('invalid_request'),{code:'22023'});assert.deepEqual(await (await call('POST',{command})).json(),{error:'invalid_refresh_command'});
  state.error=Object.assign(Error('lock'),{code:'55P03'});const busy=await call('POST',{command});assert.equal(busy.status,503);assert.deepEqual(await busy.json(),{error:'refresh_unavailable'});
 });
 const calls=[];
 const pool={connect:async()=>({query:async sql=>{calls.push(sql);if(sql==='COMMIT')throw Error('socket closed');return sql.includes('pwa_complete')?{rows:[{value:{kind:'completed'}}]}:{rows:[]};},release(quarantine){calls.push('release:'+Boolean(quarantine));}})};
 const handler=createAgentReceiptHandler({next:()=>{},policy,pool,guardConnection:async()=>{},verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:policy.callerEmail,sub:policy.callerSubject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/internal/agent/group-chat-refreshes',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({command})});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'refresh_outcome_unknown'});assert.equal(calls.at(-1),'release:true');
 }finally{await new Promise(r=>server.close(r));}
});

test('R165 agent routes: 401 before the body or the database; 400 for a bad body or another environment; 404 off-policy and for other paths',async()=>{
 await agent(async({state,call})=>{
  state.valid=false;
  for(const method of ['GET','POST']){const response=await call(method,{command});assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorized'});}
  state.valid=true;assert.equal((await call('GET',null,{headers:{}})).status,401);assert.equal((await call('POST',{command},{headers:{}})).status,401);
  assert.equal(state.calls.length,0);
  const bad=[{command:{...command,environment:'prod'}},{command,actorPartnerId:'P'},{},{command:null},[{command}],{command:{...command,outcome:'pending'}},{command:{...command,outcome:'STORED'}},
   {command:{...command,requestId:OPEN.requestId.toUpperCase()}},{command:{...command,requestId:'x'}},{command:{...command,schemaVersion:2}},{command:{...command,schemaVersion:'1'}},
   {command:{...command,borrowerId:'B-A'}},{command:{schemaVersion:1,environment:'dev',requestId:OPEN.requestId}}];
  for(const body of bad){const response=await call('POST',body);assert.equal(response.status,400,JSON.stringify(body));assert.deepEqual(await response.json(),{error:'invalid_refresh_command'});}
  for(const raw of ['not json','',JSON.stringify({command})+' '.repeat(4096)])assert.equal((await call('POST',null,{raw})).status,400);
  assert.equal(state.params.length,0,'nothing refused reached the database');
  for(const method of ['PUT','DELETE','PATCH'])assert.equal((await call(method,{command})).status,404,method);
  for(const path of ['/internal/agent/group-chat-refreshes/'+OPEN.requestId,'/internal/agent/group-chat-refreshes?x=1','/internal/agent/group-chat-refresh'])assert.equal((await call('GET',null,{path})).status,404,path);
 });
 await agent(async({state,call})=>{assert.equal((await call('GET')).status,404);assert.equal((await call('POST',{command})).status,404);assert.equal(state.calls.length,0);},{currentPolicy:null});
 assert.deepEqual(Object.keys(canonicalGroupChatRefresh({outcome:'failed',requestId:OPEN.requestId,environment:'prod',schemaVersion:1})),['schemaVersion','environment','requestId','outcome']);
 for(const outcome of ['stored','unchanged','cleared','no_group','failed'])assert.equal(canonicalGroupChatRefresh({...command,outcome}).outcome,outcome);
});

// ---- Read side ------------------------------------------------------------------------------------------------------
test('R165 the detail carries groupChatRefresh beside groupChat: the request state, null without a row, absent without V150 or the reader grant',async()=>{
 const {readCollection,groupChatRefreshAllowedSql,groupChatRefreshDetailSql,GROUP_CHAT_REFRESH_COLUMNS,projectGroupChatRefresh}=await import('../../services/api/collection-read-contract.mjs');
 const row=id=>({id,rank:0,overdue_days:null,borrower_name:id,amount_due:'100',amount_collected:'0',amount_remaining:'100',prepaid_today:'0',prepaid_only:false,prepaid_payment_date:null});
 const stored={borrower_id:'a',requested_at:new Date('2026-11-16T08:00:00Z'),completed_at:'2026-11-16T08:03:00.000Z',outcome:'unchanged'};
 const run=async(allowed,{none=false,borrowerId='a'}={})=>{const calls=[];const client={query:async(sql,args)=>{calls.push(sql);
   if(sql.includes('CURRENT_TIMESTAMP AS "asOf"'))return {rows:[{asOf:'2026-11-16T08:05:00Z',businessDate:'2026-11-16'}]};
   if(sql.includes('AS invalid'))return {rows:[{invalid:false}]};
   if(sql===groupChatRefreshAllowedSql){if(allowed==='missing')return {rows:[]};return {rows:[{allowed}]};}
   if(sql===groupChatRefreshDetailSql){assert.deepEqual(args,['a']);return {rows:none?[]:[stored]};}
   if(sql.includes('pwa_group_chat_refresh_requests'))throw Object.assign(Error('permission denied'),{code:'42501'});
   if(sql.includes('AS allowed'))return {rows:[{allowed:false}]};
   if(sql.endsWith('SELECT * FROM summaries'))return {rows:[row('a')]};
   if(sql.includes('SELECT id, loan_id, payment_status'))return {rows:[]};
   return {rows:[row('a'),row('b')]};}};
  return {value:await readCollection(client,{limit:10,after:null,...(borrowerId?{borrowerId}:{})}),calls};};
 const detail=await run(true);
 assert.deepEqual(detail.value.groupChatRefresh,{requestedAt:'2026-11-16T08:00:00.000Z',completedAt:'2026-11-16T08:03:00.000Z',outcome:'unchanged'});
 assert.deepEqual(Object.keys(detail.value),['businessDate','asOf','timezone','borrower','groupChat','groupChatRefresh','items','nextCursor'],'a sibling of groupChat');
 assert.equal((await run(true,{none:true})).value.groupChatRefresh,null,'no request: null');
 for(const allowed of [false,'missing',null]){const without=await run(allowed);assert.equal('groupChatRefresh' in without.value,false,String(allowed));assert.equal(without.calls.includes(groupChatRefreshDetailSql),false);}
 const list=await run(true,{borrowerId:null});assert.equal('groupChatRefresh' in list.value,false,'the list never reads it');assert.equal(list.calls.includes(groupChatRefreshAllowedSql),false);
 // The guard and the read name exactly the four reader columns, through the alias r; never request_id or requested_by.
 assert.deepEqual(GROUP_CHAT_REFRESH_COLUMNS,['borrower_id','requested_at','completed_at','outcome']);
 assert.match(groupChatRefreshAllowedSql,/to_regclass\('public\.pwa_group_chat_refresh_requests'\)/);assert.match(groupChatRefreshDetailSql,/FROM public\.pwa_group_chat_refresh_requests r WHERE r\.borrower_id = \$1$/);
 for(const sql of [groupChatRefreshAllowedSql,groupChatRefreshDetailSql])assert.doesNotMatch(sql,/request_id|requested_by|now\(\)|interval|clock_timestamp/);
 const contract=JSON.parse(readFileSync(new URL('../../scripts/production/reader-capability-contract.json',import.meta.url),'utf8')).columnSelect.pwa_group_chat_refresh_requests;
 assert.deepEqual([...contract].sort(),[...GROUP_CHAT_REFRESH_COLUMNS].sort(),'the reader contract grants exactly the columns the read selects');
 // A row that is not the V150 shape is dropped (display only).
 assert.deepEqual(projectGroupChatRefresh({...stored,completed_at:null,outcome:null}),{requestedAt:'2026-11-16T08:00:00.000Z',completedAt:null,outcome:null});
 for(const bad of [{requested_at:'x'},{completed_at:null},{outcome:null},{outcome:'pending'},{completed_at:'x'}])assert.equal(projectGroupChatRefresh({...stored,...bad}),null,JSON.stringify(bad));
 assert.equal(projectGroupChatRefresh(undefined),null);
});

test('R165 offline: the collection bundle carries groupChatRefreshByBorrower; a refresh row change is keyed by its borrower',async()=>{
 const {projectGroupChatRefreshRows,resolveCollectionScope}=await import('../../services/business/offline-dataset-chunks.mjs');
 const {offlineSourceTables}=await import('../../services/business/offline-dataset-delta.mjs');
 assert.deepEqual(projectGroupChatRefreshRows([{borrower_id:'A',requested_at:'2026-11-16T08:00:00Z',completed_at:null,outcome:null},{borrower_id:'B',requested_at:'x',completed_at:null,outcome:null}]),
  [{borrowerId:'A',requestedAt:'2026-11-16T08:00:00.000Z',completedAt:null,outcome:null}]);
 assert.ok(offlineSourceTables.collection.includes('pwa_group_chat_refresh_requests'));
 for(const domain of ['records','cash','management'])assert.equal(offlineSourceTables[domain].includes('pwa_group_chat_refresh_requests'),false,domain);
 const queries=[];const client={query:async sql=>{queries.push(sql);if(sql.includes('"Hidden Flag" IS TRUE'))return {rowCount:0,rows:[]};return {rows:[],rowCount:0};}};
 const scope=await resolveCollectionScope(client,[{table:'pwa_group_chat_refresh_requests',key:'B-2'},{table:'pwa_group_chat_refresh_requests',key:'B-1'}]);
 assert.deepEqual(scope,{borrowers:['B-1','B-2'],loans:[]});
 const source=readFileSync(new URL('../../services/business/offline-dataset-chunks.mjs',import.meta.url),'utf8');
 assert.match(source,/replaceWhere\('groupChatRefreshByBorrower','borrowerId',B,refreshes,'borrowerId'\)/,'the targeted delta replaces the borrowers\' rows');
 const pwa=readFileSync(new URL('../../apps/pwa/src/offline-dataset.ts',import.meta.url),'utf8');
 assert.match(pwa,/data\.groupChatRefreshByBorrower/);assert.match(pwa,/\{groupChatRefresh:refreshRow\?/);
});

// ---- PWA rules (chat-refresh.ts) and the card -----------------------------------------------------------------------
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/chat-refresh.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const pwa=await import('data:text/javascript,'+encodeURIComponent(source));
const at=Date.parse('2026-11-16T08:00:00Z'),open={requestedAt:'2026-11-16T08:00:00.000Z',completedAt:null,outcome:null};
const done=outcome=>({...open,completedAt:'2026-11-16T08:03:00.000Z',outcome});

test('R165 PWA: pending for 6 minutes, then a timeout; outcomes only for the request this view watched; a failed tap',()=>{
 assert.equal(pwa.CHAT_REFRESH_CUTOFF_MS,360000);assert.equal(pwa.CHAT_REFRESH_POLL_MS,15000);
 assert.equal(pwa.refreshPhase(null,null,at),'idle');
 assert.equal(pwa.refreshPhase(open,null,at+359999),'pending','pending shows even when another device tapped');
 assert.equal(pwa.refreshPhase(open,open.requestedAt,at+360000),'timeout');assert.equal(pwa.refreshPhase(open,null,at+360000),'idle','an old open request from another visit shows nothing');
 assert.equal(pwa.refreshRemaining(open,at+60000),300000);assert.equal(pwa.refreshRemaining(open,at+400000),0);
 for(const [outcome,phase] of [['stored','stored'],['unchanged','unchanged'],['cleared','cleared'],['no_group','failed'],['failed','failed']]){
  assert.equal(pwa.refreshPhase(done(outcome),open.requestedAt,at+200000),phase,outcome);
  assert.equal(pwa.refreshPhase(done(outcome),null,at+200000),'idle','not watched: '+outcome);
 }
 assert.equal(pwa.refreshPhase(done('stored'),'2026-11-16T07:00:00.000Z',at),'idle','another request');
 assert.equal(pwa.refreshPhase(null,null,at,true),'failed','a tap the service did not take');
 assert.equal(pwa.refreshPhase(open,null,at,true),'pending','a pending request wins over an earlier failed tap');
 // Merge: the later request wins; for the same request the completed one (a completion never goes back to open).
 assert.deepEqual(pwa.mergeRefresh(open,done('stored')),done('stored'));assert.deepEqual(pwa.mergeRefresh(done('stored'),open),done('stored'));
 const later={...open,requestedAt:'2026-11-16T08:10:00.000Z'};assert.deepEqual(pwa.mergeRefresh(done('stored'),later),later);
 assert.deepEqual(pwa.mergeRefresh(undefined,open),open);assert.equal(pwa.mergeRefresh(null,{requestedAt:'x'}),null);
 for(const bad of [{...open,outcome:'stored'},{...open,completedAt:'2026-11-16T08:03:00Z'},{...done('stored'),outcome:'pending'},[],null])assert.equal(pwa.validRefresh(bad),null,JSON.stringify(bad));
});

test('R165 PWA clock skew: the 6-minute wait runs on the device clock from the tap or the first sight, never longer',()=>{
 const minute=60000,server=Date.parse(open.requestedAt);
 // Device clock 1 hour behind the server: the requestedAt lies in its future. Without a sight it counts from now (never
 // 66 minutes); from the tap or the first sight it is exactly 6 minutes.
 const behind=server-3600000;
 assert.equal(pwa.refreshPending(open,behind),true);assert.equal(pwa.refreshRemaining(open,behind),pwa.CHAT_REFRESH_CUTOFF_MS);
 assert.equal(pwa.refreshObservable(open,behind),true,'a future request is one to wait for');
 assert.equal(pwa.refreshRemaining(open,behind+5*minute,behind),minute);assert.equal(pwa.refreshPending(open,behind+6*minute,behind),false);
 assert.equal(pwa.refreshPhase(open,open.requestedAt,behind+6*minute,false,behind),'timeout','6 minutes after the tap, not after the server time');
 for(const now of [behind,behind+30*minute])assert.ok(pwa.refreshRemaining(open,now,behind+30*minute)<=pwa.CHAT_REFRESH_CUTOFF_MS);
 // Device clock 7 minutes ahead: the request looks 7 minutes old at once. By the requestedAt alone it would time out
 // immediately; from the tap or the first sight it is still pending for the full 6 minutes.
 const ahead=server+7*minute;
 assert.equal(pwa.refreshPending(open,ahead),false,'by the server time alone');
 assert.equal(pwa.refreshObservable(open,ahead),true,'within the server\'s 10-minute open window');
 assert.equal(pwa.refreshPhase(open,open.requestedAt,ahead,false,ahead),'pending');
 assert.equal(pwa.refreshRemaining(open,ahead+minute,ahead),5*minute);assert.equal(pwa.refreshPhase(open,open.requestedAt,ahead+6*minute,false,ahead),'timeout');
 // A request older than the server's open window by the device clock is one the server no longer serves: not observed.
 assert.equal(pwa.CHAT_REFRESH_OPEN_MS,600000);assert.equal(pwa.refreshObservable(open,server+10*minute),false);
 assert.equal(pwa.refreshObservable(done('stored'),server),false,'a completed request is not waited for');
 const card=readFileSync(new URL('../../apps/pwa/src/CollectionChatSummary.tsx',import.meta.url),'utf8');
 assert.match(card,/setSeen\(\{requestedAt:result\.state\.requestedAt,at:Date\.now\(\)\}\)/,'the tap anchors its own wait');
 assert.match(card,/refreshObservable\(current,Date\.now\(\)\)\)setSeen\(/,'a request first seen open anchors at the sight');
 assert.match(card,/refreshPhase\(current,watched,at,tapFailed,seenAt\)/);
});

test('R165 PWA texts: labels, titles (retry, offline), meta lines and the live-region announcements in both languages',()=>{
 const en=(phase,online=true)=>pwa.refreshTexts(phase,false,online,'15:03'),th=(phase,online=true)=>pwa.refreshTexts(phase,true,online,'15:03');
 assert.deepEqual(en('idle'),{label:'Refresh group chat summary',title:'Refresh group chat summary',meta:null,announce:''});
 assert.deepEqual(th('idle'),{label:'รีเฟรชสรุปแชทกลุ่ม',title:'รีเฟรชสรุปแชทกลุ่ม',meta:null,announce:''});
 assert.deepEqual(en('pending'),{label:'Refresh group chat summary',title:'Refresh group chat summary',meta:'Refreshing summary… this can take a few minutes',announce:'Refreshing summary'});
 assert.deepEqual([th('pending').meta,th('pending').announce],['กำลังรีเฟรชสรุป… อาจใช้เวลาสักครู่','กำลังรีเฟรชสรุป']);
 assert.deepEqual([en('stored').meta,en('stored').announce,th('stored').announce],[null,'Summary updated','อัปเดตสรุปแล้ว'],'stored: the normal Updated line');
 assert.deepEqual([en('unchanged').meta,th('unchanged').meta],['No new messages · checked 15:03','ไม่มีข้อความใหม่ · ตรวจเมื่อ 15:03']);
 assert.deepEqual([en('failed').meta,en('failed').title],['Couldn’t refresh the summary. Showing the last one.','Refresh failed — tap to retry']);
 assert.deepEqual([th('failed').meta,th('failed').title],['รีเฟรชสรุปไม่สำเร็จ แสดงสรุปล่าสุดแทน','รีเฟรชไม่สำเร็จ — แตะเพื่อลองอีกครั้ง']);
 assert.deepEqual([en('timeout').meta,th('timeout').meta,en('timeout').announce],['Still not updated. Try again later.','ยังไม่อัปเดต ลองอีกครั้งภายหลัง','Still not updated. Try again later.']);
 assert.equal(en('idle',false).title,'Refresh needs an internet connection');assert.equal(th('failed',false).title,'ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อรีเฟรช');
 assert.equal(en('pending',false).title,'Refresh group chat summary','a pending request offline keeps its state');
});

test('R165 PWA request: POST {} to the command service; accepted, pending and recent are taken; anything else is a failure',async()=>{
 const calls=[];let reply={status:200,body:{ok:true,...OPEN}};const failures=[];
 const access={origin:'https://command.example.invalid',token:async()=>'token-1',authFailure:status=>failures.push(status)};
 const fetcher=async(url,init)=>{calls.push({url,...init});if(reply==='network')throw TypeError('offline');return new Response(JSON.stringify(reply.body),{status:reply.status})};
 assert.deepEqual(await pwa.requestChatRefresh(access,'B one/2',fetcher),{ok:true,kind:'accepted',state:open});
 assert.deepEqual(calls[0],{url:'https://command.example.invalid/api/collection/B%20one%2F2/chat-refresh',method:'POST',headers:{Authorization:'Bearer token-1','Content-Type':'application/json'},body:'{}',cache:'no-store',credentials:'omit',redirect:'error'});
 reply={status:200,body:{ok:true,...OPEN,kind:'pending'}};assert.equal((await pwa.requestChatRefresh(access,'B1',fetcher)).kind,'pending','a repeat tap answers the same request');
 reply={status:200,body:{ok:true,...OPEN,kind:'recent',completedAt:'2026-11-16T08:01:00.000Z',outcome:'unchanged'}};assert.equal((await pwa.requestChatRefresh(access,'B1',fetcher)).state.outcome,'unchanged');
 for(const [value,status] of [[{status:503,body:{ok:false}},503],[{status:404,body:{ok:false}},404],[{status:200,body:{ok:true,kind:'stored',...open}},200],[{status:200,body:{ok:true,kind:'accepted'}},200],['network',0]]){
  reply=value;assert.deepEqual(await pwa.requestChatRefresh(access,'B1',fetcher),{ok:false,status});
 }
 reply={status:401,body:{ok:false}};assert.deepEqual(await pwa.requestChatRefresh(access,'B1',fetcher),{ok:false,status:401});assert.deepEqual(failures,[401]);
});

test('R165 card markup: icon-only 44px button, aria-disabled (not disabled) while pending, spinner hidden, one polite status region',()=>{
 const card=readFileSync(new URL('../../apps/pwa/src/CollectionChatSummary.tsx',import.meta.url),'utf8');
 assert.match(card,/className="secondary-button icon-action collection-chat-refresh" aria-label=\{texts\.label\} title=\{texts\.title\} aria-disabled=\{busy\?'true':undefined\} disabled=\{!busy&&!online\}/);
 assert.match(card,/\{busy\?<span className="collection-spinner" aria-hidden="true"><\/span>:<Icon name="refresh"\/>\}/);
 assert.match(card,/if\(!refresh\?\.access\|\|busy\|\|!online\)return;/,'taps are ignored while pending or offline');
 assert.equal((card.match(/role="status"/g)??[]).length,1);assert.match(card,/className="visually-hidden" role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(card,/<div className="collection-chat-title"><h3 id=\{titleId\}>/);assert.doesNotMatch(card,/\.focus\(/,'focus never moves');
 assert.match(card,/if\(!groupChat\|\|phase==='cleared'\)return null;/,'no summary, no card; cleared takes the card away');
 const css=readFileSync(new URL('../../apps/pwa/src/live-style.css',import.meta.url),'utf8'),demo=readFileSync(new URL('../../apps/pwa/src/style.css',import.meta.url),'utf8');
 assert.match(css,/\.collection-chat-heading\{display:flex;flex-wrap:nowrap;align-items:center;gap:8px\}/);
 assert.match(css,/\.collection-chat-title\{display:flex;flex:1 1 auto;min-width:0;flex-wrap:wrap;align-items:center;gap:8px\}/);
 assert.match(css,/\.collection-chat-heading>\.collection-chat-refresh\{flex:0 0 44px;margin:0\}/);
 assert.match(demo,/\.collection-chat-summary \.collection-chat-title\{display:flex;flex:1 1 auto;min-width:0;flex-wrap:wrap;align-items:center;gap:8px\}/);
 const records=readFileSync(new URL('../../apps/pwa/src/CollectionRecords.tsx',import.meta.url),'utf8');
 assert.match(records,/refresh=\{commandAccess\?\{access:commandAccess,server:groupChatRefresh,online:online&&!commandAccess\.offlineOnly,poll:pollChatRefresh\}:undefined\}/);
 assert.match(records,/window\.dispatchEvent\(new CustomEvent\('mw-offline-prepare',\{detail:\{domain:'collection'\}\}\)\)/,'the poll is a collection delta check');
});
