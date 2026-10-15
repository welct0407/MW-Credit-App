import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914';
const expected=JSON.parse(await fs.readFile(`${root}/bulk-normalized.json`,'utf8'));
const actual=JSON.parse(await fs.readFile(`${root}/bulk-sql-readback.json`,'utf8'));
const schema=JSON.parse(await fs.readFile(`${root}/bulk-sql-schema.json`,'utf8'));
function canonical(v,type){
 if(v===null)return null;
 if(type==='money')return String(v).replace(/[$,]/g,'').replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
 if(type==='integer'||type==='real')return String(v);
 if(type==='timestamp without time zone')return v.replace('T',' ');
 return v;
}
const tables=[];let failures=0;
for(const [table,rows] of Object.entries(expected)){
 const read=actual[table]??[], map=new Map(read.map(r=>[r['Row ID'],r]));
 const differences=[];let checkedFields=0;
 for(const row of rows){const found=map.get(row['Row ID']);if(!found){differences.push({kind:'missing-row'});continue;}
  for(const c of schema.filter(c=>c.table_name===table)){checkedFields++;if(canonical(row[c.column_name],c.data_type)!==canonical(found[c.column_name],c.data_type))differences.push({column:c.column_name,kind:'field-mismatch'});}
 }
 const passed=read.length===rows.length&&map.size===rows.length&&differences.length===0;
 if(!passed)failures++;
 tables.push({table,sourceRows:rows.length,sqlRows:read.length,uniqueKeys:map.size,checkedFields,passed,differences});
}
const report={method:'Independent committed SQL read-back via Studio in key-ordered batches; exact text/key/null/date/boolean comparison and equivalent numeric formatting',tables,allPassed:failures===0};
await fs.writeFile(`${out}/bulk-readback-verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures)process.exitCode=1;
