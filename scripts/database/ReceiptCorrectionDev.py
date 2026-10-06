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


def backup(expected_version=58):
    if expected_version not in (58,64,65,67,68,69):
        raise ValueError("Only reviewed V58/V64/V65/V67/V68/V69 recovery is supported")
    import psycopg
    root = Path(tempfile.mkdtemp(prefix='r051-dev-recovery-', dir='/workspace'))
    root.chmod(0o700)
    dump = root/'before.dump'
    def capture(c, params):
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        c.execute("SET LOCAL timezone='UTC'")
        c.execute("SET LOCAL application_name='r051-reviewed-recovery'")
        c.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'")
        version = c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0]
        if version != expected_version:
            raise ValueError('Unexpected DEV recovery baseline version')
        if expected_version==69 and c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()!=('69',245428688):
            raise ValueError('Expected exact V69 recovery checksum')
        print(json.dumps(dict(stage='verified_recovery_target',database='loan_manager_dev',instance='appsheet-pg-prod-20260914',host='34.21.174.215',version=version)),flush=True)
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
                    baseline_version=expected_version,sha256=hashlib.sha256(dump.read_bytes()).hexdigest(),
                    table_count=len(before),restored_fingerprints_match=True,private_artifact_reference=root.name,
                    scope='public,assessment_lab,agent_audit; roles and instance configuration excluded')
    destination='recovery.json' if expected_version==58 else f'recovery-v{expected_version}.json'
    (REPO/'outputs/r051-receipt-corrections'/destination).write_text(json.dumps(evidence,indent=2)+'\n')
    return evidence



def source_hashes():
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((REPO/'database/migrations').glob('*.sql'))}


