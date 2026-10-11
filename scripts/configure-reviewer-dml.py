"""Operator-only credential/role setup. Never available to conversational Codex.

Run on the authorized workstation against the verified environment configuration.
The credential is created outside Git, retained on repeat runs, and installed on
Debian separately. No application schema, rows, triggers or migrations change.
"""
import argparse
import json
import secrets
from pathlib import Path
import psycopg
from psycopg import sql
from mw_integration_agent.conversation_dml import TABLES


def configure(conn, password):
    if conn.execute("SELECT 1 FROM pg_roles WHERE rolname='mw_reviewer_dml'").fetchone():
        raise RuntimeError('Role already exists: inspect before changing existing grants or credential')
    conn.execute(sql.SQL('CREATE ROLE mw_reviewer_dml LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD {}').format(sql.Literal(password)))
    conn.execute('ALTER ROLE mw_reviewer_dml SET default_transaction_read_only=on')
    conn.execute("ALTER ROLE mw_reviewer_dml SET statement_timeout='15s'")
    conn.execute('GRANT CONNECT ON DATABASE '+sql.Identifier(conn.info.dbname).as_string(conn)+' TO mw_reviewer_dml')
    conn.execute('GRANT USAGE ON SCHEMA public TO mw_reviewer_dml')
    # Explicit current resources only: no default privileges on future tables.
    conn.execute('GRANT SELECT ON ALL TABLES IN SCHEMA public TO mw_reviewer_dml')
    conn.execute(sql.SQL('GRANT INSERT, UPDATE ON {} TO mw_reviewer_dml').format(
        sql.SQL(',').join(sql.Identifier('public',t) for t in TABLES)))
    # Existing invoker-rights posting triggers insert allocations; source cash
    # synchronization may delete system entries, guarded by trigger depth.
    # Neither resource/action is exposed as a model mutation tool.
    conn.execute('GRANT INSERT, UPDATE ON public."Payment Allocations" TO mw_reviewer_dml')
    conn.execute('GRANT DELETE ON public."Cash Ledger" TO mw_reviewer_dml')
    # PostgreSQL FOR SHARE requires UPDATE on at least one column. Existing
    # cash_account_holder() locks both rows; labels confer no routing authority.
    conn.execute('GRANT UPDATE ("Account Label") ON public."Cash Accounts" TO mw_reviewer_dml')
    conn.execute('GRANT UPDATE ("Holder Name") ON public."Cash Holders" TO mw_reviewer_dml')
    # Fail closed if PUBLIC grants unexpectedly grant durable schema creation.
    row=conn.execute("SELECT has_schema_privilege('mw_reviewer_dml','public','CREATE'), has_database_privilege('mw_reviewer_dml',current_database(),'CREATE')").fetchone()
    if any(row): raise RuntimeError('Unexpected PUBLIC CREATE privileges; role setup rolled back')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--environments',required=True)
    parser.add_argument('--secret-file',required=True)
    args=parser.parse_args()
    target=json.loads(Path(args.environments).read_text())['production']
    if (target['instance'],target['host'],target['database'],target['user']) != (
        'appsheet-pg-prod-20260914','34.21.174.215','loan_manager_prod','postgres'):
        raise RuntimeError('Unexpected production identity')
    path=Path(args.secret_file).resolve()
    private=Path('C:/Users/ideaadmin/Documents/ChatGPT').resolve()
    path.relative_to(private)
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        with path.open('x',encoding='utf-8') as f:f.write('Aa1!'+secrets.token_hex(32)+'\n')
    password=path.read_text().strip()
    with psycopg.connect(host=target['host'],port=target['port'],dbname=target['database'],
            user=target['user'],password=Path(target['passwordFile']).read_text().strip(),
            sslmode='require',connect_timeout=15) as conn:
        configure(conn,password)
    print('Dedicated DML role configured; no application data/schema changes. Credential retained privately.')


if __name__=='__main__':main()
