// R106 D1/D7: the chat service's command-service client (services/chat/command-client.mjs) and the confirm and
// reconcile paths (services/chat/proposals.mjs executeProposal / reconcileProposal) over a fake fetch and an
// in-memory proposal store with the V118 claim/settle rules. Synthetic tokens and ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandClient,CommandUnavailable,COMMAND_TIMEOUT_MS} from '../../services/chat/command-client.mjs';
import {executeProposal,reconcileProposal,STALE_CLAIM_MS} from '../../services/chat/proposals.mjs';

const BASE='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app';
const AUTH='Bearer aaa.bbb.ccc';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function fetcher(script){
 const calls=[];
 const fetch=async(url,init)=>{calls.push({url,init});const next=script.shift();if(!next)throw Error('script exhausted');return typeof next==='function'?next(url,init):next;};
 return {calls,fetch};
}
const client=(script,extra={})=>{const f=fetcher(script);return {...f,client:createCommandClient({baseUrl:BASE,authorization:AUTH,fetch:f.fetch,sleep:async()=>{},...extra})};};

test('the Partner token is forwarded, no Origin, the wake deadline passes; only the command origin and a JWT are accepted',async()=>{
 const {calls,client:c}=client([json(200,{kind:'unresolved'})],{wakeDeadline:'1790000000000'});
 assert.deepEqual(await c.status('operation','00000000-0000-4000-8000-000000000001'),{kind:'unresolved'});
 const {url,init}=calls[0];
 assert.equal(url,BASE+'/api/operations/00000000-0000-4000-8000-000000000001');
 assert.equal(init.headers.Authorization,AUTH);assert.equal(init.headers['X-MW-Wake-Deadline'],'1790000000000');
 assert.equal(Object.keys(init.headers).some(k=>k.toLowerCase()==='origin'),false);assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);
 assert.throws(()=>createCommandClient({baseUrl:BASE+'/api',authorization:AUTH}),/Invalid command client/);
 assert.throws(()=>createCommandClient({baseUrl:BASE,authorization:'Bearer not-a-jwt'}),/Invalid command client/);
 assert.throws(()=>createCommandClient({baseUrl:BASE,authorization:'Basic x'}),/Invalid command client/);
 const pay=client([json(200,{kind:'recorded',originalOutcome:{status:'posted'}})]);
 await pay.client.status('payment','00000000-0000-4000-8000-000000000002');assert.equal(pay.calls[0].url,BASE+'/api/payment-commands/00000000-0000-4000-8000-000000000002');
});

test('15 s abort: a hung request is a timeout (unavailable before a POST, unknown after it)',async()=>{
 assert.equal(COMMAND_TIMEOUT_MS,15000);
 const hang=(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));
 const {client:c}=client([hang,hang],{timeoutMs:20});
 await assert.rejects(c.status('operation','00000000-0000-4000-8000-000000000001'),e=>e instanceof CommandUnavailable&&e.reason==='timeout');
 assert.deepEqual(await c.submit('operation','{"requestId":"x"}'),{result:'unknown',reason:'timeout'});
});

