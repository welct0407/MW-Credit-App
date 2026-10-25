import test from 'node:test';
import assert from 'node:assert/strict';
import {accountPattern,matchAccounts,slipFields,evaluateSlip,previousDay,payerFacts} from '../../services/receipts/recognizer-rules.mjs';
// R075: port of integration-agent receipt_rules.py (account_pattern, match_account, validate_receipt
// field rules), judged per field. Synthetic account numbers only.
const accounts=[
 {id:'acc-a',number:'123-4-56789-0',alternative:null,active:true},
 {id:'acc-b',number:'987-6-54321-0',alternative:'0812345678',active:true},
 {id:'acc-off',number:'555-5-56789-0',alternative:null,active:false},
];
const slip=(overrides={})=>({is_payment_receipt:true,transfer_successful:true,date:'2026-10-18',time:'09:41:27',amount:'1500.00',currency:'THB',reference:'ab-12 34 cd',account_numbers:['xxx-x-x6789-x'],...overrides});
const context=(overrides={})=>({businessDate:'2026-10-18',accounts,referenceExists:async()=>false,...overrides});

test('account_pattern keeps printed masks, maps Thai digits and refuses other text',()=>{
 assert.equal(accountPattern('123-4-56789-0'),'1234567890');
 assert.equal(accountPattern(' xxx-x-x6789-x '),'xxxxx6789x');
 assert.equal(accountPattern('***•●6789(0)'),'xxxxx67890');
 assert.equal(accountPattern('๑๒๓-๔-๕๖๗๘๙-๐'),'1234567890');
 for(const bad of ['','1234567','1234567890123456','12AB567890',null,undefined,'1234 5678 9'.replace(' 9','?')])assert.equal(accountPattern(bad),'');
});

test('match_account: same length, every visible digit equal, at least four digits, active only, ambiguity reported',()=>{
 assert.deepEqual(matchAccounts(['xxx-x-x6789-x'],accounts),['acc-a']);
 assert.deepEqual(matchAccounts(['xxx-x-xxx89-x'],accounts),[],'fewer than four visible digits is skipped');
 assert.deepEqual(matchAccounts(['xxx-x-x678-x'],accounts),[],'length must be equal');
 assert.deepEqual(matchAccounts(['081-xxx-5678'],accounts),['acc-b'],'alternative number matches');
 assert.deepEqual(matchAccounts(['xxxxxx6789x'.slice(1)],[...accounts,{id:'acc-c',number:'111-1-16789-1',alternative:null,active:true}]).sort(),['acc-a','acc-c']);
 assert.deepEqual(matchAccounts(['555-5-56789-0'],accounts),[],'inactive accounts never match');
 assert.deepEqual(matchAccounts(['xxx-x-x6789-x'],[{id:'masked',number:'xxx-x-x6789-x',alternative:null,active:true}]),[],'a masked stored number never matches');
});

test('a slip that is not a confirmed payment receipt fills nothing',async()=>{
 for(const value of [slip({is_payment_receipt:false}),slip({transfer_successful:false})]){
  assert.deepEqual(await evaluateSlip(value,context()),{status:'unrecognized',reason:'slip_not_confirmed',suggestion:null,warnings:[{code:'slip_not_confirmed'}]});
 }
});

test('a clean slip fills every field; reference, time and amount are normalized',async()=>{
 const out=await evaluateSlip(slip(),context());
 assert.deepEqual(out,{status:'recognized',suggestion:{amountReceived:'1500',cashAccountId:'acc-a',bankReference:'AB1234CD',paymentDate:'2026-10-18',transferTime:'09:41',paymentMethod:'Bank Transfer'},payer:{slipName:null,lines:[],listed:false,before:null,after:null},warnings:[]});
 assert.equal((await evaluateSlip(slip({date:'2026-10-17',currency:''}),context())).suggestion.paymentDate,'2026-10-17','yesterday and blank currency are accepted');
});

test('each failing field is null with its own warning, in the fixed order',async()=>{
 const cases=[
  [{amount:'5,00'},'amount_unreadable','amountReceived'],[{amount:'1,2345'},'amount_unreadable','amountReceived'],[{amount:'1,48,000'},'amount_unreadable','amountReceived'],
  [{amount:',480'},'amount_unreadable','amountReceived'],[{amount:'1,480.50'},'amount_fractional','amountReceived'],
  [{amount:'0.00'},'amount_unreadable','amountReceived'],[{amount:'1500.50'},'amount_fractional','amountReceived'],
  [{currency:'USD'},'non_thb','amountReceived'],[{account_numbers:['xxx-x-xxxxx-x']},'account_unmatched','cashAccountId'],
  [{account_numbers:['xxx-x-x6789-x','081-xxx-5678']},'account_ambiguous','cashAccountId'],[{reference:'AB1'},'reference_unreadable','bankReference'],
  [{reference:'AB12/34CD'},'reference_unreadable','bankReference'],[{date:'2026-10-16'},'date_outside_window','paymentDate'],[{date:'2026-10-19'},'date_outside_window','paymentDate'],
  [{date:'18/10/2026'},'date_outside_window','paymentDate'],[{time:'9:41'},'time_unreadable','transferTime'],[{time:'24:00'},'time_unreadable','transferTime'],
 ];
 for(const [override,code,field] of cases){
  const out=await evaluateSlip(slip(override),context());
  const expected=code==='date_outside_window'&&/^\d{4}-\d{2}-\d{2}$/.test(override.date)?{code,date:override.date}:{code};
  assert.equal(out.status,'recognized');assert.deepEqual(out.warnings,[expected],JSON.stringify(override));assert.equal(out.suggestion[field],null,JSON.stringify(override));
 }
 const none=await evaluateSlip(slip({account_numbers:[]}),context());
 assert.deepEqual(none.warnings,[],'R076: no account number on the slip gives no account warning');assert.equal(none.suggestion.cashAccountId,null);
 const tooMany=await evaluateSlip(slip({account_numbers:Array(6).fill('xxx-x-x6789-x')}),context());
 assert.deepEqual(tooMany.warnings,[{code:'account_unmatched'}]);assert.equal(tooMany.suggestion.cashAccountId,null);
 const many=await evaluateSlip(slip({time:'x',amount:'1.5',reference:'x',account_numbers:['9']}),context());
 assert.deepEqual(many.warnings.map(w=>w.code),['amount_fractional','account_unmatched','reference_unreadable','time_unreadable']);
});

