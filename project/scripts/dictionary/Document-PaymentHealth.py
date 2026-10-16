"""R027 scoped SQL/report dictionary capture. No business rows or live writes."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import hashlib,json,os,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from capture_postgresql import QUERIES
import psycopg
from psycopg.rows import dict_row
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
r=Path(__file__).resolve().parents[2];out=r/'outputs/r027-payment-health';dd=r/'Documents/Data Dictionary'
views=[x['name'] for x in json.loads((out/'production-sql-definitions.json').read_text(encoding='utf8'))]
cfg=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text(encoding='utf8'));captures={}
for env in ('production','development'):
 t=cfg[env];expected='loan_manager_prod' if env=='production' else 'loan_manager_dev'
 assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','TO_FILL_AFTER_CREATE_HOST',expected)
 with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on') as c:
  assert c.execute('select current_database() db').fetchone()['db']==expected
  sections={}
  for section in ('relations','columns','constraints','indexes','triggers','policies','view_dependencies'):
   key='name' if section=='relations' else 'relation'
   sections[section]=c.execute('SELECT * FROM ('+QUERIES[section]+') scoped WHERE '+key+'=ANY(%s)',(views,)).fetchall()
  sections['flyway']=c.execute(QUERIES['flyway']).fetchall();captures[env]=sections
(out/'dictionary-catalog.json').write_text(json.dumps(captures,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
patches=[]
def patch(file,changes):
 p=dd/file;d=yaml.safe_load(p.read_text(encoding='utf8'));items=[]
 for pointer,new in changes:
  cur=d;parts=pointer.strip('/').split('/')
  for part in parts[:-1]:cur=cur[part]
  expected={'state':'value','value':cur[parts[-1]]} if parts[-1] in cur else {'state':'absent'}
  if expected=={'state':'value','value':new}:continue
  items.append({'pointer':pointer,'expected':expected,'target':{'state':'value','value':new}})
 if not items:return
 dest=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r027-payment-health'/('dictionary-patch-'+str(len(patches))+'.json');dest.write_text(json.dumps({'file':file,'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r027-payment-health/README.md','reason':'R027 verified shared SQL and parallel Metabase review; AppSheet detour removed','changes':items},ensure_ascii=False,indent=2)+'\n',encoding='utf8');patches.append(dest)
for env,sections in captures.items():
 for v in views:
  definition=next(x for x in sections['relations'] if x['name']==v)
  content={'definition':definition,**{k:{x['name']:x for x in sections[k] if x['relation']==v} for k in ('columns','constraints','indexes','triggers','policies')},'dependencies':[x for x in sections['view_dependencies'] if x['relation']==v]}
  slug=v.replace('_','-')+'.yaml'
  if env=='production':
   p=dd/'systems/postgresql/relations'/slug;assert not p.exists() or json.loads(p.read_text(encoding='utf8'))['verification']['source']=='outputs/r027-payment-health/dictionary-catalog.json','Refuse to replace unrelated canonical object'
   p.write_text(json.dumps({'format':1,'identity':{'system':'postgresql','component':'loan_manager_prod','kind':'relation','name':'public.'+v,'scope':'production'},'verification':{'status':'documented','source':'outputs/r027-payment-health/dictionary-catalog.json','coverage':'Exact scoped catalog metadata'},'content':content},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  else:patch('development/r027/'+slug,[("/content/"+k,v) for k,v in content.items()]+[('/content/production_present',True)])
patch('systems/postgresql/settings/database-metadata-7f28de9a.yaml',[('/content/sections/flyway',captures['production']['flyway'])])
devfile='development/postgresql/environment/loan_manager_prod-settings-database-metadata-7f28de9a.yaml';d=yaml.safe_load((dd/devfile).read_text(encoding='utf8'))
changes=[x for x in d['content']['changes'] if x['pointer']!='/sections/flyway']
if captures['production']['flyway']!=captures['development']['flyway']:changes.append({'pointer':'/sections/flyway','before':{'state':'value','value':captures['production']['flyway']},'after':{'state':'value','value':captures['development']['flyway']}})
patch(devfile,[('/content/changes',changes)])
dashboard=json.loads((out/'dashboard-metadata.json').read_text(encoding='utf8'));state=json.loads((out/'metabase-state.json').read_text(encoding='utf8'))
patch('systems/metabase/dashboards/loan-reports.yaml',[('/content/tabs',dashboard['tabs']),('/content/borrower_health_review',{'tab_id':state['tab'],'release':'R027','source':'payment-health-v1','questions':state['cards'],'original_borrowers_tab_id':6,'original_retained':True,'definition_reference':'outputs/r027-payment-health/metabase-saved.json','filters':'Current cohort and health; existing dashboard filters do not apply'})])
qdir=dd/'systems/metabase/questions';qdir.mkdir(exist_ok=True)
for q in json.loads((out/'saved-question-definitions.json').read_text(encoding='utf8')):
 p=qdir/('borrower-health-'+q['key']+'.yaml');assert not p.exists() or json.loads(p.read_text(encoding='utf8'))['verification']['source']=='outputs/r027-payment-health/saved-question-definitions.json'
 p.write_text(json.dumps({'format':1,'identity':{'system':'metabase','component':'reports.mw-credit.com','kind':'question','name':q['name']+' / '+str(q['id']),'scope':'production'},'verification':{'status':'documented','source':'outputs/r027-payment-health/saved-question-definitions.json'},'content':q},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for p in patches:subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'index'],check=True)
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'validate'],check=True)
