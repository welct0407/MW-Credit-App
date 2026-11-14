import test from 'node:test';
import assert from 'node:assert/strict';
import {withOfflineReadSlot,OFFLINE_READ_LANES} from '../../services/api/offline-read-slot.mjs';
import {offlineReadLane,shapedVersion} from '../../services/business/offline-dataset-delta.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {createNotificationStore} from '../../services/notifications/store.mjs';

// R159: offline dataset reads run in three lanes per pool (light 2, walk 1, reconcile 1), each with its own FIFO queue.
const gate=()=>{let open;const done=new Promise(resolve=>{open=resolve});return {open,done}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const hold=(pool,events,name,until,options)=>withOfflineReadSlot(pool,undefined,async()=>{events.push(name);await until},options);

test('lanes: limits, independent queues and FIFO order',async()=>{
 assert.deepEqual({...OFFLINE_READ_LANES},{light:2,walk:1,reconcile:1});
 const pool={},events=[],walk=gate(),light=gate();
 const walks=[hold(pool,events,'walk1',walk.done,{lane:'walk'}),hold(pool,events,'walk2',walk.done,{lane:'walk'}),hold(pool,events,'walk3',undefined,{lane:'walk'})];
 const lights=[hold(pool,events,'light1',light.done),hold(pool,events,'light2',light.done),hold(pool,events,'light3',undefined)];
 await tick();
 // A walk in progress does not hold back the light lane; the light lane runs two and queues the third.
 assert.deepEqual(events,['walk1','light1','light2']);
 light.open();await Promise.all(lights);assert.deepEqual(events,['walk1','light1','light2','light3']);
 walk.open();await Promise.all(walks);assert.deepEqual(events.filter(name=>name.startsWith('walk')),['walk1','walk2','walk3']);
 // Pools are independent.
 const other={},held=gate();const first=hold(pool,events,'a',held.done,{lane:'walk'}),second=hold(other,events,'b',undefined,{lane:'walk'});
 await second;held.open();await first;
 await assert.rejects(withOfflineReadSlot(pool,undefined,async()=>{},{lane:/** @type {any} */('other')}),/invalid_lane/);
});

test('lanes: wait:false and unless reject with offline_read_busy without running the work',async()=>{
 const pool={},events=[],walk=gate(),reconcile=gate();
 let ran=0;const work=async()=>{ran++};
 const running=hold(pool,events,'reconcile',reconcile.done,{lane:'reconcile',wait:false});
 await tick();
 await assert.rejects(withOfflineReadSlot(pool,undefined,work,{lane:'reconcile',wait:false}),/offline_read_busy/);
 reconcile.open();await running;
 // A walk running, then a walk only waiting: the reconciliation is refused either way.
 const walk1=hold(pool,events,'walk1',walk.done,{lane:'walk'});await tick();
 await assert.rejects(withOfflineReadSlot(pool,undefined,work,{lane:'reconcile',wait:false,unless:['walk']}),/offline_read_busy/);
 const queued=gate();const walk2=hold(pool,events,'walk2',queued.done,{lane:'walk'});
 walk.open();await walk1;await tick();
 await assert.rejects(withOfflineReadSlot(pool,undefined,work,{lane:'reconcile',wait:false,unless:['walk']}),/offline_read_busy/);
 queued.open();await walk2;
 assert.equal(ran,0);
 // Idle walk lane: the reconciliation runs, and its wait is reported.
 const slot=await withOfflineReadSlot(pool,undefined,async value=>value,{lane:'reconcile',wait:false,unless:['walk']});
 assert.equal(slot.lane,'reconcile');assert.ok(slot.waitMs>=0&&slot.waitMs<1000);
});

test('lanes: a queued cancel leaves the queue and a throw releases the lane',async()=>{
 const pool={},events=[],walk=gate(),abort=new AbortController();
 const first=hold(pool,events,'first',walk.done,{lane:'walk'});await tick();
 const cancelled=withOfflineReadSlot(pool,abort.signal,async()=>events.push('cancelled'),{lane:'walk'});
 const rejection=assert.rejects(cancelled,/offline_read_cancelled/);abort.abort();await rejection;
 const third=hold(pool,events,'third',undefined,{lane:'walk'});
 walk.open();await Promise.all([first,third]);assert.deepEqual(events,['first','third']);
 await assert.rejects(withOfflineReadSlot(pool,abort.signal,async()=>events.push('late'),{lane:'walk'}),/offline_read_cancelled/);
 await assert.rejects(withOfflineReadSlot(pool,undefined,async()=>{throw Error('boom')},{lane:'walk'}),/boom/);
 await hold(pool,events,'after',undefined,{lane:'walk'});assert.deepEqual(events,['first','third','after']);
 // The queued request reports how long it waited.
 const slow=gate(),blocker=hold(pool,events,'blocker',slow.done,{lane:'walk'});
 const waited=withOfflineReadSlot(pool,undefined,async value=>value.waitMs,{lane:'walk'});
 setTimeout(slow.open,30);await blocker;assert.ok(await waited>=20);
});

test('offlineReadLane chooses the lane from the request and never throws',()=>{
 const current=shapedVersion('a'.repeat(64)),old='b'.repeat(64),since={seq:'7',xmin:'9',businessDate:'2026-11-14'};
 const digests={digest:'c'.repeat(64),keys:{payments:'d'.repeat(64)}};
 const base={cursor:null,need:[]};
 for(const [label,protocol,input,lane] of [
  ['reconciliation',3,{reconcile:true,digests,sourceVersion:current},'reconcile'],
  ['continuing traversal',3,{...base,cursor:'abc',sourceVersion:current,since},'walk'],
  ['protocol 2 chunk',2,undefined,'walk'],
  ['bundle of an earlier shape',3,{...base,sourceVersion:old,since},'walk'],
  ['no bundle',3,{...base,sourceVersion:null},'walk'],
  ['current version (unchanged check or delta)',3,{...base,sourceVersion:current,since,rowDeltas:true},'light'],
  ['current version without a change cursor',3,{...base,sourceVersion:current},'light'],
  ['own writes applied locally (null version with since)',3,{...base,sourceVersion:null,since},'light'],
  ['garbage input',3,{bogus:true},'light'],
  ['not an object',3,'records','light'],
  ['missing input',3,undefined,'light'],
  ['invalid version',3,{...base,sourceVersion:5},'light'],
  ['unknown protocol',9,{...base,sourceVersion:null},'light'],
 ])assert.equal(offlineReadLane(protocol,input),lane,label);
});

test('a reconciliation while a walk holds the instance answers 503 and logs busy, not an error',async()=>{
 let connects=0;const pool={connect:async()=>{connects++;throw Error('no database in this test')}};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>null,actorIssuer:'synthetic-issuer'});
 const walk=gate(),running=withOfflineReadSlot(pool,undefined,()=>walk.done,{lane:'walk'});await tick();
 const lines=[],write=console.log;console.log=line=>lines.push(line);
 let result;try{result=await store.offlineDataset({ok:true},'records',undefined,{protocol:3,input:{reconcile:true,sourceVersion:shapedVersion('a'.repeat(64)),digests:{digest:'c'.repeat(64),keys:{}}}})}finally{console.log=write}
 walk.open();await running;
 assert.deepEqual(result,{ok:false,status:503,code:'command_unavailable'});assert.equal(connects,0);
 assert.deepEqual(lines.map(line=>JSON.parse(line)),[{domain:'records',result:'busy',severity:'INFO',event:'offline_reconcile'}]);
});

test('a long queue wait is logged once as offline_read_wait with its lane',async()=>{
 const pool={connect:async()=>{throw Error('unavailable')}};
 const store=createNotificationStore({pool,guardConnection:async()=>{},resolveActor:async()=>null,issuer:'synthetic-issuer'});
 const lines=[],write=console.log,now=Date.now;let clock=now();
 const blockers=[gate(),gate()],held=blockers.map(item=>withOfflineReadSlot(pool,undefined,()=>item.done));await tick();
 console.log=line=>lines.push(line);Date.now=()=>clock;
 try{
  const pending=store.offlineDataset({},undefined,{protocol:2});
  clock+=3500;for(const item of blockers)item.open();await Promise.all(held);
  await assert.rejects(pending,/unavailable/);
 }finally{console.log=write;Date.now=now}
 assert.deepEqual(lines.map(line=>JSON.parse(line)),[{lane:'light',waitMs:3500,domain:'notifications',severity:'INFO',event:'offline_read_wait'}]);
});
