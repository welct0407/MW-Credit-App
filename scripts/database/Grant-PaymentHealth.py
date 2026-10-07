"""Scoped R027 SELECT grants for the existing production Metabase reader."""
import hashlib,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql
repo=Path(__file__).resolve().parents[2];out=repo/'outputs/r027-payment-health'
assert not (out/'production-grants.json').exists(),'Inspect existing grant evidence instead of replaying'
backup=json.loads((out/'production-backup.json').read_text())
assert backup['restore_fingerprints_match'] and hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest()==backup['backup_sha256']
t=json.loads((repo/'database/environments.json').read_text())['production']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_prod')
views=['reporting_charge_payment_health_v1','reporting_borrower_payment_health_v1','reporting_borrower_matrix_v2']
with psycopg.connect(host=t['host'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
 assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
 assert c.execute('select max(version::int) from flyway_schema_history where success').fetchone()[0]==41
 assert c.execute("select rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole from pg_roles where rolname='metabase_borrower_reader'").fetchone()==(True,)
 before={v:c.execute("select has_table_privilege('metabase_borrower_reader',%s,'SELECT')",('public.'+v,)).fetchone()[0] for v in views}
 for v in views:c.execute(sql.SQL('GRANT SELECT ON public.{} TO metabase_borrower_reader').format(sql.Identifier(v)))
 checks={v:c.execute("select has_table_privilege('metabase_borrower_reader',%s,'SELECT') and not has_table_privilege('metabase_borrower_reader',%s,'INSERT,UPDATE,DELETE,TRUNCATE')",('public.'+v,'public.'+v)).fetchone()[0] for v in views}
 assert all(checks.values());at=c.execute('select statement_timestamp()').fetchone()[0]
(out/'production-grants.json').write_text(json.dumps({'at':str(at),'database':t['database'],'role':'metabase_borrower_reader','before':before,'select_only':checks,'scope':'Three named reporting views only; no future-table or adapter grants'},indent=2)+'\n')
print('Three named reporting views verified SELECT-only')
