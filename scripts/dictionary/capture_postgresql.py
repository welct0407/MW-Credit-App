"""Read-only, metadata-only PostgreSQL capture. Writes private evidence, never SQL objects."""
import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRIVATE = Path.home() / 'Documents/ChatGPT/AppSheet-Loan-Project'
sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row

NS = "n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'"
QUERIES = {
 'schemas': f"""SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner,
 n.nspacl::text AS acl, obj_description(n.oid,'pg_namespace') AS comment
 FROM pg_namespace n WHERE {NS} ORDER BY 1""",
 'relations': f"""SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
 pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS row_security,c.relforcerowsecurity AS force_row_security,
 c.relreplident AS replica_identity,c.relpersistence AS persistence,c.relispartition AS is_partition,
 c.reloptions AS options,c.relacl::text AS acl,obj_description(c.oid,'pg_class') AS comment,
 CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END AS view_definition,
 CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END AS partition_key,
 CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound,c.oid) END AS partition_bound,
 (SELECT array_agg(i.inhparent::regclass::text ORDER BY i.inhseqno) FROM pg_inherits i WHERE i.inhrelid=c.oid) AS parents,
 (SELECT extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e' LIMIT 1) AS extension
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE {NS} AND c.relkind IN ('r','p','v','m','f') ORDER BY 1,2""",
 'columns': f"""SELECT n.nspname AS schema,c.relname AS relation,a.attname AS name,a.attnum AS ordinal,
 format_type(a.atttypid,a.atttypmod) AS data_type,tn.nspname AS type_schema,t.typname AS type_name,
 a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,
 a.attndims AS dimensions,a.attstorage AS storage,a.attcompression AS compression,
 pg_get_expr(ad.adbin,ad.adrelid) AS default_expression,
 CASE WHEN a.attcollation<>0 THEN a.attcollation::regcollation::text END AS collation,
 a.attacl::text AS acl,col_description(c.oid,a.attnum) AS comment
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
 LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
 WHERE {NS} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,4""",
 'constraints': f"""SELECT n.nspname AS schema,c.relname AS relation,con.conname AS name,con.contype AS kind,
 pg_get_constraintdef(con.oid,true) AS definition,con.condeferrable AS deferrable,con.condeferred AS initially_deferred,
 con.convalidated AS validated,con.conkey AS column_numbers,con.confkey AS referenced_column_numbers,
 CASE WHEN con.confrelid<>0 THEN con.confrelid::regclass::text END AS referenced_relation,
 con.confupdtype AS update_action,con.confdeltype AS delete_action,con.confmatchtype AS match_type,
 obj_description(con.oid,'pg_constraint') AS comment
 FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace
 LEFT JOIN pg_class c ON c.oid=con.conrelid WHERE {NS} ORDER BY 1,2,3""",
 'indexes': f"""SELECT n.nspname AS schema,c.relname AS relation,i.relname AS name,
 pg_get_indexdef(i.oid) AS definition,ix.indisunique AS unique,ix.indisprimary AS primary,
 ix.indisvalid AS valid,ix.indisready AS ready,ix.indisreplident AS replica_identity,
 ix.indnkeyatts AS key_attribute_count,ix.indnatts AS total_attribute_count,
 pg_get_expr(ix.indpred,ix.indrelid) AS predicate,pg_get_expr(ix.indexprs,ix.indrelid) AS expressions,
 i.reloptions AS options,am.amname AS access_method,obj_description(i.oid,'pg_class') AS comment
 FROM pg_index ix JOIN pg_class c ON c.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am am ON am.oid=i.relam WHERE {NS} ORDER BY 1,2,3""",
 'routines': f"""SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prokind AS kind,pg_get_function_arguments(p.oid) AS arguments_with_defaults,pg_get_function_result(p.oid) AS result,
 pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,l.lanname AS language,
 p.provolatile AS volatility,p.proisstrict AS strict,p.prosecdef AS security_definer,p.proleakproof AS leakproof,
 p.proparallel AS parallel,p.procost AS cost,p.prorows AS rows,p.proconfig AS settings,p.proacl::text AS acl,
 obj_description(p.oid,'pg_proc') AS comment,
 (SELECT extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e' LIMIT 1) AS extension
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE {NS} AND p.prokind IN ('f','p','w') ORDER BY 1,2,3""",
 'triggers': f"""SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,
 pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled AS enabled,t.tgisinternal AS internal,
 t.tgfoid::regprocedure::text AS routine,
 t.tgdeferrable AS deferrable,t.tginitdeferred AS initially_deferred,
 obj_description(t.oid,'pg_trigger') AS comment
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE {NS} ORDER BY 1,2,3""",
 'sequences': f"""SELECT n.nspname AS schema,c.relname AS name,pg_get_userbyid(c.relowner) AS owner,
 s.seqtypid::regtype::text AS data_type,s.seqstart AS start,s.seqincrement AS increment,s.seqmax AS maximum,
 s.seqmin AS minimum,s.seqcache AS cache,s.seqcycle AS cycle,c.relacl::text AS acl,
 (SELECT array_agg(pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) ORDER BY d.refobjsubid)
 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')) AS owned_by
 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE {NS} ORDER BY 1,2""",
 'types': f"""SELECT n.nspname AS schema,t.typname AS name,t.typtype AS kind,pg_get_userbyid(t.typowner) AS owner,
 CASE WHEN t.typbasetype<>0 THEN format_type(t.typbasetype,t.typtypmod) END AS base_type,
 t.typnotnull AS not_null,t.typdefault AS default_expression,t.typacl::text AS acl,
 (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS enum_labels,
 obj_description(t.oid,'pg_type') AS comment
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid
 WHERE {NS} AND (t.typtype IN ('d','e','r','m') OR (t.typtype='c' AND c.relkind='c')) ORDER BY 1,2""",
 'policies': "SELECT schemaname AS schema,tablename AS relation,policyname AS name,permissive,roles,cmd,qual,with_check FROM pg_policies ORDER BY 1,2,3",
 'extensions': "SELECT extname AS name,extversion AS version,extnamespace::regnamespace::text AS schema,pg_get_userbyid(extowner) AS owner,extrelocatable AS relocatable FROM pg_extension ORDER BY 1",
 'default_privileges': "SELECT pg_get_userbyid(defaclrole) AS role,CASE WHEN defaclnamespace<>0 THEN defaclnamespace::regnamespace::text END AS schema,defaclobjtype AS kind,defaclacl::text AS acl FROM pg_default_acl ORDER BY 1,2,3",
 'database': "SELECT datname AS name,pg_get_userbyid(datdba) AS owner,pg_encoding_to_char(encoding) AS encoding,datcollate AS collation,datctype AS ctype,datconnlimit AS connection_limit,datacl::text AS acl FROM pg_database WHERE datname=current_database()",
 'database_role_settings': "SELECT COALESCE(d.datname,'ALL') AS database,COALESCE(r.rolname,'ALL') AS role,s.setconfig AS settings FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase LEFT JOIN pg_roles r ON r.oid=s.setrole WHERE s.setdatabase=0 OR d.datname=current_database() ORDER BY 1,2",
 'role_dependencies': "SELECT DISTINCT r.rolname AS role,d.deptype AS dependency_type FROM pg_shdepend d JOIN pg_roles r ON d.refclassid='pg_authid'::regclass AND d.refobjid=r.oid WHERE d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) OR (d.classid='pg_database'::regclass AND d.objid=(SELECT oid FROM pg_database WHERE datname=current_database())) ORDER BY 1,2",
 'relevant_roles': """WITH RECURSIVE relevant(oid) AS (
 SELECT refobjid FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND
 (dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) OR
 (classid='pg_database'::regclass AND objid=(SELECT oid FROM pg_database WHERE datname=current_database())))
 UNION SELECT m.roleid FROM pg_auth_members m JOIN relevant r ON m.member=r.oid)
 SELECT r.rolname AS name,r.rolsuper AS superuser,r.rolinherit AS inherit,r.rolcreaterole AS create_role,
 r.rolcreatedb AS create_database,r.rolcanlogin AS can_login,r.rolreplication AS replication,
 r.rolbypassrls AS bypass_rls,r.rolconnlimit AS connection_limit,r.rolconfig AS settings
 FROM pg_roles r JOIN relevant v ON v.oid=r.oid ORDER BY 1""",
 'role_memberships': """WITH RECURSIVE relevant(oid) AS (
 SELECT refobjid FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND
 (dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) OR
 (classid='pg_database'::regclass AND objid=(SELECT oid FROM pg_database WHERE datname=current_database())))
 UNION SELECT m.roleid FROM pg_auth_members m JOIN relevant r ON m.member=r.oid)
 SELECT pg_get_userbyid(m.roleid) AS role,pg_get_userbyid(m.member) AS member,
 pg_get_userbyid(m.grantor) AS grantor,m.admin_option,m.inherit_option,m.set_option
 FROM pg_auth_members m JOIN relevant r ON m.member=r.oid ORDER BY 1,2,3""",
 'publications': "SELECT pubname AS name,pg_get_userbyid(pubowner) AS owner,puballtables AS all_tables,pubinsert AS insert,pubupdate AS update,pubdelete AS delete,pubtruncate AS truncate,pubviaroot AS via_root FROM pg_publication ORDER BY 1",
 'subscriptions': "SELECT subname AS name,pg_get_userbyid(subowner) AS owner,subenabled AS enabled,subslotname AS slot,subpublications AS publications FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY 1",
 'event_triggers': "SELECT evtname AS name,evtevent AS event,evtenabled AS enabled,evttags AS tags,evtfoid::regprocedure::text AS routine,pg_get_userbyid(evtowner) AS owner FROM pg_event_trigger ORDER BY 1",
 'rules': "SELECT schemaname AS schema,tablename AS relation,rulename AS name,definition FROM pg_rules WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema' ORDER BY 1,2,3",
 'flyway': "SELECT installed_rank,version,description,type,script,checksum,success FROM public.flyway_schema_history ORDER BY installed_rank",
 'foreign_tables': "SELECT foreign_table_schema AS schema,foreign_table_name AS name,foreign_server_name AS server FROM information_schema.foreign_tables ORDER BY 1,2",
 'aggregates': f"SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,a.aggtransfn::regprocedure::text AS transition,a.aggfinalfn::regprocedure::text AS final,a.agginitval AS initial FROM pg_aggregate a JOIN pg_proc p ON p.oid=a.aggfnoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE {NS} ORDER BY 1,2,3",
 'view_dependencies': f"""SELECT DISTINCT n.nspname AS schema,c.relname AS relation,
 rn.nspname AS referenced_schema,rc.relname AS referenced_relation,a.attname AS referenced_column
 FROM pg_rewrite rw JOIN pg_class c ON c.oid=rw.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=rw.oid
 JOIN pg_class rc ON d.refclassid='pg_class'::regclass AND rc.oid=d.refobjid
 JOIN pg_namespace rn ON rn.oid=rc.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=rc.oid AND a.attnum=d.refobjsubid
 WHERE {NS} AND c.relkind IN ('v','m') AND c.oid<>rc.oid ORDER BY 1,2,3,4,5""",
}

