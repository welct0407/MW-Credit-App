import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
// APP-OFFLINE-05: a notification tap with the app open is offered to that tab first; only a tab that does not
// acknowledge is navigated, and with no tab a new window opens. The worker source runs unmodified in a stub scope.
const source=readFileSync(new URL('../../apps/pwa/pwa/sw.js',import.meta.url),'utf8');
const eventId='00000000-0000-4000-8000-000000000001',origin='https://app.example.test';
// The 1.5 s acknowledgement timer never races the MessageChannel reply: with expire=false it is held and only
// clearTimeout can drop it (an acknowledging tab must clear it); with expire=true it runs on the next turn.
function load(clients,{delays=[],expire=false,held=new Set()}={}){
 const listeners={};const self={location:{origin},addEventListener:(type,fn)=>{listeners[type]=fn},clients,registration:{}};
 const stubTimeout=(fn,ms)=>{delays.push(ms);if(ms!==1500)return setTimeout(fn,ms);if(expire)return setTimeout(fn,0);const handle={fn};held.add(handle);return handle};
 const stubClear=handle=>{if(!held.delete(handle))clearTimeout(handle)};
 vm.runInNewContext(source,{self,URL,MessageChannel,Response,TextDecoder,caches:{},fetch:()=>{throw Error('unused')},setTimeout:stubTimeout,clearTimeout:stubClear});
 return listeners.notificationclick;
}
async function click(listener){let work;listener({notification:{close(){},data:{eventId}},waitUntil:promise=>{work=promise}});await work}
function client(url,{focused=false,ack}={}){const calls=[];return {calls,url,focused,focus:async()=>{calls.push('focus')},navigate:async target=>{calls.push('navigate:'+target)},postMessage:(message,ports)=>{calls.push('post:'+message.type+':'+message.eventId);if(ack)ports[0].postMessage({handled:true});else ports[0].close()}}}
test('the focused open tab handles the tap in place without navigation',{timeout:5000},async()=>{
 const other=client(origin+'/',{ack:true}),focused=client(origin+'/',{focused:true,ack:true});const opened=[],delays=[],held=new Set();
 await click(load({matchAll:async()=>[other,focused],openWindow:async url=>{opened.push(url)}},{delays,held}));
 assert.deepEqual(focused.calls,['focus','post:NOTIFICATION_OPEN:'+eventId]);assert.deepEqual(other.calls,[]);assert.deepEqual(opened,[]);
 assert.ok(delays.includes(1500));assert.equal(held.size,0);
});
test('a tab that never acknowledges is navigated after the 1.5 s wait',async()=>{
 const silent=client(origin+'/?x=1');const delays=[];
 await click(load({matchAll:async()=>[silent],openWindow:async()=>{throw Error('unexpected')}},{delays,expire:true}));
 assert.ok(delays.includes(1500));assert.deepEqual(silent.calls,['focus','post:NOTIFICATION_OPEN:'+eventId,'navigate:'+origin+'/?notification='+eventId]);
});
test('no same-origin tab opens a new window; other origins are ignored',async()=>{
 const foreign=client('https://elsewhere.example.test/',{focused:true,ack:true});const opened=[];
 await click(load({matchAll:async()=>[foreign],openWindow:async url=>{opened.push(url)}}));
 assert.deepEqual(opened,[origin+'/?notification='+eventId]);assert.deepEqual(foreign.calls,[]);
});
test('an invalid event id does nothing',async()=>{
 let matched=0;const listener=load({matchAll:async()=>{matched++;return []},openWindow:async()=>{}});let work;
 listener({notification:{close(){},data:{eventId:'not-an-id'}},waitUntil:promise=>{work=promise}});assert.equal(work,undefined);assert.equal(matched,0);
});
