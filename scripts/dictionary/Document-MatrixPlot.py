"""R029 exact display-view and matrix-question metadata; no financial rows."""
import hashlib,json,os,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
from capture_postgresql import QUERIES
import psycopg
from psycopg.rows import dict_row
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
r=Path(__file__).resolve().parents[2];out=r/'outputs/r029-bcg-matrix';dd=r/'Documents/Data Dictionary'
private=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r029-bcg-matrix';private.mkdir(exist_ok=True)
views=['reporting_borrower_matrix_plot_v1']
cfg=json.loads((r/'database/environments.json').read_text());captures={}
for env in ('production','development'):
 t=cfg[env];expected='loan_manager_prod' if env=='production' else 'loan_manager_dev'
 assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215',expected)
 with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on') as c:
  ident=c.execute('select current_database() db,host(inet_server_addr()) host').fetchone();assert ident=={'db':expected,'host':t['host']}
  sections={}
  for section in ('relations','columns','constraints','indexes','triggers','policies','view_dependencies'):
   key='name' if section=='relations' else 'relation'
   sections[section]=c.execute('SELECT * FROM ('+QUERIES[section]+') scoped WHERE '+key+'=ANY(%s)',(views,)).fetchall()
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
 dest.write_text(json.dumps({'file':str(file).replace('\\','/'),'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r029-bcg-matrix/README.md','reason':'R029 display-only SQL coordinates and saved review-tab definitions','changes':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8');patches.append(dest)
def put_new_or_patch(file,identity,content,source):
 p=dd/file
 if p.exists():
  before=p.read_bytes();old=yaml.safe_load(before.decode('utf-8'));assert old['verification']['source'].startswith(('outputs/r027-payment-health/','outputs/r028-schedule-health/','outputs/r029-bcg-matrix/'))
  # The patch helper only supports content entries, not renamed question
  # identities/verification envelopes. Guard and preserve unrelated envelope keys.
  old.update(identity=identity,verification={'status':'documented','source':source},content=content)
  assert p.read_bytes()==before,'Concurrent dictionary edit'
  p.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 else:
  p.parent.mkdir(parents=True,exist_ok=True)
  p.write_text(json.dumps({'format':1,'identity':identity,'verification':{'status':'documented','source':source},'content':content},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for env,sections in captures.items():
 for v in views:
  definition=next(x for x in sections['relations'] if x['name']==v)
  content={'definition':definition,**{k:{x['name']:x for x in sections[k] if x['relation']==v} for k in ('columns','constraints','indexes','triggers','policies')},'dependencies':[x for x in sections['view_dependencies'] if x['relation']==v]}
  file=Path('systems/postgresql/relations' if env=='production' else 'development/r029')/(v.replace('_','-')+'.yaml')
  if env=='development':content.update(release='R029',production_present=True,migration='V43__borrower_matrix_display_coordinates.sql')
  put_new_or_patch(file,{'system':'postgresql','component':'loan_manager_prod' if env=='production' else 'loan_manager_dev','kind':'relation','name':'public.'+v,'scope':'production' if env=='production' else 'development:R029'},content,'outputs/r029-bcg-matrix/dictionary-catalog.json')
patch('systems/postgresql/settings/database-metadata-7f28de9a.yaml',[('/content/sections/flyway',captures['production']['flyway'])])
devfile='development/postgresql/environment/loan_manager_prod-settings-database-metadata-7f28de9a.yaml'
d=yaml.safe_load((dd/devfile).read_text(encoding='utf-8'));changes=[x for x in d['content']['changes'] if x['pointer']!='/sections/flyway']
if captures['production']['flyway']!=captures['development']['flyway']:changes.append({'pointer':'/sections/flyway','before':{'state':'value','value':captures['production']['flyway']},'after':{'state':'value','value':captures['development']['flyway']}})
patch(devfile,[('/content/changes',changes)])
state=json.loads((out/'metabase-state.json').read_text(encoding='utf-8'))
dashboard=yaml.safe_load((dd/'systems/metabase/dashboards/loan-reports.yaml').read_text(encoding='utf-8'))
review=dashboard['content']['borrower_health_review']
review['release']='R029'
review['sources']=list(dict.fromkeys(review['sources']+['borrower-matrix-plot-v1']))
review['retained_original_scatter_id']=review['questions'].pop('scatter',266)
review['questions'].update(state['cards'])
review['definition_reference']='outputs/r029-bcg-matrix/metabase-saved.json'
review['matrix_display']='Native isolated category points and reference lines; centered equal quadrants. Display coordinates only; V3 ratings/categories unchanged.'
patch('systems/metabase/dashboards/loan-reports.yaml',[('/content/borrower_health_review',review)])
for q in json.loads((out/'saved-question-definitions.json').read_text(encoding='utf-8')):
 put_new_or_patch(Path('systems/metabase/questions')/('borrower-health-'+q['key']+'.yaml'),{'system':'metabase','component':'reports.mw-credit.com','kind':'question','name':q['name']+' / '+str(q['id']),'scope':'production'},q,'outputs/r029-bcg-matrix/saved-question-definitions.json')
for p in patches:subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'index'],check=True)
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'validate'],check=True)
