"""Explicit environment setup for the fixed receipt projection function; no business rows."""
import argparse
import json
import secrets
from pathlib import Path
import psycopg
from psycopg import sql

p=argparse.ArgumentParser();p.add_argument('--environment',choices=['development','production'],required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2]
target=json.loads((root/'database/environments.json').read_text())[a.environment]
assert target['host']=='34.21.174.215' and target['instance']=='appsheet-pg-prod-20260914'
assert target['database']=={'development':'loan_manager_dev','production':'loan_manager_prod'}[a.environment]
private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/receipt-storage')
private.mkdir(parents=True,exist_ok=True)
key=private/'receipt-projector-password.txt'
with psycopg.connect(host=target['host'],port=5432,dbname=target['database'],user='postgres',sslmode='require',
    password=Path(target['passwordFile']).read_text().strip(),connect_timeout=10) as c:
    assert c.execute("SELECT to_regprocedure('public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)') IS NOT NULL").fetchone()[0]
    exists=c.execute("SELECT 1 FROM pg_roles WHERE rolname='mw_receipt_projector'").fetchone()
    if exists:
        if not key.exists():raise RuntimeError('Existing projector credential missing; recover it, do not rotate implicitly')
    else:
        if not key.exists():key.write_text(secrets.token_urlsafe(36),encoding='utf-8')
        c.execute(sql.SQL('CREATE ROLE mw_receipt_projector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD {}').format(sql.Literal(key.read_text().strip())))
    c.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO mw_receipt_projector').format(sql.Identifier(target['database'])))
    c.execute('GRANT USAGE ON SCHEMA public TO mw_receipt_projector')
    c.execute('GRANT EXECUTE ON FUNCTION public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text) TO mw_receipt_projector')
with psycopg.connect(host=target['host'],port=5432,dbname=target['database'],user='mw_receipt_projector',sslmode='require',password=key.read_text().strip(),connect_timeout=10) as c:
    result=c.execute("SELECT current_database(),session_user,has_table_privilege(current_user,'public.\"Payments\"','UPDATE'),has_function_privilege(current_user,'public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)','EXECUTE')").fetchone()
    assert result[2] is False and result[3] is True
print(json.dumps({'database':result[0],'role':result[1],'direct_update':result[2],'execute':result[3],'credential_file':str(key)}))
