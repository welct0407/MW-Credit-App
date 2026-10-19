import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecognizerClient,RECOGNITION_UPSTREAM_TIMEOUT_MS} from '../../services/receipts/recognizer-client.mjs';
import {RECOGNITION_DEADLINE_MS} from '../../apps/pwa/src/recognition-timing.ts';

// R077 timing chain: the agent recognizer gives up at 42 s, the command route waits for it up to 45 s and the
// PWA waits up to 60 s, so each layer answers before the one above it gives up.
const AGENT_RECOGNIZER_BOUND_MS=42000;

test('recognition limits chain agent 42 s < command route 45 s < PWA 60 s',()=>{
 assert.equal(RECOGNITION_UPSTREAM_TIMEOUT_MS,45000);
 assert.equal(RECOGNITION_DEADLINE_MS,60000);
 assert.ok(AGENT_RECOGNIZER_BOUND_MS<RECOGNITION_UPSTREAM_TIMEOUT_MS&&RECOGNITION_UPSTREAM_TIMEOUT_MS<RECOGNITION_DEADLINE_MS);
});

test('the command recognizer client defaults to the 45 s upstream limit',async()=>{
 const delays=[];const realTimeout=AbortSignal.timeout;
 AbortSignal.timeout=ms=>{delays.push(ms);return realTimeout.call(AbortSignal,ms)};
 try{
  const client=createRecognizerClient({url:'http://10.148.0.2:8790/v1/receipt-recognition',fetch:async()=>new Response('',{status:503}),mintToken:async()=>'a.b.c'});
  assert.equal((await client.recognize({bytes:Buffer.from('png'),mimeType:'image/png'})).reason,'recognizer_unavailable');
 }finally{AbortSignal.timeout=realTimeout}
 assert.deepEqual(delays,[45000]);
});

test('the receiving form times recognition with the shared 60 s deadline, not call()\'s 15 s abort',async()=>{
 const source=await readFile(new URL('../../apps/pwa/src/SelectedCharges.tsx',import.meta.url),'utf8');
 assert.match(source,/import \{RECOGNITION_DEADLINE_MS\} from '\.\/recognition-timing';/);
 assert.doesNotMatch(source,/RECOGNITION_DEADLINE_MS\s*=/);
 const recognize=source.slice(source.indexOf('async function recognize('),source.indexOf('function applyRecognition('));
 assert.match(recognize,/setTimeout\(\(\)=>controller\.abort\(\),RECOGNITION_DEADLINE_MS\)/);
 assert.doesNotMatch(recognize,/await call\(/);
});