test('submit: recorded, busy retried twice with the same body then busy, rejected codes, 5xx and malformed are unknown',async()=>{
 const body='{"requestId":"00000000-0000-4000-8000-000000000001","operation":"expense.delete"}';
 let t=client([json(200,{kind:'recorded',originalOutcome:{status:'applied',code:null}})]);
 assert.equal((await t.client.submit('operation',body)).result,'recorded');
 assert.equal(t.calls[0].init.method,'POST');assert.equal(t.calls[0].init.body,JSON.stringify(JSON.parse(body)));assert.equal(t.calls[0].init.headers['Content-Type'],'application/json');
 const slept=[];t=client([json(409,{ok:false,code:'command_busy'}),json(409,{ok:false,code:'command_busy'}),json(409,{ok:false,code:'command_busy'})],{sleep:async ms=>{slept.push(ms);}});
 assert.deepEqual(await t.client.submit('operation',body),{result:'busy'});assert.deepEqual(slept,[1000,2000]);assert.equal(t.calls.length,3);
 assert.ok(t.calls.every(c=>c.init.body===t.calls[0].init.body),'the same request id every time');
 t=client([json(409,{ok:false,code:'command_busy'}),json(200,{kind:'recorded',originalOutcome:{status:'posted',paymentId:'PM1'}})]);
 assert.equal((await t.client.submit('payment',body)).result,'recorded');
 t=client([json(422,{ok:false,code:'borrower_name_required'})]);assert.deepEqual((await t.client.submit('operation',body)).code,'borrower_name_required');
 t=client([json(409,{kind:'conflict'})]);assert.equal((await t.client.submit('operation',body)).code,'command_conflict');
 t=client([json(503,{ok:false,code:'operation_outcome_unknown'})]);assert.deepEqual(await t.client.submit('operation',body),{result:'unknown',reason:'operation_outcome_unknown'});
 t=client([new Response('<html>',{status:502})]);assert.deepEqual(await t.client.submit('operation',body),{result:'unknown',reason:'malformed'});
 t=client([()=>{throw TypeError('fetch failed');}]);assert.deepEqual(await t.client.submit('operation',body),{result:'unknown',reason:'network'});
 t=client([new Response('[1]',{status:200})]);await assert.rejects(t.client.status('operation','00000000-0000-4000-8000-000000000001'),e=>e instanceof CommandUnavailable&&e.reason==='malformed');
});

/** In-memory proposals with the V118 claim/settle rules. */
function proposals(initial){
 const rows=new Map(initial.map(p=>[p.id,{attempts:0,claimedAt:null,outcome:null,record:null,settledAt:null,...p}]));const log=[];
 const view=p=>({...p});
 return {rows,log,
  async claimProposal(_p,_t,id){const p=rows.get(id);log.push(['claim',id]);
   if(p.state==='pending'){p.state='executing';p.attempts++;p.claimedAt=new Date().toISOString();return {claimed:true,proposal:view(p),command:p.command};}
   if(p.state==='executing'&&Date.now()-Date.parse(p.claimedAt)<STALE_CLAIM_MS)throw Object.assign(Error('proposal_executing'),{code:'55006'});
   return {claimed:false,proposal:view(p)};},
  async settleProposal(_p,_t,id,s){const p=rows.get(id);log.push(['settle',id,s.state,s.outcome?.code??null]);
   if(['executing','unknown'].includes(p.state)){p.state=s.state;p.outcome=s.outcome?{code:s.outcome.code}:null;p.record=s.record;}return view(p);},
 };
}
const ID='00000000-0000-4000-8000-0000000000c1';
const op={id:ID,kind:'operation',operation:'expense.create',state:'pending',card:{target:{id:'E1'}},command:JSON.stringify({requestId:ID,operation:'expense.create',targetId:'E1'})};

test('confirm: the status is read before the POST; recorded first means no POST; unresolved posts once; record link',async()=>{
 let store=proposals([op]),t=client([json(200,{kind:'unresolved'}),json(200,{kind:'recorded',originalOutcome:{status:'applied',code:null,result:{id:'E1'},recordedAt:'2026-10-30T03:00:00.000Z'}})]);
 let item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client});
 assert.deepEqual([item.state,item.record],['done',{type:'expense',id:'E1',paymentId:null}]);assert.equal(item.attempts,undefined,'internal fields stripped');
 assert.deepEqual(t.calls.map(c=>c.init.method),['GET','POST']);
 // A repeat tap returns the stored outcome without any request.
 item=await executeProposal({store,principal:{},thread:'T',id:ID,client:client([]).client});assert.equal(item.state,'done');
 // Already recorded (an earlier attempt's POST landed): settle from the journal, no second POST.
 store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date().toISOString()}]);t=client([json(200,{kind:'recorded',originalOutcome:{status:'rejected',code:'source_conflict'}})]);
 item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client});
 assert.deepEqual([item.state,item.outcome],['failed',{code:'source_conflict'}]);assert.equal(t.calls.length,1);
 // A payment links the posted payment.
 store=proposals([{...op,kind:'payment',operation:'payment.record'}]);t=client([json(200,{kind:'unresolved'}),json(200,{kind:'recorded',originalOutcome:{status:'posted',paymentId:'PM9'}})]);
 assert.deepEqual((await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client})).record,{type:'payment',id:'PM9',paymentId:'PM9'});
 assert.equal(t.calls[1].url,BASE+'/api/payment-commands');
});

