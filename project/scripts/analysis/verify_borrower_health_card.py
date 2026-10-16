"""Independent business-field parity for the final combined Detail health card."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import json,os,re,sys,time
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
ROOT=Path(__file__).resolve().parents[2]
t=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','136.85.127.134','loan_manager_dev')
with psycopg.connect(host=t['host'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',application_name='r035-health-card-parity',options='-c statement_timeout=60000') as c:
 c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 selected=c.execute('SELECT borrower_id FROM reporting_borrower_directory_v1 WHERE has_active_loan ORDER BY outstanding_principal DESC LIMIT 1').fetchone()[0]
 health=c.execute('SELECT current_health_status,rating_status,reliability_score,confidence,reason_text,overdue_principal,overdue_interest,oldest_unpaid_days FROM reporting_borrower_payment_health_v1 WHERE borrower_id=%s',(selected,)).fetchone()
 matrix=c.execute('SELECT quadrant,classification_reason FROM reporting_borrower_matrix_v3 WHERE borrower_id=%s',(selected,)).fetchone()
 schedule=c.execute('SELECT arrangement_status FROM reporting_borrower_schedule_health_v1 WHERE borrower_id=%s',(selected,)).fetchone()
 spec=next(s for s in json.loads((ROOT/'outputs/r035-borrower-pages/metabase-plan.json').read_text())['specs'] if s['key']=='d-health')
 q=re.sub(r'\[\[.*?\]\]','',spec['dataset_query']['native']['query'],flags=re.S).replace("'__select_borrower__'",psycopg.sql.Literal(selected).as_string(c))
 result=c.execute(q).fetchone()
 expected=health[:4]+(matrix[0],schedule[0],health[4],matrix[1])+health[5:]
 assert result[:11]==expected,'Business health fields differ from their independent authoritative sources'
 empty=re.sub(r'\[\[.*?\]\]','',spec['dataset_query']['native']['query'],flags=re.S)
 assert c.execute(empty).fetchall()==[]
report={'at':datetime.now(timezone.utc).isoformat(),'environment':'development','passed':True,'business_fields_compared':11,'empty_selection_verified':True,'queried_at_excluded':'Display uses statement_timestamp, which legitimately differs between queries','method':'Independent payment-health, matrix and schedule queries compared with final Detail output in one read-only repeatable-read transaction','financial_values_published':False}
(ROOT/'outputs/r035-borrower-pages/health-query-parity.json').write_text(json.dumps(report,indent=2)+'\n')
print('Eleven business fields match independent health sources; empty selection verified')
