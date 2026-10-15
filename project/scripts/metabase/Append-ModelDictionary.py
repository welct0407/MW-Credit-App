"""Append the Artifact Tool-authored sheet without reserializing existing worksheets."""
from pathlib import Path
from copy import deepcopy
import zipfile, xml.etree.ElementTree as E, shutil, json, hashlib
ROOT=Path(__file__).resolve().parents[2]
PRIVATE=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922')
dest=ROOT/'Documents/AppSheet_Data_Dictionary.xlsx'
backup=PRIVATE/'models-redesign-before/AppSheet_Data_Dictionary.xlsx'
evidence_path=ROOT/'outputs/r016-20260922/dictionary-verification.json'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if backup.exists():
 previous=json.loads(evidence_path.read_text()) if evidence_path.exists() else {}
 assert digest(dest) in {digest(backup),previous.get('saved_dictionary_sha256')}, 'Dictionary changed after this batch; preserve and reconcile before rebuilding'
if not backup.exists(): shutil.copy2(dest,backup)
S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P='http://schemas.openxmlformats.org/package/2006/relationships'
C='http://schemas.openxmlformats.org/package/2006/content-types'
tag=lambda name:'{'+S+'}'+name
with zipfile.ZipFile(backup) as z: base={n:z.read(n) for n in z.namelist()}
with zipfile.ZipFile(PRIVATE/'metabase-dictionary-sheet.xlsx') as z: donor={n:z.read(n) for n in z.namelist()}
workbook=E.fromstring(base['xl/workbook.xml']);sheets=workbook.find(tag('sheets'))
assert not any(s.get('name')=='Metabase Models' for s in sheets)
styles=E.fromstring(base['xl/styles.xml']);newstyles=E.fromstring(donor['xl/styles.xml'])
offsets={}
for name in ['fonts','fills','borders','cellStyleXfs','cellXfs']:
 old=styles.find(tag(name)); new=newstyles.find(tag(name));offsets[name]=len(old)
 for item in new:
  item=deepcopy(item)
  if name in ['cellStyleXfs','cellXfs']:
   for attr,section in [('fontId','fonts'),('fillId','fills'),('borderId','borders')]:
    if attr in item.attrib:item.set(attr,str(int(item.get(attr))+offsets[section]))
   if name=='cellXfs' and 'xfId' in item.attrib:item.set('xfId',str(int(item.get('xfId'))+offsets['cellStyleXfs']))
   assert int(item.get('numFmtId','0'))<164, 'Unexpected donor custom number format'
  old.append(item)
 old.set('count',str(len(old)))
newrel=E.fromstring(donor['xl/_rels/workbook.xml.rels'])
donorpath=next(r.get('Target') for r in newrel if r.get('Type').endswith('/worksheet'))
donorpath=donorpath.lstrip('/') if donorpath.startswith('/') else 'xl/'+donorpath
sheet=E.fromstring(donor[donorpath]);strings=[]
if 'xl/sharedStrings.xml' in donor:strings=list(E.fromstring(donor['xl/sharedStrings.xml']))
for cell in sheet.iter(tag('c')):
 if 's' in cell.attrib:cell.set('s',str(int(cell.get('s'))+offsets['cellXfs']))
 if cell.get('t')=='s':
  value=cell.find(tag('v'));si=deepcopy(strings[int(value.text)]);cell.remove(value);si.tag=tag('is');cell.set('t','inlineStr');cell.append(si)
rels=E.fromstring(base['xl/_rels/workbook.xml.rels'])
rid='rIdMetabaseModels'
assert all(r.get('Id')!=rid for r in rels)
sid=max(int(s.get('sheetId')) for s in sheets)+1; filename=f'xl/worksheets/sheet{sid}.xml'
assert filename not in base
E.SubElement(sheets,tag('sheet'),{'name':'Metabase Models','sheetId':str(sid),'{'+R+'}id':rid})
E.SubElement(rels,'{'+P+'}Relationship',{'Id':rid,'Type':R+'/worksheet','Target':'worksheets/sheet'+str(sid)+'.xml'})
types=E.fromstring(base['[Content_Types].xml'])
E.SubElement(types,'{'+C+'}Override',{'PartName':'/'+filename,'ContentType':'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'})
changed={'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':rels,'xl/styles.xml':styles,'[Content_Types].xml':types,filename:sheet}
for name,xml in changed.items():
 E.register_namespace('',xml.tag[1:].split('}')[0])
 E.register_namespace('r',R)
 base[name]=E.tostring(xml,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
 for name,data in base.items():z.writestr(name,data)
with zipfile.ZipFile(backup) as a,zipfile.ZipFile(dest) as b:
 preserved=[n for n in a.namelist() if n not in changed]
 assert all(a.read(n)==b.read(n) for n in preserved)
 assert len(list(sheet.iter(tag('row'))))>60
evidence={'original_parts_preserved':len(preserved),'original_sheets_preserved':len(sheets)-1,'added_sheet':'Metabase Models','rows':len(list(sheet.iter(tag('row')))),'all_original_worksheet_bytes_unchanged':True,'saved_dictionary_sha256':digest(dest)}
evidence_path.write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(evidence))
