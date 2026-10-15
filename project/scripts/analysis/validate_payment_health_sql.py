"""Rehearse V41 only on the verified private restored DEV loopback database.

Compare a separate private fixed-snapshot fixture schema to the offline simulator.
Neither Cloud SQL environment is written. All rehearsal SQL rolls back.
"""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import json, os, socket, subprocess, sys, time
from pathlib import Path
from decimal import Decimal
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from borrower_matrix_simulate import revised_at, date, RECOMMENDED

repo=Path(__file__).resolve().parents[2]
out=repo/'outputs/r027-payment-health'
backup=json.loads((out/'development-backup.json').read_text())
folder=Path(backup['backup_file']).parent
assert folder.resolve().is_relative_to((Path.home()/'Documents/ChatGPT').resolve())
data_dir=folder/'restore-data'
bin_dir=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
private=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924'
snapshot=private/'snapshot-20260924T130012708214Z.json'
source=json.loads(snapshot.read_text(encoding='utf-8'))
migration=(DATABASE_REPO_ROOT / 'database/migrations/V41__borrower_payment_health.sql').read_text(encoding='utf-8')
with socket.socket() as s:
    s.bind(('127.0.0.1',0));port=s.getsockname()[1]
def run(args,name):
    with (folder/name).open('wb') as f:
        subprocess.run(args,stdout=f,stderr=subprocess.STDOUT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
started=False
try:
    run([str(bin_dir/'pg_ctl.exe'),'-D',str(data_dir),'-l',str(folder/'rehearsal.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'rehearsal-start.log');started=True
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',row_factory=dict_row) as c:
        assert Path(c.execute('SHOW data_directory').fetchone()['data_directory']).resolve()==data_dir.resolve()
        c.execute(migration)
        elapsed=[]
        for _ in range(5):
            begin=time.perf_counter()
            c.execute('SELECT * FROM public.oltp_borrower_payment_health_v1').fetchall()
            elapsed.append(round((time.perf_counter()-begin)*1000,2))
        c.execute('CREATE SCHEMA payment_health_fixture')
        c.execute("CREATE FUNCTION payment_health_fixture.olap_reporting_date() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-09-24' $$")
        for table in ['Borrowers','Loans','Charges','Repayments']:
            c.execute(sql.SQL('CREATE TABLE payment_health_fixture.{} AS SELECT * FROM public.{} WHERE false').format(sql.Identifier(table),sql.Identifier(table)))
            fields={r['column_name']:r['data_type'] for r in c.execute('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=%s AND table_name=%s',('public',table))}
            rows=source['rows']['olap_borrowers_analytics' if table=='Borrowers' else table]
            names=[n for n in rows[0] if n in fields]
            def convert(n,v):
                if v is None:return None
                if fields[n]=='money':return Decimal(str(v).replace(',','').replace('$','').replace('฿',''))
                return v
            q=sql.SQL('INSERT INTO payment_health_fixture.{} ({}) VALUES ({})').format(sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,names)),sql.SQL(',').join(sql.Placeholder() for _ in names))
            with c.cursor() as cur:cur.executemany(q,[[convert(n,r[n]) for n in names] for r in rows])
        c.execute(migration.replace('public.','payment_health_fixture.'))
        actual={r['borrower_id']:r for r in c.execute('SELECT * FROM payment_health_fixture.reporting_borrower_matrix_v2')}
        health={r['borrower_id']:r for r in c.execute('SELECT * FROM payment_health_fixture.reporting_borrower_payment_health_v1')}
        expected=revised_at(source,date('2026-09-24'),current_day=True,**RECOMMENDED)
        assert set(actual)=={r['id'] for r in expected}
        for r in expected:
            a=actual[r['id']];h=health[r['id']]
            assert a['quadrant']==r['category'],'Category parity'
            assert abs(float(a['reliability_score'])-r['score'])<1e-8,'Score parity'
            assert abs(float(a['relative_contribution'])-r['value_multiple'])<1e-8,'Value parity'
            assert abs(float(h['overdue_amount'])-r['overdue'])<.005,'Arrears parity'
        from collections import Counter
        result={'source_snapshot_sha256':__import__('hashlib').sha256(snapshot.read_bytes()).hexdigest(),
         'fixed_snapshot_borrowers_compared':len(expected),'category_score_value_arrears_parity':True,
         'categories':dict(Counter(r['quadrant'] for r in actual.values())),
         'restored_dev_summary_query_ms':elapsed,'benchmark_scope':'local restored DEV; not Cloud SQL or AppSheet sync',
         'live_writes':False,'rehearsal_rolled_back':True}
        c.rollback()
    (out/'sql-simulation-parity.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
finally:
    if started:run([str(bin_dir/'pg_ctl.exe'),'-D',str(data_dir),'-m','fast','-w','stop'],'rehearsal-stop.log')
