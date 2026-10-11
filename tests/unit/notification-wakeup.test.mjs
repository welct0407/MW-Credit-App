import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createNotificationWakeup} from '../../services/notifications/wakeup.mjs';
const eventually=async condition=>{for(let i=0;i<100&&!condition();i++)await new Promise(r=>setTimeout(r,10));assert.ok(condition());};
test('LISTEN completes before durable drain; wakeups during drain coalesce without overlapping claims',async()=>{
 const order=[],client=new EventEmitter();client.connect=async()=>{order.push('connect');};client.query=async sql=>{order.push(sql);};client.end=async()=>{};
 let active=0,maxActive=0,runs=0,release;
 const first=new Promise(r=>{release=r;});
 const wake=await createNotificationWakeup({createListener:async()=>client,guardConnection:async()=>order.push('guard'),run:async()=>{runs++;active++;maxActive=Math.max(maxActive,active);order.push('drain');if(runs===1)await first;active--;return{claimed:0,enqueued:0};}});
 await eventually(()=>runs===1);assert.deepEqual(order.slice(0,4),['connect','guard','LISTEN mw_pwa_notifications_v1','drain']);
 client.emit('notification',{channel:'mw_pwa_notifications_v1',payload:'untrusted ignored'});wake.wake();wake.wake();release();await eventually(()=>runs===2);assert.equal(maxActive,1);await wake.close();wake.wake();assert.equal(runs,2);
});
test('full runnable batches rearm immediately and reconnect drains durable backlog even without a new signal',async()=>{
 const clients=[];let runs=0;
 const wake=await createNotificationWakeup({retryMs:1,createListener:async()=>{const c=new EventEmitter();c.connect=async()=>{};c.query=async()=>{};c.end=async()=>{};clients.push(c);return c;},guardConnection:async()=>{},run:async()=>{runs++;return{claimed:runs===1?10:0,enqueued:0};}});
 await eventually(()=>runs===2);clients[0].emit('error',Error('synthetic disconnect'));await eventually(()=>clients.length===2&&runs===3);await wake.close();
});
