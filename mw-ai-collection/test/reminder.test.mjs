import test from 'node:test';
import assert from 'node:assert/strict';
import { Reminders, decide, reminderMessage } from '../src/reminder_engine.mjs';
const rc = {sessionId:'test',timezone:'Asia/Bangkok',collectionDate:'2026-09-07',graceMinutes:15,
  intervalMinutes:120,maxTestReminders:1,testExpiresAt:'2026-09-08T00:00:00+07:00',conversationUrl:'https://www.instagram.com/direct/t/test/'};
const config = {reminders:rc,testMode:true,scheduledSendingEnabled:false,appId:'app',borrowerId:'lisa',borrowerName:'Lisa',recipient:'friend',maxSnapshotAgeSeconds:300};
const state = () => ({lastSentAt:'2026-09-07T16:00:00+07:00',sentCount:0,promiseAt:null,promiseReminded:false,hold:null,pendingToken:null});
const now = new Date('2026-09-07T18:15:00+07:00');
const facts = {appId:'app',borrowerId:'lisa',borrowerName:'Lisa',recipient:'friend',source:'appsheet-live-ui',synced:true,
  observedAt:now.toISOString(),collectionDate:'2026-09-07',appToday:'2026-09-07',todayRemaining:600,overdueRemaining:300,totalRemaining:900,chargeIds:['a','b','c']};
const observation = events => ({recipient:'friend',conversationUrl:rc.conversationUrl,source:'instagram-live-ui',reviewedThroughLatest:true,observedAt:now.toISOString(),events});
const promise = {sourceKey:'latest-reply',text:'18.00 โอนไปให้',intent:'PROMISE',confidence:'high',requiresReview:false,
  timeEvidence:'Explicit 18.00, today in visible conversation',timezone:'Asia/Bangkok',promiseAt:'2026-09-07T18:00:00+07:00'};
function runner() {
  const r = new Reminders(':memory:',config);
  r.db.prepare('INSERT INTO reminder_sessions VALUES (?,?)').run('test',JSON.stringify(state()));
  return r;
}
test('promise replaces two-hour timer, including exact grace boundary', () => {
  const s = {...state(),promiseAt:'2026-09-07T21:00:00+07:00'};
  assert.equal(decide(s,rc,now).nextActionAt,'2026-09-07T14:15:00.000Z');
  assert.equal(decide(s,rc,new Date('2026-09-07T21:14:59+07:00')).status,'WAIT');
  assert.equal(decide(s,rc,new Date('2026-09-07T21:15:00+07:00')).status,'DUE');
  assert.equal(decide(state(),rc,new Date('2026-09-07T18:00:00+07:00')).kind,'STANDARD');
  assert.equal(decide(s,{...rc,graceMinutes:0},new Date('2026-09-07T21:00:00+07:00')).status,'DUE');
});
test('duplicate inbound does not reset promise or reminder; pending and unknown sends block', () => {
  const r=runner();
  try {
    r.observe(observation([promise]),now);
    const first = r.reserve(facts,now);
    assert.equal(first.status,'READY');
    assert.equal(r.reserve(facts,now).status,'BLOCKED_PENDING');
    r.finish(first.token,'Browser outcome uncertain',true,now);
    r.observe(observation([promise]),now);
    assert.equal(r.reserve(facts,now).status,'NEEDS_HUMAN_REVIEW');
  } finally {r.close();}
});
test('receipt, payment claim, ambiguity and next-day promise stop sending', () => {
  for(const event of [
    {...promise,intent:'RECEIPT'}, {...promise,intent:'PAID_CLAIM'}, {...promise,intent:'REVIEW'},
    {...promise,promiseAt:'2026-09-08T18:00:00+07:00'}]) {
    const r=runner();
    try {r.observe(observation([event]),now); assert.notEqual(r.reserve(facts,now).status,'READY');}
    finally {r.close();}
  }
});
test('paid borrower stops, stale evidence rejects, successful test waits for acceptance', () => {
  const r=runner();
  try {
    assert.throws(()=>r.reserve(facts,now),/Review latest/);
    r.observe(observation([promise]),now);
    assert.throws(()=>r.reserve({...facts,recipient:'someone-else'},now),/allowlist/);
    assert.throws(()=>r.reserve(facts,new Date(now.getTime()+301000)),/stale/);
    const sent=r.reserve(facts,now); r.finish(sent.token,'Visible sent bubble',false,now);
    assert.equal(r.reserve(facts,now).status,'AWAITING_ACCEPTANCE');
    assert.equal(r.reserve({...facts,todayRemaining:0,overdueRemaining:0,totalRemaining:0,chargeIds:[]},now).status,'COLLECTION_COMPLETE');
  } finally {r.close();}
});
test('reminders stay short and omit opening-message terms', () => {
  for (const kind of ['PROMISE','STANDARD']) {
    const text=reminderMessage('Lisa',kind);
    assert.ok(text.length < 100);
    assert.doesNotMatch(text,/500|50฿|ธนาคาร|16\.00|600|900/);
  }
});
