import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Receipts,receivingMatch} from '../src/receipt_engine.mjs';
import {Master} from '../src/master_engine.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const now=new Date('2026-09-07T16:00:00Z');
test('masked receiving details require review and do not accept wrong visible digits',()=>{
 const a={bankName:'ธนาคารกสิกรไทย',accountNumber:'1234567890',accountName:'สมมติ'};
 const r={bankName:'กสิกรไทย',accountNumber:'XXX-X-XX789-0',accountName:'น.ส. สมมติ ทดสอบ'};
 assert.equal(receivingMatch(r,a),'MASKED_COMPATIBLE');assert.equal(receivingMatch({...r,accountNumber:'XXX-X-XX789-1'},a),'MISMATCH');
});
const cfg={testMode:true,receipts:{enabled:true},master:{enabled:true},appId:'app',borrowerId:'lisa',borrowerName:'Lisa',recipient:'friend',maxSnapshotAgeSeconds:300,reminders:{conversationUrl:'https://example.test/chat'}};
const account={bankName:'Test Bank',accountName:'Test Receiver',accountNumber:'123-456'};
const input=(overrides={})=>({source:'instagram-live-ui',recipient:'friend',sender:'tttlll8709',borrowerId:'lisa',conversationUrl:cfg.reminders.conversationUrl,sourceKey:'message-image-1',evidence:'Visible receipt image',observedAt:now.toISOString(),amount:300,transferAt:'2026-09-07T17:05:00+07:00',bankReference:'REFERENCE-1',...account,confidence:'high',...overrides});
const facts=()=>({source:'appsheet-live-ui',synced:true,observedAt:now.toISOString(),appId:'app',borrowerId:'lisa',completePaymentSearch:true,payments:[],paymentDateAllowed:'2026-09-07',charges:[{id:'c1',borrowerId:'lisa',due:1000,paid:0,remaining:1000}],totalRemaining:1000});
const approval=(captured)=>({source:'user',evidence:'User explicitly approved this exact synthetic entry',digest:captured.reviewDigest,verification:'synthetic-test-authorized',syntheticBorrowerId:'lisa',syntheticAmount:300,syntheticPaymentDate:'2026-09-07',acceptedIssues:captured.issues});
function posted(id,plan){const f=facts();f.totalRemaining=700;f.charges[0].paid=300;f.charges[0].remaining=700;f.payment={id:'p1',status:'Posted',borrowerId:'lisa',amountReceived:300,paymentDate:plan.paymentDate,bankReference:plan.bankReference,notes:plan.notes,allocations:[{paymentId:'p1',chargeId:'c1',amount:300,repaymentId:'r1',repaymentAmount:300,repaymentChargeId:'c1'}]};f.payments=[f.payment];f.instagramObservedAt=now.toISOString();f.sender='tttlll8709';f.recipient='friend';f.reviewedThroughLatest=true;f.newUnreviewedReceipt=false;return f;}
test('receipt mismatch needs explicit synthetic mapping; repeated source and bank ref cannot be posted twice',()=>{
 const r=new Receipts(':memory:',cfg,account),c=r.capture(input({bankName:'Other Bank'}),now);
 assert.equal(c.issues.length,1);assert.throws(()=>r.approve(c.id,{...approval(c),acceptedIssues:[]},now),/mapping/);
 assert.throws(()=>r.approve(c.id,{...approval(c),verification:'funds-confirmed'},now),/mismatched/);
 assert.equal(r.capture(input(),now).status,'DUPLICATE_SOURCE');
 r.approve(c.id,approval(c),now);const p=r.reserve(c.id,facts(),now);assert.match(p.bankReference,/^TEST-/);assert.doesNotMatch(p.notes,/Other Bank/);assert.equal(r.reserve(c.id,facts(),now).status,'POSTING');
 const d=r.capture(input({sourceKey:'reuploaded',bankName:'Other Bank'}),now);assert.equal(d.status,'DUPLICATE_REVIEW');assert.throws(()=>r.approve(d.id,approval(d),now));r.close();
});
test('unknown payment blocks retry; exact allocations and balances required before single acknowledgement',()=>{
 const r=new Receipts(':memory:',cfg,account),c=r.capture(input(),now);r.approve(c.id,approval(c),now);const p=r.reserve(c.id,facts(),now);r.unknown(c.id,'Save outcome uncertain',now);assert.equal(r.reserve(c.id,facts(),now).status,'POST_UNKNOWN');
 const f=posted(c.id,p),bad=structuredClone(f);bad.payment.allocations[0].repaymentAmount=200;assert.throws(()=>r.verify(c.id,bad,now),/repayments/);
 r.verify(c.id,f,now);assert.throws(()=>r.acknowledge(c.id,{...f,observedAt:'2020-01-01'},now),/Fresh/);
 const a=r.acknowledge(c.id,f,now);assert.match(a.message,/300.*700/);assert.equal(r.acknowledge(c.id,f,now).status,'ACK_PENDING');r.confirmAck(c.id,'Exact outbound visible',now);assert.equal(r.acknowledge(c.id,f,now).status,'ACK_SENT');r.close();
});
test('existing payment, excessive amount, stale source and changed bank config block posting',()=>{
 const r=new Receipts(':memory:',cfg,account),c=r.capture(input(),now);r.approve(c.id,approval(c),now);
 const f=facts();f.payments=[{bankReference:`TEST-${c.id}`}];assert.throws(()=>r.reserve(c.id,f,now),/existing/);
 f.payments=[];f.totalRemaining=200;f.charges[0].due=f.charges[0].remaining=200;assert.throws(()=>r.reserve(c.id,f,now),/exceeds/);
 assert.throws(()=>r.capture(input({sourceKey:'stale',observedAt:'2020-01-01'}),now),/Fresh/);
 r.account={...account,accountNumber:'999'};assert.throws(()=>r.reserve(c.id,facts(),now),/Account/);r.close();
});
test('persistent receipt holds master fees and sends across reopen, including after approval',()=>{
 const dir=mkdtempSync(join(tmpdir(),'receipts-')),db=join(dir,'test.db');
 try{let r=new Receipts(db,cfg,account);const c=r.capture(input(),now);r.close();r=new Receipts(db,cfg,account);const m=new Master(db,cfg);
 const f={appId:'app',borrowerId:'lisa',recipient:'friend',sender:'tttlll8709',source:'appsheet-live-ui',synced:true,observedAt:now.toISOString(),instagramObservedAt:now.toISOString(),reviewedThroughLatest:true,allCollectionChargesObserved:true,appToday:'2026-09-07',hold:null,totalRemaining:1000,charges:[{id:'c1',loanId:'l1',borrowerId:'lisa',date:'2026-09-07',interestDue:1000,principalDue:0,paid:0,remaining:1000,notes:''}]};
 assert.equal(m.plan(f,now).status,'RECEIPT_HOLD');r.approve(c.id,approval(c),now);assert.equal(m.plan(f,now).status,'RECEIPT_HOLD');r.reject(c.id,'User rejected synthetic test',now);assert.equal(m.plan(f,now).status,'WRITE_READY');m.close();r.close();}finally{rmSync(dir,{recursive:true,force:true});}
});