def migrate(target_version=60,expected_commit=None,window_reference=None):
    if target_version not in (60,61,62,63,64,65,66,67,68,69,70):raise ValueError('Only reviewed R051 DEV batches are supported')
    if target_version==70:
        if not expected_commit or len(expected_commit)!=40 or not window_reference:
            raise ValueError('Exact published commit and coordinated DEV window reference required')
        head=subprocess.run(['git','rev-parse','HEAD'],cwd=REPO,check=True,capture_output=True,text=True).stdout.strip()
        dirty=subprocess.run(['git','status','--porcelain','--','scripts/database','database/migrations'],cwd=REPO,check=True,capture_output=True,text=True).stdout.strip()
        if head!=expected_commit or dirty:raise ValueError('Published execution source changed; review before migration')
    recovery_name='recovery-v69.json' if target_version==70 else 'recovery-v68.json'  if target_version==69 else 'recovery-v67.json' if target_version==68 else 'recovery-v65.json' if target_version>=66 else ('recovery-v64.json' if target_version==65 else 'recovery.json')
    recovery = json.loads((REPO/'outputs/r051-receipt-corrections'/recovery_name).read_text())
    artifact = Path('/workspace')/recovery['private_artifact_reference']/'before.dump'
    if (not recovery['restored_fingerprints_match'] or recovery['baseline_version'] != (69 if target_version==70 else 68 if target_version==69 else 67 if target_version==68 else (65 if target_version>=66 else (64 if target_version==65 else 58)))
            or hashlib.sha256(artifact.read_bytes()).hexdigest() != recovery['sha256']):
        raise ValueError('Verified DEV recovery missing or changed')
    hashes = source_hashes()
    validation_name='deployment-validation-v70.json' if target_version==70 else 'local-validation-v69.json' if target_version==69 else 'local-validation-v68.json' if target_version==68 else 'local-validation-v67.json' if target_version>=66 else 'local-validation.json'
    validation=json.loads((REPO/'outputs/r051-receipt-corrections'/validation_name).read_text())
    if not validation['passed'] or validation['source_sha256'] != hashes:
        raise ValueError('Exact migration source has not passed maintained local CI')
    if target_version==70:
        if not validation.get('execution_source_sha256') or any(hashlib.sha256((REPO/p).read_bytes()).hexdigest()!=h for p,h in validation['execution_source_sha256'].items()):
            raise ValueError('Reviewed V70 execution source changed')
    if target_version>=66:
        pins={'V66__linked_expense_reimbursement_consistency.sql':'b0ac780016bbf53011f7ec11037c59e8f0b23fbc521a939343bb30b2945d6dc9',
              'V67__receipt_delete_flag_required_check.sql':'3456e4a7c33eef4e9dfe66e910b2224a10843a313298da082177e913be52e430'}
        if target_version>=68:pins['V68__daily_type_conversion_uses_original_rate.sql']='2e9b4921e1aa6380f5537262a693bc859e591ef4bdd37ad5c95e2018a9b2abae'
        if target_version>=69:pins['V69__protect_original_defaulted_charges.sql']='c3df8be18e2b8b5dfc69039ef3183c62e34dda749291e7da977809fafbca2296'
        if target_version==70:pins['V70__protect_defaulted_legacy_repayments.sql']='7a7cd48b1973976ffe957794e82cdfb3964106a046a1861401af3d3c04d08a55'
        if any(hashes.get(k)!=v for k,v in pins.items()):raise ValueError('Reviewed immutable migration pin mismatch')
    def apply(c, params):
        if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
            raise ValueError('DEV target changed')
        before = c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank').fetchall()
        if before[-1] != {60:('58',1886180782),61:('60',1434947825),62:('61',-209051559),63:('62',-2039538011),64:('63',-1466229726),65:('64',1504057228),66:('65',-2087638333),67:('66',1095016248),68:('67',1721477385),69:('68',-79096429),70:('69',245428688)}[target_version]:
            raise ValueError('Expected reviewed DEV history; reconcile before proceeding')
        preservation = None
        def preserved_rows():
            c.execute("SET LOCAL timezone='UTC'")
            rows = fingerprints(c)
            rows.pop('public.flyway_schema_history')
            if target_version==65: rows['public.Payments'] = list(c.execute("SELECT count(*),md5(coalesce(string_agg(md5((to_jsonb(p)-'Delete Requested')::text),'' ORDER BY md5((to_jsonb(p)-'Delete Requested')::text)),'')) FROM public.\"Payments\" p").fetchone())
            return rows
        if target_version >= 65:
            c.execute("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'")
            recovered=json.loads((artifact.parent/'fingerprints.json').read_text())
            current=fingerprints(c)
            if target_version>=66:
                recovered.pop('public.flyway_schema_history');current.pop('public.flyway_schema_history')
            if current != recovered:
                raise ValueError('Source changed since fresh recovery; reconcile before migration')
            if target_version==66:
                violations=c.execute('''SELECT count(*) FROM "Cash Ledger" l LEFT JOIN "Business Expenses" e ON e."Row ID"=l."Ref Business Expense"
                 WHERE l."Entry Origin"='Manual' AND l."Movement Type"='Expense Reimbursement' AND l."Ref Business Expense" IS NOT NULL
                  AND (e."Amount"::numeric>0 AND e."Ref Paid By Cash Holder"='ch:tommy') IS NOT TRUE''').fetchone()[0]
                if violations:raise ValueError('Existing linked reimbursement invariant violation; no implicit repair')
            preservation = preserved_rows()
        c.rollback()
        env = {k:v for k,v in os.environ.items() if not k.startswith(('PG','CODEX_','FLYWAY_'))}
        env['FLYWAY_PASSWORD'] = params['password']
        command = ['/workspace/.setup/cloud-run','flyway','-outputType=json',
                   '-configFiles='+str(REPO/'database/flyway.conf'),
                   '-locations=filesystem:'+str(REPO/'database/migrations'),
                   '-url=jdbc:postgresql://127.0.0.1:'+str(params['port'])+'/loan_manager_dev',
                   '-user=postgres',"-initSql=SET lock_timeout='5s'; SET statement_timeout='30s'",'-target='+str(target_version)]
        try:
            result = json.loads(subprocess.run(command+['migrate'],env=env,cwd=REPO,capture_output=True,text=True,check=True,timeout=120).stdout)
            valid = json.loads(subprocess.run(command+['validate'],env=env,cwd=REPO,capture_output=True,text=True,check=True,timeout=60).stdout)
        except (subprocess.SubprocessError,ValueError) as error:
            # A client failure is an unknown outcome, never authority to replay.
            # Read the actual history and data through the still-owned connection.
            c.rollback()
            c.execute("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'")
            actual=c.execute('SELECT version,checksum,success FROM flyway_schema_history ORDER BY installed_rank').fetchall()
            unchanged=preserved_rows()==preservation if preservation is not None else None
            reconciliation=dict(target_version=target_version,error_type=type(error).__name__,
                actual_history=actual,business_fingerprints_unchanged=unchanged,
                automatic_retry=False,recovery_sha256=recovery['sha256'])
            (REPO/f'outputs/r051-receipt-corrections/dev-migration-v{target_version}-failure.json').write_text(json.dumps(reconciliation,indent=2)+'\n')
            c.rollback()
            raise RuntimeError('Migration/validation client failed; actual history recorded, reconcile before any replay') from None
        if not result['success'] or result['migrationsExecuted'] != (2 if target_version==60 else 1) or not valid['validationSuccessful']:
            raise ValueError('Unexpected DEV migration result; reconcile, do not replay')
        after = c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank').fetchall()
        added=after[len(before):]
        if after[:len(before)] != before or [v for v,ch in added] != (['59','60'] if target_version==60 else [str(target_version)]) or source_hashes()!=hashes:
            raise ValueError('Migration/history/source mismatch')
        if target_version>=66 and added != [(str(target_version),{66:1095016248,67:1721477385,68:-79096429,69:245428688,70:124258995}[target_version])]:
            raise ValueError('Applied reviewed checksum mismatch; do not replay')
        if preservation is not None:
            if preserved_rows() != preservation or c.execute('SELECT count(*) FROM "Payments" WHERE "Delete Requested"').fetchone()[0]:
                raise ValueError('Post-migration source preservation mismatch; reconcile, do not replay')
        c.rollback()
        return dict(database='loan_manager_dev',instance='appsheet-pg-prod-20260914',host='34.21.174.215',
                    migrated=added,validate=True,source_sha256=hashes,recovery_sha256=recovery['sha256'],
                    existing_rows_preserved=(preservation is not None),
                    preservation_scope=('25 non-history tables; Payments normalized without new Delete Requested column; all flags false' if target_version==65 else 'All25 non-history tables unchanged; flags false') if preservation is not None else None)
    result = dev_connection(apply)
    (REPO/('outputs/r051-receipt-corrections/dev-migration.json' if target_version==60 else f'outputs/r051-receipt-corrections/dev-migration-v{target_version}.json')).write_text(json.dumps(result,indent=2)+'\n')
    return result


