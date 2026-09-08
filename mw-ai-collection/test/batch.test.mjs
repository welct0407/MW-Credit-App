import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DailyBatch} from '../src/batch_engine.mjs';
import {Master} from '../src/master_engine.mjs';
import {cycleBrief} from '../src/cycle_brief.mjs';
const now=new Date('2026-09-09T04:00:00Z');
const cfg={dailyBatch:{enabled:true,activationDate:'2026-09-09'},master:{enabled:true},appId:'app',borrowerId:'lisa',borrowerName:'Lisa',recipient:'friend',maxSnapshotAgeSeconds:300,reminders:{conversationUrl:'chat'}};
const source={appId:'app',source:'appsheet-live-ui',synced:true,observedAt:now.toISOString(),appToday:'2026-09-09'};
const manifest={...source,completeBoard:true,boardBorrowerCount:2,borrowers:[{borrowerId:'a',borrowerName:'พี่เอ'},{borrowerId:'lisa',borrowerName:'Lisa'}]};
const facts=id=>({...source,borrowerId:id,borrowerName:id==='a'?'พี่เอ':'Lisa',todayRemaining:300,overdueRemaining:100,totalRemaining:400,allCollectionChargesObserved:true,chargeIds:['c1','c2'],hold:null});
const inbox={observedAt:now.toISOString(),sender:'tttlll8709',recipient:'friend',conversationUrl:'chat',reviewedThroughLatest:true,composerEmpty:true,hold:null};
const evidence=message=>({...inbox,outboundMessage:message,outboundBubbleVerified:true,sendingIndicatorAbsent:true,evidence:'synthetic outbound bubble'});
test('persistent roster deduplication, serial sending, strict confirmation and restart recovery',()=>{
 const dir=mkdtempSync(join(tmpdir(),'batch-'));const path=join(dir,'test.db');let b=new DailyBatch(path,cfg);
 try{
 const rows=b.create(manifest,now).items;assert.equal(b.create(manifest,now).total,2);
 const p=b.prepare(rows[0].token,facts('a'),'BANK',now);assert.equal(p.message.split('\n\n').length,3);assert.match(p.message,/^พี่เอคะ/);
 b.prepare(rows[1].token,facts('lisa'),'BANK',now);b.start(rows[0].token,inbox,now);b.close();b=new DailyBatch(path,cfg);
 assert.throws(()=>b.start(rows[0].token,inbox,now),/prepared/);assert.throws(()=>b.start(rows[1].token,inbox,now),/unresolved/);
 assert.throws(()=>b.finish(rows[0].token,{...evidence(p.message),composerEmpty:false},now),/evidence/);
 assert.throws(()=>b.finish(rows[0].token,{...evidence(p.message),sendingIndicatorAbsent:false},now),/evidence/);
 b.review(rows[0].token,'interrupted',now);b.finish(rows[0].token,evidence(p.message),now);
 assert.throws(()=>b.prepare(rows[0].token,facts('a'),'BANK',now),/overwrite/);
 const p2=b.start(rows[1].token,inbox,now);assert.match(p2.message,/^Lisa /);b.finish(p2.token,evidence(p2.message),now);assert.equal(b.summary(source.appToday).status,'COMPLETE');
 }finally{b.close();rmSync(dir,{recursive:true,force:true});}
});
test('date window, roster, source freshness, destination, paid and holds',()=>{
 const b=new DailyBatch(':memory:',cfg);
 try{assert.throws(()=>b.create(manifest,new Date('2026-09-09T05:00:00Z')),/11:00/);
 assert.throws(()=>b.create({...manifest,boardBorrowerCount:3},now),/roster/);
 const r=b.create(manifest,now).items;
 assert.throws(()=>b.prepare(r[0].token,{...facts('a'),hold:'dispute'},'BANK',now),/held/);
 assert.throws(()=>b.prepare(r[0].token,{...facts('a'),observedAt:'2020-01-01'},'BANK',now),/Fresh/);
 b.prepare(r[0].token,facts('a'),'BANK',now);
 assert.throws(()=>b.start(r[0].token,{...inbox,recipient:'borrower'},now),/inbox/);
 const f={...facts('lisa'),todayRemaining:0,overdueRemaining:0,totalRemaining:0};assert.equal(b.prepare(r[1].token,f,'BANK',now).status,'SKIPPED_PAID');
 }finally{b.close();}
});
test('batch routing suppresses separate Lisa opening and unresolved sends disable quiet shortcut',()=>{
 const dir=mkdtempSync(join(tmpdir(),'batch-master-')),path=join(dir,'test.db');const m=new Master(path,cfg),b=new DailyBatch(path,cfg);
 try{
 const f={...source,hold:null,borrowerId:'lisa',recipient:'friend',sender:'tttlll8709',instagramObservedAt:now.toISOString(),reviewedThroughLatest:true,allCollectionChargesObserved:true,totalRemaining:300,charges:[{id:'c',loanId:'l',borrowerId:'lisa',date:source.appToday,interestDue:300,principalDue:0,paid:0,remaining:300,notes:''}]};
 assert.equal(m.plan(f,now).status,'OPENING_OWNED_BY_BATCH');assert.equal(m.days().length,1);
 b.db.exec('CREATE TABLE collection_receipts(id,status); CREATE TABLE collection_exceptions(id,borrower,category,status);');
 assert.equal(cycleBrief(b.db,cfg,{},now).dailyBatch.due,true);
 b.create(manifest,now);const later=new Date('2026-09-09T18:00:00Z');assert.equal(cycleBrief(b.db,cfg,{},later).canSkipAppSheetAfterUnchangedInbox,false);
 }finally{b.close();m.close();rmSync(dir,{recursive:true,force:true});}
});
