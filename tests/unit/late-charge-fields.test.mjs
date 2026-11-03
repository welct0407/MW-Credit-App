import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {canonicalAllocationPlan,canonicalCommand,commandIdentity,payForwardDayAllowed} from '../../services/contracts/payment-command.mjs';
import {canonicalPaymentCorrection} from '../../services/contracts/payment-correction.mjs';
import {canonicalOperation} from '../../services/contracts/operation-command.mjs';
import {canonicalChargeFields} from '../../services/business/charges.mjs';
import {agentIdentity,canonicalAgentCommand,receiptRequestId} from '../../services/agent-receipts/contract.mjs';
import {closeSummary} from '../../services/payment-command/close-summary.mjs';
import {graphemeLength,renderNotification} from '../../services/notifications/content.mjs';
// R118 (V132): late charges. The line shape, charge fields and push wording the database and clients share.
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const line8=(chargeId,p,i,l,ep,ei,el,chargeDate='2026-11-02')=>({chargeId,principal:p,interest:i,lateCharge:l,expectedPrincipalRemaining:ep,expectedInterestRemaining:ei,expectedLateChargeRemaining:el,chargeDate});
const actor={issuer:'https://securetoken.google.com/fixture',subject:'fixture-owner',partnerId:'fixture-partner',loginEmail:'owner@example.invalid'};
const base={requestId:'12345678-1234-4234-8234-123456789abc',borrowerId:'B-1',cashAccountId:'CA-1',paymentDate:'2026-11-03',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null,payerLines:null};
const KEYS8=['chargeId','principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining','chargeDate'];

