import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
// R080: a v2 push shows its own title and body; v1, malformed or out-of-bounds text shows the neutral fallback.
// The worker source runs unmodified in a stub scope (same harness as sw-notification-click.test.mjs).
const source=readFileSync(new URL('../../apps/pwa/pwa/sw.js',import.meta.url),'utf8');
const eventId='00000000-0000-4000-8000-000000000001',origin='https://app.example.test';
const fallback={title:'MW Credit',body:'New activity · มีรายการใหม่'};
function load(shown){
 const listeners={};const self={location:{origin},addEventListener:(type,fn)=>{listeners[type]=fn},clients:{},registration:{showNotification:async(title,options)=>{shown.push({title,...options})}}};
 vm.runInNewContext(source,{self,URL,MessageChannel,Response,TextDecoder,caches:{},fetch:()=>{throw Error('unused')},setTimeout,clearTimeout});
 return listeners.push;
}
async function push(data){const shown=[];let work;load(shown)({data:data===undefined?undefined:{json:()=>typeof data==='string'?JSON.parse(data):data},waitUntil:promise=>{work=promise}});await work;return shown;}
const shape=(title,body)=>[{title,body,tag:'mw-credit-'+eventId,data:{eventId}}];
test('a v2 push shows the event title and body with the unchanged tag and event id',async()=>{
 const shown=await push({v:2,eventId,title:'รับชำระแล้ว ฿5,000',body:'สมชาย ใจดี',url:'/?notification='+eventId,tag:'mw-credit-'+eventId});
 assert.deepEqual(JSON.parse(JSON.stringify(shown)),shape('รับชำระแล้ว ฿5,000','สมชาย ใจดี'));
});
test('v1, missing or out-of-bounds text uses the neutral fallback, never the old update wording',async()=>{
 for(const payload of [
  {v:1,eventId,title:'MW Credit',body:'An update is available.'},
  {v:2,eventId},{v:2,eventId,title:'Payment received',body:''},{v:2,eventId,title:'',body:'x'},
  {v:2,eventId,title:'x'.repeat(61),body:'x'},{v:2,eventId,title:'x',body:'x'.repeat(201)},{v:2,eventId,title:['x'],body:'x'}]){
  const shown=JSON.parse(JSON.stringify(await push(payload)));assert.deepEqual(shown,shape(fallback.title,fallback.body),JSON.stringify(payload));assert.doesNotMatch(JSON.stringify(shown),/update/i);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(await push({v:2,eventId,title:'x'.repeat(60),body:'y'.repeat(200)}))),shape('x'.repeat(60),'y'.repeat(200)),'bounds are inclusive');
});
test('unknown versions, invalid event ids and unparsable data show nothing',async()=>{
 for(const payload of [{v:3,eventId,title:'t',body:'b'},{v:2,eventId:'not-an-id',title:'t',body:'b'},{v:'2',eventId,title:'t',body:'b'},null])assert.deepEqual(await push(payload),[],JSON.stringify(payload));
 assert.deepEqual(await push(undefined),[]);
 const shown=[];let work;load(shown)({data:{json:()=>{throw SyntaxError('bad')}},waitUntil:promise=>{work=promise}});await work;assert.deepEqual(shown,[]);
});