test('R087: every printed number is read; exactly one of our active accounts fills the account',async()=>{
 // KBank K+ prints sender -> recipient, both masked (synthetic numbers); only the recipient is ours.
 const kplus=[...accounts,{id:'acc-k',number:'503-0-00386-8',alternative:null,active:true}];
 const out=await evaluateSlip(slip({account_numbers:['xxx-x-x9562-x','xxx-x-x0386-x']}),context({accounts:kplus}));
 assert.equal(out.suggestion.cashAccountId,'acc-k');assert.deepEqual(out.warnings,[]);
 const two=await evaluateSlip(slip({account_numbers:['xxx-x-x0386-x','xxx-x-x6789-x']}),context({accounts:kplus}));
 assert.equal(two.suggestion.cashAccountId,null);assert.deepEqual(two.warnings,[{code:'account_ambiguous'}],'two of ours stay ambiguous');
 // Documented residual: a transfer FROM our account to a foreign one also matches ours (sender and recipient
 // are not told apart). The partner still confirms on the receiving form, as the agent's proposal still needs approval.
 const outgoing=await evaluateSlip(slip({account_numbers:['xxx-x-x6789-x','xxx-x-x9562-x']}),context());
 assert.equal(outgoing.suggestion.cashAccountId,'acc-a');assert.deepEqual(outgoing.warnings,[]);
});

test('an existing reference warns but still fills; the transfer time needs an accepted slip date',async()=>{
 const seen=[];const out=await evaluateSlip(slip(),context({referenceExists:async value=>{seen.push(value);return true}}));
 assert.deepEqual(seen,['AB1234CD']);assert.equal(out.suggestion.bankReference,'AB1234CD');assert.deepEqual(out.warnings,[{code:'reference_exists'}]);
 const old=await evaluateSlip(slip({date:'2026-10-10'}),context());assert.equal(old.suggestion.transferTime,null);assert.deepEqual(old.warnings,[{code:'date_outside_window',date:'2026-10-10'}]);
 assert.equal(slipFields(slip({amount:'000120'}),'2026-10-18').amountReceived,'120');
 // R079: a correctly grouped thousands comma (Flash-Lite's "1,480.00") fills like the agent's rule.
 assert.equal(slipFields(slip({amount:'1,480.00'}),'2026-10-18').amountReceived,'1480');
 assert.equal(slipFields(slip({amount:'1,234,567'}),'2026-10-18').amountReceived,'1234567');
 assert.equal(previousDay('2026-03-01'),'2026-02-28');
});

test('R095 payer (revision 2): information only, never a warning; after is the learned value or null',async()=>{
 const listed=await evaluateSlip(slip({payer_name:'MR. SOMCHAI J***'}),context({storedPayerName:'Somchai Jaidee',payerBorrowerKnown:true}));
 assert.deepEqual(listed.payer,{slipName:'MR. SOMCHAI J***',lines:['Somchai Jaidee'],listed:true,before:'Somchai Jaidee',after:null});assert.deepEqual(listed.warnings,[]);
 const first=await evaluateSlip(slip({payer_name:'นาย สมชาย ใจดี'}),context({payerBorrowerKnown:true}));
 assert.deepEqual(first.payer,{slipName:'นาย สมชาย ใจดี',lines:[],listed:false,before:null,after:'นาย สมชาย ใจดี'});
 const another=await evaluateSlip(slip({payer_name:'น.ส. สมฤดี เ',account_numbers:['999-9-99999-9']}),context({storedPayerName:'สมชาย ใจดี\n',payerBorrowerKnown:true}));
 assert.deepEqual(another.payer,{slipName:'น.ส. สมฤดี เ',lines:['สมชาย ใจดี'],listed:false,before:'สมชาย ใจดี\n',after:'สมชาย ใจดี\nน.ส. สมฤดี เ'});
 assert.deepEqual(another.warnings.map(w=>w.code),['account_unmatched'],'no payer warning');
 const fuller=await evaluateSlip(slip({payer_name:'นาย สมชาย ใจดี'}),context({storedPayerName:'สมชาย ใ***\nAlice Aaa',payerBorrowerKnown:true}));
 assert.equal(fuller.payer.after,'นาย สมชาย ใจดี\nAlice Aaa');
 const unnamed=await evaluateSlip(slip({payer_name:'นาย สมชาย ใจดี'}),context());
 assert.equal(unnamed.payer.after,null,'no borrower named: nothing to learn');
 for(const unread of ['','ส***',undefined])assert.deepEqual((await evaluateSlip(slip({payer_name:unread}),context({storedPayerName:'สมชาย ใจดี',payerBorrowerKnown:true}))).payer,{slipName:null,lines:['สมชาย ใจดี'],listed:false,before:'สมชาย ใจดี',after:null});
 assert.deepEqual(payerFacts('  ', null),{slipName:null,lines:[],listed:false,before:null,after:null});
});
