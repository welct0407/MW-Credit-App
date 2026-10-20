import test from 'node:test';import assert from 'node:assert/strict';
import {renderNotification,genericNotification,graphemeLength,baht,TITLE_BUDGET,BODY_BUDGET} from '../../services/notifications/content.mjs';
// R080: lock-screen wording per event and recipient language within the iPhone banner budgets.
// Body is the borrower name only (owner decision: no actor); the title is activity plus amount.
const facts=(over={})=>({found:true,eventType:'payment.posted',language:'en',borrowerName:'Somchai Jaidee',amount:'5000',...over});
const withinBudgets=n=>{assert.ok(graphemeLength(n.title)<=TITLE_BUDGET,n.title);assert.ok(graphemeLength(n.body)<=BODY_BUDGET,n.body);assert.doesNotMatch(n.title+n.body,/update|อัปเดต/i);};

test('three event types in English and Thai',()=>{
 const cases=[
  ['payment.posted','en',5000,'Payment received ฿5,000','Somchai Jaidee'],
  ['payment.posted','th',5000,'รับชำระแล้ว ฿5,000','สมชาย ใจดี'],
  ['loan.created','en',20000,'New loan ฿20,000','Somchai Jaidee'],
  ['loan.created','th',20000,'สินเชื่อใหม่ ฿20,000','สมชาย ใจดี'],
  ['loan.closed','en',20000,'Loan closed ฿20,000','Somchai Jaidee'],
  ['loan.closed','th',20000,'ปิดสินเชื่อแล้ว ฿20,000','สมชาย ใจดี']];
 for(const [eventType,language,amount,title,body] of cases){
  const n=renderNotification(facts({eventType,language,amount,borrowerName:language==='th'?'สมชาย ใจดี':'Somchai Jaidee'}));
  assert.deepEqual(n,{title,body},eventType+' '+language);withinBudgets(n);
 }
});

test('no actor ever reaches the banner, even when a caller still passes one',()=>{
 for(const language of ['en','th']){const n=renderNotification({...facts({language}),actorName:'Nok',actor_name:'Nok'});assert.equal(n.body,'Somchai Jaidee');assert.doesNotMatch(n.title+n.body,/Nok|by |โดย/);}
});

test('unset or unknown language is English; unknown type or missing facts are generic',()=>{
 for(const language of [null,undefined,'','English','fr'])assert.deepEqual(renderNotification(facts({language})),{title:'Payment received ฿5,000',body:'Somchai Jaidee'});
 assert.deepEqual(genericNotification(),{title:'MW Credit',body:'New activity'});
 for(const value of [null,undefined,{},facts({eventType:'loan.deleted'}),facts({eventType:'constructor'}),facts({eventType:'__proto__'})])assert.deepEqual(renderNotification(value),{title:'MW Credit',body:'New activity'});
 assert.deepEqual(renderNotification(facts({eventType:'unknown',language:'th'})),{title:'MW Credit',body:'มีรายการใหม่'});
 for(const n of [genericNotification(),genericNotification('th')])withinBudgets(n);
});

test('a missing source row keeps the activity without amount or names',()=>{
 assert.deepEqual(renderNotification(facts({found:false,amount:null,borrowerName:null})),{title:'Payment received',body:'Details no longer available'});
 assert.deepEqual(renderNotification(facts({found:false,eventType:'loan.closed',language:'th'})),{title:'ปิดสินเชื่อแล้ว',body:'ไม่มีรายละเอียดแล้ว'});
 assert.deepEqual(renderNotification(facts({found:undefined})).body,'Details no longer available');
});

test('null amount is omitted; a missing name falls back to the activity text; amounts are whole baht as in the app',()=>{
 assert.equal(renderNotification(facts({amount:null})).title,'Payment received');
 assert.equal(renderNotification(facts({amount:'not a number'})).title,'Payment received');
 assert.equal(renderNotification(facts({borrowerName:null})).body,'New activity');
 assert.equal(renderNotification(facts({borrowerName:'   ',language:'th'})).body,'มีรายการใหม่');
 for(const [value,text] of [['1234567.5','฿1,234,568'],[0.4,'฿0'],[-0.4,'฿0'],['-1200','-฿1,200'],[1000000,'฿1,000,000']])assert.equal(baht(value),text);
 assert.equal(renderNotification(facts({amount:'12000.00'})).title,'Payment received ฿12,000');
});

test('the borrower name is shortened only beyond the body budget; amount and activity never',()=>{
 const exact='S'.repeat(BODY_BUDGET);assert.equal(renderNotification(facts({borrowerName:exact})).body,exact,'at the budget the name is kept whole');
 const long='Somchai '+'Longfamilyname'.repeat(8),n=renderNotification(facts({borrowerName:long,amount:'1250000'}));
 assert.equal(n.title,'Payment received ฿1,250,000');assert.ok(n.body.endsWith('…'));assert.equal(graphemeLength(n.body),BODY_BUDGET);assert.ok(long.startsWith(n.body.slice(0,-1)));withinBudgets(n);
 // Line breaks and control characters in names never reach the banner.
 assert.equal(renderNotification(facts({borrowerName:'Somchai\nJaidee\t\u0007'})).body,'Somchai Jaidee');
});

test('Thai names are cut on grapheme boundaries and keep their combining marks',()=>{
 const name='นางสาวพิมพ์ชนก ศรีสุวรรณวงศ์ทองคำ'.repeat(4),n=renderNotification(facts({language:'th',borrowerName:name}));
 assert.ok(n.body.endsWith('…'),n.body);assert.equal(graphemeLength(n.body),BODY_BUDGET);withinBudgets(n);
 const kept=n.body.slice(0,-1);assert.ok(name.startsWith(kept));
 // The next code point after the cut is a base character, never a dangling mark (vowel, tone or other Mn).
 const next=name.slice(kept.length).trimStart()[0];assert.doesNotMatch(next,/\p{M}/u);
 // A cut that would land between a consonant and its marks moves to the grapheme boundary.
 const marks='กิ่'.repeat(100),m=renderNotification(facts({language:'th',borrowerName:marks}));
 assert.equal(m.body,'กิ่'.repeat(BODY_BUDGET-1)+'…');assert.equal(graphemeLength(m.body),BODY_BUDGET);
});
