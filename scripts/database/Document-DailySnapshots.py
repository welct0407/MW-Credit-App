"""Prepare exact dictionary patches from the verified schema; apply Artifact-authored cells surgically."""
import argparse, copy, hashlib, json, os, shutil, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as E
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
p=argparse.ArgumentParser();p.add_argument('operation',choices=['prepare','apply']);p.add_argument('--environment',default='development',choices=['development','production']);a=p.parse_args()
repo=Path(__file__).resolve().parents[2];private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/daily-snapshots')
dest=repo/'Documents/AppSheet_Data_Dictionary.xlsx';baseline=private/'dictionary-before.xlsx'
S='http://schemas.openxmlformats.org/spreadsheetml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';ns={'s':S};tag=lambda n:'{'+S+'}'+n
def readbook(path):
 with zipfile.ZipFile(path) as z:parts={n:z.read(n) for n in z.namelist()}
 strings=[''.join(x.itertext()) for x in E.fromstring(parts['xl/sharedStrings.xml'])] if 'xl/sharedStrings.xml' in parts else []
 rels={x.get('Id'):x.get('Target') for x in E.fromstring(parts['xl/_rels/workbook.xml.rels'])}
 paths={}
 for sheet in E.fromstring(parts['xl/workbook.xml']).find(tag('sheets')):
  path=rels[sheet.get('{'+R+'}id')];paths[sheet.get('name')]=path.lstrip('/') if path.startswith('/') else 'xl/'+path
 return parts,paths,strings
def val(c,strings):
 v=c.find(tag('v'));t=c.get('t')
 return strings[int(v.text)] if t=='s' else ''.join(c.find(tag('is')).itertext()) if t=='inlineStr' else v.text if v is not None else ''
