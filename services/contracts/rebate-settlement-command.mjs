import {validBorrowerId} from '../business/borrowers.mjs';
/**
 * R129 (V137) rebate settlement operations: rebate-settlement.create pays whole pending referral rebates of one referrer in
 * one cash movement out of Lisa; rebate-settlement.delete returns them to pending. The SQL twin is the rebate-settlement
 * branch of pwa_submit_operation_v2 (the same rules and the same canonical key order, byte for byte).
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
export function canonicalRebateSettlementFields(operation,input){
 if(operation==='rebate-settlement.delete'){if(!shape(input,[]))throw Error('invalid_request');return {};}
 if(operation!=='rebate-settlement.create'||!shape(input,rebateSettlementFields))throw Error('invalid_request');
 const v=input,ids=v.expenseIds;
 if(!validBorrowerId(v.referrerId)||!validBorrowerId(v.cashAccountId)||!day(v.settlementDate)||!rebateSettlementMethods.includes(v.paymentMethod))throw Error('invalid_request');
 if(!Array.isArray(ids)||ids.length<1||ids.length>REBATE_SETTLEMENT_MAX_EXPENSES||!ids.every(validBorrowerId))throw Error('invalid_request');
 for(let k=1;k<ids.length;k++)if(Buffer.compare(Buffer.from(ids[k-1]),Buffer.from(ids[k]))>=0)throw Error('invalid_request');
 if(v.bankReference!==null&&(!validBankReference(v.bankReference)||v.paymentMethod!=='Bank Transfer'))throw Error('invalid_request');
 if(v.notes!==null&&(typeof v.notes!=='string'||!v.notes.isWellFormed()||v.notes.includes('\0')||Buffer.byteLength(v.notes)>65536))throw Error('invalid_request');
 return {referrerId:v.referrerId,expenseIds:[...ids],settlementDate:v.settlementDate,cashAccountId:v.cashAccountId,paymentMethod:v.paymentMethod,bankReference:v.bankReference,notes:v.notes};
}
