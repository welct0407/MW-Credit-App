"""One-time R030 role prerequisite. No schema or financial writes; credentials private."""
# Retired with VM-01's direct route (DB-ACCESS-07, 17 October 2026): it connects to the public address with
# sslmode=require and asserts inet_server_addr(), so it cannot run through an Auth Proxy. Do not replay it.
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[2]))
from database_location import DATABASE_REPO_ROOT
import hashlib, json, os, secrets, sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql

repo=Path(__file__).resolve().parents[3]
private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r030-custom-matrix')
out=repo/'outputs/r030-custom-matrix'
backup=json.loads((out/'production-backup.json').read_text())
assert backup['restore_fingerprints_match'] and hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest()==backup['backup_sha256']
target=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())['production']
assert (target['instance'],target['host'],target['database'])==('mw-credit-pg-20261017','136.85.127.134','loan_manager_prod')
credential=private/'service-config.json'
if credential.exists(): raise RuntimeError('Private configuration already exists; inspect state before retry')
password=secrets.token_urlsafe(32); key=secrets.token_urlsafe(32)
config={'secret_sha256':hashlib.sha256(key.encode()).hexdigest(),'database':{'host':'127.0.0.1','port':5432,'dbname':'loan_manager_prod','user':'mw_chart_reader','password':password,'sslmode':'disable'}}
# Preserve generated recovery material before mutation; never print it.
credential.write_text(json.dumps(config,indent=2))
(private/'chart-key.txt').write_text(key)
with psycopg.connect(host=target['host'],port=5432,dbname=target['database'],user=target['user'],password=Path(target['passwordFile']).read_text().strip(),sslmode='require') as c:
    assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==('loan_manager_prod','136.85.127.134')
    assert not c.execute("select 1 from pg_roles where rolname='mw_chart_reader'").fetchone()
    c.execute(sql.SQL('CREATE ROLE mw_chart_reader LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2').format(sql.Literal(password)))
    c.execute('GRANT CONNECT ON DATABASE loan_manager_prod TO mw_chart_reader')
    c.execute('GRANT USAGE ON SCHEMA public TO mw_chart_reader')
    c.execute('GRANT SELECT ON public.reporting_borrower_matrix_plot_v1 TO mw_chart_reader')
    c.execute('GRANT SELECT ("Row ID", "Description") ON public.olap_borrowers_analytics TO mw_chart_reader')
    c.execute("ALTER ROLE mw_chart_reader IN DATABASE loan_manager_prod SET default_transaction_read_only=on")
    c.execute("ALTER ROLE mw_chart_reader IN DATABASE loan_manager_prod SET statement_timeout='12s'")
    c.execute("ALTER ROLE mw_chart_reader IN DATABASE loan_manager_prod SET idle_in_transaction_session_timeout='15s'")
with psycopg.connect(host=target['host'],port=5432,dbname=target['database'],user='mw_chart_reader',password=password,sslmode='require') as c:
    assert c.execute('show transaction_read_only').fetchone()[0]=='on'
    rows=c.execute((Path(__file__).parent/'query.sql').read_text()).fetchall()
    assert len(rows)>0
    no_writes=c.execute("select count(*) from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relkind in ('r','p','v') and has_table_privilege(current_user,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE')").fetchone()[0]==0
    assert no_writes
    result={'role':'mw_chart_reader','database':'loan_manager_prod','rows':len(rows),'read_only_default':True,'no_public_relation_dml':True,'grants':['SELECT reporting_borrower_matrix_plot_v1','SELECT (Row ID, Description) olap_borrowers_analytics'],'schema_changed':False,'financial_writes':False,'flyway_version':43}
(out/'database-access.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