if a.operation=='prepare':
 if not baseline.exists():shutil.copy2(dest,baseline)
 parts,paths,strings=readbook(baseline);data={};patches={}
 for name,width in [('DB Columns',6),('DB Constraints',5),('DB Logic',5)]:
  rows=E.fromstring(parts[paths[name]]).find(tag('sheetData'));values=[]
  for row in rows:
   cells={''.join(filter(str.isalpha,c.get('r'))):val(c,strings) for c in row}
   values.append([cells.get(chr(65+i),'') for i in range(width)])
  data[name]=values;patches[name]=[]
 target=json.loads((repo/'database/environments.json').read_text())[a.environment]
 assert target['database']==('loan_manager_dev' if a.environment=='development' else 'loan_manager_prod')
 label='DEV V37; PROD pending' if a.environment=='development' else 'DEV/PROD V37'
 with psycopg.connect(host=target['host'],dbname=target['database'],user=target['user'],password=Path(target['passwordFile']).read_text().strip(),sslmode='require') as c:
  c.execute('SET TRANSACTION READ ONLY')
  columns=c.execute("SELECT table_name,column_name,ordinal_position,data_type,is_nullable,coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('Cash Account Daily Analytics','reporting_daily_snapshot','reporting_cash_account_snapshot') OR (table_name='Daily Analytics' AND ordinal_position>=20)) ORDER BY table_name,ordinal_position").fetchall()
  constraints=c.execute("SELECT 'Cash Account Daily Analytics',conname,contype,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.\"Cash Account Daily Analytics\"'::regclass ORDER BY conname").fetchall()
 for name,rows in [('DB Columns',columns),('DB Constraints',constraints)]:
  for row in rows:data[name].append(list(row));patches[name].append(len(data[name]))
 for i,row in enumerate(data['DB Columns']):
  if row[0]=='DEV Daily Analytics' and row[1] in ['Business Expenses','Net Profit','Net Unsettled Profit EOD']:
   row[0]='Daily Analytics';patches['DB Columns'].append(i+1)
 desc='Model 3 atomic portfolio/account date-range upsert; same advisory lock; partial charge residuals; raw-source opening seed; hourly Recent=yesterday/today, Full/history through today. V37__unified_daily_cash_snapshots.sql.'
 for i,row in enumerate(data['DB Logic']):
  if row[2] in ['refresh_daily_analytics(date,date)','refresh_daily_analytics']:
   row[:]=['Production and development function' if a.environment=='production' else 'Development function','public',row[2],label,desc];patches['DB Logic'].append(i+1)
 additions=[
 ['Function','public','analytics_history_start()',label,'Earliest dated loans, repayments, charges, expenses, contributions, completed settlements, ledger, cash cutover or existing snapshot; excludes future dates.'],
 ['Function','public','analytics_refresh_request()',label,'Existing Statistics command contract preserved. Recent refreshes exactly yesterday/today; Full invokes unified engine from analytics_history_start(). No new scheduler.'],
 ['Table','public','Cash Account Daily Analytics',label,'Account/date snapshots; unique date/account and immutable Row ID on refresh. Account FK; zero-activity dates; unknown/pre-opening balances NULL. SQL-only; not loaded into AppSheet.'],
 ['View','public','reporting_daily_snapshot',label,'Thin stored portfolio snapshots, Provisional flag and Hourly snapshot freshness label. SELECT-only reporting grant. Existing Metabase models unchanged.'],
 ['View','public','reporting_cash_account_snapshot',label,'Thin stored account snapshots plus current labels/immutable holder, net movement and positive/negative balance parts. SELECT-only reporting grant.'],
 ['Metric','Daily Analytics','Pending Charges EOD',label,'Sum per charge max(principal due + interest due - posted principal/interest through date,0). Replaces first-payment exclusion; fully/partially paid balances reconstructed.'],
 ['Metric','Daily Analytics','Available Cash EOD',label,'Remaining contributed lending capital, not cash custody. Existing name retained for app/report compatibility.'],
 ['Availability','public','R016 snapshot extension',label,'13 added Daily Analytics SQL columns; new account table and two reporting views. Existing AppSheet schema/slices and all Metabase model/question definitions unchanged; report integration held for part 2.'],
 ['Semantics','Daily Analytics','Partner A/B Net Profit and Settlements',label,'Daily governed rounded partner net allocations and actual completed dated settlements. These are inputs to selected-period FIFO; no stored retained-profit, advances or selected-period allocation fields.'],
 ['Semantics','Daily Analytics','Cash Money In / Out and Cash Balance EOD',label,'Cash Ledger account effects; internal transfers cancel at portfolio grain. Signed balances include negatives. Complete cash requires known openings for every account; same current account population as V36.']]
 for row in additions:data['DB Logic'].append(row);patches['DB Logic'].append(len(data['DB Logic']))
 (private/'dictionary-patches.json').write_text(json.dumps({'data':data,'patches':patches,'baseline_sha256':hashlib.sha256(baseline.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'patch_rows':{k:len(v) for k,v in patches.items()},'state':label}))
else:
 plan=json.loads((private/'dictionary-patches.json').read_text(encoding='utf-8'))
 parts,paths,_=readbook(baseline);donor,dpaths,dstrings=readbook(private/'dictionary-donor.xlsx')
 previous=private/'dictionary-last-hash.txt'
 assert hashlib.sha256(dest.read_bytes()).hexdigest() in {plan['baseline_sha256'],previous.read_text().strip() if previous.exists() else ''},'Concurrent dictionary edits detected'
 changed=[]
 for name,numbers in plan['patches'].items():
  root=E.fromstring(parts[paths[name]]);rows=root.find(tag('sheetData'));existing={int(r.get('r')):r for r in rows}
  author={int(r.get('r')):r for r in E.fromstring(donor[dpaths[name]]).find(tag('sheetData'))}
  template=existing[max(existing)]
  for number in numbers:
   old=existing.get(number);new=copy.deepcopy(author[number])
   style_source=old if old is not None else template
   styles={''.join(filter(str.isalpha,c.get('r'))):c.get('s') for c in style_source}
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
  E.register_namespace('',S);E.register_namespace('r',R)
  parts[paths[name]]=E.tostring(root,encoding='utf-8',xml_declaration=True);changed.append(paths[name])
 with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
  for name,content in parts.items():z.writestr(name,content)
 with zipfile.ZipFile(baseline) as z:
  assert all(z.read(n)==v for n,v in parts.items() if n not in changed)
 digest=hashlib.sha256(dest.read_bytes()).hexdigest();previous.write_text(digest)
 evidence={'edited_sheets':list(plan['patches']),'patch_rows':{k:len(v) for k,v in plan['patches'].items()},'all_other_parts_byte_preserved':True,'sha256':digest}
 (repo/'outputs/r016-20260922/daily-snapshots/dictionary.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print(json.dumps(evidence))
