"""Capture only planned R052 PROD87 metadata after migration; no business rows."""
import argparse, hashlib, json, os, sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode=True
sys.path.insert(0,'C:/Users/ideaadmin/AppData/Local/AppSheetLoanTools/python-deps')
import psycopg
from psycopg.rows import dict_row
from capture_postgresql import QUERIES

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--scope',required=True)
p.add_argument('--output',required=True)
p.add_argument('--migration-root',required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[2]
scope=json.loads(Path(a.scope).read_text(encoding='utf-8-sig'))
assert scope['status']=='planned-not-observed' and scope['sourceCommit']=='b40c69526bc40b2ef3f6ab6b631df8c51695c921'
assert scope['targetDatabase']=='loan_manager_prod' and scope['requiredHistoryVersion']==87
assert len(scope['routineNames'])==47 and len(scope['relations'])==9 and scope['schemaNames']==['public','assessment_lab']
migration_root=Path(a.migration_root)
assert migration_root.is_absolute()
for item in scope['migrations']:
    assert hashlib.sha256((migration_root/item['name']).read_bytes()).hexdigest()==item['sha256']
destination=Path(a.output).resolve()
assert destination.is_relative_to(Path('C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project').resolve())
assert not destination.exists(), 'Preserve existing actual capture'
assert not any(os.environ.get(k) for k in ['PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','DATABASE_URL'])
t=json.loads((root/'database/environments.json').read_text())['production']
assert (t['instance'],t['host'],t['port'],t['database'],t['user'])==('mw-credit-pg-20261017','136.85.127.134',5432,'loan_manager_prod','postgres')
password=Path(t['passwordFile']).resolve()
assert password.is_relative_to(Path('C:/Users/ideaadmin/Documents/ChatGPT').resolve())
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=password.read_text().strip(),sslmode='require',connect_timeout=10,autocommit=True,row_factory=dict_row) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL statement_timeout='30s'")
    identity=c.execute("SELECT current_database() database,session_user operator,host(inet_server_addr()) host,inet_server_port() port,current_setting('transaction_read_only') read_only,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) ssl").fetchone()
    assert identity==dict(database=t['database'],operator=t['user'],host=t['host'],port=t['port'],read_only='on',ssl=True)
    assert c.execute('SELECT version FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()['version']=='87'
    assert c.execute("SELECT to_regrole('mw_app_prod_migration_schema_create') role").fetchone()['role'] is None, 'Temporary capability remains; capture held'
    sections={'sequences':[]}
    for section in ['relations','columns','constraints','indexes','triggers','policies','view_dependencies','routines','schemas']:
        if section=='schemas': predicate='name=ANY(%s)'; names=scope['schemaNames']
        elif section=='routines': predicate="schema||'.'||name=ANY(%s)"; names=scope['routineNames']
        else: predicate="schema||'.'||"+('name' if section=='relations' else 'relation')+'=ANY(%s)'; names=scope['relations']
        sections[section]=c.execute('SELECT * FROM ('+QUERIES[section]+') captured WHERE '+predicate,[names]).fetchall()
    assert {r['schema']+'.'+r['name'] for r in sections['routines']}==set(scope['routineNames'])
    assert {r['schema']+'.'+r['name'] for r in sections['relations']}==set(scope['relations'])
    roles=['mw_app_dev','mw_app_dev_journal_owner','mw_app_prod','mw_app_prod_journal_owner']
    sections['application_roles']=c.execute('SELECT rolname name,rolcanlogin login,rolsuper superuser,rolcreatedb create_db,rolcreaterole create_role,rolreplication replication,rolbypassrls bypass_rls FROM pg_roles WHERE rolname=ANY(%s) ORDER BY rolname',[roles]).fetchall()
    sections['application_memberships']=c.execute('SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE r.rolname=ANY(%s) OR m.rolname=ANY(%s) ORDER BY 1,2,3',[roles,roles]).fetchall()
    sections['database_acl']=c.execute('SELECT datname database,pg_get_userbyid(datdba) owner,datacl::text acl FROM pg_database WHERE datname=current_database()').fetchall()
    c.execute('ROLLBACK')
result={'format':1,'environment':'production','captured_utc':datetime.now(timezone.utc).isoformat(),'target':{k:t[k] for k in ['instance','host','port','database']},'version':87,'identity':identity,'scope':'R052 affected catalogue only; no business rows','sections':sections}
destination.parent.mkdir(parents=True,exist_ok=True)
with destination.open('x',encoding='utf-8') as out: out.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'database':'loan_manager_prod','version':87,'counts':{k:len(v) for k,v in sections.items()},'businessRowsRead':0,'captureSha256':hashlib.sha256(destination.read_bytes()).hexdigest()}))
