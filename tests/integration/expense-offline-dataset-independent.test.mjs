import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
import * as patchModule from '../../services/lib/offline-dataset-digest.mjs';

// R140 (owner, 11 November 2026; Chase on DEV): after an expense is created or marked paid, the saved offline data the
// Expenses list and record read must carry the change. End to end on the migration head: the real command store and
// SQL (application role), its offline-dataset endpoint (protocol 2 walk and protocol 3 delta, as the handler calls it)
// and the real PWA coordinator and bundle merge (apps/pwa/src/offline-dataset.ts) over an in-memory repository.
// Synthetic data only; the expenses are deleted at the end.
let admin,app,store,fixture;const user='mw_app_dev_r140_offline';
const principal={ok:true,email:OWNER_EMAIL,subject:'r140-offline-owner'};
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 // The records dashboard reads the Statistics row (as tests/integration/offline-delta-v4-lab.test.mjs seeds it).
 if(!(await admin.query('SELECT 1 FROM public."Statistics"')).rowCount)await admin.query(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
 fixture=await seedPaymentFixture(admin,'R140-OFF');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
});
after(async()=>{await app?.end();await admin?.end()});

const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-dataset.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function until(predicate,limit=60000){const started=Date.now();while(!await predicate()){if(Date.now()-started>limit)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20))}}
/** The PWA coordinator against the real store: fetch is answered the way services/payment-command/handler.mjs does. */
function client(){
 const rows=new Map(),requests=[],events=[];let revision=0;
 const repo={scopeName:'r140-offline',environment:'synthetic',syncAuthorized:async()=>true,readRevision:async()=>revision,readCacheRevision:async()=>0,
  readReconciledAt:async()=>Date.now(),saveReconciledAt:async()=>true,readReconcileFlags:async()=>[],saveReconcileFlags:async()=>true,readReconcileAttempt:async()=>null,saveReconcileAttempt:async()=>true,
  readDataset:async domain=>{const row=rows.get('dataset:'+domain);return row?{...structuredClone(row),cacheStale:false}:null},
  readDatasetProgress:async domain=>structuredClone(rows.get('progress:'+domain)??null),discardDatasetProgress:async domain=>{rows.delete('progress:'+domain)},
  saveDatasetProgress:async(domain,value,at,expected)=>{if(at!==revision||expected!==undefined&&(rows.get('progress:'+domain)?.nextCursor??null)!==expected)return false;rows.set('progress:'+domain,structuredClone(value));return true},
  saveDataset:async(domain,value,at,expected)=>{if(at!==revision||expected!==undefined&&expected!==null&&(rows.get('progress:'+domain)?.nextCursor??null)!==expected)return false;rows.set('dataset:'+domain,structuredClone(value));rows.delete('progress:'+domain);return true},
  patchDataset:async()=>false,readDatasetMedia:async()=>null,listDatasetMediaKeys:async()=>[],removeDatasetMedia:async()=>{},saveDatasetMedia:async()=>true,
  readDatasetMediaRefusals:async()=>[],saveDatasetMediaRefusal:async()=>true,removeDatasetMediaRefusal:async()=>{},clearDatasetMediaRefusals:async()=>{}};
 async function fetch(url,init={}){
  const target=new URL(url),domain=target.pathname==='/api/notifications/offline-dataset'?'notifications':target.searchParams.get('domain'),protocol=Number(target.searchParams.get('protocol'));
  const body=init.body?JSON.parse(init.body):undefined;requests.push({domain,protocol,method:init.method??'GET',cursor:target.searchParams.get('cursor')??body?.cursor??null,since:!!body?.since});
  const reply=(status,json)=>({status,ok:status>=200&&status<300,headers:new Headers(),json:async()=>structuredClone(json),clone(){return reply(status,json)}});
  if(domain==='notifications')return reply(200,{schemaVersion:2,domain,generation:'n',startedAt:new Date().toISOString(),asOf:new Date().toISOString(),businessDate:fixture.businessDate??'2026-11-11',sourceVersion:null,patches:[],complete:true,nextCursor:null,progress:{completed:1,total:1}});
  const result=await store.offlineDataset(principal,domain,new AbortController().signal,protocol===3?{protocol,input:body}:{protocol,cursor:target.searchParams.get('cursor')});
  const {status,...value}=result;return reply(status,value);
 }
 const window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 window.addEventListener('mw-offline-dataset-ready',event=>events.push(event.detail.domain+':'+event.detail.changed));
 const sandbox={exports:{},require:name=>name==='./client-events'?{recordClientEvent:()=>{}}:name==='./request-activity'?{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}}:name==='./dataset-patch'?patchModule:(()=>{throw Error('Unexpected import '+name)})(),
  window,document,navigator:{onLine:true},fetch,setTimeout,clearTimeout,URL,crypto:globalThis.crypto,TextEncoder,structuredClone,Intl,CustomEvent,Event,AbortController,Headers,console};
 runInNewContext(source,sandbox);
 const access={origin:'https://command.synthetic.invalid',offline:repo,token:async()=>'synthetic',authFailure:()=>{}};
 const stop=sandbox.exports.startOfflinePreparation(access);
 const state=()=>sandbox.exports.getOfflinePreparation(repo.scopeName);
 return {repo,requests,events,stop,state,read:path=>sandbox.exports.readOfflineDataset(access,path),
  /** What a settled own write does (owner-offline.ts settlePending/remove): bump the read revision, then invalidate. */
  settled:()=>{revision++;window.dispatchEvent(new Event('mw-read-invalidated'))},
  idle:()=>until(()=>{const s=state();return s.state==='ready'&&!s.domainsPending&&!s.updating&&s.lastChecked!==null})};
}

