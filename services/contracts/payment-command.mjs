import { createHash } from 'node:crypto';

// Pure candidate contract only. These functions authenticate nobody and persist nothing.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
export function canonicalCommand(input) {
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
function validIdentity(input) {
  exact(input, ['requestId', 'canonicalJson', 'payloadSha256']);
  if (requestId(input.requestId) !== input.requestId || typeof input.canonicalJson !== 'string' || Buffer.byteLength(input.canonicalJson, 'utf8') > 524288 || !input.canonicalJson.isWellFormed() || typeof input.payloadSha256 !== 'string' || digest(input.canonicalJson) !== input.payloadSha256) fail();
  const parsed = JSON.parse(input.canonicalJson);
  exact(parsed, ['contractVersion', 'command', 'actor', 'receipt']);
  if (parsed.contractVersion !== 1) fail();
  const canonical = commandIdentity(parsed.command, parsed.actor, parsed.receipt);
  if (canonical.requestId !== input.requestId || canonical.canonicalJson !== input.canonicalJson || canonical.payloadSha256 !== input.payloadSha256) fail();
  return canonical;
}
function outcome(input) {
  exact(input, ['status', 'paymentId', 'code', 'recordedAt']);
  if (!['posted', 'rejected'].includes(input.status)) fail();
  const paymentId = input.paymentId === null ? null : id(input.paymentId);
  const code = input.code === null ? null : text(input.code, 256);
  if ((input.status === 'posted' && (paymentId === null || code !== null)) || (input.status === 'rejected' && (paymentId !== null || code === null))) fail();
  if (typeof input.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.recordedAt) || !Number.isFinite(Date.parse(input.recordedAt))) fail();
  date(input.recordedAt.slice(0, 10));
  if (Number(input.recordedAt.slice(11, 13)) > 23 || Number(input.recordedAt.slice(14, 16)) > 59 || Number(input.recordedAt.slice(17, 19)) > 59) fail();
  return { status: input.status, paymentId, code, recordedAt: input.recordedAt };
}
export function classifyReplay(stored, incomingIdentity) {
  const incoming = validIdentity(incomingIdentity);
  if (stored === null) return freeze({ kind: 'unresolved' });
  let original, originalOutcome;
  try {
    exact(stored, ['requestId', 'canonicalJson', 'payloadSha256', 'outcome']);
    original = validIdentity({ requestId: stored.requestId, canonicalJson: stored.canonicalJson, payloadSha256: stored.payloadSha256 });
    originalOutcome = outcome(stored.outcome);
  } catch { fail('invalid_stored_record'); }
  if (original.requestId !== incoming.requestId || original.canonicalJson !== incoming.canonicalJson || original.payloadSha256 !== incoming.payloadSha256) return freeze({ kind: 'conflict' });
  return freeze({ kind: 'replay', originalOutcome });
}
