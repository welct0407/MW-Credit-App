"""DEV-only access/recovery harness over the existing pinned Cloud transport.

No production database or central runtime is reachable through this module.
Passwords remain in memory, and backups are private outside every repository.
"""
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import socket
import signal
import subprocess
import tempfile
import time

ACCESS = Path('/workspace/.setup/cloud-access')
PIN = '/workspace/.setup/cloud-access-host.pub'
HELPER_SHA = 'b3047ba47c2088ed07e104a75554cf83f86b3d936d93a80af4533cbb6e122842'
PG = Path('/workspace/.setup/postgresql-18.6/bin')
REPO = Path(__file__).resolve().parents[2]


def dev_connection(callback):
    """Run a bounded callback while the helper owns its pinned IAP/SSH tunnel."""
    import psycopg
    if hashlib.sha256(ACCESS.read_bytes()).hexdigest() != HELPER_SHA:
        raise ValueError('Reviewed transport changed')
    target = json.loads((REPO/'database/environments.json').read_text())['development']
    if (target['instance'], target['host'], target['database']) != (
            'appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev'):
        raise ValueError('DEV inventory mismatch')
    loader = importlib.machinery.SourceFileLoader('correction_cloud_transport', str(ACCESS))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    helper = importlib.util.module_from_spec(spec)
    loader.exec_module(helper)
    original = helper.Session.command
    result = []
    def command(self, argv, env, tunnels=(), visible=False, cwd=None, redactions=(), stage='Child command'):
        if stage != 'SQL DEV':
            return original(self, argv, env, tunnels, visible, cwd, redactions, stage)
        if (len(tunnels) != 2 or argv[:2] != [helper.WRAPPER, 'psql']
                or argv[argv.index('-d')+1] != 'loan_manager_dev'
                or argv[argv.index('-h')+1] != '127.0.0.1'
                or argv[argv.index('-U')+1] != 'postgres' or argv[-2:] != ['-c','SELECT 1']):
            raise ValueError('Unexpected owned transport')
        params = dict(host='127.0.0.1', port=int(argv[argv.index('-p')+1]), user='postgres',
                      dbname='loan_manager_dev', password=env['PGPASSWORD'], connect_timeout=10)
        with psycopg.connect(**params) as c:
            if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
                raise ValueError('DEV connection identity mismatch')
            c.rollback()
            result.append(callback(c, params))
        return ''
    helper.Session.command = command
    args = helper.parser().parse_args(['--host-key-file',PIN,'--confirm-ssh-user','codex-cloud',
                                     'sql','dev','--admin','--command','SELECT 1'])
    helper.execute(args, os.environ)
    if len(result) != 1:
        raise RuntimeError('DEV callback did not complete exactly once')
    return result[0]


def fingerprints(c):
    from psycopg import sql
    answer = {}
    for schema, table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        query = sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        answer[schema+'.'+table] = list(c.execute(query).fetchone())
    return answer


