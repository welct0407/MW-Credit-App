import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// R128 (owner, 5 November 2026): slip recognition on the Close Loan page (pure module, transpiled as the PWA build does).
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/close-recognition.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {readCloseSlip,closeSlipInputs,closeSlipNotes,closeConfirmNotes,normalizedCloseReference}=await import('data:text/javascript,'+encodeURIComponent(source));
const context={businessDate:'2026-11-05',accounts:[{id:'dad'},{id:'lisa'}]};
const empty={account:'',method:'Bank Transfer',bankReference:'',accountChosen:false,touched:new Set()};
const read=(suggestion,warnings=[],form=empty,extra={})=>readCloseSlip('r1',true,{status:'recognized',provider:'gemini',suggestion,warnings,...extra},context,form);
const money=value=>'฿'+Number(value).toLocaleString('en-US'),day=value=>value.slice(8,10)+'-Nov';
const notes=(recognition,form={},thai=false)=>closeSlipNotes(recognition,{amount:'1100',account:'dad',accountLabel:id=>({dad:'Dad SCB',lisa:'Lisa KBank'})[id],method:'Bank Transfer',bankReference:'',...form},thai,{money,day});
const slip={amountReceived:'1100',cashAccountId:'dad',bankReference:'SLIPREF123',paymentDate:'2026-11-05',transferTime:'13:16'};

