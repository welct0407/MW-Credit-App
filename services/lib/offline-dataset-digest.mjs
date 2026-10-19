/** R078 shared offline dataset logic, imported by the server (reconciliation) and the PWA (offline-dataset.ts,
 * through apps/pwa/src/dataset-patch.ts): patch application, the moved-row check and the reconciliation digest.
 * One implementation, so a client applying a delta ends byte-equal to a walk and both sides digest data alike.
 * Dependency-free ESM: no imports, no I/O (the SHA-256 function is passed in). */

/** PostgreSQL COLLATE "C" order for text: compare by Unicode code point (UTF-8 byte order). */
/** @param {string} a @param {string} b */
export function codePointCompare(a,b){
 const x=[...a],y=[...b];
 for(let index=0;index<Math.min(x.length,y.length);index++){const left=x[index].codePointAt(0),right=y[index].codePointAt(0);if(left!==right)return left<right?-1:1}
 return x.length-y.length;
}
const forbidden=['__proto__','prototype','constructor'];
/** Applies one hydrated patch in place. Modes: append, merge, replace; protocol v4 adds upsert (rows by id,
 * then the walk's row order when the patch names one: order 'id' = "Row ID" COLLATE "C") and remove (rows whose
 * `by` field, default id, is listed; or the listed keys of an object). Throws on any malformed patch. */
/** @param {any} data @param {any} patch */
export function applyDatasetPatch(data,patch){
 const path=[patch?.key,...(patch?.path??[])];
 if(!patch||!Array.isArray(patch.path??[])||path.some(key=>typeof key!=='string'||forbidden.includes(key)))throw Error('Invalid dataset patch');
 let target=data;
 for(const key of path.slice(0,-1)){if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error('Invalid dataset patch');if(target[key]===undefined)target[key]={};if(!target[key]||typeof target[key]!=='object')throw Error('Invalid dataset patch');target=target[key]}
 const key=path.at(-1);if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error('Invalid dataset patch');
 if(patch.mode==='append'){if(!Array.isArray(patch.value)||target[key]!==undefined&&!Array.isArray(target[key]))throw Error('Invalid dataset patch');target[key]=[...(target[key]??[]),...patch.value]}
 else if(patch.mode==='merge'){if(!patch.value||Array.isArray(patch.value)||typeof patch.value!=='object')throw Error('Invalid dataset patch');target[key]={...target[key],...patch.value}}
 else if(patch.mode==='replace')target[key]=patch.value;
 else if(patch.mode==='upsert'){
  if(!Array.isArray(patch.value)||patch.value.some((row)=>typeof row?.id!=='string')||target[key]!==undefined&&!Array.isArray(target[key])||patch.order!==undefined&&patch.order!=='id')throw Error('Invalid dataset patch');
  const rows=[...(target[key]??[])],at=new Map(rows.map((row,index)=>[row?.id,index]));
  for(const row of patch.value){const index=at.get(row.id);if(index===undefined){at.set(row.id,rows.length);rows.push(row)}else rows[index]=row}
  if(patch.order==='id')rows.sort((a,b)=>codePointCompare(String(a?.id??''),String(b?.id??'')));
  target[key]=rows;
 }
 else if(patch.mode==='replaceWhere'){
  // R078 row deltas (collection, cash): the rows whose `field` is listed are replaced by `value`, then the walk's
  // order is restored by `sort` (a field, compared like COLLATE "C"); stable, so equal sort values keep order.
  const field=patch.field,sort=patch.sort;
  if(!Array.isArray(patch.value)||!Array.isArray(patch.values)||typeof field!=='string'||!/^[A-Za-z]+$/.test(field)||sort!==undefined&&(typeof sort!=='string'||!/^[A-Za-z]+$/.test(sort))||target[key]!==undefined&&!Array.isArray(target[key])||patch.value.some((row)=>!row||typeof row!=='object'||!patch.values.some((value)=>JSON.stringify(value)===JSON.stringify(row[field]??null))))throw Error('Invalid dataset patch');
  const drop=new Set(patch.values.map((item)=>JSON.stringify(item??null))),rows=[...(target[key]??[]).filter((row)=>!drop.has(JSON.stringify(row?.[field]??null))),...patch.value];
  if(sort!==undefined){const order=rows.map((row,index)=>({row,index}));order.sort((a,b)=>codePointCompare(String(a.row?.[sort]??''),String(b.row?.[sort]??''))||a.index-b.index);target[key]=order.map(({row})=>row)}else target[key]=rows;
 }
 else if(patch.mode==='remove'){
  const by=patch.by??'id';if(!Array.isArray(patch.value)||typeof by!=='string'||!/^[A-Za-z]+$/.test(by))throw Error('Invalid dataset patch');
  const drop=new Set(patch.value.map((item)=>JSON.stringify(item??null))),current=target[key];
  if(Array.isArray(current))target[key]=current.filter((row)=>!drop.has(JSON.stringify(row?.[by]??null)));
  else if(current&&typeof current==='object')for(const name of patch.value)if(typeof name==='string'&&!forbidden.includes(name))delete current[name];
 }
 else throw Error('Invalid dataset patch');
}
const ids=rows=>JSON.stringify((Array.isArray(rows)?rows:[]).map(row=>row?.chargeId??null).sort());
/** A v4 delta re-sends every changed row with its current owner, but cannot re-read the owner a row left (the
 * change log has no old values). The client still holds the old rows: when a re-sent row moved (a loan or
 * charge to another owner, a payment to another borrower, target or charge set), the delta is not applied and
 * the domain walks instead. patches are hydrated (value present). */
