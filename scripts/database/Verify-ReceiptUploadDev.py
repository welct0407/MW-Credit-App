"""Read-only reconciliation of the named synthetic DEV receipt-upload GUI tests."""
import hashlib, json, os, sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql

root=Path(__file__).resolve().parents[2]
out=root/'outputs/r047-receipt-upload'
t=json.loads((root/'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
 c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
 payments=[r[0] for r in c.execute('SELECT to_jsonb(p) FROM public."Payments" p WHERE "Ref Borrower"=%s ORDER BY "Row ID"',('R046-borrower',))]
 result={'database':t['database'],'synthetic_only':True,'payments':[]}
 for p in payments:
  children={table:[r[0] for r in c.execute(sql.SQL('SELECT to_jsonb(x) FROM public.{} x WHERE "Ref Payment"=%s ORDER BY "Row ID"').format(sql.Identifier(table)),(p['Row ID'],))] for table in ['Payment Allocations','Repayments','Cash Ledger']}
  financial={k:v for k,v in p.items() if k not in ['Uploaded Receipt','Uploaded Receipt At']}
  digest=hashlib.sha256(json.dumps({'payment':financial,'children':children},sort_keys=True,default=str).encode()).hexdigest()
  result['payments'].append({'id':p['Row ID'],'status':p['Status'],'amount':p['Amount Received'],'uploaded_receipt':p['Uploaded Receipt'],'uploaded_at':p['Uploaded Receipt At'],'agent_receipt':p['Receipt Image'],'financial_digest':digest,'child_counts':{k:len(v) for k,v in children.items()}})
 mode=sys.argv[1]
 assert mode in ['before','after-edit','after-create','after-replace']
 if mode=='after-edit':
  before=json.loads((out/'gui-before.json').read_text())
  old=next(p for p in before['payments'] if p['id']=='R046-payment')
  new=next(p for p in result['payments'] if p['id']=='R046-payment')
  assert new['financial_digest']==old['financial_digest'] and new['uploaded_receipt'] and new['uploaded_at']
  result['original_financial_and_agent_data_unchanged']=True
 if mode in ['after-create','after-replace']:
  baseline=json.loads((out/'gui-before.json').read_text())
  old=next(p for p in baseline['payments'] if p['id']=='R046-payment')
  original=next(p for p in result['payments'] if p['id']=='R046-payment')
  assert original['financial_digest']==old['financial_digest']
  additions=[p for p in result['payments'] if p['id'] not in {x['id'] for x in baseline['payments']}]
  assert len(additions)==1 and len(result['payments'])==len(baseline['payments'])+1
  added=additions[0]
  assert added['status']=='Posted' and added['amount']=='$25.00'
  assert added['uploaded_receipt'] and added['uploaded_at'] and added['agent_receipt'] is None
  assert added['child_counts']=={'Payment Allocations':1,'Repayments':1,'Cash Ledger':1}
  result['original_financial_and_agent_data_unchanged']=True
  result['one_new_posted_synthetic_payment_with_expected_children']=True
 if mode=='after-replace':
  created=json.loads((out/'gui-after-create.json').read_text())
  assert {p['id'] for p in created['payments']}=={p['id'] for p in result['payments']}
  for p in result['payments']:
   prior=next(x for x in created['payments'] if x['id']==p['id'])
   assert p['financial_digest']==prior['financial_digest']
  prior=next(x for x in created['payments'] if x['id']==added['id'])
  assert added['uploaded_receipt']!=prior['uploaded_receipt'] and added['uploaded_at']>prior['uploaded_at']
  result['replacement_changed_image_and_time_without_reposting']=True
 (out/f'gui-{mode}.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False))
