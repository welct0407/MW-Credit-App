import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r004-20260917';
const out='outputs/r004-20260917';
await fs.mkdir(out,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const result={release:'R004',capturedUtc:new Date().toISOString(),coverage:'Rendered appdoc tables only. App-level/bot settings absent from this export are not established by this comparison.',apps:[]};
for(const env of ['dev','prod'])for(const app of ['oltp','olap']){
 const name=env+'-'+app;
 const before=JSON.parse(await fs.readFile(`${priv}/${name}-before.json`,'utf8'));
 let after;try{after=JSON.parse(await fs.readFile(`${priv}/${name}-after.json`,'utf8'));}catch{continue;}
 if(before.length!==after.length)throw Error(name+' table count changed');
 const changes=[];
 for(let i=0;i<before.length;i++){
  if(before[i].rows.length!==after[i].rows.length)throw Error(name+' property count changed');
  for(let j=0;j<before[i].rows.length;j++){
   const a=before[i].rows[j],b=after[i].rows[j];
   if(JSON.stringify(a)===JSON.stringify(b))continue;
   if(a[0]!==b[0])throw Error(name+' key changed');
   const allowed=a[0]==='Version'||(a[0]==='Type Qualifier'&&before[i].rows.some(r=>r[0]==='Column name'&&r[1]==='Expense Category'));
   if(!allowed)throw Error(name+' unexpected change at '+i+'/'+j);
   if(a[0]==='Type Qualifier'){
    const qa=JSON.parse(a[1]),qb=JSON.parse(b[1]);
    for(const k of new Set([...Object.keys(qa),...Object.keys(qb)]))if(JSON.stringify(qa[k])!==JSON.stringify(qb[k])){
     if(k!=='Valid_If')throw Error('Unexpected qualifier difference');
     changes.push({id:'APP-CATEGORY',table:i,property:'Expense Category.Type Qualifier.Valid_If',before:qa[k],after:qb[k]});
    }
   }else changes.push({id:'VERSION',property:'Version',before:a[1],after:b[1]});
  }
 }
 result.apps.push({name,beforeHash:hash(before),afterHash:hash(after),exportedTables:before.length,changes,unmappedChanges:0});
}
const dev=result.apps.find(a=>a.name==='dev-oltp')?.changes.find(c=>c.id==='APP-CATEGORY');
if(!dev)throw Error('Missing DEV category rule');
const prod=result.apps.find(a=>a.name==='prod-oltp')?.changes.find(c=>c.id==='APP-CATEGORY');
if(prod&&prod.after!==dev.after)throw Error('PROD differs from frozen DEV rule');
await fs.writeFile(`${out}/definition-diff.json`,JSON.stringify(result,null,2)+'\n');
await fs.writeFile(`${out}/category-valid-if.txt`,dev.after+'\n');
console.log(JSON.stringify(result.apps.map(a=>({app:a.name,exportedTables:a.exportedTables,changes:a.changes.length,unmapped:0}))));
