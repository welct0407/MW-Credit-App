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
export function canonicalAgentCommand(input){
 // R095 schemaVersion 8 = 7 plus payerLines (null or {before, after}: the payer-lines change, written only while the
 // borrower's column still equals `before`). 7 stays accepted until the agent sends 8 on both environments.
 const v8=input?.schemaVersion===8;
 exact(input,['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference',...(v8?['payerLines']:[]),'proposalSha256','archiveEvidence']);
 if(![7,8].includes(input.schemaVersion)||(v8&&!validPayerLines(input.payerLines))||input.requestId!==receiptRequestId(input.environment,input.reviewId)||!['automatic','reviewed'].includes(input.mode))fail();
 const borrowerId=text(input.borrowerId),cashAccountId=text(input.cashAccountId);
 if(typeof input.amountReceived!=='string'||!/^[1-9][0-9]{0,16}$/.test(input.amountReceived)||BigInt(input.amountReceived)>92233720368547758n)fail();
 if(typeof input.paymentDate!=='string'||input.paymentDate<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)||!Number.isFinite(Date.parse(input.paymentDate+'T00:00:00Z'))||new Date(input.paymentDate+'T00:00:00Z').toISOString().slice(0,10)!==input.paymentDate||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.transferTime))fail();
 if(typeof input.bankReference!=='string'||!input.bankReference.trim()||!input.bankReference.isWellFormed()||Buffer.byteLength(input.bankReference)>256||/[\0\r\n]/.test(input.bankReference)||!/^[a-f0-9]{64}$/.test(input.proposalSha256))fail();
 const a=input.archiveEvidence;exact(a,['receiptId','objectKey','generation','rawSha256','mimeType','sizeBytes','capturedAt']);
 if(!/^[a-f0-9]{64}$/.test(a.receiptId)||!/^[a-f0-9]{64}$/.test(a.rawSha256)||typeof a.generation!=='string'||!/^[1-9][0-9]{0,24}$/.test(a.generation)||!Number.isSafeInteger(a.sizeBytes)||a.sizeBytes<1||a.sizeBytes>12000000)fail();
 if(typeof a.capturedAt!=='string'||!/^[1-9][0-9]{0,11}(?:\.[0-9]{0,8}[1-9])?$/.test(a.capturedAt)||!Number.isFinite(new Date(Number(a.capturedAt)*1000).getTime()))fail();
 const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[a.mimeType];
 if(!extension||a.objectKey!==`receipts/${input.environment}/${new Date(Number(a.capturedAt)*1000).toISOString().slice(0,10).replaceAll('-','/')}/${a.receiptId}/${a.rawSha256}.${extension}`)fail();
 return {schemaVersion:input.schemaVersion,requestId:input.requestId,environment:input.environment,reviewId:input.reviewId,mode:input.mode,borrowerId,cashAccountId,amountReceived:input.amountReceived,paymentDate:input.paymentDate,transferTime:input.transferTime,bankReference:input.bankReference,...(v8?{payerLines:input.payerLines===null?null:{before:input.payerLines.before,after:input.payerLines.after}}:{}),proposalSha256:input.proposalSha256,archiveEvidence:{receiptId:a.receiptId,objectKey:a.objectKey,generation:a.generation,rawSha256:a.rawSha256,mimeType:a.mimeType,sizeBytes:a.sizeBytes,capturedAt:a.capturedAt}};
}
export function agentIdentity(input,actor){
 const command=canonicalAgentCommand(input);
 exact(actor,['issuer','subject','partnerId','loginEmail']);
 if(actor.issuer!=='https://accounts.google.com'||!/^\d{1,128}$/.test(actor.subject))fail();
 text(actor.partnerId);text(actor.loginEmail,320);if(actor.loginEmail!==actor.loginEmail.toLowerCase())fail();
 const canonicalJson=JSON.stringify({contractVersion:1,command,actor:{issuer:actor.issuer,subject:actor.subject,partnerId:actor.partnerId,loginEmail:actor.loginEmail},receipt:null});
 return{requestId:command.requestId,canonicalJson,payloadSha256:hash(canonicalJson)};
}
