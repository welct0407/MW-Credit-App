// R136: daily-instalment defaults (Part A) and the rollover statement (Part B) — the pure rules of loan-form-values.ts and
// rollover-statement.ts (design section 7 item 1; Archie's cases 1, 4, 5 and 7 for the statement arithmetic).
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const transpile=file=>ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const url=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const wholeUrl=url(transpile('whole-number-input.ts'));
const valuesUrl=url(transpile('loan-form-values.ts').replace("'./whole-number-input'",JSON.stringify(wholeUrl)));
const values=await import(valuesUrl);
const rollover=await import(url(transpile('rollover-statement.ts').replace("'./loan-form-values'",JSON.stringify(valuesUrl)).replace("'./pay-forward-text'",JSON.stringify(url(transpile('pay-forward-text.ts'))))));
const {loanFormChange,percentOf,twentieth,tenth,instalmentSchedule,dailyPaymentHelper,dueDateHelper,loanSummaryLines,addDays,termDays}=values;
const {rolloverStatement,negativeCashMessage,penaltyHelper,penaltyStep,rolloverArrangement,rolloverPrefill,rolloverOffered,rolloverResultLine,generatedArrangement,rolloverRebateLine,rolloverFieldChange,scaleByRatio}=rollover;
const INST='ผ่อนชำระรายวัน',DAILY='ดอกเบี้ยรายวัน';
const empty={borrowerId:'B',loanDate:'2026-10-15',principal:null,transferFee:null,disbursingAccountId:null,type:null,dueDate:null,dailyPayment:null,fixedInterest:null,currentDailyInterest:null,paymentInterval:1,arrangement:null,autoChargeEnabled:true};
const change=(state,key,value,existing=false)=>loanFormChange(state.fields,state.manual,key,value,existing);

