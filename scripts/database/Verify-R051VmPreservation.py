"""Compare final DEV sources with the verified pre-change private restore.

Only starts/stops the existing loopback restore; live transactions are read-only.
Exact task IDs are recovered from private inventories. Derived analytics are
reported separately, since removing fixtures legitimately changes their totals.
"""
import hashlib
import json
import os
import socket
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql

repo = Path(__file__).resolve().parents[2]
target = json.loads((repo / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == ('appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
backup = json.loads((repo / 'outputs/r051-receipt-corrections/vm01-development-backup.json').read_text())
assert hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest() == backup['backup_sha256']
private = Path(backup['backup_file']).parent.parent
data = Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/private-restores/r051-20261006T110359Z'
pgctl = Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin/pg_ctl.exe'
assert data.is_dir() and pgctl.is_file()
excluded = defaultdict(set)


def inventory(value):
    if not isinstance(value, dict): return
    for key, item in value.items():
        if isinstance(item, list) and all(isinstance(r,dict) and 'Row ID' in r for r in item):
            excluded[key].update(r['Row ID'] for r in item)
        elif isinstance(item, dict):
            if 'Row ID' in item and key in ('Loan Assessment', 'Loan Assessment SQL Lab'):
                excluded[key].add(item['Row ID'])
            inventory(item)


for file in list(private.glob('vm01-*.json')) + list(Path(backup['backup_file']).parent.glob('vm01-*.json')):
    inventory(json.loads(file.read_text(encoding='utf-8')))
excluded['Borrowers'].add('C6dHbB4yx2sneL4Xy9AO8x')


def capture(c):
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL timezone='UTC'")
    c.execute("SET LOCAL statement_timeout='30s'")
    result = {}
    for schema, table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        result[schema + '.' + table] = [r[0] for r in c.execute(sql.SQL('SELECT to_jsonb(t) FROM {}.{} t').format(sql.Identifier(schema), sql.Identifier(table)))]
    return result


def normalized(rows, table):
    kept = [r for r in rows if not is_fixture(r, table)]
    return sorted(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in kept)


def is_fixture(row, table):
    return (row.get('Row ID') in excluded[table]
            or str(row.get('Row ID', '')).startswith('SYN-R051-')
            or any(isinstance(v, str) and v.startswith('SYN-R051-')
                   for k, v in row.items() if k.startswith('Ref ')))


with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
startup = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
started = False


def control(arguments, name):
    # A Windows postmaster inherits redirected pipe handles; use a private file.
    with (private / name).open('wb') as output:
        subprocess.run(arguments, check=True, stdout=output, stderr=subprocess.STDOUT, **startup)


try:
    control([str(pgctl), '-D', str(data), '-l', str(data / 'postgres.log'), '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start'], 'vm01-preservation-start.log')
    started = True
    with psycopg.connect(host='127.0.0.1', port=port, user='postgres', dbname='postgres') as c:
        assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() == data.resolve()
        c.rollback()
        baseline = capture(c)
        assert c.execute('SELECT version FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('70',)
    with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
        assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone() == ('loan_manager_dev', target['host'], 'postgres')
        c.rollback()
        final = capture(c)
        assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
        nonowner = c.execute('SELECT count(*) FROM public."Partners" WHERE coalesce("Email",\'\') NOT IN (\'\',\'welct0407@mw-credit.com\')').fetchone()[0]
    source_results = {}
    diffs = {}
    # Recover older generated children removed by successful GUI source actions,
    # which no longer occur in the final cleanup inventory.
    for snapshot in (baseline, final):
        changed = True
        while changed:
            changed = False
            known = set().union(*excluded.values())
            for name, rows in snapshot.items():
                table = name.split('.', 1)[1]
                for row in rows:
                    key = row.get('Row ID')
                    related = any(isinstance(v, str) and v in known for k, v in row.items() if k.startswith('Ref '))
                    if key and (is_fixture(row, table) or related) and key not in excluded[table]:
                        excluded[table].add(key)
                        changed = True
    derived = {'public.Daily Analytics', 'public.Cash Account Daily Analytics', 'public.Statistics'}
    for name in baseline:
        if name == 'public.flyway_schema_history': continue
        table = name.split('.',1)[1]
        before, after = normalized(baseline[name], table), normalized(final[name], table)
        residue = [r for r in final[name] if is_fixture(r, table)]
        if name not in derived:
            source_results[name] = {'baseline_nonfixture_rows': len(before), 'final_nonfixture_rows': len(after), 'equal': before == after, 'fixture_residue': len(residue)}
            if before != after: diffs[name] = {'before_only': sorted(set(before)-set(after)), 'after_only': sorted(set(after)-set(before))}
    private_result = private / 'vm01-final-source-differences.json'
    private_result.write_text(json.dumps(diffs, indent=2, ensure_ascii=False), encoding='utf-8')
    result = {'checked_at': datetime.now(timezone.utc).isoformat(), 'database': 'loan_manager_dev', 'version': 72, 'backup_sha256': backup['backup_sha256'],
              'sources': source_results, 'all_nonfixture_sources_equal': all(r['equal'] for r in source_results.values()),
              'fixture_residue': sum(r['fixture_residue'] for r in source_results.values()), 'nonowner_delivery_addresses': nonowner,
              'derived_analytics': {name: {'baseline_rows': len(baseline[name]), 'final_rows': len(final[name]), 'comparison': 'Recomputed after synthetic source cleanup; not a raw equality claim'} for name in sorted(derived)},
              'private_difference_file': str(private_result), 'restore_stopped': True}
finally:
    if started: control([str(pgctl), '-D', str(data), '-m', 'fast', '-w', 'stop'], 'vm01-preservation-stop.log')
(repo / 'outputs/r051-receipt-corrections/vm01-final-preservation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
assert result['all_nonfixture_sources_equal'] and result['fixture_residue'] == 0 and nonowner == 0
