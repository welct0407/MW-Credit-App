import {businessDateTime} from '../lib/business-date.mjs';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const literals=new Set(['ยังไม่ปิดยอด','Processing','Bank Transfer','Lump Sum','Manual','Contribution','Pending']);
// Reviewed expressions are migration inputs only. Runtime never evaluates formulas.
const reviewedResolvers=new Map([
 ['5a791787f87132874c3295f70e2b13688ed47e2ba29226b724c6f9564e11ab55','borrower-receiving-account'],
 ['964c41d078f8fa73e525d2e1bd133c2c723e18120e8771cc639d12f68e17590b','disbursement-account'],
 ['2651a59ead7fb263da8b5609831687f46a626604c5ebc09dc826313495bacd57','loan-receiving-account'],
 ['1001ede1c3ae8eb3a13308d931ac7d4aeec836664e3e5ac1fc454292b970bd84','charge-receiving-account'],
 ['6aad0f0d900ce80162239d227905ce11af5224e01e1529d7edadde8e9e45d6f0','payment-receiving-holder'],
 ['974b7ab77dd7b5a434d60cf8966e47bf1789a0a1dd587ae89361c42b992c89a1','payment-receiving-account'],
 ['cf797b4d96083dafe2942f67f1b46d53df8d697f3328eeff0e6114b744a29fd5','expense-paying-account'],
 ['7adb781cb66468247ca0a0fb5b0fa0dd7b13892cc4d70ece22a52634bf6a4171','ledger-from-account'],
 ['ff6cc38d186728aa333c7c37153055693400f3a2bca721f6ff97d3b4a6877b78','ledger-to-account'],
]);
const types=new Set(['Text','LongText','Email','Ref','Enum','Date','DateTime','Yes/No','Price','Decimal','Percent','Number']);
const pending=(sourceSha256,reason='unmapped-default')=>({kind:'pending',sourceSha256,reason});

/** Source metadata classifier, not a write permission or a general expression engine. */
export function classifyNativeDefault({scope,resource,field,type,expression}){
 if(!['oltp','olap'].includes(scope)||typeof resource!=='string'||typeof field!=='string')throw Error('invalid_default_identity');
 if(expression===undefined||expression===null||expression==='')return {kind:'none'};
 const raw=String(expression),sourceSha256=hash(raw);
 if(typeof expression!=='string'||!types.has(type))return pending(sourceSha256);
 const e=raw.trim().replace(/^=/,'').trim(),base={sourceSha256,type};
 if(type==='Date'&&e==='TODAY()')return {...base,kind:'business-date'};
 if(type==='DateTime'&&e==='NOW()')return {...base,kind:'business-now'};
 if(['Email','Text','LongText'].includes(type)&&e==='USEREMAIL()')return {...base,kind:'actor-login'};
 if(type==='Text'&&/^UNIQUEID\((?:"PackedUUID"|"UUID")?\)$/.test(e))return {...base,kind:'new-id'};
 if(type==='Yes/No'&&['TRUE','FALSE'].includes(e))return {...base,kind:'literal',value:e==='TRUE'};
 if(['Price','Decimal','Percent','Number'].includes(type)&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(e)){
  if(type==='Number'&&(!Number.isSafeInteger(Number(e))||e.includes('.')))return pending(sourceSha256,'unsafe-integer-default');
  return {...base,kind:'literal',value:type==='Number'?Number(e):e};
 }
 if(['Enum','Text','LongText'].includes(type)&&e.startsWith('"')){
  let value;try{value=JSON.parse(e);}catch{return pending(sourceSha256);}
  if(literals.has(value))return {...base,kind:'literal',value};
 }
 if(type==='Date'&&e==='MAX(Cash Account Daily Summary Recent[Statement Date])')return {...base,kind:'resolver',name:'latest-statement-date'};
 if(type==='Text'&&field==='Payment Request Token'&&e==='CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|", UNIQUEID(), "|", USEREMAIL())')return {...base,kind:'resolver',name:'payment-request-token'};
 const name=reviewedResolvers.get(sourceSha256);
 if(type==='Ref'&&name)return {...base,kind:'resolver',name};
 return pending(sourceSha256);
}

function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('invalid_business_date');
 return value;
}
function bangkokNow(value){
 if(!(value instanceof Date)&&(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)))throw Error('timezone_required');
 const instant=new Date(value);if(!Number.isFinite(instant.getTime()))throw Error('invalid_business_clock');
 return businessDateTime(instant);
}
function login(actor){
 const value=actor?.loginEmail;
 if(!actor?.partnerId||typeof value!=='string'||value.length>320||!/^[^\s@]+@[^\s@]+$/.test(value))throw Error('attributed_actor_required');
 return value;
}
function fields(resource){
 if(!resource||!Array.isArray(resource.fields))throw Error('invalid_default_resource');
 const names=resource.fields.map(f=>f.name);if(names.some(x=>typeof x!=='string'||!x)||new Set(names).size!==names.length)throw Error('invalid_default_fields');
 return resource.fields;
}

/** All callbacks/context originate from the authenticated server, never caller formulas. */
async function resolve(descriptor,context,identity){
 switch(descriptor.kind){
  case 'none':return {absent:true};
  case 'pending':return {pending:descriptor.reason??'unmapped-default'};
  case 'literal':return {value:descriptor.value};
  case 'business-date':return {value:date(context.businessDate)};
  case 'business-now':return {value:bangkokNow(context.now)};
  case 'actor-login':return {value:login(context.actor)};
  case 'new-id':{
   if(typeof context.newId!=='function')return {pending:'journaled-identity-required'};
   const value=await context.newId(identity);
   if(typeof value!=='string'||!value||value.length>256||/[\u0000-\u001f]/.test(value))throw Error('invalid_default_identity');
   return {value};
  }
  case 'resolver':{
   if(![...reviewedResolvers.values(),'latest-statement-date','payment-request-token'].includes(descriptor.name))throw Error('unknown_default_resolver');
   const callback=context.resolvers?.[descriptor.name];
   if(typeof callback!=='function')return {pending:'context-required:'+descriptor.name};
   const value=await callback(identity);
   if(value===undefined)return {pending:'unresolved:'+descriptor.name};
   // Missing relationships are not inferred as null. Canonical handlers validate
   // active accounts, row ownership, defaults and explicit nullable semantics.
   if(value===null)return {pending:'unresolved:'+descriptor.name};
   if(typeof value!=='string'||!value||value.length>1024||/[\u0000-\u001f]/.test(value))throw Error('invalid_resolved_default');
   if(descriptor.type==='Date')date(value);
   return {value};
  }
  default:throw Error('unknown_default_kind');
 }
}

export async function resolveNativeDefaults(resource,context={}){
 const values={},pending=[];
 for(const field of fields(resource)){
  if(!field.default)continue;
  const result=await resolve(field.default,context,{scope:resource.scope,resource:resource.name??resource.resource,field:field.name});
  if(result.pending)pending.push({field:field.name,reason:result.pending});
  else if(!result.absent)Object.defineProperty(values,field.name,{value:result.value,enumerable:true});
 }
 return {values,pending};
}

/** Explicit null/false/zero remain explicit; canonical validators retain authority. */
export async function applyNativeDefaults(input,resource,context={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_default_input');
 const missing={...resource,fields:fields(resource).filter(f=>!Object.hasOwn(input,f.name))};
 const result=await resolveNativeDefaults(missing,context);
 if(result.pending.length)throw Object.assign(Error('native_defaults_pending'),{pending:result.pending});
 return {...result.values,...input};
}
