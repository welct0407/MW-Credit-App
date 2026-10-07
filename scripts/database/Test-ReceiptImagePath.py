"""DEV synthetic fixture only: diagnose native AppSheet GCS path resolution."""
import argparse,json
from pathlib import Path
import psycopg
p=argparse.ArgumentParser();p.add_argument('prefix',choices=['relative','absolute']);a=p.parse_args()
root=Path(__file__).resolve().parents[2]
t=json.loads((root/'database/environments.json').read_text())['development']
assert (t['host'],t['database'])==('34.21.174.215','loan_manager_dev')
demo=json.loads((root/'outputs/r046-receipt-evidence/dev-demo.json').read_text())
with psycopg.connect(host=t['host'],port=5432,dbname=t['database'],user='postgres',password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
    c.execute('UPDATE public."Payments" SET "Receipt Image"=%s WHERE "Row ID"=%s AND "IG Receipt ID"=%s',(('//' if a.prefix=='absolute' else '')+demo['object_key'],'R046-payment',demo['receipt_id']))
print(json.dumps({'syntheticOnly':True,'prefix':a.prefix}))
