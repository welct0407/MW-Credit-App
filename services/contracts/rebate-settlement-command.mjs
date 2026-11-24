import {validBorrowerId} from '../business/borrowers.mjs';
/**
 * R129 (V137) and R184 (V155) rebate settlement operations: rebate-settlement.create pays an amount toward each named pending
 * referral rebate of one referrer, either to the referrer (one cash movement out of Lisa) or as an offset to the referrer's own
 * loan; rebate-settlement.delete returns the amounts to pending. The SQL twin is the rebate-settlement branch of
 * pwa_submit_operation_v2 (the same rules and the same canonical key order, byte for byte).
 * Two create shapes are canonical: the nine-key shape of V155 (`allocations`, `destination`, `expectedPlanHash`) and the
 * seven-key shape of V137 (`expenseIds`: each named rebate's whole pending amount, paid to the referrer), which an un-updated
 * phone still sends.
 */
export const rebateSettlementOperations=Object.freeze(['rebate-settlement.create','rebate-settlement.delete']);
export const rebateSettlementFields=Object.freeze(['referrerId','expenseIds','settlementDate','cashAccountId','paymentMethod','bankReference','notes']);
export const rebateSettlementMethods=Object.freeze(['Bank Transfer','Cash']);
export const REBATE_SETTLEMENT_MAX_EXPENSES=200;
/** The ascending order the command requires (UTF-8 byte order, the SQL COLLATE "C" comparison); duplicates are removed. */
export const sortedExpenseIds=ids=>[...new Set(ids)].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const shape=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
/** A bank reference: 1 to 256 bytes, not blank, one line, no NUL (the V136 loan.close rule). */
export const validBankReference=value=>typeof value==='string'&&value.isWellFormed()&&!!value.trim()&&Buffer.byteLength(value)<=256&&!/[\0\r\n]/.test(value);
/** R184 (V155): the nine keys of the create command, in canonical order, and its two destinations. */
export const rebateSettlementAllocationFields=Object.freeze(['referrerId','destination','allocations','settlementDate','cashAccountId','paymentMethod','bankReference','notes','expectedPlanHash']);
export const rebateSettlementDestinations=Object.freeze(['referrer','offset']);
/** A whole-baht amount of a line: a string of 1 to 12 digits without a leading zero (at least 1). */
export const validSettlementAmount=value=>typeof value==='string'&&/^[1-9][0-9]{0,11}$/.test(value);
const notes=value=>value===null||(typeof value==='string'&&value.isWellFormed()&&!value.includes('\0')&&Buffer.byteLength(value)<=65536);
export function canonicalRebateSettlementFields(operation,input){
 if(operation==='rebate-settlement.delete'){if(!shape(input,[]))throw Error('invalid_request');return {};}
 if(operation!=='rebate-settlement.create'||!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_request');
 const v=input;
 if(Object.hasOwn(v,'allocations')){
  // R184: per-rebate lines {expenseId, amount, expectedPending}, ascending by expense id; the destination decides the rest.
  if(!shape(v,rebateSettlementAllocationFields)||!validBorrowerId(v.referrerId)||!rebateSettlementDestinations.includes(v.destination)||!day(v.settlementDate)||!notes(v.notes))throw Error('invalid_request');
  const lines=v.allocations;
  if(!Array.isArray(lines)||lines.length<1||lines.length>REBATE_SETTLEMENT_MAX_EXPENSES
   ||!lines.every(line=>shape(line,['expenseId','amount','expectedPending'])&&validBorrowerId(line.expenseId)&&validSettlementAmount(line.amount)&&validSettlementAmount(line.expectedPending)))throw Error('invalid_request');
  for(let k=1;k<lines.length;k++)if(Buffer.compare(Buffer.from(lines[k-1].expenseId),Buffer.from(lines[k].expenseId))>=0)throw Error('invalid_request');
  if(v.destination==='offset'){
   if(v.cashAccountId!==null||v.paymentMethod!==null||v.bankReference!==null||typeof v.expectedPlanHash!=='string'||!/^[a-f0-9]{64}$/.test(v.expectedPlanHash))throw Error('invalid_request');
  }else if(!validBorrowerId(v.cashAccountId)||!rebateSettlementMethods.includes(v.paymentMethod)||v.expectedPlanHash!==null
   ||(v.bankReference!==null&&(!validBankReference(v.bankReference)||v.paymentMethod!=='Bank Transfer')))throw Error('invalid_request');
  return {referrerId:v.referrerId,destination:v.destination,allocations:lines.map(line=>({expenseId:line.expenseId,amount:line.amount,expectedPending:line.expectedPending})),settlementDate:v.settlementDate,
   cashAccountId:v.cashAccountId,paymentMethod:v.paymentMethod,bankReference:v.bankReference,notes:v.notes,expectedPlanHash:v.expectedPlanHash};
 }
 if(!shape(v,rebateSettlementFields))throw Error('invalid_request');
 const ids=v.expenseIds;
 if(!validBorrowerId(v.referrerId)||!validBorrowerId(v.cashAccountId)||!day(v.settlementDate)||!rebateSettlementMethods.includes(v.paymentMethod))throw Error('invalid_request');
 if(!Array.isArray(ids)||ids.length<1||ids.length>REBATE_SETTLEMENT_MAX_EXPENSES||!ids.every(validBorrowerId))throw Error('invalid_request');
 for(let k=1;k<ids.length;k++)if(Buffer.compare(Buffer.from(ids[k-1]),Buffer.from(ids[k]))>=0)throw Error('invalid_request');
 if(v.bankReference!==null&&(!validBankReference(v.bankReference)||v.paymentMethod!=='Bank Transfer'))throw Error('invalid_request');
 if(!notes(v.notes))throw Error('invalid_request');
 return {referrerId:v.referrerId,expenseIds:[...ids],settlementDate:v.settlementDate,cashAccountId:v.cashAccountId,paymentMethod:v.paymentMethod,bankReference:v.bankReference,notes:v.notes};
}
