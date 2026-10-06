"""Read-only DEV V74 contract, catalog, notification and row-preservation checks."""
import argparse, hashlib, json, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('phase',choices=['before','after'])
args=p.parse_args()
root=Path(__file__).resolve().parents[2]
out=root/'outputs/r051-transparent-performance'
backup=json.loads((out/'vm01-development-backup.json').read_text())
assert backup['restored_fingerprints_match']
assert hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest()==backup['backup_sha256']
original=json.loads((Path(backup['backup_file']).parent/'fingerprints.json').read_text())
t=json.loads((root/'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],
        password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'; SET LOCAL timezone='UTC'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
    version,checksum=c.execute('SELECT version::integer,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
    assert version==(73 if args.phase=='before' else 74)
    oid=c.execute("SELECT 'public.oltp_upcoming_charge_coverage_v1'::regclass::oid").fetchone()[0]
    definition=c.execute('SELECT pg_get_viewdef(%s,true)',(oid,)).fetchone()[0]
    columns=c.execute('SELECT attname,format_type(atttypid,atttypmod),attnotnull FROM pg_attribute WHERE attrelid=%s AND attnum>0 AND NOT attisdropped ORDER BY attnum',(oid,)).fetchall()
    acl=c.execute('SELECT relacl::text,relowner FROM pg_class WHERE oid=%s',(oid,)).fetchone()
    catalog={}
    for schema,name,body in c.execute("SELECT schemaname,viewname,definition FROM pg_views WHERE schemaname IN ('public','assessment_lab')"):
        catalog['view:'+schema+'.'+name]=hashlib.sha256(body.encode()).hexdigest()
    for schema,name,body in c.execute("SELECT n.nspname,p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','assessment_lab') AND p.prokind IN ('f','p')"):
        catalog['routine:'+schema+'.'+name]=hashlib.sha256(body.encode()).hexdigest()
    fingerprints={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        count,digest=c.execute(sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))).fetchone()
        fingerprints[schema+'.'+table]={'count':count,'digest':digest}
    excluded={'public.flyway_schema_history'} if args.phase=='after' else set()
    unchanged={name:value==fingerprints.get(name) for name,value in original.items() if name not in excluded}
    assert all(unchanged.values()), 'Pre-existing rows changed; investigate before continuing'
    nonowner=c.execute("SELECT count(*) FROM \"Partners\" WHERE coalesce(\"Email\",'') NOT IN ('','welct0407@mw-credit.com')").fetchone()[0]
    actor=c.execute("SELECT count(*) FROM \"Partners\" WHERE lower(trim(\"Login Email\"))='welct0407@mw-credit.com'").fetchone()[0]
    assert nonowner==0 and actor==1
    result={'at':datetime.now(timezone.utc).isoformat(),'database':t['database'],'version':version,'checksum':checksum,
        'view_definition':definition,'columns':columns,'acl_owner':acl,'catalog':catalog,
        'unchanged_tables':unchanged,'nonowner_delivery_addresses':nonowner,'owner_actor_mapping_count':actor}
    if args.phase=='after':
        before=json.loads((out/'before-contract.json').read_text())
        changed=[key for key in set(before['catalog'])|set(catalog) if before['catalog'].get(key)!=catalog.get(key)]
        assert changed==['view:public.oltp_upcoming_charge_coverage_v1'],changed
        assert json.loads(json.dumps(columns))==before['columns'] and list(acl)==before['acl_owner']
        source=next((root/'database/migrations').glob('V54__*')).read_text(encoding='utf-8')
        old=source.split('CREATE VIEW public.oltp_upcoming_charge_coverage_v1 AS\n',1)[1].split(';\n',1)[0]
        diff=c.execute('WITH old AS ('+old+'''), new AS (SELECT * FROM public.oltp_upcoming_charge_coverage_v1)
          SELECT count(*) FROM ((SELECT * FROM old EXCEPT ALL SELECT * FROM new)
          UNION ALL (SELECT * FROM new EXCEPT ALL SELECT * FROM old)) d''').fetchone()[0]
        assert diff==0
        result.update(changed_catalog_objects=changed,live_result_differences=diff,columns_and_permissions_unchanged=True)
    c.rollback()
path=out/(args.phase+'-contract.json')
assert not path.exists()
path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'phase':args.phase,'version':version,'unchanged_tables':len(unchanged),'all_equal':True,
    'changed_catalog_objects':result.get('changed_catalog_objects'), 'live_result_differences':result.get('live_result_differences')}))
