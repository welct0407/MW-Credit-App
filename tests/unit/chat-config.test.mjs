// R090: CHAT_MODELS_JSON (services/chat/config.mjs), the business configuration's chat role
// (services/production/business-config.mjs) and the chat connection guard (services/chat/guard.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChatModels,availableModel} from '../../services/chat/config.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {createChatConnectionGuard} from '../../services/chat/guard.mjs';
import {BUDGET} from '../../services/lib/budget.mjs';
import {PROJECT_ID} from '../../services/lib/identity.mjs';
import {businessEnv} from './business-env-fixture.mjs';
import {MODELS,chatEnv} from './chat-fixture.mjs';

test('CHAT_MODELS_JSON: the design example is accepted and frozen',()=>{
 const chat=parseChatModels(JSON.stringify(MODELS));
 assert.equal(chat.default,'gemini-4-argon');assert.equal(chat.grounding,'enforce');assert.equal(chat.models.length,3);
 assert.ok(Object.isFrozen(chat)&&Object.isFrozen(chat.models)&&Object.isFrozen(chat.models[0]));
 assert.equal(availableModel(chat,'gemini-3.8-flash').label,'Gemini 3.8 Flash');assert.equal(availableModel(chat,'gemini-9-x'),null);
 const pending=parseChatModels(JSON.stringify({...MODELS,models:[MODELS.models[0],{id:'gemini-3.5-flash',label:'Gemini 3.5 Flash',available:false,reason:'pending live check'}]}));
 assert.equal(availableModel(pending,'gemini-3.5-flash'),null);assert.equal(pending.models[1].reason,'pending live check');
});

test('CHAT_MODELS_JSON: refused shapes and bounds',()=>{
 const model=(patch)=>({...MODELS.models[0],...patch});
 for(const patch of [
  {models:[model({id:'claude-sonnet'})]},{models:[model({id:'gemini-4-Argon'})]},{models:[]},{models:Array.from({length:9},(_,i)=>model({id:`gemini-${i}-x`}))},
  {models:[MODELS.models[0],MODELS.models[0]]},{default:'gemini-9-x'},{models:[model({available:false})]},{thinkingLevel:'XHIGH'},{thinkingLevel:'medium'},
  {maxRounds:3},{maxRounds:41},{requestTimeoutSeconds:29},{requestTimeoutSeconds:241},{historyTokenLimit:49999},{historyTokenLimit:400001},
  {seedChars:-1},{seedChars:200001},{turnTimeoutSeconds:59},{turnTimeoutSeconds:241},{requestTimeoutSeconds:200,turnTimeoutSeconds:120},{maxRounds:24.5},
  {version:2},{location:'mars'},{extra:true},{models:[{...model(),reason:'x'}]},{models:[model({label:''})]},{models:[{...model(),thinkingBudget:1}]},
 ])assert.throws(()=>parseChatModels(JSON.stringify({...MODELS,...patch})),/Invalid CHAT_MODELS_JSON/,JSON.stringify(patch));
 for(const raw of [undefined,'','not json','[]','x'.repeat(16385)])assert.throws(()=>parseChatModels(raw),/Invalid CHAT_MODELS_JSON/);
 const {thinkingLevel:_drop,...missing}=MODELS;assert.throws(()=>parseChatModels(JSON.stringify(missing)));
});

test('business config: role chat resolves its own IAM identity and the parsed models',()=>{
 for(const environment of ['dev','prod']){
  const config=loadBusinessConfig(chatEnv(environment));
  assert.deepEqual([config.serviceRole,config.dbUser,config.database,config.chat.default],['chat',`mw-credit-app-chat-${environment}@${PROJECT_ID}.iam`,`loan_manager_${environment}`,'gemini-4-argon']);
 }
 assert.equal(loadBusinessConfig(businessEnv('dev','command')).chat,null);
 // The reader and command services ignore CHAT_MODELS_JSON.
 assert.equal(loadBusinessConfig({...businessEnv('dev','command'),CHAT_MODELS_JSON:'not json'}).chat,null);
});

test('business config: role chat refuses other identities, receipt, notification, push and agent variables, and bad models',()=>{
 const reader=businessEnv('dev','reader'),command=businessEnv('dev','command');
 for(const patch of [{DB_USER:reader.DB_USER},{RUNTIME_SERVICE_ACCOUNT:command.RUNTIME_SERVICE_ACCOUNT},{DB_USER:`mw-credit-app-chat-prod@${PROJECT_ID}.iam`},
  {DEV_RECEIPTS:'disabled'},{DEV_RECEIPTS:'enabled'},{DEV_RECEIPT_RECOGNITION:'disabled'},{RECEIPT_BUCKET:'x'},{PWA_NOTIFICATIONS:'disabled'},{WEB_PUSH_PUBLIC_KEY:'x'},
  {NOTIFICATION_DISPATCH_ENABLED:'false'},{AGENT_CONVERSATION_API_ENABLED:'false'},{AGENT_RECEIPT_API_ENABLED:'false'},{CHAT_MODELS_JSON:undefined},{CHAT_MODELS_JSON:'{}'},
  {FOUNDATION_ROLE:'chat-admin'}])
  assert.throws(()=>loadBusinessConfig(chatEnv('dev',patch)),undefined,JSON.stringify(patch));
});

