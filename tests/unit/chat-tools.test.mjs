// R090: the read-only tool registry and bridge (services/chat/tools.mjs) and the in-process native read provider
// with the chat actor check (services/chat/service.mjs over services/agent-conversations/read-provider.mjs).
// Declarations as the agent's (uppercase types, every key required), data_catalogue shapes, every read_records
// validation code, the per-turn cache, sum_field, observation wrapping, summaries and the actor injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOLS,declarations,createChatTools,toolSummary,pyStr} from '../../services/chat/tools.mjs';
import {chatReadProvider} from '../../services/chat/service.mjs';

const ACTOR={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'s1',partnerId:'P1',loginEmail:'p1@example.invalid'};
const fields=[{name:'Row ID',sourceType:'Text',nativeStatus:'physical'},{name:'Amount Remaining',sourceType:'Price',nativeStatus:'physical'},
 {name:'Ref Loans',sourceType:'Ref',nativeStatus:'physical'},{name:'_RowNumber',sourceType:'Number',nativeStatus:'physical'}];
function bridge({rows=[{'Row ID':'C2','Amount Remaining':'250.00','Ref Loans':'L1'},{'Row ID':'C1','Amount Remaining':'1,000.00','Ref Loans':'L1',_nativeVersion:'v'}],fail}={}){
 const calls={catalogue:0,query:[]};
 const readProvider={
  catalogue:async(context,input)=>{calls.catalogue++;assert.deepEqual(context.workload,{issuer:ACTOR.issuer,subject:'s1'});assert.equal(input.actorPartnerId,'P1');
   if(fail)throw Error(fail);
   return {manifestSha256:'m'.repeat(64),resources:input.scope==='oltp'?[{scope:'oltp',resource:'Charges',key:'Row ID',legacyPermission:'Read',fields}]:[{scope:'olap',resource:'Daily Analytics',key:'Row ID',legacyPermission:'Read',fields:[fields[0]]}]};},
  query:async(_context,input)=>{calls.query.push(input);if(fail)throw Error(fail);return {rows:typeof rows==='function'?rows(input):rows};},
 };
 const sqlTool={query:async sql=>({columns:['n'],rows:[{n:sql.length}],row_count:1,complete:true}),payoff:async id=>({loan_id:id,eligible:true,calculation:{amount:1000},complete:true})};
 return {tools:createChatTools({readProvider,sqlTool,actor:ACTOR,now:()=>Date.UTC(2026,9,21,7,5)}),calls};
}
const read=(patch={})=>({app:'oltp',table:'Charges',keys:[],match_field:'',match_text:'',filter:'',columns:['Amount Remaining'],offset:0,limit:10,...patch});
async function run(tools,name,args,round=1){const [result]=await tools.runRound([{name,args,id:null}],{deadline:Date.now()+5000,round});return result;}

test('declarations are the agent schemas in the Vertex subset',()=>{
 assert.deepEqual(TOOLS.map(t=>t.name),['data_catalogue','read_records','sum_field','sql_query','loan_payoff']);
 const d=declarations();
 assert.deepEqual(Object.fromEntries(d.map(x=>[x.name,x.parameters.required])),{data_catalogue:['app','table'],
  read_records:['app','table','keys','match_field','match_text','filter','columns','offset','limit'],sum_field:['observation','field','group_by'],sql_query:['sql'],loan_payoff:['loan_id']});
 const rr=d[1].parameters;
 assert.equal(rr.type,'OBJECT');assert.deepEqual(rr.properties.keys,{type:'ARRAY',items:{type:'STRING'}});assert.deepEqual(rr.properties.limit,{type:'INTEGER',minimum:1,maximum:100});
 assert.equal(JSON.stringify(d).includes('additionalProperties'),false);
 assert.equal(JSON.stringify(TOOLS).includes('api_action'),false);
});

test('data_catalogue answers unwrapped: the app list and a table without write fields',async()=>{
 const {tools,calls}=bridge();
 const list=await run(tools,'data_catalogue',{app:'',table:''});
 assert.deepEqual(list.value,{apps:{oltp:{version:'m'.repeat(64),tables:['Charges']},olap:{version:'m'.repeat(64),tables:['Daily Analytics']}}});
 const one=await run(tools,'data_catalogue',{app:'oltp',table:'Charges'});
 assert.deepEqual(one.value,{app:'oltp',table:'Charges',key:'Row ID',permission:'Read',condition:'',
  columns:{'Row ID':{Type:'Text',nativeStatus:'physical'},'Amount Remaining':{Type:'Price',nativeStatus:'physical'},'Ref Loans':{Type:'Ref',nativeStatus:'physical'}},
  guidance:'Read-only native catalogue. Use Ref keys to link records; aggregate with sum_field or sql_query.'});
 assert.equal((await run(tools,'data_catalogue',{app:'oltp',table:'Nope'})).value,'UNKNOWN_APP_OR_TABLE');
 assert.equal(calls.catalogue,2); // each scope once per turn
 assert.equal(Object.keys(tools.observations).length,0);
});

