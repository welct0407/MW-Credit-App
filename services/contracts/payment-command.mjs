import { createHash } from 'node:crypto';

// Pure candidate contract only. These functions authenticate nobody and persist nothing.
import { UUID_V4_ANY_CASE as uuid } from '../lib/ids.mjs';
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
export function canonicalAllocationPlan(amountReceived, input) {
  whole(amountReceived); if (amountReceived==='0' || !Array.isArray(input) || input.length<1 || input.length>10000) fail();
  const allocations=Array.from(input,row=>{
    exact(row,['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate']);
    const chargeId=id(row.chargeId); if (/[,\s]/u.test(chargeId)) fail();
    const principal=whole(row.principal),interest=whole(row.interest),expectedPrincipalRemaining=whole(row.expectedPrincipalRemaining),expectedInterestRemaining=whole(row.expectedInterestRemaining);
    if(BigInt(principal)+BigInt(interest)===0n || BigInt(principal)>BigInt(expectedPrincipalRemaining) || BigInt(interest)>BigInt(expectedInterestRemaining)) fail();
    return {chargeId,principal,interest,expectedPrincipalRemaining,expectedInterestRemaining,chargeDate:date(row.chargeDate)};
  });
  if(new Set(allocations.map(row=>row.chargeId)).size!==allocations.length || allocations.reduce((sum,row)=>sum+BigInt(row.principal)+BigInt(row.interest),0n)!==BigInt(amountReceived))fail();
  allocations.sort((a,b)=>Buffer.compare(Buffer.from(a.chargeId,'utf8'),Buffer.from(b.chargeId,'utf8')));
  return freeze(allocations);
}
export function canonicalCommand(input) {
  if(input?.schemaVersion===6){
    exact(input,['schemaVersion','requestId','borrowerId','allocations','cashAccountId','paymentDate','amountReceived','paymentMethod','notes','receiptId']);
    const allocations=canonicalAllocationPlan(input.amountReceived,input.allocations);
    if(!['Bank Transfer','Cash','Net-off at Disbursement'].includes(input.paymentMethod) || !(input.notes===null || (typeof input.notes==='string'&&input.notes.isWellFormed()&&!input.notes.includes('\0')&&Buffer.byteLength(input.notes,'utf8')<=65536)))fail();
    return freeze({schemaVersion:6,requestId:requestId(input.requestId),borrowerId:id(input.borrowerId),allocations,cashAccountId:id(input.cashAccountId),paymentDate:date(input.paymentDate),amountReceived:input.amountReceived,paymentMethod:input.paymentMethod,notes:input.notes===''?null:input.notes,receiptId:input.receiptId===null?null:requestId(input.receiptId)});
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
