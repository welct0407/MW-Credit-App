// Compares SQL candidate with independently calculated pre-cutover AppSheet values.
// Prints only aggregate field counts, never borrower/financial rows.
import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918';
const contract=JSON.parse(await fs.readFile('outputs/r007-20260918/before-contract.json','utf8'));
const phase=process.argv[2]||'candidate';
if(!['candidate','sql-dev','after'].includes(phase))throw Error('Unexpected phase');
const norm=(v,type)=>{
 if(v===''||v===null||v===undefined)return null;
 if(type==='Yes/No')return v===true||v==='Y'||v==='TRUE';
 if(type==='Date'){
  if(/^\d{4}-\d\d-\d\d/.test(v))return v.slice(0,10);
  const [m,d,y]=v.split('/');return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
 }
 if(['Price','Number','Decimal','Percent'].includes(type))return Number(String(v).replace(/[$฿,%\s]/g,''))/(String(v).includes('%')?100:1);
 return v;
};
const report={release:'R007',phase,asOf:'2026-09-18 Asia/Bangkok',source:`AppSheet Find baseline at saved OLAP 1.000129 versus ${phase==='after'?'post-cutover AppSheet Find at OLAP 1.000142':phase==='sql-dev'?'live DEV SQL V22':'SQL restored DEV snapshot with V22'}`,fields:[],mismatches:0};
const privateDiff=[];
for(const [table,columns] of Object.entries(contract.columns)){
 const before=JSON.parse(await fs.readFile(`${root}/before/${table}.json`,'utf8'));
 const after=JSON.parse(await fs.readFile(`${root}/${phase}/${table}.json`,'utf8'));
 const map=new Map(after.map(r=>[r['Row ID'],r]));
 if(map.size!==before.length||before.some(r=>!map.has(r['Row ID'])))throw Error(`Key population mismatch ${table}`);
 for(const c of columns.filter(c=>c.r007Move)){
  let mismatches=0;
  for(const row of before){const a=norm(row[c['Column name']],c.Type),b=norm(map.get(row['Row ID'])[c['Column name']],c.Type);
   if(!(a===b||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(a)*1e-9)))){
    mismatches++;privateDiff.push({table,column:c['Column name'],id:row['Row ID'],before:a,after:b});
   }
  }
  const item={table,column:c['Column name'],type:c.Type,rows:before.length,mismatches};report.fields.push(item);report.mismatches+=mismatches;
  if(mismatches)console.log(JSON.stringify(item));
 }
}
await fs.writeFile(`${root}/${phase}-private-diff.json`,JSON.stringify(privateDiff,null,2));
await fs.writeFile(`outputs/r007-20260918/${phase}-parity.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({fields:report.fields.length,mismatches:report.mismatches}));
process.exitCode=report.mismatches?1:0;