/** @param {any} data @param {any[]} patches */
export function deltaMovesRows(data,patches){
 /** @type {Record<string,(row:any)=>unknown[]>} */
 const fields={
  loans:row=>[row?.borrowerId],
  charges:row=>[row?.loanId,row?.borrowerId],
  payments:row=>[row?.borrowerId,row?.targetLoanId,row?.targetChargeId,ids(row?.allocations),ids(row?.repayments)],
 };
 for(const patch of patches){
  // replaceWhere: a re-sent row (by id) still held under an owner outside the replaced set moved there.
  if(patch?.mode==='replaceWhere'&&!patch.path?.length){
   const drop=new Set((patch.values??[]).map((item)=>JSON.stringify(item??null))),kept=new Set((Array.isArray(data?.[patch.key])?data[patch.key]:[]).filter((row)=>!drop.has(JSON.stringify(row?.[patch.field]??null))).map((row)=>row?.id).filter((id)=>id!==undefined));
   if((patch.value??[]).some((row)=>row?.id!==undefined&&kept.has(row.id)))return true;
   continue;
  }
  const owner=fields[patch?.key];if(!owner||patch.mode!=='upsert'||patch.path?.length)continue;
  const old=new Map((Array.isArray(data?.[patch.key])?data[patch.key]:[]).map((row)=>[row?.id,row]));
  for(const row of patch.value??[]){const before=old.get(row?.id);if(before&&JSON.stringify(owner(before))!==JSON.stringify(owner(row)))return true}
 }
 return false;
}

/** R078 row deltas: the old place of a changed row the server cannot see (the change log has no old values).
 * collection {borrowers, loans}: a stored charge or upcoming entry of a changed loan under a borrower outside the
 * delta's borrowers (the loan moved). cash {ledgerIds, from}: a stored statement item of a changed ledger row on
 * an account-day the delta does not re-read from (the row moved account or date; later balances shift).
 * @param {any} data @param {any} scope */
export function deltaScopeMoves(data,scope){
 if(!scope||typeof scope!=='object')return false;
 if(Array.isArray(scope.loans)&&scope.loans.length){
  const loans=new Set(scope.loans),borrowers=new Set(scope.borrowers??[]);
  if((Array.isArray(data?.charges)?data.charges:[]).some((row)=>loans.has(row?.loanId)&&!borrowers.has(row?.borrowerId)))return true;
  const hasLoan=(value)=>Array.isArray(value)?value.some(hasLoan):!!value&&typeof value==='object'&&(loans.has(value.loanId)||Object.values(value).some(hasLoan));
  if(Object.values(data?.borrowerUpcomingByKey??{}).some((entry)=>!borrowers.has(entry?.borrowerId)&&hasLoan(entry)))return true;
 }
 if(Array.isArray(scope.ledgerIds)&&scope.ledgerIds.length){
  const ledgers=new Set(scope.ledgerIds),from=scope.from&&typeof scope.from==='object'?scope.from:{};
  for(const [key,statement] of Object.entries(data?.statementsByKey??{})){
   if(!(statement?.items??[]).some((item)=>ledgers.has(item?.ledgerId)))continue;
   let account,day;try{[account,day]=JSON.parse(key)}catch{return true}
   if(typeof from[account]!=='string'||!(day>=from[account]))return true;
  }
 }
 return false;
}
/** The reconciliation's canonical form: object keys sorted, timestamps as ISO text, and the read time (asOf)
 * blanked, exactly as a client stores a value (canonicalDeltaValue, then asOf hydrated from the envelope). */
export function canonicalDatasetValue(value){
 if(value instanceof Date)return value.toJSON();
 if(Array.isArray(value))return value.map(canonicalDatasetValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,key==='asOf'&&(typeof value[key]==='string'||value[key] instanceof Date)?null:canonicalDatasetValue(value[key])]));
 return value;
}
/** One SHA-256 (hex) per top-level key of a dataset, and one over the ordered (key, digest) list.
 * @param {Record<string,unknown>} data @param {(text:string)=>string|Promise<string>} sha256 */
export async function datasetDigests(data,sha256){
 const names=Object.keys(data??{}).sort(),keys={};
 for(const name of names)keys[name]=await sha256(JSON.stringify(canonicalDatasetValue(data[name]))??'null');
 return {keys,digest:await sha256(JSON.stringify(names.map(name=>[name,keys[name]])))};
}
/** The keys whose digests differ between two digest sets (either side may lack a key). */
export function digestDifferences(left,right){
 const names=[...new Set([...Object.keys(left?.keys??{}),...Object.keys(right?.keys??{})])].sort();
 return names.filter(name=>left?.keys?.[name]!==right?.keys?.[name]);
}