test('confirm: busy -> failed command_busy; lost answer -> unknown; status unavailable -> failed first time, unknown on a re-claim',async()=>{
 let store=proposals([op]),t=client([json(200,{kind:'unresolved'}),json(409,{code:'command_busy'}),json(409,{code:'command_busy'}),json(409,{code:'command_busy'})]);
 assert.deepEqual((await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client})).outcome,{code:'command_busy'});
 store=proposals([op]);t=client([json(200,{kind:'unresolved'}),()=>{throw TypeError('reset');}]);
 const item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client});
 assert.deepEqual([item.state,item.outcome],['unknown',{code:'outcome_unknown'}]);
 store=proposals([op]);t=client([json(503,{code:'command_unavailable'})]);
 assert.deepEqual((await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client})).outcome,{code:'command_unavailable'});
 store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date().toISOString()}]);t=client([json(503,{code:'command_unavailable'})]);
 assert.equal((await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client})).state,'unknown');assert.equal(t.calls.length,1);
 // A second tap while the first executes: 409 proposal_executing from the claim.
 store=proposals([{...op,state:'executing',attempts:1,claimedAt:new Date().toISOString()}]);
 await assert.rejects(executeProposal({store,principal:{},thread:'T',id:ID,client:client([]).client}),/proposal_executing/);
});

test('reconcile (GET): unknown resolves from the journal; unresolved stays unknown until the claim is three minutes old',async()=>{
 const now=Date.now();
 let store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date(now-10000).toISOString()}]);
 let item=await reconcileProposal({store,principal:{},thread:'T',proposal:store.rows.get(ID),client:client([json(200,{kind:'unresolved'})]).client,now:()=>now});
 assert.equal(item.state,'unknown');
 item=await reconcileProposal({store,principal:{},thread:'T',proposal:store.rows.get(ID),client:client([json(200,{kind:'recorded',originalOutcome:{status:'applied'}})]).client,now:()=>now});
 assert.deepEqual([item.state,item.record],['done',{type:'expense',id:'E1',paymentId:null}]);
 store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date(now-STALE_CLAIM_MS-1).toISOString()}]);
 item=await reconcileProposal({store,principal:{},thread:'T',proposal:store.rows.get(ID),client:client([json(200,{kind:'unresolved'})]).client,now:()=>now});
 assert.deepEqual([item.state,item.outcome],['failed',{code:'command_unavailable'}]);
 // A fresh executing claim is left alone (no request); pending is returned as is.
 const fresh={...op,state:'executing',claimedAt:new Date(now).toISOString()};
 assert.equal((await reconcileProposal({store:proposals([fresh]),principal:{},thread:'T',proposal:fresh,client:client([]).client,now:()=>now})).state,'executing');
 assert.equal((await reconcileProposal({store:proposals([op]),principal:{},thread:'T',proposal:op,client:client([]).client,now:()=>now})).state,'pending');
 // The journal unreachable: unchanged, never failed.
 const unknownRow={...op,state:'unknown',claimedAt:new Date(now-STALE_CLAIM_MS-1).toISOString()};
 assert.equal((await reconcileProposal({store:proposals([unknownRow]),principal:{},thread:'T',proposal:unknownRow,client:client([()=>{throw TypeError('down');}]).client,now:()=>now})).state,'unknown');
});

