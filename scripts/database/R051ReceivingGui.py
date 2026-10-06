"""Bounded V73 DEV fixtures for current GUI receipt tests. No real source mutation."""
import argparse, hashlib, json, sys
from pathlib import Path
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
from R051ReceivingFixtures import setup
p=argparse.ArgumentParser();p.add_argument('action',choices=['seed','read','cleanup']);p.add_argument('--evidence-dir',default='outputs/r051-payment-performance');p.add_argument('--expected-version',type=int,default=73);args=p.parse_args()
repo=Path(__file__).resolve().parents[2];out=(repo/args.evidence_dir).resolve()
assert out.is_relative_to((repo/'outputs').resolve())
b=json.loads((out/'vm01-development-backup.json').read_text());assert b['restored_fingerprints_match']
assert hashlib.sha256(Path(b['backup_file']).read_bytes()).hexdigest()==b['backup_sha256']
t=json.loads((repo/'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15) as c:
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('loan_manager_dev',t['host'])
    assert c.execute('SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==(str(args.expected_version),)
    assert not c.execute('SELECT 1 FROM "Partners" WHERE coalesce("Email",\'\') NOT IN (\'\',\'welct0407@mw-credit.com\')').fetchall()
    c.execute("SET LOCAL timezone='Asia/Bangkok'; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s'")
    if args.action=='seed':
        assert not c.execute('SELECT 1 FROM "Borrowers" WHERE "Row ID"=\'SYN-R051-RECV-B\'').fetchall()
        setup(c,'loan_close',track=False)
        c.execute('UPDATE "Borrowers" SET "Ref Preferred Receiving Cash Account"=\'SYN-R051-RECV-DAD\' WHERE "Row ID"=\'SYN-R051-RECV-B\'')
    elif args.action=='cleanup':
        assert c.execute('SELECT "Borrower Name" FROM "Borrowers" WHERE "Row ID"=\'SYN-R051-RECV-B\'').fetchone()==('Synthetic receiving performance',)
        payments=c.execute('SELECT "Row ID" FROM "Payments" WHERE "Ref Borrower"=\'SYN-R051-RECV-B\' ORDER BY ("Allocation Method"=\'Loan Close\') DESC,"Created At" DESC').fetchall()
        for (key,) in payments: c.execute('DELETE FROM "Payments" WHERE "Row ID"=%s AND "Ref Borrower"=\'SYN-R051-RECV-B\'',(key,))
        c.execute('DELETE FROM "Charges" WHERE "Ref Loans"=\'SYN-R051-RECV-L\'')
        c.execute('DELETE FROM "Loans" WHERE "Row ID"=\'SYN-R051-RECV-L\' AND "Ref Borrowers"=\'SYN-R051-RECV-B\'')
        c.execute('DELETE FROM "Borrowers" WHERE "Row ID"=\'SYN-R051-RECV-B\'')
        c.execute('DELETE FROM "Cash Account Daily Analytics" WHERE "Ref Cash Account"=ANY(%s)',[['SYN-R051-RECV-LISA','SYN-R051-RECV-DAD']])
        c.execute('DELETE FROM "Cash Accounts" WHERE "Row ID"=ANY(%s)',[['SYN-R051-RECV-LISA','SYN-R051-RECV-DAD']])
    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
    rows={
        'Payments':c.execute('SELECT "Row ID","Allocation Method","Amount Received"::numeric,"Status","Posted Amount"::numeric FROM "Payments" WHERE "Ref Borrower"=\'SYN-R051-RECV-B\' ORDER BY "Created At"').fetchall(),
        'Charges':c.execute('SELECT "Row ID","Amount Remaining"::numeric FROM "Charges" WHERE "Ref Loans"=\'SYN-R051-RECV-L\' ORDER BY "Row ID"').fetchall(),
        'Loans':c.execute('SELECT "Row ID","Loan Status","Outstanding Principal"::numeric FROM "Loans" WHERE "Row ID"=\'SYN-R051-RECV-L\'').fetchall(),
    }
    if args.action=='cleanup': assert not any(rows.values())
    c.commit() if args.action!='read' else c.rollback()
    print(json.dumps({'action':args.action,'synthetic':rows},default=str))
