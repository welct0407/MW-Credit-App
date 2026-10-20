import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createECDH,randomBytes,createHash} from 'node:crypto';
import {realpath,readFile} from 'node:fs/promises';
import {basename,dirname} from 'node:path';
import pg from 'pg';
import {createNotificationDispatcher} from '../../services/notifications/dispatcher.mjs';
import {createNotificationStore,enqueueNotifications} from '../../services/notifications/store.mjs';
import {createCanonicalJobRunner} from '../../services/jobs/runner.mjs';
import {phase8RpcPools} from './phase8-rpc-fixture.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';

async function fixture(){
 const e=process.env;if(e.PHASE8_TEST_DISPOSABLE!=='1'||e.PHASE8_TEST_HOST!=='127.0.0.1'||e.PHASE8_TEST_DATABASE!=='loan_manager_dev')throw Error('Owned loopback fixture required');
 const path=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(path),'data');assert.match(basename(dirname(path)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(path+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 const pool=new pg.Pool({host:'127.0.0.1',port:Number(e.PHASE8_TEST_PORT),database:e.PHASE8_TEST_DATABASE,user:'postgres',max:2});
 const rpc=await phase8RpcPools(pool);
 const prefix='C-PUSH-'+randomUUID(),issuer='https://securetoken.google.com/clever-oasis-508610-n7';
 const curve=createECDH('prime256v1');curve.generateKeys();const keys={p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};
 const actor=prefix+'-actor',recipient=prefix+'-recipient',other=prefix+'-other';
 for(const [id,email] of [[actor,prefix+'-actor@example.invalid'],[recipient,prefix+'-recipient@example.invalid'],[other,prefix+'-other@example.invalid']])await pool.query('INSERT INTO public."Partners"("Row ID","Partner Role","Login Email","Email") VALUES($1,$2,$3,$4)',[id,'B',email.toLowerCase(),'shared-delivery@example.invalid']);
 async function subscription(partner,device){const endpoint='https://fcm.googleapis.com/fcm/send/'+prefix+'-'+device;return(await pool.query('INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[issuer,partner+'-user',partner,createHash('sha256').update(endpoint).digest('hex'),endpoint,keys.p256dh,keys.auth])).rows[0];}
 async function event(n,actorId=actor){return(await pool.query("INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email) VALUES($1,'payment.posted','payment',$1,'posted',$2,$3) RETURNING *",[prefix+'-'+n,actorId,actorId?(prefix+'-actor@example.invalid').toLowerCase():null])).rows[0];}
 async function delivery(e,s){return(await pool.query("INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version) VALUES($1,'web-push',$2,$3,$4,$5) RETURNING *",[e.event_id,s.endpoint_hash,s.partner_id,s.subscription_id,s.version])).rows[0];}
 const store=createNotificationStore({pool:rpc.apiPool,issuer,guardConnection:rpc.apiGuard,resolveActor:async(c,p)=>{const rows=(await c.query('SELECT "Row ID" AS id,"Login Email" AS email FROM public."Partners" WHERE "Row ID"=$1',[p.partnerId])).rows;return rows.length===1?{issuer,subject:p.subject,partnerId:p.partnerId,loginEmail:rows[0].email}:null;}});
 const principal=id=>({ok:true,subject:id+'-user',partnerId:id});
 return{pool,...rpc,prefix,actor,recipient,other,subscription,event,delivery,store,principal,keys,async close(){await pool.query('DELETE FROM public.pwa_notification_deliveries WHERE event_id IN(SELECT event_id FROM public.pwa_notification_events WHERE dedupe_key LIKE $1)',[prefix+'%']);await pool.query('DELETE FROM public.pwa_notification_events WHERE dedupe_key LIKE $1',[prefix+'%']);await pool.query('DELETE FROM public.pwa_notification_preferences WHERE partner_id=ANY($1::text[])',[[actor,recipient,other]]);await pool.query('DELETE FROM public.pwa_push_subscriptions WHERE partner_id=ANY($1::text[])',[[actor,recipient,other]]);await pool.query('DELETE FROM public."Partners" WHERE "Row ID"=ANY($1::text[])',[[actor,recipient,other]]);await rpc.close();await pool.end();}};
}

test('enqueue drains more than100 events per device, excludes actor/unknown and history has unique chronological pages',async()=>{
 const f=await fixture();try{
  const own=await f.subscription(f.actor,'actor'),one=await f.subscription(f.recipient,'one'),two=await f.subscription(f.recipient,'two'),other=await f.subscription(f.other,'other');
  for(let n=0;n<105;n++)await f.event(n);await f.event('unknown',null);
  let more=true,count=0,pages=0;while(more){const page=await enqueueNotifications(f.dispatchPool,{eligible:async()=>true});assert.ok(page.candidates<=100);count+=page.enqueued;more=page.candidates===100;pages++;assert.ok(pages<=4,'bounded candidate anti-join pages');}
  assert.equal(count,315);assert.equal(pages,4);assert.equal((await enqueueNotifications(f.dispatchPool,{eligible:async()=>true})).enqueued,0);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM public.pwa_notification_deliveries WHERE subscription_id=$1',[own.subscription_id])).rows[0].n,0);
  const seen=new Set();let before=null,last=Infinity;do{const page=await f.store.history(f.principal(f.recipient),before);for(const item of page.items){assert.ok(!seen.has(item.eventId));seen.add(item.eventId);const time=Date.parse(item.occurredAt);assert.ok(time<=last,'history must use occurrence chronology');last=time;}assert.doesNotMatch(JSON.stringify(page),new RegExp([one.endpoint,two.endpoint,f.keys.auth,f.keys.p256dh].map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')));before=page.nextCursor;}while(before);assert.equal(seen.size,105);
  const eventId=[...seen][0];await assert.rejects(f.store.target(f.principal(f.actor),eventId),/not_found/);assert.equal((await f.store.target(f.principal(f.recipient),eventId)).kind,'payment');
  await assert.rejects(f.store.subscribe(f.principal(f.other),{endpoint:one.endpoint,expirationTime:null,keys:f.keys}),/access_denied/);
  await f.store.revoke(f.principal(f.other),one.subscription_id);assert.equal((await f.pool.query('SELECT enabled FROM public.pwa_push_subscriptions WHERE subscription_id=$1',[one.subscription_id])).rows[0].enabled,true);
 }finally{await f.close();}
});

test('offline notification dataset matches restricted history pages and targets without writes or delivery credentials',async()=>{
 const f=await fixture();try{
  const recipient=await f.subscription(f.recipient,'offline'),other=await f.subscription(f.other,'isolated');
  for(let n=0;n<31;n++){const event=await f.event('offline-'+n);await f.delivery(event,recipient);if(n===0)await f.delivery(event,other)}
  const before=(await f.pool.query('SELECT count(*)::int AS events FROM public.pwa_notification_events WHERE dedupe_key LIKE $1',[f.prefix+'%'])).rows[0];
  const expected=[];let cursor=null;do{const page=await f.store.history(f.principal(f.recipient),cursor);expected.push(...page.items);cursor=page.nextCursor}while(cursor);
  assert.equal(expected.length,31);
  // Protocol 1 (whole history in one response) is retired (APP-OFFLINE-06): protocol 2 chunks are the reference.
  await assert.rejects(f.store.offlineDataset(f.principal(f.recipient)),/invalid_request/);
  const drain=async principal=>{const data={items:[],targets:[]};let next=null;do{const part=await f.store.offlineDataset(principal,undefined,{protocol:2,cursor:next});assert.equal(part.ok,true);assert.match(part.businessDate,/^\d{4}-\d{2}-\d{2}$/);assert.ok(Number.isFinite(Date.parse(part.asOf)));for(const patch of part.patches)data[patch.key]=patch.mode==='append'?[...data[patch.key],...patch.value]:patch.value;next=part.nextCursor}while(next);return {data}};
  const chunks={items:[],targets:[]};let chunkCursor=null,firstCursor=null,pages=0,generation;do{const part=await f.store.offlineDataset(f.principal(f.recipient),undefined,{protocol:2,cursor:chunkCursor});assert.equal(part.schemaVersion,2);assert.equal(part.domain,'notifications');generation??=part.generation;assert.equal(part.generation,generation);for(const patch of part.patches){assert.ok(['items','targets','status'].includes(patch.key));if(patch.mode==='append'){assert.ok(patch.value.length<=25);chunks[patch.key].push(...patch.value)}else{assert.equal(patch.mode,'replace');chunks[patch.key]=patch.value}}assert.equal(part.complete,part.nextCursor===null);chunkCursor=part.nextCursor;firstCursor??=chunkCursor;pages++;assert.ok(pages<5)}while(chunkCursor);assert.equal(pages,2);assert.deepEqual(chunks.items,expected);assert.equal(new Set(chunks.items.map(row=>row.eventId)).size,31);const result={data:chunks};await assert.rejects(f.store.offlineDataset(f.principal(f.other),undefined,{protocol:2,cursor:firstCursor}),/invalid_request/);await assert.rejects(f.store.offlineDataset(f.principal(f.recipient),undefined,{protocol:2,cursor:'malformed!'}),/invalid_request/);const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const wrongDomain=JSON.parse(Buffer.from(firstCursor,'base64url'));wrongDomain.domain='records';await assert.rejects(f.store.offlineDataset(f.principal(f.recipient),undefined,{protocol:2,cursor:encoded(wrongDomain)}),/invalid_request/);const expired=JSON.parse(Buffer.from(firstCursor,'base64url'));expired.day='2000-01-01';expired.generation=createHash('sha256').update(JSON.stringify([expired.actor,expired.domain,expired.day,expired.startedAt])).digest('hex');await assert.rejects(f.store.offlineDataset(f.principal(f.recipient),undefined,{protocol:2,cursor:encoded(expired)}),/dataset_changed/);
  const cache=new Map();const deltaSweep=async()=>{let cursor=null,transferred=0;const patches=[];do{const manifest=await f.store.offlineDataset(f.principal(f.recipient),undefined,{protocol:3,input:{cursor,need:[]}});assert.equal(manifest.schemaVersion,3);assert.deepEqual(manifest.values,{});const need=[...new Set(manifest.patches.flatMap(patch=>patch.refs))].filter(hash=>!cache.has(hash));if(need.length){const response=await f.store.offlineDataset(f.principal(f.recipient),undefined,{protocol:3,input:{cursor,need}});assert.deepEqual(response.patches,manifest.patches);for(const[hash,value]of Object.entries(response.values)){cache.set(hash,value);transferred++}}for(const patch of manifest.patches)patches.push({...patch,value:patch.mode==='append'?patch.refs.map(hash=>cache.get(hash)):cache.get(patch.refs[0])});cursor=manifest.nextCursor}while(cursor);const data={items:[],targets:[]};for(const patch of patches)data[patch.key]=patch.mode==='append'?[...data[patch.key],...patch.value]:patch.value;return{data,transferred}};const initialDelta=await deltaSweep();assert.deepEqual(initialDelta.data,result.data);assert.ok(initialDelta.transferred>0);const unchangedDelta=await deltaSweep();assert.equal(unchangedDelta.transferred,0);assert.deepEqual(unchangedDelta.data,initialDelta.data);await f.store.preference(f.principal(f.recipient),false);const changedDelta=await deltaSweep();assert.ok(changedDelta.transferred>0);assert.ok(changedDelta.transferred<initialDelta.transferred);assert.deepEqual(changedDelta.data.items,initialDelta.data.items);assert.deepEqual(changedDelta.data.targets,initialDelta.data.targets);assert.deepEqual(changedDelta.data.status,await f.store.status(f.principal(f.recipient),null));await f.store.preference(f.principal(f.recipient),true);
  assert.equal(result.data.targets.length,31);for(const target of result.data.targets){const{eventId,...value}=target;assert.deepEqual(value,await f.store.target(f.principal(f.recipient),eventId))}assert.deepEqual(result.data.status,await f.store.status(f.principal(f.recipient),null));
  const isolated=await drain(f.principal(f.other));assert.equal(isolated.data.items.length,1);const own=await drain(f.principal(f.actor));assert.deepEqual(own.data.items,[]);assert.deepEqual(own.data.targets,[]);assert.doesNotMatch(JSON.stringify(result),new RegExp([recipient.endpoint,other.endpoint,f.keys.auth,f.keys.p256dh].map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')));assert.deepEqual((await f.pool.query('SELECT count(*)::int AS events FROM public.pwa_notification_events WHERE dedupe_key LIKE $1',[f.prefix+'%'])).rows[0],before);assert.equal((await f.pool.query("SELECT count(*)::int AS changed FROM public.pwa_notification_deliveries WHERE event_id IN(SELECT event_id FROM public.pwa_notification_events WHERE dedupe_key LIKE $1) AND state<>'pending'",[f.prefix+'%'])).rows[0].changed,0);
 }finally{await f.close()}
});

test('two real DB dispatchers cannot both send one delivery and later rows remain unleased until send',async()=>{
 const f=await fixture();try{
  const s=await f.subscription(f.recipient,'one'),first=await f.delivery(await f.event(1),s),second=await f.delivery(await f.event(2),s);let sends=0;
  const dispatch=createNotificationDispatcher({pool:f.dispatchPool,enabled:true,guardConnection:f.dispatchGuard,eligible:async()=>true,transport:async()=>{sends++;if(sends===1){const tail=(await f.pool.query('SELECT state,lease_generation,lease_expires_at FROM public.pwa_notification_deliveries WHERE delivery_id=$1',[second.delivery_id])).rows[0];assert.equal(tail.state,'pending');assert.equal(Number(tail.lease_generation),0);assert.equal(tail.lease_expires_at,null);}return{kind:'accepted'};}});
  const result=await dispatch();assert.equal(sends,2);assert.ok(result.results.every(r=>r.state==='sent'));
  await f.pool.query('DELETE FROM public.pwa_notification_deliveries WHERE delivery_id=ANY($1::uuid[])',[[first.delivery_id,second.delivery_id]]);
  await f.delivery(await f.event(3),s);let entered;const started=new Promise(r=>entered=r);let release;const gate=new Promise(r=>release=r);sends=0;
  const one=createNotificationDispatcher({pool:f.dispatchPool,enabled:true,guardConnection:f.dispatchGuard,eligible:async()=>true,transport:async()=>{sends++;entered();await gate;return{kind:'accepted'};}});
  const active=one();await started;const competing=await one();assert.equal(competing.claimed,0);release();await active;assert.equal(sends,1);
 }finally{await f.close();}
});

test('durable send marker distinguishes before-send retry from uncertain acceptance and ambiguous network never retries',async()=>{
 const f=await fixture();try{
  const s=await f.subscription(f.recipient,'one'),d=await f.delivery(await f.event(1),s);
  const claim=(await f.dispatchPool.query('SELECT * FROM public.pwa_claim_notifications_v1(1,30)')).rows[0];assert.equal(claim.send_started_at,null);
  await f.pool.query("UPDATE public.pwa_notification_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE delivery_id=$1",[d.delivery_id]);
  const recovered=(await f.dispatchPool.query('SELECT * FROM public.pwa_claim_notifications_v1(1,30)')).rows[0];assert.ok(Number(recovered.lease_generation)>Number(claim.lease_generation));
  await f.pool.query("UPDATE public.pwa_notification_deliveries SET send_started_at=clock_timestamp(),lease_expires_at=clock_timestamp()-interval '1 second' WHERE delivery_id=$1",[d.delivery_id]);await f.dispatchPool.query('SELECT * FROM public.pwa_claim_notifications_v1(1,30)');assert.equal((await f.pool.query('SELECT state FROM public.pwa_notification_deliveries WHERE delivery_id=$1',[d.delivery_id])).rows[0].state,'uncertain');
  await f.pool.query('DELETE FROM public.pwa_notification_deliveries WHERE delivery_id=$1',[d.delivery_id]);await f.delivery(await f.event(2),s);
  const dispatch=createNotificationDispatcher({pool:f.dispatchPool,enabled:true,guardConnection:f.dispatchGuard,eligible:async()=>true,transport:async()=>({kind:'network'})});
  assert.equal((await dispatch()).results[0].state,'uncertain');assert.equal((await dispatch()).claimed,0);
 }finally{await f.close();}
});

test('R080 content lookup is best effort on the real boundary: one send, unchanged states, generic or V99 text',async()=>{
 const f=await fixture();try{
  const s=await f.subscription(f.recipient,'content');await f.delivery(await f.event('content'),s);const sent=[];
  const v99=(await f.pool.query("SELECT to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)') IS NOT NULL AS present")).rows[0].present;
  const dispatch=createNotificationDispatcher({pool:f.dispatchPool,enabled:true,guardConnection:f.dispatchGuard,eligible:async()=>true,transport:async(_sub,id,options)=>{sent.push({id,content:options.content});return{kind:'accepted'};}});
  assert.deepEqual((await dispatch()).results,[{state:'sent'}]);assert.equal(sent.length,1);
  // The fixture event points at no source row: before V99 the RPC is absent (generic text); from V99 it reports found=false.
  assert.deepEqual(sent[0].content,v99?{title:'Payment received',body:'Details no longer available'}:{title:'MW Credit',body:'New activity'});
  assert.deepEqual((await f.pool.query("SELECT state,provider_result,attempts FROM public.pwa_notification_deliveries WHERE subscription_id=$1",[s.subscription_id])).rows,[{state:'sent',provider_result:'accepted',attempts:1}]);
  assert.equal((await dispatch()).claimed,0);
 }finally{await f.close();}
});

test('new device and reenabled preference cannot backfill prior or already queued events',async()=>{
 const f=await fixture();try{
  await f.event('before-device');const s=await f.subscription(f.recipient,'one');
  assert.equal((await enqueueNotifications(f.dispatchPool,{eligible:async()=>true})).enqueued,0);
  await f.delivery(await f.event('queued-before-disable'),s);
  await f.store.preference(f.principal(f.recipient),false);await f.store.preference(f.principal(f.recipient),true);
  let sends=0,guards=0;const dispatch=createNotificationDispatcher({pool:f.dispatchPool,enabled:true,guardConnection:async c=>{guards++;await f.dispatchGuard(c);},eligible:async()=>true,transport:async()=>{sends++;return{kind:'accepted'};}});
  assert.equal((await dispatch()).results[0].state,'cancelled');assert.equal(sends,0);
  await f.event('new-consented');assert.equal((await enqueueNotifications(f.dispatchPool,{eligible:async()=>true})).enqueued,1);
  assert.equal((await dispatch()).results[0].state,'sent');assert.equal(sends,1);assert.ok(guards>=7);
 }finally{await f.close();}
});

test('actual canonical job date/scope has one concurrent completion, replay and stale-boundary denial',async()=>{
 const f=await fixture();try{
  const clock=(await f.pool.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS day,to_char(clock_timestamp() AT TIME ZONE 'Asia/Bangkok','HH24') AS hour")).rows[0];
  const run=createCanonicalJobRunner({pool:f.jobsPool,guardConnection:f.jobsGuard,enabled:true});const input={job:'recent-analytics',businessDate:clock.day,scope:'hour:'+clock.hour};
  const results=await Promise.all([run(input),run(input)]);assert.equal(results.filter(r=>r.replayed===false).length,1);assert.equal(results.filter(r=>r.replayed===true).length,1);
  assert.equal((await run(input)).replayed,true);await assert.rejects(run({...input,businessDate:'2000-01-01'}),/job_boundary_changed/);
  const row=(await f.pool.query('SELECT state,checkpoint FROM public.pwa_job_runs WHERE job_name=$1 AND business_date=$2 AND scope_key=$3',[input.job,input.businessDate,input.scope])).rows[0];assert.equal(row.state,'completed');assert.equal(row.checkpoint,clock.day+'|'+input.scope);
  await f.pool.query('DELETE FROM public.pwa_job_runs WHERE job_name=$1 AND business_date=$2 AND scope_key=$3',[input.job,input.businessDate,input.scope]);
 }finally{await f.close();}
});

test('actual committed source receipt captures one event; metadata and rolled-back receipt have no extra event',async()=>{
 const f=await fixture();let client;
 try{
  await f.pool.query("ALTER FUNCTION public.pwa_capture_notification_v1() SET application_name='mw_pwa_capture_enabled_v1'" );
  const source=await seedPaymentFixture(f.pool,f.prefix+'-source');
  const email=(await f.pool.query('SELECT "Login Email" AS email FROM public."Partners" WHERE "Row ID"=$1',[source.actorId])).rows[0].email;
  const payment=f.prefix+'-source-payment',insert='INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Created By") VALUES($1,$2,\'4A-RECEIVE\',\'Processing\',110::money,(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date,\'Cash\',\'Selected Charges\',$3,$4)';
  client=await f.pool.connect();await client.query('BEGIN');await client.query("SET LOCAL application_name='mw_pwa_capture_enabled_v1'");await client.query(insert,[payment,source.borrowerId,source.chargeIds[0],email]);
  assert.equal((await client.query('SELECT "Status" AS state FROM public."Payments" WHERE "Row ID"=$1',[payment])).rows[0].state,'Posted');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM public.pwa_notification_events WHERE source_id=$1',[payment])).rows[0].n,1);
  await client.query('ROLLBACK');assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM public.pwa_notification_events WHERE source_id=$1',[payment])).rows[0].n,0);assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM public."Payments" WHERE "Row ID"=$1',[payment])).rows[0].n,0);
  await client.query('BEGIN');await client.query("SET LOCAL application_name='mw_pwa_capture_enabled_v1'");await client.query(insert,[payment,source.borrowerId,source.chargeIds[0],email]);await client.query('COMMIT');
  await client.query('BEGIN');await client.query("SET LOCAL application_name='mw_pwa_capture_enabled_v1'");await client.query('UPDATE public."Payments" SET "Notes"=$1 WHERE "Row ID"=$2',['metadata-only',payment]);await client.query('COMMIT');
  const events=(await f.pool.query('SELECT event_type,actor_partner_id FROM public.pwa_notification_events WHERE source_id=$1',[payment])).rows;assert.deepEqual(events,[{event_type:'payment.posted',actor_partner_id:source.actorId}]);
 }finally{if(client){await client.query('ROLLBACK');client.release();}await f.pool.query("ALTER FUNCTION public.pwa_capture_notification_v1() SET application_name='mw_pwa_capture_disabled_v1'" );await f.close();}
});
