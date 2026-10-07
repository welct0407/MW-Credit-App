"""Read only the affected receipt schema/privileges; never export business rows."""
import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'scripts/dictionary'))
from capture_postgresql import QUERIES,NS,psycopg,dict_row
out={}
for environment in ['development','production']:
 t=json.loads((root/'database/environments.json').read_text()) [environment]
 assert (t['host'],t['instance'],t['database'])==('34.21.174.215','appsheet-pg-prod-20260914',{'development':'loan_manager_dev','production':'loan_manager_prod'}[environment])
 with psycopg.connect(host=t['host'],port=5432,dbname=t['database'],user='postgres',password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row) as c:
  c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  c.execute("SET LOCAL statement_timeout='15s'")
  data={}
  for kind in ['columns','constraints','triggers','routines']:
   restriction="n.nspname='public' AND "+({
    'columns':"c.relname='Payments' AND a.attname IN ('IG Receipt ID','Receipt Image','Receipt Received At')",
    'constraints':"c.relname='Payments' AND con.conname='payment_receipt_triplet'",
    'triggers':"c.relname='Payments' AND t.tgname='a00_receipt_evidence'",
    'routines':"p.proname IN ('attach_payment_receipt_evidence','guard_payment_receipt_evidence')"}[kind])
   data[kind]=c.execute(QUERIES[kind].replace(NS,restriction)).fetchall()
  data['version']=c.execute('SELECT max(version::integer) AS version FROM public.flyway_schema_history WHERE success').fetchone()['version']
  data['projector']=c.execute("SELECT has_table_privilege('mw_receipt_projector','public.\"Payments\"','UPDATE') AS direct_update,has_function_privilege('mw_receipt_projector','public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)','EXECUTE') AS execute").fetchone()
  assert data['version']==50 and len(data['columns'])==3 and len(data['routines'])==2 and data['projector']=={'direct_update':False,'execute':True}
  out[environment]=data
assert out['development']==out['production']
(root/'outputs/r046-receipt-evidence/sql-metadata.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'dev_prod_receipt_schema_equal':True,'version':50,'projector':out['production']['projector']}))