test('read_records validation codes',async()=>{
 const {tools}=bridge();
 for(const [patch,code] of [
  [{limit:0},'PAGE_LIMIT_MUST_BE_INTEGER_1_TO_100'],[{limit:101},'PAGE_LIMIT_MUST_BE_INTEGER_1_TO_100'],[{limit:1.5},'PAGE_LIMIT_MUST_BE_INTEGER_1_TO_100'],
  [{columns:[]},'INVALID_RECORD_QUERY'],[{columns:['_RowNumber']},'INVALID_RECORD_QUERY'],[{offset:-1},'INVALID_RECORD_QUERY'],[{keys:['a','a']},'INVALID_RECORD_QUERY'],
  [{keys:Array.from({length:26},(_,i)=>'k'+i)},'INVALID_RECORD_QUERY'],[{match_text:5},'INVALID_RECORD_QUERY'],
  [{keys:['C1'],match_field:'Ref Loans'},'USE_KEYS_OR_SEARCH'],[{filter:'{}',match_text:'x'},'USE_FILTER_OR_KEYS_OR_SEARCH'],
  [{match_field:'Nope',match_text:'x'},'UNKNOWN_SEARCH_FIELD'],[{match_text:'x'},'SEARCH_FIELD_REQUIRED'],
  [{filter:'not json'},'NATIVE_TYPED_FILTER_REQUIRED_NO_LEGACY_REPLAY'],[{filter:'[1]'},'NATIVE_TYPED_FILTER_REQUIRED_NO_LEGACY_REPLAY'],[{filter:'x\u0000'},'INVALID_FIND_FILTER'],
  [{table:'Nope'},'UNKNOWN_APP_OR_TABLE'],
 ]){const r=await run(tools,'read_records',read(patch));assert.deepEqual([r.error,r.value],[true,code],JSON.stringify(patch));}
 assert.equal((await run(tools,'read_records',{...read(),extra:1})).value,'UNSUPPORTED_TOOL_OR_ARGUMENTS');
 assert.equal((await run(tools,'nope',{})).value,'UNSUPPORTED_TOOL_OR_ARGUMENTS');
 const bound=bridge({rows:Array.from({length:1001},(_,i)=>({'Row ID':'R'+i,'Amount Remaining':'1'}))});
 assert.equal((await run(bound.tools,'read_records',read())).value,'READ_BOUND_REACHED_NARROW_SEARCH');
 assert.equal((await run(bridge({rows:[{'Row ID':'A'},{'Row ID':'A'}]}).tools,'read_records',read())).value,'RECORD_IDENTITY_MISMATCH');
 assert.equal((await run(bridge({rows:[{'Row ID':'C1','Amount Remaining':'1'}]}).tools,'read_records',read({keys:['C1','C9']}))).value,'REQUESTED_RECORD_MISSING');
 assert.equal((await run(bridge({rows:[{'Row ID':'C1'}]}).tools,'read_records',read())).value,'APP_SCHEMA_CHANGED_OR_FIELD_UNAVAILABLE');
 assert.equal((await run(bridge({fail:'unsupported_native_capability'}).tools,'read_records',read())).value,'REVIEWED_NATIVE_SCHEMA_REQUIRED');
 assert.equal((await run(bridge({fail:'boom'}).tools,'read_records',read())).value,'TOOL_FAILED_INSPECT_BEFORE_RETRY');
});

test('read_records: predicate, projection, code-point order, paging, cache and observation wrapping',async()=>{
 const {tools,calls}=bridge();
 const first=await run(tools,'read_records',read({match_field:'Ref Loans',match_text:'L1',limit:1}));
 assert.deepEqual(calls.query[0],{version:1,actorPartnerId:'P1',scope:'oltp',resource:'Charges',columns:['Row ID','Amount Remaining'],predicate:{op:'contains',field:'Ref Loans',value:'L1'},limit:1001});
 assert.deepEqual(first.value,{observation:'observation-1',as_of:'2026-10-21T14:05:00.000000+07:00',app:'oltp',table:'Charges',total_matched:2,offset:0,
  rows:[{'Row ID':'C1','Amount Remaining':'1,000.00',_nativeVersion:'v'}],complete:false});
 await run(tools,'read_records',read({match_field:'Ref Loans',match_text:'L1',limit:1,offset:1}));
 assert.equal(calls.query.length,1,'cache hit within the turn');
 await run(tools,'read_records',read({keys:['C1','C2']}));
 assert.deepEqual(calls.query[1].predicate,{op:'in',field:'Row ID',value:['C1','C2']});
 await run(tools,'read_records',read({filter:'{"op":"gt","field":"Amount Remaining","value":"5"}'}));
 assert.deepEqual(calls.query[2].predicate,{op:'gt',field:'Amount Remaining',value:'5'});
 assert.deepEqual(Object.keys(tools.observations),['observation-1','observation-2','observation-3','observation-4']);
 assert.equal('observation' in tools.observations['observation-1'],false); // grounding reads the unwrapped values
});

