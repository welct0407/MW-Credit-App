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

test('null amount is omitted; a missing name gives a title-only push; amounts are whole baht as in the app',()=>{
 assert.equal(renderNotification(facts({amount:null})).title,'Payment received');
 assert.equal(renderNotification(facts({amount:'not a number'})).title,'Payment received');
 assert.deepEqual(renderNotification(facts({borrowerName:null})),{title:'Payment received ฿5,000',body:''});
 assert.deepEqual(renderNotification(facts({borrowerName:'   ',language:'th'})),{title:'รับชำระแล้ว ฿5,000',body:''});
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

// R081 (owner rule): English recipients see the borrower's English name ("Description") only; V100 picks it in SQL and
// returns null when it is blank, so the English push is title only. Thai recipients keep the Thai name.
test('English push shows the English name only, or no name; Thai push shows the Thai name',()=>{
 assert.deepEqual(renderNotification(facts({language:'en',borrowerName:'Somchai Jaidee'})),{title:'Payment received ฿5,000',body:'Somchai Jaidee'});
 for(const borrowerName of [null,undefined,'',' ','\t\n ',' \u00a0 '])assert.deepEqual(renderNotification(facts({language:'en',amount:'1000',borrowerName})),{title:'Payment received ฿1,000',body:''},JSON.stringify(borrowerName));
 for(const eventType of ['loan.created','loan.closed'])assert.deepEqual(renderNotification(facts({eventType,language:'en',amount:'20000',borrowerName:null})).body,'');
 assert.deepEqual(renderNotification(facts({language:'th',borrowerName:'สมชาย ใจดี',description:'Somchai Jaidee'})),{title:'รับชำระแล้ว ฿5,000',body:'สมชาย ใจดี'});
 // A missing source row keeps its explanation in both languages.
 assert.equal(renderNotification(facts({found:false,language:'en',borrowerName:null})).body,'Details no longer available');
 for(const n of [renderNotification(facts({language:'en',borrowerName:null})),renderNotification(facts({language:'th',borrowerName:null}))])withinBudgets(n);
});

test('R090 batch 2: chat replies say Reply ready or Reply failed with the thread title as the body',()=>{
 assert.deepEqual(renderNotification({found:true,eventType:'chat.reply:ok',language:'en',borrowerName:'Payoff for Somchai today',amount:null}),{title:'Reply ready',body:'Payoff for Somchai today'});
 assert.deepEqual(renderNotification({found:true,eventType:'chat.reply:ok',language:'th',borrowerName:'ปิดยอดสมชาย',amount:null}),{title:'ตอบแล้ว',body:'ปิดยอดสมชาย'});
 assert.deepEqual(renderNotification({found:true,eventType:'chat.reply:failed',language:'en',borrowerName:'Profit',amount:null}),{title:'Reply failed',body:'Profit'});
 assert.deepEqual(renderNotification({found:true,eventType:'chat.reply:failed',language:'th',borrowerName:'กำไร',amount:null}),{title:'ตอบไม่สำเร็จ',body:'กำไร'});
 const long='q'.repeat(150),r=renderNotification({found:true,eventType:'chat.reply:ok',language:'en',borrowerName:long+'\nsecond line',amount:null});
 assert.equal(r.title,'Reply ready');assert.equal(graphemeLength(r.body),BODY_BUDGET);assert.ok(r.body.endsWith('…'));
 assert.deepEqual(renderNotification({found:false,eventType:'chat.reply:ok',language:'en',borrowerName:null,amount:null}),{title:'Reply ready',body:'Details no longer available'});
 for(const title of ['Reply ready','ตอบแล้ว','Reply failed','ตอบไม่สำเร็จ'])assert.ok(graphemeLength(title)<=TITLE_BUDGET);
});

test('R111 NT-1: a closed loan with a payable rebate leads with the rebate line, then the borrower, within the body budget',()=>{
 const closed=(over={})=>facts({eventType:'loan.closed',amount:'10000',rebatePayee:'Malee Srisuk',rebatePayable:'300',...over});
 assert.deepEqual(renderNotification(closed()),{title:'Loan closed ฿10,000',body:'Rebate ฿300 to Malee Srisuk, transfer from Lisa · Somchai Jaidee'});
 assert.equal(renderNotification(closed({language:'th',borrowerName:'สมชาย ใจดี',rebatePayee:'มาลี ศรีสุข'})).body,'ค่าแนะนำ ฿300 ให้ มาลี ศรีสุข โอนจาก Lisa · สมชาย ใจดี');
 // Fully offset (nothing payable), no rebate facts (v1 or before V122) or another event: the body is the borrower name.
 for(const over of [{rebatePayable:'0'},{rebatePayable:null,rebatePayee:null},{eventType:'loan.created'}])assert.equal(renderNotification(closed(over)).body,'Somchai Jaidee',JSON.stringify(over));
 // Long names: the referrer is shortened first, then the borrower; the body stays within the budget.
 const long=renderNotification(closed({rebatePayable:'1000',rebatePayee:'An extraordinarily long referrer name indeed yes',borrowerName:'A very long borrower name that goes on and on'}));
 withinBudgets(long);assert.match(long.body,/^Rebate ฿1,000 to An extra…, transfer from Lisa · A very long/);
 assert.equal(renderNotification(closed({rebatePayee:null})).body,'Rebate ฿300, transfer from Lisa · Somchai Jaidee');
});

test('R111: the push of a Referral Rebate Offset payment reads as a rebate offset, not as cash received, within budget',()=>{
 const offset=(over={})=>facts({eventType:'payment.posted',amount:'300',borrowerName:'Malee Srisuk',paymentMethod:'Referral Rebate Offset',rebateLoan:'L-0412',...over});
 assert.deepEqual(renderNotification(offset()),{title:'Rebate offset',body:'Rebate offset ฿300 · Malee Srisuk · from loan L-0412'});
 assert.deepEqual(renderNotification(offset({language:'th',borrowerName:'มาลี ศรีสุข'})),{title:'หักค่าแนะนำ',body:'หักค่าแนะนำ ฿300 · มาลี ศรีสุข · จากสินเชื่อ L-0412'});
 const long=renderNotification(offset({borrowerName:'An extraordinarily long referrer name that keeps going on and on and on',rebateLoan:'L-VERY-LONG-LOAN-KEY-2026'}));
 withinBudgets(long);assert.match(long.body,/^Rebate offset ฿300 · An extra.*… · from loan L-VERY-LONG-LOAN-KEY-2026$/);
 assert.equal(renderNotification(offset({rebateLoan:null})).body,'Rebate offset ฿300 · Malee Srisuk');
 // Any other method keeps the payment wording.
 assert.deepEqual(renderNotification(offset({paymentMethod:'Cash'})),{title:'Payment received ฿300',body:'Malee Srisuk'});
});

test('R111 NT-1 proof: the Loan closed push names the payable rebate on every pay-out path and nothing when fully offset',()=>{
 const closed=(over={})=>facts({eventType:'loan.closed',amount:'10000',rebatePayee:'Malee Srisuk',...over});
 // No open loan or pay-out chosen: the whole rebate is payable (v2 rebate_payable = rebate_amount).
 assert.equal(renderNotification(closed({rebatePayable:'300'})).body,'Rebate ฿300 to Malee Srisuk, transfer from Lisa · Somchai Jaidee');
 // A partial offset: only the payable part (rebate 300, offset 200).
 assert.equal(renderNotification(closed({rebatePayable:'100'})).body,'Rebate ฿100 to Malee Srisuk, transfer from Lisa · Somchai Jaidee');
 // Fully offset: no line.
 assert.equal(renderNotification(closed({rebatePayable:'0'})).body,'Somchai Jaidee');
});

test('R111 NT-2: the Payment received push of the payment that closed a referred loan carries the payable rebate',()=>{
 const paid=(over={})=>facts({eventType:'payment.posted',amount:'1300',rebatePayee:'Malee Srisuk',rebatePayable:'300',...over});
 assert.deepEqual(renderNotification(paid()),{title:'Payment received ฿1,300',body:'Rebate ฿300 to Malee Srisuk, transfer from Lisa · Somchai Jaidee'});
 assert.equal(renderNotification(paid({language:'th',borrowerName:'สมชาย ใจดี',rebatePayee:'มาลี ศรีสุข'})).body,'ค่าแนะนำ ฿300 ให้ มาลี ศรีสุข โอนจาก Lisa · สมชาย ใจดี');
 // Fully offset (its own Rebate offset push), no rebate or a payment before V124: the body is the borrower name.
 for(const over of [{rebatePayable:'0'},{rebatePayable:null,rebatePayee:null}])assert.equal(renderNotification(paid(over)).body,'Somchai Jaidee',JSON.stringify(over));
 // Over budget: the borrower is shortened first; the referrer keeps its name while the line fits.
 const long=renderNotification(paid({borrowerName:'A very long borrower name that goes on and on and on',rebatePayee:'Malee Srisuk'}));
 withinBudgets(long);assert.match(long.body,/^Rebate ฿300 to Malee Srisuk, transfer from Lisa · A very long.*…$/);
 const longer=renderNotification(paid({borrowerName:'Somchai Jaidee',rebatePayee:'An extraordinarily long referrer name that keeps going and going'}));
 withinBudgets(longer);assert.match(longer.body,/^Rebate ฿300 to An extraordinarily.*…, transfer from Lisa · S/);
});

// R119 (V134 pwa_notify_content_v4 `rebates`; Echo PUSH-1..4): every payable rebate of the payment, summed per referrer.
test('R119: one payable referrer keeps today\'s single-rebate text; two rebates of one referrer give the sum',()=>{
 const paid=(over={})=>facts({amount:'2500',...over});
 const today=renderNotification(paid({rebatePayee:'Malee Srisuk',rebatePayable:'300'}));
 assert.deepEqual(renderNotification(paid({rebatePayee:'Malee Srisuk',rebatePayable:'300',rebates:[{amount:'300',payee:'Malee Srisuk',payable:'300'}]})),today);
 assert.equal(today.body,'Rebate ฿300 to Malee Srisuk, transfer from Lisa · Somchai Jaidee');
 // Same referrer on two loans: one referrer left, today's text with the sum.
 assert.equal(renderNotification(paid({rebatePayee:'Malee Srisuk',rebatePayable:'30',rebates:[{amount:'30',payee:'Malee Srisuk',payable:'30'},{amount:'20',payee:'Malee Srisuk',payable:'20'}]})).body,'Rebate ฿50 to Malee Srisuk, transfer from Lisa · Somchai Jaidee');
 assert.equal(renderNotification(paid({language:'th',borrowerName:'สมชาย ใจดี',rebates:[{amount:'30',payee:'มาลี',payable:'30'},{amount:'20',payee:'มาลี',payable:'20'}]})).body,'ค่าแนะนำ ฿50 ให้ มาลี โอนจาก Lisa · สมชาย ใจดี');
 // Two rebates, one fully offset (payable 0): the single wording for the payable one.
 assert.equal(renderNotification(paid({rebatePayee:'A',rebatePayable:'0',rebates:[{amount:'30',payee:'A',payable:'0'},{amount:'20',payee:'B',payable:'20'}]})).body,'Rebate ฿20 to B, transfer from Lisa · Somchai Jaidee');
 // Nothing payable: no rebate line, even if the first-rebate scalars disagree.
 assert.equal(renderNotification(paid({rebatePayee:'A',rebatePayable:'30',rebates:[{amount:'30',payee:'A',payable:'0'}]})).body,'Somchai Jaidee');
 // No v4 facts (null): today's first-rebate reading.
 assert.deepEqual(renderNotification(paid({rebatePayee:'Malee Srisuk',rebatePayable:'300',rebates:null})),today);
});
test('R119 PUSH-2/3: two and three referrers join the last with "and" / "และ"',()=>{
 const two=[{amount:'30',payee:'A',payable:'30'},{amount:'20',payee:'B',payable:'20'}],three=[...two,{amount:'10',payee:'C',payable:'10'}];
 const en=rebates=>renderNotification(facts({rebates})),th=rebates=>renderNotification(facts({language:'th',borrowerName:'สมชาย ใจดี',rebates}));
 assert.deepEqual(en(two),{title:'Payment received ฿5,000',body:'Rebates ฿30 to A and ฿20 to B, transfer from Lisa · Somchai Jaidee'});
 assert.equal(th(two).body,'ค่าแนะนำ ฿30 ให้ A และ ฿20 ให้ B โอนจาก Lisa · สมชาย ใจดี');
 assert.equal(en(three).body,'Rebates ฿30 to A, ฿20 to B and ฿10 to C, transfer from Lisa · Somchai Jaidee');
 assert.equal(th(three).body,'ค่าแนะนำ ฿30 ให้ A ฿20 ให้ B และ ฿10 ให้ C โอนจาก Lisa · สมชาย ใจดี');
 // A loan.closed push reads the same facts; the late part sits between the rebates and the name.
 assert.equal(renderNotification(facts({rebates:two,lateChargeAmount:'50',borrowerName:'Nok'})).body,'Rebates ฿30 to A and ฿20 to B, transfer from Lisa · Late charge ฿50 · Nok');
 assert.equal(renderNotification(facts({eventType:'loan.closed',rebates:two})).body,'Rebates ฿30 to A and ฿20 to B, transfer from Lisa · Somchai Jaidee');
 for(const n of [en(two),th(two),en(three),th(three)])withinBudgets(n);
});
test('R119 fit: the borrower name is shortened first, then every payee (at least 6), then the total; amounts and Lisa stay',()=>{
 const late={lateChargeAmount:'50'};
 // 1. The rebates fit; only the borrower name is shortened.
 const one=renderNotification(facts({...late,borrowerName:'A rather long borrower name',rebates:[{amount:'30',payee:'Alice',payable:'30'},{amount:'20',payee:'Bob',payable:'20'}]}));
 withinBudgets(one);assert.equal(graphemeLength(one.body),BODY_BUDGET);
 assert.equal(one.body,'Rebates ฿30 to Alice and ฿20 to Bob, transfer from Lisa · Late charge ฿50 · A r…');
 // 2. The payees are cut to one equal length (the borrower dropped: no room left), amounts and "Lisa" intact.
 const two=renderNotification(facts({borrowerName:'Somchai Jaidee',rebates:[{amount:'30',payee:'Alexandra Longname-Referrer',payable:'30'},{amount:'20',payee:'Bartholomew Longername',payable:'20'}]}));
 withinBudgets(two);assert.equal(two.body,'Rebates ฿30 to Alexandra Longn… and ฿20 to Bartholomew Lon…, transfer from Lisa');
 const cut3=renderNotification(facts({borrowerName:'Somchai Jaidee',rebates:[{amount:'30',payee:'Alexandra Longname',payable:'30'},{amount:'20',payee:'Bartholomew Longername',payable:'20'},{amount:'10',payee:'Chris',payable:'10'}]}));
 withinBudgets(cut3);assert.equal(cut3.body,'Rebates ฿30 to Alexandr…, ฿20 to Bartholo… and ฿10 to Chris, transfer from Lisa','a payee shorter than the cut stays whole');
 // 3. Three long payees no longer fit at 6 graphemes each: the total and the number of referrers.
 const three=[{amount:'30',payee:'Alexandra Longname-Referrer',payable:'30'},{amount:'20',payee:'Bartholomew Longername Referrer',payable:'20'},{amount:'10',payee:'Christopher Extended Name',payable:'10'},{amount:'10',payee:'Dorothea Quite-Long Name',payable:'10'}];
 const collapsed=renderNotification(facts({...late,borrowerName:'A long borrower name here',rebates:three}));
 withinBudgets(collapsed);assert.match(collapsed.body,/^Rebates ฿70 total to 4 referrers, transfer from Lisa · Late charge ฿50 · A long/);
 const thai=renderNotification(facts({language:'th',...late,borrowerName:'สมชาย ใจดี',rebates:three.map((r,i)=>({...r,payee:'ผู้แนะนำชื่อยาวมากคนที่ '+(i+1)}))}));
 withinBudgets(thai);assert.equal(thai.body,'ค่าแนะนำรวม ฿70 ให้ผู้แนะนำ 4 ราย โอนจาก Lisa · ค่าปรับล่าช้า ฿50 · สมชาย ใจดี');
});
