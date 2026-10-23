import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationReadProvider} from '../../services/agent-conversations/read-provider.mjs';

function fixture({authorized=true}={}) {
  const calls=[];
  const client={async query(sql,params){calls.push({sql,params});
    if(sql.includes('AS reviewer'))return {rows:authorized?[{id:'p1',email:'reader@example.invalid',enabled:true,reviewer:false,matches:'1'}]:[]};
    return {rows:sql.startsWith('SELECT t.')?[{'Row ID':'r1',Amount:'100.00'}]:[]};
  },release(quarantine){calls.push({release:quarantine});}};
  const catalogue={version:1,resources:[{scope:'oltp',resource:'Cash Statement Context',fields:[]}]};
  const provider=createConversationReadProvider({pool:{async connect(){return client;}},
    guardConnection:async()=>calls.push({guard:true}),policy:{readPartnerIds:['p1'],reviewerPartnerIds:[]},catalogue,
    resources:{oltp:{'Cash Statement Context':{relation:'Cash Statement Context',key:'Row ID',actorColumn:'Ref Partner',
      fields:{'Row ID':{column:'Row ID',type:'text'},Amount:{column:'Amount',type:'numeric'}}}}}});
  const context={workload:{issuer:'https://accounts.google.com',subject:'123'},signal:new AbortController().signal};
  const input={actorPartnerId:'p1',scope:'oltp',resource:'Cash Statement Context',columns:['Row ID','Amount'],predicate:{op:'gte',field:'Amount',value:'5.00'},limit:1001};
  return {provider,calls,context,input};
}

test('native reads keep typed values, exact actor scope and bounded repeatable-read snapshot',async()=>{
  const {provider,calls,context,input}=fixture();
  const result=await provider.query(context,input);
  assert.deepEqual(result.rows,[{'Row ID':'r1',Amount:'100.00'}]);
  const query=calls.find(call=>call.sql?.startsWith('SELECT t.'));
  assert.match(query.sql,/"Amount"::numeric::text/);
  assert.match(query.sql,/"Ref Partner"=\$2::text/);
  assert.deepEqual(query.params,['5.00','p1',1001]);
  assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(calls.at(-2).sql,'COMMIT');assert.deepEqual(calls.at(-1),{release:false});
});

test('unknown fields, raw expression resource names and revoked actors cannot query data',async()=>{
  const {provider,calls,context,input}=fixture();
  await assert.rejects(async()=>provider.query(context,{...input,columns:['secret']}),/unsupported/);
  await assert.rejects(async()=>provider.query(context,{...input,resource:'x; DROP TABLE x'}),/unsupported/);
  assert.equal(calls.length,0);
  const denied=fixture({authorized:false});
  await assert.rejects(denied.provider.query(denied.context,denied.input),/access_denied/);
  assert.equal(denied.calls.some(call=>call.sql?.startsWith('SELECT t.')),false);
  assert.equal(denied.calls.at(-2).sql,'ROLLBACK');
});

test('R090: the default actor check is unchanged; an injected resolveActor replaces it',async()=>{
  const {provider,calls,context,input}=fixture();
  await provider.query(context,input);
  assert.ok(calls.some(call=>call.sql?.includes('AS reviewer')),'default resolveConversationActor queried Partners');
  const injected=[];
  const client={async query(sql){injected.push(sql);return {rows:sql.startsWith('SELECT t.')?[{'Row ID':'r1',Amount:'1.00'}]:[]};},release(){}};
  const custom=createConversationReadProvider({pool:{async connect(){return client;}},guardConnection:async()=>{},policy:null,
    catalogue:{version:1,resources:[]},resources:{oltp:{'Cash Statement Context':{relation:'Cash Statement Context',key:'Row ID',actorColumn:'Ref Partner',fields:{'Row ID':{column:'Row ID',type:'text'},Amount:{column:'Amount',type:'numeric'}}}}},
    resolveActor:async(_client,policy,workload,partnerId)=>{assert.equal(policy,null);assert.deepEqual(workload,context.workload);return {issuer:'x',subject:'y',partnerId,loginEmail:'p@example.invalid'};}});
  assert.deepEqual((await custom.query(context,input)).rows,[{'Row ID':'r1',Amount:'1.00'}]);
  assert.equal(injected.some(sql=>sql.includes('AS reviewer')),false);
});