test('v11 lines are 8-key in the SQL order, byte for byte the line text pwa_submit_selected_charges_v1 builds',()=>{
 const sql=read('database/current/public-functions.sql');
 const start=sql.indexOf('CREATE FUNCTION public.pwa_submit_selected_charges_v1'),body=sql.slice(start,sql.indexOf('\n$_$;',start));
 const lineText=body.slice(body.indexOf("line_text:='{\"chargeId\":'"),body.indexOf("plan_text:=plan_text||"));
 assert.deepEqual([...lineText.matchAll(/,?"([A-Za-z]+)":'/g)].map(m=>m[1]),KEYS8,'the SQL v11 line text names the keys in this order');
 const command=canonicalCommand({...base,schemaVersion:11,amountReceived:'120',allocations:[line8('C-1','0','100','20','200','100','50')],materialize:[],principal:[]});
 assert.deepEqual(Object.keys(command.allocations[0]),KEYS8);
 const json=commandIdentity(command,actor,null).canonicalJson;
 assert.match(json,/"allocations":\[\{"chargeId":"C-1","principal":"0","interest":"100","lateCharge":"20","expectedPrincipalRemaining":"200","expectedInterestRemaining":"100","expectedLateChargeRemaining":"50","chargeDate":"2026-11-02"\}\],"cashAccountId"/);
 assert.match(json,/"materialize":\[\],"principal":\[\]\}/,'v11 keeps the v10 keys; both lists may be empty');
});

test('v11 caps each part at its expected remaining and sums all three; earlier versions keep the 6-key line',()=>{
 const plan=amount=>lines=>canonicalCommand({...base,schemaVersion:11,amountReceived:amount,allocations:lines,materialize:[],principal:[]});
 assert.equal(plan('50')([line8('C-1','0','0','50','0','0','50')]).allocations[0].lateCharge,'50','a late-charge-only line');
 for(const lines of [[line8('C-1','0','0','51','0','0','50')],[line8('C-1','0','0','0','0','0','50')]])assert.throws(()=>plan(lines[0].lateCharge==='0'?'0':'51')(lines));
 assert.throws(()=>plan('60')([line8('C-1','0','10','40','0','10','50')]),'the parts must sum to the amount');
 const {lateCharge:_l,expectedLateChargeRemaining:_e,...six}=line8('C-1','0','10','0','0','10','0');
 assert.throws(()=>plan('10')([six]),'v11 refuses a 6-key line');
 assert.throws(()=>canonicalCommand({...base,schemaVersion:10,amountReceived:'10',allocations:[line8('C-1','0','10','0','0','10','0')],materialize:[],principal:[]}),'v10 refuses an 8-key line');
 assert.throws(()=>canonicalCommand({...base,schemaVersion:10,amountReceived:'10',allocations:[six],materialize:[],principal:[]}),'v10 still needs a materialize or principal entry');
 assert.deepEqual(Object.keys(canonicalAllocationPlan('10',[six])[0]),['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate']);
 assert.equal(payForwardDayAllowed({schemaVersion:11,materialize:[],principal:[],paymentDate:'2026-11-01'},'2026-11-03'),true,'a v11 without lists is not a pay-forward plan');
 assert.equal(payForwardDayAllowed({schemaVersion:11,materialize:[{}],principal:[],paymentDate:'2026-11-01'},'2026-11-03'),false);
});

test('a booked charge is matched by a v11 line that expects late 0',()=>{
 const entry={loanId:'L-1',chargeId:'cg8:3:L-1:2026-11-04',chargeDate:'2026-11-04',principalDue:'0',interestDue:'10'};
 const input=el=>({...base,schemaVersion:11,amountReceived:'10',allocations:[line8(entry.chargeId,'0','10','0','0','10',el,'2026-11-04')],materialize:[entry],principal:[]});
 assert.equal(canonicalCommand(input('0')).materialize.length,1);
 assert.throws(()=>canonicalCommand(input('50')));
});

test('charge fields: lateChargeDue between interestDue and notes, optional for earlier clients',()=>{
 const five={loanId:'L-1',chargeDate:'2026-11-03',principalDue:'0',interestDue:'100',notes:null};
 assert.deepEqual(Object.keys(canonicalChargeFields(five)),['loanId','chargeDate','principalDue','interestDue','notes'],'a 5-key request keeps its text');
 assert.deepEqual(Object.keys(canonicalChargeFields({...five,lateChargeDue:'50'})),['loanId','chargeDate','principalDue','interestDue','lateChargeDue','notes']);
 for(const lateChargeDue of ['-50','50.5','050',50,null,'92233720368547759'])assert.throws(()=>canonicalChargeFields({...five,lateChargeDue}),String(lateChargeDue));
 const operation=canonicalOperation({requestId:'12345678-1234-4234-8234-123456789abc',operation:'charge.update',targetId:'C-1',expectedVersion:'a'.repeat(64),predecessorRequestId:null,inputs:{notes:null,lateChargeDue:'0',interestDue:'100',principalDue:'0',chargeDate:'2026-11-03',loanId:'L-1'},receiptId:null});
 assert.deepEqual(Object.keys(operation.inputs),['loanId','chargeDate','principalDue','interestDue','lateChargeDue','notes']);
});

test('corrections accept the stored 6-key lines or 8-key lines, one shape per correction',()=>{
 const fields={borrowerId:'B-1',amountReceived:'60',paymentDate:'2026-11-03',paymentMethod:'Bank Transfer',cashAccountId:'CA-1',notes:null,allocationMethod:'Selected Charges',targetChargeId:null,targetLoanId:null};
 const eight=canonicalPaymentCorrection({kind:'pwa-plan',receiptMode:'preserve',fields:{...fields,allocations:[line8('C-1','0','10','50','0','10','50')]}});
 assert.deepEqual(Object.keys(eight.fields.allocations[0]),KEYS8);
 const {lateCharge:_l,expectedLateChargeRemaining:_e,...six}=line8('C-1','50','10','0','50','10','0');
 assert.deepEqual(Object.keys(canonicalPaymentCorrection({kind:'pwa-plan',receiptMode:'preserve',fields:{...fields,allocations:[six]}}).fields.allocations[0]),['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate']);
 assert.throws(()=>canonicalPaymentCorrection({kind:'pwa-plan',receiptMode:'preserve',fields:{...fields,amountReceived:'120',allocations:[six,line8('C-2','0','10','50','0','10','50')]}}));
});

test('agent schemaVersion 10 is v9 with 8-key lines',()=>{
 const reviewId='synthetic-review-late',requestId=receiptRequestId('dev',reviewId);
 const command={schemaVersion:10,requestId,environment:'dev',reviewId,mode:'reviewed',borrowerId:'B-1',cashAccountId:'CA-1',amountReceived:'60',paymentDate:'2026-11-03',transferTime:'12:34',bankReference:'REF123456',payerLines:null,
  purpose:{forward:true,principal:[],loans:null},allocations:[line8('C-1','0','10','50','0','10','50')],materialize:[],principal:[],proposalSha256:'c'.repeat(64),
  archiveEvidence:{receiptId:'a'.repeat(64),objectKey:`receipts/dev/2026/10/12/${'a'.repeat(64)}/${'b'.repeat(64)}.jpg`,generation:'1234',rawSha256:'b'.repeat(64),mimeType:'image/jpeg',sizeBytes:1000,capturedAt:'1791766800'}};
 assert.deepEqual(Object.keys(canonicalAgentCommand(command).allocations[0]),KEYS8);
 assert.match(agentIdentity(command,{issuer:'https://accounts.google.com',subject:'123',partnerId:'P-1',loginEmail:'p@example.invalid'}).canonicalJson,/"lateCharge":"50","expectedPrincipalRemaining"/);
 assert.throws(()=>canonicalAgentCommand({...command,schemaVersion:9}),'agent v9 keeps the 6-key line');
});

test('the Loan Close summary shows the late-charge part apart',()=>{
 assert.deepEqual(closeSummary({amount:'1150',allocations:[{principal:'1000',interest:'100',lateCharge:'50'}]}),{principalAmount:'1000.00',interestAmount:'100.00',lateChargeAmount:'50.00'});
 assert.deepEqual(closeSummary({amount:'1100',allocations:[{principal:'1000',interest:'100',lateCharge:'50'}]}),{principalAmount:null,interestAmount:null,lateChargeAmount:null});
});

test('Payment received push: the late part after the rebate line and before the name, amounts never cut (Echo LC-PUSH-1/2)',()=>{
 const facts={found:true,eventType:'payment.posted',amount:'150',lateChargeAmount:'50'};
 assert.deepEqual(renderNotification({...facts,language:'en',borrowerName:'Somchai Jaidee'}),{title:'Payment received ฿150',body:'Late charge ฿50 · Somchai Jaidee'});
 assert.deepEqual(renderNotification({...facts,language:'th',borrowerName:'สมชาย ใจดี'}),{title:'รับชำระแล้ว ฿150',body:'ค่าปรับล่าช้า ฿50 · สมชาย ใจดี'});
 assert.equal(renderNotification({...facts,lateChargeAmount:'0',language:'en',borrowerName:'Somchai Jaidee'}).body,'Somchai Jaidee','no late part when 0');
 assert.equal(renderNotification({...facts,lateChargeAmount:null,language:'en',borrowerName:'Somchai Jaidee'}).body,'Somchai Jaidee','no late part when unknown (before V132)');
 assert.equal(renderNotification({...facts,eventType:'loan.closed',language:'en',borrowerName:'Somchai Jaidee'}).body,'Somchai Jaidee','late part on payment.posted only');
 const long='Somchai Jaidee the borrower with a very long synthetic English name for the budget';
 const body=renderNotification({...facts,language:'en',borrowerName:long}).body;
 assert.ok(graphemeLength(body)<=80&&body.startsWith('Late charge ฿50 · ')&&body.endsWith('…'),body);
 for(const language of ['en','th']){
  const rebate={...facts,language,rebatePayable:'1000',rebatePayee:'Malee Srisuk the referrer with a long synthetic name',borrowerName:long};
  const text=renderNotification(rebate).body,late=language==='th'?'ค่าปรับล่าช้า ฿50':'Late charge ฿50';
  assert.ok(graphemeLength(text)<=80,text);
  assert.ok(text.includes(late)&&text.includes('฿1,000')&&text.includes('Lisa'),'amounts and Lisa are never cut: '+text);
  assert.ok(text.indexOf(late)>text.indexOf('฿1,000'),'rebate line first, then the late part: '+text);
 }
 const short=renderNotification({...facts,language:'en',rebatePayable:'300',rebatePayee:'Malee Srisuk',borrowerName:'Somchai Jaidee'}).body;
 assert.equal(short,'Rebate ฿300 to Malee Srisuk, transfer from Lisa · Late charge ฿50 · Somchai Jai…','the name is shortened first');
 assert.equal(graphemeLength(short),80);
});