// Chase R106 review: a command is posted at most once per proposal.
const posts=calls=>calls.filter(c=>c.init.method==='POST').length;
test('confirm on an unknown proposal reconciles only: no POST, unresolved stays unknown until stale, recorded wins',async()=>{
 const now=Date.now();
 for(const answer of [json(200,{kind:'unresolved'}),json(409,{code:'command_busy'})]){
  const store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date(now-30000).toISOString()}]),t=client([answer]);
  const item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client,now:()=>now});
  assert.equal(item.state,'unknown');assert.equal(posts(t.calls),0);assert.equal(store.log.filter(([k])=>k==='settle').length,0);
 }
 let store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date(now-STALE_CLAIM_MS).toISOString()}]),t=client([json(200,{kind:'unresolved'})]);
 let item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client,now:()=>now});
 assert.deepEqual([item.state,item.outcome,posts(t.calls)],['failed',{code:'command_unavailable'},0]);
 store=proposals([{...op,state:'unknown',attempts:1,claimedAt:new Date(now-STALE_CLAIM_MS*10).toISOString()}]);t=client([json(200,{kind:'recorded',originalOutcome:{status:'applied',code:null}})]);
 item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client,now:()=>now});
 assert.deepEqual([item.state,posts(t.calls)],['done',0],'recorded wins even past the threshold');
});
test('a stale executing claim (dead instance) reconciles only: no POST; a fresh one answers 409 to a concurrent confirm',async()=>{
 const now=Date.now();
 let store=proposals([{...op,state:'executing',attempts:1,claimedAt:new Date(now-STALE_CLAIM_MS-1).toISOString()}]),t=client([json(200,{kind:'unresolved'})]);
 const item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client,now:()=>now});
 assert.deepEqual([item.state,item.outcome,posts(t.calls)],['failed',{code:'command_unavailable'},0]);
 store=proposals([{...op,state:'executing',attempts:1,claimedAt:new Date(now-STALE_CLAIM_MS-1).toISOString()}]);t=client([json(200,{kind:'recorded',originalOutcome:{status:'posted',paymentId:'PM2'}})]);
 assert.deepEqual([(await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client,now:()=>now})).state,posts(t.calls)],['done',0]);
 // Two confirms at once: the second meets the first claim.
 store=proposals([op]);let release;const gate=new Promise(r=>{release=r;});
 t=client([async()=>{await gate;return json(200,{kind:'unresolved'});},json(200,{kind:'recorded',originalOutcome:{status:'applied',code:null}})]);
 const first=executeProposal({store,principal:{},thread:'T',id:ID,client:t.client});
 await new Promise(r=>setImmediate(r));
 await assert.rejects(executeProposal({store,principal:{},thread:'T',id:ID,client:client([]).client}),/proposal_executing/);
 release();assert.equal((await first).state,'done');assert.equal(posts(t.calls),1);
});
test('busy: failed command_busy only for the first claim; a later attempt never posts and stays unknown',async()=>{
 let store=proposals([op]),t=client([json(200,{kind:'unresolved'}),json(409,{code:'command_busy'}),json(409,{code:'command_busy'}),json(409,{code:'command_busy'})]);
 assert.deepEqual((await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client})).outcome,{code:'command_busy'});
 // A claimed row with attempts > 1 (defensive: V118 never re-claims) settles unknown without a POST.
 store=proposals([op]);const claim=store.claimProposal.bind(store);store.claimProposal=async(...a)=>{const value=await claim(...a);value.proposal.attempts=2;return value;};
 t=client([json(200,{kind:'unresolved'})]);
 const item=await executeProposal({store,principal:{},thread:'T',id:ID,client:t.client});
 assert.deepEqual([item.state,item.outcome,posts(t.calls)],['unknown',{code:'outcome_unknown'},0]);
});
