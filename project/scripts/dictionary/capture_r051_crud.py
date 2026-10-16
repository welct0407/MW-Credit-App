"""Read only the DEV catalog objects affected by R051 migrations 59 through72."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from common import REPO

target = json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == ('mw-credit-pg-20261017', 'TO_FILL_AFTER_CREATE_HOST', 'loan_manager_dev')
migrations = [p for p in (DATABASE_REPO_ROOT / 'database/migrations').glob('V*__*.sql') if 59 <= int(p.name.split('__')[0][1:]) <= 72]
names = set()
for p in migrations:
    names.update(re.findall(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_]+\.[a-z_0-9]+)\s*\(', p.read_text(encoding='utf-8'), re.I))
tables = ['Payments', 'Cash Ledger', 'Loan Assessment', 'Loan Assessment SQL Lab', 'Loans', 'Business Expenses', 'Settlements', 'Cash Accounts', 'Repayments', 'Charges']
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL statement_timeout='30s'")
    assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone() == ('loan_manager_dev', target['host'], 'postgres')
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
    routines = [{'name': schema + '.' + name + '(' + args + ')', 'definition': definition} for schema, name, args, definition in c.execute('''SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname||'.'||p.proname=ANY(%s) ORDER BY 1,2,3''', [sorted(names)])]
    assert {r['name'].split('(')[0] for r in routines} == names
    relations = []
    for table in tables:
        oid = c.execute('SELECT to_regclass(%s)::oid', ['public."' + table + '"']).fetchone()[0]
        assert oid
        constraints = dict(c.execute('SELECT conname,pg_get_constraintdef(oid,true) FROM pg_constraint WHERE conrelid=%s ORDER BY conname', [oid]))
        triggers = dict(c.execute('SELECT tgname,pg_get_triggerdef(oid,true) FROM pg_trigger WHERE tgrelid=%s AND NOT tgisinternal ORDER BY tgname', [oid]))
        columns = [{'name': n, 'type': t, 'not_null': nn, 'default': d} for n,t,nn,d in c.execute('''SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum''', [oid])]
        relations.append({'name': 'public.' + table, 'columns': columns, 'constraints': constraints, 'triggers': triggers})
result = {'captured_at': datetime.now(timezone.utc).isoformat(), 'environment': 'development', 'database': target['database'], 'version': 72,
          'scope': 'Catalog definitions only, affected R051 routines and relation metadata; no business rows, roles or credentials',
          'migrations': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(migrations)}, 'routines': routines, 'relations': relations}
out = REPO / 'outputs/r051-receipt-corrections/vm01-sql-definitions-20261006.json'
assert not out.exists(), 'Capture exists; preserve dated evidence'
out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({'routines': len(routines), 'relations': len(relations), 'business_rows_read': 0}))
