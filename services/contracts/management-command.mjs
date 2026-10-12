import {validBorrowerId} from '../business/borrowers.mjs';
export const managementOperations=Object.freeze(['cash-holder','cash-account','partner'].flatMap(kind=>['create','update','delete'].map(action=>`${kind}.${action}`)));
const fields={
 'cash-holder':['holderName','active','sortOrder'],
 'cash-account':['cashHolderId','accountLabel','bankName','accountNumber','alternativeAccountNumber','defaultAccount','active','sortOrder'],
 partner:['partnerName','partnerRole','loginEmail','email','instagramUsername','languagePreference','igIntegrationEnabled','aiReviewer'],
};
const text=value=>value===null||(typeof value==='string'&&value.isWellFormed()&&!value.includes('\0')&&Buffer.byteLength(value)<=65536);
/** Closed source inputs only; source constraints and actor checks remain authoritative in SQL. */
export function canonicalManagementFields(operation,input){
 if(!managementOperations.includes(operation)||!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_request');
 const [kind,action]=operation.split('.');
 const keys=action==='delete'?[]:fields[kind].filter(key=>!(kind==='cash-account'&&action==='update'&&key==='cashHolderId'));
 if(Object.keys(input).sort().join(',')!==keys.slice().sort().join(','))throw Error('invalid_request');
 const result={};for(const key of keys){const value=input[key];
  if(['active','defaultAccount','aiReviewer'].includes(key)){if(typeof value!=='boolean')throw Error('invalid_request');}
  else if(key==='igIntegrationEnabled'){if(value!==null&&typeof value!=='boolean')throw Error('invalid_request');}
  else if(key==='sortOrder'){if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('invalid_request');}
  else if(!text(value))throw Error('invalid_request');
  if(['holderName','accountLabel','bankName','partnerName','partnerRole'].includes(key)&&(typeof value!=='string'||!value.trim()))throw Error('invalid_request');
  if(key==='cashHolderId'&&!validBorrowerId(value))throw Error('invalid_request');
  if(key==='partnerRole'&&!['A','B'].includes(value))throw Error('invalid_request');
  if(key==='languagePreference'&&value!==null&&!['English','ไทย'].includes(value))throw Error('invalid_request');
  if(key==='loginEmail'&&value!==null&&(!value.trim()||Buffer.byteLength(value)>320||/[\r\n]/.test(value)))throw Error('invalid_request');
  if(key==='email'&&value!==null&&value.trim()&&value.trim().toLowerCase()!=='welct0407@mw-credit.com')throw Error('invalid_request');
  result[key]=value;
 }return result;
}
