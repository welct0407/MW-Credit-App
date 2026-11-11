import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as patchModule from '../../services/lib/offline-dataset-digest.mjs';
// R141 (owner, 11 November 2026): the saved Expenses list answers the server's filters (payment=pending, payeeBorrowerId)
// the same way, in the same order, with the filtered first page's total; other values are left to the server (its 400).
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-dataset.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sandbox={exports:{},require:name=>name==='./dataset-patch'?patchModule:name==='./client-events'?{recordClientEvent:()=>{}}:{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}},window:new EventTarget(),document:new EventTarget(),navigator:{onLine:true},setTimeout,clearTimeout,URL,structuredClone,Intl,CustomEvent,Event,AbortController,TextEncoder,crypto:globalThis.crypto};
runInNewContext(source,sandbox);
const row=(id,expenseDate,amount,paymentState,payeeBorrowerId)=>({id,expenseDate,createdAt:expenseDate+' 10:00:00',amount,paymentState,payeeBorrowerId});
const expenses=[row('E1','2026-11-01','10.00','pending','B-1'),row('E2','2026-11-03','2.50','pending',null),row('E3','2026-11-02','7.00',null,'B-1'),row('E4','2026-11-04','1.25','pending','B-1')];
const bundle={schemaVersion:1,complete:true,domain:'records',asOf:'2026-11-11T01:00:00.000Z',businessDate:'2026-11-11',data:{expenses}};
const access={origin:'https://command.synthetic.invalid',offline:{environment:'synthetic',syncAuthorized:async()=>true,readDataset:async()=>structuredClone(bundle)}};
const read=async path=>{const value=await sandbox.exports.readOfflineDataset(access,path);return value==null?value:JSON.parse(JSON.stringify(value))};
test('R141 the saved list filters to pending and to one payee, newest first, with the total on the first page',async()=>{
 assert.deepEqual((await read('/api/expense-records')).items.map(r=>r.id),['E4','E2','E3','E1']);assert.equal((await read('/api/expense-records')).filter,undefined);
 const pending=await read('/api/expense-records?payment=pending');
 assert.deepEqual(pending.items.map(r=>r.id),['E4','E2','E1']);assert.deepEqual(pending.filter,{payment:'pending',payeeBorrowerId:null,total:{count:3,amount:'13.75'}});
 const owed=await read('/api/expense-records?payment=pending&payeeBorrowerId=B-1');
 assert.deepEqual(owed.items.map(r=>r.id),['E4','E1']);assert.deepEqual(owed.filter.total,{count:2,amount:'11.25'});
 const page=await read('/api/expense-records?payment=pending&limit=2');assert.deepEqual(page.items.map(r=>r.id),['E4','E2']);
 const next=await read('/api/expense-records?payment=pending&limit=2&cursor='+encodeURIComponent(page.nextCursor));
 assert.deepEqual(next.items.map(r=>r.id),['E1']);assert.equal(next.filter.total,undefined,'later pages carry no total');
 assert.equal(await read('/api/expense-records?limit=2&cursor='+encodeURIComponent(page.nextCursor)),null,'a filtered cursor does not page the full list');
 for(const path of ['/api/expense-records?payment=paid','/api/expense-records?payeeBorrowerId='])assert.equal(await read(path),null,path);
});
