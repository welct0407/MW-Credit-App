import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cycleBrief} from '../src/cycle_brief.mjs';
const cfg={borrowerId:'lisa',recipient:'friend',master:{enabled:true},reminders:{conversationUrl:'chat'}};
const now=new Date('2026-09-07T18:00:00Z');
function db(){const d=new DatabaseSync(':memory:');d.exec(`CREATE TABLE master_days(borrower,date,state); CREATE TABLE master_operations(token,borrower,kind,status); CREATE TABLE collection_receipts(id,status); CREATE TABLE collection_exceptions(id,borrower,category,status);`);return d;}
test('quiet completed history gives compact inbox-only plan, daytime never skips source',()=>{
 const d=db();d.exec("INSERT INTO collection_receipts VALUES ('done','ACK_SENT')");
 const b=cycleBrief(d,cfg,{},now);assert.equal(b.canSkipAppSheetAfterUnchangedInbox,true);assert.deepEqual(b.pending.receipts,[]);
 assert.equal(cycleBrief(d,cfg,{},new Date('2026-09-08T04:00:00Z')).canSkipAppSheetAfterUnchangedInbox,false);d.close();
});
test('missed midnight fees and unresolved cases prevent quiet short circuit',()=>{
 const d=db();d.prepare('INSERT INTO master_days VALUES (?,?,?)').run('lisa','2026-09-07',JSON.stringify({closed:false,penalty:350,chargeId:'charge'}));
 assert.equal(cycleBrief(d,cfg,{},now).feeCatchup[0].targetPenalty,500);
 assert.equal(cycleBrief(d,cfg,{},now).canSkipAppSheetAfterUnchangedInbox,false);
 d.exec('DELETE FROM master_days');d.exec("INSERT INTO collection_exceptions VALUES ('case','lisa','EXTENSION','ACTION_REQUIRED')");assert.equal(cycleBrief(d,cfg,{},now).canSkipAppSheetAfterUnchangedInbox,false);d.close();
});
test('receipt, unknown operation, local hold and missing schema all prevent shortcut',()=>{
 const d=db();assert.equal(cycleBrief(d,cfg,{hold:'REVIEW'},now).canSkipAppSheetAfterUnchangedInbox,false);
 d.exec("INSERT INTO collection_receipts VALUES ('receipt','POST_UNKNOWN')");assert.equal(cycleBrief(d,cfg,{},now).canSkipAppSheetAfterUnchangedInbox,false);
 d.exec("DELETE FROM collection_receipts; INSERT INTO master_operations VALUES ('op','lisa','FEE','UNKNOWN')");assert.equal(cycleBrief(d,cfg,{},now).canSkipAppSheetAfterUnchangedInbox,false);d.close();
 const empty=new DatabaseSync(':memory:');assert.equal(cycleBrief(empty,cfg,{},now).status,'RECONCILE_REQUIRED');empty.close();
});
