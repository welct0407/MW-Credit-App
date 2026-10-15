import test from 'node:test';
import assert from 'node:assert/strict';
import {FirestoreStore,MemoryStore} from '../dist/store.js';

test('Firestore adapter buffers writes, preserves transaction read-before-write and rolls back on exception',async()=>{
  const committed=new Map([['items/a',{n:1}]]);
  const fake={doc:path=>({path}),runTransaction:async fn=>{
    const staged=new Map();let writing=false;
    const result=await fn({get:async ref=>{assert.equal(writing,false);return {exists:committed.has(ref.path),data:()=>committed.get(ref.path)};},set:(ref,v)=>{writing=true;staged.set(ref.path,v);},delete:ref=>{writing=true;staged.set(ref.path,undefined);}});
    for(const [k,v] of staged)v?committed.set(k,v):committed.delete(k);return result;
  }};
  const store=new FirestoreStore(fake);
  await store.atomic(async tx=>{tx.set('items/a',{n:2});assert.equal((await tx.get('items/a')).n,2);assert.equal(await tx.get('items/b'),undefined);tx.set('items/b',{n:3});});
  assert.deepEqual(committed.get('items/a'),{n:2});
  await assert.rejects(()=>store.atomic(async tx=>{tx.delete('items/a');throw new Error('rollback');}));assert.ok(committed.has('items/a'));
});
test('memory contract serializes concurrent read-modify-write and isolates stored values',async()=>{
  const store=new MemoryStore();await store.atomic(async tx=>tx.set('counter/one',{n:0}));
  await Promise.all(Array.from({length:20},()=>store.atomic(async tx=>{const row=await tx.get('counter/one');tx.set('counter/one',{n:row.n+1});})));
  const value=await store.get('counter/one');assert.equal(value.n,20);value.n=999;assert.equal((await store.get('counter/one')).n,20);
});
