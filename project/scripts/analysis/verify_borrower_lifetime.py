"""Independent daily expansion versus compact reporting event sweep. Read-only PROD."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import os,sys,json
from pathlib import Path
from datetime import timedelta,datetime,timezone
from decimal import Decimal
from collections import defaultdict
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row
root=Path(__file__).resolve().parents[2]
def days(principal,start,end,receipts):
    total=Decimal(0)
    for i in range(max(0,(end-start).days)):
        day=start+timedelta(days=i)
        total+=max(Decimal(0),principal-sum((p for d,p in receipts if d<=day),Decimal(0)))
    return total
from datetime import date
a=date(2026,1,1)
assert days(Decimal(100),a,a+timedelta(days=10),[])==1000
assert days(Decimal(100),a,a+timedelta(days=10),[(a+timedelta(days=5),Decimal(50))])==750
assert days(Decimal(100),a,a+timedelta(days=10),[(a,Decimal(100))])==0
assert days(Decimal(100),a,a+timedelta(days=10),[(a,Decimal(100)),(a+timedelta(days=5),Decimal(-50))])==250
cfg=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())['production']
assert (cfg['instance'],cfg['host'],cfg['database'])==('mw-credit-pg-20261017','TO_FILL_AFTER_CREATE_HOST','loan_manager_prod')
password=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc/reporting-db-password.txt'
with psycopg.connect(host=cfg['host'],dbname=cfg['database'],user='metabase_borrower_reader',password=password.read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on -c statement_timeout=30000') as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    assert c.execute('select current_database() db').fetchone()['db']=='loan_manager_prod'
    today=c.execute('select public.olap_reporting_date() d').fetchone()['d']
    loans=c.execute('select * from public.reporting_borrower_loan_facts_v1').fetchall()
    receipts=c.execute('select "Ref Loans" id,"Payment Date" d,"Principal Paid"::numeric p,"Interest Paid"::numeric i from public.olap_repayments_analytics').fetchall()
    actual=c.execute((root/'scripts/metabase/models/borrower-lifetime-economics.sql').read_text()).fetchall()
    byloan=defaultdict(list)
    for p in receipts:byloan[p['id']].append(p)
    totals=defaultdict(lambda:dict(exposure=Decimal(0),interest=Decimal(0),recent=Decimal(0),active=Decimal(0)))
    for l in loans:
        t=totals[l['borrower_id']];ps=byloan[l['loan_id']]
        if l['loan_date'] and l['original_principal'] is not None:
            end=min(today,l['close_date']+timedelta(days=1) if l['close_date'] else today)
            t['exposure']+=days(l['original_principal'],l['loan_date'],end,[(p['d'],p['p']) for p in ps if p['d'] and p['p'] is not None])
        for p in ps:
            if p['d'] and p['i'] is not None:
                if p['d']<today:t['interest']+=p['i']
                if today-timedelta(days=30)<=p['d']<today:t['recent']+=p['i']
                if l['is_active'] and p['d']<=today:t['active']+=p['i']
    for row in actual:
        t=totals[row['Borrower ID']]
        if row['Rate status']=='Available':
            assert row['Principal days']==t['exposure'],'Exposure parity'
            assert abs(row['Achieved daily rate']-t['interest']/t['exposure'])<Decimal('1e-15'),'Rate parity'
        if row['Lifetime interest'] is not None:assert row['Lifetime interest']==t['interest']
        if row['Interest 30D'] is not None:assert row['Interest 30D']==t['recent']
        if row['Active loan interest'] is not None:assert row['Active loan interest']==t['active']
        if row['Principal coverage'] is not None:assert abs(row['Principal coverage']-t['active']/row['Principal outstanding'])<Decimal('1e-15')
report={'at':datetime.now(timezone.utc).isoformat(),'passed':True,'borrowers_checked':len(actual),'synthetic_exposure_cases':4,'method':'Independent per-day expansion in one read-only repeatable-read PROD transaction; model event sweep and receipt totals reconciled','financial_values_published':False}
(root/'outputs/r037-borrower-contribution/data-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
