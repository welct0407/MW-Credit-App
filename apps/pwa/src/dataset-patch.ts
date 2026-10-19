/** Offline dataset patch application, shared by the coordinator (offline-dataset.ts) and the lab equality
 * proofs (tests/integration, which transpile this file): one implementation, so a client applying a
 * protocol v4 delta ends byte-equal to a fresh walk of the same database. No imports, no I/O. */

/** PostgreSQL COLLATE "C" order for text: compare by Unicode code point (UTF-8 byte order). */
export function codePointCompare(a:string,b:string){
 const x=[...a],y=[...b];
 for(let index=0;index<Math.min(x.length,y.length);index++){const left=x[index].codePointAt(0)!,right=y[index].codePointAt(0)!;if(left!==right)return left<right?-1:1}
 return x.length-y.length;
}
const forbidden=['__proto__','prototype','constructor'];
/** Applies one hydrated patch in place. Modes: append, merge, replace; protocol v4 adds upsert (rows by id,
 * then the walk's row order when the patch names one: order 'id' = "Row ID" COLLATE "C") and remove (rows whose
 * `by` field, default id, is listed; or the listed keys of an object). Throws on any malformed patch. */
export function applyDatasetPatch(data:any,patch:any){
 const path=[patch?.key,...(patch?.path??[])];
 if(!patch||!Array.isArray(patch.path??[])||path.some(key=>typeof key!=='string'||forbidden.includes(key)))throw Error('Invalid dataset patch');
 let target=data;
 for(const key of path.slice(0,-1)){if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error('Invalid dataset patch');if(target[key]===undefined)target[key]={};if(!target[key]||typeof target[key]!=='object')throw Error('Invalid dataset patch');target=target[key]}
 const key=path.at(-1)!;if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error('Invalid dataset patch');
 if(patch.mode==='append'){if(!Array.isArray(patch.value)||target[key]!==undefined&&!Array.isArray(target[key]))throw Error('Invalid dataset patch');target[key]=[...(target[key]??[]),...patch.value]}
 else if(patch.mode==='merge'){if(!patch.value||Array.isArray(patch.value)||typeof patch.value!=='object')throw Error('Invalid dataset patch');target[key]={...target[key],...patch.value}}
 else if(patch.mode==='replace')target[key]=patch.value;
 else if(patch.mode==='upsert'){
  if(!Array.isArray(patch.value)||patch.value.some((row:any)=>typeof row?.id!=='string')||target[key]!==undefined&&!Array.isArray(target[key])||patch.order!==undefined&&patch.order!=='id')throw Error('Invalid dataset patch');
  const rows=[...(target[key]??[])],at=new Map(rows.map((row:any,index:number)=>[row?.id,index]));
  for(const row of patch.value){const index=at.get(row.id);if(index===undefined){at.set(row.id,rows.length);rows.push(row)}else rows[index]=row}
  if(patch.order==='id')rows.sort((a:any,b:any)=>codePointCompare(String(a?.id??''),String(b?.id??'')));
  target[key]=rows;
 }
 else if(patch.mode==='remove'){
  const by=patch.by??'id';if(!Array.isArray(patch.value)||typeof by!=='string'||!/^[A-Za-z]+$/.test(by))throw Error('Invalid dataset patch');
  const drop=new Set(patch.value.map((item:any)=>JSON.stringify(item??null))),current=target[key];
  if(Array.isArray(current))target[key]=current.filter((row:any)=>!drop.has(JSON.stringify(row?.[by]??null)));
  else if(current&&typeof current==='object')for(const name of patch.value)if(typeof name==='string'&&!forbidden.includes(name))delete current[name];
 }
 else throw Error('Invalid dataset patch');
}
const ids=(rows:any)=>JSON.stringify((Array.isArray(rows)?rows:[]).map((row:any)=>row?.chargeId??null).sort());
/** A v4 delta re-sends every changed row with its current owner, but cannot re-read the owner a row left (the
 * change log has no old values). The client still holds the old rows: when a re-sent row moved (a loan or
 * charge to another owner, a payment to another borrower, target or charge set), the delta is not applied and
 * the domain walks instead. patches are hydrated (value present). */
export function deltaMovesRows(data:any,patches:any[]){
 const fields:Record<string,(row:any)=>unknown[]>={
  loans:row=>[row?.borrowerId],
  charges:row=>[row?.loanId,row?.borrowerId],
  payments:row=>[row?.borrowerId,row?.targetLoanId,row?.targetChargeId,ids(row?.allocations),ids(row?.repayments)],
 };
 for(const patch of patches){
  const owner=fields[patch?.key];if(!owner||patch.mode!=='upsert'||patch.path?.length)continue;
  const old=new Map((Array.isArray(data?.[patch.key])?data[patch.key]:[]).map((row:any)=>[row?.id,row]));
  for(const row of patch.value??[]){const before=old.get(row?.id);if(before&&JSON.stringify(owner(before))!==JSON.stringify(owner(row)))return true}
 }
 return false;
}
