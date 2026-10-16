// Machine-only typed source commands. Validation grants no caller authority.
import {UUID_V4 as uuid} from '../lib/ids.mjs';
const version=/^[a-f0-9]{64}$/;
const paymentKeys=['borrowerId','amountReceived','paymentDate','createdAt','paymentMethod','allocationMethod','bankReference','notes','targetChargeId','targetLoanId','cashAccountId','cashHolderId'];
const allocationKeys=['paymentId','chargeId','chargeDateSnapshot','chargeRowNumberSnapshot','interestRemainingSnapshot','principalRemainingSnapshot','amountRemainingSnapshot','allocationOrder','allocatedInterest','allocatedPrincipal','allocatedAmount','createdAt'];
const refs=new Set(['borrowerId','paymentId','chargeId','targetChargeId','targetLoanId','cashAccountId','cashHolderId']);
const amounts=new Set(['amountReceived','interestRemainingSnapshot','principalRemainingSnapshot','amountRemainingSnapshot','allocatedInterest','allocatedPrincipal','allocatedAmount']);
const integers=new Set(['allocationOrder','chargeRowNumberSnapshot']);
const invalid=()=>{throw Error('invalid_request');};
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))invalid();
}
function text(value,max=65536){
 if(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>max)invalid();
 return value;
}
function reference(value){
 text(value,256);if(!value||value!==value.trim()||/[\u0000-\u001f\u007f]/.test(value))invalid();return value;
}
function day(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'
  ||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)invalid();
}
function wallClock(value){
 const match=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,6})?$/.exec(value);
 if(!match)invalid();day(match[1]);if(Number(match[2])>23||Number(match[3])>59||Number(match[4])>59)invalid();
}
function money(value){
 if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value))invalid();
 const [whole,fraction='']=value.replace(/^-/,'').split('.');
 if(whole.length>17||BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))>9223372036854775807n)invalid();
}

export function canonicalNativeOperation(input){
 exact(input,['requestId','operation','targetId','expectedVersion','predecessorRequestId','receiptId','inputs']);
 if(typeof input.requestId!=='string'||!uuid.test(input.requestId)
  ||!['payment.create','payment.update-metadata','allocation.create','allocation.update','allocation.delete'].includes(input.operation)
  ||input.receiptId!==null)invalid();
 if(input.operation==='payment.update-metadata'
  ? input.predecessorRequestId!==null&&(typeof input.predecessorRequestId!=='string'||!uuid.test(input.predecessorRequestId))
  : input.predecessorRequestId!==null)invalid();
 reference(input.targetId);
 const create=input.operation.endsWith('.create');
 if(create? !uuid.test(input.targetId)||input.expectedVersion!==null
   :typeof input.expectedVersion!=='string'||!version.test(input.expectedVersion))invalid();
 const keys=input.operation==='payment.create'?paymentKeys:input.operation==='payment.update-metadata'?['createdAt']:input.operation==='allocation.delete'?[]:allocationKeys;
 exact(input.inputs,keys);
 const inputs={};
 for(const key of keys){
  const value=input.inputs[key];
  if(value!==null){
   text(value);
   if(refs.has(key))reference(value);
   if(amounts.has(key))money(value);
   if(integers.has(key)&&(!/^-?(?:0|[1-9][0-9]*)$/.test(value)||value.length>11||BigInt(value)>2147483647n||BigInt(value)<-2147483647n))invalid();
   if(['paymentDate','chargeDateSnapshot'].includes(key))day(value);
   if(key==='createdAt')wallClock(value);
  }
  inputs[key]=value;
 }
 if(input.operation==='payment.create'){
  if(inputs.borrowerId===null||inputs.amountReceived===null||!/^[1-9][0-9]*$/.test(inputs.amountReceived)
    ||inputs.paymentDate===null||inputs.createdAt===null
    ||!['Bank Transfer','Cash','Net-off at Disbursement'].includes(inputs.paymentMethod)
    ||!['Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close'].includes(inputs.allocationMethod))invalid();
 }else if(['allocation.create','allocation.update'].includes(input.operation)&&(inputs.paymentId===null||inputs.chargeId===null))invalid();
 return Object.freeze({requestId:input.requestId,operation:input.operation,targetId:input.targetId,
  expectedVersion:input.expectedVersion,predecessorRequestId:input.predecessorRequestId,inputs:Object.freeze(inputs),receiptId:null});
}

export function nativeOperationIdentity(input,identity){
 const request=canonicalNativeOperation(input);
 exact(identity,['issuer','subject','partnerId','loginEmail']);
 for(const key of ['issuer','subject','partnerId','loginEmail']){
  text(identity[key],320);
  if(!identity[key]||identity[key]!==identity[key].trim()||/[\u0000-\u001f\u007f]/.test(identity[key]))invalid();
 }
 if(identity.issuer!=='https://accounts.google.com'||!/^\d{1,128}$/.test(identity.subject)
  ||identity.loginEmail!==identity.loginEmail.toLowerCase()||!/^[^\s@]+@[^\s@]+$/.test(identity.loginEmail))invalid();
 reference(identity.partnerId);
 const actor={issuer:identity.issuer,subject:identity.subject,partnerId:identity.partnerId,loginEmail:identity.loginEmail};
 const command={schemaVersion:1,operation:request.operation,targetType:request.operation.split('.')[0],
  targetId:request.targetId,expectedVersion:request.expectedVersion,predecessorRequestId:request.predecessorRequestId,inputs:request.inputs};
 const canonicalJson=JSON.stringify({contractVersion:2,requestId:request.requestId,actor,command,receipt:null});
 if(Buffer.byteLength(canonicalJson)>524288)invalid();
 return Object.freeze({canonicalJson});
}
