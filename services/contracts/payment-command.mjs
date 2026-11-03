import { createHash } from 'node:crypto';

// Pure candidate contract only. These functions authenticate nobody and persist nothing.
import { UUID_V4_ANY_CASE as uuid } from '../lib/ids.mjs';
import { validPayerLines } from '../receipts/payer-name.mjs';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
function fail(code = 'invalid_contract') { throw new Error(code); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}
function text(value, max, { nonblank = true, noEdges = false } = {}) {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value, 'utf8') > max ||
      /[\0\r\n]/.test(value) || (nonblank && !value.trim()) || (noEdges && value !== value.trim())) fail();
  return value;
}
function id(value) { return text(value, 256, { noEdges: true }); }
function requestId(value) { if (typeof value !== 'string' || !uuid.test(value)) fail(); return value.toLowerCase(); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail();
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const whole = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,16})$/.test(value) || BigInt(value)>92233720368547758n) fail();
  return value;
};
/**
 * The allocation lines of a v6+ command. R118 v11 ({late:true}): 8-key lines in the SQL order chargeId, principal,
 * interest, lateCharge, expectedPrincipalRemaining, expectedInterestRemaining, expectedLateChargeRemaining, chargeDate
 * (byte-identical to pwa_submit_selected_charges_v1's line text); each part is capped at its expected remaining and the
 * three parts sum to the amount. Earlier versions keep the 6-key line (late 0).
 */
export function canonicalAllocationPlan(amountReceived, input, {late=false}={}) {
  whole(amountReceived); if (amountReceived==='0' || !Array.isArray(input) || input.length<1 || input.length>10000) fail();
  const allocations=Array.from(input,row=>{
    exact(row,late?['chargeId','principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining','chargeDate']:['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate']);
    const chargeId=id(row.chargeId); if (/[,\s]/u.test(chargeId)) fail();
    const principal=whole(row.principal),interest=whole(row.interest),expectedPrincipalRemaining=whole(row.expectedPrincipalRemaining),expectedInterestRemaining=whole(row.expectedInterestRemaining);
    const lateCharge=late?whole(row.lateCharge):'0',expectedLateChargeRemaining=late?whole(row.expectedLateChargeRemaining):'0';
    if(BigInt(principal)+BigInt(interest)+BigInt(lateCharge)===0n || BigInt(principal)>BigInt(expectedPrincipalRemaining) || BigInt(interest)>BigInt(expectedInterestRemaining) || BigInt(lateCharge)>BigInt(expectedLateChargeRemaining)) fail();
    return late?{chargeId,principal,interest,lateCharge,expectedPrincipalRemaining,expectedInterestRemaining,expectedLateChargeRemaining,chargeDate:date(row.chargeDate)}
      :{chargeId,principal,interest,expectedPrincipalRemaining,expectedInterestRemaining,chargeDate:date(row.chargeDate)};
  });
  if(new Set(allocations.map(row=>row.chargeId)).size!==allocations.length || allocations.reduce((sum,row)=>sum+BigInt(row.principal)+BigInt(row.interest)+BigInt(row.lateCharge??'0'),0n)!==BigInt(amountReceived))fail();
  allocations.sort((a,b)=>Buffer.compare(Buffer.from(a.chargeId,'utf8'),Buffer.from(b.chargeId,'utf8')));
  return freeze(allocations);
}
/**
 * R101 v9 materialize: the next projected charges this payment books before posting, one per loan. Each entry names the
 * generator key cg8:<length in code points>:<loan>:<date> (SQL length() counts characters) and is paid by exactly one
 * allocation line that expects the whole projected charge. Entries are sorted by chargeId byte order.
 * R110 v10 ({several:true}): 0 to 200 entries, several per loan (each chargeId once; byte order keeps a loan's dates in order).
 */
export function canonicalMaterializePlan(input,allocations,{several=false}={}){
  if(!Array.isArray(input)||input.length<(several?0:1)||input.length>(several?200:100)||!Array.isArray(allocations))fail();
  const entries=Array.from(input,row=>{
    exact(row,['loanId','chargeId','chargeDate','principalDue','interestDue']);
    const loanId=id(row.loanId),chargeDate=date(row.chargeDate),principalDue=whole(row.principalDue),interestDue=whole(row.interestDue);
    if(row.chargeId!=='cg8:'+Array.from(loanId).length+':'+loanId+':'+chargeDate||BigInt(principalDue)+BigInt(interestDue)===0n)fail();
    // A booked charge starts at late 0 (an 8-key v11 line expects late 0).
    if(!allocations.some(line=>line.chargeId===row.chargeId&&line.chargeDate===chargeDate&&line.expectedPrincipalRemaining===principalDue&&line.expectedInterestRemaining===interestDue&&(line.expectedLateChargeRemaining??'0')==='0'))fail();
    return {loanId,chargeId:row.chargeId,chargeDate,principalDue,interestDue};
  });
  if((!several&&new Set(entries.map(row=>row.loanId)).size!==entries.length)||new Set(entries.map(row=>row.chargeId)).size!==entries.length)fail();
  entries.sort((a,b)=>Buffer.compare(Buffer.from(a.chargeId,'utf8'),Buffer.from(b.chargeId,'utf8')));
  return freeze(entries);
}
/**
 * R110 v10 principal: 0 to 20 entries {loanId, kind, chargeId, chargeDate, amount, accruedInterest, principalDue}, one per
 * loan, sorted by loanId byte order. kind "raise" raises the Principal Due of the loan's charge dated chargeDate to
 * principalDue (accruedInterest "0"); kind "book" books that day's charge pf121:<length in code points>:<loan>:<date> with
 * principalDue = amount and the accrued interest. Each is paid by an allocation line of that charge with at least the amount
 * as principal. R113: kind "settle" closes the loan with its Loan Close quote (chargeId the quote's target charge, amount the
 * payoff remainder, accruedInterest the gap interest, principalDue the outstanding principal). The server recomputes the
 * whole plan (pwa_pay_forward_plan_v1) and requires this to equal it.
 */
