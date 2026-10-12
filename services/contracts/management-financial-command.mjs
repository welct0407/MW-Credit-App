import {validBorrowerId} from '../business/borrowers.mjs';
const fields={
 'capital-contribution':['partnerId','contributionDate','transactionType','amount','notes'],
 settlement:['settlementDate','partnerId','amount','status','transferDate','notes','cashAccountId'],
 'cash-movement':['movementDate','movementType','amount','fromAccountId','toAccountId','businessExpenseId','notes'],
};
export const managementFinancialOperations=Object.freeze([...Object.keys(fields).flatMap(kind=>['create','update','delete'].map(action=>`${kind}.${action}`)).filter(op=>op!=='settlement.delete'),'settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all']);
const validMoney=value=>{if(typeof value!=='string'||!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))return false;const [whole,fraction='']=value.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return cents>0n&&cents<=9223372036854775807n};
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function canonicalManagementFinancialFields(operation,input){
 if(!managementFinancialOperations.includes(operation)||!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_request');
 const [kind,action]=operation.split('.'),keys=['delete','reverse','cancel'].includes(action)?[]:action==='complete'?['cashAccountId']:action==='settle-all'?['partnerId','reviewedAmount','notes']:fields[kind];
 if(Object.keys(input).sort().join(',')!==keys.slice().sort().join(','))throw Error('invalid_request');
 const result={};for(const key of keys){const value=input[key];if(value!==null&&(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>65536))throw Error('invalid_request');
 if(key.endsWith('Id')&&value!==null&&!validBorrowerId(value))throw Error('invalid_request');
 if(key==='partnerId'&&value===null)throw Error('invalid_request');
 if(key.endsWith('Date')&&!(key==='transferDate'&&value===null)&&!day(value))throw Error('invalid_request');
 if(['amount','reviewedAmount'].includes(key)&&!validMoney(value))throw Error('invalid_request');
 if(kind==='cash-movement'&&key==='amount'&&!/^[1-9][0-9]*$/.test(value))throw Error('invalid_request');
 if(key==='transactionType'&&!['Contribution','Withdrawal'].includes(value))throw Error('invalid_request');
 if(key==='movementType'&&!['Cash Handover','Expense Reimbursement'].includes(value))throw Error('invalid_request');
 if(key==='status'&&!['Pending','Completed','Cancelled'].includes(value))throw Error('invalid_request');
 result[key]=value;
 }return result;
}
