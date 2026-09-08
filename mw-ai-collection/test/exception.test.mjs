import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Exceptions,exceptionHold} from '../src/exception_engine.mjs';
import {Master} from '../src/master_engine.mjs';
import {Receipts} from '../src/receipt_engine.mjs';
const now=new Date('2026-09-08T09:00:00Z');
const cfg={exceptions:{enabled:true},receipts:{enabled:true,autoPostClear:true},master:{enabled:true},appId:'app',borrowerId:'lisa',borrowerName:'Lisa',recipient:'friend',maxSnapshotAgeSeconds:300,reminders:{conversationUrl:'https://example.test/chat'}};
const input={source:'instagram-live-ui',sourceKey:'inbound1',author:'friend',sender:'tttlll8709',borrowerId:'lisa',conversationUrl:cfg.reminders.conversationUrl,category:'FEE_WAIVER',observedAt:now.toISOString(),balance:null,messageText:'ขอยกเว้นค่าปรับได้ไหม',summary:'ขอยกเว้นค่าปรับ',recommendation:'ให้ผู้ดูแลพิจารณา',evidence:'Exact inbound read'};
const masterFacts={source:'appsheet-live-ui',synced:true,appId:'app',borrowerId:'lisa',recipient:'friend',sender:'tttlll8709',observedAt:now.toISOString(),instagramObservedAt:now.toISOString(),reviewedThroughLatest:true,allCollectionChargesObserved:true,appToday:'2026-09-08',hold:null,totalRemaining:300,charges:[{id:'c',loanId:'l',borrowerId:'lisa',date:'2026-09-08',interestDue:300,principalDue:0,paid:0,remaining:300,notes:''}]};
test('case hold persists across restart and blocks master and payment posting',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'collection-exceptions-')),'test.db');
 let e=new Exceptions(path,cfg);const c=e.capture(input,now);e.close();e=new Exceptions(path,cfg);
 assert.equal(e.capture(input,now).id,c.id);
 const m=new Master(path,cfg);assert.equal(m.plan(masterFacts,now).status,'EXCEPTION_HOLD');
 const bank={bankName:'Test',accountNumber:'123456',accountName:'Receiver'},r=new Receipts(path,cfg,bank);
 const p=r.capture({...input,...bank,recipient:'friend',sourceKey:'receipt',amount:100,transferAt:now.toISOString(),bankReference:'r1',confidence:'high',sampleFromAnotherBorrower:false},now);
 const f={...masterFacts,completePaymentSearch:true,payments:[],paymentDateAllowed:'2026-09-08',charges:[{id:'c',borrowerId:'lisa',due:300,paid:0,remaining:300}]};r.assess(p.id,f,now);assert.throws(()=>r.reserve(p.id,f,now),/exception/);
 r.close();m.close();e.close();
});
test('one request; ambiguous or wrong-case reply cannot approve; approval retains hold',()=>{
 const e=new Exceptions(':memory:',cfg),c=e.capture(input,now),q=e.request(c.id,now);
 assert.equal(e.request(c.id,now).status,'SEND_PENDING');assert.throws(()=>e.sent(c.id,'wrong','visible',now),/Exact/);e.sent(c.id,q.token,'visible',now);
 const x={source:'instagram-live-ui',author:'friend',conversationUrl:cfg.reminders.conversationUrl,caseId:c.id,digest:e.get(c.id).data.digest,decision:'APPROVE',sourceKey:'reply1',replyText:`CASE ${c.id} อนุมัติยกเว้นค่าปรับ`,details:'Waiver requested',evidence:'Exact correlated reply',replyAt:now.toISOString(),observedAt:now.toISOString()};
 assert.throws(()=>e.decision(c.id,{...x,replyText:'yes'},now),/Correlated/);assert.throws(()=>e.decision(c.id,{...x,author:'borrower2'},now),/Correlated/);assert.throws(()=>e.decision(c.id,{...x,caseId:'wrong'},now),/Correlated/);
 assert.equal(e.decision(c.id,x,now).status,'ACTION_REQUIRED');assert.equal(exceptionHold(e.db,'lisa').length,1);assert.throws(()=>e.resolve(c.id,{source:'user',observedAt:now.toISOString()},now),/resolution/);e.close();
});
test('unknown send cannot retry and resolving one case preserves other holds',()=>{
 const e=new Exceptions(':memory:',cfg),a=e.capture(input,now),b=e.capture({...input,sourceKey:'inbound2',category:'EXTENSION'},now);
 e.request(a.id,now);e.unknown(a.id,'Outcome unknown',now);assert.equal(e.request(a.id,now).status,'SEND_UNKNOWN');
 e.resolve(a.id,{source:'user',caseId:a.id,observedAt:now.toISOString(),evidence:'User reconciled send and cancelled case',outcome:'No change',confirmedResolved:true,resumeExistingRules:true},now);
 assert.deepEqual(exceptionHold(e.db,'lisa').map(c=>c.id),[b.id]);assert.throws(()=>e.capture({...input,sourceKey:'stale',observedAt:'2020-01-01'},now),/Fresh/);e.close();
});