test('the amount is never filled; the account, method and reference fill empty fields; the transfer time rides with an accepted date',()=>{
 const {recognition,fill}=read(slip,[],{...empty,method:'Cash'});
 assert.deepEqual(fill,{account:'dad',method:'Bank Transfer',bankReference:'SLIPREF123',transferTime:'13:16'});
 assert.equal('amount' in fill,false);
 assert.deepEqual(recognition.filled,['account','reference']);assert.equal(recognition.slipAmount,'1100');assert.equal(recognition.provider,'Gemini');
 assert.equal(recognition.dateNotUsed,null);assert.equal(recognition.accountNote,null);
});
test('R076: an account chosen by hand stays; a typed reference or method stays; the method is left when already Bank Transfer',()=>{
 let {recognition,fill}=read(slip,[],{...empty,account:'lisa',accountChosen:true,bankReference:'MINE01'});
 assert.deepEqual(fill,{transferTime:'13:16'});assert.deepEqual(recognition.filled,[]);
 ({fill}=read(slip,[],{...empty,account:'lisa'}));assert.equal(fill.account,'dad','an account not chosen by hand is replaced');
 ({fill}=read(slip,[],{...empty,method:'Cash',touched:new Set(['method','reference'])}));assert.equal(fill.method,undefined);assert.equal(fill.bankReference,undefined);
 ({fill}=read(slip,[],{...empty,bankReference:' - '}));assert.equal(fill.bankReference,'SLIPREF123','spaces and dashes are empty');
});
test('a slip date other than the business date is not used (named when readable) and carries no transfer time',()=>{
 for(const [paymentDate,warnings,expected] of [['2026-11-04',[],'2026-11-04'],[null,[{code:'date_outside_window',date:'2026-10-01'}],'2026-10-01'],['bad',[],''],[null,[],null]]){
  const {recognition,fill}=read({...slip,paymentDate},warnings);
  assert.equal(recognition.dateNotUsed,expected,String(paymentDate));assert.equal(fill.transferTime,'',String(paymentDate));
 }
 assert.equal(read({...slip,transferTime:'25:00'}).fill.transferTime,'');
});
test('unrecognized, failed and malformed responses; unmatched and ambiguous accounts; an invalid reference is not filled',()=>{
 assert.deepEqual(readCloseSlip('r1',true,{status:'unrecognized'},context,empty),{recognition:{receiptId:'r1',phase:'unconfirmed'},fill:null});
 for(const [ok,data] of [[false,{status:'recognized',suggestion:slip}],[true,{status:'recognized'}],[true,null],[true,{status:'other'}]])
  assert.deepEqual(readCloseSlip('r1',ok,data,context,empty),{recognition:{receiptId:'r1',phase:'failed'},fill:null});
 assert.equal(read({...slip,cashAccountId:'other'}).recognition.accountNote,'unmatched');
 assert.equal(read({...slip,cashAccountId:null},[{code:'account_ambiguous'}]).recognition.accountNote,'ambiguous');
 assert.equal(read({...slip,cashAccountId:null},[{code:'account_unmatched'}]).recognition.accountNote,'unmatched');
 const short=read({...slip,bankReference:'AB1'});assert.equal(short.fill.bankReference,undefined);assert.equal(short.recognition.slipReference,null);
 assert.equal(read(slip,[],empty,{provider:'Bad Name!'}).recognition.provider,null);
});
test('Echo LC-UX notes: status lines, amount match and mismatch (recompared with the preview), summary, account, date and reference',()=>{
 assert.equal(notes({receiptId:'r1',phase:'reading'}).status,'Reading slip…');
 assert.equal(notes({receiptId:'r1',phase:'failed'}).status,'Slip not read — enter details manually.');
 assert.equal(notes({receiptId:'r1',phase:'unconfirmed'},{},true).status,'สลิปไม่แสดงการโอนที่สำเร็จ — กรุณากรอกรายละเอียดเอง');
 assert.equal(notes(null).summary,null);
 const {recognition}=read(slip);
 assert.deepEqual(notes(recognition).amount,{match:true,text:'Slip amount matches the closing amount.'});
 assert.deepEqual(notes(recognition,{},true).amount,{match:true,text:'ยอดในสลิปตรงกับยอดปิด'});
 const other={...recognition,slipAmount:'1050'};
 assert.equal(notes(other).amount.text,'Slip shows a different amount: ฿1,050. Closing amount ฿1,100.');
 assert.equal(notes(other,{},true).amount.text,'สลิปแสดงยอดที่ต่างกัน: ฿1,050 ยอดปิด ฿1,100');
 assert.equal(notes(other,{amount:'1050'}).amount.match,true,'a refreshed closing amount is compared again');
 assert.equal(notes(recognition).summary,'From slip (Gemini): account, reference. Check before review.');
 assert.equal(notes(recognition,{},true).summary,'จากสลิป (Gemini): บัญชี, เลขอ้างอิง. ตรวจสอบก่อนกดตรวจสอบรายการ');
 assert.equal(notes({...recognition,filled:[]}).summary,'Slip read; no empty fields to fill. Check before review.');
 assert.equal(notes(recognition,{account:'lisa'}).account,'Slip shows a different account: Dad SCB.');assert.equal(notes(recognition).account,null);
 assert.equal(notes({...recognition,accountNote:'unmatched'}).accountNote,'Slip account not matched — check the receiving account.');
 assert.equal(notes({...recognition,dateNotUsed:'2026-11-04'}).date,'Slip date not used: 04-Nov.');
 assert.equal(notes({...recognition,dateNotUsed:''},{},true).date,'ไม่ได้ใช้วันที่ตามสลิป');
 const duplicate={...recognition,referenceExists:true};
 assert.equal(notes(duplicate,{bankReference:'slipref-123'}).reference,'This reference is already on a recorded payment.');
 assert.equal(notes(duplicate,{bankReference:'OTHER1'}).reference,null);assert.equal(notes(duplicate,{bankReference:'SLIPREF123',method:'Cash'}).reference,null);
 assert.deepEqual(closeConfirmNotes(notes({...other,dateNotUsed:'2026-11-04',referenceExists:true},{account:'lisa',bankReference:'SLIPREF123'})),
  ['Slip shows a different amount: ฿1,050. Closing amount ฿1,100.','Slip shows a different account: Dad SCB.','Slip date not used: 04-Nov.','This reference is already on a recorded payment.']);
 assert.deepEqual(closeConfirmNotes(notes(null)),[]);
});
test('the command carries bankReference and transferTime only when present, normalized, for a bank transfer',()=>{
 assert.deepEqual(closeSlipInputs('Bank Transfer','slip-ref 123','13:16'),{bankReference:'SLIPREF123',transferTime:'13:16'});
 assert.deepEqual(closeSlipInputs('Bank Transfer','',''),{});
 assert.deepEqual(closeSlipInputs('Bank Transfer','AB1','13:16'),{transferTime:'13:16'});
 assert.deepEqual(closeSlipInputs('Cash','SLIPREF123','13:16'),{});
 assert.equal(normalizedCloseReference(' ab-12 cd '),'AB12CD');
});
