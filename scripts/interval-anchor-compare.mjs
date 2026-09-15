import fs from 'node:fs/promises';
const production=process.argv.includes('--production');
const folder=production?'interval-promotion-20260915':'interval-anchor-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/'+folder;
const out='outputs/'+folder;
await fs.mkdir(out,{recursive:true});
const norm=v=>String(v??'').replace(/\s+/g,' ').trim();
function objects(tables){
 let schema='';const map=new Map();
 for(const t of tables){const s=Object.fromEntries(t.rows.filter(r=>r.length===2));if(s['Schema Name'])schema=s['Schema Name'];
 let key=s['Column name']?'column:'+schema+':'+s['Column name']:s['Action name']?'action:'+s['For a record of this table']+':'+s['Action name']:s['Table name']?'table:'+s['Table name']:s['Slice name']?'slice:'+s['Slice name']:s['View name']?'view:'+s['View name']:s['Version']?'app':null;
 if(key){if(map.has(key))throw Error('Duplicate component '+key);map.set(key,s);}}
 return map;
}
const report={};
for(const app of ['oltp','olap']){
 const before=objects(JSON.parse(await fs.readFile(`${priv}/${app}-before.json`)));
 const after=objects(JSON.parse(await fs.readFile(`${priv}/${app}-after.json`)));
 const changes=[];
 for(const [key,s]of after){const b=before.get(key);if(!b){changes.push({key,added:s});continue;}
  const fields=[];for(const f of new Set([...Object.keys(b),...Object.keys(s)])){
   // AX omits hidden locale rows and reads CSS icon glyphs; DOM extraction reads
   // the locale row and not pseudo-element glyphs. Icon configuration remains
   // compared inside View configuration / With these properties.
   if(['Icon','Action icon'].includes(f))continue;
   if(f==='Data locale'&&b[f]===undefined&&s[f]==='en-US')continue;
   if(norm(b[f])!==norm(s[f]))fields.push({field:f,before:b[f]??null,after:s[f]??null});
  }
  if(fields.length)changes.push({key,fields});}
 const removed=[...before.keys()].filter(k=>!after.has(k));report[app]={version:after.get('app')?.Version,changes,removed};
 console.log(JSON.stringify({app,version:report[app].version,removed,changes:changes.map(c=>({key:c.key,fields:c.fields?.map(f=>f.field),added:!!c.added}))}));
}
await fs.writeFile(out+'/definition-comparison.json',JSON.stringify(report,null,2));
