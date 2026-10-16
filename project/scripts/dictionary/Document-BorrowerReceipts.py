"""R042 scoped catalog/definition documentation; no source financial rows are published."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import hashlib,json,os,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row
from capture_postgresql import QUERIES
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
r=Path(__file__).resolve().parents[2];dd=r/'Documents/Data Dictionary';out=r/'outputs/r042-borrower-payments'
priv=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r042-borrower-payments'
cfg=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text());catalog={};checks={}
for env in ('development','production'):
 t=cfg[env];expected='loan_manager_dev' if env=='development' else 'loan_manager_prod'
 assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','136.85.127.134',expected)
 with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on') as c:
  assert c.execute('select current_database() db,host(inet_server_addr()) host').fetchone()=={'db':expected,'host':t['host']}
  sections={}
  for section in ('relations','columns','constraints','indexes','triggers','policies','view_dependencies'):
   key='name' if section=='relations' else 'relation';sections[section]=c.execute('SELECT * FROM ('+QUERIES[section]+') scoped WHERE '+key+'=%s',('reporting_borrower_payments_v1',)).fetchall()
  sections['flyway']=c.execute(QUERIES['flyway']).fetchall();catalog[env]=sections
  count=c.execute('select count(*) n from "Payments"').fetchone()['n']
  assert c.execute('select count(*) n,count(distinct payment_id) unique_n from reporting_borrower_payments_v1').fetchone()=={'n':count,'unique_n':count}
  fields={'borrower_id':'Ref Borrower','payment_date':'Payment Date','status':'Status','payment_method':'Payment Method','allocation_method':'Allocation Method','planned_allocation_amount':'Planned Allocation Amount','posted_amount':'Posted Amount','created_at':'Created At','processed_at':'Processed At','bank_reference':'Bank Reference','notes':'Notes','created_by':'Created By','target_loan_id':'Ref Target Loan','target_charge_id':'Ref Target Charge','received_holder_id':'Ref Received By Cash Holder','received_account_id':'Ref Received By Cash Account'}
  mismatch=' OR '.join('v.'+a+' IS DISTINCT FROM p."'+b+'"' for a,b in fields.items())+' OR v.amount_received IS DISTINCT FROM p."Amount Received"::numeric'
  assert c.execute('select count(*) n from reporting_borrower_payments_v1 v join "Payments" p on p."Row ID"=v.payment_id where '+mismatch).fetchone()['n']==0
  if env=='production':assert c.execute("select has_table_privilege('metabase_borrower_reader','public.reporting_borrower_payments_v1','SELECT') ok").fetchone()['ok']
  checks[env]={'receiptCount':count,'oneRowPerReceipt':True,'allSourceFieldsMatch':True,'version':46}
(out/'dictionary-catalog.json').write_text(json.dumps(catalog,indent=2,default=str)+'\n',encoding='utf-8')
(out/'receipt-source-verification.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf-8')
def patch(f,values):
 doc=yaml.safe_load(f.read_text(encoding='utf-8'));changes=[]
 for pointer,value in values:
  parts=pointer.strip('/').split('/');cur=doc
  for k in parts[:-1]:cur=cur[k]
  expected={'state':'value','value':cur[parts[-1]]} if parts[-1] in cur else {'state':'absent'};target={'state':'value','value':value}
  if expected!=target:changes.append({'pointer':pointer,'expected':expected,'target':target})
 if not changes:return
 p=priv/(f.stem+'-patch.json');p.write_text(json.dumps({'file':str(f.relative_to(dd)).replace('\\','/'),'expected_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'reason':'R042 saved report definitions and V46 live catalog','evidence':'outputs/r042-borrower-payments/README.md','changes':changes}),encoding='utf-8');subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)
sections=catalog['production'];f=dd/'systems/postgresql/relations/reporting-borrower-payments-v1.yaml'
content={'definition':sections['relations'][0],**{k:{x['name']:x for x in sections[k]} for k in ('columns','constraints','indexes','triggers','policies')},'dependencies':sections['view_dependencies']}
obj={'format':1,'identity':{'system':'postgresql','component':'loan_manager_prod','kind':'relation','name':'public.reporting_borrower_payments_v1','scope':'production'},'verification':{'status':'documented','source':'outputs/r042-borrower-payments/dictionary-catalog.json'},'content':content}
if f.exists():patch(f,[('/content/'+k,v) for k,v in content.items()])
else:f.write_text(json.dumps(obj,indent=2,default=str)+'\n',encoding='utf-8')
patch(dd/'systems/postgresql/settings/database-metadata-7f28de9a.yaml',[('/content/sections/flyway',catalog['production']['flyway'])])
saved=json.loads((out/'saved.json').read_text(encoding='utf-8'))
files=list((dd/'systems/metabase/questions').glob('borrower-pages-*.yaml'))
for q in saved['questions']:
 if q['id'] in (302,305):
  f=next(f for f in files if yaml.safe_load(f.read_text(encoding='utf-8'))['content'].get('id')==q['id']);patch(f,[('/content/'+k,v) for k,v in q.items()])
 else:
  f=dd/'systems/metabase/questions/borrower-payment-receipts.yaml'
  if f.exists():patch(f,[('/content/'+k,v) for k,v in q.items()])
  else:f.write_text(json.dumps({'format':1,'identity':{'system':'metabase','component':'reports.mw-credit.com','kind':'question','name':q['name']+' / '+str(q['id']),'scope':'production'},'verification':{'status':'documented','source':'outputs/r042-borrower-payments/saved.json'},'content':q},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
patch(dd/'systems/metabase/dashboards/loan-reports.yaml',[('/content/borrower_pages/payment_receipts',{'release':'R042','definition_reference':'outputs/r042-borrower-payments/saved.json','questions':[302,305,317],'source':'public.reporting_borrower_payments_v1','layout':saved['layout']})])
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'index'],check=True,stdout=subprocess.DEVNULL)
print('Both receipt sources reconciled; exact reporting catalog and definitions documented')
