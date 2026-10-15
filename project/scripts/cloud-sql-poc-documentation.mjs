import fs from 'node:fs/promises';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=`${root}/outputs/cloud-sql-poc-20260914`;
const config=JSON.parse(await fs.readFile(`${out}/app-config-1.000008.json`,'utf8'));
const definitions=[];
let table='';
for(const section of config){
 const p=Object.fromEntries(section.rows.filter(r=>r.length===2));
 if(section.heading.startsWith('Schema Name')) table=section.heading.replace('Schema Name','').trim().replace(/_Schema$/,'');
 if(p['Column name']){
  const qualifier=JSON.parse(p['Type Qualifier']||'{}');
  const detail=['Key','Label','Read-Only','Hidden','Virtual?','Initial value','App formula','Reset on edit?'].filter(k=>p[k]!==undefined).map(k=>`${k}: ${p[k]}`).join('\n');
  const ref=qualifier.ReferencedTableName?`Ref -> ${qualifier.ReferencedTableName}[${qualifier.ReferencedKeyColumn}]; IsAPartOf=${qualifier.IsAPartOf}`:'';
  definitions.push(['SQL POC','1.000008',table,p['Column name'],p.Type,'Test only; live appdoc reconciled',ref||'POC only; no OLTP/OLAP consumer',detail]);
 }
 if(p['Table name']) definitions.push(['SQL POC','1.000008',p['Table name'],'Table access','Configuration','Test only; live appdoc reconciled',`Source: ${p['Data Source']||'native user settings'}`,p['Are updates allowed?']||JSON.stringify(p)]);
}
if(definitions.filter(r=>r[4]!=='Configuration').length!==30)throw Error('Expected 30 live app columns');
definitions.push(
 ['SQL POC','1.000008','poc_source / poc_projection / poc_events','SQL key types','varchar','Test only; DDL and UI verified','Preserve exact key and Ref text; no uuid casts','source.id / projection.id / events.source_id: varchar(64)\nevents.id: varchar(100)\nprojection.id and events.source_id FK -> source.id\nevents UNIQUE(source_id, revision)'],
 ['SQL POC','1.000008','poc_source','AFTER UPDATE trigger','PL/pgSQL','Test only; engine + new GUI verified','One transaction changes source, projection and event','Unchanged input/revision -> no-op. Otherwise revision=old+1. projection.derived_value=input_value::bigint*2; insert event id=source.id || single hyphen || revision. Negative input deliberately raises after downstream writes, rolling back the transaction. Exact SQL: scripts/cloud-sql-poc-schema.sql.'],
 ['SQL POC','1.000008','App','Sync settings','Configuration','Test only; UI verified before tests','Full sync required for this acceptance result','Server cache OFF; delta sync OFF; quick sync OFF; delayed sync OFF; automatic updates ON; sync on start OFF; new desktop design ON.'],
 ['SQL POC','1.000008','App','Validation scope','Evidence','Owner acceptance pending','Results: POC_TEST_REPORT.md and ui-test-evidence.json','Uppercase and mixed-case updates, trigger propagation, parent Ref navigation and reverse related events passed. Full loan dataset key/Ref reconciliation, concurrency, offline and loan performance are pending.']
);
await fs.writeFile(`${out}/lab-config.json`,JSON.stringify({appId:'374d4905-1439-41ff-8257-e952beb8f3ee',version:'1.000008',definitions},null,2)+'\n');
console.log(`${definitions.length} POC inventory records prepared`);
