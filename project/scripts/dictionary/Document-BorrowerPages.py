"""Focused R035 saved reporting definitions; catalogs only, no financial rows."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import hashlib,json,os,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
from capture_postgresql import QUERIES
import psycopg
from psycopg.rows import dict_row
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
r=Path(__file__).resolve().parents[2];out=r/'outputs/r035-borrower-pages';dd=r/'Documents/Data Dictionary'
private=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r035-borrower-pages';private.mkdir(exist_ok=True)
views=['reporting_borrower_loan_facts_v1','reporting_borrower_directory_v1','reporting_borrower_activity_daily_v1']
cfg=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text());captures={}
for env in ('production','development'):
 t=cfg[env];expected='loan_manager_prod' if env=='production' else 'loan_manager_dev'
 assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215',expected)
 with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on') as c:
  assert c.execute('select current_database() db,host(inet_server_addr()) host').fetchone()=={'db':expected,'host':t['host']}
  sections={}
  for section in ('relations','columns','constraints','indexes','triggers','policies','view_dependencies'):
   key='name' if section=='relations' else 'relation'
   sections[section]=c.execute('SELECT * FROM ('+QUERIES[section]+') scoped WHERE '+key+'=ANY(%s)',(views,)).fetchall()
  sections['routines']=c.execute('SELECT * FROM ('+QUERIES['routines']+") scoped WHERE name='reporting_borrower_period_v1'").fetchall()
  sections['flyway']=c.execute(QUERIES['flyway']).fetchall();captures[env]=sections
(out/'dictionary-catalog.json').write_text(json.dumps(captures,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
patches=[]
def patch(file,changes):
 p=dd/file;d=yaml.safe_load(p.read_text(encoding='utf-8'));items=[]
 for pointer,new in changes:
  cur=d;parts=pointer.strip('/').split('/')
  for part in parts[:-1]:cur=cur[part]
  expected={'state':'value','value':cur[parts[-1]]} if parts[-1] in cur else {'state':'absent'}
  if expected=={'state':'value','value':new}:continue
  items.append({'pointer':pointer,'expected':expected,'target':{'state':'value','value':new}})
 if not items:return
 dest=private/('dictionary-patch-'+str(len(patches))+'.json')
 dest.write_text(json.dumps({'file':str(file).replace('\\','/'),'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r035-borrower-pages/README.md','reason':'R035 additive borrower pages; exact saved definitions and V44 metadata','changes':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8');patches.append(dest)
def put(file,identity,content,source):
 p=dd/file;obj={'format':1,'identity':identity,'verification':{'status':'documented','source':source},'content':content}
 if p.exists():
  old=yaml.safe_load(p.read_text(encoding='utf-8'));assert old['identity']==identity and old['verification']['source'].startswith('outputs/r035-borrower-pages/')
  patch(file,[('/content/'+k,v) for k,v in content.items()]);return
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for env,sections in captures.items():
 folder='systems/postgresql' if env=='production' else 'development/r035'
 identity={'system':'postgresql','component':'loan_manager_prod' if env=='production' else 'loan_manager_dev','scope':'production' if env=='production' else 'development:R035'}
 for v in views:
  content={'definition':next(x for x in sections['relations'] if x['name']==v),**{k:{x['name']:x for x in sections[k] if x['relation']==v} for k in ('columns','constraints','indexes','triggers','policies')},'dependencies':[x for x in sections['view_dependencies'] if x['relation']==v]}
  put(Path(folder)/'relations'/(v.replace('_','-')+'.yaml'),dict(identity,kind='relation',name='public.'+v),content,'outputs/r035-borrower-pages/dictionary-catalog.json')
 for routine in sections['routines']:
  put(Path(folder)/'routines/reporting-borrower-period-v1.yaml',dict(identity,kind='routine',name='public.'+routine['name']+'('+routine['arguments']+')'),{'definition':routine},'outputs/r035-borrower-pages/dictionary-catalog.json')
patch('systems/postgresql/settings/database-metadata-7f28de9a.yaml',[('/content/sections/flyway',captures['production']['flyway'])])
devfile='development/postgresql/environment/loan_manager_prod-settings-database-metadata-7f28de9a.yaml'
dev=yaml.safe_load((dd/devfile).read_text(encoding='utf-8'));changes=[x for x in dev['content']['changes'] if x['pointer']!='/sections/flyway']
if captures['production']['flyway']!=captures['development']['flyway']:changes.append({'pointer':'/sections/flyway','before':{'state':'value','value':captures['production']['flyway']},'after':{'state':'value','value':captures['development']['flyway']}})
patch(devfile,[('/content/changes',changes)])
saved=json.loads((out/'metabase-saved.json').read_text(encoding='utf-8'));state=json.loads((out/'metabase-state.json').read_text())
dashfile='systems/metabase/dashboards/loan-reports.yaml';dash=yaml.safe_load((dd/dashfile).read_text(encoding='utf-8'))
ps=dash['content'].get('parameters',[]);newps=saved['parameters'];ps=[p for p in ps if p['id'] not in {p['id'] for p in newps}]+newps
patch(dashfile,[('/content/tabs',saved['allTabs']),('/content/parameters',ps),('/content/borrower_pages',{'release':'R035','tabs':state['tabs'],'questions':state['cards'],'definition_reference':'outputs/r035-borrower-pages/metabase-saved.json','preserved_original_tabs':True,'filter_contract':'Separate activity dates; current and lifetime positions ignore dates; one borrower required; empty selection returns no financial totals','sources':views+['reporting_borrower_period_v1'],'health':'Existing V41/V42 unchanged','rollback_dashboard':10})])
for q in saved['questions']:
 kind='model' if q['key']=='picker' else 'question'
 put(Path('systems/metabase')/(kind+'s')/('borrower-pages-'+q['key']+'.yaml'),{'system':'metabase','component':'reports.mw-credit.com','kind':kind,'name':q['name']+' / '+str(q['id']),'scope':'production'},q,'outputs/r035-borrower-pages/saved-question-definitions.json')
for p in patches:subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'index'],check=True)
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'validate'],check=True)
