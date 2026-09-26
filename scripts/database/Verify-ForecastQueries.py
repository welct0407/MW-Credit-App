"""Run generated report SQL against a verified target without publishing result values."""
import json,re,os,sys,time,argparse
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
r=Path(__file__).resolve().parents[2];out=r/'outputs/r045-forecast-planning';priv=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r045-forecast-planning'
p=argparse.ArgumentParser();p.add_argument('--environment',choices=['development','production'],default='development');args=p.parse_args()
t=json.loads((r/'database/environments.json').read_text())[args.environment];expected='loan_manager_dev' if args.environment=='development' else 'loan_manager_prod'
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215',expected)
specs=json.loads((out/'plan.json').read_text())['specs'];checks=[]
cases=[{},dict(ci=80,cp=75,rr=25,scenario='Planning',target=100000),dict(ci=60,cp=50,rr=0,scenario='Stress',kind='Daily Interest',lending=0,expenses=0,withdrawals=0,inflows=0,reserve=0)]
def compile(q,params):
 def block(m):
  names=re.findall(r'\{\{(\w+)\}\}',m[1])
  if not all(k in params for k in names):return ''
  return re.sub(r'\{\{(\w+)\}\}',lambda n:"'"+str(params[n[1]]).replace("'","''")+"'" if isinstance(params[n[1]],str) else str(params[n[1]]),m[1])
 return re.sub(r'\[\[(.*?)\]\]',block,q,flags=re.S)
with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',options='-c default_transaction_read_only=on') as c:
 assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==(expected,t['host'])
 for s in specs:
  for idx,params in enumerate(cases):
   start=time.perf_counter();q=compile(s['dataset_query']['native']['query'],params)
   try:rows=c.execute(q).fetchall()
   except Exception as error:
    (priv/'sql-error.txt').write_text(str(error)+'\n'+q,encoding='utf-8');print('Failed '+s['key']+' case '+str(idx)+': '+str(error).split('\n')[0]);raise SystemExit(1)
   checks.append({'key':s['key'],'case':idx,'rows':len(rows),'ms':round(1000*(time.perf_counter()-start),1)})
 (out/(args.environment+'-queries.json')).write_text(json.dumps({'passed':True,'database':expected,'checks':checks},indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'maximum_ms':max(x['ms'] for x in checks)}))
