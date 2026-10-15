import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914';
const schema=JSON.parse(await fs.readFile(`${root}/bulk-sql-schema.json`,'utf8'));
const doc=JSON.parse(await fs.readFile(`${root}/bulk-before-1.000005.json`,'utf8'));
const tables=[...new Set(schema.map(c=>c.table_name))].filter(t=>!['Calendar','Statistics'].includes(t));
const configs=new Map(); let current='';
for(const t of doc){if(t.rows[0]?.[0]==='Schema Name')current=t.rows[0][1].replace(/_Schema$/,'');if(t.rows[0]?.[0]==='Column name')configs.set(`${current}/${t.rows[0][1]}`,Object.fromEntries(t.rows));}
const quote=s=>'"'+s.replaceAll('"','""')+'"';
function normalize(v,c){
 if(v===undefined)throw Error(`Missing field ${c.table_name}/${c.column_name}`);
 if(c.data_type==='text'){if(typeof v!=='string')throw Error('Unexpected text type');return v;}
 if(v===''||v===null)return null;
 if(c.data_type==='boolean'){if(!['Y','N'].includes(v))throw Error('Unexpected boolean');return v==='Y';}
 if(['date','timestamp without time zone'].includes(c.data_type)){
  const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}:\d{2}:\d{2}))?$/);
  if(!m)throw Error(`Unexpected date format ${c.table_name}/${c.column_name}`);
  const iso=`${m[3]}-${m[1]}-${m[2]}`;if(new Date(iso+'T00:00:00Z').toISOString().slice(0,10)!==iso)throw Error('Invalid calendar date');
  return iso+(m[4]?' '+m[4]:'');
 }
 if(!['money','integer','real'].includes(c.data_type)||!/^[-+]?\d+(\.\d+)?$/.test(v))throw Error(`Unexpected numeric format ${c.table_name}/${c.column_name}`);
 if(c.data_type==='integer'&&!/^-?\d+$/.test(v))throw Error('Noninteger value');
 if(c.data_type==='money'&&v.includes('.')&&v.split('.')[1].replace(/0+$/,'').length>2)throw Error('Money precision loss');
 return v;
}
await fs.mkdir(`${root}/bulk-sql`,{recursive:true});
const all={},report=[];
for(const table of tables){
 const cols=schema.filter(c=>c.table_name===table);
 const physical=[...configs.entries()].filter(([k,v])=>k.startsWith(table+'/')&&v['Virtual?']==='No'&&v['Column name']!=='_RowNumber');
 if(cols.length!==physical.length||cols.some(c=>!physical.some(([,v])=>v['Column name']===c.column_name)))throw Error(`Physical schema mismatch ${table}`);
 const source=JSON.parse(await fs.readFile(`${root}/bulk-source/${table}.json`,'utf8'));
 const rows=source.map(r=>Object.fromEntries(cols.map(c=>[c.column_name,normalize(r[c.column_name],c)])));
 all[table]=rows;
 const json=JSON.stringify(rows); if(json.includes('$migration$'))throw Error('Delimiter collision');
 const target=`public.${quote(table)}`, names=cols.map(c=>quote(c.column_name)).join(',');
 const sql=`DO $copy$\nDECLARE expected json := $migration$${json}$migration$;\nBEGIN\nIF current_database() <> 'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF;\nLOCK TABLE ${target} IN EXCLUSIVE MODE;\nIF EXISTS (SELECT 1 FROM ${target}) THEN RAISE EXCEPTION 'Destination must be empty'; END IF;\nINSERT INTO ${target} (${names}) SELECT ${names} FROM json_populate_recordset(NULL::${target},expected);\nIF (SELECT count(*) FROM ${target}) <> ${rows.length} OR EXISTS ((SELECT ${names} FROM ${target} EXCEPT ALL SELECT ${names} FROM json_populate_recordset(NULL::${target},expected)) UNION ALL (SELECT ${names} FROM json_populate_recordset(NULL::${target},expected) EXCEPT ALL SELECT ${names} FROM ${target})) THEN RAISE EXCEPTION 'Copy verification failed'; END IF;\nEND $copy$;\nSELECT '${table}' AS table_name,count(*) AS verified_rows FROM ${target};`;
 await fs.writeFile(`${root}/bulk-sql/${table}.sql`,sql);
 report.push({table,rows:rows.length,physicalColumns:cols.length,uniqueKeys:new Set(rows.map(r=>r['Row ID'])).size,sqlBytes:Buffer.byteLength(sql)});
}
const refs=[];
for(const table of tables)for(const c of schema.filter(c=>c.table_name===table)){
 const def=configs.get(`${table}/${c.column_name}`);if(def?.Type!=='Ref')continue;
 const qualifier=JSON.parse(def['Type Qualifier']);const target=qualifier.ReferencedTableName;
 if(!target||!all[target]){refs.push({table,column:c.column_name,target:target??null,status:'target not in extracted tables'});continue;}
 const values=all[table].map(r=>r[c.column_name]).filter(Boolean),keys=new Set(all[target].map(r=>r['Row ID']));
 refs.push({table,column:c.column_name,target,nonblank:values.length,unmatched:values.filter(k=>!keys.has(k)).length});
}
await fs.writeFile(`${root}/bulk-normalized.json`,JSON.stringify(all));
await fs.writeFile(`${out}/bulk-copy-plan.json`,JSON.stringify({rollback:'1.000004',apiVersion:'1.000005',tables:report,references:refs,normalization:'Exact text and keys; blank non-text to NULL; en-US dates to ISO; Y/N to boolean; numeric strings preserved with explicit PostgreSQL target types. Calendar excluded: Google Sheets source.'},null,2)+'\n');
console.log(JSON.stringify({tables:report,references:refs},null,2));
