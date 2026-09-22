"""Scoped operator setup for the owner-approved new Cloud SQL agent database.

No existing business schema/grants or instance settings are changed here.
Provisioning does not switch the Debian backend or enable DELETE.
"""
import argparse,json,secrets
from pathlib import Path
import psycopg
from psycopg import sql
from mw_integration_agent.state_migration import migrate

p=argparse.ArgumentParser();p.add_argument('--environments',required=True);p.add_argument('--private-directory',required=True)
p.add_argument('--output',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]
t=json.loads(Path(a.environments).read_text())['production']
if (t['host'],t['instance'],t['database'],t['user'])!=('34.21.174.215','appsheet-pg-prod-20260914','loan_manager_prod','postgres'):
    raise RuntimeError('Unexpected Cloud SQL identity')
private=Path(a.private_directory).resolve();private.relative_to(Path('C:/Users/MWCredit/Documents/ChatGPT').resolve())
private.mkdir(parents=True,exist_ok=True)
options=dict(host=t['host'],port=t['port'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15,autocommit=True)
names=['mw_agent_owner','mw_agent_worker','mw_agent_relay','mw_agent_auditor','mw_business_audit_owner']
with psycopg.connect(**options,dbname='postgres') as c:
    if c.execute('SELECT 1 FROM pg_roles WHERE rolname=ANY(%s)',(names,)).fetchone() or c.execute("SELECT 1 FROM pg_database WHERE datname='mw_agent'").fetchone():
        raise RuntimeError('Target already exists; inspect exact partial progress before continuing')
    c.execute("SET mw_design.execution_approved='agent-postgresql-20260922-v1'")
    text=(root/'database/setup/bootstrap.sql').read_text(encoding='utf-8')
    first,rest=text.split('\nCREATE DATABASE mw_agent',1)
    database,after=('CREATE DATABASE mw_agent'+rest).split(';',1)
    c.execute(first)
    c.execute(database)
    c.execute(after)
with psycopg.connect(**options,dbname='mw_agent') as c:
    result=migrate(c,root/'database/migrations')
    for role in ('worker','relay'):
        path=private/('mw_agent_'+role+'.password')
        if path.exists():raise RuntimeError('Credential already exists; preserve and inspect')
        password='Aa1!'+secrets.token_hex(32)
        with path.open('x',encoding='utf-8') as f:f.write(password+'\n')
        c.execute(sql.SQL('ALTER ROLE {} LOGIN PASSWORD {}').format(sql.Identifier('mw_agent_'+role),sql.Literal(password)))
    checks=c.execute("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles WHERE rolname=ANY(%s) ORDER BY rolname",(names,)).fetchall()
    count=c.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('audit','runtime','migration') AND c.relkind='r'").fetchone()[0]
result.update(database='mw_agent',instance=t['instance'],role_flags=checks,table_count=count,backend_activated=False,business_database_changed=False)
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'database':'mw_agent','table_count':count,'versions':result['versions'],'backend_activated':False}))
