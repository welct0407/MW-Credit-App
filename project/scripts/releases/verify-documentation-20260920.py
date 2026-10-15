"""Bounded, read-only verification of this documentation restructuring."""
import hashlib, json, re, subprocess
from pathlib import Path
from urllib.parse import unquote

root = Path(__file__).resolve().parents[2]
baseline = 'bb50d30e3108dbdd14e51c15564554acec2ad2f9'
def git(*args):
    return subprocess.check_output(['git', '-c', 'core.autocrlf=false', '-C', str(root), *args])
def names(*args):
    return [p for p in git(*args).decode().split('\0') if p]
changed = set(names('diff',baseline,'--name-only','-z')) | set(names('ls-files','--others','--exclude-standard','-z'))
files = set(names('ls-files','-z')) | changed
def slug(s):
    return re.sub(r'[^\w\- ]', '', s.replace('`','').lower()).replace(' ', '-')
def anchors(text):
    result=set(); counts={}
    for h in re.findall(r'^#{1,6} (.+)',text,re.M):
        s=slug(h); n=counts.get(s,0); counts[s]=n+1; result.add(s+(f'-{n}' if n else ''))
    result.update(re.findall(r'(?:id|name)=[\"\']([^\"\']+)',text))
    return result
issues=[]; count=0
for rel in sorted(files):
    f=root/rel
    if f.suffix!='.md' or not f.exists() or rel.startswith('sources/'): continue
    for match in re.finditer(r'\]\(([^)]+)\)',f.read_text(encoding='utf-8-sig')):
        url=match.group(1).strip('<>')
        if re.match(r'[a-zA-Z][\w+.-]*:',url): continue
        raw,_,fragment=unquote(url).partition('#')
        target=(f.parent/raw).resolve() if raw else f
        try: targetrel=target.relative_to(root).as_posix()
        except ValueError: continue
        if rel not in changed and targetrel not in changed: continue
        count+=1
        if not target.exists(): issues.append({'source':rel,'url':url,'issue':'missing path'})
        elif fragment and target.suffix=='.md' and fragment not in anchors(target.read_text(encoding='utf-8-sig')):
            issues.append({'source':rel,'url':url,'issue':'missing anchor'})
archive=root/'Documents/archive/2026-09-20'
preserved=[]
for old,new in [('Documents/AppSheet_Data_Dictionary.xlsx','AppSheet_Data_Dictionary_before_cleanup.xlsx'),('Documents/history/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx','AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx')]:
    expected=hashlib.sha256(git('show',baseline+':'+old)).hexdigest()
    actual=hashlib.sha256((archive/new).read_bytes()).hexdigest()
    assert expected==actual,old
    preserved.append({'source':old,'archive':new,'sha256':actual})
for rel in ['Documents/OLTP_Business_Processes.drawio','Documents/Loan_Business_Ecosystem.drawio','Documents/Development_Environment_Preparation.md','Documents/Development_Refresh_Runbook.md']:
    assert (root/rel).read_bytes().replace(b'\r\n',b'\n')==git('show',baseline+':'+rel).replace(b'\r\n',b'\n'),rel
reductions=[]
for name in ['AppSheet_Data_Model_Overview.md','Environment_Inventory.md','Development_Changes.md','Release_Tracker.md','README.md']:
    rel='Documents/'+name
    reductions.append({'file':rel,'beforeWords':len(git('show',baseline+':'+rel).decode().split()),'afterWords':len((root/rel).read_text(encoding='utf-8').split())})
result={'checkedLocalLinks':count,'linkIssues':issues,'byteExactArchives':preserved,'unchangedDiagramsAndSeparateDevRunbooks':True,'currentReferenceWords':reductions}
(root/'outputs/documentation-optimization-20260920/verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
raise SystemExit(1 if issues else 0)