export function canonicalPrincipalPlan(input,allocations){
  if(!Array.isArray(input)||input.length>20||!Array.isArray(allocations))fail();
  const entries=Array.from(input,row=>{
    exact(row,['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue']);
    const loanId=id(row.loanId),chargeId=id(row.chargeId),chargeDate=date(row.chargeDate),amount=whole(row.amount),accruedInterest=whole(row.accruedInterest),principalDue=whole(row.principalDue);
    if(/[,\s]/u.test(chargeId)||amount==='0'||!['raise','book','settle'].includes(row.kind))fail();
    if(row.kind==='book'&&(chargeId!=='pf121:'+Array.from(loanId).length+':'+loanId+':'+chargeDate||principalDue!==amount))fail();
    if(row.kind==='raise'&&(accruedInterest!=='0'||BigInt(principalDue)<BigInt(amount)))fail();
    // R113 settle: the loan's Loan Close quote (target charge, payoff remainder, gap interest, outstanding principal); its
    // lines are the quote's, so no single line carries the amount.
    if(row.kind!=='settle'&&!allocations.some(line=>line.chargeId===chargeId&&line.chargeDate===chargeDate&&BigInt(line.principal)>=BigInt(amount)))fail();
    return {loanId,kind:row.kind,chargeId,chargeDate,amount,accruedInterest,principalDue};
  });
  if(new Set(entries.map(row=>row.loanId)).size!==entries.length)fail();
  entries.sort((a,b)=>Buffer.compare(Buffer.from(a.loanId,'utf8'),Buffer.from(b.loanId,'utf8')));
  return freeze(entries);
}
/**
 * R110: a v10 (R118: or v11) command with a materialize or principal entry is dated the business day (the plan is today's); other
 * commands are not restricted here. Pure: the caller supplies the business date.
 */
