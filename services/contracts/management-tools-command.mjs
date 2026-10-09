import {validBorrowerId} from '../business/borrowers.mjs';
export const managementToolOperations=Object.freeze(['cash-openings.initialize','assessment.create','assessment.update','assessment.refresh','assessment.delete','analytics.refresh']);
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const text=v=>v===null||(typeof v==='string'&&v.isWellFormed()&&!v.includes('\0')&&Buffer.byteLength(v)<=65536);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='0001-01-01'&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function canonicalManagementToolFields(operation,input){
 if(!managementToolOperations.includes(operation))throw Error('invalid_request');
 if(['assessment.refresh','assessment.delete'].includes(operation)){if(!shape(input,[]))throw Error('invalid_request');return {}}
 if(operation==='analytics.refresh'){if(!shape(input,['mode'])||!['Recent','Full'].includes(input.mode))throw Error('invalid_request');return {mode:input.mode}}
 if(operation==='cash-openings.initialize'){if(!shape(input,['openings','reviewedBasisHash','notes'])||!Array.isArray(input.openings)||input.openings.length<1||input.openings.length>10000||! /^[a-f0-9]{64}$/.test(input.reviewedBasisHash??'')||!text(input.notes)||!input.notes?.trim())throw Error('invalid_request');const seen=new Set(),openings=input.openings.map(row=>{if(!shape(row,['accountId','amount'])||!validBorrowerId(row.accountId)||seen.has(row.accountId)||typeof row.amount!=='string'||! /^(0|-?[1-9][0-9]*)$/.test(row.amount)||row.amount.length>65536)throw Error('invalid_request');seen.add(row.accountId);return {accountId:row.accountId,amount:row.amount}}).sort((a,b)=>Buffer.compare(Buffer.from(a.accountId),Buffer.from(b.accountId)));return {openings,reviewedBasisHash:input.reviewedBasisHash,notes:input.notes}}
 const keys=['assessmentId','borrowerId','proposedLoanAmount','minimumDailyProfitRate','forecastStart','forecastEnd'];if(!shape(input,keys)||!keys.every(key=>text(input[key]))||(input.borrowerId!==null&&!validBorrowerId(input.borrowerId))||!day(input.forecastStart)||!day(input.forecastEnd))throw Error('invalid_request');
 if(input.proposedLoanAmount!==null){const v=input.proposedLoanAmount;if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(v))throw Error('invalid_request');const [whole,fraction='']=v.split('.');if(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))>9223372036854775807n)throw Error('invalid_request')}
 if(input.minimumDailyProfitRate!==null&&(!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(input.minimumDailyProfitRate)||!Number.isFinite(Number(input.minimumDailyProfitRate))||Number(input.minimumDailyProfitRate)>3.4028234663852886e38))throw Error('invalid_request');
 return Object.fromEntries(keys.map(key=>[key,input[key]]));
}
