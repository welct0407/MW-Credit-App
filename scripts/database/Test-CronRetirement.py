"""Test the exact V40 job guard with session-local synthetic rows in DEV."""
import json,os,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
repo=Path(__file__).resolve().parents[2]
target=json.loads((repo/'database/environments.json').read_text())['development']
assert (target['instance'],target['host'],target['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
source=(repo/'database/migrations/V40__retire_unused_pg_cron.sql').read_text()
query=re.search(r'EXECUTE \$check\$(.*?)\$check\$ INTO',source,re.S).group(1).replace('cron.job','pg_temp.cron_fixture')
fields=['jobid','jobname','schedule','command','nodename','nodeport','database','username','active']
base=[1,'loan-daily-charges','5 0 * * *',"SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date);",'localhost',5432,'loan_manager_dev','postgres',False]
with psycopg.connect(host=target['host'],port=target['port'],dbname=target['database'],user=target['user'],password=Path(target['passwordFile']).read_text().strip(),sslmode='require') as c:
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('loan_manager_dev','34.21.174.215')
    c.execute('CREATE TEMP TABLE cron_fixture(jobid bigint,jobname text,schedule text,command text,nodename text,nodeport integer,database text,username text,active boolean) ON COMMIT DROP')
    results={'empty_inventory':c.execute(query).fetchone()[0]==0}
    c.execute('INSERT INTO cron_fixture VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',base)
    results['known_disabled_job']=c.execute(query).fetchone()[0]==0
    for field,value in [('active',True),('jobid',2),('jobname','other'),('database','other'),('schedule','* * * * *'),('command','SELECT 1;'),('username','other'),('nodename','other'),('nodeport',5433)]:
        c.execute('TRUNCATE pg_temp.cron_fixture')
        row=base.copy();row[fields.index(field)]=value
        c.execute('INSERT INTO cron_fixture VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',row)
        results['reject_'+field]=c.execute(query).fetchone()[0]==1
    c.rollback()
assert all(results.values()),results
out=repo/'outputs/r026-dictionary-fixes/cron-guard-tests.json'
out.write_text(json.dumps({'checks':results,'passed':len(results),'scope':'Exact V40 predicate, session-local synthetic DEV rows, transaction rolled back; no cron or business objects changed.'},indent=2)+'\n')
print(json.dumps({'passed':len(results)}))
