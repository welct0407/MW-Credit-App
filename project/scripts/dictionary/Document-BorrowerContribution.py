"""R037 exact saved Metabase definitions; guarded dashboard patch, no live writes."""
import json,hashlib,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python'))
import yaml
root=Path(__file__).resolve().parents[2];out=root/'outputs/r037-borrower-contribution';dd=root/'Documents/Data Dictionary'
saved=json.loads((out/'saved.json').read_text(encoding='utf-8'))
def guarded(p,old,new,pointer='/content'):
    if old==new:return
    patch={'file':str(p.relative_to(dd)).replace('\\','/'),'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r037-borrower-contribution/saved.json','reason':'R037 final saved chart definitions including responsive ratio safety','changes':[{'pointer':'/content/'+k,'expected':{'state':'value','value':old[k]} if k in old else {'state':'absent'},'target':{'state':'value','value':v}} for k,v in new.items() if k not in old or old[k]!=v]}
    path=Path.home()/('Documents/ChatGPT/AppSheet-Loan-Project/r037-borrower-contribution/patch-'+p.stem+'.json');path.write_text(json.dumps(patch,ensure_ascii=False),encoding='utf-8')
    subprocess.run([sys.executable,str(root/'scripts/dictionary/dictionary.py'),'update',str(path),'--apply'],check=True,stdout=subprocess.DEVNULL)
for q in saved['questions']:
    kind='model' if q['key']=='model' else 'question'
    p=dd/'systems/metabase'/('models' if kind=='model' else 'questions')/('borrower-contribution-'+q['key']+'.yaml')
    obj={'format':1,'identity':{'system':'metabase','component':'reports.mw-credit.com','kind':kind,'name':q['name']+' / '+str(q['id']),'scope':'production'},'verification':{'status':'documented','source':'outputs/r037-borrower-contribution/saved.json'},'content':q}
    if p.exists():
        oldobj=yaml.safe_load(p.read_text(encoding='utf-8'));guarded(p,oldobj['content'],q)
    else:p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
file='systems/metabase/dashboards/loan-reports.yaml';p=dd/file;obj=yaml.safe_load(p.read_text(encoding='utf-8'));old=obj['content']['borrower_pages']
new={**old,'contribution_refinement':{'release':'R037','model':310,'questions':[311,312,313,314,315],'definition_reference':'outputs/r037-borrower-contribution/saved.json','contract':'outputs/r037-borrower-contribution/README.md','replaced_placements_questions':[285,286],'date_filters':'No activity-date mappings on the five new questions; population applies','rollback_dashboard':11}}
new['definition_reference']='outputs/r037-borrower-contribution/saved.json (Portfolio); outputs/r035-borrower-pages/metabase-saved.json (unchanged Detail)'
patch={'file':file,'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'evidence':'outputs/r037-borrower-contribution/saved.json','reason':'R037 verified Portfolio chart and layout refinement; Detail preserved','changes':[{'pointer':'/content/borrower_pages','expected':{'state':'value','value':old},'target':{'state':'value','value':new}}]}
private=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r037-borrower-contribution/dictionary-patch.json';private.write_text(json.dumps(patch,ensure_ascii=False),encoding='utf-8')
subprocess.run([sys.executable,str(root/'scripts/dictionary/dictionary.py'),'index'],check=True)
if old!=new:subprocess.run([sys.executable,str(root/'scripts/dictionary/dictionary.py'),'update',str(private),'--apply'],check=True)
r=subprocess.run([sys.executable,str(root/'scripts/dictionary/dictionary.py'),'validate'],capture_output=True,text=True)
(out/'dictionary-validation.txt').write_text(r.stdout+r.stderr,encoding='utf-8');print(r.stdout);assert r.returncode==0
