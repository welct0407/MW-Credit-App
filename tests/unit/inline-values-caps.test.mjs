import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeDeltaChunk,deltaValueHash,INLINE_VALUE_BYTES,INLINE_VALUE_COUNT} from '../../services/api/offline-dataset-delta.mjs';

// R078 inline values: the caps (2048 values, 512 KB), the identical manifest, and the old-client path.
const chunk=values=>({domain:'records',patches:[{key:'rows',mode:'append',value:values}],complete:true,nextCursor:null});
const rows=(count,size=8)=>Array.from({length:count},(_,index)=>({id:'r'+index,pad:'x'.repeat(size)}));
test('the value-count cap: 2048 values travel inline, 2049 fall back to manifest and need',()=>{
 assert.equal(INLINE_VALUE_COUNT,2048);
 const at=encodeDeltaChunk(chunk(rows(2048)),[],{inline:true}),over=encodeDeltaChunk(chunk(rows(2049)),[],{inline:true});
 assert.equal(Object.keys(at.values).length,2048);assert.equal(Object.keys(over.values).length,0);assert.equal(over.patches[0].refs.length,2049);
});
test('the byte cap: just under 512 KB travels inline, just over falls back',()=>{
 assert.equal(INLINE_VALUE_BYTES,512*1024);
 const size=count=>Buffer.byteLength(JSON.stringify(Object.fromEntries(encodeDeltaChunk(chunk(rows(count,1000)),[],{inline:true}).patches[0].refs.map((ref,index)=>[ref,rows(count,1000)[index]]))));
 let low=1,high=2000;while(low<high){const mid=Math.ceil((low+high)/2);if(size(mid)<=INLINE_VALUE_BYTES)low=mid;else high=mid-1}
 // low is the largest row count whose canonical values fit; the encoder must agree on both sides of the boundary.
 const fits=encodeDeltaChunk(chunk(rows(low,1000)),[],{inline:true}),spills=encodeDeltaChunk(chunk(rows(low+1,1000)),[],{inline:true});
 assert.equal(Object.keys(fits.values).length,low);assert.equal(Object.keys(spills.values).length,0);
 assert.ok(Buffer.byteLength(JSON.stringify(fits.values))<=INLINE_VALUE_BYTES);
});
test('the manifest is identical with or without inline values, and every inline value hashes to its key',()=>{
 const input=rows(40),plain=encodeDeltaChunk(chunk(input),[]),inline=encodeDeltaChunk(chunk(input),[],{inline:true});
 assert.deepEqual(inline.patches,plain.patches);assert.deepEqual(plain.values,{});
 for(const [hash,value] of Object.entries(inline.values))assert.equal(deltaValueHash(value),hash);
 assert.deepEqual(new Set(Object.keys(inline.values)),new Set(inline.patches[0].refs));
});
test('a need request returns exactly the requested values, whatever inline says; an old client gets none inline',()=>{
 const input=rows(10),manifest=encodeDeltaChunk(chunk(input),[],{inline:true}),want=manifest.patches[0].refs.slice(0,3);
 const need=encodeDeltaChunk(chunk(input),want,{inline:true});
 assert.deepEqual(Object.keys(need.values).sort(),[...want].sort());
 assert.deepEqual(encodeDeltaChunk(chunk(input),[]).values,{});
});
