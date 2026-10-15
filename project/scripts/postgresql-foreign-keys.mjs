import fs from 'node:fs/promises';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const doc=JSON.parse(await fs.readFile(`${priv}/bulk-full-after-1.000007.json`,'utf8'));
const schema=JSON.parse(await fs.readFile(`${priv}/bulk-sql-schema.json`,'utf8'));
const refs=[]; let table;
for(const t of doc){if(t.rows[0]?.[0]==='Schema Name')table=t.rows[0][1].replace(/_Schema$/,''); const c=Object.fromEntries(t.rows); if(c.Type==='Ref'&&c['Virtual?']==='No')refs.push({table,column:c['Column name'],target:JSON.parse(c['Type Qualifier']).ReferencedTableName});}
if(refs.length!==13||refs.some(r=>!schema.some(c=>c.table_name===r.table&&c.column_name===r.column&&c.data_type==='text')))throw Error('Unexpected reference schema');
const q=s=>'"'+s.replaceAll('"','""')+'"',lit=s=>"'"+s.replaceAll("'","''")+"'",tbl=s=>'public.'+q(s);
refs.forEach((r,i)=>r.name=`appsheet_ref_${String(i+1).padStart(2,'0')}`);
const groups=Object.groupBy(refs,r=>r.table);
const guard="IF current_database()<>'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF;";
const pre=refs.map(r=>`SELECT ${lit(r.table)} AS table_name,${lit(r.column)} AS column_name,count(*) FILTER(WHERE c.${q(r.column)}='') AS blanks,count(*) FILTER(WHERE c.${q(r.column)} IS NULL) AS nulls,count(*) FILTER(WHERE nullif(c.${q(r.column)},'') IS NOT NULL AND p."Row ID" IS NULL) AS orphans FROM ${tbl(r.table)} c LEFT JOIN ${tbl(r.target)} p ON c.${q(r.column)}=p."Row ID"`).join(' UNION ALL ');
await fs.writeFile(`${out}/fk-preflight.sql`,`SELECT jsonb_agg(to_jsonb(t))::text AS preflight FROM (${pre}) t;`);
const apply=[`DO $migration$ BEGIN ${guard}`,`IF EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f') THEN RAISE EXCEPTION 'Foreign keys already exist'; END IF;`,`LOCK TABLE ${Object.keys(groups).map(tbl).join(',')} IN ACCESS EXCLUSIVE MODE;`];
// Empty AppSheet references have the same meaning as SQL NULL. Preserve future blank submissions.
apply.push(`CREATE FUNCTION public.appsheet_normalize_blank_refs() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE col text; patch jsonb := '{}'::jsonb; BEGIN FOREACH col IN ARRAY TG_ARGV LOOP IF to_jsonb(NEW)->>col = '' THEN patch := patch || jsonb_build_object(col,NULL); END IF; END LOOP; IF patch <> '{}'::jsonb THEN NEW := jsonb_populate_record(NEW,patch); END IF; RETURN NEW; END $fn$;`);
for(const [t,rr] of Object.entries(groups)){
 apply.push(`UPDATE ${tbl(t)} SET ${rr.map(r=>`${q(r.column)}=nullif(${q(r.column)},'')`).join(',')} WHERE ${rr.map(r=>`${q(r.column)}=''`).join(' OR ')};`);
 apply.push(`CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON ${tbl(t)} FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs(${rr.map(r=>lit(r.column)).join(',')});`);
}
for(const r of refs)apply.push(`ALTER TABLE ${tbl(r.table)} ADD CONSTRAINT ${q(r.name)} FOREIGN KEY (${q(r.column)}) REFERENCES ${tbl(r.target)} ("Row ID") ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;`);
apply.push('END $migration$;');
await fs.writeFile(`${out}/fk-apply.sql`,apply.join('\n'));
const tests=[`DO $test$ DECLARE k text; parent_key text; caught boolean; BEGIN ${guard}`];
for(const r of refs){
 tests.push(`SELECT "Row ID",${q(r.column)} INTO STRICT k,parent_key FROM ${tbl(r.table)} WHERE ${q(r.column)} IS NOT NULL LIMIT 1;`);
 for(const [mode,value] of [['valid','parent_key'],['null','NULL'],['blank',"''"]])tests.push(`BEGIN UPDATE ${tbl(r.table)} SET ${q(r.column)}=${value} WHERE "Row ID"=k; ${mode==='blank'?`IF EXISTS(SELECT 1 FROM ${tbl(r.table)} WHERE "Row ID"=k AND ${q(r.column)} IS NOT NULL) THEN RAISE EXCEPTION 'Blank normalization failed'; END IF;`:''} RAISE EXCEPTION USING ERRCODE='ZX001'; EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;`);
 tests.push(`caught:=false; BEGIN UPDATE ${tbl(r.table)} SET ${q(r.column)}='__FK_TEST_MISSING_PARENT__' WHERE "Row ID"=k; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END; IF NOT caught THEN RAISE EXCEPTION 'Invalid reference accepted: ${r.name}'; END IF;`);
 tests.push(`caught:=false; BEGIN DELETE FROM ${tbl(r.target)} WHERE "Row ID"=parent_key; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END; IF NOT caught THEN RAISE EXCEPTION 'Referenced parent deletion accepted: ${r.name}'; END IF;`);
 tests.push(`BEGIN INSERT INTO ${tbl(r.table)} SELECT (jsonb_populate_record(NULL::${tbl(r.table)},to_jsonb(c)||jsonb_build_object('Row ID','__FK_PROBE_${r.name}__'))).* FROM ${tbl(r.table)} c WHERE c."Row ID"=k; RAISE EXCEPTION USING ERRCODE='ZX001'; EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;`);
 tests.push(`caught:=false; BEGIN INSERT INTO ${tbl(r.table)} SELECT (jsonb_populate_record(NULL::${tbl(r.table)},to_jsonb(c)||jsonb_build_object('Row ID','__FK_PROBE_${r.name}__',${lit(r.column)},'__FK_TEST_MISSING_PARENT__'))).* FROM ${tbl(r.table)} c WHERE c."Row ID"=k; EXCEPTION WHEN foreign_key_violation THEN caught:=true; END; IF NOT caught THEN RAISE EXCEPTION 'Invalid insert accepted: ${r.name}'; END IF;`);
}
tests.push(`END $test$; SELECT 'passed' AS foreign_key_tests,91 AS checks;`);
await fs.writeFile(`${out}/fk-test.sql`,tests.join('\n'));
await fs.writeFile(`${out}/fk-catalog.sql`,"SELECT jsonb_agg(jsonb_build_object('name',conname,'table',conrelid::regclass::text,'validated',convalidated,'definition',pg_get_constraintdef(oid)) ORDER BY conname)::text AS foreign_keys FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f';");
await fs.writeFile(`${out}/fk-rollback.sql`,[`DO $rollback$ BEGIN ${guard}`,...refs.map(r=>`ALTER TABLE ${tbl(r.table)} DROP CONSTRAINT ${q(r.name)};`),...Object.keys(groups).map(t=>`DROP TRIGGER appsheet_blank_refs ON ${tbl(t)};`),'DROP FUNCTION public.appsheet_normalize_blank_refs();','END $rollback$;','-- Existing NULL references retain their equivalent blank meaning. App version restoration does not undo SQL DDL.'].join('\n'));
await fs.writeFile(`${out}/fk-plan.json`,JSON.stringify({databaseRole:'Future production database; copied OLAP app currently used for testing',appVersion:'1.000007',refs,blankNormalization:'Empty text references become SQL NULL on existing rows and future inserts/updates; nonblank values and keys are unchanged.',deletePolicy:'NO ACTION; no cascades',deferrable:false},null,2));
console.log(JSON.stringify({foreignKeys:refs.length,normalizationTriggers:Object.keys(groups).length}));