test('Part A: 10%, 5% and +24 days, rounded half up in whole baht',()=>{
 assert.equal(tenth('10000'),'1000');assert.equal(twentieth('10000'),'500');assert.equal(percentOf('10010',5),'501');assert.equal(percentOf('10009',5),'500');assert.equal(twentieth('abc'),null);
 assert.equal(addDays('2026-10-15',24),'2026-11-08');assert.equal(termDays('2026-10-15','2026-11-08'),25);
 let s={fields:{...empty,principal:'10000'},manual:{}};s=change(s,'type',INST);
 assert.deepEqual([s.fields.transferFee,s.fields.dailyPayment,s.fields.dueDate],['1000','500','2026-11-08']);
 s=change(s,'principal','20000');assert.deepEqual([s.fields.transferFee,s.fields.dailyPayment],['2000','1000'],'untouched fields follow the principal');
 s=change(s,'loanDate','2026-10-20');assert.equal(s.fields.dueDate,'2026-11-13','an untouched due date follows the loan date');
});
test('Part A: a typed value is the Partner\'s from its first keystroke; clearing it brings the default back; existing loans never derive',()=>{
 let s={fields:{...empty},manual:{}};
 s=change(s,'transferFee','800');assert.equal(s.manual.transferFee,true,'typed before the type is chosen');
 s=change(s,'principal','10000');s=change(s,'type',INST);
 assert.deepEqual([s.fields.transferFee,s.fields.dailyPayment],['800','500']);
 s=change(s,'dueDate','2026-11-30');s=change(s,'loanDate','2026-10-16');assert.equal(s.fields.dueDate,'2026-11-30','a typed due date stays');
 s=change(s,'principal','12000');assert.deepEqual([s.fields.transferFee,s.fields.dailyPayment],['800','600']);
 s=change(s,'transferFee',null);assert.equal(s.manual.transferFee,false);s=change(s,'principal','14000');assert.equal(s.fields.transferFee,'1400','clearing restores the default on the next principal change');
 // A restored draft carries its flags: the typed daily payment survives a principal change.
 const restored={fields:{...s.fields,dailyPayment:'777'},manual:{...s.manual,dailyPayment:true}};
 assert.equal(change(restored,'principal','16000').fields.dailyPayment,'777');
 const existing=change({fields:{...empty,type:INST,principal:'10000',transferFee:'0',dailyPayment:'450',dueDate:'2026-11-08'},manual:{}},'principal','20000',true);
 assert.deepEqual([existing.fields.transferFee,existing.fields.dailyPayment,existing.fields.dueDate],['0','450','2026-11-08'],'editing an existing loan never re-derives');
 const daily=change({fields:{...empty,principal:'10000'},manual:{}},'type',DAILY);assert.equal(daily.fields.transferFee,null,'the fee default is for daily instalment only');assert.equal(daily.fields.currentDailyInterest,'1000');
});
test('Part A: helper lines (remainder rule) and the summary above Save',()=>{
 const schedule=instalmentSchedule('10000','500','2026-10-15','2026-11-08');
 assert.deepEqual(schedule,{term:25,base:400,remainder:0,interest:100,total:12500,interestTotal:2500,rate:'1.00'});
 assert.equal(dailyPaymentHelper(schedule,false),'Daily principal ฿400 · daily interest ฿100 (1.00% of principal per day)');
 assert.equal(dailyPaymentHelper(schedule,true),'เงินต้นต่อวัน ฿400 · ดอกเบี้ยต่อวัน ฿100 (1.00% ของเงินต้นต่อวัน)');
 assert.equal(dailyPaymentHelper(instalmentSchedule('10001','500','2026-10-15','2026-11-08'),false),'Daily principal ฿400 · daily interest ฿100 (1.00% of principal per day) · first 1 days +฿1 principal');
 assert.equal(dueDateHelper(25,false),'25 days, loan date is day 1');assert.equal(dueDateHelper(25,true),'25 วัน นับวันที่กู้เป็นวันที่ 1');
 const fields={type:INST,principal:'10000',transferFee:'1000',dailyPayment:'500',currentDailyInterest:null,loanDate:'2026-10-15',dueDate:'2026-11-08',autoChargeEnabled:true};
 assert.deepEqual(loanSummaryLines(fields,false),['Total ฿12,500 over 25 days · interest ฿2,500 + documentation fee ฿1,000','Cash issued to borrower ฿8,500 = ฿10,000 principal − ฿1,000 documentation fee − ฿500 first-day payment']);
 assert.equal(loanSummaryLines(fields,true)[1],'เงินสดที่จ่ายให้ผู้กู้ ฿8,500 = เงินต้น ฿10,000 − ค่าธรรมเนียมเอกสาร ฿1,000 − ยอดชำระวันแรก ฿500');
 assert.deepEqual(loanSummaryLines({...fields,type:DAILY,currentDailyInterest:'300'},false),['Cash issued to borrower ฿8,700 = ฿10,000 principal − ฿1,000 documentation fee − ฿300 first-day payment']);
});
const quote=(over={})=>({type:INST,unpaid:'0',unchargedDays:7,missingPrincipal:'2800',remainingInterest:'700',interestClamped:false,penalty:'2000',dailyAmount:'500',settlement:'5500',allocations:[{interest:'2700',lateCharge:'0'}],...over});
const terms=(over={})=>({type:INST,principal:'10000',transferFee:'1000',dailyPayment:'500',currentDailyInterest:null,loanDate:'2026-11-01',dueDate:'2026-11-25',sourceKey:'Somchai - S-฿10,000-15/10-1%',...over});
test('Part B statement: the owner example, past due, D11 and penalty 0 or typed',()=>{
 const one=rolloverStatement({...terms(),quote:quote()},false);
 assert.deepEqual([one.available,one.settlement,one.cashIssued,one.profit,one.negative],[8500,5500,3000,3800,false],'case 1: 8,500 available, 5,500 deducted, 3,000 cash, 3,800 profit');
 assert.deepEqual(one.rows.map(r=>[r.key,r.value]).filter(([k])=>!['title','settlementHeading'].includes(k)),[['principal',10000],['fee',1000],['firstDay',500],['available',8500],['unpaid',0],['uncharged',3500],['penalty',2000],['settlement',5500],['cash',3000],['profit',3800]]);
 assert.equal(one.rows.find(r=>r.key==='uncharged').label,'− 7 days not yet charged × ฿500');assert.equal(one.rows.find(r=>r.key==='uncharged').detail,'principal ฿2,800 · interest ฿700');
 assert.equal(one.rows.find(r=>r.key==='firstDay').label,'− First-day payment (day 1 of 25)');assert.equal(one.rows.find(r=>r.key==='penalty').label,'− Early closure penalty (4 days of ฿500)');
 const four=rolloverStatement({...terms(),quote:quote({unpaid:'1000',unchargedDays:0,missingPrincipal:'0',remainingInterest:'0',settlement:'3000',allocations:[{interest:'100',lateCharge:'0'},{interest:'100',lateCharge:'0'},{interest:'2000',lateCharge:'0'}]})},false);
 assert.deepEqual([four.cashIssued,four.profit,four.unpaid],[5500,3300,1000],'case 4: past due, R = 0');
 const five=rolloverStatement({...terms(),quote:quote({missingPrincipal:'200',remainingInterest:'0',interestClamped:true,unchargedDays:0,settlement:'2200',allocations:[{interest:'2000'}]})},false);
 assert.deepEqual([five.cashIssued,five.profit],[6300,3100]);assert.match(five.rows.find(r=>r.key==='uncharged').detail,/interest not below ฿0/);
 const free=rolloverStatement({...terms(),quote:quote({penalty:'0',settlement:'3500',allocations:[{interest:'700'}]})},false);
 assert.deepEqual([free.cashIssued,free.profit],[5000,1800]);assert.equal(free.rows.find(r=>r.key==='penalty').label,'− Early closure penalty (0 days of ฿500)');
 const typed=rolloverStatement({...terms(),quote:quote({penalty:'2250',settlement:'5750',allocations:[{interest:'2950'}]})},true);
 assert.equal(typed.rows.find(r=>r.key==='penalty').label,'− ค่าปรับปิดก่อนกำหนด (4.5 วัน × ฿500)');assert.equal(typed.cashIssued,2750);
});
test('Part B statement: daily interest rows, negative cash (D6) with and without unpaid charges, zero allowed',()=>{
 const daily=rolloverStatement({...terms({type:DAILY,principal:'15000',transferFee:'1500',dailyPayment:null,currentDailyInterest:'450',dueDate:null}),quote:{type:DAILY,unpaid:'0',missingPrincipal:'10000',gapInterest:'600',gapDays:2,penalty:'1200',dailyAmount:'300',settlement:'11800',allocations:[{interest:'1800'}]}},false);
 assert.deepEqual([daily.available,daily.cashIssued,daily.profit],[13050,1250,3750],'case 9 (15,000 variant)');
 assert.deepEqual(daily.rows.map(r=>r.key).filter(k=>['outstanding','gap'].includes(k)),['outstanding','gap']);assert.equal(daily.rows.find(r=>r.key==='gap').label,'− Interest for 2 days since the last charge × ฿300');
 const noGap=rolloverStatement({...terms({type:DAILY,principal:'15000',transferFee:'1500',dailyPayment:null,currentDailyInterest:'450',dueDate:null}),quote:{type:DAILY,unpaid:'0',missingPrincipal:'10000',gapInterest:'0',gapDays:0,penalty:'1200',dailyAmount:'300',settlement:'11200',allocations:[{interest:'1200'}]}},false);
 assert.equal(noGap.rows.some(r=>r.key==='gap'),false,'no gap row when a charge is dated D');
 const negative=rolloverStatement({...terms({principal:'6000',transferFee:'600',dailyPayment:'300'}),quote:quote()},false);
 assert.equal(negative.cashIssued,-400);assert.equal(negative.negative,true);
 assert.equal(negativeCashMessage(negative,false),'Cash issued would be negative (−฿400). Raise the principal or lower the penalty.');
 const unpaid=rolloverStatement({...terms({principal:'6000',transferFee:'600',dailyPayment:'300'}),quote:quote({unpaid:'500',settlement:'6000'})},false);
 assert.match(negativeCashMessage(unpaid,false),/or record the borrower's payment of the unpaid charges first\.$/);
 assert.match(negativeCashMessage(unpaid,true),/หรือบันทึกการชำระยอดค้างของผู้กู้ก่อน$/);
 const zero=rolloverStatement({...terms({principal:'7000',transferFee:'700',dailyPayment:'350'}),quote:quote({penalty:'2450',settlement:'5950'})},false);
 assert.deepEqual([zero.cashIssued,zero.negative,negativeCashMessage(zero,false)],[0,false,null],'case 7: zero cash is allowed');
});
test('Part B: penalty helper and step, prefill, the bilingual arrangement note, the result line and the action rule',()=>{
 assert.equal(penaltyStep({type:INST,dailyPayment:'500.00'}),500);assert.equal(penaltyStep({type:DAILY,currentDailyInterest:'300'}),300);
 assert.equal(penaltyHelper('2000',500,false),'฿2,000 = 4 days of ฿500');assert.equal(penaltyHelper('2250',500,false),'฿2,250 = 4.5 days of ฿500');assert.equal(penaltyHelper('2000',500,true),'฿2,000 = 4 วัน × ฿500');
 const source={type:INST,principal:'10000.00',transferFee:'1000.00',dailyPayment:'500.00',currentDailyInterest:null,loanDate:'2026-10-15',dueDate:'2026-11-08',paymentInterval:1,term:25,arrangement:null};
 assert.deepEqual(rolloverPrefill(source,'2026-11-01'),{type:INST,principal:'10000',transferFee:'1000',paymentInterval:1,dueDate:'2026-11-25',dailyPayment:'500',currentDailyInterest:null});
 const note=rolloverArrangement(source,'2026-11-01','2000','KEY');
 assert.equal(note,'Rollover of loan KEY (loan date 15/10/2026, principal ฿10,000, daily payment ฿500, due 08/11/2026), closed on 01/11/2026 with early closure penalty ฿2,000.\nต่อสัญญาจากสินเชื่อ KEY (วันที่กู้ 15/10/2026 เงินต้น ฿10,000 ยอดชำระรายวัน ฿500 ครบกำหนด 08/11/2026) ปิดเมื่อ 01/11/2026 ค่าปรับปิดก่อนกำหนด ฿2,000');
 assert.equal(generatedArrangement(note),true);
 assert.match(rolloverArrangement({...source,arrangement:'Original terms'},'2026-11-01','2000','KEY'),/฿2,000\n\nOriginal terms$/);
 assert.match(rolloverArrangement({...source,type:DAILY,currentDailyInterest:'300'},'2026-11-01','1200','KEY'),/principal ฿10,000, daily interest ฿300\), closed/);
 assert.equal(rolloverResultLine('O-KEY','N-KEY','3000','Somchai',false),'Rollover saved: loan O-KEY closed, new loan N-KEY · ฿3,000 cash to Somchai');
 assert.equal(rolloverResultLine('O-KEY','N-KEY','3000','สมชาย',true),'ต่อสัญญาแล้ว: ปิดสินเชื่อ O-KEY · จ่ายเงินสด ฿3,000 ให้ สมชาย');
 const open={status:'ยังไม่ปิดยอด',autoChargeEnabled:true,defaulted:false,type:INST,outstandingPrincipal:'2800'};
 assert.equal(rolloverOffered(open),true);assert.equal(rolloverOffered({...open,type:DAILY}),true);
 for(const over of [{type:'กำหนดวันชำระ'},{status:'ปิดยอดแล้ว'},{defaulted:true},{autoChargeEnabled:false},{outstandingPrincipal:'0'}])assert.equal(rolloverOffered({...open,...over}),false,JSON.stringify(over));
});
test('Part B: the referral-rebate line of a referred original loan, in the Loan Close wording',()=>{
 assert.equal(rolloverRebateLine([],false),'');assert.equal(rolloverRebateLine(null,false),'');
 assert.equal(rolloverRebateLine([{amount:'550.00',offsetPaymentId:'ro122:x',offsetAmount:'550.00',payableAmount:'0',offsetLoanLabel:'Mai-฿1,000-06/10-1%',referrerLabel:'Mai',paidThrough:'2026-11-30'}],false),'rebate ฿550 offset to Mai-฿1,000-06/10-1%, paid through 30 Nov');
 assert.equal(rolloverRebateLine([{amount:'550.00',offsetPaymentId:'ro122:x',offsetAmount:'380.00',payableAmount:'170.00',offsetLoanLabel:'L',referrerLabel:'Mai',paidThrough:null}],false),'rebate ฿380 offset to L · ฿170 pending');
 assert.equal(rolloverRebateLine([{amount:'550.00',rebateState:'pending',referrerLabel:'Mai'}],false),'rebate ฿550 pending to Mai');
 assert.equal(rolloverRebateLine([{amount:'550.00',rebateState:'pending',referrerLabel:'ใหม่'}],true),'ค่าแนะนำ ฿550 ค้างจ่ายให้ ใหม่');
 assert.equal(rolloverRebateLine([{amount:'550.00',rebateState:'paid',referrerLabel:'Mai',settlementDate:'2026-11-09'}],false),'rebate ฿550 paid to Mai on 9 Nov');
});
test('Echo UX-13: the rollover form re-derives untouched terms from the original loan\'s ratios; typed values stay',()=>{
 assert.equal(scaleByRatio('12000','1000.00','10000.00'),'1200');assert.equal(scaleByRatio('10010','500','10000'),'501');assert.equal(scaleByRatio('10009','500','10000'),'500');assert.equal(scaleByRatio('x','1','1'),null);
 const source={type:INST,principal:'10000.00',transferFee:'1000.00',dailyPayment:'500.00',currentDailyInterest:null};
 let s={fields:{principal:'10000',transferFee:'1000',dailyPayment:'500',currentDailyInterest:null},manual:{}};
 s=rolloverFieldChange(s.fields,s.manual,'principal','12000',source);assert.deepEqual([s.fields.transferFee,s.fields.dailyPayment,s.fields.currentDailyInterest],['1200','600',null]);
 s=rolloverFieldChange(s.fields,s.manual,'transferFee','900',source);s=rolloverFieldChange(s.fields,s.manual,'principal','14000',source);
 assert.deepEqual([s.fields.transferFee,s.fields.dailyPayment],['900','700'],'a typed fee stays');
 s=rolloverFieldChange(s.fields,s.manual,'transferFee',null,source);s=rolloverFieldChange(s.fields,s.manual,'principal','15000',source);assert.equal(s.fields.transferFee,'1500','clearing hands it back');
 const daily=rolloverFieldChange({principal:'10000',transferFee:'1000',dailyPayment:null,currentDailyInterest:'300'},{},'principal','15000',{type:DAILY,principal:'10000',transferFee:'1000',currentDailyInterest:'300'});
 assert.deepEqual([daily.fields.transferFee,daily.fields.currentDailyInterest,daily.fields.dailyPayment],['1500','450',null]);
});
test('Echo UX-14 and UX-19: the profit row names a past rollover day; leaving Daily instalment clears what the form filled',()=>{
 assert.equal(rolloverStatement({...terms(),today:'2026-11-01',quote:quote()},false).rows.at(-1).label,'Profit recognized today');
 assert.equal(rolloverStatement({...terms(),today:'2026-11-02',quote:quote()},false).rows.at(-1).label,'Profit recognized on 01/11/2026');
 assert.equal(rolloverStatement({...terms(),today:'2026-11-02',quote:quote()},true).rows.at(-1).label,'กำไรรับรู้ 01/11/2026');
 let s={fields:{...empty,principal:'10000'},manual:{}};s=change(s,'type',INST);s=change(s,'dailyPayment','450');s=change(s,'type',DAILY);
 assert.deepEqual([s.fields.transferFee,s.fields.dueDate,s.fields.dailyPayment],[null,null,'450'],'filled fee and due date cleared; the typed daily payment stays');
 let f={fields:{...empty,principal:'10000'},manual:{}};f=change(f,'transferFee','700');f=change(f,'type',INST);f=change(f,'type','กำหนดวันชำระ');
 assert.deepEqual([f.fields.transferFee,f.fields.dueDate],['700',null]);
});
