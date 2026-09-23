"""Document only the affected live objects, using guarded dictionary updates."""
import json,sys
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(repo/'scripts/dictionary'))
from dictionary import read,update
from common import load,dump,atomic_write,make_index,write_json,validate
root=repo/'Documents/Data Dictionary'
out=repo/'outputs/r016-20260922'
evidence='outputs/r016-20260922/statement-cleanup/README.md'
models=json.loads((out/'models.json').read_text(encoding='utf-8'))
retired=json.loads((out/'statement-cleanup/retirement.json').read_text(encoding='utf-8'))
plan=json.loads((out/'statement-cleanup-plan.json').read_text(encoding='utf-8'))
def patch(file,changes,reason):
 before=read(root,file)
 return update(root,{'file':file,'expected_sha256':before['sha256'],'evidence':evidence,'reason':reason,'changes':changes},True)
def add(pointer,value):return {'pointer':pointer,'expected':{'state':'absent'},'target':{'state':'value','value':value}}
for item in retired['retired']:
 if item['type']!='model':continue
 file='systems/metabase/models/'+item['name'].lower().replace(' ','-')+'.yaml'
 patch(file,[add('/content/lifecycle',{'state':'archived','id':item['id'],'reason':'No remaining dashboard, question, snippet, filter, alert or subscription consumer. Recoverable archive; imported fields retained as dated evidence.'})],'Dependency-verified report cleanup')
patch('systems/metabase/models/daily-income-ledger.yaml',[add('/content/lifecycle',{'state':'superseded','id':186,'replacement':'systems/metabase/models/income-events.yaml','reason':'ID 186 now exposes live Income Events; original imported field definitions retained as historical evidence.'})],'Retire FIFO/history model definition')
daily=models['daily-cash-snapshot']
patch('systems/metabase/models/daily-cash-snapshots.yaml',[add('/content/fields/'+name,{'Model':daily['name'],'ID':205,'Field / grain':name,'Type / source':'type/Decimal','Semantic / relationship':None,'Definition':next(c['description'] for c in daily['columns'] if c['name']==name)}) for name in ['Income','Expenses','Net Profit']],'Expose already stored daily profit flows for historical trends')
def new(file,system,kind,name,content,scope='production'):
 path=root/file
 if path.exists():raise ValueError('Do not overwrite existing object '+file)
 doc={'format':1,'identity':{'system':system,'component':'reports.mw-credit.com' if system=='metabase' else 'appsheet-pg-prod-20260914','kind':kind,'name':name,'scope':scope},'verification':{'status':'documented','source':evidence},'content':content}
 path.parent.mkdir(parents=True,exist_ok=True);atomic_write(path,dump(doc))
m=models['income-events']
new('systems/metabase/models/income-events.yaml','metabase','model','Income Events',{'fields':{'Model grain':{'ID':186,'Definition':m['grain'],'Type / source':m['database_view']},**{c['name']:{'ID':186,'Type / source':c['base_type'],'Semantic / relationship':c.get('semantic_type'),'Definition':c['description']} for c in m['columns']}},'query_source':'scripts/metabase/models/income-events.sql'})
new('systems/metabase/dashboards/loan-reports.yaml','metabase','dashboard','Loan Reports / 3',{'dashboard_id':3,'database_id':2,'collection_id':5,'tabs':plan['tabs'],'parameters':plan['parameters'],'cash_pages':{'layout':plan['layout'],'question_definitions':plan['questions'],'source_policy':plan['source_policy'],'retired':retired['retired']},'unaffected_pages':'Existing pages 1,3–8 and Cash Position placements preserved; their individual query definitions are outside this scoped dictionary reconciliation.'})
for name,id,file in [('Income statement period',2,'live-income-period.sql'),('Cashflow statement period',3,'live-cashflow-period.sql')]:
 new('systems/metabase/snippets/'+file.replace('.sql','.yaml'),'metabase','snippet',name,{'id':id,'definition_file':'scripts/metabase/'+file,'content':(repo/'scripts/metabase'/file).read_text(encoding='utf-8'),'source_policy':'Live for current and past periods; no snapshot seeding or FIFO allocations.'})
sql38=(repo/'database/migrations/V38__focused_live_statements.sql').read_text(encoding='utf-8')
sql39=(repo/'database/migrations/V39__statement_transfer_label_encoding.sql').read_text(encoding='utf-8')
for name in ['reporting_cash_scopes','reporting_cash_entries','reporting_income_events','reporting_statement_calendar']:
 source=sql39 if name=='reporting_cash_entries' else sql38
 marker=('CREATE OR REPLACE VIEW' if name=='reporting_cash_entries' else 'CREATE VIEW')+' public.'+name+' AS'
 definition=source[source.index(marker):].split(';',1)[0]+';'
 new('systems/postgresql/reporting/'+name+'.yaml','postgresql','relation','public.'+name,{'columns':{},'constraints':{},'definition':definition,'environments':['loan_manager_dev','loan_manager_prod'],'migration':39 if name=='reporting_cash_entries' else 38,'consumer':'Metabase restricted reporting; no AppSheet source changes','permissions':'SELECT only for metabase_borrower_reader'},'development-and-production')
for name in ['reporting_cash_period','reporting_cash_period_entries']:
 definition=sql38[sql38.index('CREATE FUNCTION public.'+name+'('):].split('$$;',1)[0]+'$$;'
 new('systems/postgresql/reporting/'+name+'.yaml','postgresql','routine','public.'+name+'(date,date,text)',{'definition':definition,'environments':['loan_manager_dev','loan_manager_prod'],'migration':38,'permissions':'PUBLIC execute revoked; metabase_borrower_reader execute granted; security invoker','effects':'Read-only period calculation'},'development-and-production')
write_json(root/'index.json',make_index(root))
report=validate(root)
write_json(out/'statement-cleanup/dictionary-validation.json',report)
print(json.dumps(report))
