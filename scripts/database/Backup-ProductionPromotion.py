"""Private fixed PROD/journal snapshot and isolated restore; no live writes or migrations."""
import argparse, hashlib, json, os, socket, subprocess, sys, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Linux cloud sessions reach the instance through the IAP tunnel
# (scripts/database/cloud-db-tunnel.sh) with the read identity and copy the private
# recovery folder to the operator bucket. VM-01's direct TLS route was retired
# (DB-ACCESS-07, 17 October 2026); run this from a Linux cloud session.
if os.name == 'nt': raise SystemExit('Run the production backup from a Linux cloud session (VM-01 direct route retired, DB-ACCESS-07)')
sys.path.insert(0, '/workspace/.setup/python-deps')
import psycopg
from psycopg import sql

parser = argparse.ArgumentParser()
parser.add_argument('--approval-reference', required=True)
parser.add_argument('--database', choices=('loan_manager_prod','mw_agent'), default='loan_manager_prod')
parser.add_argument('--expected-version', type=int, choices=(77,87,89,90,91,92,93,95,96,97,98))
args = parser.parse_args()
if not args.approval_reference.strip(): raise ValueError('Actual owner approval reference required')
if args.database=='mw_agent' and args.expected_version is not None: raise ValueError('Journal database has no Flyway history')
expected_version=(args.expected_version or 77) if args.database=='loan_manager_prod' else None
repo = Path(__file__).resolve().parents[2]
target = json.loads((repo / 'database/environments.json').read_text())['production']
if (target['instance'], target['host'], target['port'], target['database'], target['user']) != ('mw-credit-pg-20261017', '136.85.127.134', 5432, 'loan_manager_prod', 'postgres'):
    raise ValueError('Wrong fixed production tuple')
# Journal mode changes only the fixed database name on this verified instance.
target={**target,'database':args.database}
if any(os.environ.get(k) for k in ('PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','DATABASE_URL')):
    raise ValueError('Remove ambient database routing overrides')
# System identifier of mw-credit-pg-20261017 (the proxy hides the server address).
CLUSTER_SYSTEM_IDENTIFIER = 7685391508477894672
BACKUP_BUCKET = 'gs://mw-credit-operator-private-737787224638/prod-backups/'
private_root = Path(os.environ.get('MW_PRIVATE_ROOT') or Path.home() / '.mw-private') / 'AppSheet-Loan-Project/flyway'
subprocess.run(['bash', str(repo / 'scripts/database/cloud-db-tunnel.sh')], check=True, stdout=subprocess.DEVNULL)
# Read-only backup identity (DB-ACCESS-03): IAM database user codex-cloud-read
# holds only pg_read_all_data, so it reads the worker-owned notification/job
# tables that postgres deliberately cannot (R053 closed owner baseline),
# without any maintenance grant or admin membership.
read_service_account = 'codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com'
connection = {'host': '127.0.0.1', 'port': int(os.environ.get('MW_DB_TUNNEL_PORT', '15432')), 'sslmode': 'disable', 'user': 'codex-cloud-read@clever-oasis-508610-n7.iam'}
tools = Path('/workspace/.setup/postgresql-18.6/bin')
exe = ''
restore_base = Path('/var/tmp/mw-credit')
restore_parent = restore_base / 'production-promotion-restores'
# PostgreSQL refuses to run as root; the isolated restore server runs as postgres.
as_server = ['runuser', '-u', 'postgres', '--'] if os.geteuid() == 0 else []
folder = private_root / ('prod-promotion-' + uuid.uuid4().hex)
folder.mkdir(parents=True, exist_ok=False)
dump = folder / (target['database']+'.dump')
data = restore_parent / uuid.uuid4().hex
local_env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
local_env['PGSSLMODE']='disable'
def run(argv, name, env=None):
    with (folder/name).open('wb') as output:
        subprocess.run(argv, stdout=output, stderr=subprocess.STDOUT, env=local_env if env is None else env, check=True)