def business_cases(sql):
    """Run independent business workflows in fresh transactions, one backend.

    Keep the maintained monolithic suite as the local transaction stress test.
    DEV additionally models pooled app connections: each complete source workflow
    rolls back before the next, without discarding the session's plan cache.
    """
    boundaries = [
        ('charges', '-- Source charge edit'),
        ('expenses', '-- Manual expense changes'),
        ('manual_cash', '-- Manual movement amounts'),
        ('settlements', '-- Settlement uses'),
        ('loans_and_masters', '-- Loan principal/current'),
        ('contributions', 'INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES(\'CRUD60-EXTRA\''),
        ('default_and_closure', '-- Default and prepared Loan Close'),
        ('generic_compatibility', 'SAVEPOINT generic_planning;'),
    ]
    if any(sql.count(text) != 1 for _, text in boundaries):
        raise ValueError('Broad suite boundaries changed; review workflow grouping')
    indexes = [sql.index(text) for _, text in boundaries]
    if indexes != sorted(indexes):
        raise ValueError('Broad workflow order changed')
    setup = sql[:indexes[0]]
    end = sql.index("SELECT 'Business source CRUD passed' AS result;")
    preservation = "SELECT pg_temp.assert((SELECT p=to_jsonb(x) FROM unrelated_receipt CROSS JOIN \"Payments\" x WHERE x.\"Row ID\"='CRUD60-P'),'independent receipt preserved by workflow');"
    result = []
    for i, (name, _) in enumerate(boundaries):
        body = sql[indexes[i]:indexes[i+1] if i+1<len(indexes) else end]
        result.append('\\echo R051_CASE '+name+'\n'+setup+body+'\n'+preservation+"\nSELECT 'R051 workflow "+name+" passed' AS result;\nROLLBACK;\n")
    return '\n'.join(result)


