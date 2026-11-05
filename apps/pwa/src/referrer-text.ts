/** R129 (V137): pure helpers of the Referrers pages (no imports, unit-tested in tests/unit/rebate-settlement-pwa.test.mjs). */
/** Every typed word must appear in the Thai or the English name (the Borrowers page search). */
export function matchesReferrer(row:{name?:string|null;description?:string|null},query:string){
 const words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean),text=[row.name,row.description].map(v=>String(v??'').toLocaleLowerCase()).join(' ');
 return words.every(word=>text.includes(word));
}
/** The ascending order rebate-settlement.create requires (UTF-8 byte order, the SQL COLLATE "C" comparison); no duplicates. */
export function sortedIds(ids:string[]){
 const encoder=new TextEncoder(),bytes=(value:string)=>encoder.encode(value);
 return [...new Set(ids)].sort((a,b)=>{const x=bytes(a),y=bytes(b);for(let k=0;k<Math.min(x.length,y.length);k++)if(x[k]!==y[k])return x[k]-y[k];return x.length-y.length});
}
/** The sum of decimal money strings, exact in satang, as a two-place decimal string. */
export const moneySum=(values:string[])=>(values.reduce((total,value)=>total+Math.round(Number(value)*100),0)/100).toFixed(2);
