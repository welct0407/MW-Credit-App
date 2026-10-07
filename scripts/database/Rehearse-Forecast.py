"""Rehearse additive V48 against the verified private PROD restore, never a live target."""
import json,os,socket,subprocess,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql
r=Path(__file__).resolve().parents[2];out=r/'outputs/r045-forecast-planning'
b=json.loads((out/'production-backup.json').read_text());folder=Path(b['backup_file']).parent;data=folder/'restore-data'
assert folder.is_relative_to(Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r045-forecast-planning')
assert hashlib.sha256(Path(b['backup_file']).read_bytes()).hexdigest()==b['backup_sha256']
bin=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
def run(cmd,log):
 with (folder/log).open('wb') as f:subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
run([str(bin/'pg_ctl.exe'),'-D',str(data),'-l',str(folder/'rehearsal.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'rehearsal-start.txt')
try:
 with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres') as c:
  assert Path(c.execute('show data_directory').fetchone()[0]).resolve()==data.resolve()
  c.execute("SET LOCAL timezone='UTC'")
  assert c.execute('select to_regclass(%s)',('public.reporting_forecast_loans_v1',)).fetchone()[0] is None
  c.execute((r/'database/migrations/V48__forecast_planning.sql').read_text(encoding='utf-8'))
  row=c.execute("select count(*),count(*) filter(where incomplete) from public.reporting_forecast_loans_v1").fetchone()
  issues=c.execute("select issue,count(*) from public.reporting_forecast_events_v1 where issue is not null group by 1 order by 1").fetchall()
  expected=json.loads((folder/'fingerprints.json').read_text());actual={}
  for key in expected:
   schema,table=key.split('.',1)
   q=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
   count,digest=c.execute(q).fetchone();actual[key]={'count':count,'digest':digest}
  assert actual==expected,'Source tables changed in candidate rehearsal'
  c.rollback()
  (out/'restore-rehearsal.json').write_text(json.dumps({'passed':True,'loan_count':row[0],'incomplete_count':row[1],'issues':issues,'all_source_table_fingerprints_unchanged':True,'candidate_rolled_back':True,'source_backup_sha256':b['backup_sha256']},indent=2)+'\n')
  print(json.dumps({'passed':True,'loan_count':row[0],'incomplete':row[1],'issues':issues}))
finally:run([str(bin/'pg_ctl.exe'),'-D',str(data),'-m','fast','-w','stop'],'rehearsal-stop.txt')