def content_hash(data):
    return hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def capture(environment, destination):
    config = json.loads((REPO/'database/environments.json').read_text())[environment]
    expected_db = {'production':'loan_manager_prod','development':'loan_manager_dev'}[environment]
    if (config['instance'],config['host'],config['database']) != ('appsheet-pg-prod-20260914','34.21.174.215',expected_db):
        raise ValueError('Unrecognized environment tuple')
    password_path=Path(config['passwordFile']).resolve()
    if not password_path.is_relative_to(Path.home()/'Documents/ChatGPT'):
        raise ValueError('Credential path is outside approved private storage')
    destination=Path(destination).resolve()
    if not destination.is_relative_to(PRIVATE.resolve()):
        raise ValueError('Raw capture must remain in private project storage')
    if destination.exists():
        raise FileExistsError('Refusing to overwrite existing capture')
    with psycopg.connect(host=config['host'],port=config['port'],dbname=config['database'],user=config['user'],
        password=password_path.read_text().strip(),sslmode='require',connect_timeout=10,
        application_name='dictionary-metadata-read-only',options='-c default_transaction_read_only=on -c statement_timeout=30000',row_factory=dict_row) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        identity=conn.execute("SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS server_address,inet_server_port() AS server_port,current_setting('server_version') AS server_version,current_setting('TimeZone') AS timezone,current_setting('search_path') AS search_path,current_setting('transaction_read_only') AS read_only,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl").fetchone()
        if identity['database']!=expected_db or identity['read_only']!='on' or not identity['ssl']:
            raise ValueError('Live identity/read-only/SSL assertion failed')
        sections={}
        for name,query in QUERIES.items():
            try:
                sections[name]=conn.execute(query).fetchall()
            except Exception as exc:
                raise RuntimeError('Catalog section failed: '+name) from exc
        sections['jobs'] = conn.execute('SELECT jobid,jobname,schedule,command,nodename,nodeport,database,username,active FROM cron.job ORDER BY jobid').fetchall() if any(x['name']=='pg_cron' for x in sections['extensions']) else []
        identity['cron_timezone']=conn.execute("SELECT current_setting('cron.timezone',true) AS value").fetchone()['value']
        conn.rollback()
    result={'format':1,'environment':environment,'captured_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
      'target':{k:config[k] for k in ('instance','host','port','database')},'identity':identity,
      'sections':sections,'metadata_sha256':content_hash(sections),
      'collector_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print(json.dumps({'environment':environment,'identity':identity,'counts':{k:len(v) for k,v in sections.items()},'metadata_sha256':result['metadata_sha256']}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment',choices=['development','production'])
    parser.add_argument('output')
    args=parser.parse_args()
    capture(args.environment,args.output)