def fingerprint(c):
    result = {}
    for schema, table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema' ORDER BY 1,2"):
        if args.database=='mw_agent' and (schema,table) in {('audit','events'),('audit','operations'),('runtime','operation_state')}:
            count=c.execute(sql.SQL('SELECT count(*) FROM {}.{}').format(sql.Identifier(schema),sql.Identifier(table))).fetchone()[0]
            result[schema+'.'+table]={'count':count,'verification':'count-only unrelated large audit/state; complete dump/restore retained'}
            continue
        query = sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        count, digest = c.execute(query).fetchone()
        result[schema+'.'+table] = {'count': count, 'digest': digest}
    return result
def safe_owned_path():
    if data.parent.resolve()!=restore_parent.resolve() or len(data.name)!=32 or any(v not in '0123456789abcdef' for v in data.name): raise ValueError('Owned cleanup boundary failed')
    if not data.is_relative_to(restore_base): raise ValueError('Restore outside local application data')
    candidate=data
    ancestors=[]
    while True:
        ancestors.append(candidate)
        if candidate==restore_base: break
        candidate=candidate.parent
    for candidate in ancestors:
        if candidate.exists() and (candidate.is_symlink() or candidate.is_junction()): raise ValueError('Reparse boundary rejected')
    if data.exists():
        for current, directories, files in os.walk(data, followlinks=False):
            for name in directories+files:
                item=Path(current)/name
                if item.is_symlink() or item.is_junction(): raise ValueError('Nested reparse boundary rejected')
