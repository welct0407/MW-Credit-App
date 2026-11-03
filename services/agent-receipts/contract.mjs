import {createHash} from 'node:crypto';
import {validPayerLines} from '../receipts/payer-name.mjs';
const fail=()=>{throw Error('invalid_receipt_command');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail();};
const text=(value,max=256)=>{if(typeof value!=='string'||!value.isWellFormed()||!value.trim()||value!==value.trim()||Buffer.byteLength(value)>max||/[\0\r\n]/.test(value))fail();return value;};
const hash=value=>createHash('sha256').update(value,'utf8').digest('hex');
export function receiptRequestId(environment,reviewId){
 if(!['dev','prod'].includes(environment))fail();text(reviewId);
 const bytes=createHash('sha256').update(JSON.stringify(['mw-credit-agent-receipt-v1',environment,reviewId])).digest().subarray(0,16);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=bytes.toString('hex');return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const whole=value=>{if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,16})$/.test(value)||BigInt(value)>92233720368547758n)fail();return value;};
const day=value=>{if(typeof value!=='string'||value<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail();return value;};
const id=value=>{if(typeof value!=='string'||!value||Buffer.byteLength(value)>256||value.includes(',')||/\s|\uFEFF/.test(value))fail();return value;};
const ordered=(values,unique=true)=>{for(let i=1;i<values.length;i++)if(Buffer.compare(Buffer.from(values[i-1]),Buffer.from(values[i]))>=(unique?0:1))fail();};
const list=(value,max)=>{if(!Array.isArray(value)||value.length>max)fail();return value;};
/** R112 schemaVersion 9: the partner's purpose and the pay-forward plan's explicit lists (the manual v10 shapes), in
 * canonical key order; SQL recomputes the plan and requires the command to equal it. R118 schemaVersion 10: the same with
 * 8-key lines (lateCharge after interest, expectedLateChargeRemaining after expectedInterestRemaining), as manual v11. */
function payForward(input,late=false){
 const p=input.purpose;exact(p,['forward','principal','loans']);
 if(typeof p.forward!=='boolean'||p.loans!==null)fail();
 const purpose={forward:p.forward,principal:list(p.principal,20).map(e=>{exact(e,['loanId','amount']);if(!/^[1-9]/.test(whole(e.amount)))fail();return{loanId:text(e.loanId),amount:e.amount};}),loans:null};
 if(!purpose.forward&&!purpose.principal.length)fail();ordered(purpose.principal.map(e=>e.loanId));
 const lines=list(input.allocations,10000);if(!lines.length)fail();
 const allocations=lines.map(l=>{exact(l,late?['chargeId','principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining','chargeDate']:['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate']);
  const v=late?{chargeId:id(l.chargeId),principal:whole(l.principal),interest:whole(l.interest),lateCharge:whole(l.lateCharge),expectedPrincipalRemaining:whole(l.expectedPrincipalRemaining),expectedInterestRemaining:whole(l.expectedInterestRemaining),expectedLateChargeRemaining:whole(l.expectedLateChargeRemaining),chargeDate:day(l.chargeDate)}
   :{chargeId:id(l.chargeId),principal:whole(l.principal),interest:whole(l.interest),expectedPrincipalRemaining:whole(l.expectedPrincipalRemaining),expectedInterestRemaining:whole(l.expectedInterestRemaining),chargeDate:day(l.chargeDate)};
  if(BigInt(v.principal)+BigInt(v.interest)+BigInt(v.lateCharge??'0')<=0n||BigInt(v.principal)>BigInt(v.expectedPrincipalRemaining)||BigInt(v.interest)>BigInt(v.expectedInterestRemaining)||BigInt(v.lateCharge??'0')>BigInt(v.expectedLateChargeRemaining??'0'))fail();return v;});
 ordered(allocations.map(l=>l.chargeId));
 if(allocations.reduce((t,l)=>t+BigInt(l.principal)+BigInt(l.interest)+BigInt(l.lateCharge??'0'),0n)!==BigInt(input.amountReceived))fail();
 const materialize=list(input.materialize,200).map(m=>{exact(m,['loanId','chargeId','chargeDate','principalDue','interestDue']);
  const v={loanId:text(m.loanId),chargeId:id(m.chargeId),chargeDate:day(m.chargeDate),principalDue:whole(m.principalDue),interestDue:whole(m.interestDue)};
  if(v.chargeId!==`cg8:${v.loanId.length}:${v.loanId}:${v.chargeDate}`||BigInt(v.principalDue)+BigInt(v.interestDue)<=0n)fail();return v;});
 ordered(materialize.map(m=>m.chargeId));
 const principal=list(input.principal,20).map(e=>{exact(e,['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue']);
  if(!['raise','book'].includes(e.kind))fail();
  return{loanId:text(e.loanId),kind:e.kind,chargeId:id(e.chargeId),chargeDate:day(e.chargeDate),amount:whole(e.amount),accruedInterest:whole(e.accruedInterest),principalDue:whole(e.principalDue)};});
 ordered(principal.map(e=>e.loanId));
 return{purpose,allocations,materialize,principal};
}
export function canonicalAgentCommand(input){
 // R095 schemaVersion 8 = 7 plus payerLines (null or {before, after}: the payer-lines change, written only while the
 // borrower's column still equals `before`). 7 stays accepted until the agent sends 8 on both environments.
 // R112 schemaVersion 9 = 8 plus purpose, allocations, materialize and principal (reviewed mode only).
 // R118 schemaVersion 10 = 9 with 8-key allocation lines (the late charge).
 const v10=input?.schemaVersion===10,v9=input?.schemaVersion===9||v10,v8=input?.schemaVersion===8||v9;
 exact(input,['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference',...(v8?['payerLines']:[]),...(v9?['purpose','allocations','materialize','principal']:[]),'proposalSha256','archiveEvidence']);
 if(![7,8,9,10].includes(input.schemaVersion)||(v8&&!validPayerLines(input.payerLines))||input.requestId!==receiptRequestId(input.environment,input.reviewId)||!['automatic','reviewed'].includes(input.mode)||(v9&&input.mode!=='reviewed'))fail();
 const borrowerId=text(input.borrowerId),cashAccountId=text(input.cashAccountId);
 if(typeof input.amountReceived!=='string'||!/^[1-9][0-9]{0,16}$/.test(input.amountReceived)||BigInt(input.amountReceived)>92233720368547758n)fail();
 if(typeof input.paymentDate!=='string'||input.paymentDate<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)||!Number.isFinite(Date.parse(input.paymentDate+'T00:00:00Z'))||new Date(input.paymentDate+'T00:00:00Z').toISOString().slice(0,10)!==input.paymentDate||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.transferTime))fail();
 if(typeof input.bankReference!=='string'||!input.bankReference.trim()||!input.bankReference.isWellFormed()||Buffer.byteLength(input.bankReference)>256||/[\0\r\n]/.test(input.bankReference)||!/^[a-f0-9]{64}$/.test(input.proposalSha256))fail();
 const a=input.archiveEvidence;exact(a,['receiptId','objectKey','generation','rawSha256','mimeType','sizeBytes','capturedAt']);
 if(!/^[a-f0-9]{64}$/.test(a.receiptId)||!/^[a-f0-9]{64}$/.test(a.rawSha256)||typeof a.generation!=='string'||!/^[1-9][0-9]{0,24}$/.test(a.generation)||!Number.isSafeInteger(a.sizeBytes)||a.sizeBytes<1||a.sizeBytes>12000000)fail();
 if(typeof a.capturedAt!=='string'||!/^[1-9][0-9]{0,11}(?:\.[0-9]{0,8}[1-9])?$/.test(a.capturedAt)||!Number.isFinite(new Date(Number(a.capturedAt)*1000).getTime()))fail();
 const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[a.mimeType];
 const plan=v9?payForward(input,v10):{};
 if(!extension||a.objectKey!==`receipts/${input.environment}/${new Date(Number(a.capturedAt)*1000).toISOString().slice(0,10).replaceAll('-','/')}/${a.receiptId}/${a.rawSha256}.${extension}`)fail();
 return {schemaVersion:input.schemaVersion,requestId:input.requestId,environment:input.environment,reviewId:input.reviewId,mode:input.mode,borrowerId,cashAccountId,amountReceived:input.amountReceived,paymentDate:input.paymentDate,transferTime:input.transferTime,bankReference:input.bankReference,...(v8?{payerLines:input.payerLines===null?null:{before:input.payerLines.before,after:input.payerLines.after}}:{}),...plan,proposalSha256:input.proposalSha256,archiveEvidence:{receiptId:a.receiptId,objectKey:a.objectKey,generation:a.generation,rawSha256:a.rawSha256,mimeType:a.mimeType,sizeBytes:a.sizeBytes,capturedAt:a.capturedAt}};
}
export function agentIdentity(input,actor){
 const command=canonicalAgentCommand(input);
 exact(actor,['issuer','subject','partnerId','loginEmail']);
 if(actor.issuer!=='https://accounts.google.com'||!/^\d{1,128}$/.test(actor.subject))fail();
 text(actor.partnerId);text(actor.loginEmail,320);if(actor.loginEmail!==actor.loginEmail.toLowerCase())fail();
 const canonicalJson=JSON.stringify({contractVersion:1,command,actor:{issuer:actor.issuer,subject:actor.subject,partnerId:actor.partnerId,loginEmail:actor.loginEmail},receipt:null});
 return{requestId:command.requestId,canonicalJson,payloadSha256:hash(canonicalJson)};
}
