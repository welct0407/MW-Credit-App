import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../dist/store.js';
import {inspectMonitoring,monitoringSeries} from '../dist/monitoring.js';
const now=1_800_000_000_000,id='sub_'+'a'.repeat(64);
async function store({expires=now+86400000,grant=now+2*86400000,expected=true}={}){
 const s=new MemoryStore();await s.atomic(async tx=>{
  if(expected)tx.set('control/monitoring',{expectedSubscriptionIds:[id]});
  tx.set('subscriptions/'+id,{active:true,expiresAt:expires,grantHash:'b'.repeat(64),...(grant===null?{}:{grantExpiresAt:grant})});
 });return s;
}
test('natural empty drain is healthy; exact expected membership and grant metadata verified',async()=>{
 const s=await store();const r=await inspectMonitoring(s,true,now,now);
 for(const key of ['availability','dispatch','outbox','subscription','renewal','continuity'])assert.equal(r[key],1);
 assert.equal(r.oldest_pending_seconds,0);assert.equal(r.last_dispatch_completed_at,now/1000);
});
test('aggregate exceeds cap100; age includes delayed retry and never caps oldest',async()=>{
 const s=await store();await s.atomic(async tx=>{for(let i=0;i<151;i++)tx.set('deliveries/d'+i,{state:'pending',createdAt:now-901000-i,nextAt:now+10000});});
 const r=await inspectMonitoring(s,true,now,now);assert.equal(r.pending_count,151);assert.equal(r.outbox,0);
});
test('unknown expected membership and legacy grant metadata never healthy authority',async()=>{
 const a=await inspectMonitoring(await store({expected:false}),true,now,now);assert.equal(a.subscription,4);assert.equal(a.renewal,4);
 const b=await inspectMonitoring(await store({grant:null}),true,now,now);assert.equal(b.subscription,1);assert.equal(b.renewal,4);assert.equal(b.grant_authority,4);
});
test('revocation or expired authority invalidates expected subscription',async()=>{
 const s=await store();await s.atomic(async tx=>tx.set('revokedGrants/'+'b'.repeat(64),{deleteAfter:new Date(now+86400000)}));
 assert.equal((await inspectMonitoring(s,true,now,now)).subscription,0);
 assert.equal((await inspectMonitoring(await store({grant:now-1}),true,now,now)).subscription,0);
 assert.equal((await inspectMonitoring(await store(),false,now,now)).availability,0);
});
test('first near-deadline observation unknown; unchanged deadline degrades; renewed deadline clears',async()=>{
 const s=await store({expires:now+1800000});
 assert.equal((await inspectMonitoring(s,true,now,now)).renewal,4);
 assert.equal((await inspectMonitoring(s,true,now+60000,now+60000)).renewal,2);
 await s.atomic(async tx=>tx.set('subscriptions/'+id,{active:true,expiresAt:now+86400000,grantHash:'b'.repeat(64),grantExpiresAt:now+2*86400000}));
 assert.equal((await inspectMonitoring(s,true,now+120000,now+120000)).renewal,1);
});
test('inspection errors keep downstream Unknown; output contains numeric fields and fixed resource labels only',async()=>{
 const s=await store();s.count=async()=>{throw Error('sentinel-secret');};const r=await inspectMonitoring(s,true,now,now);assert.equal(r.inspection_failed,1);assert.equal(r.outbox,4);
 const out=monitoringSeries({...r,'secret-id':123},'test-project',now);
 assert(!JSON.stringify(out).includes('secret-id'));assert(!JSON.stringify(out).includes('sentinel-secret'));assert(!JSON.stringify(out).includes(id));
});
test('instrumentation failure does not fail successful dispatch or echo its error',async t=>{
 const {application}=await import('./helpers.mjs');
 const app=await application({monitor:async()=>{throw Error('sentinel-monitor-secret');}});t.after(()=>app.close());
 const response=await app.call('/internal/dispatch',{method:'POST',headers:{Authorization:'Bearer synthetic-scheduler'},body:{}});
 assert.equal(response.status,200);assert.equal(response.json().attempted,0);assert(!response.body.includes('sentinel-monitor-secret'));
});
test('stalled instrumentation is bounded and cannot delay dispatch indefinitely',async t=>{
 const {application}=await import('./helpers.mjs');
 const app=await application({monitor:()=>new Promise(()=>{}),monitorTimeoutMs:10});t.after(()=>app.close());
 const started=Date.now();const response=await app.call('/internal/dispatch',{method:'POST',headers:{Authorization:'Bearer synthetic-scheduler'},body:{}});
 assert.equal(response.status,200);assert(Date.now()-started<1000);
});
