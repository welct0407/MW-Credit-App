"""R047 manual-upload DEV metadata and guarded dictionary checkpoint; no financial writes."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import hashlib,json,os,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row
from capture_postgresql import QUERIES,NS
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
root=Path(__file__).resolve().parents[2];dd=root/'Documents/Data Dictionary';out=root/'outputs/r047-receipt-upload'
evidence='outputs/r047-receipt-upload/HANDOVER.md'
private=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r047-receipt-upload/dictionary-patches';private.mkdir(parents=True,exist_ok=True)
t=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','TO_FILL_AFTER_CREATE_HOST','loan_manager_dev')
with psycopg.connect(host=t['host'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row) as c:
 c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert c.execute('select current_database() db,host(inet_server_addr()) host').fetchone()=={'db':t['database'],'host':t['host']}
 metadata={}
 for kind,restriction in {'columns':"c.relname='Payments' AND a.attname IN ('Uploaded Receipt','Uploaded Receipt At')",'triggers':"c.relname='Payments' AND t.tgname='a01_receipt_upload_stamp'",'routines':"p.proname='payment_receipt_upload_stamp'"}.items():
  metadata[kind]=c.execute(QUERIES[kind].replace(NS,"n.nspname='public' AND "+restriction)).fetchall()
 metadata['version']=c.execute('select max(version::int) version from flyway_schema_history where success').fetchone()['version']
 assert metadata['version']==52 and len(metadata['columns'])==2 and len(metadata['triggers'])==1 and len(metadata['routines'])==1
(out/'dev-metadata.json').write_text(json.dumps(metadata,indent=2,ensure_ascii=False,default=str)+'\n',encoding='utf-8')

def update(rel,change):
 f=dd/rel;doc=yaml.safe_load(f.read_text(encoding='utf-8'));old=doc['content'];new=json.loads(json.dumps(old));change(new)
 changes=[{'pointer':'/content/'+k.replace('~','~0').replace('/','~1'),'expected':{'state':'value','value':old[k]} if k in old else {'state':'absent'},'target':{'state':'value','value':v}} for k,v in new.items() if k not in old or old[k]!=v]
 patch={'file':rel,'expected_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'evidence':evidence,'reason':'Saved R047 manual receipt upload DEV checkpoint; storage tests pending','changes':changes}
 p=private/(f.parent.name+'-'+f.name+'.json');p.write_text(json.dumps(patch,ensure_ascii=False),encoding='utf-8')
 subprocess.run([sys.executable,str(root/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)

nonform='AND(CONTEXT("ViewType") <> "form", OR(ISNOTBLANK([Uploaded Receipt]), ISNOTBLANK([Receipt Image])))'
image={'Type':'Image','Virtual':False,'Show_If':'OR(CONTEXT("ViewType") = "form", ISNOTBLANK([Uploaded Receipt]))','Editable':True,'Required':False,'Searchable':False,'Sensitive data':True,'Image/File folder path':'"manual-receipts/dev"','Display name':'"รูปใบเสร็จ / Upload Receipt"','Description':'"แนบรูปใบเสร็จ (ไม่บังคับ) / Optional receipt picture."','App formula':'','Initial value':''}
stamp={'Type':'DateTime','Virtual':False,'Show_If':'AND(CONTEXT("ViewType") <> "form", ISNOTBLANK([Uploaded Receipt]))','Editable':False,'Searchable':False,'App formula':'','Initial value':'','Display name':'"เวลาอัปโหลดใบเสร็จ / Receipt Uploaded At"'}
def oltp(x):
 x.update(version='1.000111',manual_upload_status='Configured; native GCS upload/save verification pending')
 for name,v in {'Uploaded Receipt':image,'Uploaded Receipt At':stamp,'Receipt Preview':{'Type':'Image','Virtual':True,'App formula':'IF(ISNOTBLANK([Uploaded Receipt]), [Uploaded Receipt], [Receipt Image])','Show_If':nonform,'Searchable':False,'Sensitive data':True,'Image/File folder path':'"manual-receipts/dev"'},'Receipt Display At':{'Type':'DateTime','Virtual':True,'App formula':'IF(ISNOTBLANK([Uploaded Receipt]), [Uploaded Receipt At], [Receipt Received At])','Show_If':nonform}}.items():x['columns'][name]={'before':{'state':'absent'},'after':v}
 x['unchanged']='Posted financial locks, selected-charge rules, initial status, key, agent-owned evidence protection, cash-account defaults, notifications and posting ownership.'
update('development/appsheet/r047/oltp-payments.yaml',oltp)
def olap(x):
 x.update(version='1.000041',manual_upload_status='Shared schema reconciled; post-upload read verification pending')
 for name,typ in [('Uploaded Receipt','Image'),('Uploaded Receipt At','DateTime')]:x['columns'][name]={'before':{'state':'absent'},'after':{'Type':typ,'Show':False,'Editable':False,'Searchable':False,'Sensitive data':typ=='Image','Initial value':'','App formula':''}}
update('development/appsheet/r047/olap-payments.yaml',olap)
def slice_(x):
 x['version']='1.000111';x['definition']['Row filter condition']='AND([Status] = "Posted", OR(ISNOTBLANK([Receipt Image]), ISNOTBLANK([Uploaded Receipt])))'
 cols=x['definition']['Slice Columns']
 for name in ['Selected Charge IDs','Uploaded Receipt','Uploaded Receipt At','Receipt Preview','Receipt Display At']:
  if name not in cols:cols.append(name)
 x['members']=[{'Ordinal':i+1,'Column':n} for i,n in enumerate(cols)]
update('development/appsheet/r047/submitted-receipt-payments.yaml',slice_)
def deck(x):
 x['version']='1.000111';x['definition'].update({'Main image':'Receipt Preview','Primary header':'Receipt Display At','Sort by':[{'Column':'Receipt Display At','Direction':'Descending'}]})
update('development/appsheet/r047/submitted-receipts-inline.yaml',deck)
def selectedform(x):
 x['version']='1.000111'
 x['definition']['Column order'].append('Uploaded Receipt')
 x['manual_receipt_upload']={'change':'Append Uploaded Receipt to explicit Column order','evidence':evidence}
update('development/appsheet/r047/receive-selected-charges-form.yaml',selectedform)
def pg(x):
 x['manual_upload_migration']='database/migrations/V52__manual_payment_receipt_upload.sql'
 for col in metadata['columns']:x['columns'][col['name']]={'before':{'state':'absent'},'after':col}
 x['triggers']['a01_receipt_upload_stamp']={'before':{'state':'absent'},'after':metadata['triggers'][0]}
update('development/postgresql/r047/payments.yaml',pg)
def newobj(rel,system,component,kind,name,content):
 f=dd/rel
 if f.exists():raise RuntimeError('Refusing to overwrite existing new object: '+str(f))
 f.write_text(json.dumps({'format':1,'identity':{'system':system,'component':component,'kind':kind,'name':name,'scope':'development:R047'},'verification':{'status':'documented','source':evidence},'content':content},indent=2,ensure_ascii=False,default=str)+'\n',encoding='utf-8')
newobj('development/postgresql/r047/payment-receipt-upload-stamp.yaml','postgresql','loan_manager_dev','routine','public.payment_receipt_upload_stamp()',{'release':'R047','migration':'database/migrations/V52__manual_payment_receipt_upload.sql','definition':metadata['routines'][0]})
for name,cols in [('Payments_Form',['Ref Borrower','Payment Date','Ref Target Charge','Amount Received','Ref Received By Cash Account','Ref Received By Cash Holder','Payment Method','Bank Reference','Notes','Uploaded Receipt']),('Payments_Detail',['Payment Date','Status','Ref Borrower','Amount Received','Payment Method','Allocation Method','Bank Reference','Notes','Ref Received By Cash Holder','Ref Received By Cash Account','Receipt Image','Receipt Received At','Related Repayments','Visible Allocations','Related Loans','Uploaded Receipt','Uploaded Receipt At'])]:
 newobj('development/appsheet/r047/'+name.lower().replace('_','-')+'.yaml','appsheet','oltp','view',name,{'release':'R047','version':'1.000111','app_id':'500b27b6-884a-41e8-a9ec-df801b0110ad','change':'Append manual-upload fields to existing explicit order; other properties unchanged','Column order':cols})
subprocess.run([sys.executable,str(root/'scripts/dictionary/dictionary.py'),'index'],check=True)
print('Manual upload DEV dictionary checkpoint recorded; native upload tests remain pending')
