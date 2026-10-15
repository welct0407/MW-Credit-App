"""Guarded R038 updates for existing Metabase objects."""
import json,hashlib,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
r=Path(__file__).resolve().parents[2];dd=r/'Documents/Data Dictionary';o=r/'outputs/r038-lifetime-return';priv=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r038-lifetime-return'
saved=json.loads((o/'saved.json').read_text(encoding='utf-8'))
for q in saved['questions']:
    file={310:'models/borrower-contribution-model.yaml',314:'questions/borrower-contribution-coverage.yaml',315:'questions/borrower-contribution-context.yaml'}[q['id']]
    p=dd/'systems/metabase'/file;old=yaml.safe_load(p.read_text(encoding='utf-8'));changes=[]
    for k,v in q.items():
        prev=old['content'].get(k)
        if prev!=v:changes.append({'pointer':'/content/'+k,'expected':{'state':'value','value':prev} if k in old['content'] else {'state':'absent'},'target':{'state':'value','value':v}})
    if not changes:continue
    patch={'file':str(p.relative_to(dd)).replace('\\','/'),'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r038-lifetime-return/saved.json','reason':'R038 lifetime return uses all interest and total original lending; original fields preserved','changes':changes}
    f=priv/('dictionary-'+str(q['id'])+'.json');f.write_text(json.dumps(patch,ensure_ascii=False),encoding='utf-8')
    subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(f),'--apply'],check=True,stdout=subprocess.DEVNULL)
p=dd/'systems/metabase/dashboards/loan-reports.yaml';old=yaml.safe_load(p.read_text(encoding='utf-8'));key='lifetime_return_refinement';v={'release':'R038','question':314,'model':310,'context':315,'definition_reference':'outputs/r038-lifetime-return/saved.json','contract':'outputs/r038-lifetime-return/README.md'}
if old['content']['borrower_pages'].get(key)!=v:
    prev=old['content']['borrower_pages'].get(key);patch={'file':str(p.relative_to(dd)).replace('\\','/'),'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r038-lifetime-return/saved.json','reason':'R038 supersedes the R037 coverage metric only','changes':[{'pointer':'/content/borrower_pages/'+key,'expected':{'state':'value','value':prev} if prev else {'state':'absent'},'target':{'state':'value','value':v}}]}
    f=priv/'dictionary-dashboard.json';f.write_text(json.dumps(patch),encoding='utf-8');subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'update',str(f),'--apply'],check=True,stdout=subprocess.DEVNULL)
result=subprocess.run([sys.executable,str(r/'scripts/dictionary/dictionary.py'),'validate'],capture_output=True,text=True);(o/'dictionary-validation.txt').write_text(result.stdout+result.stderr,encoding='utf-8');print(result.stdout);assert result.returncode==0
