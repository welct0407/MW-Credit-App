import fs from 'node:fs/promises';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-cutover-20260914';
const schema=JSON.parse(await fs.readFile(`${priv}/sql-schema.json`,'utf8'));
const refs=JSON.parse(await fs.readFile('C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914/fk-plan.json','utf8')).refs;
const tables=['Borrowers','Partners','Loans','Statistics','Charges','Loan Assessment','Cash Pool Contributions','Settlements','Daily Analytics','Payments','Payment Allocations','Repayments'];
const q=s=>'"'+s.replaceAll('"','""')+'"';
const normalize=(v,c)=>{
 if(v===undefined)throw Error(`Missing ${c.table_name}.${c.column_name}`);
 if(refs.some(r=>r.table===c.table_name&&r.column===c.column_name)&&v==='')return null;
 if(c.data_type==='text')return v;
 if(v===''||v===null)return null;
 if(c.data_type==='boolean'){if(!['Y','N'].includes(v))throw Error('Unexpected boolean');return v==='Y';}
 if(['date','timestamp without time zone'].includes(c.data_type)){
  const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}:\d{2}:\d{2}))?$/);if(!m)throw Error('Unexpected date');
  return `${m[3]}-${m[1]}-${m[2]}`+(m[4]?' '+m[4]:'');
 }
 if(!['money','integer','real'].includes(c.data_type)||!/^[-+]?\d+(\.\d+)?$/.test(v))throw Error('Unexpected number');
 return v;
};
await fs.mkdir(`${priv}/sql`,{recursive:true});
const normalized={};
for(const table of tables){
 const cols=schema.filter(c=>c.table_name===table),names=cols.map(c=>q(c.column_name)).join(',');
 if(!cols.length)throw Error('Missing schema');
 const rows=JSON.parse(await fs.readFile(`${priv}/source/${table}.json`,'utf8')).map(r=>Object.fromEntries(cols.map(c=>[c.column_name,normalize(r[c.column_name],c)])));
 normalized[table]=rows;const json=JSON.stringify(rows);if(json.includes('$cutover$'))throw Error('Delimiter collision');
 const target=`public.${q(table)}`,cte=`WITH expected AS (SELECT * FROM jsonb_populate_recordset(NULL::${target},$cutover$${json}$cutover$::jsonb))`;
 const compare=`${cte} SELECT jsonb_build_object('table','${table}','source_rows',(SELECT count(*) FROM expected),'sql_rows',(SELECT count(*) FROM ${target}),'source_differences',(SELECT count(*) FROM (SELECT ${names} FROM expected EXCEPT ALL SELECT ${names} FROM ${target}) d),'sql_differences',(SELECT count(*) FROM (SELECT ${names} FROM ${target} EXCEPT ALL SELECT ${names} FROM expected) d),'sql_extra_keys',(SELECT count(*) FROM ${target} a WHERE NOT EXISTS(SELECT 1 FROM expected e WHERE e."Row ID"=a."Row ID")))::text;`;
 await fs.writeFile(`${priv}/sql/${table}-compare.sql`,compare);
 const nonKey=cols.filter(c=>c.column_name!=='Row ID').map(c=>c.column_name);
 const update=nonKey.map(c=>`${q(c)}=EXCLUDED.${q(c)}`).join(',');
 const actual=nonKey.map(c=>`t.${q(c)}`).join(','),excluded=nonKey.map(c=>`EXCLUDED.${q(c)}`).join(',');
 const apply=`BEGIN; DO $$ BEGIN IF current_database()<>'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\nINSERT INTO ${target} AS t (${names}) SELECT ${names} FROM jsonb_populate_recordset(NULL::${target},$cutover$${json}$cutover$::jsonb) ON CONFLICT ("Row ID") DO UPDATE SET ${update} WHERE (${actual}) IS DISTINCT FROM (${excluded});\nCOMMIT;\n${compare}`;
 await fs.writeFile(`${priv}/sql/${table}-apply.sql`,apply);
}
await fs.writeFile(`${priv}/source-normalized.json`,JSON.stringify(normalized));
console.log(JSON.stringify(tables.map(t=>({table:t,rows:normalized[t].length}))));