def backup():
    import psycopg
    root = Path(tempfile.mkdtemp(prefix='r051-dev-recovery-', dir='/workspace'))
    root.chmod(0o700)
    dump = root/'before.dump'
    def capture(c, params):
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        c.execute("SET LOCAL timezone='UTC'")
        version = c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0]
        if version != 58:
            raise ValueError('Expected unchanged DEV V58 baseline')
        before = fingerprints(c)
        snapshot = c.execute('SELECT pg_export_snapshot()').fetchone()[0]
        env = {k:v for k,v in os.environ.items() if not k.startswith(('PG','CODEX_','FLYWAY_'))}
        env['PGPASSWORD'] = params['password']
        with (root/'dump.log').open('wb') as log:
            subprocess.run([str(PG/'pg_dump'),'-h',params['host'],'-p',str(params['port']),'-U','postgres','-d','loan_manager_dev',
                            '-Fc','--no-owner','--no-privileges','--schema=public','--schema=assessment_lab','--schema=agent_audit',
                            '--snapshot='+snapshot,'--lock-wait-timeout=10s','--no-password','--file='+str(dump)], env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, check=True, timeout=120)
        c.rollback()
        return before
    before = dev_connection(capture)
    (root/'fingerprints.json').write_text(json.dumps(before))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port = sock.getsockname()[1]
    data = root/'data'
    def run(argv, name):
        with (root/name).open('wb') as log:
            subprocess.run([str(a) for a in argv], stdout=log, stderr=log, check=True)
    run([PG/'initdb','-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],'init.log')
    run([PG/'pg_ctl','-D',data,'-l',root/'postgres.log','-o',f'-h 127.0.0.1 -p {port} -k {root}','-w','start'],'start.log')
    try:
        with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',autocommit=True) as c:
            if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() != data.resolve():
                raise ValueError('Restore server identity mismatch')
            c.execute('DROP SCHEMA public')
        run([PG/'pg_restore','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','--no-owner','--no-privileges','--exit-on-error',dump],'restore.log')
        with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres') as c:
            c.execute("SET LOCAL timezone='UTC'")
            if fingerprints(c) != before:
                raise ValueError('Restored table fingerprints differ')
    finally:
        run([PG/'pg_ctl','-D',data,'-m','fast','-w','stop'],'stop.log')
    evidence = dict(database='loan_manager_dev',instance='appsheet-pg-prod-20260914',host='34.21.174.215',
                    baseline_version=58,sha256=hashlib.sha256(dump.read_bytes()).hexdigest(),
                    table_count=len(before),restored_fingerprints_match=True,private_artifact_reference=root.name,
                    scope='public,assessment_lab,agent_audit; roles and instance configuration excluded')
    (REPO/'outputs/r051-receipt-corrections/recovery.json').write_text(json.dumps(evidence,indent=2)+'\n')
    return evidence



def source_hashes():
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((REPO/'database/migrations').glob('*.sql'))}


def migrate(target_version=60):
    if target_version not in (60,61,62,63):raise ValueError('Only reviewed R051 DEV batches are supported')
    recovery = json.loads((REPO/'outputs/r051-receipt-corrections/recovery.json').read_text())
    artifact = Path('/workspace')/recovery['private_artifact_reference']/'before.dump'
    if (not recovery['restored_fingerprints_match'] or recovery['baseline_version'] != 58
            or hashlib.sha256(artifact.read_bytes()).hexdigest() != recovery['sha256']):
        raise ValueError('Verified DEV recovery missing or changed')
    hashes = source_hashes()
    validation=json.loads((REPO/'outputs/r051-receipt-corrections/local-validation.json').read_text())
    if not validation['passed'] or validation['source_sha256'] != hashes:
        raise ValueError('Exact migration source has not passed maintained local CI')
    def apply(c, params):
        if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
            raise ValueError('DEV target changed')
        before = c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank').fetchall()
        if before[-1] != {60:('58',1886180782),61:('60',1434947825),62:('61',-209051559),63:('62',-2039538011)}[target_version]:
            raise ValueError('Expected reviewed DEV history; reconcile before proceeding')
        c.rollback()
        env = {k:v for k,v in os.environ.items() if not k.startswith(('PG','CODEX_','FLYWAY_'))}
        env['FLYWAY_PASSWORD'] = params['password']
        command = ['/workspace/.setup/cloud-run','flyway','-outputType=json',
                   '-configFiles='+str(REPO/'database/flyway.conf'),
                   '-locations=filesystem:'+str(REPO/'database/migrations'),
                   '-url=jdbc:postgresql://127.0.0.1:'+str(params['port'])+'/loan_manager_dev',
                   '-user=postgres',"-initSql=SET lock_timeout='5s'; SET statement_timeout='30s'",'-target='+str(target_version)]
        result = json.loads(subprocess.run(command+['migrate'],env=env,cwd=REPO,capture_output=True,text=True,check=True,timeout=120).stdout)
        valid = json.loads(subprocess.run(command+['validate'],env=env,cwd=REPO,capture_output=True,text=True,check=True,timeout=60).stdout)
        if not result['success'] or result['migrationsExecuted'] != (2 if target_version==60 else 1) or not valid['validationSuccessful']:
            raise ValueError('Unexpected DEV migration result; reconcile, do not replay')
        after = c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank').fetchall()
        added=after[len(before):]
        if after[:len(before)] != before or [v for v,ch in added] != (['59','60'] if target_version==60 else [str(target_version)]) or source_hashes()!=hashes:
            raise ValueError('Migration/history/source mismatch')
        c.rollback()
        return dict(database='loan_manager_dev',instance='appsheet-pg-prod-20260914',host='34.21.174.215',
                    migrated=added,validate=True,source_sha256=hashes,recovery_sha256=recovery['sha256'])
    result = dev_connection(apply)
    (REPO/('outputs/r051-receipt-corrections/dev-migration.json' if target_version==60 else f'outputs/r051-receipt-corrections/dev-migration-v{target_version}.json')).write_text(json.dumps(result,indent=2)+'\n')
    return result


def test(business_only=False):
    # This is the live DEV route, deliberately separate from disposable Test-CI.
    # Only two reviewed rollback-only suites, unique accounts, no table-wide fixture
    # assumptions, no opening/admin bypass, no committed synthetic data or notifications.
    names = ['Test-BusinessCrud.sql'] if business_only else ['Test-PaymentCrud.sql','Test-BusinessCrud.sql']
    files = [REPO/'scripts/database'/name for name in names]
    hashes = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    fixture = """INSERT INTO public.\"Cash Accounts\"(\"Row ID\",\"Ref Cash Holder\",\"Account Label\",\"Bank Name\")
VALUES ('DEV-R051-DAD','ch:dad','R051 rollback synthetic Dad','Synthetic'),
('DEV-R051-LISA','ch:lisa','R051 rollback synthetic Lisa','Synthetic');"""
    def verify(c, params):
        if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
            raise ValueError('DEV target changed')
        if c.execute('SELECT max(version::integer) FROM flyway_schema_history WHERE success').fetchone()[0] != 63:
            raise ValueError('Expected tested V63')
        c.execute("SET LOCAL timezone='UTC'")
        before = fingerprints(c);c.rollback()
        env = {k:v for k,v in os.environ.items() if not k.startswith(('PG','CODEX_','FLYWAY_'))}
        env['PGPASSWORD'] = params['password']
        root = Path(tempfile.mkdtemp(prefix='r051-dev-tests-',dir='/workspace'));root.chmod(0o700)
        (root/'before-fingerprints.json').write_text(json.dumps(before))
        for p in files:
            sql = p.read_text().replace('\\ir Test-CashAccountFixtures.sql',fixture).replace('CI-DAD','DEV-R051-DAD').replace('CI-LISA','DEV-R051-LISA')
            if ('COMMIT;' in sql.upper() or 'DISABLE TRIGGER' in sql.upper() or 'r008.initializing' in sql
                    or not sql.rstrip().endswith('ROLLBACK;') or '\\ir ' in sql):
                raise ValueError('Live fixture must be reviewed and rollback-contained')
            appname='r051-crud-'+root.name[-8:]+'-'+p.stem[-20:]
            env['PGAPPNAME']=appname
            settings="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';"
            sql="\\timing on\nSELECT pg_backend_pid() AS r051_backend_pid;\n"+sql.replace('BEGIN;',settings,1)
            with (root/(p.stem+'.log')).open('w') as log:
                process=subprocess.Popen([str(PG/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',params['host'],'-p',str(params['port']),
                                '-U','postgres','-d','loan_manager_dev'],stdin=subprocess.PIPE,env=env,stdout=log,stderr=log,text=True,start_new_session=True)
                try:
                    process.communicate(sql,timeout=180)
                    if process.returncode:raise RuntimeError('DEV suite SQL failure: '+p.name+'; private log '+root.name)
                except BaseException:
                    if process.poll() is None:
                        os.killpg(process.pid,signal.SIGTERM)
                        try:process.communicate(timeout=5)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid,signal.SIGKILL);process.communicate()
                    # Only this run's positively identified own sessions may be terminated.
                    c.rollback()
                    stopped=c.execute("SELECT pid,pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='loan_manager_dev' AND application_name=%s AND pid<>pg_backend_pid()",(appname,)).fetchall()
                    c.commit()
                    remaining=[]
                    for attempt in range(20):
                        remaining=c.execute("SELECT pid FROM pg_stat_activity WHERE datname='loan_manager_dev' AND application_name=%s",(appname,)).fetchall()
                        c.rollback()
                        if not remaining:break
                        time.sleep(0.1)
                    c.execute("SET LOCAL timezone='UTC'")
                    unchanged=fingerprints(c)==before;c.rollback()
                    (root/'failure-reconciled.json').write_text(json.dumps(dict(suite=p.name,application_name=appname,owned_sessions_stopped=stopped,remaining_owned_sessions=remaining,fingerprints_unchanged=unchanged)))
                    raise
            c.execute("SET LOCAL timezone='UTC'")
            if fingerprints(c)!=before:
                raise ValueError('DEV before/after table fingerprints differ; reconcile concurrent changes')
            c.rollback()
        return dict(database='loan_manager_dev',suites=names,rollback_contained=True,table_fingerprints_unchanged=len(before),
                    source_sha256=hashes,private_logs_reference=root.name,notifications='SQL-only; no outbound sends')
    result = dev_connection(verify)
    (REPO/('outputs/r051-receipt-corrections/dev-business-tests.json' if business_only else 'outputs/r051-receipt-corrections/dev-tests.json')).write_text(json.dumps(result,indent=2)+'\n')
    return result



def ui_fixtures(mode, browser_reference):
    if not browser_reference:
        raise ValueError('Browser notification-containment readiness reference required')
    manifest = REPO/'outputs/r051-receipt-corrections/ui-fixture-state.json'
    if mode=='ui-create' and manifest.exists():
        raise ValueError('Fixture state exists; reconcile before any retry')
    script = REPO/'scripts/database'/('R051-UiFixtures.sql' if mode=='ui-create' else 'R051-UiCleanup.sql')
    def perform(c, params):
        if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
            raise ValueError('DEV target changed')
        c.execute("SET LOCAL timezone='UTC'")
        private_state=None
        if mode=='ui-create':
            private_state=Path(tempfile.mkdtemp(prefix='r051-ui-baseline-',dir='/workspace'));private_state.chmod(0o700)
            (private_state/'fingerprints.json').write_text(json.dumps(fingerprints(c)))
        else:
            prior=json.loads(manifest.read_text())
            private_state=Path('/workspace')/prior['private_baseline_reference']
        c.execute("SET LOCAL timezone='Asia/Bangkok'")
        if c.execute('SELECT max(version::integer) FROM flyway_schema_history WHERE success').fetchone()[0] != 63:
            raise ValueError('Expected validated V63')
        if mode=='ui-create':
            if c.execute('SELECT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID" LIKE \'SYN-R051-UI-%\')').fetchone()[0]:
                raise ValueError('Reserved namespace is not empty')
        c.execute("SELECT set_config('application_name',%s,false)",('r051-'+mode,))
        c.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'")
        # Integrity triggers validate current available pool and every exact row.
        sql='\n'.join(line for line in script.read_text().splitlines() if not line.startswith('\\'))
        c.execute(sql)
        c.commit()
        keys={table:c.execute('SELECT count(*) FROM public."'+table+'" WHERE "Row ID" LIKE \'SYN-R051-UI-%\'').fetchone()[0]
              for table in ['Borrowers','Loans','Charges','Payments','Business Expenses','Cash Accounts','Cash Ledger']}
        source_changes=None
        if mode=='ui-cleanup':
            c.rollback();c.execute("SET LOCAL timezone='UTC'")
            before=json.loads((private_state/'fingerprints.json').read_text());after=fingerprints(c)
            derived={'public.Daily Analytics','public.Cash Account Daily Analytics','public.flyway_schema_history'}
            source_changes=[k for k,v in before.items() if k not in derived and after.get(k)!=v]
        c.rollback()
        return dict(database='loan_manager_dev',state='created' if mode=='ui-create' else 'cleaned',
                    private_baseline_reference=private_state.name,source_tables_changed_after_cleanup=source_changes,
                    browser_readiness_reference=browser_reference,counts=keys,script_sha256=hashlib.sha256(script.read_bytes()).hexdigest())
    result = dev_connection(perform)
    manifest.write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('mode', choices=['backup','migrate','migrate-refinement','migrate-planning','migrate-coalescing','test','test-business','ui-create','ui-cleanup'])
    p.add_argument('--browser-ready-reference')
    args = p.parse_args()
    result=ui_fixtures(args.mode,args.browser_ready_reference) if args.mode.startswith('ui-') else {'backup':backup,'migrate':migrate,'migrate-refinement':lambda:migrate(61),'migrate-planning':lambda:migrate(62),'migrate-coalescing':lambda:migrate(63),'test':test,'test-business':lambda:test(True)}[args.mode]()
    print(json.dumps(result))