export function payForwardDayAllowed(command,businessDate){
  if(![10,11].includes(command?.schemaVersion))return true;
  return (command.materialize.length===0&&command.principal.length===0)||command.paymentDate===businessDate;
}
/** R075 v7 slip fields (also v8 to v11): printed bank reference (spaces/dashes removed, upper case) or null. */
function bankReference(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 400) fail();
  const normalized = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,100}$/.test(normalized)) fail();
  return normalized;
}
/** R075 v7 slip transfer time as HH:MM (seconds dropped, as the agent receipt command does) or null. */
function transferTime(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) fail();
  return value.slice(0, 5);
}
export function canonicalCommand(input) {
  if([6,7,8,9,10,11].includes(input?.schemaVersion)){
    // R095 v8 = v7 plus payerLines (null or the payer-lines change {before, after}, Bank Transfer only).
    // R101 v9 = v8 plus materialize (the next projected charges to book), set last.
    // R110 v10 = v8 plus materialize (several per loan, may be empty) and principal; at least one entry in the two.
    // R118 v11 = the v10 keys with 8-key allocation lines (the late charge); materialize and principal may both be empty.
    const v7=input.schemaVersion>=7,v8=input.schemaVersion>=8,v9=input.schemaVersion===9,v10=input.schemaVersion>=10,v11=input.schemaVersion===11;
    exact(input,['schemaVersion','requestId','borrowerId','allocations','cashAccountId','paymentDate','amountReceived','paymentMethod','notes','receiptId',...(v7?['bankReference','transferTime']:[]),...(v8?['payerLines']:[]),...(v9||v10?['materialize']:[]),...(v10?['principal']:[])]);
    const allocations=canonicalAllocationPlan(input.amountReceived,input.allocations,{late:v11});
    if(!['Bank Transfer','Cash','Net-off at Disbursement'].includes(input.paymentMethod) || !(input.notes===null || (typeof input.notes==='string'&&input.notes.isWellFormed()&&!input.notes.includes('\0')&&Buffer.byteLength(input.notes,'utf8')<=65536)))fail();
    const command={schemaVersion:input.schemaVersion,requestId:requestId(input.requestId),borrowerId:id(input.borrowerId),allocations,cashAccountId:id(input.cashAccountId),paymentDate:date(input.paymentDate),amountReceived:input.amountReceived,paymentMethod:input.paymentMethod,notes:input.notes===''?null:input.notes,receiptId:input.receiptId===null?null:requestId(input.receiptId)};
    if(v7){
      // Slip fields describe a bank transfer only; any other method carries neither.
      const reference=bankReference(input.bankReference),time=transferTime(input.transferTime);
      if(input.paymentMethod!=='Bank Transfer'&&(reference!==null||time!==null))fail();
      Object.assign(command,{bankReference:reference,transferTime:time});
      if(v8){
        if(!validPayerLines(input.payerLines)||(input.paymentMethod!=='Bank Transfer'&&input.payerLines!==null))fail();
        command.payerLines=input.payerLines===null?null:{before:input.payerLines.before,after:input.payerLines.after};
        if(v9)command.materialize=canonicalMaterializePlan(input.materialize,allocations);
        if(v10){
          command.materialize=canonicalMaterializePlan(input.materialize,allocations,{several:true});
          command.principal=canonicalPrincipalPlan(input.principal,allocations);
          if(!v11&&!command.materialize.length&&!command.principal.length)fail();
        }
      }
    }
    return freeze(command);
  }

  exact(input, ['schemaVersion', 'requestId', 'borrowerId', 'selectedChargeIds', 'cashAccountId', 'paymentDate', 'amountReceived', 'paymentMethod', 'allocationMethod', 'notes', 'receiptId']);
  if (![3, 4, 5].includes(input.schemaVersion) || !Array.isArray(input.selectedChargeIds) || input.selectedChargeIds.length < 1 || input.selectedChargeIds.length > (input.schemaVersion >= 4 ? 10000 : 100)) fail();
  const selectedChargeIds = Array.from(input.selectedChargeIds, value => { const result = id(value); if (/[,\s]/u.test(result)) fail(); return result; });
  if (new Set(selectedChargeIds).size !== selectedChargeIds.length) fail();
  selectedChargeIds.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  if (typeof input.amountReceived !== 'string' || !/^[1-9][0-9]{0,16}$/.test(input.amountReceived) || BigInt(input.amountReceived) > 92233720368547758n || !(input.schemaVersion === 5 ? ['Bank Transfer', 'Cash', 'Net-off at Disbursement'] : ['Bank Transfer']).includes(input.paymentMethod) || !(input.schemaVersion >= 4 ? ['Selected Charges', 'Single Full', 'Receive All'] : ['Selected Charges']).includes(input.allocationMethod)) fail();
  if (input.allocationMethod === 'Single Full' && selectedChargeIds.length !== 1) fail();
  if (!(input.notes === null || (typeof input.notes === 'string' && input.notes.isWellFormed() && !input.notes.includes('\0') && Buffer.byteLength(input.notes, 'utf8') <= 65536))) fail();
  return freeze({ schemaVersion: input.schemaVersion, requestId: requestId(input.requestId), borrowerId: id(input.borrowerId), selectedChargeIds, cashAccountId: id(input.cashAccountId), paymentDate: date(input.paymentDate), amountReceived: input.amountReceived, paymentMethod: input.paymentMethod, allocationMethod: input.allocationMethod, notes: input.notes === '' ? null : input.notes, receiptId: input.receiptId === null ? null : requestId(input.receiptId) });
}
export function canonicalActor(input) {
  exact(input, ['issuer', 'subject', 'partnerId', 'loginEmail']);
  const email = text(input.loginEmail, 1024).trim().toLowerCase();
  if (Buffer.byteLength(email, 'utf8') > 320) fail();
  return freeze({ issuer: text(input.issuer, 1024), subject: text(input.subject, 128), partnerId: id(input.partnerId), loginEmail: email });
}
export function canonicalReceipt(input) {
  if (input === null) return null;
  exact(input, ['receiptId', 'sha256', 'mimeType', 'sizeBytes', 'storageReference']);
  if (typeof input.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.sha256) || !['image/jpeg', 'image/png'].includes(input.mimeType) || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 5242880) fail();
  // Opaque trusted adapter output. Validation here proves neither ownership nor storage access.
  return freeze({ receiptId: requestId(input.receiptId), sha256: input.sha256, mimeType: input.mimeType, sizeBytes: input.sizeBytes, storageReference: text(input.storageReference, 2048) });
}
export function commandIdentity(commandInput, actorInput, receiptInput) {
  const command = canonicalCommand(commandInput), actor = canonicalActor(actorInput), receipt = canonicalReceipt(receiptInput);
  if (command.receiptId !== (receipt?.receiptId ?? null)) fail();
  const canonicalJson = JSON.stringify({ contractVersion: 1, command, actor, receipt });
  if (Buffer.byteLength(canonicalJson, 'utf8') > 524288) fail();
  return freeze({ requestId: command.requestId, canonicalJson, payloadSha256: digest(canonicalJson) });
}