test('budget: the chat request outlasts the 240 s turn and the client query timeout outlasts the 20 s SQL tool',()=>{
 assert.ok(BUDGET.chat.httpRequestTimeoutMs>240000&&BUDGET.chat.httpRequestTimeoutMs<300000);
 assert.ok(BUDGET.queryMs.chat>BUDGET.chat.sqlToolStatementMs);assert.equal(BUDGET.statementMs.chat,BUDGET.statementMs.command);
 assert.ok(BUDGET.chat.poolMax>=5);
});

const identity=(config,patch={})=>({database:config.database,principal:config.dbUser,session:config.dbUser,rolcanlogin:true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,
 rolreplication:false,rolbypassrls:false,api_member:true,read_member:true,read_inherited:false,owner_member:false,app_member:false,journal_member:false,creator_member:false,foreign_member:false,...patch});
const client=row=>({calls:[],async query(sql,args){this.calls.push({sql,args});return {rows:[row]};}});
test('chat connection guard: capability memberships required, owner, application, creator and foreign roles refused',async()=>{
 for(const environment of ['dev','prod']){
  const config=loadBusinessConfig(chatEnv(environment)),guard=createChatConnectionGuard(config),ok=client(identity(config));
  await guard(ok);
  assert.deepEqual(ok.calls[0].args.slice(0,3),[`mw_chat_api_${environment}`,`mw_chat_read_${environment}`,`mw_chat_owner_${environment}`]);
  assert.ok(ok.calls[0].args[6].includes(environment==='dev'?'mw_chat_read_prod':'mw_chat_read_dev'));
  for(const patch of [{api_member:false},{read_member:false},{read_inherited:true},{owner_member:true},{app_member:true},{journal_member:true},{creator_member:true},{foreign_member:true},
   {rolsuper:true},{principal:'mw_chat_read_dev'},{database:'loan_manager_x'}])
   await assert.rejects(guard(client(identity(config,patch))),/Database identity unavailable/,JSON.stringify(patch));
 }
 assert.throws(()=>createChatConnectionGuard(loadBusinessConfig(businessEnv('dev','reader'))),/Invalid database target/);
});

test('runtime: FOUNDATION_ROLE=chat installs only the chat handler after the guarded first connection',async()=>{
 const {createChatRuntime}=await import('../../services/chat/runtime.mjs');
 const config=loadBusinessConfig(chatEnv('dev'));
 const queries=[];let transports=0,ended=0;
 const pool={connect:async()=>({query:async(sql)=>{queries.push(sql);return {rows:[identity(config)]};},release(){}}),end:async()=>{ended++;}};
 const dependencies={initializeApp:()=>({}),applicationDefault:()=>({}),getAuth:()=>({verifyIdToken:async()=>{throw Error('no token');}}),createPool:async()=>pool,
  createVertexTransport:async c=>{transports++;assert.equal(c.chat.location,'global');return {request:async()=>{throw Error('unused');}};},completionLogger:()=>{},log:()=>{}};
 const runtime=await createChatRuntime(chatEnv('dev'),dependencies);
 assert.equal(runtime.enabled,true);assert.equal(transports,1);assert.match(queries[0],/mw_chat_api|pg_has_role/);
 const answer=async url=>{let status,body='';const res={statusCode:200,headersSent:false,setHeader(){},writeHead(s){status=s;},once(){},end(v){body+=v??'';status??=this.statusCode;}};
  await runtime.handler({method:'GET',url,headers:{}},res);return [status,body];};
 assert.deepEqual(await answer('/health'),[200,'{"ok":true}']);
 assert.equal((await answer('/api/notifications'))[0],404);
 assert.equal((await answer('/api/command/status'))[0],404);
 assert.equal((await answer('/internal/agent/catalogue'))[0],404);
 assert.equal((await answer('/api/chat/models'))[0],401);
 await runtime.close();assert.equal(ended,1);
 await assert.rejects(createChatRuntime({...chatEnv('dev'),FOUNDATION_ROLE:'reader'},dependencies),/Invalid chat service configuration/);
 await assert.rejects(createChatRuntime({...chatEnv('dev'),BUSINESS_ACTIVATION:'disabled'},dependencies));
});

test('read role is SET, never inherited: the membership lookup and native reads switch to it inside their transactions',async()=>{
 const {createChatStore}=await import('../../services/chat/store.mjs');
 const {readRoleGuard}=await import('../../services/chat/service.mjs');
 const sql=[];
 const client={async query(text){sql.push(typeof text==='string'?text:text.text);return {rows:[{value:'gemini-4-argon'}]};},release(){}};
 const store=createChatStore({pool:{connect:async()=>client},guardConnection:async()=>{sql.push('guard');},issuer:'iss',readRole:'mw_chat_read_dev',
  resolveActor:async()=>{sql.push('resolve');return {issuer:'iss',subject:'s',partnerId:'P',loginEmail:'p@example.invalid'};}});
 assert.equal(await store.modelsDefault({ok:true}),'gemini-4-argon');
 assert.deepEqual(sql.slice(0,7),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',"SET LOCAL statement_timeout='8000ms'",'guard','SET LOCAL ROLE "mw_chat_read_dev"','resolve','RESET ROLE','SELECT public.pwa_chat_models_default_v1($1::jsonb) AS value']);
 sql.length=0;await readRoleGuard(async()=>{sql.push('guard');},'mw_chat_read_dev')(client);
 assert.deepEqual(sql,['guard','SET LOCAL ROLE "mw_chat_read_dev"']);
});