test('sum_field over a current observation, partial pages reported',async()=>{
 const {tools}=bridge();
 await run(tools,'read_records',read({columns:['Amount Remaining','Ref Loans']}));
 const sum=await run(tools,'sum_field',{observation:'observation-1',field:'Amount Remaining',group_by:''});
 assert.deepEqual(sum.value,{observation:'observation-2',as_of:'2026-10-21T14:05:00.000000+07:00',totals:{total:'1250.00'},source:'observation-1',rows_count:2,complete:true});
 const grouped=await run(tools,'sum_field',{observation:'observation-1',field:'Amount Remaining',group_by:'Ref Loans'});
 assert.deepEqual(grouped.value.totals,{L1:'1250.00'});
 assert.equal((await run(tools,'sum_field',{observation:'observation-9',field:'x',group_by:''})).value,'CURRENT_OBSERVATION_REQUIRED');
 assert.equal((await run(tools,'sum_field',{observation:'observation-1',field:'Nope',group_by:''})).value,'UNOBSERVED_FIELD');
 assert.equal((await run(tools,'sum_field',{observation:'observation-1',field:'Row ID',group_by:''})).value,'NON_NUMERIC_VALUE');
 assert.deepEqual([pyStr(null),pyStr(true),pyStr(5),pyStr(1.5)],['None','True','5','1.5']);
});

test('sql_query and loan_payoff are observations; summaries; round deadline marks a slow call TOOL_TIMEOUT',async()=>{
 const {tools}=bridge();
 const [sql,payoff]=await tools.runRound([{name:'sql_query',args:{sql:'SELECT 1'},id:'q'},{name:'loan_payoff',args:{loan_id:'L1'},id:'p'}],{deadline:Date.now()+5000,round:1});
 assert.deepEqual([sql.value.observation,sql.value.row_count,payoff.value.observation,payoff.value.calculation.amount],['observation-1',1,'observation-2',1000]);
 assert.deepEqual([toolSummary('read_records',{table:'Loans'}),toolSummary('data_catalogue',{}),toolSummary('sql_query',{},{row_count:2}),toolSummary('loan_payoff',{}),toolSummary('sum_field',{})],
  ['Loans','catalogue','2 rows','loan payoff','sum']);
 const slow=createChatTools({readProvider:{},sqlTool:{query:()=>new Promise(r=>setTimeout(()=>r({rows:[],complete:true}),200))},actor:ACTOR});
 const events=[];
 const [late]=await slow.runRound([{name:'sql_query',args:{sql:'SELECT 1'},id:null}],{deadline:Date.now()+30,round:2,emit:(n,d)=>events.push([n,d])});
 assert.deepEqual([late.error,late.value,late.journalId],[true,'TOOL_TIMEOUT','gemini-2-0']);
 assert.deepEqual(events.map(([,d])=>d.state),['running','error']);
 assert.deepEqual(slow.journal.map(j=>[j.callId,j.round,j.name,j.result,j.error]),[['gemini-2-0',2,'sql_query',null,'TOOL_TIMEOUT']]);
});

test('chat read provider: the actor is re-read from Partners by Row ID and login; no agent policy or Instagram opt-in',async()=>{
 const statements=[];
 const client=(partner)=>({async query(sql){statements.push(sql);
  if(sql.includes('FROM public."Partners" WHERE "Row ID"=$1'))return {rows:partner?[partner]:[]};
  if(sql.startsWith('SELECT t.'))return {rows:[{'Row ID':'C1'}]};
  return {rows:[]};},release(){}});
 const provider=p=>chatReadProvider({pool:{connect:async()=>client(p)},guardConnection:async()=>{},actor:ACTOR});
 const context={workload:{issuer:ACTOR.issuer,subject:'s1'}};
 const input={version:1,actorPartnerId:'P1',scope:'oltp',resource:'Charges',columns:['Row ID'],predicate:null,limit:5};
 assert.deepEqual((await provider({id:'P1',email:'p1@example.invalid'}).query(context,input)).rows,[{'Row ID':'C1'}]);
 assert.equal(statements.some(s=>s.includes('IG Integration Enabled')),false);
 await assert.rejects(provider({id:'P1',email:'other@example.invalid'}).query(context,input),/access_denied/);
 await assert.rejects(provider(null).query(context,input),/access_denied/);
 await assert.rejects(provider({id:'P2',email:'p1@example.invalid'}).query(context,{...input,actorPartnerId:'P2'}),/access_denied/);
});
