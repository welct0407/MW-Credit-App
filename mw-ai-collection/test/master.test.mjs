import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Master,target,clock } from '../src/master_engine.mjs';
const cfg={master:{enabled:true},appId:'app',borrowerId:'lisa',borrowerName:'Lisa',recipient:'friend',maxSnapshotAgeSeconds:300};
const at=(s)=>new Date(`2026-09-${s}+07:00`);
function facts(now){return {hold:null,appId:'app',borrowerId:'lisa',recipient:'friend',sender:'tttlll8709',source:'appsheet-live-ui',synced:true,observedAt:now.toISOString(),instagramObservedAt:now.toISOString(),reviewedThroughLatest:true,allCollectionChargesObserved:true,appToday:clock(now).date,totalRemaining:900,charges:['a','b','c'].map((id,i)=>({id,loanId:id,borrowerId:'lisa',date:i===2?'2026-09-06':'2026-09-07',interestDue:300,principalDue:0,paid:0,remaining:300,notes:'keep existing note'}))};}
function applied(f,p){const n=structuredClone(f),r=n.charges.find(x=>x.id===p.chargeId);r.interestDue=p.interestDue;r.remaining+=p.delta;r.notes=p.notes;n.totalRemaining+=p.delta;return n;}
test('Bangkok targets and midnight cap are cumulative',()=>{
 for(const [s,n] of [['07T15:59:59',0],['07T16:00:00',50],['07T17:15:00',100],['07T23:59:59',400],['08T00:00:00',500],['08T10:00:00',500]])assert.equal(target('2026-09-07',at(s)),n);
});
test('one fixed charge across loans, catch-up, verified write, duplicate message and unknown block',()=>{
 const m=new Master(':memory:',cfg),now=at('07T17:15:00'),f=facts(now);
 const p=m.plan(f,now);assert.equal(p.status,'WRITE_READY');assert.equal(p.chargeId,'a');assert.equal(p.delta,100);assert.equal(p.interestDue,400);
 assert.equal(m.plan(f,now).status,'RECONCILE_REQUIRED');assert.throws(()=>m.verifyFee(p.token,f,now),/mismatch/);
 const saved=applied(f,p);m.verifyFee(p.token,saved,now);const msg=m.plan(saved,now);assert.match(msg.message,/900.*100.*1,000/);m.finish(msg.token,'seen');assert.equal(m.plan(saved,now).status,'BLOCKED_DUPLICATE');
 const later=at('07T19:00:00');saved.observedAt=saved.instagramObservedAt=later.toISOString();saved.charges.reverse();const p2=m.plan(saved,later);assert.equal(p2.chargeId,'a');assert.equal(p2.delta,100);assert.equal(p2.interestDue,500);
 m.finish(p2.token,'save uncertain',true);assert.equal(m.plan(saved,later).status,'RECONCILE_REQUIRED');m.verifyFee(p2.token,applied(saved,p2),later);m.close();
});
test('partial payment breakdown, paid freeze, holds and stale data',()=>{
 const m=new Master(':memory:',cfg),now=at('07T16:00:00'),f=facts(now);f.charges[0].paid=100;f.charges[0].remaining=200;f.totalRemaining=800;
 const p=m.plan(f,now),saved=applied(f,p);m.verifyFee(p.token,saved,now);const msg=m.plan(saved,now);assert.match(msg.message,/900.*50.*100.*850/);m.finish(msg.token,'visible');
 const paid=structuredClone(saved);for(const r of paid.charges){r.paid=r.interestDue;r.remaining=0;}paid.totalRemaining=0;assert.equal(m.plan(paid,now).status,'PAID');assert.equal(m.days()[0].closed,true);
 assert.equal(m.plan({...paid,hold:'RECEIPT_REVIEW'},now).status,'HOLD');assert.throws(()=>m.plan({...paid,observedAt:'2020-01-01'},now),/Fresh/);m.close();
});
test('midnight uses previous charge; missing midnight catches up without daytime reminder',()=>{
 const m=new Master(':memory:',cfg),now=at('07T23:00:00'),p=m.plan(facts(now),now),saved=applied(facts(now),p);m.verifyFee(p.token,saved,now);const msg=m.plan(saved,now);m.finish(msg.token,'visible');
 const next=at('08T02:00:00');saved.observedAt=saved.instagramObservedAt=next.toISOString();saved.appToday='2026-09-08';const catchup=m.plan(saved,next);assert.equal(catchup.date,'2026-09-07');assert.equal(catchup.delta,100);assert.equal(catchup.penalty,500);const verified=applied(saved,catchup);m.verifyFee(catchup.token,verified,next);assert.equal(m.plan(verified,next).status,'QUIET_HOURS');m.close();
});
