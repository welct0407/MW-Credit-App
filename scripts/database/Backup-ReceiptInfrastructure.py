"""Private consistent PROD business/central dumps; sanitized hashes only in evidence."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import psycopg

root=Path(__file__).resolve().parents[2]
t=json.loads((root/'database/environments.json').read_text())['production']
assert (t['host'],t['instance'],t['database'])==('34.21.174.215','appsheet-pg-prod-20260914','loan_manager_prod')
password=Path(t['passwordFile']).read_text().strip()
private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r046-receipt-evidence')
bin=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
result={}
for database in ('loan_manager_prod','mw_agent'):
    path=private/(database+'-before-receipts.dump')
    if path.exists():raise RuntimeError('Backup already exists; never overwrite')
    with psycopg.connect(host=t['host'],port=5432,dbname=database,user='postgres',password=password,sslmode='require') as c:
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
        args=[str(bin/'pg_dump.exe'),'-h',t['host'],'-U','postgres','-d',database,'-Fc','--snapshot='+snapshot,'-f',str(path)]
        subprocess.run(args,check=True,env=dict(os.environ,PGPASSWORD=password,PGSSLMODE='require'))
        tables=c.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'").fetchone()[0]
    subprocess.run([str(bin/'pg_restore.exe'),'--list',str(path)],stdout=subprocess.DEVNULL,check=True)
    result[database]={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'tables':tables,'archiveListing':'passed','restoreTest':'pending'}
(root/'outputs/r046-receipt-evidence/prod-backups.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:{'sha256':v['sha256'],'tables':v['tables'],'archiveListing':v['archiveListing']} for k,v in result.items()}))
