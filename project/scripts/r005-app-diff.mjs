import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const root='outputs/r005-20260917';
const privateRoot='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917';
const [app, beforeName, afterName]=process.argv.slice(2);
if(!app||!beforeName||!afterName)throw Error('Usage: node scripts/r005-app-diff.mjs oltp|olap before-name after-name');
const read=async name=>{let raw;try{raw=await fs.readFile(`${root}/${name}.json`,'utf8');}catch{raw=await fs.readFile(`${privateRoot}/${name}.json`,'utf8');}
 if(/password|access.?key|api.?key|secret|bearer\s|[?&](token|signature)=/i.test(raw))throw Error('Protected value review required');
 const data=JSON.parse(raw);if(!data.tables?.length)throw Error('Empty export');
 await fs.writeFile(`${root}/${name}.json`,raw);return data;};
const before=await read(beforeName),after=await read(afterName);
function flatten(data){const result=new Map();let schema='';
 for(const table of data.tables){const rows=table.rows;const [kind,name]=rows[0];const props=Object.fromEntries(rows.filter(r=>r.length>1));
  if(kind==='Schema Name')schema=name;
  let id=kind==='Column name'?`Column/${schema}/${name}`:kind==='Action name'?`Action/${props['For a record of this table']}/${name}`:kind===''?'App':kind==='Data Summary'?'Summary':`${kind}/${name}`;
  function put(path,value){if(result.has(path))throw Error(`Duplicate identity ${path}`);result.set(path,value);}
  function walk(path,value){if(value!==null&&typeof value==='object'){put(path+'/$shape',Array.isArray(value)?{type:'array',length:value.length}:{type:'object',keys:Object.keys(value).sort()});for(const [k,v]of Object.entries(value))walk(path+'/'+k,v);}else put(path,value);}
  for(const row of rows){if(row.length<2)continue;let value=row[1];if(/^[\[{]/.test(value)){try{value=JSON.parse(value);}catch{}}
   walk(id+'/'+row[0],value);
  }
 }
 return result;
}
const a=flatten(before),b=flatten(after),changes=[];
const version=d=>d.tables.flatMap(t=>t.rows).find(r=>r[0]==='Version')?.[1];
for(const path of [...new Set([...a.keys(),...b.keys()])].sort()){
 if(a.has(path)&&b.has(path)&&JSON.stringify(a.get(path))===JSON.stringify(b.get(path)))continue;
 const id='R005-'+app.toUpperCase()+'-'+crypto.createHash('sha256').update(path).digest('hex').slice(0,12);
 changes.push({id,app,environment:'DEV',path,operation:!a.has(path)?'add':!b.has(path)?'remove':'change',before:a.has(path)?{present:true,value:a.get(path)}:{present:false},after:b.has(path)?{present:true,value:b.get(path)}:{present:false},status:'Pending editor verification and final target reconciliation'});
}
const record={release:'R005',app,before:{file:beforeName+'.json',version:version(before)},after:{file:afterName+'.json',version:version(after)},coverage:'All exported properties; omitted export coverage subject to explicit owner-approved limited R005 exception.',counts:{before:a.size,after:b.size,changes:changes.length},changes};
await fs.writeFile(`${root}/${afterName}-diff.json`,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({before:record.before,after:record.after,counts:record.counts}));
