// Build R008 revision 2 from independent saved AppDoc observations. No live writes.
import fs from 'node:fs/promises';
import {candidateHash,compare} from './delta.mjs';
const root='outputs/r008-20260918',out=`${root}/r2`;
if(await fs.stat(`${out}/FROZEN.md`).then(()=>true,()=>false))throw Error('Revision 2 is frozen; create a new reviewed revision.');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=async(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const d=await read(`${root}/release-delta.json`),old=await read(`${root}/dev-saved-observations.json`),s=await read(`${out}/saved-sync-repair.json`);
// FNV fingerprints independently computed from the live saved AppDoc strings in the browser.
const fingerprints={request:[79,'a0d347a1'],loanGuard:[1071,'b69b0e93'],bulkRows:[1045,'d5447a92'],bulkGuard:[1056,'1cffdd48'],lastCharge:[91,'aff8f7b3'],accruedDays:[200,'f4a2dfb8']};
for(const [key,value] of Object.entries(s.values)){let h=2166136261;for(let j=0;j<value.length;j++)h=Math.imul(h^value.charCodeAt(j),16777619);if(value.length!==fingerprints[key][0]||(h>>>0).toString(16)!==fingerprints[key][1])throw Error('Saved AppDoc transcription mismatch: '+key);}
if(d.revision!==1)throw Error('Expected retained revision 1');
d.revision=2;
d.continuation.versions='DEV SQL V24; OLTP 1.000178; OLAP 1.000169; both Prototype. PROD unchanged.';
d.continuation.done='Revision 1 plus Bangkok-date manual charge generation repair; 24 requests/24 charges synced successfully. See r2/REPORT.md.';
d.continuation.evidence=`${out}/REPORT.md; ${out}/saved-sync-repair.json; retained revision 1 evidence for unchanged items`;
const assignments={Assignments:[{ColumnToEdit:'Charge Generation Request',NewColumnValue:s.values.request}],ColumnToEdit:'Charge Generation Request',NewColumnValue:s.values.request,InputParametersUsed:null,Prominence:'Do_Not_Display',NeedsConfirmation:false,ConfirmationMessage:'',ModifiesData:true,BulkApplicable:true};
const fields=[
 ["Action Loans.Generate Today's Charge",'With these properties',assignments],
 ["Action Loans.Generate Today's Charge",'To this value',s.values.request],
 ["Action Loans.Generate Today's Charge",'Only if this condition is true',s.values.loanGuard],
 ["Action Statistics.Generate All Today's Charges",'With these properties.ReferencedRows',s.values.bulkRows],
 ["Action Statistics.Generate All Today's Charges",'Only if this condition is true',s.values.bulkGuard],
 ['Column Loans.Last Interest Charge Date','App formula',s.values.lastCharge],
 ['Column Loans.Accrued Interest Days','App formula',s.values.accruedDays]
];
const observations=old.items.map(i=>({...i,evidence:`REUSED unchanged item: ${i.evidence}. Six date expressions are the entire revision-2 edit scope; original observation date/version retained.`}));
for(const [n,[object,property,value]] of fields.entries()){
 const id=`R008-SYNC-${String(n+1).padStart(3,'0')}`;
 const undo=v=>typeof v==='string'?v.replaceAll('DATE(UTCNOW() + "007:00:00")','TODAY()'):Array.isArray(v)?v.map(undo):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,undo(x)])):v;
 d.items.push({id,app:'OLTP',object,property,operation:'change',before:{state:'value',value:undo(value)},dev:{state:'value',value},prod:{state:'value',value},evidence:`${out}/saved-sync-repair.json`,notes:'DEV pre-edit expressions read in current editor at 1.000176. PROD before value must be checked before promotion.'});
 observations.push({id,appId:s.appId,version:s.version,observedAt:s.observedAt,evidence:`${out}/saved-sync-repair.json`,observed:{state:'value',value}});
}
const evidence={release:'R008',revision:2,candidateHash:candidateHash(d),environment:'dev',items:observations};
await write(`${out}/release-delta.json`,d);await write(`${out}/dev-saved-observations.json`,evidence);
const result=compare(d,evidence);await write(`${out}/dev-comparison.json`,result);console.log(JSON.stringify({complete:result.complete,items:result.results.length,candidateHash:result.candidateHash,savedFormulaFingerprintsMatched:true}));
