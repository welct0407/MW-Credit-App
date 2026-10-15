import fs from 'node:fs/promises';
const privateRoot='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914';
function columns(tables){
  const result=new Map(); let schema='';
  for(const t of tables){
    if(t.rows[0]?.[0]==='Schema Name') schema=t.rows[0][1];
    if(t.rows[0]?.[0]==='Column name'){
      const key=`${schema} / ${t.rows[0][1]}`;
      if(result.has(key))throw Error(`Duplicate column ${key}`);
      result.set(key,Object.fromEntries(t.rows));
    }
  }
  return result;
}
const reports=[];
for(const [app,version] of [['oltp','1.000003'],['olap','1.000004']]){
  const source=JSON.parse(await fs.readFile(`${privateRoot}/${app}-source-config.json`,'utf8'));
  const copy=JSON.parse(await fs.readFile(`${privateRoot}/${app}-clone-${version}.json`,'utf8'));
  const businessSchemas=new Set(source.filter(t=>t.rows[0]?.[0]==='Table name'&&t.rows.some(r=>r[0]==='Data Source'&&r[1]!=='native')).map(t=>Object.fromEntries(t.rows).Schema));
  const src=columns(source), dst=columns(copy), differences=[];
  let compared=0;
  for(const [key,props] of src){
    if(!businessSchemas.has(key.split(' / ')[0]))continue;
    compared++;
    const target=dst.get(key);
    if(!target){differences.push({column:key,status:'Missing from clone'});continue;}
    const changedProperties=[...new Set([...Object.keys(props),...Object.keys(target)])].filter(k=>props[k]!==target[k]);
    if(changedProperties.length)differences.push({column:key,changedProperties});
  }
  const added=[...dst.keys()].filter(k=>businessSchemas.has(k.split(' / ')[0])&&!src.has(k));
  reports.push({app,version,businessSchemaCount:businessSchemas.size,comparedColumns:compared,differences,addedColumns:added,scope:'Rendered AppSheet column properties only; not data or feature validation'});
}
await fs.writeFile(`${out}/clone-column-comparison.json`,JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
