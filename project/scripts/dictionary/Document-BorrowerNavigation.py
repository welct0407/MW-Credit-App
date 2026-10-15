"""R043 scoped Metabase definitions; never exports the iframe bearer URL or rows."""
from pathlib import Path
import hashlib,json,subprocess,sys
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
r=Path(__file__).resolve().parents[2];dd=r/'Documents/Data Dictionary';out=r/'outputs/r043-borrower-navigation'
priv=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r043-borrower-navigation'
saved=json.loads((out/'saved.json').read_text(encoding='utf-8'))
def patch(f,values):
 doc=yaml.safe_load(f.read_text(encoding='utf-8'));changes=[]
 for pointer,value in values:
  parts=pointer.strip('/').split('/');cur=doc
  for k in parts[:-1]:cur=cur[k]
  expected={'state':'value','value':cur[parts[-1]]} if parts[-1] in cur else {'state':'absent'};target={'state':'value','value':value}
  if expected!=target:changes.append({'pointer':pointer,'expected':expected,'target':target})
 if not changes:return
 p=priv/(f.stem+'-patch.json');p.write_text(json.dumps({'file':str(f.relative_to(dd)).replace('\\','/'),'expected_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'reason':'R043 canonical borrower navigation, saved definitions and hidden keys','evidence':'outputs/r043-borrower-navigation/saved.json','changes':changes}),encoding='utf-8')
 subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(p),'--apply'],check=True,stdout=subprocess.DEVNULL)
files={}
for f in (dd/'systems/metabase/questions').glob('*.yaml'):
 obj=yaml.safe_load(f.read_text(encoding='utf-8'));files[obj['content'].get('id')]=f
for q in saved['questions']:patch(files[q['id']],[('/content/'+k,v) for k,v in q.items()])
patch(dd/'systems/metabase/dashboards/loan-reports.yaml',[
 ('/content/tabs',saved['tabs']),('/content/parameters',saved['parameters']),
 ('/content/borrower_navigation',{'release':'R043','definition_reference':'outputs/r043-borrower-navigation/saved.json','retired_tab':10,'retired_parameters':['insight-borrower','proposed-amount'],'links':saved['links'],'matrix_names':'Open Detail105 in a new browser tab by encoded borrower_id, previous30 completed days; iframe sandbox retained.','recovery_dashboard':20})])
subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'index'],check=True,stdout=subprocess.DEVNULL)
print('Eleven question definitions, canonical tabs/filters and links documented')
