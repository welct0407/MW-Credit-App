"""Plan/apply bounded DEV read-role column grants; never changes source rows or migrations."""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, r'C:/Users/MWCredit/AppData/Local/AppSheetLoanTools/python-deps')
import psycopg
from psycopg import sql
ROOT = Path(__file__).resolve().parents[1]
ROLE = 'mw-credit-app-read-dev@clever-oasis-508610-n7.iam'
COLUMNS = {
    'Borrowers': ['Row ID', 'Borrower Name', 'Creation Date', 'Hidden Flag', 'Total Outstanding Principal', 'Has Active Loan', 'Borrower Note', 'Description', 'Total Interest Earned'],
    'Partners': ['Row ID', 'Login Email'],
    'Loans': ['Row ID', 'Ref Borrowers', 'Loan Date', 'Due Date', 'Close Date', 'Loan Type', 'Loan Status', 'Principal Amount', 'Outstanding Principal', 'Total Principal Received', 'Total Interest Received', 'Total Amount Received', 'Defaulted', 'Auto Charge Enabled', 'Original Daily Interest Rate'],
}
PRIVATE = Path(r'C:/Users/MWCredit/Documents/ChatGPT/MW-Credit-App')

def inspect(conn):
    flags = conn.execute('SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=%s', (ROLE,)).fetchone()
    if flags is None or any(flags):
        raise RuntimeError('Expected existing non-elevated IAM role')
    members = [r[0] for r in conn.execute("SELECT rolname FROM pg_roles WHERE rolname<>%s AND pg_has_role(%s,oid,'MEMBER') ORDER BY 1", (ROLE, ROLE))]
    if members != ['cloudsqliamserviceaccount']:
        raise RuntimeError('Unexpected role memberships')
    readable = conn.execute("""SELECT n.nspname,c.relname,a.attname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
        AND c.relkind IN ('r','v','m','p') AND a.attnum>0 AND NOT a.attisdropped
        AND has_column_privilege(%s,c.oid,a.attnum,'SELECT') ORDER BY 1,2,3""", (ROLE,)).fetchall()
    expected = {('public', table, col) for table, cols in COLUMNS.items() for col in cols}
    if not set(readable).issubset(expected):
        raise RuntimeError('Unexpected business SELECT privilege')
    writable = conn.execute("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
        AND c.relkind IN ('r','v','m','p') AND has_table_privilege(%s,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')""", (ROLE,)).fetchone()[0]
    column_writes = conn.execute("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname !~ '^pg_' AND c.relkind IN ('r','v','m','p') AND a.attnum>0 AND NOT a.attisdropped
        AND has_column_privilege(%s,c.oid,a.attnum,'INSERT,UPDATE,REFERENCES')""", (ROLE,)).fetchone()[0]
    creates = conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname !~ '^pg_' AND has_schema_privilege(%s,oid,'CREATE')", (ROLE,)).fetchone()[0]
    if writable or column_writes or creates:
        raise RuntimeError('Unexpected write or schema-create privilege')
    return {'role': ROLE, 'memberships': members, 'readableColumns': readable, 'businessWritePrivileges': 0, 'businessSchemaCreatePrivileges': 0}

def recovery_guide(recovery):
    """Operator recovery aid, not an automatic ACL replay or permission to roll back."""
    old_settings = {}
    for setting_row in recovery['settings']:
        for setting in setting_row[0] or []:
            name, value = setting.split('=', 1)
            old_settings[name] = value
    setting_sql = []
    for name in ('default_transaction_read_only', 'statement_timeout'):
        if not any(statement.startswith('ALTER ROLE ') and name in statement for statement in recovery['plannedStatements']):
            continue
        if name in old_settings:
            statement = sql.SQL('ALTER ROLE {} IN DATABASE loan_manager_dev SET {} TO {}').format(
                sql.Identifier(ROLE), sql.Identifier(name), sql.Literal(old_settings[name]))
        else:
            statement = sql.SQL('ALTER ROLE {} IN DATABASE loan_manager_dev RESET {}').format(
                sql.Identifier(ROLE), sql.Identifier(name))
        setting_sql.append(statement.as_string())
    return {
        'automaticRollback': False,
        'steps': [
            'Use a separately authorized recovery window. Stop or contain the dedicated DEV read service first; keep the existing AppSheet apps and IAM readiness service unchanged.',
            'Open a transaction against the recorded DEV host/database and verify current_database(), inet_server_addr() and the exact existing IAM role. Never replay this snapshot against PROD.',
            'Take a fresh private ACL/settings snapshot and compare it with this pre-change snapshot and the recorded planned statements (the snapshot itself does not establish that apply committed). If unrelated grants, grantors, role membership or settings changed, reconcile them before proceeding; do not overwrite them.',
            'For this role only, undo the added CONNECT on loan_manager_dev, USAGE on public, and SELECT on the listed approved columns only where the corresponding direct privilege did not already exist in this snapshot. Use REVOKE with RESTRICT (never CASCADE). Preserve existing privileges, grant options, grantor provenance, table-level grants and PUBLIC/inherited privileges. Do not restore entire raw ACL arrays or revoke from other roles.',
            'Execute restoreSettingsSql below only for database-local settings actually changed by this batch (the list is empty when settings were preserved). A missing prior setting means RESET, not ALTER ROLE RESET ALL. Preserve all other settings and global role defaults.',
            'Compare the scoped role privileges and settings with this snapshot, run the same non-elevated-role and no-business-write checks, then commit. On mismatch or failure roll back the transaction. Retain both snapshots and only resume the read service if its required access remains appropriate.'
        ],
        'restoreSettingsSql': setting_sql,
        'privilegeScope': {'database': {'loan_manager_dev': ['CONNECT']},
                           'schema': {'public': ['USAGE']},
                           'columnSelect': COLUMNS},
    }


def run(apply):
    target = json.loads((ROOT/'database/environments.json').read_text())['development']
    if (target['instance'],target['host'],target['database']) != ('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev'):
        raise RuntimeError('Unexpected DEV configuration')
    result = None
    with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=10) as conn:
        conn.execute('BEGIN' if apply else 'BEGIN READ ONLY')
        if conn.execute('SELECT current_database(),host(inet_server_addr())').fetchone() != ('loan_manager_dev','34.21.174.215'):
            raise RuntimeError('Unexpected actual DEV database')
        before = inspect(conn)
        statements = []
        if not conn.execute("SELECT has_database_privilege(%s,current_database(),'CONNECT')", (ROLE,)).fetchone()[0]:
            statements.append(sql.SQL('GRANT CONNECT ON DATABASE loan_manager_dev TO {}').format(sql.Identifier(ROLE)))
        if not conn.execute("SELECT has_schema_privilege(%s,'public','USAGE')", (ROLE,)).fetchone()[0]:
            statements.append(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(sql.Identifier(ROLE)))
        existing = set(before['readableColumns'])
        for table, columns in COLUMNS.items():
            missing = [col for col in columns if ('public', table, col) not in existing]
            if missing:
                statements.append(sql.SQL('GRANT SELECT ({}) ON TABLE public.{} TO {}').format(sql.SQL(', ').join(map(sql.Identifier, missing)), sql.Identifier(table), sql.Identifier(ROLE)))
        current_settings = {}
        for row in conn.execute('SELECT setconfig FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM pg_roles WHERE rolname=%s) AND setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())', (ROLE,)):
            for setting in row[0] or []:
                key, value = setting.split('=', 1)
                current_settings[key] = value
        for key, value in [('default_transaction_read_only', 'on'), ('statement_timeout', '5000ms')]:
            allowed = [value, '5s', '5000'] if key == 'statement_timeout' else [value]
            if current_settings.get(key) not in allowed:
                statements.append(sql.SQL('ALTER ROLE {} IN DATABASE loan_manager_dev SET {} TO {}').format(sql.Identifier(ROLE), sql.Identifier(key), sql.Literal(value)))
        if apply:
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            recovery = dict(before)
            recovery['formatVersion'] = 1
            recovery['capturedAt'] = datetime.now(timezone.utc).isoformat()
            recovery['target'] = {'instance': target['instance'], 'host': target['host'], 'port': target['port'], 'database': target['database']}
            recovery['operator'] = conn.execute('SELECT current_user').fetchone()[0]
            recovery['plannedStatements'] = [statement.as_string(conn) for statement in statements]
            recovery['databaseAcl'] = conn.execute("SELECT datacl::text FROM pg_database WHERE datname='loan_manager_dev'").fetchone()[0]
            recovery['schemaAcl'] = conn.execute("SELECT nspacl::text FROM pg_namespace WHERE nspname='public'").fetchone()[0]
            recovery['columnAcls'] = conn.execute("SELECT c.relname,a.attname,a.attacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname=ANY(%s) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2", (list(COLUMNS),)).fetchall()
            recovery['tableAcls'] = conn.execute("SELECT relname,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY(%s)", (list(COLUMNS),)).fetchall()
            recovery['settings'] = conn.execute('SELECT setconfig FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM pg_roles WHERE rolname=%s) AND setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())',(ROLE,)).fetchall()
            recovery['recoveryGuide'] = recovery_guide(recovery)
            PRIVATE.mkdir(parents=True,exist_ok=True)
            recovery_path = PRIVATE / ('read-role-before-'+stamp+'.json')
            with recovery_path.open('x',encoding='utf-8') as f: json.dump(recovery,f,indent=2)
            for statement in statements: conn.execute(statement)
            after=inspect(conn)
            if len(after['readableColumns']) != sum(map(len,COLUMNS.values())):
                raise RuntimeError('Incomplete column-grant verification')
            result = {'mode':'applied','database':'loan_manager_dev','recoveryPath':str(recovery_path),'verification':after}
        else:
            result = {'mode':'plan','database':'loan_manager_dev','before':before,'statements':[s.as_string(conn) for s in statements]}
    # psycopg commits on successful context exit. Never report success before that succeeds.
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true',help='Apply the reviewed DEV privilege plan; default is read-only plan.')
    run(parser.parse_args().apply)
