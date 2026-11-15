import test from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../../services/api/collection-read-contract.mjs';
import * as pwa from '../../apps/pwa/src/ig-group-url.ts';
// R161 (owner, 15 November 2026): a borrower with AI collection enabled and no usable group link gets a direct-message
// button to https://ig.me/m/<handle>, from the free-text Instagram Username. One rule in the services and the PWA.
// Invented handles only.
const table=[
 ['name','https://ig.me/m/name'],['@name','https://ig.me/m/name'],['  name  ','https://ig.me/m/name'],[' @name\t','https://ig.me/m/name'],
 ['Name.x_1','https://ig.me/m/Name.x_1'],['a'.repeat(30),'https://ig.me/m/'+'a'.repeat(30)],['a'.repeat(31),null],
 ['',null],['   ',null],['@',null],['a b',null],['name!',null],['@@name',null],['ชื่อไทย',null],['name/x',null],
 ['https://instagram.com/name/','https://ig.me/m/name'],['https://www.instagram.com/name?igsh=x','https://ig.me/m/name'],['https://instagram.com/name','https://ig.me/m/name'],
 ['https://ig.me/m/name','https://ig.me/m/name'],['https://ig.me/m/name/','https://ig.me/m/name'],['@https://instagram.com/name','https://ig.me/m/name'],
 ['https://instagram.com/direct/t/1',null],['https://instagram.com/direct/',null],['https://instagram.com/p/',null],['https://www.instagram.com/Explore',null],['https://instagram.com/reels',null],
 ['https://example.com/name',null],['http://instagram.com/name',null],['https://instagram.com/name#x',null],['https://instagram.com/name/extra',null],['https://ig.me/j/AbCdEf',null],
 ['https://instagram.com/'+'a'.repeat(31),null],
 // Chase Should 1: a handle of dots only is a path, never an account.
 ['.',null],['..',null],['...',null],['@..',null],['https://instagram.com/../',null],['https://ig.me/m/.',null],['.name','https://ig.me/m/.name'],['a.','https://ig.me/m/a.'],[null,null],[undefined,null],[42,null],[{},null],
];
test('R161 igDmUrl: the handle rule, and the services and the PWA give the same result',()=>{
 for(const [input,expected] of table){
  assert.equal(server.igDmUrl(input),expected,JSON.stringify(input));
  assert.equal(pwa.igDmUrl(input),expected,'pwa '+JSON.stringify(input));
 }
 assert.equal(pwa.IG_DM_PATTERN.source,server.IG_DM_PATTERN.source);assert.equal(pwa.IG_HANDLE_PATTERN.source,server.IG_HANDLE_PATTERN.source);
 assert.deepEqual(pwa.IG_RESERVED_PATHS,server.IG_RESERVED_PATHS);
 // Every produced link is a valid DM link on both sides.
 for(const [input] of table){const url=server.igDmUrl(input);if(url){assert.equal(server.validIgDmUrl(url),true);assert.equal(pwa.validIgDmUrl(url),true)}}
});
test('R161 chooseChat: a usable group link wins on both devices; the DM only without one; invalid DM links ignored',()=>{
 const web='https://www.instagram.com/direct/t/100000000000001/',invite='https://ig.me/j/AbCdEfGh12345678/',dm='https://ig.me/m/invented.handle';
 for(const device of ['phone','computer']){
  assert.deepEqual(pwa.chooseChat({url:web,inviteUrl:invite,dmUrl:dm},device),{kind:'group',href:device==='phone'?invite:web});
  assert.deepEqual(pwa.chooseChat({inviteUrl:invite,dmUrl:dm},device),{kind:'group',href:invite});
  assert.deepEqual(pwa.chooseChat({dmUrl:dm},device),{kind:'dm',href:dm});
  // An unusable group link counts as none.
  assert.deepEqual(pwa.chooseChat({url:'javascript:alert(1)',inviteUrl:'https://ig.me/m/invented',dmUrl:dm},device),{kind:'dm',href:dm});
  for(const bad of [undefined,null,'','https://ig.me/m/a b','https://instagram.com/name','javascript:alert(1)','https://ig.me/m/'+'a'.repeat(31)])assert.equal(pwa.chooseChat({dmUrl:bad},device),null,String(bad));
  assert.equal(pwa.chooseChat({},device),null);
 }
 assert.deepEqual([pwa.chatPurpose('group',false),pwa.chatPurpose('dm',false),pwa.chatPurpose('group',true),pwa.chatPurpose('dm',true)],
  ['Open group chat in Instagram','Open Instagram direct message','เปิดแชทกลุ่มใน Instagram','เปิดแชทส่วนตัวใน Instagram']);
});
// R161 (owner's change: no offline shape bump): a row without server links takes the links derived from the borrower's
// record held in the member's records bundle; a row with any server link keeps the server's. Never throws.
test('R161 rowChatLinks and heldChatLinks: server fields first, else the held record; DM only with AI collection enabled',()=>{
 const web='https://www.instagram.com/direct/t/100000000000001/',invite='https://ig.me/j/AbCdEfGh12345678/';
 const records=[{id:'A',aiCollectionEnabled:true,instagramUsername:'@invented.a',igGroupUrl:null,igGroupInviteLink:null},
  {id:'B',aiCollectionEnabled:true,instagramUsername:'invented_b',igGroupUrl:web,igGroupInviteLink:invite},
  {id:'C',aiCollectionEnabled:false,instagramUsername:'invented_c'},{id:'D',aiCollectionEnabled:null,instagramUsername:'invented_d'},
  {id:'E',aiCollectionEnabled:true,instagramUsername:'a b'},{id:'F',aiCollectionEnabled:true},null,'x',{aiCollectionEnabled:true,instagramUsername:'no_id'}];
 const held=pwa.heldChatLinksMap(records);
 assert.deepEqual([...held.keys()],['A','B','C','D','E','F']);
 for(const bad of [undefined,null,'x',{},42])assert.equal(pwa.heldChatLinksMap(bad).size,0);
 const chat=(row,id,device='phone')=>pwa.chooseChat(pwa.rowChatLinks(row,held.get(id)),device);
 assert.deepEqual(chat({id:'A'},'A'),{kind:'dm',href:'https://ig.me/m/invented.a'});
 assert.deepEqual(chat({id:'B'},'B'),{kind:'group',href:invite});assert.deepEqual(chat({id:'B'},'B','computer'),{kind:'group',href:web});
 for(const id of ['C','D','E','F','missing'])assert.equal(chat({id},id),null,id);
 // A row with server links keeps them: a group link from the server wins over a held DM; a server DM shows without a record.
 assert.deepEqual(chat({id:'A',chatUrl:web},'A','computer'),{kind:'group',href:web});
 assert.deepEqual(chat({id:'Z',chatDmUrl:'https://ig.me/m/invented.z'},'Z'),{kind:'dm',href:'https://ig.me/m/invented.z'});
 assert.deepEqual(pwa.rowChatLinks(null,null),{});assert.equal(pwa.heldChatLinks(null),null);
 assert.deepEqual(pwa.heldChatLinks({aiCollectionEnabled:'true',instagramUsername:'invented'}),{url:undefined,inviteUrl:undefined,dmUrl:null});
});
