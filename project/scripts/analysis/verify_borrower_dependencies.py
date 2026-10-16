"""Read-only affected-provider drift check; never exports borrower rows."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import hashlib,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
ROOT=Path(__file__).resolve().parents[2]
names=['olap_borrowers_analytics','olap_loans_analytics','olap_repayments_analytics',
       'reporting_borrower_payment_health_v1','reporting_charge_payment_health_v1',
       'reporting_borrower_matrix_v3','reporting_borrower_schedule_health_v1',
       'reporting_loan_schedule_health_v1']
results={}
for env,t in json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text()).items():
    if env not in ['development','production']:continue
    assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','TO_FILL_AFTER_CREATE_HOST','loan_manager_dev' if env=='development' else 'loan_manager_prod')
    with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
        c.execute('BEGIN READ ONLY')
        defs=c.execute('SELECT viewname,definition FROM pg_views WHERE schemaname=\'public\' AND viewname=ANY(%s) ORDER BY viewname',(names,)).fetchall()
        assert len(defs)==len(names),(env,'missing provider')
        cols=c.execute("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(%s) ORDER BY table_name,ordinal_position",(names+['Borrowers','Loans','Repayments','Loan Charges'],)).fetchall()
        functions=c.execute("SELECT p.proname,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='olap_reporting_date'").fetchall()
        results[env]={'provider_hash':hashlib.sha256(json.dumps([defs,cols,functions],default=str).encode()).hexdigest(),'views':len(defs),'columns':len(cols),'database':t['database']}
assert results['development']['provider_hash']==results['production']['provider_hash'],'Affected provider schema drift'
report={'same_affected_source_definitions':True,'targets':results,'providers':names}
(ROOT/'outputs/r035-borrower-pages/dependency-parity.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
