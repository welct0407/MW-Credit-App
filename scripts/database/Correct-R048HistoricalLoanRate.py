"""One-loan R048 owner-confirmed data correction; private input and backup required.

Rehearse by default against a restored PROD snapshot. --apply uses the same
private input and verified backup, then makes the guarded correction in PROD.
No borrower identity or loan values are written into the repository.
"""
import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql
from psycopg.rows import dict_row

REPO = Path(__file__).resolve().parents[2]
PRIVATE = Path.home() / 'Documents/ChatGPT/AppSheet-Loan-Project/r048-loan-interest-correction'
OUTPUT = REPO / 'outputs/r048-loan-interest-correction'
TARGET = json.loads((REPO / 'database/environments.json').read_text())['production']
assert (TARGET['instance'], TARGET['host'], TARGET['database']) == (
    'appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_prod')
PGBIN = Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
STARTUP = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def command(args, logfile, environment=None):
    with logfile.open('wb') as stream:
        subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT,
                       env=environment, check=True, **STARTUP)


def identity(conn, expected_database, expected_host=None):
    actual = conn.execute("SELECT current_database(),host(inet_server_addr()),current_setting('transaction_read_only'),(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())").fetchone()
    assert actual[0] == expected_database
    if expected_host:
        assert actual[1] == expected_host and actual[3] is True


def fingerprints(conn):
    result = {}
    for schema, table in conn.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        query = sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema), sql.Identifier(table))
        result[schema + '.' + table] = conn.execute(query).fetchone()
    return result


def get_loan(conn, row_id):
    return conn.execute('SELECT to_jsonb(l) FROM public."Loans" l WHERE "Row ID"=%s', (row_id,)).fetchone()[0]


