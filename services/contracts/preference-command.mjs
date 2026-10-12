import {validBorrowerId} from '../business/borrowers.mjs';
/** The operation wrapper must additionally bind targetId to the current mapped Partner. */
export function canonicalPreferenceFields(input){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='language,statementAccountId,statementDate'||!['English','ไทย'].includes(input.language)||(input.statementAccountId!==null&&!validBorrowerId(input.statementAccountId)))throw Error('invalid_request');
 const value=input.statementDate;if(value!==null&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw Error('invalid_request');
 return {language:input.language,statementAccountId:input.statementAccountId,statementDate:value};
}