test('clear receipt auto approves; uncertain ownership requests correlated friend review',()=>{
 const policy={...cfg,receipts:{enabled:true,autoPostClear:true}};
 const r=new Receipts(':memory:',policy,account);
 const c=r.capture(input({sampleFromAnotherBorrower:false}),now);
 assert.equal(r.assess(c.id,facts(),now).status,'APPROVED');
 assert.equal(r.reserve(c.id,facts(),now).status,'PAYMENT_READY');r.close();
 const s=new Receipts(':memory:',policy,account),e=s.capture(input({bankName:'Other Bank',sampleFromAnotherBorrower:true}),now);
 assert.equal(s.assess(e.id,facts(),now).status,'EXCEPTION');
 const q=s.requestReview(e.id,now);assert.equal(s.requestReview(e.id,now).status,'REVIEW_SEND_PENDING');
 s.reviewSent(e.id,'Receipt quoted and exception question visible',now);
 const a={source:'instagram-live-ui',author:'friend',conversationUrl:cfg.reminders.conversationUrl,receiptId:e.id,digest:q.digest,positive:true,sourceKey:'reply1',replyText:'Confirm this synthetic300 for Lisa on September7',replyAt:now.toISOString(),observedAt:now.toISOString(),evidence:'Reply explicitly addresses request',acceptedConcerns:q.concerns,syntheticBorrowerId:'lisa',syntheticAmount:300,syntheticPaymentDate:'2026-09-07'};
 assert.throws(()=>s.friendConfirm(e.id,{...a,author:'someone-else'},now),/correlated/);
 assert.throws(()=>s.friendConfirm(e.id,{...a,receiptId:'wrong'},now),/correlated/);
 assert.throws(()=>s.friendConfirm(e.id,{...a,acceptedConcerns:[]},now),/exceptions/);
 assert.equal(s.friendConfirm(e.id,a,now).status,'APPROVED');
 assert.match(s.reserve(e.id,facts(),now).bankReference,/TEST-/);s.close();
});

test('existing payment and old date never auto approve; unknown exception send never retries',()=>{
 const r=new Receipts(':memory:',{...cfg,receipts:{enabled:true,autoPostClear:true}},account);
 const c=r.capture(input({sampleFromAnotherBorrower:false,transferAt:'2026-09-06T17:05:00+07:00'}),now);
 const f=facts();f.payments=[{bankReference:'REFERENCE-1'}];
 assert.equal(r.assess(c.id,f,now).status,'EXCEPTION');
 r.requestReview(c.id,now);r.unknown(c.id,'Uncertain forward',now);
 assert.equal(r.requestReview(c.id,now).status,'REVIEW_SEND_UNKNOWN');r.close();
});

test('normal masking is not an exception and payer nickname is not compared',()=>{
 const r=new Receipts(':memory:',{...cfg,receipts:{enabled:true,autoPostClear:true}},account);
 const c=r.capture(input({accountNumber:'xxxxx6',payerName:'Different legal name',sampleFromAnotherBorrower:false}),now);
 assert.deepEqual(c.issues,[]);assert.equal(r.assess(c.id,facts(),now).status,'APPROVED');r.close();
 assert.equal(receivingMatch({...account,accountNumber:'xxxxx7'},account),'MISMATCH');
 assert.equal(receivingMatch({...account,accountNumber:'xxxxxx'},account),'MISMATCH');
});