def correct(conn, data):
    row_id = data['row_id']
    before = get_loan(conn, row_id)
    assert before is not None
    assert before['Original Daily Interest Rate'] is None
    assert before['Loan Arrangement'] == data['expected_arrangement']
    assert before['Loan Type'] == 'ดอกเบี้ยรายวัน'
    assert before['Loan Status'] == 'ปิดยอดแล้ว'
    assert before['Loan Date'] == data['expected_loan_date']
    assert before['Principal Amount'] == data['expected_principal']
    assert before['Current Daily Interest'] == data['expected_daily_interest']
    assert before['Total Principal Received'] == data['expected_principal_received']
    assert float(before['Outstanding Principal']) == 0
    assert data['confirmed_original_daily_interest'] > 0
    assert data['confirmed_original_principal'] > 0
    rate = int(100 * data['confirmed_original_daily_interest'] /
               data['confirmed_original_principal'] + 0.5)
    assert rate == data['expected_rate']
    basis = f"[Original daily interest: {data['confirmed_original_daily_interest']} baht/day on {data['confirmed_original_principal']} baht principal]"
    assert '[Original daily interest:' not in before['Loan Arrangement']
    arrangement = before['Loan Arrangement'] + '\n' + basis
    assert conn.execute('SELECT public.daily_interest_basis(%s)', (arrangement,)).fetchone()[0] == [
        data['confirmed_original_daily_interest'], data['confirmed_original_principal']]
    # V53's update guard derives from the *previous* row. The first update
    # stores the original evidence; the second derives the frozen rate.
    first = conn.execute('UPDATE public."Loans" SET "Loan Arrangement"=%s WHERE "Row ID"=%s AND "Original Daily Interest Rate" IS NULL AND "Loan Arrangement"=%s RETURNING "Row ID"',
                         (arrangement, row_id, before['Loan Arrangement'])).fetchall()
    assert len(first) == 1
    middle = get_loan(conn, row_id)
    assert middle['Original Daily Interest Rate'] is None
    second = conn.execute('UPDATE public."Loans" SET "Original Daily Interest Rate"=%s WHERE "Row ID"=%s AND "Loan Arrangement"=%s RETURNING "Original Daily Interest Rate"',
                          (rate, row_id, arrangement)).fetchall()
    assert len(second) == 1 and second[0][0] == rate
    after = get_loan(conn, row_id)
    expected = dict(before)
    expected['Loan Arrangement'] = arrangement
    expected['Original Daily Interest Rate'] = rate
    assert after == expected, {k for k in after if after[k] != expected[k]}
    return {'rate_before': None, 'rate_after': rate, 'arrangement_note_added': True,
            'only_row_fields_changed': ['Loan Arrangement', 'Original Daily Interest Rate'],
            'financial_values_unchanged': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--rehearsal', type=Path)
    args = parser.parse_args()
    input_path = PRIVATE / 'owner-confirmed-input.json'
    assert input_path.exists() and input_path.resolve().is_relative_to(PRIVATE.resolve())
    data = json.loads(input_path.read_text(encoding='utf8'))
    assert data['owner_confirmation'] == 'yes to 400 baht/day on 4000 baht principal in R048 chat'
    password = Path(TARGET['passwordFile']).read_text().strip()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if args.apply:
        assert args.rehearsal and args.rehearsal.resolve().is_relative_to(PRIVATE.resolve())
        verified = json.loads((args.rehearsal / 'rehearsal-private.json').read_text(encoding='utf8'))
        assert verified['restored_fingerprints_match'] and verified['targeted_rehearsal_passed']
        assert hashlib.sha256(Path(verified['backup_file']).read_bytes()).hexdigest() == verified['backup_sha256']
        with psycopg.connect(host=TARGET['host'], port=TARGET['port'], dbname=TARGET['database'], user=TARGET['user'],
                             password=password, sslmode='require', connect_timeout=15) as conn:
            identity(conn, TARGET['database'], TARGET['host'])
            assert conn.execute("SELECT max(version::integer) FROM public.flyway_schema_history WHERE success").fetchone()[0] == 53
            result = correct(conn, data)
            conn.commit()
            actual = get_loan(conn, data['row_id'])
            assert actual['Original Daily Interest Rate'] == data['expected_rate']
            missing = conn.execute('SELECT count(*) FROM public."Loans" WHERE "Original Daily Interest Rate" IS NULL').fetchone()[0]
            assert missing == 0
        evidence = {'environment': 'production', 'instance': TARGET['instance'], 'database': TARGET['database'],
                    'history': 53, 'backup_sha256': verified['backup_sha256'], 'restored_backup_verified': True,
                    'rehearsed': True, 'owner_confirmed': True, 'result': result, 'loans_missing_rate': missing,
                    'app_versions_unchanged': True}
        (OUTPUT / 'correction-verification.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf8')
        print(json.dumps(evidence))
        return

    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = PRIVATE / stamp
    folder.mkdir(parents=True, exist_ok=False)
    dump = folder / 'production-before.dump'
    env = dict(os.environ, PGPASSWORD=password, PGSSLMODE='require')
    with psycopg.connect(host=TARGET['host'], port=TARGET['port'], dbname=TARGET['database'], user=TARGET['user'],
                         password=password, sslmode='require', connect_timeout=15) as conn:
        conn.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        conn.execute("SET LOCAL timezone='UTC'")
        conn.execute("SET LOCAL lc_monetary='C'")
        identity(conn, TARGET['database'], TARGET['host'])
        assert conn.execute("SELECT max(version::integer) FROM public.flyway_schema_history WHERE success").fetchone()[0] == 53
        before = fingerprints(conn)
        snapshot = conn.execute('SELECT pg_export_snapshot()').fetchone()[0]
        command([str(PGBIN / 'pg_dump.exe'), '-h', TARGET['host'], '-p', str(TARGET['port']), '-U', TARGET['user'],
                 '-d', TARGET['database'], '-Fc', '--no-owner', '--no-privileges', '--schema=public',
                 '--schema=assessment_lab', '--schema=agent_audit', '--snapshot=' + snapshot,
                 '--file=' + str(dump)], folder / 'dump.log', env)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    directory = folder / 'restore-data'
    command([str(PGBIN / 'initdb.exe'), '-D', str(directory), '-U', 'postgres', '--auth=trust',
             '--encoding=UTF8', '--locale=C'], folder / 'initdb.log')
    started = False
    try:
        command([str(PGBIN / 'pg_ctl.exe'), '-D', str(directory), '-l', str(folder / 'postgres.log'),
                 '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start'], folder / 'start.log')
        started = True
        with psycopg.connect(host='127.0.0.1', port=port, user='postgres', dbname='postgres', autocommit=True) as conn:
            assert Path(conn.execute('SHOW data_directory').fetchone()[0]).resolve() == directory.resolve()
            conn.execute('DROP SCHEMA public')  # Disposable empty loopback database.
        command([str(PGBIN / 'pg_restore.exe'), '-h', '127.0.0.1', '-p', str(port), '-U', 'postgres',
                 '-d', 'postgres', '--no-owner', '--no-privileges', '--exit-on-error', str(dump)],
                folder / 'restore.log')
        with psycopg.connect(host='127.0.0.1', port=port, user='postgres', dbname='postgres') as conn:
            identity(conn, 'postgres')
            conn.execute("SET LOCAL timezone='UTC'")
            conn.execute("SET LOCAL lc_monetary='C'")
            restored = fingerprints(conn)
            if restored != before:
                print(json.dumps({'restore_fingerprint_mismatch_tables': [k for k in before if before[k] != restored.get(k)]}))
            assert restored == before
            other_loans = conn.execute('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(l)::text),\'\' ORDER BY md5(to_jsonb(l)::text)),\'\')) FROM public."Loans" l WHERE "Row ID"<>%s', (data['row_id'],)).fetchone()
            result = correct(conn, data)
            after_fingerprints = fingerprints(conn)
            assert {k: v for k, v in after_fingerprints.items() if k != 'public.Loans'} == {
                k: v for k, v in before.items() if k != 'public.Loans'}
            assert after_fingerprints['public.Loans'][0] == before['public.Loans'][0]
            assert conn.execute('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(l)::text),\'\' ORDER BY md5(to_jsonb(l)::text)),\'\')) FROM public."Loans" l WHERE "Row ID"<>%s', (data['row_id'],)).fetchone() == other_loans
            conn.rollback()
    finally:
        if started:
            command([str(PGBIN / 'pg_ctl.exe'), '-D', str(directory), '-m', 'fast', '-w', 'stop'], folder / 'stop.log')
    private = {'backup_file': str(dump), 'backup_sha256': hashlib.sha256(dump.read_bytes()).hexdigest(),
               'restored_fingerprints_match': True, 'targeted_rehearsal_passed': True,
               'all_other_rows_unchanged': True, 'result': result}
    (folder / 'rehearsal-private.json').write_text(json.dumps(private, indent=2) + '\n', encoding='utf8')
    safe = {'backup_location': str(dump), 'backup_sha256': private['backup_sha256'],
            'restored_fingerprints_match': True, 'targeted_rehearsal_passed': True,
            'result': result, 'scope': 'public, assessment_lab, agent_audit'}
    (OUTPUT / 'rehearsal.json').write_text(json.dumps(safe, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'rehearsal': str(folder), 'backup_sha256': private['backup_sha256'], 'result': result}))


if __name__ == '__main__':
    main()
