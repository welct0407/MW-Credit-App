import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationStore,enqueueNotifications} from '../../services/notifications/store.mjs';
import {createNotificationDispatcher} from '../../services/notifications/dispatcher.mjs';
import {createCanonicalJobRunner} from '../../services/jobs/runner.mjs';
import {notificationHandler} from '../../services/notifications/handler.mjs';
import {withOfflineReadSlot,offlineReadClient} from '../../services/api/offline-read-slot.mjs';
test('offline bundles share one pool reservation and cancel queued work before database access',async()=>{
 const pool={},events=[],abort=new AbortController();let release;
 const first=withOfflineReadSlot(pool,undefined,async()=>{events.push('first');await new Promise(resolve=>{release=resolve})});
 await Promise.resolve();
 const second=withOfflineReadSlot(pool,abort.signal,async()=>events.push('cancelled'));
 const rejection=assert.rejects(second,/cancelled/);abort.abort();await rejection;
 const third=withOfflineReadSlot(pool,undefined,async()=>events.push('third'));
 assert.deepEqual(events,['first']);release();await Promise.all([first,third]);assert.deepEqual(events,['first','third']);
 let calls=0;const client=offlineReadClient({query:async()=>{calls++;return {rows:[]}}},abort.signal);
 await assert.rejects(client.query('SELECT 1'),/cancelled/);assert.equal(calls,0);
});
const id='00000000-0000-4000-8000-000000000001';
const actor={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'owner',partnerId:'partner',loginEmail:'owner@example.invalid'};
test('API resolves fresh actor, uses fixed RPC and rejects wrong issuer before state access',async()=>{
 const queries=[],client={query:async(sql,args)=>{queries.push({sql,args});return{rows:[{value:{enabled:false,deviceRegistered:false}}]};},release(){}};
 let resolved=actor;
 const store=createNotificationStore({pool:{connect:async()=>client},guardConnection:async()=>{},resolveActor:async()=>resolved,issuer:actor.issuer});
 assert.deepEqual(await store.status({},null),{enabled:false,deviceRegistered:false});
 assert.equal(queries[1].sql,'SELECT public.pwa_notify_status_v1($1::jsonb,$2::text) AS value');
 assert.deepEqual(queries[1].args,[actor,null]);resolved={...actor,issuer:'wrong'};
 await assert.rejects(store.status({},null),/access_denied/);assert.equal(queries.at(-1).sql,'ROLLBACK');
 assert.ok(queries.every(q=>!q.sql.includes('FROM public.pwa_push_subscriptions')));
});
test('bounded candidates cancel authoritative ineligibility but defer external lookup failure',async()=>{
 const calls=[],candidates=[{event_id:id,subscription_id:id,version:'1',verdict:false},{event_id:id,subscription_id:id,version:'2',verdict:null},{event_id:id,subscription_id:id,version:'3',verdict:true}];
 const client={query:async(sql,args)=>{calls.push({sql,args});return{rows:sql.includes('candidates')?candidates:[{inserted:true}]};}};
 assert.deepEqual(await enqueueNotifications(client,{eligible:async(_c,row)=>row.verdict}),{enqueued:2,candidates:3});
 assert.equal(calls.length,3);assert.equal(calls[1].args[3],false);assert.equal(calls[2].args[3],true);assert.deepEqual(calls[0].args,[100]);
});
test('dispatcher claims one just in time and does not send on a failed start fence',async()=>{
 const calls=[];let claims=0,sends=0;
 const client={release(){},query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('claim_'))return{rows:claims++===0?[{delivery_id:id,event_id:id,lease_generation:'1'}]:[]};if(sql.includes('prepare_send'))return{rows:[{version:'1'}]};if(sql.includes('start_send'))return{rows:[{started:false}]};throw Error(sql);}};
 const run=createNotificationDispatcher({enabled:true,pool:{connect:async()=>client},guardConnection:async()=>{},eligible:async()=>true,transport:async()=>{sends++;}});
 assert.deepEqual(await run(),{enabled:true,claimed:1,results:[{state:'fenced'}]});assert.equal(sends,0);assert.ok(calls.filter(c=>c.sql.includes('claim_')).every(c=>c.args[0]===1));
});
test('job adapter invokes only atomic job RPC; disabled adapters touch no dependencies',async()=>{
 const calls=[],client={release(){},query:async(sql,args)=>{calls.push({sql,args});return{rows:[{result:{enabled:true,state:'completed',replayed:false}}]};}};
 const job=createCanonicalJobRunner({enabled:true,pool:{connect:async()=>client},guardConnection:async()=>{}});
 await job({job:'daily-charges',businessDate:'2026-10-11',scope:'daily'});assert.equal(calls.length,1);assert.match(calls[0].sql,/pwa_job_run_v1/);
 assert.deepEqual(await createCanonicalJobRunner({})({}),{enabled:false});let delegated=0;const disabled=notificationHandler({next:()=>{delegated++},enabled:false});await disabled({url:'/api/notifications/status',headers:{}},{});assert.equal(delegated,1);
});
