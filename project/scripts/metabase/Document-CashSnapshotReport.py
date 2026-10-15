"""Prepare dictionary rows; merge Artifact-authored cells while preserving unrelated workbook parts."""
import argparse,copy,hashlib,json,shutil,zipfile
from pathlib import Path
import xml.etree.ElementTree as E
p=argparse.ArgumentParser();p.add_argument('operation',choices=['prepare','apply']);args=p.parse_args()
repo=Path(__file__).resolve().parents[2];private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/cash-snapshot-report-before')
dest=repo/'Documents/AppSheet_Data_Dictionary.xlsx';baseline=private/'dictionary-before.xlsx'
S='http://schemas.openxmlformats.org/spreadsheetml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';tag=lambda n:'{'+S+'}'+n
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def readbook(path):
 with zipfile.ZipFile(path) as z:parts={n:z.read(n) for n in z.namelist()}
 strings=[''.join(x.itertext()) for x in E.fromstring(parts['xl/sharedStrings.xml'])] if 'xl/sharedStrings.xml' in parts else []
 rels={x.get('Id'):x.get('Target') for x in E.fromstring(parts['xl/_rels/workbook.xml.rels'])};paths={}
 for s in E.fromstring(parts['xl/workbook.xml']).find(tag('sheets')):
  path=rels[s.get('{'+R+'}id')];paths[s.get('name')]=path.lstrip('/') if path.startswith('/') else 'xl/'+path
 return parts,paths,strings
def val(cell,strings):
 v=cell.find(tag('v'));t=cell.get('t');return strings[int(v.text)] if t=='s' else ''.join(cell.find(tag('is')).itertext()) if t=='inlineStr' else v.text if v is not None else ''
if args.operation=='prepare':
 if not baseline.exists():shutil.copy2(dest,baseline)
 parts,paths,strings=readbook(baseline);data={};patches={}
 for name,width in [('Metabase Models',6),('DB Logic',5)]:
  data[name]=[];patches[name]=[]
  for row in E.fromstring(parts[paths[name]]).find(tag('sheetData')):
   cells={''.join(filter(str.isalpha,c.get('r'))):val(c,strings) for c in row}
   data[name].append([cells.get(chr(65+i),'') for i in range(width)])
 models=json.loads((repo/'outputs/r016-20260922/models.json').read_text())
 for key in ['daily-cash-snapshot','account-cash-snapshot']:
  m=models[key];rows=[[m['name'],m['id'],'Model grain',m['database_view'],'PROD reporting / collection 8',m['grain']]]
  rows += [[m['name'],m['id'],c['name'],c['base_type'],c.get('semantic_type') or '',c['description']] for c in m['columns']]
  for row in rows:data['Metabase Models'].append(row);patches['Metabase Models'].append(len(data['Metabase Models']))
 for i,row in enumerate(data['DB Logic']):
  if row[2]=='reporting_daily_snapshot':row[4]='Thin stored portfolio snapshots. SELECT-only reporting grant. Daily Cash Snapshots model supports 2R past-date positions and completed-day trends.';patches['DB Logic'].append(i+1)
  if row[2]=='reporting_cash_account_snapshot':row[4]='Thin stored account snapshots and current labels/immutable holder. Account Cash Snapshots model supports 2R past-date account/holder positions.';patches['DB Logic'].append(i+1)
  if row[2]=='R016 snapshot extension':row[4]='13 added Daily Analytics columns, account snapshot table and two views. 2R report integration complete; today uses live OLAP, past dates stored snapshots. AppSheet schema unchanged.';patches['DB Logic'].append(i+1)
 plan={'data':data,'patches':patches,'baseline_sha256':digest(baseline)}
 (private/'dictionary-patches.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:len(v) for k,v in patches.items()}))
else:
 plan=json.loads((private/'dictionary-patches.json').read_text(encoding='utf8'));parts,paths,_=readbook(baseline);donor,dpaths,dstrings=readbook(private/'dictionary-donor.xlsx')
 previous=private/'dictionary-last-hash.txt';assert digest(dest) in {plan['baseline_sha256'],previous.read_text().strip() if previous.exists() else ''},'Concurrent dictionary change'
 changed=[]
 for name,numbers in plan['patches'].items():
  root=E.fromstring(parts[paths[name]]);rows=root.find(tag('sheetData'));existing={int(r.get('r')):r for r in rows};author={int(r.get('r')):r for r in E.fromstring(donor[dpaths[name]]).find(tag('sheetData'))}
  for number in numbers:
   old=existing.get(number);new=copy.deepcopy(author[number]);source=old if old is not None else existing[max(existing)]
   if name=='Metabase Models' and plan['data'][name][number-1][2]=='Model grain':source=next(r for n,r in existing.items() if plan['data'][name][n-1][2]=='Model grain')
   styles={''.join(filter(str.isalpha,c.get('r'))):c.get('s') for c in source}
   for cell in new:
    col=''.join(filter(str.isalpha,cell.get('r')));cell.attrib.pop('s',None)
    if styles.get(col):cell.set('s',styles[col])
    if cell.get('t')=='s':
     value=val(cell,dstrings)
     for child in list(cell):cell.remove(child)
     cell.set('t','inlineStr');E.SubElement(E.SubElement(cell,tag('is')),tag('t')).text=value
   if old is not None:rows.remove(old)
   rows.append(new)
  rows[:]=sorted(rows,key=lambda r:int(r.get('r')))
  dimension=root.find(tag('dimension'))
  if dimension is not None:dimension.set('ref',f'A1:{chr(64+len(plan["data"][name][0]))}{len(plan["data"][name])}')
  E.register_namespace('',S);E.register_namespace('r',R);parts[paths[name]]=E.tostring(root,encoding='utf-8',xml_declaration=True);changed.append(paths[name])
 with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
  for name,content in parts.items():z.writestr(name,content)
 with zipfile.ZipFile(baseline) as z:assert all(z.read(n)==v for n,v in parts.items() if n not in changed)
 previous.write_text(digest(dest));evidence={'edited_sheets':list(plan['patches']),'patch_rows':{k:len(v) for k,v in plan['patches'].items()},'all_other_parts_byte_preserved':True,'sha256':digest(dest)}
 (repo/'outputs/r016-20260922/cash-snapshot-dictionary.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence))
