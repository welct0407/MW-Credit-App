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
test('R089: history and offline pages attach the push title/body from one V102 content query per page; missing facts are generic',async()=>{
 const second='00000000-0000-4000-8000-000000000002',third='00000000-0000-4000-8000-000000000003';
 const history=[{eventId:id,type:'payment.posted',occurredAt:'2026-10-22T03:04:05.123456Z',state:'sent'},{eventId:second,type:'loan.created',occurredAt:'2026-10-22T03:04:04.000000Z',state:'uncertain'},{eventId:third,type:'loan.closed',occurredAt:'2026-10-22T03:04:03.000000Z',state:'failed'}];
 const facts=[{eventId:id,found:true,eventType:'payment.posted',language:'th',borrowerName:'สมชาย ใจดี',amount:'5000'},{eventId:second,found:false,eventType:'loan.created',language:'en',borrowerName:null,amount:null}];
 const queries=[],client={release(){},query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('pwa_notify_history_v1'))return{rows:history};if(sql.includes('pwa_notify_history_content_v1'))return{rows:facts};if(sql.includes('pwa_notify_target_v1'))return{rows:[]};if(sql.includes('pwa_notify_status_v1'))return{rows:[{value:{enabled:true}}]};if(sql.includes('AS "asOf"'))return{rows:[{asOf:'2026-10-22T03:05:00.000Z',businessDate:'2026-10-22'}]};return{rows:[]};}};
 const store=createNotificationStore({pool:{connect:async()=>client},guardConnection:async()=>{},resolveActor:async()=>actor,issuer:actor.issuer});
 const expected=[
  {eventId:id,type:'payment.posted',occurredAt:'2026-10-22T03:04:05.123456Z',state:'sent',title:'รับชำระแล้ว ฿5,000',body:'สมชาย ใจดี'},
  {eventId:second,type:'loan.created',occurredAt:'2026-10-22T03:04:04.000000Z',state:'uncertain',title:'New loan',body:'Details no longer available'},
  {eventId:third,type:'loan.closed',occurredAt:'2026-10-22T03:04:03.000000Z',state:'failed',title:'MW Credit',body:'New activity'}];
 const content=()=>queries.filter(q=>q.sql.includes('pwa_notify_history_content_v1'));
 assert.deepEqual(await store.history({},null),{items:expected,nextCursor:null});
 assert.equal(content().length,1);assert.equal(content()[0].sql,'SELECT * FROM public.pwa_notify_history_content_v1($1::jsonb,$2::uuid[])');assert.deepEqual(content()[0].args,[actor,[id,second,third]]);
 const chunk=await store.offlineDataset({},undefined,{protocol:2});
 assert.deepEqual(chunk.patches.find(p=>p.key==='items').value,expected);assert.equal(content().length,2);assert.deepEqual(content()[1].args,[actor,[id,second,third]]);
 // An empty page issues no content query.
 assert.deepEqual(queries.filter(q=>q.sql.includes('SAVEPOINT')).map(q=>q.sql),['SAVEPOINT history_content','RELEASE SAVEPOINT history_content','SAVEPOINT history_content','RELEASE SAVEPOINT history_content']);
 // Best effort: a failing content RPC (e.g. before V102) rolls back to the savepoint and every row shows the generic push.
 const generic=expected.map(row=>({...row,title:'MW Credit',body:'New activity'}));
 const query=client.query;client.query=async(sql,args)=>{if(sql.includes('pwa_notify_history_content_v1')){queries.push({sql,args});throw Error('function public.pwa_notify_history_content_v1(jsonb, uuid[]) does not exist');}return query(sql,args);};
 queries.length=0;assert.deepEqual(await store.history({},null),{items:generic,nextCursor:null});
 assert.deepEqual((await store.offlineDataset({},undefined,{protocol:2})).patches.find(p=>p.key==='items').value,generic);
 assert.equal(queries.filter(q=>q.sql==='ROLLBACK TO SAVEPOINT history_content').length,2);assert.equal(queries.filter(q=>q.sql==='COMMIT').length,2);
 client.query=query;
 history.length=0;queries.length=0;assert.deepEqual(await store.history({},null),{items:[],nextCursor:null});assert.equal(content().length,0);assert.equal(queries.some(q=>q.sql.includes('SAVEPOINT')),false);
});
