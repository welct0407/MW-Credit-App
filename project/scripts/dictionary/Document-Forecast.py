"""Capture only R045 reporting definitions, with guarded existing dictionary updates."""
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
r=Path(__file__).resolve().parents[2];dd=r/'Documents/Data Dictionary';out=r/'outputs/r045-forecast-planning'
priv=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r045-forecast-planning'
cfg=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text());catalog={}
names=['reporting_forecast_'+k+'_v1' for k in ('inputs','events','actuals','loans','context')]
for env in ('development','production'):
 t=cfg[env];expected='loan_manager_dev' if env=='development' else 'loan_manager_prod'
 assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','136.85.127.134',expected)
 with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on') as c:
  assert c.execute('select current_database() db,host(inet_server_addr()) host').fetchone()=={'db':expected,'host':t['host']}
  sections={}
  for section in ('relations','columns','constraints','indexes','triggers','policies','view_dependencies'):
   key='name' if section=='relations' else 'relation'
   sections[section]=c.execute('SELECT * FROM ('+QUERIES[section]+') scoped WHERE '+key+'=ANY(%s)',(names,)).fetchall()
  sections['routines']=c.execute('SELECT * FROM ('+QUERIES['routines']+') scoped WHERE name=ANY(%s)',(['forecast_schedule_v1','forecast_scenario_v1'],)).fetchall()
  sections['flyway']=c.execute(QUERIES['flyway']).fetchall();catalog[env]=sections
(out/'dictionary-catalog.json').write_text(json.dumps(catalog,indent=2,default=str)+'\n',encoding='utf-8')
def patch(f,values):
 doc=yaml.safe_load(f.read_text(encoding='utf-8'));changes=[]
 for pointer,value in values:
  parts=pointer.strip('/').split('/');cur=doc
  for k in parts[:-1]:cur=cur[k]
  expected={'state':'value','value':cur[parts[-1]]} if parts[-1] in cur else {'state':'absent'};target={'state':'value','value':value}
  if expected!=target:changes.append({'pointer':pointer,'expected':expected,'target':target})
 if not changes:return
 p=priv/(f.stem+'-patch.json');p.write_text(json.dumps({'file':str(f.relative_to(dd)).replace('\\','/'),'expected_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'reason':'R045 saved definitions and V48 live catalog','evidence':'outputs/r045-forecast-planning/README.md','changes':changes}),encoding='utf-8')
 subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)
def new(f,system,kind,name,content,source):
 assert not f.exists(),f
 obj={'format':1,'identity':{'system':system,'component':'loan_manager_prod' if system=='postgresql' else 'reports.mw-credit.com','kind':kind,'name':name,'scope':'production'},'verification':{'status':'documented','source':source},'content':content}
 text=json.dumps(obj,ensure_ascii=False,indent=2,default=str)+'\n';assert yaml.safe_load(text)==json.loads(text);f.write_text(text,encoding='utf-8')
sections=catalog['production']
for name in names:
 definition=next(x for x in sections['relations'] if x['name']==name)
 dev=next(x for x in catalog['development']['relations'] if x['name']==name)
 assert {k:v for k,v in definition.items() if k!='acl'}=={k:v for k,v in dev.items() if k!='acl'}
 content={'definition':definition,'development_definition':dev,**{k:{x['name']:x for x in sections[k] if x['relation']==name} for k in ('columns','constraints','indexes','triggers','policies')},'dependencies':[x for x in sections['view_dependencies'] if x['relation']==name]}
 new(dd/('systems/postgresql/relations/'+name.replace('_','-')+'.yaml'),'postgresql','relation','public.'+name,content,'outputs/r045-forecast-planning/dictionary-catalog.json')
for routine in sections['routines']:
 dev=next(x for x in catalog['development']['routines'] if x['name']==routine['name'])
 assert routine['definition'].replace('\r\n','\n')==dev['definition'].replace('\r\n','\n')
 new(dd/('systems/postgresql/routines/'+routine['name'].replace('_','-')+'.yaml'),'postgresql','routine','public.'+routine['name']+'('+routine['arguments']+')',{'definition':routine,'development_definition':dev},'outputs/r045-forecast-planning/dictionary-catalog.json')
patch(dd/'systems/postgresql/settings/database-metadata-7f28de9a.yaml',[('/content/sections/flyway',catalog['production']['flyway'])])
saved=json.loads((out/'saved.json').read_text(encoding='utf-8'))
for section,kind in [('questions','question'),('models','model')]:
 for q in saved[section]:new(dd/f'systems/metabase/{section}/forecast-{q["key"].replace("_","-")}.yaml','metabase',kind,q['name']+' / '+str(q['id']),q,'outputs/r045-forecast-planning/saved.json')
patch(dd/'systems/metabase/dashboards/loan-reports.yaml',[('/content/tabs',saved['tabs']),('/content/forecast_planning',{'release':'R045','tab':saved['tab'],'definition_reference':'outputs/r045-forecast-planning/saved.json','parameters':saved['parameters'],'layout':saved['layout']})])
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'index'],check=True,stdout=subprocess.DEVNULL)
print('Five SQL views, two functions, four models, twenty-one questions and dashboard documented')
