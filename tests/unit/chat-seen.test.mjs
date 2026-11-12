import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// R146: the group chat summary's per-device seen state (pure module, transpiled as the PWA build does): the list mark
// rule, the guarded storage reads and writes, and the event that clears a mark without a reload.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/chat-seen.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {CHAT_SEEN_EVENT,CHAT_MARK_WINDOW_MS,readChatSeen,markChatSeen,chatMarkShown,graphemes,splitNameForMark}=await import('data:text/javascript,'+encodeURIComponent(source));
const now=Date.parse('2026-11-12T08:00:00Z'),at='2026-11-12T07:05:00.000Z';
function install({blocked=false}={}){
 const store=new Map(),events=[];
 globalThis.localStorage=blocked?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>{store.set(key,String(value))}};
 globalThis.window={dispatchEvent:event=>{events.push(event.type);return true}};
 return {store,events};
}
test('the mark shows for a summary within 72 hours that this device has not shown; never without readable storage',()=>{
 assert.equal(CHAT_MARK_WINDOW_MS,72*3600*1000);
 assert.equal(chatMarkShown({},'A',at,now),true);
 assert.equal(chatMarkShown({A:at},'A',at,now),false,'already shown');
 assert.equal(chatMarkShown({A:'2026-11-11T07:05:00.000Z'},'A',at,now),true,'a newer summary relights it');
 assert.equal(chatMarkShown({B:at},'A',at,now),true,'another borrower');
 assert.equal(chatMarkShown({},'A','2026-11-09T08:00:00.000Z',now),true,'exactly 72 hours');
 assert.equal(chatMarkShown({},'A','2026-11-09T07:59:59.000Z',now),false,'older than 72 hours: stale, no mark');
 for(const value of [null,undefined,'','not a time',123])assert.equal(chatMarkShown({},'A',value,now),false,String(value));
 assert.equal(chatMarkShown(null,'A',at,now),false,'storage unreadable: no marks');
});
test('seen is stored per scope under mw-credit.chat-seen:<scope>, announced once, and pruned of old entries',()=>{
 const {store,events}=install();
 assert.deepEqual(readChatSeen('scope-1'),{});
 markChatSeen('scope-1','A',at,now);
 assert.deepEqual(JSON.parse(store.get('mw-credit.chat-seen:scope-1')),{A:at});assert.deepEqual(events,[CHAT_SEEN_EVENT]);
 markChatSeen('scope-1','A',at,now);assert.equal(events.length,1,'the same version again writes and announces nothing');
 markChatSeen('scope-1','B','2026-11-12T06:00:00.000Z',now);markChatSeen('scope-2','A','2026-11-10T00:00:00.000Z',now);
 assert.deepEqual(readChatSeen('scope-1'),{A:at,B:'2026-11-12T06:00:00.000Z'});assert.deepEqual(readChatSeen('scope-2'),{A:'2026-11-10T00:00:00.000Z'});
 store.set('mw-credit.chat-seen:scope-1',JSON.stringify({OLD:'2026-09-01T00:00:00.000Z',BAD:'x',A:at}));
 markChatSeen('scope-1','C',at,now);assert.deepEqual(readChatSeen('scope-1'),{A:at,C:at});
});
test('blocked or damaged storage: reads answer null, writes do nothing and never throw',()=>{
 const blocked=install({blocked:true});
 assert.equal(readChatSeen('scope'),null);assert.doesNotThrow(()=>markChatSeen('scope','A',at,now));assert.deepEqual(blocked.events,[]);
 const damaged=install();
 for(const raw of ['not json','[]','"text"','null','7']){damaged.store.set('mw-credit.chat-seen:scope',raw);assert.equal(readChatSeen('scope'),null,raw);markChatSeen('scope','A',at,now);assert.equal(damaged.store.get('mw-credit.chat-seen:scope'),raw,'left as it is')}
 damaged.store.set('mw-credit.chat-seen:scope',JSON.stringify({A:at,B:5,C:null}));assert.deepEqual(readChatSeen('scope'),{A:at});
 delete globalThis.localStorage;assert.equal(readChatSeen('scope'),null,'no storage at all');assert.doesNotThrow(()=>markChatSeen('scope','A',at,now));
});
test('storage that reads but refuses writes: after the card renders there are no marks for the session, and the list is told',async()=>{
 // A fresh module instance: the unwritable flag is per page load.
 const fresh=await import('data:text/javascript,'+encodeURIComponent(source+'\n//refused-writes'));
 const store=new Map([['mw-credit.chat-seen:scope',JSON.stringify({B:at})]]),events=[];
 globalThis.localStorage={getItem:key=>store.has(key)?store.get(key):null,setItem(){throw new Error('QuotaExceededError')}};
 globalThis.window={dispatchEvent:event=>{events.push(event.type);return true}};
 assert.equal(fresh.chatMarkShown(fresh.readChatSeen('scope'),'A',at,now),true,'readable: the mark shows before the card renders');
 assert.doesNotThrow(()=>fresh.markChatSeen('scope','A',at,now));
 assert.deepEqual(events,[fresh.CHAT_SEEN_EVENT],'the list is told even though nothing was stored');
 assert.equal(fresh.readChatSeen('scope'),null);assert.equal(fresh.chatMarkShown(fresh.readChatSeen('scope'),'A',at,now),false,'no mark after the render');
 assert.equal(fresh.chatMarkShown(fresh.readChatSeen('scope'),'C',at,now),false,'and none that could never be cleared');
 assert.deepEqual(fresh.readChatSeen('other-scope'),{},'another scope is unaffected');
 assert.equal(store.get('mw-credit.chat-seen:scope'),JSON.stringify({B:at}),'the stored value is left as it was');
 fresh.markChatSeen('scope','C',at,now);assert.equal(events.length,1,'nothing more to announce');
});
// UX-CHAT-06: the name is split for the glued mark on grapheme boundaries, with and without Intl.Segmenter.
test('the no-wrap tail of the mark: the last word, or the last 8 graphemes of a long one, never splitting a Thai cluster or an emoji',()=>{
 const base=text=>!/^(?:\p{M}|\u200D|[\uFE00-\uFE0F])/u.test(text)&&!/^[\uDC00-\uDFFF]/.test(text);
 const thai='ผู้กู้ตัวอย่างชื่อยาวมากเป็นพิเศษสุดๆ'; // invented long name without a space
 assert.ok(!base(thai.slice(thai.length-8)),'the UTF-16 cut this replaces starts on a vowel mark');
 for(const [label,segmenter] of [['Intl.Segmenter',undefined],['fallback (no Intl.Segmenter)',null]]){
  const split=name=>segmenter===undefined?splitNameForMark(name):splitNameForMark(name,segmenter);
  const [head,tail]=split(thai);
  assert.equal(head+tail,thai,label+': the name is unchanged');assert.ok(base(tail),label+': the tail starts on a base character: '+tail);assert.ok(tail.length<thai.length);
  assert.equal(graphemes(tail,segmenter===undefined?Intl.Segmenter:segmenter).length,8,label+': eight graphemes');
  assert.deepEqual(split('Somchai K.'),['Somchai ','K.'],label);assert.deepEqual(split('Nok'),['','Nok'],label);
  assert.deepEqual(split('Long synthetic borrower English name for wrapping'),['Long synthetic borrower English name for ','wrapping'],label);
  assert.deepEqual(split('trailing space '),['trailing ','space '],label);
  // Sixteen graphemes stay whole; seventeen are cut to the last eight.
  assert.deepEqual(split('x '+'ก้'.repeat(16)),['x ','ก้'.repeat(16)],label);assert.deepEqual(split('x '+'ก้'.repeat(17)),['x '+'ก้'.repeat(9),'ก้'.repeat(8)],label);
  // Emoji: surrogate pairs, a variation selector and a zero-width-joiner family stay in one piece.
  const emoji='abcdefghijklmnop'+'😀'+'❤️'+'👨‍👩‍👧'+'xyz12';
  const [emojiHead,emojiTail]=split(emoji);assert.equal(emojiHead+emojiTail,emoji,label);assert.equal(emojiTail,'😀❤️👨‍👩‍👧xyz12',label);
  for(const name of [thai,emoji,'x '+'ก้'.repeat(17)]){const [h,t]=split(name);assert.ok(h.isWellFormed()&&t.isWellFormed(),label+': no lone surrogate')}
 }
 assert.deepEqual(graphemes('ผู้',null),['ผู้']);assert.deepEqual(graphemes('a😀b',null),['a','😀','b']);
 // A Segmenter that throws falls back as well.
 assert.deepEqual(graphemes('กี่',class{constructor(){throw Error('unsupported')}}),['กี่']);
});