safe_owned_path()
restore_parent.mkdir(parents=True, exist_ok=True)
if as_server: subprocess.run(['chown', 'postgres:postgres', str(restore_parent)], check=True)
password = subprocess.check_output(['gcloud', 'sql', 'generate-login-token', '--impersonate-service-account=' + read_service_account], text=True).strip()
passed = False
try:
    with psycopg.connect(host=connection['host'],port=connection['port'],dbname=target['database'],user=connection['user'],password=password,sslmode=connection['sslmode'],connect_timeout=10,autocommit=True) as c:
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        # Journal audit history is ~752MB/1.54M rows; this bounded timeout affects only the private read-only snapshot session.
        c.execute("SET LOCAL statement_timeout='%ss'; SET LOCAL lock_timeout='5s'; SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO,YMD'" % (180 if args.database=='mw_agent' else 60))
        if c.execute("SELECT current_setting('transaction_isolation'),current_setting('transaction_read_only')").fetchone()!=('repeatable read','on'): raise ValueError('Snapshot isolation/read-only not established')
        actual=c.execute('SELECT current_database(),session_user,host(inet_server_addr()),inet_server_port(),(SELECT system_identifier FROM pg_control_system()),clock_timestamp()').fetchone()
        if (actual[:2] != (target['database'],connection['user']) or actual[4] != CLUSTER_SYSTEM_IDENTIFIER): raise ValueError('Live production identity mismatch')
        if expected_version is not None and c.execute('SELECT max(version::int) FROM public.flyway_schema_history WHERE success').fetchone()[0] != expected_version: raise ValueError('Production history drift')
        before=fingerprint(c)
        roles=[r[0] for r in c.execute("SELECT rolname FROM pg_roles WHERE rolname<>'postgres' AND rolname NOT LIKE 'pg_%' ORDER BY rolname")]
        memberships=[list(r) for r in c.execute('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')]
        acls=[list(r) for r in c.execute("SELECT 'database',datname,datdba,datacl::text FROM pg_database WHERE datname=current_database() UNION ALL SELECT 'schema',nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'")]
        snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
        env=dict(local_env,PGPASSWORD=password,PGSSLMODE=connection['sslmode'])
        run([str(tools/('pg_dump'+exe)),'-h',connection['host'],'-p',str(connection['port']),'-U',connection['user'],'-d',target['database'],'-Fc','--snapshot='+snapshot,'--file='+str(dump)],'dump.log',env)
        del env['PGPASSWORD']; del password
        (folder/'baseline-private.json').write_text(json.dumps({'identity':[str(v) for v in actual],'fingerprints':before,'roleNames':roles,'memberships':memberships,'databaseSchemaAcls':acls},indent=2))
    run([str(tools/('pg_restore'+exe)),'--list',str(dump)],'archive.list')
    with socket.socket() as listener: listener.bind(('127.0.0.1',0)); port=listener.getsockname()[1]
    safe_owned_path()
    run([*as_server,str(tools/('initdb'+exe)),'-D',str(data),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],'initdb.log')
    run([*as_server,str(tools/('pg_ctl'+exe)),'-D',str(data),'-l',str(data/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'start.log')
    with psycopg.connect(host='127.0.0.1',port=port,dbname='postgres',user='postgres',autocommit=True) as c:
        if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=data.resolve(): raise ValueError('Owned restore identity mismatch')
        for role in roles: c.execute(sql.SQL('CREATE ROLE {} NOLOGIN').format(sql.Identifier(role)))
        c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target['database'])))
    run([str(tools/('pg_restore'+exe)),'-h','127.0.0.1','-p',str(port),'-U','postgres','-d',target['database'],'--no-owner','--no-privileges','--exit-on-error',str(dump)],'restore.log')
    with psycopg.connect(host='127.0.0.1',port=port,dbname=target['database'],user='postgres') as c:
        if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=data.resolve(): raise ValueError('Restored owned directory mismatch')
        c.execute("SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO,YMD'")
        restored=fingerprint(c)
        version=c.execute('SELECT max(version::int) FROM public.flyway_schema_history WHERE success').fetchone()[0] if expected_version is not None else None
        if restored!=before or version!=expected_version: raise ValueError('Restored source/history fingerprint mismatch')
    passed=True
    result={'schemaVersion':1,'database':target['database'],'baselineVersion':expected_version,'host':target['host'],'instance':target['instance'],'approvalReference':args.approval_reference,'observedAt':str(actual[-1]),'dumpSha256':hashlib.file_digest(dump.open('rb'),'sha256').hexdigest(),'archiveListing':'passed','restore':'passed','restoredFingerprintsMatch':True,'integrityScope':'all tables full-content fingerprint' if args.database!='mw_agent' else 'full-content fingerprints for all small/authoritative receipt, ingress, control and partner_notices tables; exact audit.events/audit.operations/runtime.operation_state counts only; complete raw dump and full isolated restore','tableCount':len(before),'restoreSemantics':'Complete schema/data restored; no owner/ACL replay, referenced role names local NOLOGIN only; no live/global-role restore','privateRecoveryDirectory':str(folder)}
    result['privateRecoveryObject']=BACKUP_BUCKET+folder.name+'/'
    (folder/'recovery.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
finally:
    stopped=True
    if (data/'postmaster.pid').exists():
        safe_owned_path()
        try: run([*as_server,str(tools/('pg_ctl'+exe)),'-D',str(data),'-m','fast','-w','stop'],'stop.log')
        except Exception: stopped=False
    if passed and stopped and data.exists():
        safe_owned_path()
        import shutil
        shutil.rmtree(data)
    (folder/'cleanup.json').write_text(json.dumps({'stopped':stopped,'ownedRestoreRemoved':not data.exists(),'backupRetained':True,'restorePassed':passed,'ownedRestorePath':str(data)},indent=2))
    (folder/'retention.txt').write_text('Protected '+target['database']+' rollback backup/private restore proof. Keep recovery; diagnostics review '+(datetime.now(timezone.utc)+timedelta(days=7)).date().isoformat())
    if passed:
        # The cloud session is ephemeral: keep the complete private folder durably.
        subprocess.run(['gcloud','storage','cp','--recursive',str(folder),BACKUP_BUCKET,'--quiet'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