def test(business_only=False, grouped_business=True):
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
        if c.execute('SELECT max(version::integer) FROM flyway_schema_history WHERE success').fetchone()[0] != 64:
            raise ValueError('Expected tested V64')
        c.execute("SET LOCAL timezone='UTC'")
        before = fingerprints(c);c.rollback()
        env = {k:v for k,v in os.environ.items() if not k.startswith(('PG','CODEX_','FLYWAY_'))}
        env['PGPASSWORD'] = params['password']
        root = Path(tempfile.mkdtemp(prefix='r051-dev-tests-',dir='/workspace'));root.chmod(0o700)
        (root/'before-fingerprints.json').write_text(json.dumps(before))
        for p in files:
            sql = (business_cases(p.read_text()) if p.name=='Test-BusinessCrud.sql' and grouped_business else p.read_text()).replace('\\ir Test-CashAccountFixtures.sql',fixture).replace('CI-DAD','DEV-R051-DAD').replace('CI-LISA','DEV-R051-LISA')
            if ('COMMIT;' in sql.upper() or 'DISABLE TRIGGER' in sql.upper() or 'r008.initializing' in sql
                    or not sql.rstrip().endswith('ROLLBACK;') or '\\ir ' in sql):
                raise ValueError('Live fixture must be reviewed and rollback-contained')
            appname='r051-crud-'+root.name[-8:]+'-'+p.stem[-20:]
            env['PGAPPNAME']=appname
            settings="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';"
            sql="\\timing on\nSELECT pg_backend_pid() AS r051_backend_pid;\n"+sql.replace('BEGIN;',settings)
            with (root/(p.stem+'.log')).open('w') as log:
                process=subprocess.Popen([str(PG/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',params['host'],'-p',str(params['port']),
                                '-U','postgres','-d','loan_manager_dev'],stdin=subprocess.PIPE,env=env,stdout=log,stderr=log,text=True,start_new_session=True)
                try:
                    process.communicate(sql,timeout=420 if p.name=='Test-BusinessCrud.sql' and grouped_business else 180)
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
        return dict(database='loan_manager_dev',version=64,suites=names,rollback_contained=True,table_fingerprints_unchanged=len(before),
                    source_sha256=hashes,private_logs_reference=root.name,migration_source_sha256=source_hashes(),helper_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),business_workflows=('8 fresh rollback transactions in one backend' if grouped_business else 'single monolithic rollback transaction') if 'Test-BusinessCrud.sql' in names else None,notifications='SQL-only; no outbound sends')
    result = dev_connection(verify)
    (REPO/(('outputs/r051-receipt-corrections/dev-business-tests.json' if grouped_business else 'outputs/r051-receipt-corrections/dev-business-monolithic-tests.json') if business_only else 'outputs/r051-receipt-corrections/dev-tests.json')).write_text(json.dumps(result,indent=2)+'\n')
    return result



def verify_ui_fixture_target(c):
    if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
        raise ValueError('DEV target changed')
    if c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() != ('70',124258995):
        raise ValueError('Expected validated V70/checksum124258995')


def ui_fixtures(mode, browser_reference):
    if not browser_reference:
        raise ValueError('Browser notification-containment readiness reference required')
    manifest = REPO/'outputs/r051-receipt-corrections/ui-fixture-state.json'
    if mode=='ui-create' and manifest.exists():
        raise ValueError('Fixture state exists; reconcile before any retry')
    script = REPO/'scripts/database'/('R051-UiFixtures.sql' if mode=='ui-create' else 'R051-UiCleanup.sql')
    def perform(c, params):
        verify_ui_fixture_target(c)
        c.execute("SET LOCAL timezone='UTC'")
        private_state=None
        if mode=='ui-create':
            private_state=Path(tempfile.mkdtemp(prefix='r051-ui-baseline-',dir='/workspace'));private_state.chmod(0o700)
            (private_state/'fingerprints.json').write_text(json.dumps(fingerprints(c)))
        else:
            prior=json.loads(manifest.read_text())
            private_state=Path('/workspace')/prior['private_baseline_reference']
        c.execute("SET LOCAL timezone='Asia/Bangkok'")
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
    p.add_argument('mode', choices=['backup','backup-v64','backup-v65','backup-v67','backup-v68','backup-v69','migrate','migrate-refinement','migrate-planning','migrate-coalescing','migrate-aggregate','migrate-receipt-delete','migrate-reimbursement','migrate-flag-metadata','migrate-daily-conversion','migrate-default-charge-guard','migrate-default-repayment-guard','test','test-business','test-business-monolithic','ui-create','ui-cleanup'])
    p.add_argument('--browser-ready-reference')
    p.add_argument('--expected-commit')
    p.add_argument('--window-reference')
    args = p.parse_args()
    result=ui_fixtures(args.mode,args.browser_ready_reference) if args.mode.startswith('ui-') else {'backup':backup,'backup-v64':lambda:backup(64),'backup-v65':lambda:backup(65),'backup-v67':lambda:backup(67),'backup-v68':lambda:backup(68),'backup-v69':lambda:backup(69),'migrate':migrate,'migrate-refinement':lambda:migrate(61),'migrate-planning':lambda:migrate(62),'migrate-coalescing':lambda:migrate(63),'migrate-aggregate':lambda:migrate(64),'migrate-receipt-delete':lambda:migrate(65),'migrate-reimbursement':lambda:migrate(66),'migrate-flag-metadata':lambda:migrate(67),'migrate-daily-conversion':lambda:migrate(68),'migrate-default-charge-guard':lambda:migrate(69),'migrate-default-repayment-guard':lambda:migrate(70,args.expected_commit,args.window_reference),'test':test,'test-business':lambda:test(True),'test-business-monolithic':lambda:test(True,False)}[args.mode]()
    print(json.dumps(result))
