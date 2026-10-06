"""Bounded DEV GUI fixture lifecycle, exact synthetic keys only; V73 required."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
from R051PerformanceFixtures import setup
p=argparse.ArgumentParser();p.add_argument('action',choices=['seed','read','cleanup']);args=p.parse_args()
repo=Path(__file__).resolve().parents[2];out=repo/'outputs/r051-trigger-performance'
b=json.loads((out/'vm01-development-backup.json').read_text());assert b['restored_fingerprints_match']
t=json.loads((repo/'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15) as c:
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('loan_manager_dev',t['host'])
    assert c.execute('SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==('73',)
    assert not c.execute('SELECT 1 FROM "Partners" WHERE coalesce("Email",\'\') NOT IN (\'\',\'welct0407@mw-credit.com\')').fetchall()
    c.execute("SET LOCAL timezone='Asia/Bangkok'; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s'")
    if args.action=='seed':
        assert not c.execute('SELECT 1 FROM "Borrowers" WHERE "Row ID"=\'SYN-R051-PERF-B\'').fetchall()
        setup(c,True,track=False)
        c.execute('UPDATE "Payments" SET "Created By"=\'welct0407@mw-credit.com\' WHERE "Row ID"=\'SYN-R051-PERF-P\'')
    elif args.action=='cleanup':
        assert c.execute('SELECT "Borrower Name" FROM "Borrowers" WHERE "Row ID"=\'SYN-R051-PERF-B\'').fetchone()==('Synthetic performance',)
        c.execute('DELETE FROM "Payments" WHERE "Row ID"=\'SYN-R051-PERF-P\'')
        c.execute('DELETE FROM "Business Expenses" WHERE "Row ID"=\'SYN-R051-PERF-E\' AND "Source Type"=\'Manual\'')
        c.execute('DELETE FROM "Charges" WHERE "Row ID"=ANY(%s)',[[f'SYN-R051-PERF-C{i}' for i in range(1,11)]])
        c.execute('DELETE FROM "Loans" WHERE "Row ID"=\'SYN-R051-PERF-L\' AND "Ref Borrowers"=\'SYN-R051-PERF-B\'')
        c.execute('DELETE FROM "Borrowers" WHERE "Row ID"=\'SYN-R051-PERF-B\'')
        c.execute('DELETE FROM "Cash Account Daily Analytics" WHERE "Ref Cash Account"=ANY(%s)',[['SYN-R051-PERF-LISA','SYN-R051-PERF-DAD']])
        c.execute('DELETE FROM "Cash Accounts" WHERE "Row ID"=ANY(%s)',[['SYN-R051-PERF-LISA','SYN-R051-PERF-DAD']])
    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
    rows={}
    for table in ['Payments','Loans','Borrowers','Business Expenses','Cash Accounts']:
        rows[table]=[r[0] for r in c.execute(sql.SQL('SELECT to_jsonb(t) FROM {} t WHERE "Row ID" LIKE \'SYN-R051-PERF-%\'').format(sql.Identifier(table)))]
    if args.action=='cleanup':assert not any(rows.values())
    c.commit() if args.action!='read' else c.rollback()
    private=Path(b['backup_file']).parent
    (private/('gui-'+args.action+'.json')).write_text(json.dumps(rows,indent=2,default=str),encoding='utf-8')
    print(json.dumps({'action':args.action,'synthetic_counts':{t:len(r) for t,r in rows.items()}}))