test('R140 a created and a paid expense reach the saved Expenses list and record through the real dataset endpoint',{timeout:180000},async()=>{
 const c=client();
 try{
  await c.idle();
  const options=await store.expenseOptions(principal);assert.equal(options.status,200,JSON.stringify(options));
  const before=await c.read('/api/expense-records');assert.ok(before&&Array.isArray(before.items),'the saved list is readable after the first download');
  // Create a pending expense (the PWA form's command), then the settled request's invalidation.
  const command={requestId:randomUUID(),operation:'expense.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
   inputs:{expenseDate:options.businessDate,category:'Other / อื่น ๆ',amount:'15',payeeName:'Synthetic offline list',relatedBorrowerId:null,relatedLoanId:null,notes:null,paidByAccountId:null}};
  const created=await store.operation(principal,command);assert.equal(created.originalOutcome?.status,'applied',JSON.stringify(created));
  const mark=c.requests.length;c.settled();await c.idle();
  const confirm=c.requests.slice(mark);
  assert.ok(confirm.some(r=>r.domain==='records'),'the own write is confirmed on records: '+JSON.stringify(confirm));
  const list=await c.read('/api/expense-records');
  assert.equal(list.items[0]?.id,command.targetId,'the new expense heads the saved list');
  assert.equal(list.items[0].paymentState,'pending');
  assert.equal((await c.read('/api/expense-records/'+command.targetId))?.item?.paymentState,'pending','the saved record');
  assert.ok(c.events.includes('records:true'),'records announced a change');
  // Mark as paid (expense.update with an account), then the invalidation: the saved record and tile follow.
  const pending=(await store.expenseRecord(principal,command.targetId)).item;
  const paid=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.update',expectedVersion:pending.version,inputs:{...command.inputs,paidByAccountId:fixture.receivingAccountId}});
  assert.equal(paid.originalOutcome?.status,'applied',JSON.stringify(paid));
  c.events.length=0;c.settled();await c.idle();
  const record=(await c.read('/api/expense-records/'+command.targetId))?.item;
  assert.equal(record?.paymentState??null,null,'the saved record is paid');assert.equal(record.paidByAccountId,fixture.receivingAccountId);
  assert.equal((await c.read('/api/expense-records')).items.find(row=>row.id===command.targetId)?.paymentState??null,null,'the saved tile is paid');
  // The confirm settles: no further dataset requests once idle (no retry loop).
  const settledAt=c.requests.length;await new Promise(resolve=>setTimeout(resolve,1500));assert.equal(c.requests.length,settledAt,'no repeated dataset requests after the confirm');
  const item=(await store.expenseRecord(principal,command.targetId)).item;
  const deleted=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.delete',expectedVersion:item.version,inputs:{}});assert.equal(deleted.originalOutcome?.status,'applied',JSON.stringify(deleted));
 }finally{c.stop()}
});
